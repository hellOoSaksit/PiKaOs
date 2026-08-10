# Restoring PiKaOs from a backup archive

The normal path is the **Backups panel on the Modules screen** — create, download, restore, all with
one click. This file is for the case that panel cannot help you: **the server will not boot**, so
there is no UI to click. Everything below runs against the Docker volumes directly, with the stack
down.

> **What a backup archive holds.** `state/` (the kernel's JSON state — plugin registry, nav, prefs),
> `plugins/` (git-installed plugin code), `db.dump` (a `pg_dump --format=custom` dump, only when the
> postgres tool was wired), and `manifest.json`.
>
> **What it does NOT hold: `Backend/.env`.** That is deliberate and it is the reason an archive is
> safe to download — every stored credential inside is encrypted with `SECRET_KEY` from that file. It
> is also the trap: **restoring into a server with a different `SECRET_KEY` gives you back secrets
> nobody can decrypt.** Keep `.env` backed up separately, by hand, somewhere the archive is not.

## 1. Find the volumes

**Do not guess the names.** The stack runs under the compose project `pikaos` (`-p pikaos`), but the
volumes are NOT `pikaos_*`: `render_compose.py` pins an explicit `name:` on each one when it generates
the compose file, and that name is resolved from the `deploy/` directory. So they are `deploy_*`, and
a command written against `pikaos_kernelstate` would silently create a new empty volume instead of
finding yours. Always list first:

```bash
docker volume ls
#   deploy_kernelstate    -> /app/state
#   deploy_pluginsdir     -> /app/app/plugins
#   deploy_backupsdir     -> /app/backups   (the archives themselves)

docker volume inspect deploy_kernelstate      # Mountpoint, if you want to look inside from the host
grep -n "name:" deploy/docker-compose.generated.prod.yml   # the authority, if the list is ambiguous
```

Every command below uses `deploy_*`. Substitute what `docker volume ls` actually showed you.

## 2. Get the archive onto the host

If the archive is still in the backups volume (the usual case — a server that will not boot has not
lost its disk), copy it out:

```bash
docker run --rm -v deploy_backupsdir:/b -v "$PWD:/out" alpine \
  sh -c 'ls -1 /b/*.tar.gz'                       # pick one; ids are bk_<timestamp>
docker run --rm -v deploy_backupsdir:/b -v "$PWD:/out" alpine \
  cp /b/bk_20260810T120000000000.tar.gz /out/
```

Otherwise use a copy you downloaded earlier through the panel.

## 3. Stop the stack

```bash
docker compose -p pikaos -f deploy/docker-compose.generated.yml down
```

Do not skip this. Replacing the state directory under a running backend gives you half of each.

## 4. Unpack state and plugins back into the volumes

One throwaway container per volume. `--strip-components=1` drops the archive's own `state/` /
`plugins/` prefix so the files land at the root of the volume, which is where the app expects them.
Clear the target first — an untar MERGES, so a stale file the backup does not contain would survive.

```bash
# kernel state
docker run --rm -v deploy_kernelstate:/target -v "$PWD:/b:ro" alpine sh -c \
  'rm -rf /target/* /target/.[!.]* 2>/dev/null; tar xzf /b/bk_<id>.tar.gz -C /target --strip-components=1 state'

# git-installed plugins (skip if the archive was state-only — a pre-switch snapshot is)
docker run --rm -v deploy_pluginsdir:/target -v "$PWD:/b:ro" alpine sh -c \
  'rm -rf /target/* /target/.[!.]* 2>/dev/null; tar xzf /b/bk_<id>.tar.gz -C /target --strip-components=1 plugins'
```

Both commands were run against a throwaway volume and a real archive on 2026-08-10: the stale file is
gone, the files land at the volume root, and tar restores them owned by uid 1000 — which is the
container's `appuser`, so the backend can still write its state. If you extract as some other user
(or with `--no-same-owner`), fix it with
`docker run --rm -v deploy_kernelstate:/t alpine chown -R 1000:1000 /t`.

Check what an archive actually contains before you run either:

```bash
tar tzf bk_<id>.tar.gz | head        # manifest.json, state/…, plugins/…, db.dump
tar xzf bk_<id>.tar.gz manifest.json -O    # id, createdAt, coreVersion, stateOnly, hasDb
```

## 5. Restore the database (only if `hasDb` is true)

Bring the database sidecar up alone, extract the dump, and feed it in. `--clean --if-exists` drops
what is there first — that is the point, and it is destructive.

```bash
docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d db
tar xzf bk_<id>.tar.gz db.dump

docker run --rm --network deploy_default -v "$PWD:/b:ro" -e PGPASSWORD=<password> \
  postgres:17 pg_restore --clean --if-exists -h db -U pikaos -d pikaos /b/db.dump
```

The password goes in the environment, never in the connection string — argv is readable by every
process on the host. Use the same credentials the backend's `.env` carries.

## 6. Start the stack

```bash
docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d --build
curl -fsS http://localhost:8000/api/version
```

If the version answers, the restore took. Sign in and check the Modules screen: the plugin list
should be the one the backup was taken from.

## If the secrets come back unreadable

You restored into a server whose `SECRET_KEY` differs from the one the backup was written under. The
data is fine; the encrypted fields are not recoverable. Re-enter them: git credentials on the Modules
screen, and any plugin secrets in that plugin's own settings. To avoid it next time, restore the
matching `Backend/.env` **before** step 6 — or, if you still have the original server, copy its
`SECRET_KEY` across.

The panel refuses this case up front (it records a fingerprint of the secret in every manifest and
answers `409`); this manual path has no such guard, which is exactly why it is written down here.
