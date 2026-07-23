import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, RotateCw, LayoutGrid, X } from "lucide-react"
import {
  api,
  type AnalysisResult,
  type CompanyRosterBlock,
  type CompanyStatusItem,
  type InsightBlock,
  type StatBlock,
  type StatusTurn,
} from "../../../lib/api"
import { ChatPanel, type ChatPanelHandle } from "../ChatPanel"
import { CompanyPanel } from "../CompanyPanel"
import { renderMarkdown } from "../../../lib/markdown"

const toneColor = {
  positive: "var(--accent)",
  warning: "var(--primary)",
  neutral: "var(--muted-foreground)",
} as const

// URL of the live Streamlit dashboard (OVERVIEW/app.py). Override with
// VITE_DASHBOARD_URL in ui/.env if it runs on a different host/port.
const DASHBOARD_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_DASHBOARD_URL ||
  "http://localhost:8501"

// Embeds the running Streamlit dashboard in a modal, with an
// "open in new tab" fallback if the iframe is blocked.
function DashboardModal({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const src = DASHBOARD_URL + (DASHBOARD_URL.includes("?") ? "&" : "?") + "embed=true"

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(26,24,21,0.6)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.97, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 12 }}
        className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col"
        style={{ width: "94vw", height: "92vh", maxWidth: 1600 }}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Live dashboard</p>
            <h2 className="text-2xl text-foreground leading-none" style={{ fontFamily: "'Instrument Serif', serif" }}>Impact Intelligence Overview</h2>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={DASHBOARD_URL} target="_blank" rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-medium"
            >
              Open in new tab
            </a>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-secondary transition-colors"><X size={16} /></button>
          </div>
        </div>
        <div className="relative flex-1 bg-background">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Connecting to the dashboard…</p>
              <p className="text-xs text-muted-foreground/80 max-w-md leading-relaxed">
                If this doesn't load, make sure the Streamlit dashboard is running
                (<span className="font-mono">streamlit run app.py</span> in the OVERVIEW folder)
                and reachable at <span className="font-mono">{DASHBOARD_URL}</span>.
              </p>
            </div>
          )}
          <iframe
            title="Impact Intelligence dashboard"
            src={src}
            onLoad={() => setLoaded(true)}
            className="w-full h-full border-0"
            style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.3s" }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}

function CompanyCard({ company, onClick }: { company: CompanyStatusItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-5 text-left hover:border-foreground/25 hover:bg-white transition-all"
    >
      <div className="flex items-start gap-2.5 mb-2">
        <span
          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
          style={{ background: toneColor[company.tone] }}
        />
        <p className="font-medium text-foreground leading-snug">{company.name}</p>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{company.headline}</p>
    </button>
  )
}

interface Board {
  roster: CompanyRosterBlock | null
  stats: StatBlock[]
  updates: InsightBlock[]
  markdown: string
}

// The roster only regenerates on demand, but every follow-up question adds
// its own turn to the session. Rebuilding from the full turn history (not
// just the latest turn) keeps the roster on screen instead of a follow-up
// about one company silently replacing the whole board.
function buildBoard(turns: StatusTurn<AnalysisResult>[]): Board {
  let roster: CompanyRosterBlock | null = null
  let stats: StatBlock[] = []
  const updates: InsightBlock[] = []
  let markdown = ""

  for (const turn of turns) {
    if (!turn.result) continue
    const rosterBlock = turn.result.blocks.find((b): b is CompanyRosterBlock => b.type === "company_roster")
    if (rosterBlock) {
      roster = rosterBlock
      stats = turn.result.blocks.filter((b): b is StatBlock => b.type === "stat")
    }
    for (const b of turn.result.blocks) {
      if (b.type === "insight") updates.push(b)
    }
    if (turn.result.markdown.trim()) markdown = turn.result.markdown
  }

  return { roster, stats, updates: updates.reverse(), markdown }
}

export function FieldScreen({ sessionId, onRestart }: { sessionId: string; onRestart: () => void }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<CompanyStatusItem | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState(sessionId)
  const chatRef = useRef<ChatPanelHandle>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setActiveSessionId(sessionId)
    setBoard(null)
    setLoading(true)
    setError("")

    async function tick() {
      try {
        const s = await api.analyzeStatus(sessionId)
        if (s.status === "done" && s.result) {
          setBoard(buildBoard(s.turns ?? [{ question: null, result: s.result, backend: s.backend }]))
          setLoading(false)
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (s.status !== "running") {
          setError(s.error ?? "Something went wrong")
          setLoading(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lost connection to the backend")
        setLoading(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
    tick()
    pollRef.current = setInterval(tick, 1500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId])

  async function regenerate() {
    setRegenerating(true)
    try {
      const res = await api.overviewRegenerate()
      setActiveSessionId(res.session_id)
      setBoard(null)
      setLoading(true)
      setError("")
    } finally {
      setRegenerating(false)
    }
  }

  async function refreshFromSession() {
    const s = await api.analyzeStatus(activeSessionId)
    if (s.status === "done" && s.result) {
      setBoard(buildBoard(s.turns ?? [{ question: null, result: s.result, backend: s.backend }]))
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-16 pb-32">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-2 gap-4">
          <h1 className="text-5xl text-foreground leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>
            Who needs a look?
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0 mt-3">
            <button
              onClick={() => setShowDashboard(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-medium"
            >
              <LayoutGrid size={11} /> Overview dashboard
            </button>
            <button
              onClick={regenerate}
              disabled={regenerating || loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-medium disabled:opacity-40"
            >
              <RotateCw size={11} className={regenerating ? "animate-spin" : ""} /> Regenerate
            </button>
            <button onClick={onRestart} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              Start over
            </button>
          </div>
        </div>
        <p className="text-muted-foreground text-base mb-10">Real answers from the cleaned Aurelia Propel data, not a mock.</p>

        {loading && (
          <div className="flex items-center gap-2 py-8">
            <Loader2 size={14} className="text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Reading the portfolio…</p>
          </div>
        )}

        {error && <p className="text-sm text-primary py-4">{error}</p>}

        {board && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {board.stats.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {board.stats.map((s, i) => (
                  <div key={i} className="bg-background border border-border rounded-lg px-4 py-3">
                    <p className="text-2xl text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {board.roster && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{board.roster.title}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {board.roster.companies.map(c => (
                    <CompanyCard key={c.name} company={c} onClick={() => setSelected(c)} />
                  ))}
                </div>
              </div>
            )}

            {board.updates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Recent findings</p>
                <div className="space-y-2.5">
                  {board.updates.map((b, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{ background: "var(--background)", border: "1px solid var(--border)", borderLeft: `3px solid ${toneColor[b.tone]}` }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground">{b.title}</p>
                        {b.org_names.length > 0 && (
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{b.org_names.join(", ")}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{b.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {board.markdown.trim() && (
              <p
                className="text-sm text-muted-foreground italic border-t border-border pt-6"
                style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: "1.05rem" }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(board.markdown) }}
              />
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <CompanyPanel
            company={selected}
            onClose={() => setSelected(null)}
            onAsk={name => {
              setSelected(null)
              chatRef.current?.ask(`Tell me more about ${name}. What's the full story and what should we do?`)
            }}
          />
        )}
      </AnimatePresence>

      <ChatPanel
        ref={chatRef}
        sessionId={activeSessionId}
        contextLabel="Ask about the portfolio"
        onNewResult={refreshFromSession}
      />

      <AnimatePresence>
        {showDashboard && <DashboardModal onClose={() => setShowDashboard(false)} />}
      </AnimatePresence>
    </div>
  )
}
