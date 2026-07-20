/* ---- Feature status tag: tells users plainly whether something is wired to AI ----
   live  = ต่อ AI จริง · มีผล
   local = บันทึกจริงในเครื่อง · มีผลกับระบบ (ไม่ใช่ AI)
   demo  = ตัวอย่างสาธิต · ยังไม่มีผลจริง
   Not barrel-exported: no consumer imports FeatureTag by name — it's the internal
   `tag` renderer that PageHead and HelpNote call, kept alongside them. */
const FEATURE_TAGS = {
  live:  { ic: "🟢", label: "ต่อ AI จริง · มีผล", cls: "ft-live", tip: "ส่วนนี้เชื่อมต่อกับ AI จริง — พิมพ์แล้วได้คำตอบจริง" },
  local: { ic: "💾", label: "บันทึกจริง · มีผล", cls: "ft-local", tip: "ข้อมูลถูกบันทึกจริงในเครื่องของคุณ มีผลต่อระบบจริง ( ยังไม่ได้ต่อ AI )" },
  demo:  { ic: "◌", label: "ตัวอย่างสาธิต · ยังไม่มีผล", cls: "ft-demo", tip: "ส่วนนี้เป็นตัวอย่างเพื่อแสดงหน้าตา ยังไม่ได้เชื่อมกับ AI จริง" },
};

export default function FeatureTag({ kind = "demo" }) {
  const t = FEATURE_TAGS[kind] || FEATURE_TAGS.demo;
  return <span className={`feature-tag ${t.cls}`} title={t.tip}><span className="ft-ic">{t.ic}</span>{t.label}</span>;
}
