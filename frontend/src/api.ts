import type { Category, LogEntry, ScanResult, Term, TrainFile } from "./types";

const BASE = "/api";

async function req<T>(path: string, opts: RequestInit = {}, actor = "ผู้ใช้"): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      // HTTP headers are ISO-8859-1 only; percent-encode so non-Latin
      // actor names (e.g. Thai "ผู้ใช้") don't break fetch. Server decodes.
      "X-Actor": encodeURIComponent(actor),
      ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // categories
  categories: () => req<Category[]>("/sitemap/categories"),
  createCategory: (body: { key: string; label?: string; from?: string[] }, actor?: string) =>
    req<Category>("/sitemap/categories", { method: "POST", body: JSON.stringify(body) }, actor),
  deleteCategory: (key: string, actor?: string) =>
    req<void>(`/sitemap/categories/${encodeURIComponent(key)}`, { method: "DELETE" }, actor),

  // vocab
  vocab: (cat: string) => req<Term[]>(`/sitemap/vocab/${encodeURIComponent(cat)}`),
  addTerm: (cat: string, body: { canon: string; th?: string }, actor?: string) =>
    req<Term>(`/sitemap/vocab/${encodeURIComponent(cat)}/terms`, { method: "POST", body: JSON.stringify(body) }, actor),
  updateTerm: (id: string, body: Partial<{ canon: string; th: string; confirmed: boolean }>, actor?: string) =>
    req<Term>(`/sitemap/terms/${id}`, { method: "PATCH", body: JSON.stringify(body) }, actor),
  deleteTerm: (id: string, actor?: string) =>
    req<void>(`/sitemap/terms/${id}`, { method: "DELETE" }, actor),
  addAlias: (id: string, text: string, actor?: string) =>
    req<Term>(`/sitemap/terms/${id}/aliases`, { method: "POST", body: JSON.stringify({ text }) }, actor),
  removeAlias: (id: string, text: string, actor?: string) =>
    req<Term>(`/sitemap/terms/${id}/aliases/${encodeURIComponent(text)}`, { method: "DELETE" }, actor),

  // scan
  scan: (body: { url: string; category: string; passThreshold: number; bypassPopup: boolean }) =>
    req<ScanResult>("/sitemap/scan", { method: "POST", body: JSON.stringify(body) }),

  // train
  train: (cat: string) => req<TrainFile[]>(`/sitemap/train?category=${encodeURIComponent(cat)}`),
  uploadTrain: (cat: string, file: File, actor?: string) => {
    const fd = new FormData();
    fd.append("category", cat);
    fd.append("file", file);
    return req<TrainFile>("/sitemap/train", { method: "POST", body: fd }, actor);
  },
  deleteTrain: (id: string) => req<void>(`/sitemap/train/${id}`, { method: "DELETE" }),

  // log
  log: () => req<LogEntry[]>("/sitemap/log"),
  clearLog: () => req<void>("/sitemap/log", { method: "DELETE" }),
};
