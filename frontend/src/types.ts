export interface Category {
  key: string;
  label: string;
  isBase: boolean;
  from: string[];
  hidden: boolean;
}

export interface Term {
  key: string; // term id (stable identity for all edits)
  canon: string;
  th: string;
  category: string;
  confirmed: boolean;
  isBase: boolean;
  aliases: string[];
}

export type ScanStatus = "complete" | "unclear" | "missing";

export interface ScanItem {
  key: string;
  canon: string;
  th: string;
  category: string;
  conf: number;
  pageTerm: string | null;
  alias: boolean;
  evTag: string;
  evPath: string;
  status: ScanStatus;
}

export interface ScanResult {
  url: string;
  cat: string;
  scannedAt: string;
  passThreshold: number;
  score: number;
  items: ScanItem[];
  pageTermsFound: number;
  rendered: boolean;
}

export interface TrainFile {
  id: string;
  name: string;
  category: string;
  rows: number;
  ts: string;
}

export interface LogEntry {
  id: string;
  actor: string;
  action: string;
  detail: string;
  ts: string;
}
