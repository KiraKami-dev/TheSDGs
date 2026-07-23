import { useState } from "react"
import { motion } from "motion/react"
import { Check, RotateCcw, X } from "lucide-react"
import type { CleaningResult } from "../../lib/api"

interface Resolution {
  resolved: boolean
  note: string
}

function QuestionCard({ question, resolution, onResolve, onUndo, onNoteChange }: {
  question: string
  resolution: Resolution
  onResolve: () => void
  onUndo: () => void
  onNoteChange: (note: string) => void
}) {
  if (resolution.resolved) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Check size={14} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-foreground leading-relaxed line-through decoration-muted-foreground/40">{question}</p>
              {resolution.note && <p className="text-xs text-accent mt-1.5">Note: {resolution.note}</p>}
            </div>
          </div>
          <button onClick={onUndo} className="text-muted-foreground hover:text-foreground flex-shrink-0" title="Undo">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <p className="text-sm text-foreground leading-relaxed mb-3">{question}</p>
      <div className="flex items-center gap-2">
        <input
          value={resolution.note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Add a correction or note (optional)"
          className="flex-1 text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors"
        />
        <button
          onClick={onResolve}
          className="text-xs px-3 py-2 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors flex-shrink-0"
        >
          Mark resolved
        </button>
      </div>
    </div>
  )
}

export function ReviewScreen({ result, onClose }: { result: CleaningResult; onClose: () => void }) {
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({})

  function get(i: number): Resolution {
    return resolutions[i] ?? { resolved: false, note: "" }
  }
  function set(i: number, patch: Partial<Resolution>) {
    setResolutions(prev => ({ ...prev, [i]: { ...get(i), ...patch } }))
  }

  const resolvedCount = Object.values(resolutions).filter(r => r.resolved).length

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
          {result.open_questions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {resolvedCount} of {result.open_questions.length} resolved
            </span>
          )}
        </div>

        <h1 className="text-5xl text-foreground leading-tight mb-3" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Review & correct
        </h1>
        <p className="text-muted-foreground text-base mb-12">
          What the cleaning agent decided, and what it wants a human to weigh in on.
        </p>

        {result.open_questions.length > 0 && (
          <div className="mb-12">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Flagged for you</p>
            <div className="space-y-3">
              {result.open_questions.map((q, i) => (
                <QuestionCard
                  key={i}
                  question={q}
                  resolution={get(i)}
                  onResolve={() => set(i, { resolved: true })}
                  onUndo={() => set(i, { resolved: false })}
                  onNoteChange={note => set(i, { note })}
                />
              ))}
            </div>
          </div>
        )}

        {result.decisions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Decisions the agent made ({result.decisions.length})
            </p>
            <div className="space-y-2.5">
              {result.decisions.map((d, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-foreground leading-relaxed">{d.what}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{d.why}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.open_questions.length === 0 && result.decisions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to review yet.</p>
        )}
      </div>
    </motion.div>
  )
}
