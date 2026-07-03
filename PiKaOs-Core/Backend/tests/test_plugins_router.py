"""routers/plugins.py — GET /api/plugins response shape.

Regression coverage for a bug the bootstrap-session-token work surfaced (2026-07-02): this endpoint
had never been reachable in kernel-only mode before (always 401, no auth plugin), so a pre-existing
mismatch between `Manifest.permissions` (a tuple of `{key, group, name_th, name_en}` dicts) and
`PluginOut.permissions` (declared `list[str]`) went uncaught — `_view()` passed the dicts straight
through, and FastAPI's response-model validation 500'd on the first plugin with a declared permission.

    docker compose exec backend pytest tests/test_plugins_router.py
"""
from __future__ import annotations

import shutil

from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.routers.plugins import _view


def test_view_serializes_permission_objects_down_to_key_strings(sample_plugins):
    out = _view(reg={}, active=set())
    sample = next(p for p in out if p.id == "sample")
    assert sample.permissions == ["sample.manage"]   # not the raw {key, group, ...} dicts


def test_plugins_endpoint_returns_200_with_a_bootstrap_token(sample_plugins, tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200
    body = resp.json()
    sample = next(p for p in body if p["id"] == "sample")
    assert sample["permissions"] == ["sample.manage"]


# --- install-from-git ---------------------------------------------------------------------------------

def test_install_from_git_clones_validates_and_registers(sample_plugins, tmp_path, monkeypatch):
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    subprocess.run(["git", "tag", "v1.0.0"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url, "ref": "v1.0.0"},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    crm = next(p for p in body["plugins"] if p["id"] == "crm")
    assert crm["state"] == "enabled"
    assert (plugins_dir / "crm" / "manifest.json").is_file()


def test_install_from_git_rolls_back_when_registry_persistence_fails(sample_plugins, tmp_path, monkeypatch):
    """`register_discovered` + `registry.set_git_install` run after the last cleanup boundary — if either
    raises (e.g. a kernel-state I/O failure persisting the registry), the endpoint must not leave a
    half-installed plugin behind: neither the on-disk folder nor the in-process registration may survive.
    Simulates `set_git_install` raising (after `register_discovered` has already succeeded) and asserts
    both are rolled back."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    def _boom(*a, **k):
        raise OSError("simulated kernel_state.write_json I/O failure")
    monkeypatch.setattr(plugin_registry, "set_git_install", _boom)

    import app.main as main
    from app import plugin_loader
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 500
    assert not (plugins_dir / "crm").exists()          # on-disk folder rolled back
    assert "crm" not in plugin_loader.PLUGIN_MANIFESTS  # in-process registration rolled back too


def test_install_from_git_rejects_disallowed_host(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": "https://not-allowed.example/x.git"},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422


def test_install_from_git_rejects_missing_manifest(sample_plugins, tmp_path, monkeypatch):
    """A repo with no manifest.json at its root is rejected — and the staging dir is discarded, not
    left behind (never a half-installed plugin)."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "README.md").write_text("no manifest here", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert list(plugins_dir.iterdir()) == []   # nothing left on disk


def test_install_from_git_rejects_duplicate_plugin(sample_plugins, tmp_path, monkeypatch):
    """Cloning a manifest whose id collides with an already-discovered plugin is rejected (409) —
    no double-install."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"sample","name":"Sample","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    (plugins_dir / "sample").mkdir(parents=True)   # already-installed folder
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 409


def test_install_from_git_rejects_path_traversal_id(sample_plugins, tmp_path, monkeypatch):
    """A manifest.json whose 'id' isn't a valid plugin-id shape (e.g. contains '..' / '/') must never
    reach the filesystem move — `target_dir = PLUGINS_DIR / pid` would otherwise let the clone land
    outside PLUGINS_DIR entirely.

    Why this test is shaped the way it is (revert-detection): a naive version of this test — just
    asserting a 422 and an empty PLUGINS_DIR — would pass IDENTICALLY even if the router-level `_ID_RE`
    check below were deleted. That's because `plugin_loader._validate()` independently re-checks the same
    id shape, but only AFTER `shutil.move` has already placed the folder — and the existing except-block
    cleanup then removes it from wherever it actually landed, producing the same observable 422 +
    empty-directory outcome either way. So instead we monkeypatch `shutil.move` itself (the call the
    endpoint uses to place the clone into PLUGINS_DIR) to blow up if it is EVER invoked with the
    traversal-shaped destination. That directly proves the early check runs BEFORE any filesystem call —
    if someone deletes it, `shutil.move` would be reached with the bad path and the guard below would
    raise, failing this test loudly (as an unhandled exception, not a clean 422) instead of silently
    passing.
    """
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    from app.core.routers import plugins as plugins_router
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"../../escaped","name":"Evil","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    real_move = shutil.move

    def _guarded_move(src_path, dst_path, *a, **k):
        if ".." in str(dst_path):
            raise AssertionError("shutil.move must not be called with an unvalidated (traversal-shaped) id")
        return real_move(src_path, dst_path, *a, **k)

    # patched on the router's `shutil` reference (same module object the endpoint calls through)
    monkeypatch.setattr(plugins_router.shutil, "move", _guarded_move)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert list(plugins_dir.iterdir()) == []          # nothing landed inside PLUGINS_DIR
    assert not (tmp_path / "escaped").exists()         # and nothing escaped it either


def test_install_from_git_rejects_failed_readiness(sample_plugins, tmp_path, monkeypatch):
    """A readiness-gate failure (e.g. an unresolvable dependency) is rejected — and the on-disk
    folder is removed, not left half-installed."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"1.0.0","coreVersion":"*",'
        '"dependencies":["nope-not-a-real-plugin"]}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert not (plugins_dir / "crm").exists()   # rolled back, not half-installed


def test_install_from_git_rejects_invalid_manifest(sample_plugins, tmp_path, monkeypatch):
    """A manifest missing a required field (e.g. no 'name') is rejected by plugin_loader._validate,
    routed through the same generic-error path — and cleaned up."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"crm","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")  # no 'name'
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert not (plugins_dir / "crm").exists()


def test_install_from_git_rejects_missing_id(sample_plugins, tmp_path, monkeypatch):
    """A manifest.json with no 'id' field is rejected (422) before any move to PLUGINS_DIR happens."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")

    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"name":"CRM","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")  # no 'id'
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                            json={"repoUrl": repo_url},
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert list(plugins_dir.iterdir()) == []


def test_install_from_git_requires_plugins_manage_permission(sample_plugins, tmp_path, monkeypatch):
    """No/invalid session token → 401, matching the other mutation routes' auth gate."""
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git", json={"repoUrl": "https://github.com/acme/crm.git"})
    assert resp.status_code == 401


# --- readiness gate on the existing /install path ------------------------------------------------------

def test_existing_install_endpoint_also_runs_the_readiness_gate(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state, plugin_readiness
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    monkeypatch.setattr(plugin_readiness, "check",
                         lambda *a, **k: plugin_readiness.ReadinessResult(passed=False, reasons=("nope",)))
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/install",
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422


def test_existing_install_endpoint_still_succeeds_when_readiness_passes(sample_plugins, tmp_path, monkeypatch):
    """Regression guard for the readiness-gate addition: a normal install (no readiness failures)
    must still succeed exactly as before."""
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/install",
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    sample = next(p for p in body["plugins"] if p["id"] == "sample")
    assert sample["state"] == "enabled"


# --- check-update / update (git-installed plugins) ------------------------------------------------------

def _git(cwd, *args):
    import subprocess
    subprocess.run(["git", *args], cwd=cwd, check=True)


def _install_crm_via_git(client, tmp_path, monkeypatch, headers, *, version="1.0.0", tag="v1.0.0"):
    """Real git repo, cloned in through the actual install-from-git endpoint — so the resulting plugin
    directory is a genuine git working copy with an `origin` remote, exactly what `fetch_and_checkout`
    needs for the update tests below (mirrors Task 5/7's local-file-remote pattern; not a mock)."""
    import subprocess
    from app.core import git_installer

    src = tmp_path / "src"
    src.mkdir()
    _git(src, "init", "-q")
    _git(src, "config", "user.email", "t@t.co")
    _git(src, "config", "user.name", "t")
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"%s","coreVersion":"*"}' % version,
        encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    _git(src, "commit", "-q", "-m", "init")
    _git(src, "tag", tag)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    resp = client.post("/api/plugins/install-from-git", json={"repoUrl": repo_url, "ref": tag},
                        headers=headers)
    assert resp.status_code == 200, resp.text
    return src, repo_url


def test_check_update_reports_a_newer_tag(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                              tag="v1.2.3", version="1.2.3")
    monkeypatch.setattr(git_installer, "latest_tag", lambda url: "v1.3.0")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"latestVersion": "v1.3.0", "hasUpdate": True}


def test_check_update_reports_no_update_when_already_current(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                              tag="v1.2.3", version="1.2.3")
    monkeypatch.setattr(git_installer, "latest_tag", lambda url: "v1.2.3")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"latestVersion": "v1.2.3", "hasUpdate": False}


def test_check_update_404s_for_a_non_git_installed_plugin(sample_plugins, tmp_path, monkeypatch):
    """`sample` is discovered but never installed via git (default provenance is `symlink`) — there's
    nothing to check against, so this must 404, not fall through to a confusing error."""
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 404


def test_check_update_404s_for_an_unknown_plugin(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/does-not-exist/check-update",
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 404


def test_update_404s_for_a_non_git_installed_plugin(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/update",
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 404


def test_update_requires_plugins_manage_permission(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/update")
    assert resp.status_code == 401


def test_update_fetches_new_tag_revalidates_and_updates_registry(sample_plugins, tmp_path, monkeypatch):
    """End-to-end update against a real local git remote (Task 5/7's pattern — a `file://` repo, not a
    mock): a second, higher-semver tag is pushed after the initial install, and `update()` must fetch +
    check it out, re-validate the manifest + readiness, and persist the new tag/version to the registry."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        src, repo_url = _install_crm_via_git(client, tmp_path, monkeypatch, headers)

        (src / "manifest.json").write_text(
            '{"id":"crm","name":"CRM","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "bump")
        _git(src, "tag", "v1.1.0")

        check_resp = client.get("/api/plugins/crm/check-update", headers=headers)
        assert check_resp.status_code == 200, check_resp.text
        assert check_resp.json() == {"latestVersion": "v1.1.0", "hasUpdate": True}

        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    crm = next(p for p in body["plugins"] if p["id"] == "crm")
    assert crm["version"] == "1.1.0"
    assert (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8").find('"1.1.0"') != -1

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.1.0"
    assert reg["crm"]["version"] == "1.1.0"


def test_update_returns_422_when_the_remote_has_no_tags(sample_plugins, tmp_path, monkeypatch):
    """`latest_tag` returns `None` when the remote has no (semver) tags at all — nothing to update to.
    (Re-running update while already on the latest tag is a separate, harmless no-op case: `latest_tag`
    still returns that same tag, so `update()` just re-checks-out and re-validates it — see the
    check-update test for the "no newer tag" comparison.)"""
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        _install_crm_via_git(client, tmp_path, monkeypatch, headers)
        monkeypatch.setattr(git_installer, "latest_tag", lambda url: None)
        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 422


def test_update_reverts_the_checkout_when_the_new_tags_manifest_fails_readiness(sample_plugins, tmp_path, monkeypatch):
    """The new tag's manifest declares an unresolvable dependency — readiness must fail, and the
    on-disk checkout must be reverted back to the previously-installed (known-good) tag rather than
    left sitting on the bad new one. A restart after this must still see the OLD, valid manifest —
    never the broken one (§3: a malformed/failing manifest on disk is a hard boot failure)."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        src, repo_url = _install_crm_via_git(client, tmp_path, monkeypatch, headers)

        (src / "manifest.json").write_text(
            '{"id":"crm","name":"CRM","version":"1.1.0","coreVersion":"*",'
            '"dependencies":["nope-not-a-real-plugin"]}', encoding="utf-8")
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "bad bump")
        _git(src, "tag", "v1.1.0")

        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 422

    on_disk = (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8")
    assert '"1.1.0"' not in on_disk       # reverted, not left on the bad tag
    assert '"1.0.0"' in on_disk

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.0.0"
    assert reg["crm"]["version"] == "1.0.0"


def test_update_reverts_the_checkout_when_the_new_tags_manifest_is_invalid(sample_plugins, tmp_path, monkeypatch):
    """The new tag's manifest.json is missing a required field — rejected by `plugin_loader._validate`,
    and the checkout is reverted the same as a failed-readiness update (never left on a broken tag)."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        src, repo_url = _install_crm_via_git(client, tmp_path, monkeypatch, headers)

        (src / "manifest.json").write_text(
            '{"id":"crm","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")  # no 'name'
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "invalid bump")
        _git(src, "tag", "v1.1.0")

        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 422

    on_disk = (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8")
    assert '"1.0.0"' in on_disk

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.0.0"


def test_update_rolls_back_manifest_and_checkout_when_registry_persistence_fails(sample_plugins, tmp_path, monkeypatch):
    """Mirrors `test_install_from_git_rolls_back_when_registry_persistence_fails` (Finding 1): the new
    tag's manifest is valid and passes readiness, so `fetch_and_checkout` + `register_discovered` both
    succeed for the NEW manifest — then `registry.set_git_install` raises (simulating a kernel-state I/O
    failure persisting the registry). Unlike install-from-git there's a known-good prior version here, so
    the finalize-failure branch must restore BOTH the in-process manifest (back to the OLD one) and the
    on-disk checkout (back to the OLD tag) rather than tearing the plugin down — never leave the process
    believing it's on the new version while disk/registry disagree (§3: a restart must still boot)."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    from app import plugin_loader
    with TestClient(main.app) as client:
        src, repo_url = _install_crm_via_git(client, tmp_path, monkeypatch, headers)

        (src / "manifest.json").write_text(
            '{"id":"crm","name":"CRM","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "bump")
        _git(src, "tag", "v1.1.0")

        def _boom(*a, **k):
            raise OSError("simulated kernel_state.write_json I/O failure")
        monkeypatch.setattr(registry, "set_git_install", _boom)

        resp = client.post("/api/plugins/crm/update", headers=headers)

    assert resp.status_code == 500                     # clean error, not a leaked 500 with internals
    assert "traceback" not in resp.text.lower()
    assert repo_url not in resp.text and str(plugins_dir) not in resp.text

    on_disk = (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8")
    assert '"1.1.0"' not in on_disk                     # on-disk code reverted off the new tag
    assert '"1.0.0"' in on_disk                         # ...and back onto the old, known-good one

    assert plugin_loader.PLUGIN_MANIFESTS["crm"].version == "1.0.0"   # in-process manifest restored

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.0.0"       # registry never advanced past the old tag
    assert reg["crm"]["version"] == "1.0.0"


def test_update_still_returns_a_clean_error_when_the_revert_itself_raises_a_non_git_install_error(
        sample_plugins, tmp_path, monkeypatch):
    """Finding 2: `_revert_checkout` is explicitly best-effort — it must never let an exception escape
    past `update()`'s error boundary, even one `fetch_and_checkout` itself doesn't normally raise (e.g.
    `subprocess.TimeoutExpired` out of `_run_git`, or any other non-`GitInstallError` failure). Simulates
    the revert-time `fetch_and_checkout` call raising a plain `Exception` and asserts `update()` still
    responds with a clean 4xx/5xx instead of propagating the raw exception (which would otherwise replace
    the intended generic error response with an unhandled 500 from the test client / ASGI stack)."""
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    headers = {"Authorization": "Bearer a-session-token"}

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        src, repo_url = _install_crm_via_git(client, tmp_path, monkeypatch, headers)

        # New tag's manifest is invalid — this is what drives update() into calling _revert_checkout.
        (src / "manifest.json").write_text(
            '{"id":"crm","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")  # no 'name'
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "invalid bump")
        _git(src, "tag", "v1.1.0")

        # The revert's own fetch_and_checkout call raises something other than GitInstallError —
        # simulating a hung/timed-out revert-time git call. Only the REVERT call (back to the old
        # tag, "v1.0.0") must fail; the initial checkout of the new tag ("v1.1.0") has to succeed
        # first so update() actually reaches the manifest-validation step that triggers the revert.
        real_fetch_and_checkout = git_installer.fetch_and_checkout

        def _revert_boom(plugin_dir_arg, repo_url_arg, tag_arg):
            if tag_arg == "v1.0.0":
                raise TimeoutError("simulated non-GitInstallError failure during revert")
            return real_fetch_and_checkout(plugin_dir_arg, repo_url_arg, tag_arg)
        monkeypatch.setattr(git_installer, "fetch_and_checkout", _revert_boom)

        resp = client.post("/api/plugins/crm/update", headers=headers)

    assert resp.status_code == 422                     # the ORIGINAL update error, not an unhandled 500
    assert "traceback" not in resp.text.lower()

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.0.0"       # registry still reflects the pre-update state
