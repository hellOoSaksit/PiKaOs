"""Full install-from-git lifecycle against a local repo (no network) — install-from-git design §2.6.

Exercises Tasks 1-10 together in ONE continuous flow (install → publish a new tag → check-update →
update → uninstall → purge). `test_plugins_router.py` already proves every individual endpoint works
in isolation with fresh state per test — this file's job is narrower and different: catch any seam
that only breaks when the state ONE endpoint leaves behind is fed straight into the next (e.g. the
tag/version install-from-git records vs. what check-update/update read back, or the registry state
uninstall leaves vs. what purge requires).

    docker compose exec backend pytest tests/test_install_from_git_e2e.py -v
"""
from __future__ import annotations

import subprocess
import sys
from types import ModuleType

from starlette.testclient import TestClient

from app.core import git_installer, kernel_state, setup_state
from app.core import plugin_registry as registry
from app.core.contracts import POSTGRES_CONNECTION
from tests.conftest import seed_manifest


def _tagged_repo(tmp_path, tag, extra_files=None):
    src = tmp_path / f"src-{tag}"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        f'{{"id":"crm","name":"CRM","version":"{tag.lstrip("v")}","coreVersion":"*"}}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", tag], cwd=src, check=True)
    subprocess.run(["git", "tag", tag], cwd=src, check=True)
    return src


def test_full_lifecycle(tmp_path, monkeypatch, sample_plugins):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])
    import app.plugin_loader as plugin_loader
    plugins_dir = tmp_path / "plugins"
    monkeypatch.setattr(plugin_loader, "PLUGINS_DIR", plugins_dir)

    # one origin repo we push a second tag onto later, to exercise the update flow
    src = _tagged_repo(tmp_path, "v1.0.0")
    repo_url = f"file://{src}"
    headers = {"Authorization": "Bearer a-session-token"}

    import app.main as main
    with TestClient(main.app) as client:
        # install
        resp = client.post("/api/plugins/install-from-git", json={"repoUrl": repo_url}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert (plugins_dir / "crm").is_dir()
        assert registry.installed_via(registry.read(), "crm") == "git"
        # install is restart-to-apply (B3-H2): the manifest only enters the catalog at the next boot's
        # discover() — seed that post-restart state so the rest of the lifecycle can act on the plugin
        seed_manifest(plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*"))

        # publish v1.1.0 on the same origin, then check-update + update
        (src / "manifest.json").write_text(
            '{"id":"crm","name":"CRM","version":"1.1.0","coreVersion":"*"}', encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=src, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "v1.1.0"], cwd=src, check=True)
        subprocess.run(["git", "tag", "v1.1.0"], cwd=src, check=True)

        resp = client.get("/api/plugins/crm/check-update", headers=headers)
        assert resp.json() == {"latestVersion": "v1.1.0", "hasUpdate": True, "tagMoved": False}

        resp = client.post("/api/plugins/crm/update", headers=headers)
        assert resp.status_code == 200, resp.text
        crm = next(p for p in resp.json()["plugins"] if p["id"] == "crm")
        # the response row shows the RUNNING (old) manifest until the restart applies the update
        assert crm["version"] == "1.0.0"
        assert registry.read()["crm"]["version"] == "1.1.0"   # ...but the registry already advanced

        # uninstall: code gone, DB-provenance kept, state = pending_purge
        resp = client.delete("/api/plugins/crm", headers=headers)
        assert resp.status_code == 200
        assert not (plugins_dir / "crm").exists()
        assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE
        # Verify DB-provenance actually survives uninstall
        assert registry.repo_url_of(registry.read(), "crm") is not None
        assert registry.installed_tag_of(registry.read(), "crm") is not None

        # Purge without a purge() hook is refused, not silently skipped. crm is PENDING_PURGE now, so
        # (unlike the brief's original draft assumed) purge()'s checks do NOT short-circuit before the
        # DB-engine resolution — that only happens for a plugin that ISN'T pending purge. A real DI
        # container IS built for this TestClient (main.py's lifespan), but no postgres Tool is enabled
        # in this test process, so it holds nothing under POSTGRES_CONNECTION; bind a fake engine here to
        # get past that gate and reach the actual behaviour this assertion cares about — the missing
        # purge() hook — exactly like test_plugins_router.py's `_bind_fake_postgres` helper does for the
        # single-endpoint purge tests. Left as a bare stub module (no `purge` attribute) rather than the
        # module that genuinely doesn't exist on disk (crm's origin repo never had any Python code) so
        # this exercises the "no purge() hook" 422 branch specifically, not the separate
        # "no importable code left" 422 branch already covered by
        # test_purge_returns_a_clean_error_when_the_plugins_module_is_unimportable.
        monkeypatch.setitem(sys.modules, "app.plugins.crm", ModuleType("app.plugins.crm"))
        client.app.state.container.bind(POSTGRES_CONNECTION, {"engine": object(), "session_factory": None})
        resp = client.post("/api/plugins/crm/purge", headers=headers)
        assert resp.status_code == 422
        assert "purge" in resp.json()["detail"].lower()
        assert registry.state_of(registry.read(), "crm") == registry.PENDING_PURGE  # left retryable
