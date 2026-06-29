---
title: Telegram integration — 2-way agent chat channel (design)
type: feature
status: design
keywords: [telegram, bot, chat channel, webhook, long polling, getUpdates, secret_token, account linking, rbac, chat.read, chat.use, command dispatcher, agent chat, httpx]
related: [../architecture/data-model.md, ../architecture/release-and-rollback.md, ../architecture/deploy.md, ./compare.md, ../pikaos-dev-rules.md, ../process/lessons.md]
summary: >
  Connect the PiKaOs agent to Telegram as a two-way chat channel: a linked PiKaOs user talks to
  their agent from Telegram and gets replies back. Access is RBAC-gated (link-to-user + chat.read /
  chat.use, per-command), commands are a separate-handler registry, and updates arrive by webhook
  (hosted) or long-polling (on-prem/air-gap), config-driven. Reuses the llm_connections connection
  pattern; transport is raw httpx (no SDK). Status: design — schema + RBAC + config laid out.
updated: 2026-06-27
---

# Telegram integration — 2-way agent chat channel

> **Status: design; backbone laid (2026-06-27).** Telegram becomes another **channel into the
> existing agent**, not a new app — it plugs in exactly like [llm_connections](../architecture/data-model.md)
> (a DB-stored, encrypted, admin-managed connection + an optional module gated by `ENABLED_MODULES`).
> The agent loop, quests/runs, and RBAC are **reused**; Telegram only adds a transport + a command
> dispatcher + an identity bridge.

This doc owns the Telegram channel. The agent engine it feeds is the [engine module](../architecture/data-model.md)
(quests/runs/run_steps); the deploy modes it inherits are [deploy.md](../architecture/deploy.md) +
[release-and-rollback.md](../architecture/release-and-rollback.md).

---

## 0. Goals (what the user asked for)

1. **Two-way chat** — a person messages the bot in Telegram → it reaches their agent (a quest/run) →
   the agent's reply is sent back to the same Telegram chat. (Notifications fall out for free.)
2. **Link to a real PiKaOs user** — a Telegram account must be **linked to an existing PiKaOs user**
   before it can do anything; there is no anonymous access. Linking is a one-time code.
3. **RBAC-gated** — the linked user must hold a **chat permission** to use the channel.
4. **Two tiers** — **`chat.read`** = read/receive only; **`chat.use`** = read **and** command the agent.
5. **Separate commands** — bot commands (`/start`, `/link`, `/whoami`, `/new`, …) are a **registry of
   independent handlers**, one function per command.
6. **Per-command control** — an admin can allow/deny **which commands a given user may use** — done
   through the **existing RBAC** (each command declares a required permission; per-user grant/deny
   already exists in `user_perms`), so no new permission infra.

---

## 1. Where it plugs in (reuse, don't rebuild)

| Concern | Reused mechanism | New piece |
|---|---|---|
| Store the bot token (secret) | `app/crypto.py` Fernet (SECRET_KEY-derived), like `llm_connections.api_key_enc` | `telegram_connections` table |
| Admin-managed connection | the `llm_connections` CRUD + activate pattern (`routers/llm_config.py`) | `routers/telegram.py` |
| Turn the channel on/off per deploy | `modules.py` + `ENABLED_MODULES` (Modular Monolith §2.5) | `Module("telegram", …)` |
| Permissions | RBAC (`rbac_service`, `require_perm`, per-user grant/deny in `user_perms`) | perms `chat.read` · `chat.use` · `telegram.manage` |
| Outbound HTTP | `httpx` (the same no-SDK choice the LLM adapters made) | `services/telegram_adapter.py` |
| Run the agent | the engine (quests/runs + `agent_runner` + `queue.enqueue("agent_run", …)`) | the **inbound→run bridge** (§6 seam) |
| Background work | the arq worker (`worker.py`, module-gated jobs) | poller + `telegram_process_update` job |

**Decision: it is a module in the main app, not a plugin.** A plugin is for a feature that can
live behind its own login/DB ([plugin rules §6](../pikaos-dev-rules.md)); this channel is glued to
the agent runtime and the user/RBAC tables, so extracting it would just re-import all of them.

---

## 2. Schema (migration `0010_telegram`)

Three tables, mirroring the `llm_connections` style (UUID PK, encrypted secret, `created_at`).

```
telegram_connections          -- the bot itself (admin-managed, one active)
  id              uuid pk
  name            text                       -- label in the UI
  bot_token_enc   text                       -- Fernet ciphertext of the BotFather token (never plaintext)
  mode            text   'webhook'|'polling' -- how updates arrive (§4)
  webhook_secret_enc text  null              -- Fernet ciphertext of the setWebhook secret_token (webhook mode)
  bot_username    text   null                -- cached from getMe, for /start deep-links
  is_active       bool                       -- partial-unique: at most one active bot
  created_at      timestamptz

telegram_links                -- a Telegram identity ↔ a PiKaOs user (the trust anchor)
  tg_user_id      bigint pk                  -- Telegram's numeric user id (stable per account)
  tg_chat_id      bigint                     -- the private chat to reply into
  user_id         uuid  fk users(id) cascade -- the PiKaOs identity all perms/quota resolve from
  quest_id        uuid  null                 -- the persistent conversation thread (lazily created)
  created_at      timestamptz

telegram_link_codes           -- short-lived one-time codes issued by a logged-in user
  code            text pk                    -- random, unguessable (e.g. 8 base32 chars)
  user_id         uuid  fk users(id) cascade -- who this code will link to
  expires_at      timestamptz                -- e.g. now()+10m
  used_at         timestamptz null           -- single-use: set on redeem
  created_at      timestamptz
```

- **`telegram_links.user_id` is the trust anchor** — every inbound message resolves to it, and *all*
  permission/quota checks run against that PiKaOs user. No link row → the bot only answers `/start`
  and `/link`.
- Expand-contract safe (additive tables only) → satisfies the
  [release-and-rollback invariant](../architecture/release-and-rollback.md).

---

## 3. Access model — link first, then RBAC, two tiers, per-command

**Step 1 — link (one-time code).** A logged-in PiKaOs user clicks "Connect Telegram" → backend issues
a `telegram_link_codes` row → user sends `/link <code>` to the bot → the webhook/poller redeems it
(valid, unexpired, unused) → writes a `telegram_links` row binding `tg_user_id → user_id`, marks the
code used. Re-`/link` re-binds; `/unlink` deletes the row.

**Step 2 — every inbound message is authorized in this order:**
1. Resolve `tg_user_id` → `telegram_links` → PiKaOs `user_id`. **No link → refuse** (offer `/link`).
2. Resolve that user's **effective permissions** (`rbac_service.get_effective_perms` — role perms ∪
   per-user grants − per-user denies; admin = all). These are the *same* perms the web app uses.
3. Look up the command (or free-text = the "chat" pseudo-command) in the **registry** and check its
   `required_perm` against the user's perms. Missing → a polite "no permission for this" reply.

**The two tiers map onto the registry's `required_perm`:**

| Capability | required perm | tier |
|---|---|---|
| receive replies/notifications, `/help`, `/whoami` | `chat.read` | read-only |
| free-text → run the agent, `/new`, `/ask` | `chat.use` | read + command |
| (manage the bot connection itself — web UI only) | `telegram.manage` | admin |

`chat.use` implies `chat.read` (seeded so members/managers get `chat.use`, viewers get `chat.read`).

**Per-command allow/deny is just RBAC.** Because each command declares a `required_perm` and RBAC
already supports **per-user grant/deny** (`user_perms`, the จัดการเครื่องมือ screen), an admin can let
one user run `/new` but not another with zero Telegram-specific config — "ให้ใช้คำสั่งนี้ อันนี้ไม่ได้"
is expressed in the permission system, not a second allowlist. (Finer per-command perms can be added to
the registry later without changing the dispatcher.)

---

## 4. Receiving updates — webhook OR polling, config-driven

Telegram offers two **mutually exclusive** ways to receive updates; PiKaOs supports both and an admin
picks per connection (`telegram_connections.mode`), because the two deploy targets want different ones:

| Mode | How | Best for | Security |
|---|---|---|---|
| **webhook** | `setWebhook(url, secret_token)` → Telegram POSTs each `Update` to `POST /api/telegram/webhook/{conn_id}` | **hosted SaaS** (public URL, scales behind a load balancer) | verify the `X-Telegram-Bot-Api-Secret-Token` header with a **constant-time compare** against `webhook_secret_enc`; reject otherwise |
| **polling** | the worker long-polls `getUpdates(offset, timeout=50)` in a loop | **on-prem / air-gap / local dev** (no public URL needed) | none needed — the worker dials out to `api.telegram.org` |

This mirrors the [release-and-rollback](../architecture/release-and-rollback.md) hosted-vs-on-prem split:
**same code, config-flips the transport.** Default for the own-machine deploy today = **polling** (no
public ingress yet); flip to webhook when hosted behind TLS.

> The webhook endpoint is the **only unauthenticated route** in this feature — it's a public callback.
> It is protected by (a) the unguessable `secret_token` header and (b) doing **no work inline**: it
> validates, enqueues `telegram_process_update`, and returns `200` fast (Telegram retries non-200s).

---

## 5. Commands — a separate-handler registry

`services/telegram_commands.py` holds a registry: one entry per command = `(name, required_perm, handler)`.
The dispatcher splits `"/cmd args"`, looks up `cmd`, checks `required_perm` (§3), and calls the handler.
A non-slash message routes to the **chat** handler (`required_perm = chat.use`). Unknown `/x` → `/help`.

| Command | required perm | does |
|---|---|---|
| `/start` | — (pre-link) | greet + explain how to link |
| `/link <code>` | — (pre-link) | redeem a one-time code → bind this Telegram account to a PiKaOs user |
| `/unlink` | `chat.read` | delete the link row |
| `/whoami` | `chat.read` | show the linked PiKaOs identity + which tier/permissions |
| `/help` | `chat.read` | list the commands this user may actually use (filtered by their perms) |
| `/new` | `chat.use` | start a fresh conversation thread (new quest), so context resets |
| *(free text)* | `chat.use` | send the text to the agent as a task → reply with the result |

One function per command keeps them independent and testable; adding a command = one registry row.
`/help` renders only the commands whose `required_perm` the user holds — so the menu itself respects
the per-command gating.

---

## 6. Inbound → agent → outbound (the flow + the one seam)

```
Telegram ──update──▶ webhook route OR worker poller
                         │  (validate + resolve link + authorize, §3)
                         ▼
                 telegram_process_update(update)         [arq job]
                         │
              ┌──────────┴───────────┐
        is a command?            free text (chat.use)
              │                       │
         run the handler        get/create the link's quest_id
         (telegram_commands)         │
              │                  create a run {input:{task:text}} ◀── SEAM (needs engine run-CRUD, phase D)
              │                  queue.enqueue("agent_run", run_id)
              ▼                       │
        send reply  ◀── on run completion: deliver the final step ──┘
        (telegram_adapter.send_message → bot sendMessage)
```

**The seam.** Creating a quest+run from an inbound message, and delivering the reply when that run
finishes, depends on the engine's **run-creation path, which is not yet exposed (engine CRUD = "phase
D")**. So this design lays everything up to that boundary and defines the seam precisely:

- **Inbound:** `telegram_service.start_agent_turn(user, quest_id, text) -> run_id` — to be implemented
  against the engine's run-create helper once it lands. Until then it can stub a reply ("agent wiring
  pending") so the channel is testable end-to-end for commands + linking.
- **Outbound delivery:** when a run tied to a Telegram source reaches a terminal status, send its final
  message back. Cleanest hook = the existing **events stream** (`services/events.py` already publishes
  `run`/`step` to Redis `quest:<id>`); a small subscriber maps `quest_id → tg_chat_id` (the
  `telegram_links.quest_id`) and calls `send_message`. Records the run's origin so only Telegram-origin
  runs get delivered there.

Everything else in this doc (transport, linking, RBAC gating, command registry, webhook/polling,
config, schema) is buildable now and independent of that seam.

---

## 7. Config (`config.py`) + secrets

- `telegram_api_base` (default `https://api.telegram.org`) — overridable for tests/proxy.
- `telegram_poll_timeout_s` (default 50) · `telegram_request_timeout_s` (default 30) · `telegram_send_parse_mode` (default `MarkdownV2`).
- `public_base_url` — needed to compute the `setWebhook` URL in webhook mode (also useful elsewhere).
- **No bot token in env** (no-hardcode rule 2) — it lives encrypted in `telegram_connections`, set from
  the UI. A real token is never printed/logged/committed; the webhook `secret_token` is treated the same.
- **SSRF: not applicable** — every outbound call goes to the fixed `telegram_api_base`, never a
  user-supplied URL (unlike Compare), so `net_guard` isn't needed here.
- **Abuse:** even though access is link-gated, rate-limit per `tg_user_id` (cheap Redis counter) so a
  compromised linked account can't burn agent quota; quota itself is the user's existing token quota.

---

## 8. Rollout (incremental, each step stands alone)

1. **Backbone (done):** RBAC perms (`chat.read`/`chat.use`/`telegram.manage`) + schema (`0010`) + config + module registration.
2. **Transport + connection CRUD:** `telegram_adapter` (httpx) + `routers/telegram.py` connection CRUD + `getMe` test + activate.
3. **Linking + commands:** link-code issue/redeem + the command registry + dispatcher + `/start /link /whoami /help /unlink /new` — gives a working, RBAC-gated bot (commands only).
4. **Receive:** webhook route (secret_token verify) + worker poller; config-flip per `mode`.
5. **Agent bridge (the §6 seam):** wire inbound free-text → run, and run-completion → `send_message`, once engine run-CRUD (phase D) exists.

Steps 2–4 deliver a usable bot (linking, identity, commands, notifications) **before** the agent seam;
step 5 turns on full two-way agent chat.

---

## 9. Decisions + open

- **No bot library / SDK** — the Bot API is plain REST; `httpx` (already a dep) covers `getMe`,
  `getUpdates`, `setWebhook`, `sendMessage`. Matches the deliberate no-SDK choice of the LLM adapters
  (reuse · match-the-file). Revisit only if we need rich update types / FSM.
- **MarkdownV2 vs HTML** for replies — start with MarkdownV2 (escape user content); switch to HTML if
  escaping bites.
- **Open:** group chats (multi-user rooms) vs private only (start private-only — identity is 1:1);
  message editing/streaming partial agent output back to Telegram (defer — send the final reply first);
  media/file messages (defer — text first).
