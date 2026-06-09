/* ============================================================
   SITEMAP MATCH — ported from the GuildOS prototype
   (GuildOS/screens-sitemap.jsx). The mock `run()` / localStorage
   override maps are replaced by real calls to the FastAPI backend
   (lxml crawl + rapidfuzz match + Postgres-backed vocabulary).
   Visual structure / classNames are kept identical to the prototype.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Category, LogEntry, ScanItem, ScanResult, Term, TrainFile } from "./types";
import { Btn, Empty, PageHead, Panel } from "./ui";

interface Settings {
  model: string;
  apiMode: string;
  engine: string;
  useAi: boolean;
  apiUrl?: string;
  apiKey?: string;
  bypassPopup?: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  model: "Qwen 3.6 32B",
  apiMode: "Local · Ollama (dev)",
  engine: "rapidfuzz (fuzzy)",
  useAi: false,
  bypassPopup: true,
};

const UNCLEAR = 18;
export const VERSION_LABEL = "0.1 · Sitemap · Beta";

export function SitemapAudit({ lang, can, actor }: { lang: "th" | "en"; can?: (p: string) => boolean; actor?: string }) {
  const T = (en: string, th: string) => (lang === "en" ? en : th);
  const canEdit = !can || can("codex.manage");
  const me = actor || "ผู้ใช้";

  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [train, setTrain] = useState<TrainFile[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);

  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [tab, setTab] = useState<"url" | "map" | "log" | "settings">("url");
  const [passTh, setPassTh] = useState(70);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("pikaos.sitemap.settings") || "null");
      if (s) return s;
    } catch {
      /* ignore */
    }
    return DEFAULT_SETTINGS;
  });
  const setSetting = (k: keyof Settings, v: unknown) => {
    const nx = { ...settings, [k]: v };
    setSettings(nx);
    try {
      localStorage.setItem("pikaos.sitemap.settings", JSON.stringify(nx));
    } catch {
      /* ignore */
    }
  };

  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatFrom, setNewCatFrom] = useState<string[]>([]);
  const [addVocab, setAddVocab] = useState<{ key: string; alias: string; q?: string | null; open?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const curCat = cats.find((c) => c.key === cat);
  const isDerived = !!curCat && curCat.from.length > 0;
  const readOnly = isDerived || !canEdit;

  // ---- loaders ----
  const loadCats = useCallback(async () => {
    const cs = await api.categories();
    setCats(cs);
    setCat((prev) => (prev && cs.some((c) => c.key === prev) ? prev : cs[0]?.key || ""));
  }, []);

  const loadVocab = useCallback(async (c: string) => {
    if (!c) return setTerms([]);
    setTerms(await api.vocab(c));
  }, []);

  const loadTrain = useCallback(async (c: string) => {
    if (!c) return setTrain([]);
    try {
      setTrain(await api.train(c));
    } catch {
      setTrain([]);
    }
  }, []);

  const loadLog = useCallback(async () => setLog(await api.log()), []);

  useEffect(() => {
    loadCats().catch((e) => setErr(String(e.message || e)));
  }, [loadCats]);
  useEffect(() => {
    if (cat) {
      loadVocab(cat).catch(() => {});
      loadTrain(cat).catch(() => {});
    }
  }, [cat, loadVocab, loadTrain]);
  useEffect(() => {
    if (tab === "log") loadLog().catch(() => {});
  }, [tab, loadLog]);

  const refreshVocab = () => loadVocab(cat).catch(() => {});

  // ---- vocab edits ----
  const addTerm = async () => {
    const canon = window.prompt("เพิ่มคำหลัก (หัวข้อ) — เช่น Share Price");
    if (!canon || !canon.trim()) return;
    const th = window.prompt("คำอธิบาย/ภาษาไทย — เช่น ราคาหลักทรัพย์") || canon;
    await api.addTerm(cat, { canon: canon.trim(), th: th.trim() }, me);
    refreshVocab();
  };
  const editCanon = async (id: string, cur: string) => {
    const n = window.prompt("แก้คำหลัก (หัวข้อ)", cur);
    if (!n || n === cur) return;
    await api.updateTerm(id, { canon: n.trim() }, me);
    refreshVocab();
  };
  const editTerm = async (id: string, cur: string) => {
    const n = window.prompt("แก้คำอธิบาย/ไทย", cur);
    if (!n || n === cur) return;
    await api.updateTerm(id, { th: n.trim() }, me);
    refreshVocab();
  };
  const removeTerm = async (id: string, canon: string) => {
    if (!window.confirm(`ลบคำหลัก “${canon}”?`)) return;
    await api.deleteTerm(id, me);
    refreshVocab();
  };
  const addAlias = async (id: string) => {
    const n = window.prompt("เพิ่มคำที่ map — เช่น งบดุล");
    if (!n || !n.trim()) return;
    await api.addAlias(id, n.trim(), me);
    refreshVocab();
  };
  const editAlias = async (id: string, a: string) => {
    const n = window.prompt("แก้คำ map", a);
    if (!n || n === a) return;
    await api.removeAlias(id, a, me);
    await api.addAlias(id, n.trim(), me);
    refreshVocab();
  };
  const removeAlias = async (id: string, a: string) => {
    await api.removeAlias(id, a, me);
    refreshVocab();
  };

  // ---- category edits ----
  const createCat = async () => {
    const k = newCatName.trim();
    if (!k) return;
    await api.createCategory({ key: k, label: k, from: newCatFrom }, me);
    setAddingCat(false);
    setNewCatName("");
    setNewCatFrom([]);
    await loadCats();
    setCat(k);
  };
  const toggleFrom = (k: string) => setNewCatFrom((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const deleteCat = async (k: string) => {
    if (!window.confirm(`ลบหมวด “${k}”? คำศัพท์ในหมวดนี้จะหายไปด้วย`)) return;
    try {
      await api.deleteCategory(k, me);
    } catch (e) {
      window.alert(String((e as Error).message));
      return;
    }
    await loadCats();
  };

  // ---- training ----
  const addTrain = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const f of files) {
      try {
        await api.uploadTrain(cat, f, me);
      } catch (er) {
        window.alert(`${f.name}: ${(er as Error).message}`);
      }
    }
    loadTrain(cat);
    refreshVocab();
  };
  const removeTrain = async (id: string) => {
    await api.deleteTrain(id);
    loadTrain(cat);
  };

  // ---- scan ----
  const run = async (u?: string) => {
    const target = (u ?? url).trim();
    if (!target) return;
    setBusy(true);
    setResult(null);
    setErr(null);
    try {
      const r = await api.scan({ url: target, category: cat, passThreshold: passTh, bypassPopup: settings.bypassPopup !== false });
      setResult(r);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  // ---- classification (mirrors backend; live re-classify on slider) ----
  const statusOf = (i: ScanItem) =>
    i.conf >= passTh ? "complete" : i.conf >= passTh - UNCLEAR ? "unclear" : "missing";
  const complete = result ? result.items.filter((i) => statusOf(i) === "complete") : [];
  const unclear = result ? result.items.filter((i) => statusOf(i) === "unclear") : [];
  const missing = result ? result.items.filter((i) => statusOf(i) === "missing") : [];
  const score = result && result.items.length ? Math.round((complete.length / result.items.length) * 100) : 0;
  const grade =
    score >= 80 ? { t: T("Strong", "ครบถ้วน"), c: "ok" } : score >= 55 ? { t: T("Partial", "บางส่วน"), c: "warn" } : { t: T("Low", "ขาดมาก"), c: "bad" };

  const evHref = (i: ScanItem) => {
    let b = (result ? result.url : "").replace(/\/+$/, "");
    if (b && !/^https?:\/\//.test(b)) b = "https://" + b;
    if (i.evPath && i.evPath !== "/") b = b.replace(/(https?:\/\/[^/]+).*/, "$1") + i.evPath;
    return b + (i.pageTerm ? "#:~:text=" + encodeURIComponent(i.pageTerm) : "");
  };

  const confirmUnclear = (i: ScanItem) => setAddVocab({ key: i.key, alias: i.pageTerm || "" });
  const submitVocab = async () => {
    if (!addVocab) return;
    const v = String(addVocab.alias || "").trim();
    if (v) await api.addAlias(addVocab.key, v, me);
    await api.updateTerm(addVocab.key, { confirmed: true }, me);
    setAddVocab(null);
    refreshVocab();
    if (result) run(result.url); // rescan so the confirmed item moves to "complete"
  };

  const catJson = JSON.stringify(
    {
      category: cat,
      passThreshold: passTh,
      vocab: terms.map((t) => ({ canon: t.canon, th: t.th, aliases: t.aliases })),
      trainedFiles: train.map((t) => ({ file: t.name, rows: t.rows })),
    },
    null,
    2
  );

  const downloadReport = () => {
    if (!result) return;
    const ev = (i: ScanItem) => ({ pageTerm: i.pageTerm, matchedTo: i.canon, category: i.category, confidence: i.conf, aliasDiff: i.alias, evidence: i.evTag + " · " + i.evPath });
    const rep = {
      url: result.url,
      category: result.cat,
      scannedAt: result.scannedAt,
      passThreshold: passTh,
      score,
      complete: complete.map(ev),
      unclear: unclear.map(ev),
      missing: missing.map((i) => ({ canon: i.canon, th: i.th, category: i.category })),
    };
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sitemap-report-" + result.url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  return (
    <div className="content-pad fade-in">
      <PageHead
        kicker={T("Tools · Sitemap Match", "เครื่องมือ · จับคู่ไซต์แมพ")}
        title={T("Sitemap Match", "ตรวจไซต์แมพ")}
        tag={`v${VERSION_LABEL}`}
        desc={T(
          "Match our sitemap vocabulary against terms on a web page — even when the wording differs but means the same.",
          "นำคำศัพท์ของไซต์แมพมาจับคู่กับคำบนหน้าเว็บ — ถึงเขียนต่างกันก็รู้ว่าคืออันเดียวกัน"
        )}
      />

      <div className="sm-pipe">
        {([["🗺️", "ข้อมูลไซต์แมพ", "คำศัพท์ของเรา"], ["🧩", "แปลงคำศัพท์", "จัดรูปแบบ"], ["🌐", "ดึงข้อมูล", "จากหน้าเว็บ"], ["⚖️", "เทียบ", "หาที่ขาด"], ["📑", "สรุปผล", "รายงาน"]] as const).map((s) => (
          <div className="sm-pstage" key={s[1]}>
            <div className="sm-pico">{s[0]}</div>
            <div className="sm-pt">{s[1]}</div>
            <div className="sm-pd">{s[2]}</div>
          </div>
        ))}
      </div>

      {/* categories */}
      <div className="sm-section-h mono">① หมวดหมู่</div>
      <div className="sm-cats">
        {cats.map((c) => (
          <button key={c.key} className={`sm-cat ${cat === c.key ? "on" : ""}`} onClick={() => setCat(c.key)}>
            {c.label}
            {c.from.length > 0 ? " · รวม" : ""}
          </button>
        ))}
        {canEdit && <button className="sm-cat add" onClick={() => setAddingCat((v) => !v)}>＋ เพิ่มหมวด</button>}
        {cat && canEdit && <button className="sm-cat del" onClick={() => deleteCat(cat)}>🗑 ลบหมวด “{cat}”</button>}
      </div>
      {addingCat && (
        <div className="sm-addcat">
          <div className="sm-addcat-row">
            <input className="bf-input" style={{ maxWidth: 220 }} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="ชื่อหมวด เช่น ESG, CGR" />
            <Btn kind="gold" sm onClick={createCat} style={{ opacity: newCatName.trim() ? 1 : 0.5, pointerEvents: newCatName.trim() ? "auto" : "none" }}>สร้างหมวด</Btn>
            <Btn kind="ghost" sm onClick={() => { setAddingCat(false); setNewCatName(""); setNewCatFrom([]); }}>ยกเลิก</Btn>
          </div>
          <div className="sm-addcat-from">
            <span className="mono muted" style={{ fontSize: 12 }}>map รวมจากหมวด:</span>
            <select className="bf-input" style={{ maxWidth: 240 }} value="" onChange={(e) => { if (e.target.value) { toggleFrom(e.target.value); e.target.value = ""; } }}>
              <option value="">＋ เลือกหมวดต้นทาง…</option>
              {cats.filter((c) => c.from.length === 0 && !newCatFrom.includes(c.key)).map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            {newCatFrom.map((k) => (
              <span key={k} className="sm-fromchip on">{k}<button onClick={() => toggleFrom(k)}>✕</button></span>
            ))}
            {newCatFrom.length === 0 && <span className="mono faint" style={{ fontSize: 11 }}>เว้นว่าง = หมวดใหม่เปล่า</span>}
          </div>
        </div>
      )}

      <div className="sm-subtabs">
        <button className={`sm-subtab ${tab === "url" ? "on" : ""}`} onClick={() => setTab("url")}>🔍 จับคู่ URL</button>
        <button className={`sm-subtab ${tab === "map" ? "on" : ""}`} onClick={() => setTab("map")}>🗺️ Map คำศัพท์</button>
        <button className={`sm-subtab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>📜 Log</button>
        {canEdit && <button className={`sm-subtab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>⚙️ ตั้งค่า</button>}
      </div>

      {tab === "log" ? (
        <div className="sm-logwrap">
          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            📜 บันทึกการแก้ไข (Log)
            {canEdit && log.length > 0 && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={async () => { await api.clearLog(); loadLog(); }}>ล้าง Log</button>}
          </div>
          {log.length === 0 ? (
            <Empty icon="📜" title="ยังไม่มีบันทึก" sub="การเพิ่ม/แก้/ลบ ศัพท์ · Excel · หมวด จะถูกบันทึกที่นี่พร้อมชื่อผู้ทำและเวลา" />
          ) : (
            <div className="sm-log">
              {log.map((l) => (
                <div key={l.id} className="sm-logrow">
                  <span className="sm-log-act">{l.action}</span>
                  <span className="sm-log-detail">{l.detail}</span>
                  <span className="sm-log-actor mono">👤 {l.actor}</span>
                  <span className="sm-log-time mono">{new Date(l.ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "settings" && canEdit ? (
        <div className="sm-settings">
          <div className="sm-set-row">
            <label className="sm-set-label">🤖 โมเดล AI</label>
            <select className="bf-input" value={settings.model} onChange={(e) => setSetting("model", e.target.value)}>
              {["Qwen 3.6 32B", "GLM 5.1", "Llama 3.3 70B", "ไม่ใช้ AI (rule-based)"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">โมเดลที่ใช้ช่วยจับคู่/วิเคราะห์คำ</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">🔌 API Mode</label>
            <select className="bf-input" value={settings.apiMode} onChange={(e) => setSetting("apiMode", e.target.value)}>
              {["Local · Ollama (dev)", "Local · vLLM (prod)", "Cloud API", "MCP"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">ช่องทางเรียกใช้โมเดล</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">🌐 API Endpoint</label>
            <input className="bf-input" style={{ maxWidth: 300 }} value={settings.apiUrl || ""} onChange={(e) => setSetting("apiUrl", e.target.value)} placeholder="http://localhost:11434/v1" />
            <span className="sm-set-hint">ที่อยู่ API ของโมเดล</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">⚙️ เครื่องมือจับคู่</label>
            <select className="bf-input" value={settings.engine} onChange={(e) => setSetting("engine", e.target.value)}>
              {["rapidfuzz (fuzzy)", "AI semantic", "exact match"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">วิธีเทียบคำบนหน้าเว็บกับ sitemap</span>
          </div>
          <label className="sm-set-toggle">
            <input type="checkbox" checked={settings.useAi} onChange={(e) => setSetting("useAi", e.target.checked)} />
            <span>ใช้ AI ช่วยตัดสินคำที่ “ไม่ชัด” (ต้องตั้งค่าโมเดล + API ให้พร้อม)</span>
          </label>
          <label className="sm-set-toggle">
            <input type="checkbox" checked={settings.bypassPopup !== false} onChange={(e) => setSetting("bypassPopup", e.target.checked)} />
            <span>🚫 ข้าม Popup อัตโนมัติ ตอนดึงข้อมูล (Cookie consent · Modal/Overlay · Paywall · Newsletter)</span>
          </label>
          <div className="sm-set-note mono">bypassPopup ส่งให้ backend ใช้ตอน crawl จริง · ค่าอื่นเตรียมไว้สำหรับต่อ AI</div>
        </div>
      ) : tab === "map" ? (
        <>
          <div className="sm-train">
            <div className="sm-train-head">
              <span className="mono muted" style={{ fontSize: 12.5 }}>📊 {train.length} ไฟล์เทรน · {terms.length} คำหลัก · หมวด {cat}</span>
              <button className="sm-jsonbtn" onClick={() => setShowJson((v) => !v)}>🧾 {showJson ? "ซ่อน JSON" : "ดู JSON"}</button>
              {!readOnly && <button className="sm-up" onClick={() => fileRef.current?.click()}>⬆ อัปโหลด Excel</button>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: "none" }} onChange={addTrain} />
            </div>
            {readOnly && isDerived && <div className="sm-readonly mono">🔗 หมวดนี้รวมคำจาก <b>{curCat!.from.join(" + ")}</b> โดยอัตโนมัติ — เพิ่ม/แก้คำได้ที่หมวดต้นทาง</div>}
            {showJson && <pre className="sm-json">{catJson}</pre>}
            {train.length > 0 && (
              <div className="sm-train-list">
                {train.map((t) => (
                  <div key={t.id} className="sm-tr">
                    <span className="sm-tr-ic">📊</span>
                    <div className="sm-tr-body"><div className="sm-tr-name mono">{t.name}</div><div className="sm-tr-meta">{t.rows} แถว · หมวด {t.category}</div></div>
                    <button className="sm-tr-x" onClick={() => removeTrain(t.id)} title="ลบ">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            🗺️ Map คำหลัก → คำที่เขียนต่างกัน (alias)
            {!readOnly && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={addTerm}>＋ เพิ่มคำหลัก</button>}
          </div>
          {!readOnly && <div className="mono faint" style={{ fontSize: 11, margin: "-4px 0 8px" }}>ไม่ต้องมี Excel — เพิ่ม/ลบ/แก้คำได้เอง บันทึกลง DB ให้ AI ใช้ตรวจได้ทันที</div>}
          <div className="sm-map">
            {terms.length === 0 && <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>ยังไม่มีคำหลัก — กด “＋ เพิ่มคำหลัก” หรืออัปโหลด Excel</div>}
            {terms.map((t) => (
              <div key={t.key} className="sm-maprow">
                <div className="sm-mapkey">
                  <div className="sm-mapcanon mono">{t.canon}{!readOnly && <button className="sm-edit" onClick={() => editCanon(t.key, t.canon)} title="แก้คำหลัก">✎</button>}</div>
                  <div className="sm-mapth">{t.th}{!readOnly && <button className="sm-edit" onClick={() => editTerm(t.key, t.th)} title="แก้คำอธิบาย">✎</button>}</div>
                  <span className="sm-item-cat mono">{t.category}</span>
                </div>
                <span className="sm-arrow">→</span>
                <div className="sm-mapvars">
                  {t.aliases.length === 0 && <span className="muted" style={{ fontSize: 12 }}>ยังไม่มีคำ map</span>}
                  {t.aliases.map((a) => (
                    <span key={a} className="sm-var">{a}{!readOnly && <><button onClick={() => editAlias(t.key, a)} title="แก้">✎</button><button onClick={() => removeAlias(t.key, a)} title="ลบ">✕</button></>}</span>
                  ))}
                  {!readOnly && <button className="sm-var add" onClick={() => addAlias(t.key)} title="เพิ่มคำที่ map กับคำหลักนี้">＋</button>}
                </div>
                {!readOnly && <button className="sm-maprow-del" onClick={() => removeTerm(t.key, t.canon)} title="ลบคำหลักนี้">🗑</button>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="sm-bar">
            <span className="sm-ic">🔗</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://company.listed.co.th" />
            {url && <button className="sm-clear" onClick={() => setUrl("")}>✕</button>}
            <Btn kind="gold" icon="🔍" onClick={() => run()}>{T("Match", "ตรวจเทียบ")}</Btn>
          </div>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.useAi} onChange={(e) => setSetting("useAi", e.target.checked)} />
            <span>🤖 ใช้ AI ช่วยตรวจ <span className="mono faint">({settings.model} · {settings.apiMode})</span></span>
          </label>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.bypassPopup !== false} onChange={(e) => setSetting("bypassPopup", e.target.checked)} />
            <span>🚫 ข้าม Popup ตอนดึงข้อมูล <span className="mono faint">(cookie · modal · paywall)</span></span>
          </label>
          <div className="sm-examples">
            <span className="mono faint">{T("try", "ลองตัวอย่าง")}:</span>
            {["www.set.or.th", "www.scb.co.th", "www.cpall.co.th"].map((e) => (
              <button key={e} className="sm-chip" onClick={() => { setUrl("https://" + e); run("https://" + e); }}>{e}</button>
            ))}
          </div>
          <div className="sm-thbar">
            <span className="mono muted" style={{ fontSize: 12.5 }}>⚙️ เกณฑ์ผ่าน (ความมั่นใจ ≥)</span>
            <input type="range" min={50} max={95} step={5} value={passTh} onChange={(e) => setPassTh(+e.target.value)} />
            <span className="sm-thval mono">{passTh}%</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{passTh - 18}–{passTh}% = ไม่ชัด · ต่ำกว่า {passTh - 18}% = ขาด</span>
          </div>

          {busy && <Panel><div className="sm-loading"><span className="typing-bubble"><span /><span /><span /></span> {T("Fetching & comparing…", "กำลังดึงข้อมูล & เทียบ…")}</div></Panel>}
          {err && !busy && <div className="sm-readonly mono" style={{ borderColor: "var(--crimson)", color: "var(--crimson)" }}>⚠️ {err}</div>}
          {!busy && !result && !err && <Empty icon="🗺️" title={T("No scan yet", "ยังไม่ได้ตรวจ")} sub={T("Pick a category, then enter a URL to match", "เลือกหมวด แล้วใส่ URL เพื่อจับคู่")} />}

          {!busy && result && (
            <>
              <div className="sm-summary">
                <div className={`sm-score ${grade.c}`}>
                  <div className="sm-score-num">{score}<span>%</span></div>
                  <div className="sm-score-lbl mono">{T("matched", "จับคู่ได้")}</div>
                </div>
                <div className="sm-sumdetail">
                  <div className="sm-target mono">🌐 {result.url} · {T("category", "หมวด")} {result.cat} · 🔎 {result.pageTermsFound} คำบนหน้า</div>
                  <div className="sm-track"><div className={`sm-fill ${grade.c}`} style={{ width: score + "%" }} /></div>
                  <div className="sm-counts">
                    <span className={`sm-grade ${grade.c}`}>{grade.t}</span>
                    <span className="sm-cnt ok">✅ {complete.length} ครบ</span>
                    <span className="sm-cnt unclear">◐ {unclear.length} ไม่ชัด</span>
                    <span className="sm-cnt miss">⚠️ {missing.length} ขาด</span>
                    <span className="mono faint" style={{ fontSize: 11 }}>เกณฑ์ ≥ {passTh}%</span>
                  </div>
                </div>
              </div>

              <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                ④ Report — สรุปผลการเทียบ
                <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={downloadReport}>⬇ ดาวน์โหลด Report (JSON)</button>
              </div>
              <div className="sm-cols sm-cols3">
                <div className="sm-col">
                  <div className="sm-col-head ok">✅ ครบ <span>{complete.length}</span></div>
                  {complete.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>—</div> : complete.map((i) => (
                    <div key={i.key} className="sm-item ok">
                      <span className="sm-item-mark">✓</span>
                      <div className="sm-item-body">
                        <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                        <div className="sm-item-desc">{i.th}{i.alias && <span className="sm-aliastag">≈ คำต่าง</span>}</div>
                        <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer">🔎 พบใน {i.evTag} · {i.evPath} ↗</a>
                      </div>
                      <span className="sm-conf mono">{i.conf}%</span>
                    </div>
                  ))}
                </div>
                <div className="sm-col">
                  <div className="sm-col-head unclear">◐ ไม่ชัด <span>{unclear.length}</span></div>
                  {unclear.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>—</div> : unclear.map((i) => (
                    <div key={i.key} className="sm-item unclear">
                      <span className="sm-item-mark">?</span>
                      <div className="sm-item-body">
                        <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                        <div className="sm-item-desc">ความมั่นใจต่ำ — ควรตรวจซ้ำ</div>
                        <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer">🔎 อาจอยู่ใน {i.evTag} · {i.evPath} ↗</a>
                        {canEdit && <button className="sm-addvocab" onClick={() => confirmUnclear(i)}>＋ เพิ่มศัพท์</button>}
                      </div>
                      <span className="sm-conf mono warn">{i.conf}%</span>
                    </div>
                  ))}
                </div>
                <div className="sm-col">
                  <div className="sm-col-head miss">⚠️ ขาด <span>{missing.length}</span></div>
                  {missing.length === 0 ? <div className="sm-allgood">🎉 ไม่มีคำที่ขาด!</div> : missing.map((i) => (
                    <div key={i.key} className="sm-item miss">
                      <span className="sm-item-mark">!</span>
                      <div className="sm-item-body"><div className="sm-item-name mono">{i.canon}</div><div className="sm-item-desc">{i.th} — ไม่พบบนหน้าเว็บ</div></div>
                      <span className="sm-item-cat mono">{i.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {addVocab && (
        <div className="uim-overlay" onClick={() => setAddVocab(null)}>
          <div className="uim ornate" onClick={(e) => e.stopPropagation()} style={{ width: 430 }}>
            <div className="uim-title">＋ เพิ่มศัพท์</div>
            <div className="bf">
              <label className="bf-label">ศัพท์หลัก (หัวข้อ) — พิมพ์เพื่อค้นหา</label>
              {(() => {
                const sel = terms.find((t) => t.key === addVocab.key);
                const q = addVocab.q;
                const shown = terms.filter((t) => q == null || q === "" || (t.canon + " " + t.th).toLowerCase().includes(String(q).toLowerCase()));
                return (
                  <div className="sm-combo">
                    <input
                      className="bf-input"
                      value={q != null ? q : sel ? sel.canon + " · " + sel.th : ""}
                      placeholder="พิมพ์เพื่อค้นหาศัพท์หลัก…"
                      onChange={(e) => setAddVocab({ ...addVocab, q: e.target.value, open: true })}
                      onFocus={() => setAddVocab({ ...addVocab, q: "", open: true })}
                    />
                    {addVocab.open && (
                      <div className="sm-combo-list">
                        {shown.length === 0 && <div className="sm-combo-empty">ไม่พบศัพท์หลักที่ตรง</div>}
                        {shown.map((t) => (
                          <button key={t.key} type="button" className={t.key === addVocab.key ? "on" : ""} onClick={() => setAddVocab({ ...addVocab, key: t.key, q: null, open: false })}>
                            {t.canon} · {t.th}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="bf">
              <label className="bf-label">ศัพท์รอง (คำที่เจอ / คำใหม่)</label>
              <input className="bf-input" value={addVocab.alias} onChange={(e) => setAddVocab({ ...addVocab, alias: e.target.value })} placeholder="เช่น งบดุล" autoFocus />
            </div>
            <div className="uim-actions">
              <button className="uim-btn ghost" onClick={() => setAddVocab(null)}>ยกเลิก</button>
              <button className="uim-btn primary" onClick={submitVocab} disabled={!String(addVocab.alias || "").trim()}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
