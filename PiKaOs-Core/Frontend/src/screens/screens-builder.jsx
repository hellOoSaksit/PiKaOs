/* PiKaOs — ES module (migrated from PiKaOs-Core/screens-builder.jsx). */
import React from 'react';
const { useState, useRef } = React;
import { addCharacter, addOption, addProfile, loadCharacters, loadCoreRules, loadOptions, loadProfiles, loadSkillDocs, processCharacterSheets, profileNameExists, removeCharacter, removeOption, removeProfile, saveCoreRules } from '../lib/characters.jsx';
import { Btn, StatusBadge } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';
import { idx } from '../lib/room-store.jsx';
import { Workflows } from './screens-workflows.jsx';
import { CharacterSprite } from '../components/CharacterSprite.jsx';
import { DOC_SEED, DocEditor, RichBody } from '../components/doc-editor.jsx';
import { CLASS_OPTS, COLOR_OPTS } from '../lib/sprites.jsx';
import { MODEL_OPTS, STATUS_OPTS, makeCharacter } from '../lib/store.jsx';

/* ============================================================
   CHARACTER BUILDER — create / edit an adventurer (AI agent)
   Fields: name, position, role, description, class, color, rank,
           model, skills, tools, rules, goal, status  + live preview
   ============================================================ */

/* i18n: bound once from CharacterBuilder's `t` prop on render. The builder is a
   single-instance modal, so a module-level binding is safe and avoids drilling
   `t` through every sub-component. Falls back to returning the key. */
let _bt = (k) => k;
const bt = (k, v) => _bt(k, v);

function Field({ label, hint, children }) {
  return (
    <div className="bf">
      <label className="bf-label">{label}{hint && <span className="bf-hint">{hint}</span>}</label>
      {children}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  // accepts both {key,label} (app) and {value,label}/string (kit) option shapes
  const norm = options.map(o => (typeof o === "string" ? { key: o, label: o } : { key: o.key ?? o.value, label: o.label }));
  return (
    <div className="seg">
      {norm.map(o => (
        <button key={o.key} type="button" className={`seg-btn ${value === o.key ? "on" : ""}`} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({ tags, onChange, suggest = [], placeholder }) {
  const [draft, setDraft] = useState("");
  const add = (t) => { t = t.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setDraft(""); };
  const remaining = suggest.filter(s => !tags.includes(s)).slice(0, 6);
  return (
    <div className="taginput">
      <div className="tag-chips">
        {tags.map(t => (
          <span key={t} className="tag-chip">{t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))}>✕</button></span>
        ))}
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1)); }}
          placeholder={tags.length ? "" : placeholder} />
      </div>
      {remaining.length > 0 && (
        <div className="tag-suggest">
          {remaining.map(s => <button key={s} type="button" className="tag-sg" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}

function RuleList({ rules, onChange }) {
  const set = (i, v) => onChange(rules.map((r, idx) => idx === i ? v : r));
  const remove = (i) => onChange(rules.filter((_, idx) => idx !== i));
  return (
    <div className="rulelist">
      {rules.map((r, i) => (
        <div key={i} className="rule-row">
          <span className="rule-num">{i + 1}</span>
          <input value={r} onChange={e => set(i, e.target.value)} placeholder={bt("bld.rule.ph")} />
          <button type="button" className="rule-del" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <button type="button" className="rule-add" onClick={() => onChange([...rules, ""])}>{bt("bld.rule.add")}</button>
    </div>
  );
}

function ClassPicker({ value, onChange, locked }) {
  return (
    <div className={`class-pick ${locked ? "is-locked" : ""}`}>
      {CLASS_OPTS.map(o => (
        <button key={o.key} type="button" disabled={locked} className={`class-opt ${value === o.key ? "on" : ""}`} onClick={() => !locked && onChange(o.key)}>
          <CharacterSprite charId="ceo" seed={"class-" + o.key} walking={false} h={44} style={{ position: "static" }} />
          <span className="class-th">{o.th}</span>
          <span className="class-en mono">{o.en}</span>
        </button>
      ))}
    </div>
  );
}

/* ---- character card gallery (image sprite sets) ---- */
function CharacterGallery({ value, onChange, canPick, canAdd }) {
  const [cards, setCards] = useState(() => loadCharacters());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [idleF, setIdleF] = useState(null); const [walkF, setWalkF] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const doAdd = async () => {
    if (!idleF) { setErr(bt("bld.gal.errIdle")); return; }
    setBusy(true); setErr("");
    try {
      const res = await processCharacterSheets(idleF, walkF);
      const id = addCharacter({ name: name.trim() || bt("bld.gal.newChar"), ...res });
      setCards(loadCharacters()); onChange(id);
      setAdding(false); setName(""); setIdleF(null); setWalkF(null);
    } catch (e) { setErr(bt("bld.gal.errProcess")); }
    setBusy(false);
  };
  const del = async (id, e) => { e.stopPropagation(); if (id === "ceo") return; if (await uiConfirm({ title: bt("bld.gal.delTitle"), message: bt("bld.gal.delMsg"), danger: true })) { removeCharacter(id); setCards(loadCharacters()); if (value === id) onChange("ceo"); } };
  return (
    <div className={`char-gallery ${!canPick ? "is-locked" : ""}`}>
      {cards.map(c => (
        <button key={c.id} type="button" disabled={!canPick} className={`char-card ${value === c.id ? "on" : ""}`} onClick={() => canPick && onChange(c.id)}>
          <span className="char-card-art"><CharacterSprite charId={c.id} walking={false} h={58} style={{ position: "static" }} /></span>
          <span className="char-card-name">{c.name}</span>
          {canAdd && !c.builtin && <span className="char-card-del" onClick={(e) => del(c.id, e)}>🗑</span>}
        </button>
      ))}
      {canAdd && !adding && (
        <button type="button" className="char-card char-card-add" onClick={() => setAdding(true)}>
          <span className="cc-plus">＋</span><span className="char-card-name">{bt("bld.gal.add")}</span>
        </button>
      )}
      {canAdd && adding && (
        <div className="char-add-panel">
          <input className="bf-input" placeholder={bt("bld.gal.namePh")} value={name} onChange={e => setName(e.target.value)} />
          <label className="char-file">{bt("bld.gal.idle")}<input type="file" accept="image/*" onChange={e => setIdleF(e.target.files[0] || null)} /></label>
          <label className="char-file">{bt("bld.gal.walk")}<input type="file" accept="image/*" onChange={e => setWalkF(e.target.files[0] || null)} /></label>
          <div className="mono faint" style={{ fontSize: 10.5 }}>{bt("bld.gal.hint")}</div>
          {err && <div className="char-err">{err}</div>}
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" sm onClick={() => { setAdding(false); setErr(""); }}>{bt("common.cancel")}</Btn>
            <Btn kind="gold" sm onClick={doAdd} style={{ opacity: busy ? .6 : 1, pointerEvents: busy ? "none" : "auto" }}>{busy ? bt("bld.gal.processing") : bt("bld.gal.add")}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- managed single-select with gated “+ add” ---- */
function OptionSelect({ kind, value, onChange, canAdd, placeholder, locked }) {
  const [opts, setOpts] = useState(() => (loadOptions()[kind] || []));
  const [adding, setAdding] = useState(false); const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (!t) return; const o = addOption(kind, t); setOpts(o[kind]); onChange(t); setV(""); setAdding(false); };
  return (
    <div className="opt-select">
      <Select block disabled={locked} value={opts.includes(value) ? value : ""} placeholder={placeholder || bt("bld.select.placeholder")}
        onChange={val => onChange(val)}
        options={[{ value: "", label: placeholder || bt("bld.select.placeholder") }, ...opts.map(o => ({ value: o, label: o }))]} />
      {!locked && canAdd && (adding
        ? <div className="opt-add-row"><input className="bf-input" autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={bt("bld.opt.newName")} /><Btn kind="gold" sm onClick={add}>{bt("common.add")}</Btn><button type="button" className="opt-cancel" onClick={() => setAdding(false)}>✕</button></div>
        : <button type="button" className="opt-add-btn" onClick={() => setAdding(true)}>{bt("bld.opt.addNew")}</button>)}
    </div>
  );
}

/* ---- managed multi-select chips with gated “+ add” ---- */
function OptionMulti({ kind, values, onChange, canAdd }) {
  const [opts, setOpts] = useState(() => (loadOptions()[kind] || []));
  const [adding, setAdding] = useState(false); const [v, setV] = useState("");
  const toggle = (o) => onChange(values.includes(o) ? values.filter(x => x !== o) : [...values, o]);
  const add = () => { const t = v.trim(); if (!t) return; const o = addOption(kind, t); setOpts(o[kind]); if (!values.includes(t)) onChange([...values, t]); setV(""); setAdding(false); };
  return (
    <div className="opt-multi">
      <div className="opt-chips">
        {opts.map(o => <button type="button" key={o} className={`opt-chip ${values.includes(o) ? "on" : ""}`} onClick={() => toggle(o)}>{o}</button>)}
        {opts.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{bt("bld.opt.none")}</span>}
      </div>
      {canAdd && (adding
        ? <div className="opt-add-row"><input className="bf-input" autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={bt("bld.opt.newName")} /><Btn kind="gold" sm onClick={add}>{bt("common.add")}</Btn><button type="button" className="opt-cancel" onClick={() => setAdding(false)}>✕</button></div>
        : <button type="button" className="opt-add-btn" onClick={() => setAdding(true)}>{bt("bld.opt.addNew")}</button>)}
    </div>
  );
}

/* ---- skill picker: SELECT-only. Skills (and their SKILL.md) are defined
   centrally in the Tools Manager — this field just toggles which ones apply. ---- */
function SkillField({ skills, docs, onChange, canManage }) {
  const opts = loadOptions().skills || [];
  const gdocs = loadSkillDocs();                 // global SKILL.md per skill name
  const [viewing, setViewing] = useState(null);
  const toggle = (o) => onChange(skills.includes(o) ? skills.filter(x => x !== o) : [...skills, o], docs);
  return (
    <div className="opt-multi">
      <div className="opt-chips">
        {opts.map(o => (
          <button type="button" key={o} className={`opt-chip ${skills.includes(o) ? "on" : ""}`}
            onClick={() => toggle(o)} onDoubleClick={() => setViewing(viewing === o ? null : o)}
            title={gdocs[o] ? bt("bld.skill.hasMd") : ""}>{o}{gdocs[o] ? " 📄" : ""}</button>
        ))}
        {opts.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{bt("bld.skill.none")}</span>}
      </div>
      {viewing && gdocs[viewing] && <pre className="skill-md">{`# ${viewing}\n` + gdocs[viewing]}</pre>}
      {canManage && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
          onClick={() => window.__guildGo && window.__guildGo("toolsmgr")}>{bt("bld.f.skillManage")}</button>
      )}
    </div>
  );
}

/* ---- CORE rules (mandatory, shared, precedence over agent rules) ---- */
function CoreRules({ canEdit }) {
  const [rules, setRules] = useState(() => loadCoreRules());
  const [adding, setAdding] = useState(false); const [v, setV] = useState("");
  const commit = (nx) => { setRules(nx); saveCoreRules(nx); };
  const add = () => { const t = v.trim(); if (!t) return; commit([...rules, t]); setV(""); setAdding(false); };
  return (
    <div className="core-rules">
      <div className="core-note mono">{bt("bld.core.note")}</div>
      {rules.map((r, i) => (
        <div key={i} className="core-rule">
          <span className="core-badge">{bt("bld.core.badge")}</span>
          {canEdit
            ? <input className="bf-input core-input" value={r} onChange={e => commit(rules.map((x, idx) => idx === i ? e.target.value : x))} />
            : <span className="core-text">{r}</span>}
          {canEdit && <button type="button" className="rule-del" onClick={() => commit(rules.filter((_, idx) => idx !== i))}>✕</button>}
        </div>
      ))}
      {canEdit ? (adding
        ? <div className="opt-add-row"><input className="bf-input" autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={bt("bld.core.newPh")} /><Btn kind="gold" sm onClick={add}>{bt("common.add")}</Btn><button type="button" className="opt-cancel" onClick={() => setAdding(false)}>✕</button></div>
        : <button type="button" className="opt-add-btn" onClick={() => setAdding(true)}>{bt("bld.core.add")}</button>)
        : <div className="mono faint" style={{ fontSize: 10.5 }}>{bt("bld.core.locked")}</div>}
    </div>
  );
}

/* ---- per-agent .md files (open / download / add) ---- */
function _htmlToMd(html) {
  const el = document.createElement("div"); el.innerHTML = html || "";
  const out = [];
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
    const tag = (n.tagName || "").toLowerCase(); const txt = (n.textContent || "").trim();
    if (tag === "h1") out.push("# " + txt); else if (tag === "h2") out.push("## " + txt); else if (tag === "h3") out.push("### " + txt);
    else if (tag === "ul" || tag === "ol") { n.querySelectorAll("li").forEach(li => out.push("- " + li.textContent.trim())); }
    else if (tag === "pre") out.push("```\n" + txt + "\n```");
    else if (txt) out.push(txt);
  });
  return out.join("\n\n") + "\n";
}
function _downloadMd(name, html) {
  const blob = new Blob([_htmlToMd(html)], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function AgentDocs({ owner, profileDocs, onOpen, canEdit }) {
  const base = ["SKILL.md", "TOOLS.md", "EXAMPLES.md", "REFERENCE.md"];
  const fkey = "guildos.docfiles." + owner;
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem(fkey) || "[]"); } catch (e) { return []; } });
  const files = [...base, ...extra];
  const seedOf = (f) => (profileDocs && profileDocs[f]) || (typeof DOC_SEED !== "undefined" && DOC_SEED[f]) || "";
  const contentOf = (f) => { try { const s = localStorage.getItem("guildos.doc.agent:" + owner + ":" + f); if (s != null) return s; } catch (e) { } return seedOf(f); };
  const addFile = async () => {
    let nm = await uiPrompt({ title: bt("bld.doc.addTitle"), placeholder: bt("bld.doc.addPh") }); if (!nm) return;
    nm = String(nm).trim(); if (!/\.md$/i.test(nm)) nm += ".md"; if (files.includes(nm)) return;
    const nx = [...extra, nm]; setExtra(nx); try { localStorage.setItem(fkey, JSON.stringify(nx)); } catch (e) { }
  };
  return (
    <div className="agent-docs">
      {files.map(f => (
        <div key={f} className="adoc-row">
          <span className="adoc-name mono">📄 {f}</span>
          <button type="button" className="adoc-btn" onClick={() => onOpen({ id: "agent:" + owner + ":" + f, title: f + bt("bld.doc.suffix"), seed: contentOf(f) })}>{bt("bld.doc.open")}</button>
          <button type="button" className="adoc-btn" onClick={() => _downloadMd(f, contentOf(f))}>⬇ .md</button>
        </div>
      ))}
      {canEdit && <button type="button" className="opt-add-btn" onClick={addFile}>{bt("bld.doc.add")}</button>}
    </div>
  );
}

function CharacterBuilder({ initial, onSave, onClose, can, archived, onRestore, t }) {
  _bt = (typeof t === "function") ? t : ((k) => k);
  const edit = !!(initial && initial.id);
  const canRules = !can || can("rules.manage");
  const canAppearance = !can || can("agent.appearance");
  const canOptions = !can || can("options.manage");
  const canChar = !can || can("character.manage");
  const canConfig = !can || can("agent.config");
  const canProfile = !can || can("profile.manage");
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [profileDocs, setProfileDocs] = useState(null);
  const [activeProfile, setActiveProfile] = useState("");
  const docOwnerRef = useRef(initial && initial.id ? initial.id : "draft" + Date.now().toString(36));
  const [doc, setDoc] = useState(null);
  const [f, setF] = useState(() => ({
    name: "", position: "", role: "", desc: "", goal: "",
    roleKey: "analyst", color: COLOR_OPTS[7], rank: "C", model: MODEL_OPTS[1], characterId: "ceo",
    status: "idle", skills: [], tools: [], rules: [""], apiKeyId: null, skillDocs: {},
    ...(initial || {}),
  }));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const lockedAgent = !!(initial && initial.locked);
  const resetCeo = async () => { if (!(await uiConfirm({ title: bt("bld.ceo.resetTitle"), message: bt("bld.ceo.resetMsg"), danger: true }))) return; setF(prev => ({ ...prev, ...(window.CEO_DEFAULTS || {}) })); setProfileDocs(null); setActiveProfile(""); };
  const applyProfile = (id) => { if (lockedAgent) { try { window.uiAlert({ title: bt("bld.lock.title"), message: bt("bld.lock.msg") }); } catch (e) { } return; } setActiveProfile(id); const p = profiles.find(x => x.id === id); if (!p) { setProfileDocs(null); return; } setF(prev => ({ ...prev, ...p.settings })); setProfileDocs(p.docs || null); };
  const delActiveProfile = async () => {
    const p = profiles.find(x => x.id === activeProfile); if (!p) return;
    if (await uiConfirm({ title: bt("bld.profile.delTitle"), message: bt("bld.profile.delMsg", { name: p.name }), danger: true })) { removeProfile(p.id); setProfiles(loadProfiles()); setActiveProfile(""); setProfileDocs(null); }
  };
  const saveAsProfile = async () => {
    const nm0 = await uiPrompt({ title: bt("bld.profile.saveTitle"), placeholder: bt("bld.profile.savePh") });
    if (!nm0) return; const nm = String(nm0).trim(); if (!nm) return;
    if (profileNameExists(nm)) {
      const ok = await uiConfirm({ title: bt("bld.profile.overTitle"), message: bt("bld.profile.overMsg", { name: nm }), danger: true, confirmText2: bt("bld.profile.overConfirm") });
      if (!ok) return;
      const ex = loadProfiles().find(p => !p.seed && p.name.trim() === nm); if (ex) removeProfile(ex.id);
    }
    const s = { characterId: f.characterId, position: f.position, role: f.role, model: f.model, apiKeyId: f.apiKeyId, skills: f.skills, tools: f.tools, workflows: f.workflows, rules: f.rules, skillDocs: f.skillDocs, color: f.color, roleKey: f.roleKey, status: f.status, goal: f.goal, desc: f.desc };
    addProfile({ name: nm, settings: s, docs: {} }); setProfiles(loadProfiles());
  };
  const preview = makeCharacter({ ...f, rules: (f.rules || []).filter(Boolean) });
  const canSave = f.name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    const clean = { ...f, name: f.name.trim(), rules: (f.rules || []).map(r => r.trim()).filter(Boolean) };
    const made = edit ? { ...initial, ...makeCharacter({ ...clean, id: initial.id, pos: initial.pos }) } : makeCharacter(clean);
    if (profileDocs) { try { Object.entries(profileDocs).forEach(([file, html]) => localStorage.setItem("guildos.doc.agent:" + made.id + ":" + file, html)); } catch (e) { } }
    if (made.id !== docOwnerRef.current) {
      try {
        const extra = JSON.parse(localStorage.getItem("guildos.docfiles." + docOwnerRef.current) || "[]");
        ["SKILL.md", "TOOLS.md", "EXAMPLES.md", "REFERENCE.md", ...extra].forEach(file => {
          const k = "guildos.doc.agent:" + docOwnerRef.current + ":" + file; const v = localStorage.getItem(k);
          if (v != null) { localStorage.setItem("guildos.doc.agent:" + made.id + ":" + file, v); localStorage.removeItem(k); }
        });
        if (extra.length) { localStorage.setItem("guildos.docfiles." + made.id, JSON.stringify(extra)); localStorage.removeItem("guildos.docfiles." + docOwnerRef.current); }
      } catch (e) { }
    }
    onSave(made);
  };

  return (
    <div className="drawer-overlay" onClick={onClose} style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div className="builder ornate" onClick={e => e.stopPropagation()}>
        <div className="builder-head">
          <span className="ph-icon" style={{ fontSize: 18 }}>⚔️</span>
          <div>
            <div className="kicker">{edit ? bt("bld.editKicker") : bt("bld.newKicker")}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "2px 0 0", color: "var(--ink)" }}>
              {edit ? bt("bld.editTitle") : bt("bld.newTitle")}
            </h2>
          </div>
          <button className="drawer-close" onClick={onClose} style={{ marginLeft: "auto" }}>✕</button>
        </div>

        <div className="builder-body">
          {/* ---- form ---- */}
          <div className="builder-form">
            <div className="profile-pick">
              <span className="bf-label">{bt("bld.profile.label")}<span className="bf-hint">{lockedAgent ? bt("bld.profile.lockedHint") : bt("bld.profile.hint")}</span></span>
              {lockedAgent ? <><div className="appearance-lock mono">{bt("bld.profile.lockedNote")}</div><Btn kind="gold" sm icon="⟲" onClick={resetCeo} style={{ marginTop: 8, alignSelf: "flex-start" }}>{bt("bld.ceo.reset")}</Btn></> : <>
              <div className="profile-cards">
                <button type="button" className={`profile-card ${!activeProfile ? "on" : ""}`} onClick={() => { setActiveProfile(""); setProfileDocs(null); }}>
                  <span className="pc-blank">∅</span><span className="pc-name">{bt("bld.profile.blank")}</span>
                </button>
                {profiles.map(p => (
                  <button type="button" key={p.id} className={`profile-card ${activeProfile === p.id ? "on" : ""}`} onClick={() => applyProfile(p.id)}>
                    <span className="pc-art"><CharacterSprite charId={(p.settings && p.settings.characterId) || "ceo"} walking={false} h={44} style={{ position: "static" }} /></span>
                    <span className="pc-name">{p.name}</span>
                    <span className="pc-role mono">{(p.settings && p.settings.role) || ""}</span>
                    {canProfile && <span className="pc-del" title={bt("bld.profile.del")} onClick={async e => { e.stopPropagation(); if (await uiConfirm({ title: bt("bld.profile.delTitle"), message: bt("bld.profile.delMsg", { name: p.name }), danger: true })) { removeProfile(p.id); setProfiles(loadProfiles()); if (activeProfile === p.id) { setActiveProfile(""); setProfileDocs(null); } } }}>🗑</span>}
                  </button>
                ))}
              </div>
              {canProfile && <Btn kind="gold" sm icon="💾" onClick={saveAsProfile}>{bt("bld.profile.save")}</Btn>}
              {canProfile && activeProfile && <Btn kind="ghost" sm icon="🗑" onClick={delActiveProfile} style={{ color: "var(--crimson)", borderColor: "color-mix(in srgb,var(--crimson) 40%,transparent)" }}>{bt("bld.profile.del")}</Btn>}
              </>}
            </div>
            <Field label={bt("bld.f.char")} hint={canAppearance ? bt("bld.f.charHint") : bt("bld.f.charLocked")}>
              <CharacterGallery value={f.characterId} onChange={v => set("characterId", v)} canPick={canAppearance} canAdd={canChar} />
              {!canAppearance && <div className="appearance-lock mono">{bt("bld.f.charLockedNote")}</div>}
            </Field>

            <div className="bf-2">
              <Field label={bt("bld.f.name")}><input className="bf-input" value={f.name} onChange={e => set("name", e.target.value)} placeholder={bt("bld.f.namePh")} /></Field>
              <Field label={bt("bld.f.position")} hint={canConfig ? bt("bld.f.positionHint") : bt("bld.f.permOnly")}><OptionSelect kind="positions" value={f.position} onChange={v => set("position", v)} canAdd={false} locked={!canConfig} placeholder={bt("bld.f.positionPlaceholder")} /></Field>
            </div>

            <Field label={bt("bld.f.role")} hint={canConfig ? bt("bld.f.roleHint") : bt("bld.f.permOnly")}>
              <input className="bf-input" value={f.role} disabled={!canConfig} onChange={e => set("role", e.target.value)} placeholder={bt("bld.f.rolePh")} />
            </Field>

            <Field label={bt("bld.f.model")} hint={!canConfig ? bt("bld.f.permOnly") : null}>
              <Select block value={f.model} disabled={!canConfig} onChange={v => set("model", v)}
                options={MODEL_OPTS.map(m => ({ value: m, label: m }))} />
            </Field>

            <Field label={bt("bld.f.desc")} hint={bt("bld.f.descHint")}>
              <textarea className="bf-input" rows={2} value={f.desc} onChange={e => set("desc", e.target.value)} placeholder={bt("bld.f.descPh")} />
            </Field>

            <Field label={bt("bld.f.goal")} hint={bt("bld.f.goalHint")}>
              <textarea className="bf-input" rows={2} value={f.goal} onChange={e => set("goal", e.target.value)} placeholder={bt("bld.f.goalPh")} />
            </Field>

            <Field label={bt("bld.f.skill")} hint={bt("bld.f.skillHint")}><SkillField skills={f.skills} docs={f.skillDocs || {}} onChange={(sk, docs) => setF(p => ({ ...p, skills: sk, skillDocs: docs }))} canManage={canOptions} /></Field>

            <Field label={bt("bld.f.tools")} hint={bt("bld.f.toolsHint")}>
              <OptionMulti kind="tools" values={f.tools} onChange={v => set("tools", v)} canAdd={false} />
              {canOptions && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                  onClick={() => window.__guildGo && window.__guildGo("toolsmgr")}>{bt("bld.f.toolsManage")}</button>
              )}
            </Field>

            <Field label={bt("bld.f.wf")} hint={bt("bld.f.wfHint")}>
              <div className="wf-pick">
                {(window.__workflows || []).map(w => {
                  const on = (f.workflows || []).includes(w.id);
                  return (
                    <button key={w.id} type="button" className={`wf-pick-opt ${on ? "on" : ""}`}
                      onClick={() => set("workflows", on ? f.workflows.filter(x => x !== w.id) : [...(f.workflows || []), w.id])}>
                      <span style={{ fontSize: 15 }}>{w.icon}</span>
                      <span style={{ flex: 1, textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                      {on && <span style={{ color: "var(--gold-bright)" }}>✓</span>}
                    </button>
                  );
                })}
                {(!window.__workflows || window.__workflows.length === 0) && <div className="muted" style={{ fontSize: 12 }}>{bt("bld.f.wfNone")}</div>}
              </div>
            </Field>

            <Field label={bt("bld.f.docs")} hint={bt("bld.f.docsHint")}>
              <AgentDocs owner={docOwnerRef.current} profileDocs={profileDocs} onOpen={setDoc} canEdit={true} />
            </Field>

            <Field label={bt("bld.f.core")} hint={bt("bld.f.coreHint")}><CoreRules canEdit={canRules} /></Field>

            <Field label={bt("bld.f.rules")} hint={bt("bld.f.rulesHint")}><RuleList rules={f.rules} onChange={v => set("rules", v)} /></Field>

            <Field label={bt("bld.f.status")} hint={bt("bld.f.statusHint")}>
              <div className="bf-input" style={{ display: "flex", alignItems: "center", gap: 9, opacity: .9 }} data-no-lex>
                <StatusBadge s="idle" />
                <span className="mono muted" style={{ fontSize: 11.5 }}>{bt("bld.f.statusNote")}</span>
              </div>
            </Field>
          </div>

          {/* ---- live preview ---- */}
          <div className="builder-preview">
            <div className="kicker" style={{ marginBottom: 12 }}>{bt("bld.preview.title")}</div>
            <div className="preview-card">
              <div className="preview-portrait">
                <CharacterSprite charId={f.characterId} walking={false} h={96} style={{ position: "static" }} />
              </div>
              <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 10 }}>
                <span className="thai-serif" style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{f.name || bt("bld.preview.noName")}</span>
              </div>
              <div className="mono muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 3 }}>{f.position || bt("bld.preview.agent")}</div>
              <div style={{ textAlign: "center", marginTop: 8 }}><StatusBadge s={f.status} /></div>
              {f.role && <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>{f.role}</div>}
              {f.skills.length > 0 && (
                <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
                  {f.skills.slice(0, 5).map(s => <span key={s} className="tag">{s}</span>)}
                </div>
              )}
              <div className="divider" style={{ margin: "14px 0" }}><span className="gem" /></div>
              <div className="row" style={{ justifyContent: "space-around", fontSize: 11 }}>
                <div style={{ textAlign: "center" }}><div className="mono gold-text" style={{ fontSize: 15, fontWeight: 700 }}>{(f.rules||[]).filter(Boolean).length}</div><div className="faint">{bt("bld.preview.rules")}</div></div>
                <div style={{ textAlign: "center" }}><div className="mono gold-text" style={{ fontSize: 15, fontWeight: 700 }}>{f.tools.length}</div><div className="faint">{bt("bld.preview.tools")}</div></div>
                <div style={{ textAlign: "center" }}><div className="mono gold-text" style={{ fontSize: 15, fontWeight: 700 }}>Lv.{preview.level}</div><div className="faint">{bt("bld.preview.level")}</div></div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>{bt("bld.preview.note")}</div>
          </div>
        </div>

        {doc && <DocEditor docId={doc.id} title={doc.title} seed={doc.seed} onClose={() => setDoc(null)} />}
        <div className="builder-foot">
          <Btn kind="ghost" onClick={onClose}>{bt("common.cancel")}</Btn>
          <Btn kind="gold" icon={edit ? "✓" : "⚔️"} onClick={submit} style={{ opacity: canSave ? 1 : .5, pointerEvents: canSave ? "auto" : "none" }}>
            {edit ? bt("bld.saveEdit") : bt("bld.create")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CharacterBuilder, Field, Segmented, TagInput, RuleList, ClassPicker });

export {
  AgentDocs,
  CharacterBuilder,
  CharacterGallery,
  ClassPicker,
  CoreRules,
  Field,
  OptionMulti,
  OptionSelect,
  RuleList,
  Segmented,
  SkillField,
  TagInput,
  _downloadMd,
  _htmlToMd
};
