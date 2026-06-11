/* PiKaOs — ES module (migrated from PiKaOs/data-workflows.jsx). */

/* ============================================================
   WORKFLOWS / "โต๊ะปรุงเวท" (Activepieces) — mock data + run service.
   Mirrors PLAN §7: workflows + tool_runs. A workflow has an
   input_schema (form fields) and a step graph (for the builder
   canvas). Running one simulates the webhook → creates a tool_run.
   Persisted to localStorage so toggles + runs survive reload.
   ============================================================ */

/* ---- field types for input_schema ---- */
// { key, label, labelEn, type: text|number|select|textarea, required, options?, placeholder? }

const WORKFLOWS_SEED = [
  {
    id: "wf_pr_review", name: "ตรวจรีวิว Pull Request", nameEn: "PR Review Bot",
    desc: "ดึง diff จาก PR แล้วให้ agent รีวิว สรุปความเสี่ยง และคอมเมนต์กลับ",
    descEn: "Pulls a PR diff, has an agent review it, summarizes risks and posts comments back.",
    icon: "🔍", category: "dev", trigger: "agent", enabled: true,
    ap_flow_id: "ap_5f3a91", webhook_url: "https://ap.guildos.io/webhook/5f3a91",
    runs: 142, lastStatus: "ok", created: "ม.ค. 2026",
    input_schema: [
      { key: "repo", label: "Repository", labelEn: "Repository", type: "text", required: true, placeholder: "guildos/auth-service" },
      { key: "pr", label: "เลข PR", labelEn: "PR number", type: "number", required: true, placeholder: "128" },
      { key: "depth", label: "ระดับการตรวจ", labelEn: "Review depth", type: "select", options: ["quick", "standard", "deep"] },
    ],
    steps: [
      { ic: "🪝", t: "Webhook trigger", d: "POST /webhook/5f3a91" },
      { ic: "🌐", t: "GitHub · get diff", d: "fetch PR files + patch" },
      { ic: "🤖", t: "Hermes · review", d: "summarize risks, style, tests" },
      { ic: "💬", t: "GitHub · comment", d: "post review back to PR" },
    ],
  },
  {
    id: "wf_daily_digest", name: "สรุปข่าวประจำวัน", nameEn: "Daily Digest",
    desc: "รวบรวมความเคลื่อนไหวของกิลด์เมื่อวาน แล้วส่งสรุปเข้าช่องประชุม",
    descEn: "Collects yesterday's guild activity and posts a summary to the council channel.",
    icon: "📰", category: "ops", trigger: "schedule", enabled: true,
    ap_flow_id: "ap_8b22cd", webhook_url: "https://ap.guildos.io/webhook/8b22cd",
    runs: 58, lastStatus: "ok", created: "ก.พ. 2026",
    input_schema: [
      { key: "channel", label: "ช่องปลายทาง", labelEn: "Channel", type: "select", options: ["#council", "#general", "#leads"] },
      { key: "window", label: "ช่วงเวลา", labelEn: "Time window", type: "select", options: ["24h", "7d"] },
    ],
    steps: [
      { ic: "⏰", t: "Schedule · 08:00", d: "cron 0 8 * * *" },
      { ic: "🗃️", t: "Query · activity", d: "aggregate last window" },
      { ic: "🤖", t: "Hermes · summarize", d: "write digest" },
      { ic: "📣", t: "Post · channel", d: "send to council" },
    ],
  },
  {
    id: "wf_deploy", name: "ปล่อยเวอร์ชันใหม่", nameEn: "Deploy Release",
    desc: "รัน test → build → deploy ไป staging แล้วรอการอนุมัติก่อนขึ้น production",
    descEn: "Runs tests → build → deploy to staging, then waits for approval before production.",
    icon: "🚀", category: "dev", trigger: "agent", enabled: false,
    ap_flow_id: "ap_d10e77", webhook_url: "https://ap.guildos.io/webhook/d10e77",
    runs: 23, lastStatus: "failed", created: "มี.ค. 2026",
    input_schema: [
      { key: "service", label: "บริการ", labelEn: "Service", type: "text", required: true, placeholder: "auth-service" },
      { key: "ref", label: "Git ref", labelEn: "Git ref", type: "text", required: true, placeholder: "v2.4.0" },
      { key: "env", label: "ปลายทาง", labelEn: "Target", type: "select", options: ["staging", "production"] },
    ],
    steps: [
      { ic: "🪝", t: "Webhook trigger", d: "POST /webhook/d10e77" },
      { ic: "🧪", t: "Run tests", d: "bun test (gate)" },
      { ic: "📦", t: "Build image", d: "docker build + push" },
      { ic: "🛫", t: "Deploy", d: "rollout to target" },
      { ic: "✋", t: "Approval", d: "wait for human OK" },
    ],
  },
  {
    id: "wf_ingest", name: "นำเข้าคลังความรู้", nameEn: "Codex Ingest",
    desc: "รับลิงก์เอกสาร → ดึงเนื้อหา → แบ่ง chunk → ฝัง embedding เข้า Codex",
    descEn: "Takes a document URL → extracts content → chunks → embeds into the Codex.",
    icon: "📚", category: "knowledge", trigger: "webhook", enabled: true,
    ap_flow_id: "ap_3c0f12", webhook_url: "https://ap.guildos.io/webhook/3c0f12",
    runs: 311, lastStatus: "ok", created: "ก.พ. 2026",
    input_schema: [
      { key: "url", label: "URL เอกสาร", labelEn: "Document URL", type: "text", required: true, placeholder: "https://…" },
      { key: "tags", label: "ป้ายกำกับ", labelEn: "Tags", type: "text", placeholder: "backend, security" },
    ],
    steps: [
      { ic: "🪝", t: "Webhook trigger", d: "POST /webhook/3c0f12" },
      { ic: "📄", t: "Fetch · extract", d: "read + clean text" },
      { ic: "✂️", t: "Chunk", d: "~600 tok, 12% overlap" },
      { ic: "🧬", t: "Embed", d: "vector → pgvector" },
    ],
  },
];

/* ---- tool_runs seed (most recent first) ---- */
const TOOL_RUNS_SEED = [
  { id: "tr_9", wf: "wf_pr_review", agent: "a4", quest: "q1", status: "ok", started: { en: "12 min", th: "12 นาที" }, dur: "8.4s",
    input: { repo: "guildos/auth-service", pr: 128, depth: "standard" },
    output: { risks: 2, comments: 5, verdict: "approve-with-nits" }, error: null },
  { id: "tr_8", wf: "wf_ingest", agent: "a6", quest: null, status: "ok", started: { en: "40 min", th: "40 นาที" }, dur: "3.1s",
    input: { url: "https://blog.example.com/rag", tags: "rag, research" },
    output: { chunks: 14, embedded: 14, doc_id: "k2" }, error: null },
  { id: "tr_7", wf: "wf_deploy", agent: "a3", quest: "q4", status: "failed", started: { en: "1 hr", th: "1 ชม." }, dur: "46.2s",
    input: { service: "auth-service", ref: "v2.4.0", env: "production" },
    output: null, error: "Gate failed: 3 tests red in auth.spec.ts (timeout on token refresh)" },
  { id: "tr_6", wf: "wf_daily_digest", agent: null, quest: null, status: "ok", started: { en: "5 hr", th: "5 ชม." }, dur: "5.7s",
    input: { channel: "#council", window: "24h" },
    output: { items: 23, posted: true }, error: null },
  { id: "tr_5", wf: "wf_pr_review", agent: "a4", quest: "q1", status: "ok", started: { en: "yesterday", th: "เมื่อวาน" }, dur: "9.1s",
    input: { repo: "guildos/web", pr: 91, depth: "deep" },
    output: { risks: 0, comments: 3, verdict: "approve" }, error: null },
  { id: "tr_4", wf: "wf_ingest", agent: "a6", quest: null, status: "ok", started: { en: "yesterday", th: "เมื่อวาน" }, dur: "2.8s",
    input: { url: "https://docs.example.com/auth", tags: "security" },
    output: { chunks: 9, embedded: 9, doc_id: "k1" }, error: null },
  { id: "tr_3", wf: "wf_deploy", agent: "a3", quest: "q4", status: "ok", started: { en: "2 days", th: "2 วัน" }, dur: "112.0s",
    input: { service: "web", ref: "v1.8.2", env: "staging" },
    output: { deployed: true, url: "https://staging.guildos.io" }, error: null },
];

const WF_TRIGGER = {
  webhook:  { ic: "🪝", th: "Webhook", en: "Webhook" },
  schedule: { ic: "⏰", th: "ตามเวลา", en: "Schedule" },
  agent:    { ic: "🤖", th: "Agent เรียก", en: "Agent-called" },
};
const WF_STATUS = {
  running: { th: "กำลังรัน", en: "Running", cls: "info" },
  ok:      { th: "สำเร็จ",   en: "Success", cls: "on" },
  failed:  { th: "ล้มเหลว",  en: "Failed",  cls: "warn" },
};

/* ---- persistence ---- */
const WF_KEYS = { workflows: "guildos-workflows-v1", runs: "guildos-toolruns-v1" };
function loadWF(key, fb) { try { const r = localStorage.getItem(WF_KEYS[key]); return r === null ? fb : JSON.parse(r); } catch { return fb; } }
function saveWF(key, v) { try { localStorage.setItem(WF_KEYS[key], JSON.stringify(v)); } catch {} }

function wfById(list, id) { return list.find(w => w.id === id); }

/* ---- mock POST /workflows/:id/run → simulate webhook, resolve to a tool_run ----
   Returns {status, output, error, dur}. ~12% of runs fail for realism. */
function simulateRun(wf, input) {
  return new Promise(resolve => {
    const t = 700 + Math.random() * 1400;
    setTimeout(() => {
      const fail = Math.random() < 0.12;
      const dur = (t / 1000).toFixed(1) + "s";
      if (fail) {
        resolve({ status: "failed", output: null, dur,
          error: "Step failed: upstream returned 502 (gateway). Retry or check the flow." });
      } else {
        // shape a plausible output from the workflow kind
        let output = { ok: true };
        if (wf.id === "wf_pr_review") output = { risks: Math.floor(Math.random() * 3), comments: 2 + Math.floor(Math.random() * 5), verdict: "approve" };
        else if (wf.id === "wf_ingest") output = { chunks: 6 + Math.floor(Math.random() * 12), embedded: 6 + Math.floor(Math.random() * 12), doc_id: "k" + (3 + Math.floor(Math.random() * 5)) };
        else if (wf.id === "wf_daily_digest") output = { items: 10 + Math.floor(Math.random() * 20), posted: true };
        else if (wf.id === "wf_deploy") output = { deployed: true, env: input.env || "staging" };
        resolve({ status: "ok", output, dur, error: null });
      }
    }, t);
  });
}

Object.assign(window, {
  WORKFLOWS_SEED, TOOL_RUNS_SEED, WF_TRIGGER, WF_STATUS, loadWF, saveWF, wfById, simulateRun,
});

export {
  TOOL_RUNS_SEED,
  WF_KEYS,
  WF_STATUS,
  WF_TRIGGER,
  WORKFLOWS_SEED,
  loadWF,
  saveWF,
  simulateRun,
  wfById
};
