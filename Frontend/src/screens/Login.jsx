/* PiKaOs — Login screen (auth gate).
   Owns the sign-in / forgot-password form. Calls `onLogin(usernameOrEmail, password)`
   (from useAuth) to start a session; on success the auth state flips and App swaps
   this screen out. Forgot-password posts to the backend but always shows the same
   "check your inbox" screen (never reveals whether an account exists). */
import React from 'react';
const { useState, useEffect } = React;
import * as api from '../lib/api.js';

const LOGO_TILTS = ["-9deg", "6deg", "-5deg", "8deg", "-7deg", "5deg"];

// --- underwater scene actors (pure CSS/SVG; cheap + cute, no Three.js so login paints instantly) ---
const UW_FISH = [
  { top: "20%", dur: 30, delay: 0,   dir: 1,  adir: "normal",  sc: 1,    bob: 3.2, color: "#ff9f68" },
  { top: "37%", dur: 38, delay: -9,  dir: -1, adir: "reverse", sc: 0.82, bob: 4.0, color: "#ffd166" },
  { top: "53%", dur: 33, delay: -17, dir: 1,  adir: "normal",  sc: 1.15, bob: 3.6, color: "#67c9b8" },
  { top: "67%", dur: 44, delay: -25, dir: -1, adir: "reverse", sc: 0.7,  bob: 4.4, color: "#9db4ff" },
  { top: "30%", dur: 52, delay: -33, dir: 1,  adir: "normal",  sc: 0.58, bob: 5.0, color: "#ff8fab" },
];
const UW_WEEDS = [
  { left: "6%",  h: 96,  dur: 5.0, delay: 0,    color: "#2f8f6b" },
  { left: "15%", h: 62,  dur: 6.5, delay: -1.5, color: "#28825f" },
  { left: "83%", h: 104, dur: 5.5, delay: -0.8, color: "#2f8f6b" },
  { left: "92%", h: 70,  dur: 7.0, delay: -2.2, color: "#28825f" },
];
function Fish({ color }) {
  return (
    <svg viewBox="0 0 64 40" width="60" height="38" aria-hidden="true">
      <path d="M16 20 L2 6 L2 34 Z" fill={color} opacity=".82" />
      <ellipse cx="38" cy="20" rx="22" ry="13" fill={color} />
      <path d="M30 8 Q40 0 47 10 Z" fill={color} opacity=".65" />
      <circle cx="50" cy="16" r="3.4" fill="#1c2b33" />
      <circle cx="51.2" cy="14.8" r="1.1" fill="#fff" />
    </svg>
  );
}

function validateUser(v) {
  const s = (v || "").trim();
  if (!s) return "login.val.userReq";
  if (s.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "login.val.emailBad";
  } else {
    if (s.length < 3) return "login.val.userShort";
    if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "login.val.userChars";
  }
  return "";
}
function validatePw(v) {
  if (!v) return "login.val.pwReq";
  if (v.length < 6) return "login.val.pwShort";
  return "";
}

function LoginErr({ children }) {
  return (
    <span className="lf-error">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.5V8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
      </svg>
      {children}
    </span>
  );
}

export function Login({ onLogin, t, language, onLang }) {
  const [view, setView] = useState("login");      // login | forgot | forgot-sent
  const [user, setUser] = useState("somchai");
  const [pw, setPw] = useState("");
  const [touched, setTouched] = useState({ user: false, pw: false });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [sentTo, setSentTo] = useState("");

  // hide the off-canvas hamburger (#nav-burger / .nav-scrim, injected into <body> by fx.js) while
  // the login screen is up — there is no sidebar to open here.
  useEffect(() => { document.body.classList.add("on-login"); return () => document.body.classList.remove("on-login"); }, []);

  const userErr = validateUser(user);
  const pwErr = validatePw(pw);
  const word = "PiKaOS!".split("");
  const jelly = (e) => {
    const el = e.currentTarget;
    el.classList.remove("jelly", "drop");
    void el.offsetWidth;
    el.classList.add("jelly");
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ user: true, pw: true });
    setFormError("");
    if (userErr || pwErr) return;
    setBusy(true);
    try {
      await onLogin(user.trim(), pw);   // success → auth state flips, App swaps this screen out
    } catch (err) {
      if (err.status === 401 || err.status === 403) setFormError("login.err.invalid");
      else if (err.status === 0) setFormError("login.err.network");
      else setFormError("login.err.server");
    } finally {
      setBusy(false);
    }
  };
  const submitForgot = async (e) => {
    e.preventDefault();
    setTouched({ user: true, pw: false });
    if (validateUser(user)) return;
    setBusy(true);
    try {
      await api.forgotPassword(user.trim());
    } catch (err) { /* never reveal account existence — show the same screen */ }
    setBusy(false);
    setSentTo(user.trim());
    setView("forgot-sent");
  };
  const reset = () => { setView("login"); setFormError(""); setTouched({ user: false, pw: false }); };
  const isForgot = view === "forgot";

  return (
    <div className="login-stage login-underwater"
      onMouseMove={(e) => {
        e.currentTarget.style.setProperty("--px", (e.clientX / window.innerWidth - 0.5).toFixed(3));
        e.currentTarget.style.setProperty("--py", (e.clientY / window.innerHeight - 0.5).toFixed(3));
      }}>
      <div className="login-scene" aria-hidden="true">
        <div className="uw-water" />
        <div className="uw-rays" />
        {UW_FISH.map((f, i) => (
          <div key={i} className="uw-fish" style={{ top: f.top, "--dur": f.dur + "s", "--delay": f.delay + "s", "--adir": f.adir }}>
            <div className="uw-bob" style={{ "--bd": f.bob + "s" }}>
              <span className="uw-fish-svg" style={{ transform: `scaleX(${f.dir}) scale(${f.sc})` }}><Fish color={f.color} /></span>
            </div>
          </div>
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <span key={"b" + i} className="uw-bub"
            style={{ left: `${7 + i * 10}%`, "--bd": (7 + (i % 4) * 2) + "s", "--delay": (-i * 1.3) + "s", "--bs": (4 + (i % 3) * 3) + "px" }} />
        ))}
        <div className="uw-floor">
          <svg className="uw-bed" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 120 Q180 70 360 110 T720 100 T1080 112 T1440 95 L1440 200 L0 200 Z" /></svg>
          {UW_WEEDS.map((w, i) => (
            <span key={"w" + i} className="uw-weed"
              style={{ left: w.left, height: w.h, "--dur": w.dur + "s", "--delay": w.delay + "s", background: `linear-gradient(${w.color}, #1f6b50)` }} />
          ))}
        </div>
      </div>
      {onLang && (
        <div className="login-lang" role="group" aria-label="language">
          <button type="button" className={language === "th" ? "on" : ""} onClick={() => onLang("th")}>TH</button>
          <button type="button" className={language === "en" ? "on" : ""} onClick={() => onLang("en")}>EN</button>
        </div>
      )}
      <div className="login-hero">
        <div className="login-logo" aria-label="PiKaOS!">
          {word.map((ch, i) => (
            <span key={i} className="login-ltr-wrap" style={{ "--i": i }}>
              <span className="ltr drop" onClick={jelly}
                style={{ "--i": i, "--tilt": LOGO_TILTS[i % LOGO_TILTS.length] }}>{ch}</span>
            </span>
          ))}
        </div>
        <div className="login-tagline rise-in" style={{ animationDelay: "1.05s" }}>{t("login.tagline")}</div>
      </div>

      {view === "forgot-sent" ? (
        <section className="login-card rise-in" style={{ animationDelay: "1.2s" }}>
          <div className="login-success">
            <div className="login-success-ic">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7.5L12 13L20 7.5" stroke="var(--emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="4" y="6" width="16" height="12" rx="2" stroke="var(--emerald)" strokeWidth="2" />
              </svg>
            </div>
            <div className="login-success-title">{t("login.sent.title")}</div>
            <div className="login-success-sub">{t("login.sent.sub1")}</div>
            <div className="login-monochip">{sentTo}</div>
            <div className="login-success-sub">{t("login.sent.sub2")}</div>
            <button className="login-back" onClick={reset}>{t("login.back")}</button>
          </div>
        </section>
      ) : (
        <form className="login-card rise-in" style={{ animationDelay: "1.2s" }}
          onSubmit={isForgot ? submitForgot : submit} noValidate>
          <div className="login-cardhead">
            <h1 className="login-card-title">{isForgot ? t("login.reset.title") : t("login.title")}</h1>
            <span className="login-kicker">{isForgot ? t("login.recovery.kicker") : t("login.auth.kicker")}</span>
          </div>

          {isForgot && (
            <p className="login-note">{t("login.forgot.noteA")} <strong>{t("login.forgot.noteB")}</strong> {t("login.forgot.noteC")}</p>
          )}

          {formError && (
            <div className="form-alert error" role="alert">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
                <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {t(formError)}
            </div>
          )}

          <div className={"lf" + (touched.user && userErr ? " has-error" : "")}>
            <label className="lf-label" htmlFor="login-user">{t("login.field.user")}</label>
            <input id="login-user" className="lf-input" type="text" placeholder="you@company.com"
              autoComplete="username" value={user}
              onChange={(e) => { setUser(e.target.value); setFormError(""); }}
              onBlur={() => setTouched((s) => ({ ...s, user: true }))} />
            {touched.user && userErr ? <LoginErr>{t(userErr)}</LoginErr> : null}
          </div>

          {!isForgot && (
            <div className={"lf" + (touched.pw && pwErr ? " has-error" : "")}>
              <div className="lf-row">
                <label className="lf-label" htmlFor="login-pw">{t("login.field.pw")}</label>
                <button type="button" className="forgot" onClick={() => { setView("forgot"); setFormError(""); }}>{t("login.forgot.link")}</button>
              </div>
              <div className="pw-wrap">
                <input id="login-pw" className="lf-input" type={showPw ? "text" : "password"} placeholder="••••••••"
                  autoComplete="current-password" style={{ paddingRight: 64 }} value={pw}
                  onChange={(e) => { setPw(e.target.value); setFormError(""); }}
                  onBlur={() => setTouched((s) => ({ ...s, pw: true }))} />
                <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)}>{showPw ? t("login.pw.hide") : t("login.pw.show")}</button>
              </div>
              {touched.pw && pwErr ? <LoginErr>{t(pwErr)}</LoginErr> : null}
            </div>
          )}

          <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: "100%", marginTop: 2 }}>
            {busy ? <span className="login-spin" aria-hidden="true" /> : null}
            {busy ? (isForgot ? t("login.sending") : t("login.signingIn")) : (isForgot ? t("login.sendLink") : t("login.signIn"))}
          </button>

          {isForgot && (
            <button type="button" className="login-back" style={{ display: "block", margin: "14px auto 0" }} onClick={reset}>{t("login.back")}</button>
          )}

          {!isForgot && (
            <div className="login-master">
              <span className="pulse-dot" /> {t("login.poweredBy")} <span className="gold-text mono">HERMES</span> · PiKaOs v0.2
            </div>
          )}
        </form>
      )}

      <div className="login-credit rise-in" style={{ animationDelay: "1.45s" }}>
        <div className="credit">{t("login.createdBy")} <b>saksit chuenmaiwaiy</b></div>
      </div>
    </div>
  );
}
