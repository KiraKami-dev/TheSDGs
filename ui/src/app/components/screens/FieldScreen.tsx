import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, RotateCw } from "lucide-react"
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
import { PortraitScreen } from "../PortraitScreen"
import { renderMarkdown } from "../../../lib/markdown"

const toneColor = {
  positive: "var(--accent)",
  warning: "var(--primary)",
  neutral: "var(--muted-foreground)",
} as const

function CompanyCard({ company, onClick }: { company: CompanyStatusItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-5 text-left hover:border-foreground/25 hover:bg-white transition-all"
    >
      <p className="font-medium text-foreground leading-snug mb-1.5">{company.name}</p>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{company.headline}</p>
    </button>
  )
}

const SECTIONS = [
  { tone: "warning", title: "Needs a look" },
  { tone: "neutral", title: "Worth noting" },
  { tone: "positive", title: "Doing well" },
] as const

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
  const [portraitFor, setPortraitFor] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
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
              <div className="space-y-7">
                {SECTIONS.map(section => {
                  const companies = board.roster!.companies.filter(c => c.tone === section.tone)
                  if (!companies.length) return null
                  return (
                    <div key={section.tone}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: toneColor[section.tone] }} />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                          {section.title} ({companies.length})
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {companies.map(c => (
                          <CompanyCard key={c.name} company={c} onClick={() => setSelected(c)} />
                        ))}
                      </div>
                    </div>
                  )
                })}
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
            onPortrait={name => {
              setSelected(null)
              setPortraitFor(name)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {portraitFor && <PortraitScreen orgName={portraitFor} onClose={() => setPortraitFor(null)} />}
      </AnimatePresence>

      <ChatPanel
        ref={chatRef}
        sessionId={activeSessionId}
        contextLabel="Ask about the portfolio"
        onNewResult={refreshFromSession}
      />
    </div>
  )
}
