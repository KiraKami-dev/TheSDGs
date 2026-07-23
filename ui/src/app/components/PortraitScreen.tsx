import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Loader2, RotateCw, X } from "lucide-react"
import { api, type Portrait } from "../../lib/api"

function fmtCount(n: number | null): string {
  if (n === null) return "n/a"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toString()
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const LOADING_COPY = "Reading real data for this organisation, this takes a minute."

export function PortraitScreen({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const [portrait, setPortrait] = useState<Portrait | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState("")
  const [fromCache, setFromCache] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function load(force: boolean) {
    let cancelled = false
    setError("")
    if (force) {
      setPortrait(null)
      setProgress([])
      setElapsed(0)
    }
    async function run() {
      try {
        const start = await api.portraitStart(orgName, force)
        if (cancelled) return
        if (start.status === "done" && start.result) {
          // Cached: nothing was re-run, so no loading state needed.
          setFromCache(!force)
          setPortrait(start.result)
          return
        }
        setFromCache(false)
        const sessionId = start.session_id
        async function tick() {
          try {
            const s = await api.portraitStatus(sessionId)
            if (cancelled) return
            setProgress(s.progress)
            setElapsed(s.elapsed_seconds)
            if (s.status === "done" && s.result) {
              setPortrait(s.result)
              if (pollRef.current) clearInterval(pollRef.current)
            } else if (s.status !== "running") {
              setError(s.error ?? "Something went wrong")
              if (pollRef.current) clearInterval(pollRef.current)
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Lost connection to the backend")
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }
        tick()
        pollRef.current = setInterval(tick, 1500)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not reach the backend")
      }
    }
    run()
    return () => { cancelled = true }
  }

  useEffect(() => {
    const cleanup = load(false)
    return () => {
      cleanup?.()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [orgName])

  const current = progress.length ? progress[progress.length - 1] : "Getting started…"
  const maxCount = portrait ? Math.max(...portrait.ladder.map(r => r.count ?? 0), 1) : 1

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 overflow-y-auto"
      style={{ background: "var(--background)" }}
    >
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            <X size={14} /> Close
          </button>
          {portrait && (
            <button
              onClick={() => load(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-medium"
            >
              <RotateCw size={11} /> Regenerate
            </button>
          )}
        </div>

        {!portrait && !error && (
          <div className="py-24 text-center">
            <Loader2 size={22} className="mx-auto text-muted-foreground animate-spin mb-4" />
            <p className="text-sm text-foreground mb-1">{current}</p>
            <p className="text-xs text-muted-foreground">{LOADING_COPY} · {fmtElapsed(elapsed)}</p>
          </div>
        )}

        {error && (
          <div className="py-24 text-center">
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {portrait && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <div>
              <h1 className="text-5xl text-foreground leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>
                {portrait.org_name}
              </h1>
              {portrait.context_line && (
                <p className="text-sm text-muted-foreground mt-2">
                  {portrait.context_line}
                  {fromCache && " · loaded instantly from before"}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">The ladder</p>
              <div className="space-y-2">
                {portrait.ladder.map((rung, i) => {
                  const pct = rung.count ? Math.max(4, Math.round((rung.count / maxCount) * 100)) : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground w-16 flex-shrink-0">{rung.label}</p>
                      <div className="flex-1 bg-secondary rounded-full h-6 overflow-hidden">
                        {rung.count ? (
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ delay: i * 0.08, duration: 0.6, ease: "easeOut" }}
                            className="h-full rounded-full bg-foreground/80 flex items-center px-2.5"
                          >
                            <span className="text-[11px] text-background font-medium whitespace-nowrap">
                              {fmtCount(rung.count)} · {rung.sublabel}
                            </span>
                          </motion.div>
                        ) : (
                          <div className="h-full flex items-center px-2.5">
                            <span className="text-[11px] text-muted-foreground">{rung.sublabel || "no data collected"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Five dimensions</p>
              <div className="space-y-3">
                {portrait.dimensions.map((d, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-4 ${d.score === 0 ? "bg-primary/5 border border-primary/20" : "bg-card border border-border"}`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{d.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{d.question}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{d.score}/5</span>
                    </div>
                    <div className="flex gap-1.5 mb-2">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <motion.div
                          key={j} initial={{ scale: 0 }} animate={{ scale: 1 }}
                          transition={{ delay: i * 0.05 + j * 0.03 }}
                          style={{
                            width: 14, height: 14, borderRadius: "50%",
                            background: j < d.score ? (d.score === 0 ? "var(--primary)" : "var(--foreground)") : "var(--border)",
                          }}
                        />
                      ))}
                    </div>
                    <p className={`text-xs leading-relaxed ${d.score === 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                      {d.gap}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border rounded-xl p-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">The finding</p>
              <p className="text-lg text-foreground leading-relaxed" style={{ fontFamily: "'Instrument Serif', serif" }}>
                {portrait.verdict}
              </p>
            </div>

            {Object.keys(portrait.health).length > 0 && (
              <div className="flex flex-wrap gap-6 border-t border-border pt-6">
                {Object.entries(portrait.health).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {portrait.voice && (
              <div className="bg-card rounded-xl p-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">From the field</p>
                <blockquote
                  className="text-lg italic text-foreground leading-relaxed"
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                >
                  "{portrait.voice}"
                </blockquote>
                {portrait.voice_source && <p className="text-[11px] text-muted-foreground mt-2">{portrait.voice_source}</p>}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
