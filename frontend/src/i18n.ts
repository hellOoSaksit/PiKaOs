/* Tiny i18n layer. UI strings live in src/locales/<lang>.json so adding a
   language is just adding a file + wiring it here. Thai is the fallback. */
import en from "./locales/en.json";
import th from "./locales/th.json";

export type Lang = "th" | "en";

const DICTS: Record<Lang, Record<string, string>> = { th, en };
export const LANGS: Lang[] = ["th", "en"];

export type Vars = Record<string, string | number>;
export type TFn = (key: string, vars?: Vars) => string;

/** Returns a `t(key, vars)` translator. Missing keys fall back to Thai, then
 *  to the key itself. `{var}` placeholders are interpolated from `vars`. */
export function makeT(lang: Lang): TFn {
  const dict = DICTS[lang] ?? DICTS.th;
  return (key, vars) => {
    let s = dict[key] ?? DICTS.th[key] ?? key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.split(`{${k}}`).join(String(vars[k]));
      }
    }
    return s;
  };
}
