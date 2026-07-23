import { useState } from "react"
import { Loader2, Upload } from "lucide-react"
import { api } from "../../../lib/api"

export function DropScreen({ onStarted }: { onStarted: (cleanSessionId: string) => void }) {
  const [hover, setHover] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")

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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-6xl text-foreground leading-none mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Drop your<br />impact data in.
        </h1>
        <p className="text-muted-foreground text-base mb-12">
          19 files · 4 cohorts · 2 languages · no join key — that's fine.
        </p>
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
              <p className="text-sm text-muted-foreground">Click to clean the Aurelia Propel dataset</p>
            </>
          )}
        </div>
        {error && <p className="text-sm text-primary mt-4">{error}</p>}
      </div>
    </div>
  )
}
