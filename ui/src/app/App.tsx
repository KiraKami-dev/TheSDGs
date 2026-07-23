import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { DropScreen } from "./components/screens/DropScreen"
import { CleanScreen } from "./components/screens/CleanScreen"
import { FieldScreen } from "./components/screens/FieldScreen"

type Screen = "drop" | "clean" | "field"

export default function App() {
  const [screen, setScreen] = useState<Screen>("drop")
  const [cleanSessionId, setCleanSessionId] = useState<string | null>(null)
  const [overviewSessionId, setOverviewSessionId] = useState<string | null>(null)

  function restart() {
    setCleanSessionId(null)
    setOverviewSessionId(null)
    setScreen("drop")
  }

  return (
    <AnimatePresence mode="wait">
      {screen === "drop" && (
        <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <DropScreen onStarted={id => { setCleanSessionId(id); setScreen("clean") }} />
        </motion.div>
      )}
      {screen === "clean" && cleanSessionId && (
        <motion.div key="clean" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <CleanScreen sessionId={cleanSessionId} onDone={id => { setOverviewSessionId(id); setScreen("field") }} />
        </motion.div>
      )}
      {screen === "field" && overviewSessionId && (
        <motion.div key="field" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <FieldScreen sessionId={overviewSessionId} onRestart={restart} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
