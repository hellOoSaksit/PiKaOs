/* PiKaOs — Component Library (in-app design system).
   แสดงคอมโพเนนต์ "ตัวจริง" จากชุดที่ให้มา (src/components/ui — ported จากไฟล์อ้างอิง)
   แบบ native ทั้งหมด — ไม่มี iframe. ของที่สร้างเพิ่มแยกอยู่ท้ายหน้าเป็น "ส่วนเสริม". */
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

const Sec = ({ title, en, spec, isNew, children }) => (
  <section className="lib-sec" data-screen-label={title}>
    <div className="lib-sec-head">
      <h2>{title}{isNew && <span className="lib-new">เสริม</span>}</h2>
      <span className="lib-sec-en mono">{en}</span>
    </div>
    <div className="lib-stage">{children}</div>
    {spec && <div className="lib-spec mono">{spec}</div>}
  </section>
);

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

const SEARCH_ITEMS = [
  { id: 1, icon: "📄", title: "คู่มือ onboarding เอเจนต์ใหม่", meta: "เอกสาร · เขียน" },
  { id: 2, icon: "🐛", title: "บั๊กหน้า login บนมือถือ", meta: "งาน · ด่วน" },
  { id: 3, icon: "🧑‍💻", title: "อ้อย นักวิเคราะห์", meta: "สมาชิก · ฝ่ายวิเคราะห์" },
  { id: 4, icon: "📊", title: "รายงานโทเคนรายเดือน", meta: "รายงาน · ผู้ดูแล" },
];
const FILTER_ROWS = [
  { id: 1, icon: "📜", title: "ตรวจ schema ฐานข้อมูล", meta: "อ้อย · วิเคราะห์", status: "active", dept: "analysis" },
  { id: 2, icon: "📜", title: "เขียน API ใบแจ้งหนี้", meta: "บีม · พัฒนา", status: "queued", dept: "dev" },
  { id: 3, icon: "📜", title: "สรุปงานวิจัยคู่แข่ง", meta: "ใหม่ · วิจัย", status: "done", dept: "research" },
  { id: 4, icon: "📜", title: "ทดสอบ regression v0.2", meta: "บีม · พัฒนา", status: "active", dept: "dev" },
];
const FILTER_FACETS = [
  { key: "status", label: "สถานะ", options: [{ value: "queued", label: "รอคิว" }, { value: "active", label: "กำลังทำ" }, { value: "done", label: "เสร็จ" }] },
  { key: "dept", label: "แผนก", options: [{ value: "analysis", label: "วิเคราะห์" }, { value: "dev", label: "พัฒนา" }, { value: "research", label: "วิจัย" }] },
];
const NOTIF_ITEMS = [
  { id: 1, unread: true, av: "❓", avTone: "gold", actor: "อ้อย นักวิเคราะห์", text: "ขออนุมัติ schema ฐานข้อมูลก่อนเริ่ม implement", time: "เมื่อสักครู่", action: "accept-decline" },
  { id: 2, unread: true, av: "🤖", avTone: "neutral", actor: "HERMES", text: "สร้างงาน “ทดสอบ” และห้อง “ทดสอบ” แล้ว", time: "5 นาทีที่แล้ว" },
  { id: 3, unread: false, av: "✓", avTone: "ok", actor: "ระบบ", text: "งาน “สรุปวิจัย” เสร็จสมบูรณ์", time: "เมื่อวาน" },
];

function ToastDemo() {
  const toast = useToast();
  return (
    <>
      <KitButton kind="ghost" size="sm" onClick={() => toast("บันทึกสำเร็จ", "ok")}>Toast สำเร็จ</KitButton>
      <KitButton kind="ghost" size="sm" onClick={() => toast("เกิดข้อผิดพลาด ลองใหม่", "err")}>Toast ผิดพลาด</KitButton>
    </>
  );
}

function LibraryBody({ onBack, t }) {
  const tx = (typeof t === "function") ? t : ((k) => k);
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

  return (
    <div className="content-pad fade-in lib-wrap" data-no-lex>
      <PageHead kicker={tx("lib.kicker")} title={tx("lib.title")}
        desc={tx("lib.desc")}
        actions={<Btn kind="ghost" sm icon="←" onClick={onBack}>{tx("lib.back")}</Btn>} />

      {/* ---------- 3D LETTERS / TYPE ---------- */}
      <Sec title="ตัวอักษร & แบรนด์" en="TYPE / 3D LETTERS" spec="Letters3D (Mitr 700, stroke-behind-fill) · IBM Plex Sans Thai (UI) · JetBrains Mono (kicker/โค้ด)">
        <Letters3D word="PiKaOs" style={{ fontSize: 56 }} />
        <div className="lib-type-list">
          <div className="lib-type-row"><span className="lt-tag mono">Mitr 700</span><span style={{ fontFamily: "var(--font-toon)", fontWeight: 700, fontSize: 26 }}>พีคะโอเอส · PiKaOs</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Plex 700</span><span style={{ fontWeight: 700, fontSize: 20 }}>หัวข้อหลัก / Page title</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Plex 400</span><span style={{ fontSize: 14, color: "var(--ink-2)" }}>เนื้อหาทั่วไป body text อ่านสบายที่ 14px line-height 1.65</span></div>
          <div className="lib-type-row"><span className="lt-tag mono">Mono 500</span><span className="mono" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}>KICKER · META · CODE</span></div>
        </div>
      </Sec>

      {/* ---------- BUTTONS ---------- */}
      <Sec title="ปุ่ม" en="BUTTONS" spec="Button — kind: gold/ghost/danger · size sm · icon · loading · disabled · 3D base shadow กดยุบ-สปริงกลับ">
        <KitButton kind="gold">บันทึก</KitButton>
        <KitButton kind="ghost">ยกเลิก</KitButton>
        <KitButton kind="danger">ลบ</KitButton>
        <KitButton kind="gold" size="sm">เล็ก</KitButton>
        <KitButton kind="ghost" size="sm" icon>⚙</KitButton>
        <KitButton kind="gold" disabled>ปิดใช้งาน</KitButton>
        <Spinner dark />
      </Sec>

      {/* ---------- DROPDOWN ---------- */}
      <Sec title="ดรอปดาวน์" en="SELECT / MENU / MULTI-SELECT" spec="เมนูสปริง .96→1 · ติ๊กถูกอินดิโกเด้ง · MultiSelect มีตัวนับ + ✓ box">
        <Select value={sel} onChange={setSel} options={[{ value: "opt1", label: "ตัวเลือกแรก" }, { value: "opt2", label: "ตัวเลือกที่สอง" }, { value: "opt3", label: "ตัวเลือกที่สาม" }]} />
        <Menu label="การกระทำ" items={[{ label: "แก้ไข", onSelect: () => toast("แก้ไข", "ok") }, { label: "ทำสำเนา", onSelect: () => toast("ทำสำเนา", "ok") }, { label: "ลบ", danger: true, onSelect: () => toast("ลบ", "err") }]} />
        <MultiSelect label="แผนก" options={FILTER_FACETS[1].options} values={multi.map(v => v === "opt1" ? "dev" : v)} onChange={setMulti} />
      </Sec>

      {/* ---------- INPUTS ---------- */}
      <Sec title="ช่องกรอกข้อมูล" en="INPUTS" spec="โฟกัส = ขอบอินดิโก + ริง 3px · error = ริงแดง + ข้อความใต้ช่อง">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340 }}>
          <input className="bf-input" placeholder="ข้อความปกติ…" />
          <input className="bf-input" defaultValue="มีค่าอยู่แล้ว" />
          <div className="lf has-error" style={{ margin: 0 }}>
            <input className="lf-input" defaultValue="ค่าไม่ถูกต้อง" />
            <span className="lf-error">กรุณาตรวจสอบข้อมูล</span>
          </div>
          <input className="bf-input" disabled placeholder="ปิดใช้งาน" />
        </div>
      </Sec>

      {/* ---------- FORM CONTROLS ---------- */}
      <Sec title="ตัวควบคุมฟอร์ม" en="FORM CONTROLS" spec="Checkbox — ✓ เด้ง · Switch — ลูกบิดยืดตอนกดแล้วสปริงข้าม · Segmented — pill ขาว + ตัวอินดิโก">
        <Checkbox checked={ck} onChange={setCk} label="ยอมรับเงื่อนไข" />
        <Switch checked={sw1} onChange={setSw1} label="การแจ้งเตือน" />
        <Switch checked={sw2} onChange={setSw2} label="โหมดเงียบ" />
        <div className="seg" style={{ maxWidth: 280 }}>
          {[["day", "วัน"], ["week", "สัปดาห์"], ["month", "เดือน"]].map(([k, l]) => (
            <button key={k} type="button" className={`seg-btn ${seg === k ? "on" : ""}`} onClick={() => setSeg(k)}>{l}</button>
          ))}
        </div>
      </Sec>

      {/* ---------- BADGES ---------- */}
      <Sec title="ป้ายสถานะ & แท็ก" en="BADGES & TAGS" spec="tint recipe — bg 9–14% / border 35–45% · urgent = crimson ทึบ ตัวขาว">
        <Badge variant="st-queued" dot>รอคิว</Badge>
        <Badge variant="st-active" dot>กำลังทำ</Badge>
        <Badge variant="st-done" dot>เสร็จ</Badge>
        <Badge variant="pr-high">สำคัญ</Badge>
        <Badge variant="pr-urgent">ด่วน</Badge>
        <Badge variant="ft-local" mono>LOCAL</Badge>
        <span className="rank S">S</span><span className="rank A">A</span><span className="rank B">B</span>
      </Sec>

      {/* ---------- TABS ---------- */}
      <Sec title="แท็บ" en="TABS" spec="segmented pill — ตัวเลือก active พื้นขาว + เงา raised">
        <div className="tabs">
          {[["all", "ทั้งหมด"], ["docs", "เอกสาร"], ["qa", "งานวิจัย"]].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </Sec>

      {/* ---------- PROGRESS ---------- */}
      <Sec title="ความคืบหน้า" en="PROGRESS" spec="Progress — fill สปริงตามค่า, เขียวที่ 100% · Spinner 15px">
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}><Progress value={prog} /></div>
        <KitButton kind="ghost" size="sm" onClick={() => setProg(p => (p >= 100 ? 20 : p + 20))}>+20%</KitButton>
      </Sec>

      {/* ---------- FEEDBACK ---------- */}
      <Sec title="ฟีดแบ็ก" en="TOAST / MODAL / TOOLTIP" spec="toast เด้งขึ้นมุมขวาล่าง หาย 3s · modal pop .9→1 บน backdrop เบลอ · tooltip สปริงจากล่าง">
        <ToastDemo />
        <KitButton kind="ghost" size="sm" onClick={() => setModalOpen(true)}>เปิด Modal</KitButton>
        <Tooltip label="ต้องการความช่วยเหลือ? ติดต่อฝ่ายไอที">
          <KitButton kind="ghost" size="sm" icon>?</KitButton>
        </Tooltip>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="ยืนยันการดำเนินการ"
          footer={<>
            <KitButton kind="ghost" onClick={() => setModalOpen(false)}>ยกเลิก</KitButton>
            <KitButton kind="gold" onClick={() => { setModalOpen(false); toast("ยืนยันแล้ว", "ok"); }}>ยืนยัน</KitButton>
          </>}>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.65, margin: 0 }}>นี่คือ Modal จากชุดคอมโพเนนต์ — กด Esc หรือคลิกพื้นหลังเพื่อปิด</p>
        </Modal>
      </Sec>

      {/* ---------- STATUS POPUPS ---------- */}
      <Sec title="ป๊อปอัพสถานะ" en="STATUS POPUPS" spec="ไอคอนวงกลม 62px เด้ง .3→1 · success/error/warning/info/confirm">
        {["success", "error", "warning", "info", "confirm"].map(t => (
          <KitButton key={t} kind="ghost" size="sm" onClick={() => setStatus(t)}>{t}</KitButton>
        ))}
        <StatusPopup open={!!status} type={status || "info"} onClose={() => setStatus(null)}
          title={{ success: "บันทึกสำเร็จ", error: "เกิดข้อผิดพลาด", warning: "โปรดระวัง", info: "ข้อมูล", confirm: "ยืนยันการลบ?" }[status] || ""}
          message={{ success: "ข้อมูลถูกบันทึกเรียบร้อยแล้ว", error: "ไม่สามารถเชื่อมต่อได้ ลองอีกครั้ง", warning: "โควตาโทเคนใกล้เต็มแล้ว", info: "ระบบจะปิดปรับปรุงคืนนี้ 02:00", confirm: "การลบนี้ย้อนกลับไม่ได้" }[status] || ""}
          confirmLabel={status === "confirm" ? "ลบเลย" : undefined}
          onConfirm={status === "confirm" ? () => { setStatus(null); toast("ลบแล้ว", "err"); } : undefined} />
      </Sec>

      {/* ---------- TEXT & HIGHLIGHT ---------- */}
      <Sec title="ข้อความ & ไฮไลต์" en="TEXT FORMAT / HIGHLIGHT" spec="fmt-toolbar B/I/U + align · mark.hl tints gold/emerald/crimson/amethyst 16–18%">
        <div style={{ width: "100%", maxWidth: 420 }}><TextFormatToolbar sample="พิมพ์ข้อความตัวอย่าง แล้วลองกด B / I / U ดูได้เลย" /></div>
        <p style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--ink-2)", width: "100%", margin: 0 }}>
          ไฮไลต์ <Highlight>ค่าเริ่มต้น (gold)</Highlight> · <Highlight tone="emerald">สำเร็จ</Highlight> · <Highlight tone="crimson">ผิดพลาด</Highlight> · <Highlight tone="amethyst">งานวิจัย</Highlight>
        </p>
      </Sec>

      {/* ---------- TAGS & DATE ---------- */}
      <Sec title="แท็ก & วันที่" en="TAGS / DATE PICKER" spec="พิมพ์แล้ว Enter เพิ่มแท็ก (chip-pop) · ปฏิทินสปริง วันนี้ = ริงทอง เลือกแล้ว = pill ทอง">
        <div style={{ width: "100%", maxWidth: 380 }}><Tags value={tags} onChange={setTags} placeholder="เพิ่มแท็ก…" accent /></div>
        <DatePicker value={date} onChange={setDate} />
      </Sec>

      {/* ---------- SOFT DELETE ---------- */}
      <Sec title="ลบแบบปลอดภัย" en="DELETE FLOW" spec="🗑 → confirm นับถอย → soft delete (ขีดฆ่า + Undo 5s) → ลบถาวร">
        <div className="sd-list" style={{ width: "100%" }}>
          <SoftDeleteRow icon="📄" title="รายงานไตรมาส 3.pdf" meta="2.4 MB · เมื่อวาน" />
          <SoftDeleteRow icon="🧾" title="บันทึกประชุมทีมวิเคราะห์" meta="เอกสาร · สัปดาห์ก่อน" />
        </div>
      </Sec>

      {/* ---------- TODO ---------- */}
      <Sec title="รายการสิ่งที่ต้องทำ" en="TO-DO LIST" spec="ติ๊กแล้วทาเขียว + ขีดฆ่า · ตัวนับ + progress อัปเดตสด · Enter เพิ่มรายการ">
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Todo title="งานวันนี้" initial={[{ text: "ตรวจ schema ฐานข้อมูล", done: true }, { text: "เขียน API ใบแจ้งหนี้" }, { text: "รีวิวโค้ดของบีม" }]} />
        </div>
      </Sec>

      {/* ---------- SEARCH ---------- */}
      <Sec title="ค้นหา" en="SEARCH" spec="โฟกัสเปิดผลลัพธ์ (สปริง) · กรองสด + ไฮไลต์คำที่ตรง · ↑/↓ เลื่อน Enter เลือก">
        <div style={{ width: "100%", maxWidth: 380 }}>
          <Search items={SEARCH_ITEMS} placeholder="ค้นหางาน คน หรือไฟล์…" onSelect={(it) => toast("เลือก: " + it.title, "ok")} />
        </div>
      </Sec>

      {/* ---------- FILTER ---------- */}
      <Sec title="ตัวกรอง" en="FILTER" spec="ค้นหา + MultiSelect facets · ชิปตัวกรองถอดได้ + ล้างทั้งหมด · ตัวนับที่ตรง">
        <div style={{ width: "100%" }}><Filter rows={FILTER_ROWS} facets={FILTER_FACETS} /></div>
      </Sec>

      {/* ---------- LOADING ---------- */}
      <Sec title="โหลดดิ้ง" en="LOADING POPUP" spec="pixel walker (สไปรต์ 40 เฟรม steps(40)) + progress · เสร็จแล้วเด้งปิดเอง">
        <KitButton kind="ghost" size="sm" onClick={() => setLoadOpen(true)}>เปิดป๊อปอัพโหลด</KitButton>
        <LoadingPopup open={loadOpen} title="กำลังโหลดพื้นที่ทำงาน…" onDone={() => { setLoadOpen(false); toast("โหลดสำเร็จ", "ok"); }} />
      </Sec>

      {/* ---------- NOTIFICATIONS ---------- */}
      <Sec title="การแจ้งเตือน" en="NOTIFICATIONS" spec="กระดิ่ง + ตัวนับ unread · แผงสปริง · แถว assign มี Accept/Decline · Mark all read">
        <Notifications items={NOTIF_ITEMS} />
      </Sec>

      {/* ================= EXTENSIONS ================= */}
      <LibDivider title="คอมโพเนนต์เสริม" en="EXTENSIONS" desc="ตัวที่สร้างเพิ่มจากชุดหลัก PiKaOs — ใช้ภาษาการออกแบบเดียวกันทุกประการ" />

      <Sec title="แถวเครื่องมือ" en="TOOL ROWS" isNew spec="ใช้ในหน้า ‘จัดการเครื่องมือ’ (MCP · LINE OA · Telegram · CMD …)">
        <div className="tool-list" style={{ width: "100%" }}>
          <div className={`tool-row ${toolOn ? "" : "off"}`}>
            <span className="tool-ic">🔌</span>
            <div className="tool-bd"><div className="tool-name">MCP · ฐานความรู้</div><div className="tool-meta mono">MCP Server · endpoint: https://host/mcp</div></div>
            <label className="ck-inline" data-no-lex><input type="checkbox" checked={toolOn} onChange={e => setToolOn(e.target.checked)} /></label>
            <button type="button" className="chip-act">✎</button>
            <button type="button" className="chip-act danger">✕</button>
          </div>
          <div className="tool-row">
            <span className="tool-ic">✈️</span>
            <div className="tool-bd"><div className="tool-name">แจ้งเตือน Telegram</div><div className="tool-meta mono">Telegram Bot · chatId: -100xxxx</div></div>
            <label className="ck-inline" data-no-lex><input type="checkbox" defaultChecked /></label>
            <button type="button" className="chip-act">✎</button>
            <button type="button" className="chip-act danger">✕</button>
          </div>
        </div>
      </Sec>

      <Sec title="ชิปทักษะ (โหมดจัดการ)" en="SKILL CHIPS" isNew spec="เลือก/แก้/ลบ พร้อม SKILL.md กำกับ">
        <div className="opt-chips">
          <button type="button" className="opt-chip on">วิเคราะห์ 📄</button>
          <button type="button" className="opt-chip">เขียนโค้ด 📄</button>
          <span className="opt-chip manage">ออกแบบระบบ 📄<button className="chip-act">✎</button><button className="chip-act danger">✕</button></span>
        </div>
      </Sec>

      <Sec title="ตัวแก้ไขเนื้อหา (tiptap)" en="RICH BODY" isNew spec="ใช้ทุกช่อง Body: SKILL.md, เนื้อหา Codex · toolbar B/I/H1/H2/list/code">
        <div style={{ width: "100%", maxWidth: 460 }}>
          <RichBody value={"<p>พิมพ์เนื้อหาที่นี่ได้เลย — <strong>จัดรูปแบบ</strong>ได้</p>"} onChange={() => {}} placeholder="พิมพ์เนื้อหา…" />
        </div>
      </Sec>

      <Sec title="ป๊อปอัพระบบในแอป" en="APP OVERLAYS" isNew spec="ตัวที่แอปเรียกใช้จริง — uiConfirm (ลบ+นับถอย) · uiLoading (walker) · pushNotify (กระดิ่งงาน)">
        <Btn kind="ghost" sm onClick={() => window.uiConfirm && window.uiConfirm({ title: "ย้ายไปถังขยะ", message: "ย้ายรายการนี้ไปถังขยะ? กู้คืนได้ภายหลัง", confirmText: "ย้ายไปถังขยะ", danger: true })}>กล่องยืนยันลบ</Btn>
        <Btn kind="ghost" sm onClick={() => { const h = window.uiLoading && window.uiLoading({ title: "HERMES กำลังวิเคราะห์งาน…", message: "demo-worklog.md" }); setTimeout(() => h && h.close && h.close(), 2600); }}>โหลดดิ้งระบบ</Btn>
        <Btn kind="ghost" sm onClick={() => window.pushNotify && window.pushNotify({ from: "อ้อย นักวิเคราะห์", question: "ขออนุมัติ schema ฐานข้อมูลก่อนเริ่ม implement ครับ", taskTitle: "ออกแบบ DB" })}>ส่งการแจ้งเตือน</Btn>
      </Sec>

      <Sec title="แถบบันทึกการแก้ไข" en="SAVE BAR" isNew spec="แถบลอยด้านล่าง — โผล่ขึ้นเมื่อมีการแก้ไขที่ยังไม่บันทึก · บันทึก/ยกเลิก · ใช้ในหน้า ‘บทบาทและสิทธิ์’">
        <KitButton kind="ghost" size="sm" onClick={() => setSaveN(n => (n > 0 ? 0 : 3))}>{saveN > 0 ? "ซ่อนแถบ" : "จำลองแก้ข้อมูล"}</KitButton>
        <span className="mono faint" style={{ fontSize: 12 }}>{saveN > 0 ? saveN + " รายการรอบันทึก" : "ไม่มีการแก้ไข"}</span>
        <SaveBar count={saveN} onSave={() => { setSaveN(0); toast("บันทึกแล้ว", "ok"); }} onCancel={() => setSaveN(0)}
          saveLabel="บันทึก" cancelLabel="ยกเลิก" label={"แก้ไข " + saveN + " รายการ ยังไม่บันทึก"} />
      </Sec>

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
