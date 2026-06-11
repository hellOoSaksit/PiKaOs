/* PiKaOs — Login screen (auth gate).
   Owns the sign-in / forgot-password form. Calls `onLogin(usernameOrEmail, password)`
   (from useAuth) to start a session; on success the auth state flips and App swaps
   this screen out. Forgot-password posts to the backend but always shows the same
   "check your inbox" screen (never reveals whether an account exists). */
import React from 'react';
const { useState } = React;
import * as api from '../lib/api.js';

const LOGO_TILTS = ["-9deg", "6deg", "-5deg", "8deg", "-7deg", "5deg"];

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

export function Login({ onLogin, t }) {
  const [view, setView] = useState("login");      // login | forgot | forgot-sent
  const [user, setUser] = useState("somchai");
  const [pw, setPw] = useState("");
  const [touched, setTouched] = useState({ user: false, pw: false });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const userErr = validateUser(user);
  const pwErr = validatePw(pw);
  const word = "PiKaOs".split("");
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
    <div className="login-stage">
      <div className="login-hero">
        <div className="login-logo" aria-label="PiKaOs">
          {word.map((ch, i) => (
            <span key={i} className="ltr drop" onClick={jelly}
              style={{ "--i": i, "--tilt": LOGO_TILTS[i % LOGO_TILTS.length] }}>{ch}</span>
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
