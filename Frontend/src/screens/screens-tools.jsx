/* PiKaOs — Tools & Options Manager (admin). จัดการเครื่องมือของระบบ
   (MCP / LINE OA / Telegram / CMD-PowerShell / HTTP API / Webhook / DB / Email) + ตัวเลือกตำแหน่ง.
   ชื่อเครื่องมือ sync เข้า options.tools ให้ฟอร์มสร้าง Agent ใช้เลือกได้ทันที
   ฟอร์มเป็น popup (kit Modal) · ช่องกรอก typed ตาม TOOL_TYPES (text/secret/select/textarea/number/toggle) */
import React from 'react';
const { useState, useEffect } = React;
import { activateLlmConnection, createLlmConnection, deleteLlmConnection, llmConnections, llmRoles, setLlmRole, storageStatus, storageTest, updateLlmConnection } from '../lib/api.js';
import { NavManagerPanel } from './screens-nav.jsx';
import { Btn, Empty, HelpNote, PageHead, Panel } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';
import Modal from '../components/ui/Modal.jsx';
import Switch from '../components/ui/Switch.jsx';
import { TOOL_TYPES, addOption, loadOptions, loadSkillDocs, loadToolCfgs, removeOption, saveSkillDocs, saveToolCfgs } from '../lib/characters.jsx';
import { RichBody } from './screens-world.jsx';

const typeOf = (k) => TOOL_TYPES.find(t => t.key === k) || TOOL_TYPES[TOOL_TYPES.length - 1];
/* รองรับทั้ง spec แบบ object และ tuple [key,label,ph] เดิม */
const normField = (d) => (Array.isArray(d) ? { k: d[0], label: d[1], ph: d[2] } : d);

// AI model / API settings are now data-driven (backend /api/llm/connections), not hardcoded
// lists in localStorage — see AiApiPanel below.
/* LLM provider config — data-driven (no-hardcode): admin sets which provider (Local/Ollama vs
   OpenAI vs Anthropic), model, endpoint, key. Reads/writes the backend (/api/llm/connections);
   the active row is what the engine actually uses. The API key is write-only (never returned). */
const LLM_PROVIDERS = ["ollama", "openai", "anthropic"];
const LLM_PROVIDER_LABEL = { ollama: "Local · Ollama", openai: "OpenAI · ChatGPT", anthropic: "Anthropic · Claude" };
const LLM_PROVIDER_ICON = { ollama: "💻", openai: "🟢", anthropic: "🧠" };
const LLM_MODEL_PH = { ollama: "llama3.1", openai: "gpt-4o-mini", anthropic: "claude-opus-4-8" };
const LLM_BLANK = { name: "", provider: "ollama", model: "", base_url: "", api_key: "" };
// per-system role assignment — icons only; labels/desc come from i18n (llmcfg.role.<key>[.desc])
const LLM_ROLE_ICON = { engine: "🧩", search: "🔎", summarize: "📝" };

function AiApiPanel({ mayEdit, mayAssign, t }) {
  const tx = t || ((k) => k);
  const [conns, setConns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);     // connection id | "new" | null
  const [form, setForm] = useState(LLM_BLANK);

  const load = async () => {
    setLoading(true); setErr("");
    try { setConns(await llmConnections()); }
    catch (e) { setErr(e.message || tx("llmcfg.err")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const startNew = () => { setForm(LLM_BLANK); setEditing("new"); };
  const startEdit = (c) => { setForm({ name: c.name, provider: c.provider, model: c.model || "", base_url: c.base_url || "", api_key: "" }); setEditing(c.id); };

  const save = async () => {
    const body = { name: form.name.trim(), provider: form.provider, model: form.model.trim(), base_url: form.base_url.trim() || null };
    if (form.api_key) body.api_key = form.api_key;     // omit to keep the stored key unchanged
    setErr("");
    try {
      if (editing === "new") await createLlmConnection(body);
      else await updateLlmConnection(editing, body);
      setEditing(null); await load();
    } catch (e) { setErr(e.message || tx("llmcfg.err")); }
  };
  const activate = async (id) => { setErr(""); try { await activateLlmConnection(id); await load(); } catch (e) { setErr(e.message || tx("llmcfg.err")); } };
  const del = async (c) => {
    const ok = window.uiConfirm
      ? await window.uiConfirm({ title: tx("llmcfg.delConfirm"), message: c.name, danger: true, confirmText: tx("tools.delete") })
      : window.confirm(tx("llmcfg.delConfirm"));
    if (!ok) return;
    setErr("");
    try { await deleteLlmConnection(c.id); await load(); } catch (e) { setErr(e.message || tx("llmcfg.err")); }
  };

  return (
    <div>
      <div className="sm-set-note mono">{tx("llmcfg.hint")}</div>
      {err && <div className="muted" style={{ color: "var(--danger,#c0392b)", fontSize: 12.5, padding: "6px 2px" }} data-no-lex>{err}</div>}

      {loading ? (
        <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>{tx("llmcfg.loading")}</div>
      ) : (conns.length === 0 && editing == null) ? (
        <Empty icon="🤖" title={tx("llmcfg.empty")} />
      ) : (
        <div className="tool-list">
          {conns.map(c => (
            <div key={c.id} className={`tool-row ${c.is_active ? "" : "off"}`}>
              <span className="tool-ic">{LLM_PROVIDER_ICON[c.provider] || "🤖"}</span>
              <div className="tool-bd">
                <div className="tool-name">{c.name} {c.is_active && <span className="chip on" data-no-lex>{tx("llmcfg.active")}</span>}</div>
                <div className="tool-meta mono">{LLM_PROVIDER_LABEL[c.provider] || c.provider} · {c.model || "—"}{c.api_key_set ? " · 🔑" : ""}</div>
              </div>
              {mayEdit && !c.is_active && <button type="button" className="chip-act" title={tx("llmcfg.activate")} onClick={() => activate(c.id)}>✓</button>}
              {mayEdit && <button type="button" className="chip-act" title={tx("tools.edit")} onClick={() => startEdit(c)}>✎</button>}
              {mayEdit && <button type="button" className="chip-act danger" title={tx("tools.delete")} onClick={() => del(c)}>✕</button>}
            </div>
          ))}
        </div>
      )}

      {mayEdit && editing == null && (
        <div style={{ marginTop: 10 }}><Btn onClick={startNew}>{tx("llmcfg.add")}</Btn></div>
      )}

      {!loading && conns.length > 0 && <RoleAssignments conns={conns} mayEdit={mayAssign} t={tx} />}

      {mayEdit && editing != null && (
        <div className="bf-2" style={{ marginTop: 12 }}>
          <div className="bf"><label className="bf-label">{tx("llmcfg.name")}</label>
            <input className="bf-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder={tx("llmcfg.namePh")} data-no-lex /></div>
          <div className="bf"><label className="bf-label">{tx("llmcfg.provider")}</label>
            <Select block value={form.provider} onChange={v => set("provider", v)} options={LLM_PROVIDERS.map(p => ({ value: p, label: LLM_PROVIDER_LABEL[p] }))} /></div>
          <div className="bf"><label className="bf-label">{tx("llmcfg.model")}</label>
            <input className="bf-input mono" style={{ fontSize: 12.5 }} value={form.model} onChange={e => set("model", e.target.value)} placeholder={LLM_MODEL_PH[form.provider] || ""} data-no-lex /></div>
          <div className="bf"><label className="bf-label">{tx("llmcfg.endpoint")}</label>
            <input className="bf-input mono" style={{ fontSize: 12.5 }} value={form.base_url} onChange={e => set("base_url", e.target.value)} placeholder="https://api.openai.com/v1" data-no-lex /></div>
          <div className="bf" style={{ gridColumn: "1 / -1" }}><label className="bf-label">{tx("llmcfg.apiKey")}</label>
            <SecretInput value={form.api_key} onChange={e => set("api_key", e.target.value)} placeholder={editing === "new" ? tx("settings.apiKeyPh") : tx("llmcfg.apiKeyKeep")} />
            <span className="bf-hint">{form.provider === "ollama" ? tx("llmcfg.apiKeyLocal") : (editing === "new" ? tx("settings.apiKey.hint") : tx("llmcfg.apiKeyKeep"))}</span></div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <Btn onClick={save} disabled={!form.name.trim() || !form.provider}>{tx("llmcfg.save")}</Btn>
            <Btn onClick={() => { setEditing(null); setErr(""); }}>{tx("llmcfg.cancel")}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* Per-system LLM assignment — admin routes each system role (engine/search/summarize) to a
   connection, or leaves it on the active default. Source of truth is the backend role catalog
   (/api/llm/roles) — the UI renders whatever roles it returns, labelled via i18n. */
function RoleAssignments({ conns, mayEdit, t }) {
  const tx = t || ((k) => k);
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = async () => { try { setRoles(await llmRoles()); setErr(""); } catch (e) { setErr(e.message || tx("llmcfg.err")); } };
  // re-pull after a connection is added/removed (a deleted connection cascades its bindings away)
  useEffect(() => { load(); }, [conns.length]);

  const change = async (role, cid) => {
    setBusy(role); setErr("");
    try { await setLlmRole(role, cid || null); await load(); }
    catch (e) { setErr(e.message || tx("llmcfg.err")); }
    finally { setBusy(""); }
  };

  if (!roles.length) return null;
  const opts = [
    { value: "", label: tx("llmcfg.roles.default") },
    ...conns.map(c => ({ value: c.id, label: `${c.name} · ${c.model || c.provider}` })),
  ];

  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--line,#e5e5e5)", paddingTop: 14 }}>
      <div className="bf-label" style={{ marginBottom: 4 }}>{tx("llmcfg.roles.title")}</div>
      <div className="sm-set-note mono">{tx("llmcfg.roles.hint")}</div>
      {err && <div className="muted" style={{ color: "var(--danger,#c0392b)", fontSize: 12.5, padding: "6px 2px" }} data-no-lex>{err}</div>}
      <div className="tool-list">
        {roles.map(r => (
          <div key={r.role} className="tool-row">
            <span className="tool-ic">{LLM_ROLE_ICON[r.role] || "⚙️"}</span>
            <div className="tool-bd">
              <div className="tool-name">{tx(`llmcfg.role.${r.role}`)}</div>
              <div className="tool-meta">{tx(`llmcfg.role.${r.role}.desc`)}</div>
            </div>
            <div style={{ minWidth: 200 }}>
              <Select block disabled={!mayEdit || busy === r.role} value={r.connection_id || ""}
                onChange={v => change(r.role, v)} options={opts} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="bf-secret">
      <input className="bf-input mono" style={{ fontSize: 12.5, paddingRight: 58 }} type={show ? "text" : "password"}
        value={value} onChange={onChange} placeholder={placeholder} autoComplete="new-password" data-no-lex />
      <button type="button" className="bf-secret-eye mono" onClick={() => setShow(s => !s)}>{show ? "HIDE" : "SHOW"}</button>
    </div>
  );
}

function ToolField({ d, value, onChange }) {
  const kind = d.kind || "text";
  const span = d.full ? { gridColumn: "1 / -1" } : null;
  if (kind === "toggle") {
    return (
      <div className="bf bf-toggle" style={span}>
        <Switch checked={!!value} onChange={onChange} label={d.label} />
      </div>
    );
  }
  return (
    <div className="bf" style={span}>
      <label className="bf-label">{d.label}</label>
      {kind === "select" ? (
        <Select block value={value || (d.opts[0] && d.opts[0].value)} onChange={onChange} options={d.opts} />
      ) : kind === "secret" ? (
        <SecretInput value={value || ""} onChange={e => onChange(e.target.value)} placeholder={d.ph} />
      ) : kind === "textarea" ? (
        <textarea className={"bf-input area" + (d.mono ? " mono" : "")} style={d.mono ? { fontSize: 12.5 } : null} rows={3}
          value={value || ""} onChange={e => onChange(e.target.value)} placeholder={d.ph}></textarea>
      ) : (
        <input className={"bf-input" + (d.mono ? " mono" : "")} style={d.mono ? { fontSize: 12.5 } : null}
          type={kind === "number" ? "number" : "text"} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={d.ph} />
      )}
    </div>
  );
}

function ToolForm({ initial, onSave, onCancel, t }) {
  const tx = t || ((k) => k);
  const [f, setF] = useState(initial || { name: "", type: "mcp", enabled: true, config: {} });
  const tt = typeOf(f.type);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setCfg = (k, v) => setF(p => ({ ...p, config: { ...p.config, [k]: v } }));
  const ok = f.name.trim().length > 0;
  return (
    <div className="tool-form">
      <div className="bf-2">
        <div className="bf"><label className="bf-label">{tx("toolform.name")}</label>
          <input className="bf-input" value={f.name} onChange={e => set("name", e.target.value)} placeholder={tx("toolform.namePh", { label: tt.label })} /></div>
        <div className="bf"><label className="bf-label">{tx("toolform.type")}</label>
          <Select block value={f.type} onChange={v => set("type", v)}
            options={TOOL_TYPES.map(t => ({ value: t.key, label: `${t.icon} ${t.label}` }))} /></div>
      </div>
      {tt.desc && <div className="tool-type-desc">{tt.desc}</div>}
      <div className="bf-2">
        {tt.fields.map(normField).map(d => (
          <ToolField key={d.k} d={d} value={f.config[d.k]} onChange={v => setCfg(d.k, v)} />
        ))}
      </div>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <Btn kind="ghost" sm onClick={onCancel}>{tx("common.cancel")}</Btn>
        <Btn kind="gold" sm onClick={() => ok && onSave(f)} style={{ opacity: ok ? 1 : .5, pointerEvents: ok ? "auto" : "none" }}>{initial ? tx("toolform.save") : tx("toolform.create")}</Btn>
      </div>
    </div>
  );
}

/* skill definition form — name + its SKILL.md (managed centrally, used by the Agent builder) */
function SkillForm({ initial, onSave, onCancel, t }) {
  const tx = t || ((k) => k);
  const [name, setName] = useState(initial ? initial.name : "");
  const [md, setMd] = useState(initial ? initial.md : "");
  const ok = name.trim().length > 0 && md.trim().length > 0;
  return (
    <div className="tool-form">
      <div className="bf"><label className="bf-label">{tx("tools.skillName")}</label>
        <input className="bf-input" value={name} onChange={e => setName(e.target.value)} placeholder={tx("tools.skillNamePh")} /></div>
      <div className="bf"><label className="bf-label">{tx("tools.skillMd")}</label>
        <label className="md-upload">{tx("bld.skill.upload")}<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={e => { const fl = e.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => setMd(String(rd.result || "")); rd.readAsText(fl); }} /></label>
        <RichBody key={initial ? initial.name : "new"} value={md} onChange={setMd} placeholder={tx("tools.skillMdPh")} minHeight={120} /></div>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <Btn kind="ghost" sm onClick={onCancel}>{tx("common.cancel")}</Btn>
        <Btn kind="gold" sm onClick={() => ok && onSave({ name: name.trim(), md: md.trim() })} style={{ opacity: ok ? 1 : .5, pointerEvents: ok ? "auto" : "none" }}>{initial ? tx("toolform.save") : tx("toolform.create")}</Btn>
      </div>
    </div>
  );
}

/* unified collapsible section card — same look + smooth slide (grid 0fr→1fr) for the whole page.
   onAdd (optional) renders a ＋ action in the header (top-right); clicking it opens the
   section and fires onAdd — so every section's "create" lives in the same spot. */
function ToolSection({ icon, title, kicker, count, onAdd, addTitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen(o => !o);
  return (
    <section className={`tsec ${open ? "open" : ""}`}>
      <div className="tsec-head" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <span className="tsec-ic">{icon}</span>
        <span className="tsec-title">{title}</span>
        <span className="tsec-kicker mono">{kicker}</span>
        <span className="tsec-right" data-no-lex>
          {count != null && <span className="tsec-count mono">{count}</span>}
          {onAdd && <button type="button" className="tsec-add" title={addTitle} aria-label={addTitle}
            onClick={e => { e.stopPropagation(); setOpen(true); onAdd(); }}>＋</button>}
          <span className="tsec-chev">▾</span>
        </span>
      </div>
      <div className="tsec-wrap">
        <div className="tsec-inner"><div className="tsec-body">{children}</div></div>
      </div>
    </section>
  );
}

/* Object-storage status — read-only view of the configured store (MinIO / AWS S3) + a
   Test-connection button. Storage creds are bootstrap config (env only, never edited here); this
   panel only reads `/api/storage/status|test`. Gated on `infra.manage` by the caller. */
function StoragePanel({ t }) {
  const tx = t || ((k) => k);
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState("");

  const pull = async (fn) => { try { setErr(""); setSt(await fn()); } catch (e) { setErr(e.message || tx("storage.err")); } };
  useEffect(() => { (async () => { setLoading(true); await pull(storageStatus); setLoading(false); })(); }, []);
  const test = async () => { setTesting(true); await pull(storageTest); setTesting(false); };

  return (
    <div>
      <div className="sm-set-note mono">{tx("storage.hint")}</div>
      {err && <div className="muted" style={{ color: "var(--danger,#c0392b)", fontSize: 12.5, padding: "6px 2px" }} data-no-lex>{err}</div>}
      {loading ? (
        <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>{tx("storage.loading")}</div>
      ) : st && (
        <div className="tool-list">
          <div className="tool-row">
            <span className="tool-ic">{st.provider === "s3" ? "☁️" : "🗄️"}</span>
            <div className="tool-bd">
              <div className="tool-name">{st.provider === "s3" ? "AWS S3" : "MinIO"}{" "}
                <span className={`chip ${st.reachable ? "on" : ""}`} data-no-lex>{st.reachable ? `● ${tx("storage.reachable")}` : `○ ${tx("storage.unreachable")}`}</span></div>
              <div className="tool-meta mono" data-no-lex>{st.endpoint} · {st.bucket}{st.region ? ` · ${st.region}` : ""}{st.secure ? " · TLS" : ""}</div>
            </div>
            <button type="button" className="chip-act" title={tx("storage.test")} disabled={testing} onClick={test}>↻</button>
          </div>
        </div>
      )}
      <div className="sm-set-note mono" style={{ marginTop: 10 }}>{tx("storage.envNote")}</div>
    </div>
  );
}

export function ToolsManager({ can, t, Sys }) {
  const mayEdit = !can || can("options.manage");
  const mayInfra = !can || can("infra.manage");
  // LLM provider config is permission-split server-side: reading the panel needs `llm.view`,
  // connection writes need `llm.manage`, role bindings need `llm.assign`. The panel loads on
  // mount, so render it only when the user can read — else the list call would 403.
  const mayLlm = !can || can("llm.view");
  const mayLlmManage = !can || can("llm.manage");
  const mayLlmAssign = !can || can("llm.assign");
  const tx = t || ((k) => k);
  const [tools, setTools] = useState(() => loadToolCfgs());
  const [editing, setEditing] = useState(null);     // tool id | "new" | null
  const [positions, setPositions] = useState(() => loadOptions().positions || []);
  const [newPos, setNewPos] = useState("");
  const [posAdding, setPosAdding] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const [skills, setSkills] = useState(() => loadOptions().skills || []);
  const [skillDocs, setSkillDocs] = useState(() => loadSkillDocs());
  const [skillEditing, setSkillEditing] = useState(null);   // skill name | "new" | null

  const commit = (list) => { setTools(saveToolCfgs(list)); };
  const saveTool = (f) => {
    if (editing === "new") commit([{ ...f, id: "t" + Date.now() }, ...tools]);
    else commit(tools.map(t => (t.id === editing ? { ...t, ...f } : t)));
    setEditing(null);
  };
  const delTool = async (t2) => {
    const ok = window.uiConfirm
      ? await window.uiConfirm({ title: tx("tools.delToolTitle"), message: tx("tools.delToolMsg", { name: t2.name }), danger: true, confirmText: tx("tools.delToolTitle") })
      : window.confirm(tx("tools.delToolMsg", { name: t2.name }));
    if (!ok) return;
    removeOption("tools", t2.name);
    commit(tools.filter(x => x.id !== t2.id));
  };
  const toggleTool = (t) => commit(tools.map(x => (x.id === t.id ? { ...x, enabled: x.enabled === false } : x)));

  const saveSkill = ({ name, md }) => {
    const old = (skillEditing && skillEditing !== "new") ? skillEditing : null;
    if (old && old !== name) removeOption("skills", old);
    addOption("skills", name);
    const docs = { ...loadSkillDocs() };
    if (old && old !== name) delete docs[old];
    docs[name] = md;
    setSkillDocs(saveSkillDocs(docs));
    setSkills(loadOptions().skills || []);
    setSkillEditing(null);
  };
  const delSkill = async (name) => {
    const ok = window.uiConfirm
      ? await window.uiConfirm({ title: tx("tools.delSkillTitle"), message: tx("tools.delSkillMsg", { name }), danger: true, confirmText: tx("tools.delSkillTitle") })
      : window.confirm(tx("tools.delSkillMsg", { name }));
    if (!ok) return;
    removeOption("skills", name);
    const docs = { ...loadSkillDocs() }; delete docs[name];
    setSkillDocs(saveSkillDocs(docs));
    setSkills(loadOptions().skills || []);
  };

  const addPos = () => { const v = newPos.trim(); if (!v) return; addOption("positions", v); setPositions(loadOptions().positions); setNewPos(""); };
  const delPos = async (p) => {
    const ok = window.uiConfirm
      ? await window.uiConfirm({ title: tx("tools.delPosTitle"), message: tx("tools.delPosMsg", { name: p }), danger: true, confirmText: tx("tools.delPosTitle") })
      : window.confirm(tx("tools.delPosMsg", { name: p }));
    if (!ok) return;
    removeOption("positions", p); setPositions(loadOptions().positions);
  };

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={tx("tools.kicker")} title={tx("tools.title")} desc={tx("tools.desc")} />
      <HelpNote tag={tx("tools.helpTag")}>{tx("tools.help")}</HelpNote>

      <Modal className="tool-modal" open={editing != null} onClose={() => setEditing(null)}
        title={editing === "new" ? tx("tools.modal.add") : tx("tools.modal.edit")}>
        {editing != null && (
          <ToolForm key={String(editing)} t={t} initial={editing === "new" ? null : tools.find(t2 => t2.id === editing)} onSave={saveTool} onCancel={() => setEditing(null)} />
        )}
      </Modal>

      <Modal className="tool-modal" open={skillEditing != null} onClose={() => setSkillEditing(null)}
        title={skillEditing === "new" ? tx("tools.skillModalAdd") : tx("tools.skillModalEdit")}>
        {skillEditing != null && (
          <SkillForm key={String(skillEditing)} t={t}
            initial={skillEditing === "new" ? null : { name: skillEditing, md: (loadSkillDocs()[skillEditing] || "") }}
            onSave={saveSkill} onCancel={() => setSkillEditing(null)} />
        )}
      </Modal>

      <ToolSection icon="🧰" title={tx("tools.catalog")} kicker="TOOL CATALOG" count={tools.length}
        onAdd={mayEdit ? () => setEditing("new") : undefined} addTitle={tx("tools.addNew")}>
        <div className="tool-search">
          <span className="ts-ic">🔍</span>
          <input value={toolQuery} onChange={e => setToolQuery(e.target.value)} placeholder={tx("tools.search")} data-no-lex />
          {toolQuery && <button type="button" className="ts-clear" onClick={() => setToolQuery("")}>✕</button>}
        </div>
        {(() => {
          const q = toolQuery.trim().toLowerCase();
          const shown = q ? tools.filter(t2 => { const tt = typeOf(t2.type); return (t2.name + " " + tt.label + " " + t2.type).toLowerCase().includes(q); }) : tools;
          if (tools.length === 0) return <Empty icon="🧰" title={tx("tools.empty")} sub={tx("tools.emptySub")} />;
          if (shown.length === 0) return <div className="muted" style={{ fontSize: 13, padding: "14px 4px" }}>{tx("tools.noMatch")}</div>;
          return <div className="tool-list">
              {shown.map(t2 => { const tt = typeOf(t2.type); const off = t2.enabled === false; return (
                <div key={t2.id} className={`tool-row ${off ? "off" : ""}`}>
                  <span className="tool-ic">{tt.icon}</span>
                  <div className="tool-bd">
                    <div className="tool-name">{t2.name}</div>
                    <div className="tool-meta mono">{tt.label}{Object.entries(t2.config || {}).filter(([, v]) => v && typeof v === "string").slice(0, 2).map(([k, v]) => ` · ${k}: ${String(v).length > 26 ? String(v).slice(0, 26) + "…" : v}`).join("")}</div>
                  </div>
                  {mayEdit && <label className="ck-inline" title={off ? tx("tools.disabled") : tx("tools.enabled")} data-no-lex>
                    <input type="checkbox" checked={!off} onChange={() => toggleTool(t2)} />
                  </label>}
                  {mayEdit && <button type="button" className="chip-act" title={tx("tools.edit")} onClick={() => setEditing(t2.id)}>✎</button>}
                  {mayEdit && <button type="button" className="chip-act danger" title={tx("tools.delete")} onClick={() => delTool(t2)}>✕</button>}
                </div>
              ); })}
            </div>;
        })()}
      </ToolSection>

      {mayLlm && (
        <ToolSection icon="🤖" title={tx("llmcfg.title")} kicker="AI MODEL & API">
          <AiApiPanel mayEdit={mayLlmManage} mayAssign={mayLlmAssign} t={t} />
        </ToolSection>
      )}

      {mayInfra && (
        <ToolSection icon="🗄️" title={tx("storage.title")} kicker="STORAGE">
          <StoragePanel t={t} />
        </ToolSection>
      )}

      {mayEdit && Sys && (
        <ToolSection icon="☰" title={tx("nav.navmgr")} kicker="MENU ORDER">
          <NavManagerPanel Sys={Sys} t={t} />
        </ToolSection>
      )}

      <ToolSection icon="🎖️" title={tx("tools.positions")} kicker="POSITION OPTIONS" count={positions.length}
        onAdd={mayEdit ? () => setPosAdding(true) : undefined} addTitle={tx("tools.addBtn")}>
        <div className="opt-chips" style={{ marginBottom: posAdding ? 10 : 0 }}>
          {positions.map(p => (
            <span key={p} className="opt-chip manage">{p}
              {mayEdit && <button type="button" className="chip-act danger" title={tx("tools.delPosTitle")} onClick={() => delPos(p)}>✕</button>}
            </span>
          ))}
          {positions.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{tx("tools.noPositions")}</span>}
        </div>
        {mayEdit && posAdding && (
          <div className="opt-add-row" style={{ maxWidth: 360 }}>
            <input className="bf-input" autoFocus placeholder={tx("tools.addPosPh")} value={newPos} onChange={e => setNewPos(e.target.value)} onKeyDown={e => e.key === "Enter" && addPos()} />
            <Btn kind="ghost" sm onClick={addPos}>{tx("tools.addBtn")}</Btn>
            <button type="button" className="opt-cancel" onClick={() => { setPosAdding(false); setNewPos(""); }}>✕</button>
          </div>
        )}
      </ToolSection>

      <ToolSection icon="🧠" title={tx("tools.skills")} kicker="SKILL OPTIONS" count={skills.length}
        onAdd={mayEdit ? () => setSkillEditing("new") : undefined} addTitle={tx("tools.addSkill")}>
        <div className="opt-chips">
          {skills.map(s => (
            <span key={s} className="opt-chip manage">{s}{skillDocs[s] ? " 📄" : ""}
              {mayEdit && <button type="button" className="chip-act" title={tx("tools.edit")} onClick={() => setSkillEditing(s)}>✎</button>}
              {mayEdit && <button type="button" className="chip-act danger" title={tx("tools.delSkillTitle")} onClick={() => delSkill(s)}>✕</button>}
            </span>
          ))}
          {skills.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{tx("tools.noSkills")}</span>}
        </div>
      </ToolSection>
    </div>
  );
}

Object.assign(window, { ToolsManager });
