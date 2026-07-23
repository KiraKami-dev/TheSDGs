import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { api, type CleaningResult } from "../../../lib/api"

export function CleanScreen({ sessionId, onDone }: { sessionId: string; onDone: (overviewSessionId: string) => void }) {
  const [progress, setProgress] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<"running" | "done" | "error">("running")
  const [result, setResult] = useState<CleaningResult | null>(null)
  const [error, setError] = useState("")
  const [overviewId, setOverviewId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function tick() {
      try {
        const s = await api.cleanStatus(sessionId)
        setElapsed(s.elapsed_seconds)
        setProgress(s.progress)
        if (s.status === "done") {
          setResult(s.result)
          setOverviewId(s.overview_session_id)
          setStatus("done")
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (s.status !== "running") {
          setError(s.error ?? "Something went wrong while cleaning")
          setStatus("error")
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lost connection to the backend")
        setStatus("error")
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
    tick()
    pollRef.current = setInterval(tick, 1500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId])

  const done = status === "done"

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Glass-box cleaning</p>
        <div className="flex items-baseline gap-3 mb-8 flex-wrap">
          <span className="text-3xl text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>
            {done ? `${result?.decisions.length ?? 0} decisions` : "Cleaning the data…"}
          </span>
          {done && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-primary text-lg">{result?.open_questions.length ?? 0} flagged for you</span>
            </>
          )}
          <span className="text-muted-foreground text-sm ml-auto">{elapsed.toFixed(0)}s</span>
        </div>

        <div className="space-y-2.5 mb-10">
          {progress.map((line, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
              <Check size={13} className="text-accent mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground leading-relaxed">{line}</p>
            </motion.div>
          ))}
          {!done && status !== "error" && (
            <div className="flex items-center gap-2 pt-1">
              <Loader2 size={12} className="text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Working…</p>
            </div>
          )}
        </div>

        {status === "error" && (
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 mb-8">
            <AlertTriangle size={15} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

        {done && result && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>

            {result.open_questions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Flagged for you</p>
                <div className="space-y-2">
                  {result.open_questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3.5">
                      <AlertTriangle size={13} className="text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-foreground leading-relaxed">{q}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => overviewId && onDone(overviewId)}
              disabled={!overviewId}
              className="bg-foreground text-background px-8 py-3 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
            >
              {overviewId ? "See who needs a look →" : "Preparing overview…"}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
