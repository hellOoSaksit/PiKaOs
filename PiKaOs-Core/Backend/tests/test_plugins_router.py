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
from tests.conftest import seed_manifest as _seed_manifest


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

def test_install_from_git_clones_validates_and_is_restart_to_apply(sample_plugins, tmp_path, monkeypatch):
    """A successful install lands on disk + in the registry, but the manifest catalog is untouched —
    the plugin becomes visible only after the next restart's discover() (B3-H2: an in-process
    registration would be one worker's private state under `--workers N`)."""
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
    assert (plugins_dir / "crm" / "manifest.json").is_file()          # on disk
    from app.core import plugin_registry as registry
    assert registry.state_of(registry.read(), "crm") == registry.ENABLED   # in the registry
    # ...but NOT in the live catalog (or the response's plugin list) until the restart discovers it
    from app import plugin_loader
    assert "crm" not in plugin_loader.PLUGIN_MANIFESTS
    assert all(p["id"] != "crm" for p in body["plugins"])
    assert body["restart_required"] is True


def test_install_from_git_defaults_to_latest_release_tag(sample_plugins, tmp_path, monkeypatch):
    """W1: with no `ref`, install pins the highest semver tag — NOT the default-branch HEAD. The repo's
    HEAD carries a newer (unreleased) commit; the install must land on the tagged commit instead."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
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
    subprocess.run(["git", "commit", "-q", "-m", "release"], cwd=src, check=True)
    subprocess.run(["git", "tag", "v1.0.0"], cwd=src, check=True)
    # a newer, UNRELEASED commit on the branch HEAD — bumps version to 2.0.0 but has NO tag
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"2.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "unreleased WIP"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git", json={"repoUrl": repo_url},  # NO ref
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    on_disk = (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8")
    assert '"1.0.0"' in on_disk and '"2.0.0"' not in on_disk   # pinned the tag, not HEAD
    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.0.0"
    assert len(reg["crm"]["installedSha"]) == 40                # W2: commit SHA recorded


def test_install_from_git_refuses_bare_head_without_allow_head(sample_plugins, tmp_path, monkeypatch):
    """W1: a repo with NO release tag and no explicit override is refused — installing a moving branch
    HEAD is exactly the supply-chain risk the policy forbids."""
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
    subprocess.run(["git", "commit", "-q", "-m", "no tags here"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git", json={"repoUrl": repo_url},
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert "tag" in resp.json()["detail"].lower()
    assert list(plugins_dir.iterdir()) == []      # nothing installed


def test_install_from_git_allows_head_when_explicitly_opted_in(sample_plugins, tmp_path, monkeypatch):
    """The dev escape hatch: allowHead=true installs the default-branch HEAD of a tagless repo."""
    import subprocess
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
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
    subprocess.run(["git", "commit", "-q", "-m", "head only"], cwd=src, check=True)
    repo_url = f"file://{src}"
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins_dir)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/install-from-git",
                           json={"repoUrl": repo_url, "allowHead": True},
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    reg = registry.read()
    assert reg["crm"]["installedVia"] == "git"
    assert len(reg["crm"]["installedSha"]) == 40   # SHA still pinned even for a HEAD install


def test_install_from_git_rolls_back_when_registry_persistence_fails(sample_plugins, tmp_path, monkeypatch):
    """`registry.set_git_install` runs after the last cleanup boundary — if it raises (e.g. a
    kernel-state I/O failure persisting the registry), the endpoint must not leave a half-installed
    plugin behind: the on-disk folder may not survive, and the manifest catalog must stay untouched
    (install never registers in-process — B3-H2 restart-to-apply)."""
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: opt into HEAD
                            headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 500
    assert not (plugins_dir / "crm").exists()          # on-disk folder rolled back
    assert "crm" not in plugin_loader.PLUGIN_MANIFESTS  # catalog untouched (never registered in-process)


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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: reach the manifest check
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: opt into HEAD
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: reach the id guard
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: reach the readiness gate
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: reach _validate
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
                            json={"repoUrl": repo_url, "allowHead": True},   # tagless repo: reach the id check
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
    needs for the update tests below (mirrors Task 5/7's local-file-remote pattern; not a mock).
    Also seeds the installed manifest into the catalog (the restart-to-apply step the endpoint no
    longer does), so the caller can immediately update/uninstall the plugin."""
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
    import app.plugin_loader as plugin_loader
    _seed_manifest(plugin_loader.Manifest(id="crm", name="CRM", version=version, coreVersion="*"))
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
    assert resp.json() == {"latestVersion": "v1.3.0", "hasUpdate": True, "tagMoved": False}


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
    assert resp.json() == {"latestVersion": "v1.2.3", "hasUpdate": False, "tagMoved": False}


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
        assert check_resp.json() == {"latestVersion": "v1.1.0", "hasUpdate": True, "tagMoved": False}

        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    crm = next(p for p in body["plugins"] if p["id"] == "crm")
    # the response's plugin row still shows the RUNNING (old) manifest — the new code/version applies
    # only after the restart (B3-H2); disk + registry already carry the new version below
    assert crm["version"] == "1.0.0"
    assert body["restart_required"] is True
    assert (plugins_dir / "crm" / "manifest.json").read_text(encoding="utf-8").find('"1.1.0"') != -1

    reg = registry.read()
    assert reg["crm"]["installedTag"] == "v1.1.0"
    assert reg["crm"]["version"] == "1.1.0"


def test_update_records_the_new_commit_sha(sample_plugins, tmp_path, monkeypatch):
    """After an update the registry's installedSha advances to the NEW tag's commit — the pin stays
    accurate across updates (W2)."""
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
        sha_before = registry.read()["crm"]["installedSha"]

        (src / "manifest.json").write_text(
            '{"id":"crm","name":"CRM","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")
        _git(src, "add", ".")
        _git(src, "commit", "-q", "-m", "bump")
        _git(src, "tag", "v1.1.0")

        resp = client.post("/api/plugins/crm/update", headers=headers)
    assert resp.status_code == 200, resp.text
    sha_after = registry.read()["crm"]["installedSha"]
    assert len(sha_after) == 40
    assert sha_after != sha_before                          # advanced to the new commit
    assert sha_after == git_installer.remote_tag_sha(repo_url, "v1.1.0")


def test_check_update_flags_a_force_moved_tag(sample_plugins, tmp_path, monkeypatch):
    """W2: the installed tag was force-moved to a different commit after we pinned it — check-update
    compares the recorded installedSha against the tag's CURRENT remote SHA and flags the mismatch."""
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                             tag="v1.2.3", version="1.2.3", sha="a" * 40)
    monkeypatch.setattr(git_installer, "latest_tag", lambda url: "v1.2.3")   # no newer version
    monkeypatch.setattr(git_installer, "remote_tag_sha", lambda url, tag: "b" * 40)  # tag now points elsewhere
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                          headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tagMoved"] is True
    assert body["hasUpdate"] is False        # same tag name — the "update" is really a tamper warning


def test_check_update_does_not_flag_an_unmoved_tag(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                             tag="v1.2.3", version="1.2.3", sha="a" * 40)
    monkeypatch.setattr(git_installer, "latest_tag", lambda url: "v1.2.3")
    monkeypatch.setattr(git_installer, "remote_tag_sha", lambda url, tag: "a" * 40)  # unchanged
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                          headers={"Authorization": "Bearer a-session-token"})
    assert resp.json()["tagMoved"] is False


def test_check_update_tag_moved_false_when_no_sha_recorded(sample_plugins, tmp_path, monkeypatch):
    """A legacy row with no installedSha can't be tamper-checked — never a false alarm."""
    from app.core import kernel_state, setup_state, git_installer
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                             tag="v1.2.3", version="1.2.3")     # no sha
    monkeypatch.setattr(git_installer, "latest_tag", lambda url: "v1.3.0")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins/sample/check-update",
                          headers={"Authorization": "Bearer a-session-token"})
    body = resp.json()
    assert body["tagMoved"] is False
    assert body["hasUpdate"] is True         # a genuine newer tag still reports normally


def test_view_exposes_permission_info_and_installed_sha(sample_plugins, tmp_path, monkeypatch):
    """PluginOut surfaces per-permission {key,name,rationale} for the install-confirm UI, and the
    pinned installedSha for a git-installed plugin — without breaking the flat `permissions` list."""
    from app.core import kernel_state
    from app.core import plugin_registry as registry
    from app.core.routers.plugins import _view
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    reg = registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                                   tag="v1.2.3", version="1.2.3", sha="c" * 40)
    out = _view(reg=reg, active=set())
    sample = next(p for p in out if p.id == "sample")
    assert sample.permissions == ["sample.manage"]          # unchanged flat list
    assert sample.installedSha == "c" * 40
    assert [pi["key"] for pi in sample.permissionInfo] == ["sample.manage"]
    assert all("rationale" in pi for pi in sample.permissionInfo)


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
    tag's manifest is valid and passes readiness, so `fetch_and_checkout` succeeds for the NEW tag —
    then `registry.set_git_install` raises (simulating a kernel-state I/O failure persisting the
    registry). Unlike install-from-git there's a known-good prior version here, so the finalize-failure
    branch must put the on-disk checkout back on the OLD tag rather than tearing the plugin down —
    never leave disk on a version the registry never recorded (§3: a restart must still boot). The
    in-process manifest needs no restoring: update never touches it (B3-H2 restart-to-apply)."""
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

    assert plugin_loader.PLUGIN_MANIFESTS["crm"].version == "1.0.0"   # in-process manifest never touched

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


# --- uninstall / purge ---------------------------------------------------------------------------------

def test_uninstall_symlink_plugin_forgets_the_registry_row_but_keeps_code(sample_plugins, tmp_path, monkeypatch):
    """Default (dev-symlink, unchanged first-cut) install: uninstall only forgets the registry row (back
    to available) — the on-disk folder is a dev's own sibling checkout and must never be touched."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_state("sample", registry.ENABLED, version="1.2.3")

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.delete("/api/plugins/sample", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    assert "sample" not in registry.read()   # forgotten entirely, back to available


def test_uninstall_git_plugin_removes_code_but_registry_stays_pending_purge(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    plugins_dir = tmp_path / "plugins"
    (plugins_dir / "crm").mkdir(parents=True)
    (plugins_dir / "crm" / "manifest.json").write_text('{}', encoding="utf-8")
    monkeypatch.setattr(plugin_loader, "PLUGINS_DIR", plugins_dir)
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    # ENABLED_MODULES=* in this environment means the lifespan actually imports every registered manifest
    # id, "crm" included — it needs a real (stub) module on sys.modules, exactly like the purge tests below.
    monkeypatch.setitem(sys.modules, "app.plugins.crm", ModuleType("app.plugins.crm"))

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.delete("/api/plugins/crm", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    assert not (plugins_dir / "crm").exists()          # code removed
    reg = registry.read()
    assert registry.state_of(reg, "crm") == registry.PENDING_PURGE
    assert registry.repo_url_of(reg, "crm") is not None  # provenance kept for Purge


def _pending_purge_crm(tmp_path, monkeypatch):
    """Register + git-install a synthetic `crm` manifest, then move it straight to PENDING_PURGE —
    the shared setup for the enable/disable/update guard tests below (final-review Finding 1: none of
    those three may pull a plugin back out of PENDING_PURGE)."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")
    # ENABLED_MODULES=* in this environment means the lifespan actually imports every registered manifest
    # id, "crm" included — it needs a real (stub) module on sys.modules, exactly like the uninstall/purge
    # tests above.
    monkeypatch.setitem(sys.modules, "app.plugins.crm", ModuleType("app.plugins.crm"))


def test_enable_rejects_a_plugin_that_is_pending_purge(sample_plugins, tmp_path, monkeypatch):
    """final-review Finding 1: flipping a PENDING_PURGE plugin straight to ENABLED would erase the
    PENDING_PURGE marker and make `purge()` (which requires `state_of(...) == PENDING_PURGE`)
    permanently unreachable — orphaning its DB tables with no path left to drop them."""
    from app.core import plugin_registry as registry
    _pending_purge_crm(tmp_path, monkeypatch)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/crm/enable", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # unchanged


def test_disable_rejects_a_plugin_that_is_pending_purge(sample_plugins, tmp_path, monkeypatch):
    """Same guard as `enable` — disable must not clobber PENDING_PURGE either (§ Finding 1)."""
    from app.core import plugin_registry as registry
    _pending_purge_crm(tmp_path, monkeypatch)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/crm/disable", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # unchanged


def test_update_rejects_a_plugin_that_is_pending_purge(sample_plugins, tmp_path, monkeypatch):
    """Same guard as `enable`/`disable` — before this fix `update()` happened to fail anyway (its
    on-disk checkout is gone once Uninstall has run), but only incidentally, at the `fetch_and_checkout`
    step; this asserts the explicit, designed guard instead (§ Finding 1)."""
    from app.core import plugin_registry as registry
    _pending_purge_crm(tmp_path, monkeypatch)

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/crm/update", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # unchanged


def test_uninstall_requires_plugins_manage_permission(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.delete("/api/plugins/sample")
    assert resp.status_code == 401


def _bind_fake_postgres(client, engine):
    """Bind a fake `postgres.Connection` directly on the (already-built, per-test) container — the
    postgres Tool itself is out of scope here; only the shape `purge()`'s resolution needs matters."""
    from app.core.contracts import POSTGRES_CONNECTION
    client.app.state.container.bind(POSTGRES_CONNECTION, {"engine": engine, "session_factory": None})


def test_purge_calls_the_plugins_purge_hook_then_forgets_the_plugin(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader

    fake_engine = object()
    called = []
    mod = ModuleType("app.plugins.crm")
    mod.purge = lambda engine: called.append(engine)
    monkeypatch.setitem(sys.modules, "app.plugins.crm", mod)

    import app.main as main
    with TestClient(main.app) as client:
        # Seeded AFTER the lifespan's boot-time `enabled` snapshot is taken (ENABLED_MODULES=* in
        # this env would otherwise fold "crm" into that snapshot) — a successful purge deregisters "crm"
        # from PLUGIN_MANIFESTS again before teardown, and teardown's shutdown_plugins() walks the SAME
        # stale `enabled` snapshot against the CURRENT PLUGIN_MANIFESTS, so "crm" must never be in it.
        mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
        _seed_manifest(mf)
        registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
        registry.uninstall_git("crm")
        _bind_fake_postgres(client, fake_engine)
        resp = client.post("/api/plugins/crm/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200, resp.text
    assert called == [fake_engine]                        # purge(engine) got the real resolved engine
    assert "crm" not in registry.read()
    assert "crm" not in plugin_loader.PLUGIN_MANIFESTS     # manifest catalog entry deregistered too


def test_purge_without_a_purge_hook_returns_a_clear_error(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")
    monkeypatch.setitem(sys.modules, "app.plugins.crm", ModuleType("app.plugins.crm"))  # no purge attr

    import app.main as main
    with TestClient(main.app) as client:
        _bind_fake_postgres(client, object())
        resp = client.post("/api/plugins/crm/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert "purge" in resp.json()["detail"].lower()
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # left retryable


def test_purge_rejects_a_plugin_that_is_not_pending_purge(sample_plugins, tmp_path, monkeypatch):
    """Guards against purging an actively-enabled plugin's tables — purge only ever runs after
    Uninstall has already moved a git-installed plugin to PENDING_PURGE."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                              tag="v1.2.3", version="1.2.3")

    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422


def test_purge_returns_a_clean_error_when_the_postgres_tool_is_not_bound(sample_plugins, tmp_path, monkeypatch):
    """No `postgres.Connection` bound (the tool isn't enabled in this process) — purge can't drop
    tables it has no engine for. Must be a clean, generic error, never an AttributeError/500."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")
    called = []
    mod = ModuleType("app.plugins.crm")
    mod.purge = lambda engine: called.append(engine)
    monkeypatch.setitem(sys.modules, "app.plugins.crm", mod)

    import app.main as main
    with TestClient(main.app) as client:
        # no postgres tool bound — container has nothing under POSTGRES_CONNECTION
        resp = client.post("/api/plugins/crm/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 503
    assert "traceback" not in resp.text.lower()
    assert called == []                                   # never even attempted
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE


def test_purge_leaves_the_plugin_pending_purge_when_the_hook_itself_raises(sample_plugins, tmp_path, monkeypatch):
    """A buggy plugin's purge(engine) (e.g. drop_all fails partway) must not be treated as success —
    the plugin stays PENDING_PURGE so an operator can retry, rather than being silently forgotten with
    orphaned tables left behind."""
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    import sys
    from types import ModuleType
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")

    def _boom(engine):
        raise RuntimeError("simulated drop_all failure")
    mod = ModuleType("app.plugins.crm")
    mod.purge = _boom
    monkeypatch.setitem(sys.modules, "app.plugins.crm", mod)

    import app.main as main
    with TestClient(main.app) as client:
        _bind_fake_postgres(client, object())
        resp = client.post("/api/plugins/crm/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 500
    assert "traceback" not in resp.text.lower()
    assert "crm" in plugin_loader.PLUGIN_MANIFESTS          # not deregistered
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # left retryable


def test_purge_returns_a_clean_error_when_the_plugins_module_is_unimportable(sample_plugins, tmp_path, monkeypatch):
    """task-9-review Finding 2: `uninstall()` already deletes a git-installed plugin's on-disk code
    before Purge is ever reachable — so if this process never imported the package before (install →
    uninstall → purge in one session, or a restart between uninstall and a retried purge),
    `importlib.import_module(f"app.plugins.{plugin_id}")` raises `ModuleNotFoundError` for code that no
    longer exists. Previously unguarded — this fell through to Starlette's generic 500 handler "by
    accident".

    ENABLED_MODULES=* in this test env means `TestClient.__enter__` (lifespan) itself imports every
    registered manifest id, "crm" included — so it needs a stub in `sys.modules` to boot cleanly (same as
    the other purge tests). The stub is removed again right after startup (`monkeypatch.delitem`, before
    the purge call) so that by the time `purge()` runs, `app.plugins.crm` is genuinely absent from both
    `sys.modules` and the real filesystem (no such folder under `app/plugins/`) — a real, not simulated,
    `ModuleNotFoundError`."""
    import sys
    from types import ModuleType
    from app.core import kernel_state, setup_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.plugin_loader as plugin_loader
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    _seed_manifest(mf)
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")
    monkeypatch.setitem(sys.modules, "app.plugins.crm", ModuleType("app.plugins.crm"))  # boot-time only

    import app.main as main
    with TestClient(main.app) as client:
        monkeypatch.delitem(sys.modules, "app.plugins.crm", raising=False)  # code is "gone" from here on
        _bind_fake_postgres(client, object())
        resp = client.post("/api/plugins/crm/purge", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 422
    assert "traceback" not in resp.text.lower()
    assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE   # left retryable
    assert "crm" in plugin_loader.PLUGIN_MANIFESTS   # never deregistered — purge() hook never even ran


def test_purge_requires_plugins_manage_permission(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.post("/api/plugins/sample/purge")
    assert resp.status_code == 401


# --- display fields / git credentials -------------------------------------------------------------------

def test_view_serializes_display_fields(sample_plugins, tmp_path, monkeypatch):
    """`description`/`icon` come straight off the manifest (Task 1 fields); `installedVia` defaults to
    "symlink" for a plugin the registry has no git-install row for (dev sibling checkout, §2.4)."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    out = _view(reg={}, active=set())
    sample = next(p for p in out if p.id == "sample")
    assert sample.description == ""
    assert sample.icon is None
    assert sample.repoUrl is None
    assert sample.installedVia == "symlink"


def test_view_serializes_git_provenance_for_a_git_installed_plugin(sample_plugins, tmp_path, monkeypatch):
    """A registry row written by `set_git_install` (install-from-git / update) surfaces its `repoUrl` and
    `installedVia == "git"` — the UI's basis for showing an "Update"/"Uninstall" affordance instead of
    the dev-only symlink one."""
    from app.core import kernel_state
    from app.core import plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    reg = registry.set_git_install("sample", repo_url="https://github.com/acme/sample.git",
                                    tag="v1.2.3", version="1.2.3")
    out = _view(reg=reg, active=set())
    sample = next(p for p in out if p.id == "sample")
    assert sample.repoUrl == "https://github.com/acme/sample.git"
    assert sample.installedVia == "git"


def test_set_git_credential_never_echoes_the_token(sample_plugins, tmp_path, monkeypatch):
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.put("/api/plugins/git-credentials/github.com",
                           json={"token": "ghp_secret"},
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200
    assert "ghp_secret" not in resp.text


def test_set_git_credential_stores_it_encrypted_and_retrievable(sample_plugins, tmp_path, monkeypatch):
    """Real behavior, not a mock: the token really lands in kernel-state (so a later `clone_to_staging`/
    `fetch_and_checkout` can use it), encrypted at rest — not the raw value — and decrypts back to the
    original via `git_installer._credential_for`, matching a case-insensitive host."""
    from app.core import kernel_state, setup_state, git_installer
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.put("/api/plugins/git-credentials/GitHub.com",
                           json={"token": "ghp_secret"},
                           headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200
    raw_store = kernel_state.read_json("app_settings", {})
    stored = raw_store["plugin_git_credentials"]["value"]["github.com"]
    assert stored != "ghp_secret"                                    # not stored in the clear
    assert git_installer._credential_for("github.com") == "ghp_secret"


def test_set_git_credential_never_surfaces_through_list_plugins(sample_plugins, tmp_path, monkeypatch):
    """Nothing about a stored credential — encrypted or not — leaks through any other endpoint, including
    the general plugin listing a lower-privileged reader can call."""
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        put_resp = client.put("/api/plugins/git-credentials/github.com",
                               json={"token": "ghp_secret"},
                               headers={"Authorization": "Bearer a-session-token"})
        assert put_resp.status_code == 200
        list_resp = client.get("/api/plugins", headers={"Authorization": "Bearer a-session-token"})
    assert list_resp.status_code == 200
    assert "ghp_secret" not in list_resp.text
    assert "plugin_git_credentials" not in list_resp.text


def test_set_git_credential_requires_plugins_manage_permission(sample_plugins, tmp_path, monkeypatch):
    """No/invalid session token → 401, matching the other mutation routes' auth gate."""
    from app.core import kernel_state, setup_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.put("/api/plugins/git-credentials/github.com", json={"token": "ghp_secret"})
    assert resp.status_code == 401
