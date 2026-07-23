import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, MessageSquare, Send, X } from "lucide-react"
import { api, type AnalysisResult } from "../../lib/api"

interface ChatMsg { role: "user" | "assistant"; content: string }

export interface ChatPanelHandle {
  ask: (text: string) => void
  open: () => void
}

function summarize(result: AnalysisResult): string {
  const insights = result.blocks.filter(b => b.type === "insight")
  if (insights.length === 1) {
    const b = insights[0]
    return `${b.title}\n\n${b.body}`
  }
  if (insights.length > 1) {
    return insights.map(b => `${b.title}: ${b.body}`).join("\n\n")
  }
  const roster = result.blocks.find(b => b.type === "company_roster")
  if (roster) {
    return result.markdown.trim() || "I've updated the board above with what I found."
  }
  const markdownBlock = result.blocks.find(b => b.type === "markdown")
  if (markdownBlock) return markdownBlock.content
  return result.markdown.trim() || "Done — see the board above."
}

export const ChatPanel = forwardRef<ChatPanelHandle, {
  sessionId: string
  contextLabel: string
  onNewResult: (result: AnalysisResult) => void
}>(function ChatPanel({ sessionId, contextLabel, onNewResult }, ref) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 350) }, [open])

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || loading) return
    setMessages(prev => [...prev, { role: "user", content: clean }])
    setInput("")
    setLoading(true)
    try {
      let s = await api.analyzeMessage(sessionId, clean)
      while (s.status === "running") {
        await new Promise(r => setTimeout(r, 1200))
        s = await api.analyzeStatus(sessionId)
      }
      if (s.status === "done" && s.result) {
        onNewResult(s.result)
        setMessages(prev => [...prev, { role: "assistant", content: summarize(s.result!) }])
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${s.error ?? "something went wrong"}` }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "unknown"}` }])
    }
    setLoading(false)
  }

  useImperativeHandle(ref, () => ({
    ask: (text: string) => { setOpen(true); send(text) },
    open: () => setOpen(true),
  }))

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 left-5 z-30 flex items-center gap-2 bg-foreground text-background px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg hover:bg-foreground/90 transition-colors"
      >
        <MessageSquare size={14} />Ask about the portfolio
        {messages.length > 0 && <span className="bg-primary text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5">{messages.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 flex flex-col"
            style={{ height: 320 }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
              <span className="text-sm font-medium text-foreground">{contextLabel}</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={14} />
              </button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Ask anything about the portfolio, real answers from the cleaned data.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-foreground text-background" : "bg-background border border-border text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-background border border-border rounded-xl px-3.5 py-2.5">
                    <Loader2 size={13} className="text-muted-foreground animate-spin" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send(input)}
                placeholder="Ask a question…"
                className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="p-2 bg-foreground text-background rounded-lg disabled:opacity-30 hover:bg-foreground/90 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
