import { useEffect, useState } from "react"
import { Loader2, Upload } from "lucide-react"
import { api, type SnapshotInfo } from "../../../lib/api"

function formatWhen(unixSeconds: number): string {
  const diffMin = Math.round((Date.now() / 1000 - unixSeconds) / 60)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function DropScreen({ onStarted, onLoaded }: {
  onStarted: (cleanSessionId: string) => void
  onLoaded: (overviewSessionId: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null)
  const [showFresh, setShowFresh] = useState(false)

  useEffect(() => {
    api.cleanSnapshots()
      .then(res => setSnapshots(res.snapshots))
      .catch(() => setSnapshots([]))
  }, [])

  async function start() {
    if (starting) return
    setStarting(true)
    setError("")
    try {
      const res = await api.cleanStart()
      onStarted(res.session_id)
    } catch (e) {
      setStarting(false)
      setError(e instanceof Error ? e.message : "Could not reach the backend")
    }
  }

  async function loadSnapshot(id: string) {
    if (loadingId) return
    setLoadingId(id)
    setError("")
    try {
      const res = await api.cleanLoadSnapshot(id)
      if (res.overview_session_id) {
        onLoaded(res.overview_session_id)
      } else {
        const overview = await api.overviewRegenerate()
        onLoaded(overview.session_id)
      }
    } catch (e) {
      setLoadingId(null)
      setError(e instanceof Error ? e.message : "Could not load that run")
    }
  }

  const hasSnapshots = snapshots !== null && snapshots.length > 0

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-6xl text-foreground leading-none mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Drop your<br />impact data in.
        </h1>
        <p className="text-muted-foreground text-base mb-12">
          Messy accelerator survey exports. No join key. That's fine.
        </p>

        {hasSnapshots && !showFresh && (
          <div className="text-left mb-10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Welcome back</p>
            <div className="space-y-2 mb-4">
              {snapshots!.map(s => (
                <button
                  key={s.id}
                  onClick={() => loadSnapshot(s.id)}
                  disabled={loadingId !== null}
                  className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-foreground/25 hover:bg-white transition-all disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-foreground leading-relaxed line-clamp-1">{s.summary || "Cleaned dataset"}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1.5">
                      {loadingId === s.id && <Loader2 size={11} className="animate-spin" />}
                      {formatWhen(s.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFresh(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Or start a fresh run
            </button>
          </div>
        )}

        {(!hasSnapshots || showFresh) && (
          <div
            onDragOver={e => { e.preventDefault(); setHover(true) }}
            onDragLeave={() => setHover(false)}
            onDrop={e => { e.preventDefault(); setHover(false); start() }}
            onClick={start}
            className={`border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all ${
              hover ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25 hover:bg-card"
            } ${starting ? "pointer-events-none opacity-70" : ""}`}
          >
            {starting ? (
              <>
                <Loader2 size={28} className="mx-auto text-muted-foreground mb-3 animate-spin" />
                <p className="text-sm text-muted-foreground">Starting the cleaning agent…</p>
              </>
            ) : (
              <>
                <Upload size={28} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Click to start cleaning</p>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-primary mt-4">{error}</p>}
      </div>
    </div>
  )
}
