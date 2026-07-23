import { motion } from "motion/react"
import { X } from "lucide-react"
import type { CompanyStatusItem } from "../../lib/api"

const toneColor = {
  positive: "var(--accent)",
  warning: "var(--primary)",
  neutral: "var(--muted-foreground)",
} as const

const toneLabel = {
  positive: "Doing well",
  warning: "Needs a look",
  neutral: "Worth noting",
} as const

export function CompanyPanel({ company, onClose, onAsk }: {
  company: CompanyStatusItem
  onClose: () => void
  onAsk: (name: string) => void
}) {
  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="fixed top-0 right-0 bottom-0 bg-card border-l border-border overflow-y-auto z-20"
      style={{ width: 380 }}
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: toneColor[company.tone] }}>
              {toneLabel[company.tone]}
            </span>
            <h2 className="mt-1 text-3xl text-foreground leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>
              {company.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        <p className="text-sm text-foreground leading-relaxed mb-5">{company.headline}</p>

        {company.detail && (
          <div className="border-t border-border pt-4 mb-5">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2.5">The story</p>
            <p className="text-sm text-foreground leading-relaxed">{company.detail}</p>
          </div>
        )}

        {Object.keys(company.metrics).length > 0 && (
          <div className="border-t border-border pt-4 mb-6">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">Numbers</p>
            <div className="grid grid-cols-2 gap-2.5">
              {Object.entries(company.metrics).map(([label, value]) => (
                <div key={label} className="bg-background rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => onAsk(company.name)}
          className="w-full bg-foreground text-background py-3 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Ask about {company.name}
        </button>
      </div>
    </motion.div>
  )
}
