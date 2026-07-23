// Client for our FastAPI backend (backend/). Mirrors the Python schemas in
// backend/src/ysi/schemas.py: the Analyze agent answers in typed "blocks"
// rather than a fixed layout, so the frontend has one small renderer per
// block type instead of hardcoding what an answer looks like.

export interface CleaningDecision {
  what: string;
  why: string;
}

export interface CleaningResult {
  summary: string;
  decisions: CleaningDecision[];
  tables_written: string[];
  open_questions: string[];
}

export interface CompanyStatusItem {
  name: string;
  tone: "positive" | "warning" | "neutral";
  headline: string;
  detail: string;
  metrics: Record<string, string>;
}
export interface CompanyRosterBlock {
  type: "company_roster";
  title: string;
  companies: CompanyStatusItem[];
}
export interface InsightBlock {
  type: "insight";
  tone: "positive" | "warning" | "neutral";
  title: string;
  body: string;
  org_names: string[];
}
export interface StatBlock {
  type: "stat";
  label: string;
  value: string;
  caption: string;
}
export interface LeaderboardItem {
  name: string;
  value: number;
  note: string;
}
export interface LeaderboardBlock {
  type: "leaderboard";
  title: string;
  higher_is_better: boolean;
  items: LeaderboardItem[];
}
export interface TableBlock {
  type: "table";
  title: string;
  columns: string[];
  rows: string[][];
}
export interface MarkdownBlock {
  type: "markdown";
  content: string;
}
export type Block =
  | CompanyRosterBlock
  | InsightBlock
  | StatBlock
  | LeaderboardBlock
  | TableBlock
  | MarkdownBlock;

export interface AnalysisResult {
  markdown: string;
  blocks: Block[];
}

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8020/api";

async function postJSON<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${path} -> ${res.status}`);
  }
  return res.json();
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export interface RecentCall {
  code: string;
  output: string;
}

export interface StatusTurn<T> {
  question: string | null;
  result: T | null;
  backend: string;
}

export interface AgentStatus<T> {
  status: "running" | "done" | "error" | "cancelled";
  elapsed_seconds: number;
  tool_calls: number;
  recent_calls: RecentCall[];
  progress: string[];
  result: T | null;
  backend: string;
  error: string | null;
  overview_session_id: string | null;
  turns: StatusTurn<T>[] | null;
}

export interface SnapshotInfo {
  id: string;
  created_at: number;
  summary: string;
}

export const api = {
  cleanStart: () =>
    postJSON<{ session_id: string } & AgentStatus<CleaningResult>>("/clean/start", {}),
  cleanStatus: (sessionId: string) =>
    getJSON<AgentStatus<CleaningResult>>(`/clean/${sessionId}/status`),
  cleanSnapshots: () => getJSON<{ snapshots: SnapshotInfo[] }>("/clean/snapshots"),
  cleanLoadSnapshot: (snapshotId: string) =>
    postJSON<{ session_id: string } & AgentStatus<CleaningResult>>(
      `/clean/snapshots/${snapshotId}/load`,
      {}
    ),
  analyzeStatus: (sessionId: string) =>
    getJSON<AgentStatus<AnalysisResult>>(`/analyze/${sessionId}/status`),
  analyzeMessage: (sessionId: string, message: string) =>
    postJSON<AgentStatus<AnalysisResult>>(`/analyze/${sessionId}/message`, { message }),
  overviewRegenerate: () =>
    postJSON<{ session_id: string } & AgentStatus<AnalysisResult>>("/overview/regenerate", {}),
};
