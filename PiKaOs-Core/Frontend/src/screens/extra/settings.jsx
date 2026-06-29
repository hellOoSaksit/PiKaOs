/* PiKaOs — SETTINGS: visual theme + language/vocabulary picker (decoupled),
   and the reusable API-connections panel.
   ไม่ hardcode ภาษา/รูปแบบคำศัพท์ — สแกนจาก src/data/i18n/*.json (เมตาในแต่ละไฟล์):
   LEX_LANGS = รายการภาษา (ตัดซ้ำแล้ว) · stylesForLang(code) = ทุกรูปแบบคำศัพท์ของภาษานั้น */
import React from 'react';
const { useState, useEffect } = React;
import { Btn, PageHead, Panel } from '../../components/components.jsx';
import { Select } from '../../components/ui/Dropdown.jsx';
import { LEX_LANGS, langByCode, stylesForLang, packById } from '../../lib/i18n.jsx';
import { API_PROVIDERS, loadApiKeys, maskKey, saveApiKeys } from '../../lib/store.jsx';

const THEME_CARDS = [
  { key: "pro",      name: "กลางวัน", en: "Day",   bg: "#f4f6f8", chips: ["#4361ee", "#ffffff", "#111726"] },
  { key: "pro-dark", name: "กลางคืน", en: "Night", bg: "#111419", chips: ["#6076f6", "#171a21", "#e8eaef"] },
];

function ApiConnections({ t, bare }) {
  const [keys, setKeys] = useState(() => (window.loadApiKeys ? loadApiKeys() : []));
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(API_PROVIDERS[0].key);
  const [secret, setSecret] = useState("");
  useEffect(() => { saveApiKeys(keys); }, [keys]);
  const add = () => {
    const n = name.trim(); if (!n || !secret.trim()) return;
    setKeys(prev => [...prev, { id: "api" + Date.now().toString(36), name: n, provider, key: secret.trim() }]);
    setName(""); setSecret("");
  };
  const remove = (id) => setKeys(prev => prev.filter(k => k.id !== id));
  return (
    <Panel title={bare ? null : t("api.title")} en={bare ? null : "API CONNECTIONS"} icon={bare ? null : "🔌"} right={bare ? null : <span className="mono faint" style={{ fontSize: 11 }}>{t("api.count", { n: keys.length })}</span>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>{t("api.desc")}</div>
      {keys.length > 0 && (
        <div className="api-list">
          {keys.map(k => (
            <div key={k.id} className="api-row">
              <span className="api-ic">🔑</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="api-name">{k.name}</div>
                <div className="mono faint" style={{ fontSize: 11 }}>{(API_PROVIDERS.find(p => p.key === k.provider) || {}).label || k.provider} · {maskKey(k.key)}</div>
              </div>
              <button className="api-del" title={t("api.del")} onClick={() => remove(k.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
      <div className="api-add">
        <input className="bf-input" placeholder={t("api.namePh")} value={name} onChange={e => setName(e.target.value)} />
        <div className="api-add-row">
          <Select value={provider} onChange={setProvider} minWidth={150}
            options={API_PROVIDERS.map(p => ({ value: p.key, label: p.label }))} />
          <input className="bf-input" type="password" placeholder={t("api.secretPh")} value={secret} onChange={e => setSecret(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
          <Btn kind="gold" sm icon="➕" onClick={add}>{t("common.add")}</Btn>
        </div>
      </div>
    </Panel>
  );
}

function Settings({ theme, setTheme, lex, setLex, pickLanguage, language, formal, go, t }) {
  const curTheme = THEME_CARDS.find(c => c.key === theme) || THEME_CARDS[0];
  const langs = LEX_LANGS;                       // ภาษาที่แสดง — ตัดซ้ำแล้ว
  const curLang = langByCode(language) || langs[0];
  const styles = stylesForLang(language);        // รูปแบบคำศัพท์ของภาษาที่เลือก — แสดงครบทุกไฟล์
  const curStyle = packById(lex) || styles[0] || {};
  const themeName = (c) => t(c.key === "pro" ? "theme.day" : "theme.night");
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={t("set.kicker")} title={t("set.title")} tag="local"
        desc={t("set.desc")} />

      <div className="col" style={{ gap: 16 }}>
        <Panel title={t("set.appearance")} en="APPEARANCE" icon="🎨" right={<span className="mono faint" style={{ fontSize: 11 }}>{t("set.current", { name: themeName(curTheme) })}</span>}>
          <div className="theme-picker">
            {THEME_CARDS.map(c => (
              <button key={c.key} className={`theme-card ${theme === c.key ? "on" : ""}`} onClick={() => setTheme(c.key)}>
                <div className="theme-swatch" style={{ background: c.bg }}>
                  {c.chips.map((ch, i) => <span key={i} className="sw-chip" style={{ background: ch }} />)}
                </div>
                <div className="theme-card-body">
                  <div><div className="tcb-name">{themeName(c)}</div><div className="tcb-en">{c.en}</div></div>
                  {theme === c.key && <span className="theme-card-check">✓</span>}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("set.lang")} en="LANGUAGE" icon="🌐" right={<span className="mono faint" style={{ fontSize: 11 }}>{t("set.current", { name: curLang.en })}</span>}>
          <div className="lex-picker" data-no-lex>
            {langs.map(l => (
              <button key={l.code} className={`lex-card ${language === l.code ? "on" : ""}`} onClick={() => pickLanguage(l.code)}>
                <span className="lex-ic" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>{l.code.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tcb-name">{l.label}</span>
                    <span className="tcb-en">{l.en}</span>
                    <span className="lex-type">{t("set.styleCount", { n: l.styles.length })}</span>
                    {language === l.code && <span className="theme-card-check" style={{ marginLeft: "auto" }}>✓</span>}
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{l.sample}</div>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("set.style")} en="STYLE" icon="🔤" right={<span className="mono faint" style={{ fontSize: 11 }}>{curLang.en} · {curStyle.en}</span>}>
          <div className="lex-picker" data-no-lex>
            {styles.map(s => (
              <button key={s.id} className={`lex-card ${lex === s.id ? "on" : ""}`} onClick={() => setLex(s.id)}>
                <span className="lex-ic">{s.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tcb-name">{s.title}</span>
                    <span className="tcb-en">{s.en}</span>
                    {s.type && <span className="lex-type">{s.type}</span>}
                    {lex === s.id && <span className="theme-card-check" style={{ marginLeft: "auto" }}>✓</span>}
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{s.sample}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
            {curStyle.desc || t("set.styleFallback")}
            <span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--ink-4)", marginTop: 4 }} data-no-lex>{t("set.scanNote")}</span>
          </div>
        </Panel>

        <Panel title={t("set.design")} en="DESIGN SYSTEM" icon="🧩">
          <div className="row" style={{ justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{t("set.design.item")}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.6 }}>{t("set.design.itemDesc")}</div>
            </div>
            <Btn kind="gold" icon="🧩" onClick={() => go && go("library")}>{t("set.design.open")}</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export { THEME_CARDS, ApiConnections, Settings };
