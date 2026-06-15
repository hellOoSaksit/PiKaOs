/* PiKaOs — Component Library (in-app design system).
   แสดงคอมโพเนนต์ "ตัวจริง" จากชุดที่ให้มา (src/components/ui — ported จากไฟล์อ้างอิง)
   แบบ native ทั้งหมด — ไม่มี iframe. ของที่สร้างเพิ่มแยกอยู่ท้ายหน้าเป็น "ส่วนเสริม".
   ข้อความทุกชิ้น i18n ผ่าน t("lib.*") — เพิ่ม/แก้คีย์ใน data/i18n/<lang>-formal.json. */
import React from 'react';
const { useState } = React;
import { Btn, PageHead } from '../components/components.jsx';
import KitButton from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import Checkbox from '../components/ui/Checkbox.jsx';
import Switch from '../components/ui/Switch.jsx';
import Badge from '../components/ui/Badge.jsx';
import Tooltip from '../components/ui/Tooltip.jsx';
import Progress from '../components/ui/Progress.jsx';
import Modal from '../components/ui/Modal.jsx';
import { ToastProvider, useToast } from '../components/ui/Toast.jsx';
import StatusPopup from '../components/ui/StatusPopup.jsx';
import { Select, Menu, MultiSelect } from '../components/ui/Dropdown.jsx';
import Tags from '../components/ui/Tags.jsx';
import TextFormatToolbar from '../components/ui/TextFormatToolbar.jsx';
import Highlight from '../components/ui/Highlight.jsx';
import DatePicker from '../components/ui/DatePicker.jsx';
import SoftDeleteRow from '../components/ui/SoftDeleteRow.jsx';
import Todo from '../components/ui/Todo.jsx';
import Search from '../components/ui/Search.jsx';
import Filter from '../components/ui/Filter.jsx';
import LoadingPopup from '../components/ui/LoadingPopup.jsx';
import Notifications from '../components/ui/Notifications.jsx';
import Letters3D from '../components/ui/Letters3D.jsx';
import SaveBar from '../components/ui/SaveBar.jsx';
import { RichBody } from './screens-world.jsx';

function copyText(text, done) {
  try { navigator.clipboard.writeText(text).then(done, done); } catch (e) { done && done(); }
}

const Sec = ({ title, en, spec, isNew, newLabel, comp, code, tx, children }) => {
  const T = (typeof tx === "function") ? tx : ((k) => k);
  const [open, setOpen] = useState(false);
  const [cpRef, setCpRef] = useState(false);
  const [cpCode, setCpCode] = useState(false);
  const flash = (set) => { set(true); setTimeout(() => set(false), 1300); };
  return (
    <section className="lib-sec" data-screen-label={title}>
      <div className="lib-sec-head">
        <h2>{title}{isNew && <span className="lib-new">{newLabel}</span>}</h2>
        <span className="lib-sec-en mono">{en}</span>
      </div>
      {comp && (
        <button className={`lib-comp ${cpRef ? "copied" : ""}`} title={T("lib.copyName")}
          onClick={() => copyText(comp, () => flash(setCpRef))}>
          <span className="lib-comp-tag">{T("lib.aiName")}</span>
          <span className="lib-comp-ref">{comp}</span>
          <span className="lib-comp-cp">{cpRef ? "✓" : "⧉"}</span>
        </button>
      )}
      <div className="lib-stage">{children}</div>
      {spec && <div className="lib-spec mono">{spec}</div>}
      {code && (
        <div className="lib-code">
          <button className={`lib-code-toggle ${open ? "on" : ""}`} onClick={() => setOpen(o => !o)}>
            <span className="lib-code-caret">▸</span> {open ? T("lib.code.hide") : T("lib.code.view")}
          </button>
          <div className={`lib-code-wrap ${open ? "open" : ""}`}>
            <div className="lib-code-inner">
              <pre className="lib-code-pre"><code>{code}</code></pre>
              <button className={`lib-code-copy ${cpCode ? "copied" : ""}`}
                onClick={() => copyText(code, () => flash(setCpCode))}>{cpCode ? T("lib.copied") : T("lib.copy")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* canonical AI-reference name + usage snippet per component (code = literal, language-neutral) */
const SNIP = {
  type: { comp: "ui/Letters3D · <Letters3D>", code: `import Letters3D from 'components/ui/Letters3D'\n\n<Letters3D word="PiKaOs" style={{ fontSize: 56 }} />` },
  buttons: { comp: "ui/Button · <Button kind size icon disabled>", code: `import Button from 'components/ui/Button'\n\n<Button kind="gold">Save</Button>\n<Button kind="ghost" size="sm">Small</Button>\n<Button kind="danger" disabled>Delete</Button>\n// kind: gold | ghost | danger` },
  dropdown: { comp: "ui/Dropdown · <Select> / <Menu> / <MultiSelect>", code: `import { Select, Menu, MultiSelect } from 'components/ui/Dropdown'\n\n<Select value={v} onChange={setV}\n  options={[{ value:'a', label:'A' }, { value:'b', label:'B' }]} />\n\n<Menu label="Actions" items={[{ label:'Edit', onSelect:fn },\n  { label:'Delete', danger:true, onSelect:fn }]} />\n\n<MultiSelect label="Dept" options={opts} values={vals} onChange={setVals} />` },
  inputs: { comp: "class .bf-input  (error: .lf.has-error)", code: `<input className="bf-input" placeholder="…" />\n\n<div className="lf has-error">\n  <input className="lf-input" />\n  <span className="lf-error">Please check this field</span>\n</div>` },
  fc: { comp: "ui/Checkbox · ui/Switch · class .seg", code: `import Checkbox from 'components/ui/Checkbox'\nimport Switch from 'components/ui/Switch'\n\n<Checkbox checked={ck} onChange={setCk} label="Accept" />\n<Switch checked={on} onChange={setOn} label="Notifications" />\n\n<div className="seg">\n  <button className="seg-btn on">Day</button>\n  <button className="seg-btn">Week</button>\n</div>` },
  badges: { comp: "ui/Badge · <Badge variant dot mono>", code: `import Badge from 'components/ui/Badge'\n\n<Badge variant="st-active" dot>In progress</Badge>\n<Badge variant="pr-urgent">Urgent</Badge>\n<Badge variant="ft-local" mono>LOCAL</Badge>\n// variant: st-queued|st-active|st-done|pr-high|pr-urgent|ft-local` },
  tabs: { comp: "class .tabs / .tab.active", code: `<div className="tabs">\n  <button className="tab active">All</button>\n  <button className="tab">Docs</button>\n</div>` },
  progress: { comp: "ui/Progress · ui/Spinner", code: `import Progress from 'components/ui/Progress'\nimport Spinner from 'components/ui/Spinner'\n\n<Progress value={35} />   // 0–100, green at 100\n<Spinner dark />` },
  feedback: { comp: "ui/Toast (useToast) · ui/Modal · ui/Tooltip", code: `import { useToast } from 'components/ui/Toast'\nimport Modal from 'components/ui/Modal'\nimport Tooltip from 'components/ui/Tooltip'\n\nconst toast = useToast();\ntoast('Saved', 'ok');        // 'ok' | 'err'\n\n<Modal open={open} onClose={close} title="…" footer={…}>body</Modal>\n<Tooltip label="Need help?"><button>?</button></Tooltip>` },
  status: { comp: "ui/StatusPopup · type=success|error|warning|info|confirm", code: `import StatusPopup from 'components/ui/StatusPopup'\n\n<StatusPopup open={!!s} type={s} onClose={close}\n  title="…" message="…"\n  confirmLabel="Delete it" onConfirm={fn} />` },
  text: { comp: "ui/TextFormatToolbar · ui/Highlight", code: `import TextFormatToolbar from 'components/ui/TextFormatToolbar'\nimport Highlight from 'components/ui/Highlight'\n\n<TextFormatToolbar sample="…" />\n<Highlight tone="emerald">success</Highlight>\n// tone: gold (default) | emerald | crimson | amethyst` },
  tags: { comp: "ui/Tags · ui/DatePicker", code: `import Tags from 'components/ui/Tags'\nimport DatePicker from 'components/ui/DatePicker'\n\n<Tags value={tags} onChange={setTags} placeholder="Add a tag…" accent />\n<DatePicker value={date} onChange={setDate} />` },
  softDelete: { comp: "ui/SoftDeleteRow", code: `import SoftDeleteRow from 'components/ui/SoftDeleteRow'\n\n<SoftDeleteRow icon="📄" title="report.pdf" meta="2.4 MB" />` },
  todo: { comp: "ui/Todo", code: `import Todo from 'components/ui/Todo'\n\n<Todo title="Today" initial={[{ text:'…', done:true }, { text:'…' }]} />` },
  search: { comp: "ui/Search", code: `import Search from 'components/ui/Search'\n\n<Search items={items} placeholder="…" onSelect={it => …} />\n// item: { id, icon, title, meta }` },
  filter: { comp: "ui/Filter", code: `import Filter from 'components/ui/Filter'\n\n<Filter rows={rows} facets={facets} />\n// facet: { key, label, options:[{ value, label }] }\n// row needs a field per facet key (e.g. status, dept)` },
  loading: { comp: "ui/LoadingPopup", code: `import LoadingPopup from 'components/ui/LoadingPopup'\n\n<LoadingPopup open={open} title="Loading…" onDone={close} />` },
  notif: { comp: "ui/Notifications", code: `import Notifications from 'components/ui/Notifications'\n\n<Notifications items={items} />\n// item: { id, unread, av, avTone, actor, text, time, action }\n// action: 'accept-decline' adds Accept/Decline buttons` },
  toolRows: { comp: "class .tool-row  (markup pattern)", code: `<div className="tool-row">          {/* add .off when disabled */}\n  <span className="tool-ic">🔌</span>\n  <div className="tool-bd">\n    <div className="tool-name">MCP · Knowledge base</div>\n    <div className="tool-meta mono">endpoint: https://host/mcp</div>\n  </div>\n  <button className="chip-act">✎</button>\n  <button className="chip-act danger">✕</button>\n</div>` },
  skill: { comp: "class .opt-chip / .opt-chip.on / .manage", code: `<div className="opt-chips">\n  <button className="opt-chip on">Analysis 📄</button>\n  <button className="opt-chip">Coding 📄</button>\n  <span className="opt-chip manage">System design 📄\n    <button className="chip-act">✎</button>\n    <button className="chip-act danger">✕</button>\n  </span>\n</div>` },
  rich: { comp: "RichBody (from screens-world)", code: `import { RichBody } from 'screens/screens-world'\n\n<RichBody value={html} onChange={setHtml} placeholder="…" />\n// tiptap editor — used for every Body field (SKILL.md, Codex)` },
  overlays: { comp: "window.uiConfirm · uiLoading · pushNotify", code: `// global app overlays (no import — mounted by the shell)\nconst ok = await window.uiConfirm({ title:'…', message:'…', confirmText:'…', danger:true });\nconst h = window.uiLoading({ title:'…', message:'…' });  h.close();\nwindow.pushNotify({ from:'…', question:'…', taskTitle:'…' });` },
  saveBar: { comp: "ui/SaveBar", code: `import SaveBar from 'components/ui/SaveBar'\n\n<SaveBar count={n} onSave={fn} onCancel={fn}\n  saveLabel="Save" cancelLabel="Cancel" label="…" />\n// floats in when count > 0` },
};

const LibDivider = ({ title, en, desc }) => (
  <div className="lib-divider">
    <div className="lib-divider-line" />
    <div className="lib-divider-txt">
      <div className="lib-divider-title">{title}</div>
      <div className="lib-divider-en mono">{en}</div>
      {desc && <div className="lib-divider-desc">{desc}</div>}
    </div>
    <div className="lib-divider-line" />
  </div>
);

function ToastDemo({ tx }) {
  const toast = useToast();
  return (
    <>
      <KitButton kind="ghost" size="sm" onClick={() => toast(tx("lib.fb.toastOk"), "ok")}>{tx("lib.fb.toastOkBtn")}</KitButton>
      <KitButton kind="ghost" size="sm" onClick={() => toast(tx("lib.fb.toastErr"), "err")}>{tx("lib.fb.toastErrBtn")}</KitButton>
    </>
  );
}

/* ---------- 3D letters / glyph set (full A–Z · a–z · ก–ฮ · สระ · numbers · symbols) ---------- */
const GLYPHS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  lower: "abcdefghijklmnopqrstuvwxyz".split(""),
  thai: "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ".split(""),
  thaiVowel: ["ะ", "◌ั", "า", "◌ำ", "◌ิ", "◌ี", "◌ึ", "◌ื", "◌ุ", "◌ู", "เ", "แ", "โ", "ใ", "ไ", "ฤ", "ฦ", "ๅ"],
  numIntl: "0123456789".split(""),
  numThai: "๐๑๒๓๔๕๖๗๘๙".split(""),
  special: ["!", "?", ".", ",", ":", ";", "'", "\"", "@", "#", "&", "%", "*", "+", "-", "=", "/", "\\", "(", ")", "[", "]", "{", "}", "<", ">", "^", "~", "|", "…", "•", "฿", "°", "№", "★"],
};

function Glyph({ ch }) {
  const jelly = (e) => { const el = e.currentTarget; el.classList.remove("jelly"); void el.offsetWidth; el.classList.add("jelly"); };
  return <span className="ltr lib-glyph" onClick={jelly}>{ch}</span>;
}
function GlyphGrid({ items }) {
  return <div className="lib-glyph-grid">{items.map((ch, i) => <Glyph key={i} ch={ch} />)}</div>;
}
function GlyphTab({ tx }) {
  const T = (typeof tx === "function") ? tx : ((k) => k);
  return (
    <>
      <div className="lib-hint">✨ {T("lib.lt.hint")}</div>
      <Sec title={T("lib.lt.latinUpper")} en="A – Z · 26"><GlyphGrid items={GLYPHS.upper} /></Sec>
      <Sec title={T("lib.lt.latinLower")} en="a – z · 26"><GlyphGrid items={GLYPHS.lower} /></Sec>
      <Sec title={T("lib.lt.thai")} en="ก – ฮ · 44"><GlyphGrid items={GLYPHS.thai} /></Sec>
      <Sec title={T("lib.lt.thaiVowel")} en="สระ · ◌ = พยัญชนะ"><GlyphGrid items={GLYPHS.thaiVowel} /></Sec>
      <Sec title={T("lib.lt.numIntl")} en="0 – 9"><GlyphGrid items={GLYPHS.numIntl} /></Sec>
      <Sec title={T("lib.lt.numThai")} en="๐ – ๙"><GlyphGrid items={GLYPHS.numThai} /></Sec>
      <Sec title={T("lib.lt.special")} en={"× " + GLYPHS.special.length}><GlyphGrid items={GLYPHS.special} /></Sec>
    </>
  );
}

function LibraryBody({ onBack, t }) {
  const tx = (typeof t === "function") ? t : ((k) => k);
  const [page, setPage] = useState("components");   // components | letters
  const [seg, setSeg] = useState("day");
  const [sw1, setSw1] = useState(true), [sw2, setSw2] = useState(false);
  const [ck, setCk] = useState(true);
  const [sel, setSel] = useState("opt2");
  const [multi, setMulti] = useState(["opt1"]);
  const [tab, setTab] = useState("all");
  const [prog, setProg] = useState(35);
  const [toolOn, setToolOn] = useState(true);
  const [saveN, setSaveN] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState(null);   // success|error|warning|info|confirm
  const [loadOpen, setLoadOpen] = useState(false);
  const [tags, setTags] = useState(["backend", "security"]);
  const [date, setDate] = useState(() => new Date());
  const toast = useToast();

  // demo data — kept inside the component so labels go through i18n
  const SEARCH_ITEMS = [
    { id: 1, icon: "📄", title: tx("lib.si.1.title"), meta: tx("lib.si.1.meta") },
    { id: 2, icon: "🐛", title: tx("lib.si.2.title"), meta: tx("lib.si.2.meta") },
    { id: 3, icon: "🧑‍💻", title: tx("lib.si.3.title"), meta: tx("lib.si.3.meta") },
    { id: 4, icon: "📊", title: tx("lib.si.4.title"), meta: tx("lib.si.4.meta") },
  ];
  const FILTER_FACETS = [
    { key: "status", label: tx("lib.ff.status"), options: [
      { value: "queued", label: tx("lib.bdg.queued") }, { value: "active", label: tx("lib.bdg.active") }, { value: "done", label: tx("lib.bdg.done") }] },
    { key: "dept", label: tx("lib.dd.dept"), options: [
      { value: "analysis", label: tx("lib.ff.analysis") }, { value: "dev", label: tx("lib.ff.dev") }, { value: "research", label: tx("lib.ff.research") }] },
  ];
  const FILTER_ROWS = [
    { id: 1, icon: "📜", title: tx("lib.fr.1.title"), meta: tx("lib.fr.1.meta"), status: "active", dept: "analysis" },
    { id: 2, icon: "📜", title: tx("lib.fr.2.title"), meta: tx("lib.fr.2.meta"), status: "queued", dept: "dev" },
    { id: 3, icon: "📜", title: tx("lib.fr.3.title"), meta: tx("lib.fr.3.meta"), status: "done", dept: "research" },
    { id: 4, icon: "📜", title: tx("lib.fr.4.title"), meta: tx("lib.fr.4.meta"), status: "active", dept: "dev" },
  ];
  const NOTIF_ITEMS = [
    { id: 1, unread: true, av: "❓", avTone: "gold", actor: tx("lib.ni.1.actor"), text: tx("lib.ni.1.text"), time: tx("lib.ni.1.time"), action: "accept-decline" },
    { id: 2, unread: true, av: "🤖", avTone: "neutral", actor: "HERMES", text: tx("lib.ni.2.text"), time: tx("lib.ni.2.time") },
    { id: 3, unread: false, av: "✓", avTone: "ok", actor: tx("lib.ni.3.actor"), text: tx("lib.ni.3.text"), time: tx("lib.ni.3.time") },
  ];
  const SP_TITLE = { success: tx("lib.sp.successTitle"), error: tx("lib.sp.errorTitle"), warning: tx("lib.sp.warningTitle"), info: tx("lib.sp.infoTitle"), confirm: tx("lib.sp.confirmTitle") };
  const SP_MSG = { success: tx("lib.sp.successMsg"), error: tx("lib.sp.errorMsg"), warning: tx("lib.sp.warningMsg"), info: tx("lib.sp.infoMsg"), confirm: tx("lib.sp.confirmMsg") };

  return (
    <div className="content-pad fade-in lib-wrap" data-no-lex>
      <PageHead kicker={tx("lib.kicker")} title={tx("lib.title")}
        desc={tx("lib.desc")}
        actions={<Btn kind="ghost" sm icon="←" onClick={onBack}>{tx("lib.back")}</Btn>} />

      <div className="tabs lib-tabs">
        <button className={`tab ${page === "components" ? "active" : ""}`} onClick={() => setPage("components")}>{tx("lib.tab.components")}</button>
        <button className={`tab ${page === "letters" ? "active" : ""}`} onClick={() => setPage("letters")}>{tx("lib.tab.letters")}</button>
      </div>

      {page === "letters" && <GlyphTab tx={tx} />}

      {page === "components" && (<>
      {/* ---------- 3D LETTERS / TYPE ---------- */}
      <Sec title={tx("lib.sec.type")} en="TYPE / 3D LETTERS" tx={tx} {...SNIP.type} spec={tx("lib.spec.type")}>
        <Letters3D word="PiKaOs" style={{ fontSize: 56 }} />
        <div className="lib-type-list">
          <div className="lib-type-row"><span className="lt-tag mono">Mitr 700</span><span style={{ fontFamily: "var(--font-toon)", fontWeight: 700, fontSize: 26 }}>{tx("lib.t.brand")}</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Plex 700</span><span style={{ fontWeight: 700, fontSize: 20 }}>{tx("lib.t.title")}</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Plex 400</span><span style={{ fontSize: 14, color: "var(--ink-2)" }}>{tx("lib.t.body")}</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Mono 500</span><span className="mono" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}>KICKER · META · CODE</span></div>
        </div>
      </Sec>

      {/* ---------- BUTTONS ---------- */}
      <Sec title={tx("lib.sec.buttons")} en="BUTTONS" tx={tx} {...SNIP.buttons} spec={tx("lib.spec.buttons")}>
        <KitButton kind="gold">{tx("lib.btn.save")}</KitButton>
        <KitButton kind="ghost">{tx("lib.btn.cancel")}</KitButton>
        <KitButton kind="danger">{tx("lib.btn.delete")}</KitButton>
        <KitButton kind="gold" size="sm">{tx("lib.btn.small")}</KitButton>
        <KitButton kind="ghost" size="sm" icon>⚙</KitButton>
        <KitButton kind="gold" disabled>{tx("lib.btn.disabled")}</KitButton>
        <Spinner dark />
      </Sec>

      {/* ---------- DROPDOWN ---------- */}
      <Sec title={tx("lib.sec.dropdown")} en="SELECT / MENU / MULTI-SELECT" tx={tx} {...SNIP.dropdown} spec={tx("lib.spec.dropdown")}>
        <Select value={sel} onChange={setSel} options={[{ value: "opt1", label: tx("lib.dd.opt1") }, { value: "opt2", label: tx("lib.dd.opt2") }, { value: "opt3", label: tx("lib.dd.opt3") }]} />
        <Menu label={tx("lib.dd.actions")} items={[{ label: tx("lib.dd.edit"), onSelect: () => toast(tx("lib.dd.edit"), "ok") }, { label: tx("lib.dd.dup"), onSelect: () => toast(tx("lib.dd.dup"), "ok") }, { label: tx("lib.btn.delete"), danger: true, onSelect: () => toast(tx("lib.btn.delete"), "err") }]} />
        <MultiSelect label={tx("lib.dd.dept")} options={FILTER_FACETS[1].options} values={multi.map(v => v === "opt1" ? "dev" : v)} onChange={setMulti} />
      </Sec>

      {/* ---------- INPUTS ---------- */}
      <Sec title={tx("lib.sec.inputs")} en="INPUTS" tx={tx} {...SNIP.inputs} spec={tx("lib.spec.inputs")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340 }}>
          <input className="bf-input" placeholder={tx("lib.in.normal")} />
          <input className="bf-input" defaultValue={tx("lib.in.filled")} />
          <div className="lf has-error" style={{ margin: 0 }}>
            <input className="lf-input" defaultValue={tx("lib.in.invalid")} />
            <span className="lf-error">{tx("lib.in.error")}</span>
          </div>
          <input className="bf-input" disabled placeholder={tx("lib.in.disabled")} />
        </div>
      </Sec>

      {/* ---------- FORM CONTROLS ---------- */}
      <Sec title={tx("lib.sec.fc")} en="FORM CONTROLS" tx={tx} {...SNIP.fc} spec={tx("lib.spec.fc")}>
        <Checkbox checked={ck} onChange={setCk} label={tx("lib.fc.accept")} />
        <Switch checked={sw1} onChange={setSw1} label={tx("lib.fc.notif")} />
        <Switch checked={sw2} onChange={setSw2} label={tx("lib.fc.silent")} />
        <div className="seg" style={{ maxWidth: 280 }}>
          {[["day", tx("lib.fc.day")], ["week", tx("lib.fc.week")], ["month", tx("lib.fc.month")]].map(([k, l]) => (
            <button key={k} type="button" className={`seg-btn ${seg === k ? "on" : ""}`} onClick={() => setSeg(k)}>{l}</button>
          ))}
        </div>
      </Sec>

      {/* ---------- BADGES ---------- */}
      <Sec title={tx("lib.sec.badges")} en="BADGES & TAGS" tx={tx} {...SNIP.badges} spec={tx("lib.spec.badges")}>
        <Badge variant="st-queued" dot>{tx("lib.bdg.queued")}</Badge>
        <Badge variant="st-active" dot>{tx("lib.bdg.active")}</Badge>
        <Badge variant="st-done" dot>{tx("lib.bdg.done")}</Badge>
        <Badge variant="pr-high">{tx("lib.bdg.high")}</Badge>
        <Badge variant="pr-urgent">{tx("lib.bdg.urgent")}</Badge>
        <Badge variant="ft-local" mono>LOCAL</Badge>
        <span className="rank S">S</span><span className="rank A">A</span><span className="rank B">B</span>
      </Sec>

      {/* ---------- TABS ---------- */}
      <Sec title={tx("lib.sec.tabs")} en="TABS" tx={tx} {...SNIP.tabs} spec={tx("lib.spec.tabs")}>
        <div className="tabs">
          {[["all", tx("lib.tab.all")], ["docs", tx("lib.tab.docs")], ["qa", tx("lib.tab.qa")]].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </Sec>

      {/* ---------- PROGRESS ---------- */}
      <Sec title={tx("lib.sec.progress")} en="PROGRESS" tx={tx} {...SNIP.progress} spec={tx("lib.spec.progress")}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}><Progress value={prog} /></div>
        <KitButton kind="ghost" size="sm" onClick={() => setProg(p => (p >= 100 ? 20 : p + 20))}>+20%</KitButton>
      </Sec>

      {/* ---------- FEEDBACK ---------- */}
      <Sec title={tx("lib.sec.feedback")} en="TOAST / MODAL / TOOLTIP" tx={tx} {...SNIP.feedback} spec={tx("lib.spec.feedback")}>
        <ToastDemo tx={tx} />
        <KitButton kind="ghost" size="sm" onClick={() => setModalOpen(true)}>{tx("lib.fb.openModal")}</KitButton>
        <Tooltip label={tx("lib.fb.tooltip")}>
          <KitButton kind="ghost" size="sm" icon>?</KitButton>
        </Tooltip>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={tx("lib.fb.modalTitle")}
          footer={<>
            <KitButton kind="ghost" onClick={() => setModalOpen(false)}>{tx("lib.btn.cancel")}</KitButton>
            <KitButton kind="gold" onClick={() => { setModalOpen(false); toast(tx("lib.fb.confirmed"), "ok"); }}>{tx("lib.fb.confirm")}</KitButton>
          </>}>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.65, margin: 0 }}>{tx("lib.fb.modalBody")}</p>
        </Modal>
      </Sec>

      {/* ---------- STATUS POPUPS ---------- */}
      <Sec title={tx("lib.sec.status")} en="STATUS POPUPS" tx={tx} {...SNIP.status} spec={tx("lib.spec.status")}>
        {["success", "error", "warning", "info", "confirm"].map(s => (
          <KitButton key={s} kind="ghost" size="sm" onClick={() => setStatus(s)}>{s}</KitButton>
        ))}
        <StatusPopup open={!!status} type={status || "info"} onClose={() => setStatus(null)}
          title={SP_TITLE[status] || ""}
          message={SP_MSG[status] || ""}
          confirmLabel={status === "confirm" ? tx("lib.sp.deleteNow") : undefined}
          onConfirm={status === "confirm" ? () => { setStatus(null); toast(tx("lib.sp.deleted"), "err"); } : undefined} />
      </Sec>

      {/* ---------- TEXT & HIGHLIGHT ---------- */}
      <Sec title={tx("lib.sec.text")} en="TEXT FORMAT / HIGHLIGHT" tx={tx} {...SNIP.text} spec={tx("lib.spec.text")}>
        <div style={{ width: "100%", maxWidth: 420 }}><TextFormatToolbar sample={tx("lib.txt.sample")} /></div>
        <p style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--ink-2)", width: "100%", margin: 0 }}>
          {tx("lib.txt.hlLead")} <Highlight>{tx("lib.txt.hlDefault")}</Highlight> · <Highlight tone="emerald">{tx("lib.txt.hlOk")}</Highlight> · <Highlight tone="crimson">{tx("lib.txt.hlErr")}</Highlight> · <Highlight tone="amethyst">{tx("lib.txt.hlResearch")}</Highlight>
        </p>
      </Sec>

      {/* ---------- TAGS & DATE ---------- */}
      <Sec title={tx("lib.sec.tags")} en="TAGS / DATE PICKER" tx={tx} {...SNIP.tags} spec={tx("lib.spec.tags")}>
        <div style={{ width: "100%", maxWidth: 380 }}><Tags value={tags} onChange={setTags} placeholder={tx("lib.tag.add")} accent /></div>
        <DatePicker value={date} onChange={setDate} />
      </Sec>

      {/* ---------- SOFT DELETE ---------- */}
      <Sec title={tx("lib.sec.softDelete")} en="DELETE FLOW" tx={tx} {...SNIP.softDelete} spec={tx("lib.spec.softDelete")}>
        <div className="sd-list" style={{ width: "100%" }}>
          <SoftDeleteRow icon="📄" title={tx("lib.sd.file1")} meta={tx("lib.sd.file1meta")} />
          <SoftDeleteRow icon="🧾" title={tx("lib.sd.file2")} meta={tx("lib.sd.file2meta")} />
        </div>
      </Sec>

      {/* ---------- TODO ---------- */}
      <Sec title={tx("lib.sec.todo")} en="TO-DO LIST" tx={tx} {...SNIP.todo} spec={tx("lib.spec.todo")}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Todo title={tx("lib.todo.title")} initial={[{ text: tx("lib.todo.i1"), done: true }, { text: tx("lib.todo.i2") }, { text: tx("lib.todo.i3") }]} />
        </div>
      </Sec>

      {/* ---------- SEARCH ---------- */}
      <Sec title={tx("lib.sec.search")} en="SEARCH" tx={tx} {...SNIP.search} spec={tx("lib.spec.search")}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <Search items={SEARCH_ITEMS} placeholder={tx("lib.search.ph")} onSelect={(it) => toast(tx("lib.search.picked") + it.title, "ok")} />
        </div>
      </Sec>

      {/* ---------- FILTER ---------- */}
      <Sec title={tx("lib.sec.filter")} en="FILTER" tx={tx} {...SNIP.filter} spec={tx("lib.spec.filter")}>
        <div style={{ width: "100%" }}><Filter rows={FILTER_ROWS} facets={FILTER_FACETS} /></div>
      </Sec>

      {/* ---------- LOADING ---------- */}
      <Sec title={tx("lib.sec.loading")} en="LOADING POPUP" tx={tx} {...SNIP.loading} spec={tx("lib.spec.loading")}>
        <KitButton kind="ghost" size="sm" onClick={() => setLoadOpen(true)}>{tx("lib.load.openBtn")}</KitButton>
        <LoadingPopup open={loadOpen} title={tx("lib.load.title")} onDone={() => { setLoadOpen(false); toast(tx("lib.load.done"), "ok"); }} />
      </Sec>

      {/* ---------- NOTIFICATIONS ---------- */}
      <Sec title={tx("lib.sec.notif")} en="NOTIFICATIONS" tx={tx} {...SNIP.notif} spec={tx("lib.spec.notif")}>
        <Notifications items={NOTIF_ITEMS} />
      </Sec>

      {/* ================= EXTENSIONS ================= */}
      <LibDivider title={tx("lib.sec.ext")} en="EXTENSIONS" desc={tx("lib.ext.desc")} />

      <Sec title={tx("lib.sec.toolRows")} en="TOOL ROWS" tx={tx} {...SNIP.toolRows} isNew newLabel={tx("lib.extra")} spec={tx("lib.spec.toolRows")}>
        <div className="tool-list" style={{ width: "100%" }}>
          <div className={`tool-row ${toolOn ? "" : "off"}`}>
            <span className="tool-ic">🔌</span>
            <div className="tool-bd"><div className="tool-name">{tx("lib.tool.mcp")}</div><div className="tool-meta mono">MCP Server · endpoint: https://host/mcp</div></div>
            <label className="ck-inline" data-no-lex><input type="checkbox" checked={toolOn} onChange={e => setToolOn(e.target.checked)} /></label>
            <button type="button" className="chip-act">✎</button>
            <button type="button" className="chip-act danger">✕</button>
          </div>
          <div className="tool-row">
            <span className="tool-ic">✈️</span>
            <div className="tool-bd"><div className="tool-name">{tx("lib.tool.tg")}</div><div className="tool-meta mono">Telegram Bot · chatId: -100xxxx</div></div>
            <label className="ck-inline" data-no-lex><input type="checkbox" defaultChecked /></label>
            <button type="button" className="chip-act">✎</button>
            <button type="button" className="chip-act danger">✕</button>
          </div>
        </div>
      </Sec>

      <Sec title={tx("lib.sec.skill")} en="SKILL CHIPS" tx={tx} {...SNIP.skill} isNew newLabel={tx("lib.extra")} spec={tx("lib.spec.skill")}>
        <div className="opt-chips">
          <button type="button" className="opt-chip on">{tx("lib.skill.analysis")} 📄</button>
          <button type="button" className="opt-chip">{tx("lib.skill.coding")} 📄</button>
          <span className="opt-chip manage">{tx("lib.skill.sysdesign")} 📄<button className="chip-act">✎</button><button className="chip-act danger">✕</button></span>
        </div>
      </Sec>

      <Sec title={tx("lib.sec.rich")} en="RICH BODY" tx={tx} {...SNIP.rich} isNew newLabel={tx("lib.extra")} spec={tx("lib.spec.rich")}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          <RichBody value={tx("lib.rich.content")} onChange={() => {}} placeholder={tx("lib.rich.ph")} />
        </div>
      </Sec>

      <Sec title={tx("lib.sec.overlays")} en="APP OVERLAYS" tx={tx} {...SNIP.overlays} isNew newLabel={tx("lib.extra")} spec={tx("lib.spec.overlays")}>
        <Btn kind="ghost" sm onClick={() => window.uiConfirm && window.uiConfirm({ title: tx("lib.ov.confirmTitle"), message: tx("lib.ov.confirmMsg"), confirmText: tx("lib.ov.confirmTitle"), danger: true })}>{tx("lib.ov.confirmBtn")}</Btn>
        <Btn kind="ghost" sm onClick={() => { const h = window.uiLoading && window.uiLoading({ title: tx("lib.ov.loadingTitle"), message: "demo-worklog.md" }); setTimeout(() => h && h.close && h.close(), 2600); }}>{tx("lib.ov.loadingBtn")}</Btn>
        <Btn kind="ghost" sm onClick={() => window.pushNotify && window.pushNotify({ from: tx("lib.ov.notifyFrom"), question: tx("lib.ov.notifyQ"), taskTitle: tx("lib.ov.notifyTask") })}>{tx("lib.ov.notifyBtn")}</Btn>
      </Sec>

      <Sec title={tx("lib.sec.saveBar")} en="SAVE BAR" tx={tx} {...SNIP.saveBar} isNew newLabel={tx("lib.extra")} spec={tx("lib.spec.saveBar")}>
        <KitButton kind="ghost" size="sm" onClick={() => setSaveN(n => (n > 0 ? 0 : 3))}>{saveN > 0 ? tx("lib.save.hide") : tx("lib.save.show")}</KitButton>
        <span className="mono faint" style={{ fontSize: 12 }}>{saveN > 0 ? tx("lib.save.pending", { n: saveN }) : tx("lib.save.none")}</span>
        <SaveBar count={saveN} onSave={() => { setSaveN(0); toast(tx("lib.save.saved"), "ok"); }} onCancel={() => setSaveN(0)}
          saveLabel={tx("lib.btn.save")} cancelLabel={tx("lib.btn.cancel")} label={tx("lib.save.unsaved", { n: saveN })} />
      </Sec>
      </>)}

      <div className="lib-credit credit">PiKaOs Design System · Created by <b>saksit chuenmaiwaiy</b></div>
    </div>
  );
}

export function ComponentLibrary({ onBack, t }) {
  return (
    <ToastProvider>
      <LibraryBody onBack={onBack} t={t} />
    </ToastProvider>
  );
}

Object.assign(window, { ComponentLibrary });
