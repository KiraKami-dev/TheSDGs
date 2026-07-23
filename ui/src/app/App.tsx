import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Upload, ArrowLeft, X, Check, AlertTriangle, ZoomIn, ZoomOut,
  MessageSquare, Send, Key, Loader2, Info, ChevronRight,
  Sparkles, LayoutGrid, AlertCircle, Plus, RotateCw
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

type Screen = "drop" | "clean" | "org-select" | "sdg-select" | "framework-select" | "graph-loading" | "graph"
type LogType = "fix" | "warn" | "skip"
type NodeType = "organisation" | "framework" | "domain" | "geography" | "dimension" | "indicator" | "ladder" | "beneficiary"
type NodeStatus = "present" | "partial" | "missing" | "neutral" | "user-provided"

interface LogItem { type: LogType; text: string }
interface FlaggedItem { org: string; field: string; values: [string, string]; auto: string }

interface LadderRung { label: string; sublabel: string; count: number | null }
interface Dimension { name: string; question: string; score: number; gaps: string[] }

interface Org {
  id: string; name: string; domain: string; country: string
  cohort: string; stage: string
  ladder: LadderRung[]; dims: Dimension[]
  who: { women: number; groups: string[]; underservedness: string | null }
  voice: { quote: string; source: string }
  health: { revenueLabel: string; revenueDir: "up" | "down"; runwayMonths: number; teamFTE: number }
}

interface FrameworkIndicator {
  code: string; label: string
  dimension: "What" | "Who" | "How Much" | "Contribution" | "Risk"
  ladderMin: number
  requirement: "required" | "recommended" | "optional"
}

interface FrameworkDef {
  id: string; name: string; fullName: string; description: string
  bestFor: string[]
  indicators: FrameworkIndicator[]
  sdgs: number[]
}

interface SdgGoal {
  n: number; color: string; title: string; short: string; orgs: string[]
}

interface GNode {
  id: string; type: NodeType; label: string; sublabel?: string
  x: number; y: number; w: number
  status: NodeStatus
  meta?: Record<string, unknown>
}

interface GEdge {
  id: string; source: string; target: string
  label?: string; faint?: boolean
}

interface ChatMsg { role: "user" | "assistant"; content: string }
interface GapInput { key: string; label: string; placeholder: string; value: string; type: "ladder" | "dimension" | "indicator"; index: number }

// ─── Static data ─────────────────────────────────────────────────────────────

const CANVAS_W = 1820
const CANVAS_H = 1060
const NODE_H = 62

const CLEANING_LOG: LogItem[] = [
  { type: "fix",  text: "Found `120.000` in revenue column — read as 120,000 (Brazilian format)" },
  { type: "fix",  text: "`Brightpath Sol.` and `BrightPath Solutions` matched via email domain" },
  { type: "warn", text: "`$65,000` vs `65000` in the same column — flagged, not guessed" },
  { type: "skip", text: "Question not asked in 2023 — left blank, not zero" },
  { type: "fix",  text: "Two date formats in AP2 Wave 4 — unified to ISO-8601" },
  { type: "fix",  text: "Column `beneficaries_f` matched to `beneficiaries_female` by string distance" },
  { type: "warn", text: "Hekima Schools: 2024 headcount conflicts with 2023 — flagged" },
  { type: "fix",  text: "Currency mismatch: KES converted to USD at Nov 2024 rate" },
  { type: "skip", text: "Contribution data missing across all AP1 orgs — systemic gap noted" },
  { type: "warn", text: "NourishNet: duplicate row in Wave 3 — one removed, one retained" },
  { type: "fix",  text: "GreenPower: unit count column name changed in Wave 3 — remapped" },
  { type: "warn", text: "Mobilis Health: active user count conflicts across two export files" },
]

const FLAGGED_ITEMS: FlaggedItem[] = [
  { org: "NourishNet",    field: "Revenue Q3 2024",       values: ["$65,000", "65000"],    auto: "65000" },
  { org: "Hekima Schools",field: "Beneficiary headcount", values: ["45,000",  "48,200"],   auto: "48200" },
  { org: "SafeHarbour",   field: "FTE count",             values: ["14",      "16"],        auto: "16" },
  { org: "Mobilis Health",field: "Active users Jan 2025", values: ["89,000",  "91,400"],   auto: "91400" },
  { org: "GreenPower",    field: "Units deployed",        values: ["72,000",  "74,500"],   auto: "74500" },
]

const SDG_GOALS: SdgGoal[] = [
  { n: 1,  color: "#E5243B", title: "No Poverty",               short: "End poverty in all its forms everywhere",            orgs: ["NourishNet", "Soko Connect"] },
  { n: 2,  color: "#DDA63A", title: "Zero Hunger",              short: "End hunger, achieve food security and nutrition",     orgs: ["NourishNet", "GreenPower Cooperative"] },
  { n: 3,  color: "#4C9F38", title: "Good Health",              short: "Ensure healthy lives and promote wellbeing",          orgs: ["BrightPath Solutions", "Mobilis Health", "SafeHarbour"] },
  { n: 4,  color: "#C5192D", title: "Quality Education",        short: "Inclusive, equitable quality education for all",      orgs: ["Hekima Schools"] },
  { n: 5,  color: "#FF3A21", title: "Gender Equality",          short: "Achieve gender equality and empower women",           orgs: ["SafeHarbour", "Luminary Crafts", "Soko Connect"] },
  { n: 6,  color: "#26BDE2", title: "Clean Water",              short: "Ensure availability of water and sanitation",         orgs: ["BrightPath Solutions"] },
  { n: 7,  color: "#FCC30B", title: "Affordable Energy",        short: "Ensure access to affordable, clean energy",           orgs: ["GreenPower Cooperative"] },
  { n: 8,  color: "#A21942", title: "Decent Work",              short: "Promote sustained, inclusive economic growth",        orgs: ["Soko Connect", "Luminary Crafts"] },
  { n: 9,  color: "#FD6925", title: "Industry & Innovation",    short: "Build resilient infrastructure",                      orgs: ["Mobilis Health", "Soko Connect"] },
  { n: 10, color: "#DD1367", title: "Reduced Inequalities",     short: "Reduce inequality within and among countries",        orgs: ["NourishNet", "Hekima Schools", "SafeHarbour"] },
  { n: 11, color: "#FD9D24", title: "Sustainable Cities",       short: "Make cities inclusive, safe and sustainable",         orgs: [] },
  { n: 12, color: "#BF8B2E", title: "Responsible Consumption",  short: "Ensure sustainable consumption patterns",             orgs: ["Luminary Crafts"] },
  { n: 13, color: "#3F7E44", title: "Climate Action",           short: "Take urgent action to combat climate change",         orgs: ["GreenPower Cooperative"] },
  { n: 14, color: "#0A97D9", title: "Life Below Water",         short: "Conserve and sustainably use marine resources",       orgs: [] },
  { n: 15, color: "#56C02B", title: "Life on Land",             short: "Protect and restore terrestrial ecosystems",          orgs: [] },
  { n: 16, color: "#00689D", title: "Peace & Justice",          short: "Promote peaceful, inclusive institutions",            orgs: ["SafeHarbour"] },
  { n: 17, color: "#19486A", title: "Partnerships",             short: "Strengthen the means of implementation",              orgs: [] },
]

const ORGS: Org[] = [
  {
    id: "brightpath", name: "BrightPath Solutions", domain: "WASH & hygiene",
    country: "South Africa", cohort: "AP1", stage: "early growth",
    ladder: [
      { label: "Inform",   sublabel: "saw a video",           count: 340000 },
      { label: "Engage",   sublabel: "attended workshop",      count: 12000  },
      { label: "Outcomes", sublabel: "learned the skill",      count: 800    },
      { label: "Impact",   sublabel: "changed behaviour",      count: null   },
      { label: "Societal", sublabel: "life materially better", count: null   },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 3, gaps: ["Outcome data exists but behaviour change not verified."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 4, gaps: ["Women counted; underservedness baseline missing."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 4, gaps: ["Scale strong; duration not tracked beyond 12 months."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 0, gaps: ["Nobody asked whether this would have happened anyway."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 1, gaps: ["One risk factor identified; no mitigation plan documented."] },
    ],
    who: { women: 68, groups: ["women", "rural households", "children under 5", "persons with disabilities"], underservedness: null },
    voice: { quote: "After the workshop I taught my whole village. The soap is still there.", source: "Wave 3 survey, Nov 2024" },
    health: { revenueLabel: "Grant-funded", revenueDir: "up", runwayMonths: 4, teamFTE: 6 },
  },
  {
    id: "hekima", name: "Hekima Schools", domain: "Education",
    country: "Kenya", cohort: "AP1", stage: "growth",
    ladder: [
      { label: "Inform",   sublabel: "enrolled in programme",  count: 45000 },
      { label: "Engage",   sublabel: "attended class",          count: 38000 },
      { label: "Outcomes", sublabel: "passed national exam",    count: 20    },
      { label: "Impact",   sublabel: "sustained learning",      count: null  },
      { label: "Societal", sublabel: "economic uplift",         count: null  },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 2, gaps: ["Learning outcomes not standardised across schools."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 5, gaps: ["Comprehensive demographic data collected and verified."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 3, gaps: ["Attendance tracked; completion rate below target."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 1, gaps: ["Control group planned but not yet implemented."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 2, gaps: ["Teacher attrition identified; no mitigation plan."] },
    ],
    who: { women: 52, groups: ["girls", "first-generation learners", "rural youth"], underservedness: "verified" },
    voice: { quote: "My mother never went to school. I am the first.", source: "Case study, Wave 2, Mar 2025" },
    health: { revenueLabel: "Fees + grant", revenueDir: "up", runwayMonths: 18, teamFTE: 42 },
  },
  {
    id: "greenpower", name: "GreenPower Cooperative", domain: "Clean energy",
    country: "Ghana", cohort: "AP2", stage: "scale",
    ladder: [
      { label: "Inform",   sublabel: "received solar unit",        count: 89000 },
      { label: "Engage",   sublabel: "actively using",              count: 72000 },
      { label: "Outcomes", sublabel: "kerosene replaced",           count: 58000 },
      { label: "Impact",   sublabel: "health improvement recorded", count: 12000 },
      { label: "Societal", sublabel: "community energy poverty",    count: null  },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 4, gaps: ["Health impact measured; education hours not tracked."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 3, gaps: ["Women heads of household captured; renters missed."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 5, gaps: ["Scale, depth, and duration all tracked rigorously."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 2, gaps: ["Comparison region used but not randomised."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 3, gaps: ["Equipment failure and supply chain risks documented."] },
    ],
    who: { women: 71, groups: ["off-grid households", "women heads of household", "smallholder farmers"], underservedness: "partial" },
    voice: { quote: "No more kerosene. My children study at night now.", source: "Wave 4 survey, Jan 2025" },
    health: { revenueLabel: "Earned income", revenueDir: "up", runwayMonths: 36, teamFTE: 28 },
  },
  {
    id: "nourishnet", name: "NourishNet", domain: "Food security",
    country: "Nigeria", cohort: "AP2", stage: "early growth",
    ladder: [
      { label: "Inform",   sublabel: "received nutrition training", count: 23000 },
      { label: "Engage",   sublabel: "joined kitchen group",         count: 14000 },
      { label: "Outcomes", sublabel: "dietary diversity improved",   count: 4200  },
      { label: "Impact",   sublabel: "malnutrition reduced",         count: null  },
      { label: "Societal", sublabel: "community food resilience",    count: null  },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 3, gaps: ["Dietary diversity measured; anthropometric data missing."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 4, gaps: ["Women and children targeted well; men excluded."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 3, gaps: ["Scale tracked; duration only 6 months of data."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 0, gaps: ["No counterfactual; seasonal variation uncontrolled."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 1, gaps: ["Supply chain risk mentioned but unquantified."] },
    ],
    who: { women: 89, groups: ["mothers", "children under 2", "pregnant women"], underservedness: "verified" },
    voice: { quote: "We used to skip meals in the dry season. Not anymore.", source: "FGD transcript, Oct 2024" },
    health: { revenueLabel: "Grant-funded", revenueDir: "down", runwayMonths: 7, teamFTE: 11 },
  },
  {
    id: "safeharbour", name: "SafeHarbour", domain: "Women & girls",
    country: "South Africa", cohort: "AP1", stage: "early stage",
    ladder: [
      { label: "Inform",   sublabel: "reached via awareness",      count: 8200 },
      { label: "Engage",   sublabel: "accessed shelter or support", count: 3100 },
      { label: "Outcomes", sublabel: "legal case opened",           count: 1800 },
      { label: "Impact",   sublabel: "living independently",        count: 420  },
      { label: "Societal", sublabel: "gender violence reduced",     count: null },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 4, gaps: ["Legal outcomes tracked; wellbeing not systematically measured."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 5, gaps: ["Extremely detailed survivor profiling across all waves."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 3, gaps: ["Scale modest; depth of individual support excellent."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 1, gaps: ["No comparison group; attribution unclear."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 2, gaps: ["Safety risk protocols exist; evaluated quarterly."] },
    ],
    who: { women: 100, groups: ["GBV survivors", "teenage girls at risk", "women in informal settlements"], underservedness: "verified" },
    voice: { quote: "I didn't think I had rights. Now I know I do.", source: "In-depth interview, Jul 2024" },
    health: { revenueLabel: "Grant-funded", revenueDir: "up", runwayMonths: 11, teamFTE: 14 },
  },
  {
    id: "mobilis", name: "Mobilis Health", domain: "Mobile health",
    country: "Ethiopia", cohort: "AP2", stage: "growth",
    ladder: [
      { label: "Inform",   sublabel: "received health message",   count: 890000 },
      { label: "Engage",   sublabel: "completed health check",    count: 89000  },
      { label: "Outcomes", sublabel: "referred to facility",      count: 800    },
      { label: "Impact",   sublabel: "condition resolved",        count: null   },
      { label: "Societal", sublabel: "maternal mortality reduced",count: null   },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 2, gaps: ["Referral outcome not closed; no follow-up data collected."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 3, gaps: ["Urban bias in user base; rural reach not measured."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 4, gaps: ["Reach massive; depth collapses after referral point."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 0, gaps: ["No attribution; SMS delivery ≠ health improvement."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 1, gaps: ["Digital exclusion risk acknowledged but not quantified."] },
    ],
    who: { women: 61, groups: ["pregnant women", "rural populations", "youth 15-24"], underservedness: "partial" },
    voice: { quote: "The message came at 6am. By 8am I was at the clinic.", source: "Wave 5 survey, Feb 2025" },
    health: { revenueLabel: "Earned income", revenueDir: "up", runwayMonths: 22, teamFTE: 31 },
  },
  {
    id: "soko", name: "Soko Connect", domain: "Financial inclusion",
    country: "Uganda", cohort: "AP1", stage: "scale",
    ladder: [
      { label: "Inform",   sublabel: "onboarded to platform",        count: 67000 },
      { label: "Engage",   sublabel: "completed first transaction",   count: 48000 },
      { label: "Outcomes", sublabel: "savings account opened",        count: 31000 },
      { label: "Impact",   sublabel: "business income increased",     count: 9200  },
      { label: "Societal", sublabel: "household financial resilience",count: null  },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 4, gaps: ["Income tracked; asset accumulation not measured."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 4, gaps: ["Women trader focus; men underrepresented in data."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 5, gaps: ["All three dimensions tracked rigorously across 4 years."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 3, gaps: ["RCT in progress; interim results only, not final."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 2, gaps: ["Fraud risk documented; mobile money failure not modelled."] },
    ],
    who: { women: 77, groups: ["market traders", "smallholder farmers", "women entrepreneurs", "youth 18-30"], underservedness: "verified" },
    voice: { quote: "I saved 200,000 shillings in six months. Before, I had nothing left by Thursday.", source: "Case study, AP1 Wave 3" },
    health: { revenueLabel: "Earned income", revenueDir: "up", runwayMonths: 48, teamFTE: 67 },
  },
  {
    id: "luminary", name: "Luminary Crafts", domain: "Economic empowerment",
    country: "Rwanda", cohort: "AP2", stage: "early growth",
    ladder: [
      { label: "Inform",   sublabel: "attended skills training",    count: 1200 },
      { label: "Engage",   sublabel: "completed certification",      count: 980  },
      { label: "Outcomes", sublabel: "product sold in export market",count: 640  },
      { label: "Impact",   sublabel: "income above poverty line",    count: 290  },
      { label: "Societal", sublabel: "artisan sector revitalised",   count: null },
    ],
    dims: [
      { name: "What",         question: "What outcome occurs?",            score: 4, gaps: ["Income above poverty tracked; quality of life not measured."] },
      { name: "Who",          question: "Which stakeholders experience it?",score: 5, gaps: ["Full artisan profiling including ethnicity and displacement history."] },
      { name: "How Much",     question: "Scale, depth and duration?",       score: 4, gaps: ["Strong scale and depth; 3-year cohort tracking underway."] },
      { name: "Contribution", question: "Would this have happened anyway?", score: 2, gaps: ["Export market comparison used; not randomised."] },
      { name: "Risk",         question: "What could make impact fail?",     score: 3, gaps: ["Exchange rate and market access risks quantified."] },
    ],
    who: { women: 84, groups: ["women artisans", "genocide survivors", "youth apprentices"], underservedness: "verified" },
    voice: { quote: "I designed this myself. Someone in Belgium bought it.", source: "In-depth interview, Dec 2024" },
    health: { revenueLabel: "Earned income", revenueDir: "up", runwayMonths: 14, teamFTE: 18 },
  },
]

const FRAMEWORKS: FrameworkDef[] = [
  {
    id: "iris", name: "IRIS+", fullName: "Impact Reporting and Investment Standards",
    description: "The generally accepted system for measuring, managing, and optimising impact. Backed by GIIN.",
    bestFor: ["impact investing", "SDG alignment", "cross-portfolio comparison"],
    sdgs: [1, 2, 3, 4, 5, 8, 10],
    indicators: [
      { code: "PI7578", label: "Individuals Reached",        dimension: "How Much",     ladderMin: 0, requirement: "required" },
      { code: "PI9259", label: "Client Individuals: Female", dimension: "Who",          ladderMin: 0, requirement: "required" },
      { code: "PI5765", label: "Individuals: Low Income",    dimension: "Who",          ladderMin: 0, requirement: "recommended" },
      { code: "PI2803", label: "Change in Income",           dimension: "What",         ladderMin: 3, requirement: "required" },
      { code: "PI3456", label: "Counterfactual Evidence",    dimension: "Contribution", ladderMin: 4, requirement: "recommended" },
      { code: "PI8901", label: "Risk Assessment Score",      dimension: "Risk",         ladderMin: 1, requirement: "optional" },
      { code: "PI2234", label: "Sustained Behaviour Change", dimension: "What",         ladderMin: 3, requirement: "recommended" },
    ],
  },
  {
    id: "sdg", name: "SDG Indicators", fullName: "United Nations Sustainable Development Goals",
    description: "Global framework of 17 goals and 231 indicators adopted by all UN member states.",
    bestFor: ["government partners", "global reporting", "advocacy"],
    sdgs: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
    indicators: [
      { code: "SDG1.1",  label: "Extreme Poverty Rate",     dimension: "What",         ladderMin: 4, requirement: "required" },
      { code: "SDG3.1",  label: "Maternal Mortality Ratio", dimension: "What",         ladderMin: 4, requirement: "recommended" },
      { code: "SDG5.5",  label: "Women in Leadership",      dimension: "Who",          ladderMin: 2, requirement: "required" },
      { code: "SDG8.5",  label: "Employment by Sex",        dimension: "Who",          ladderMin: 3, requirement: "required" },
      { code: "SDG10.2", label: "Income Growth Bottom 40%", dimension: "How Much",     ladderMin: 3, requirement: "recommended" },
      { code: "SDG16.1", label: "Violence Reduction",       dimension: "Risk",         ladderMin: 3, requirement: "optional" },
    ],
  },
  {
    id: "gri", name: "GRI Standards", fullName: "Global Reporting Initiative Standards",
    description: "Most widely adopted global standards for sustainability reporting across sectors.",
    bestFor: ["corporate sustainability", "ESG disclosure", "supply chain"],
    sdgs: [8, 9, 12, 13, 16, 17],
    indicators: [
      { code: "GRI301", label: "Materials Used",             dimension: "Risk",         ladderMin: 0, requirement: "required" },
      { code: "GRI401", label: "New Employee Hires",         dimension: "How Much",     ladderMin: 0, requirement: "required" },
      { code: "GRI405", label: "Diversity of Governance",    dimension: "Who",          ladderMin: 1, requirement: "required" },
      { code: "GRI413", label: "Local Community Engagement", dimension: "What",         ladderMin: 1, requirement: "recommended" },
      { code: "GRI414", label: "Supplier Social Screening",  dimension: "Contribution", ladderMin: 0, requirement: "optional" },
      { code: "GRI416", label: "Customer Health & Safety",   dimension: "Risk",         ladderMin: 2, requirement: "recommended" },
    ],
  },
  {
    id: "toc", name: "Theory of Change", fullName: "Theory of Change Framework",
    description: "Causal mapping from activities to long-term outcomes. Custom per organisation.",
    bestFor: ["programme design", "donor reporting", "learning"],
    sdgs: [1, 2, 3, 4, 5, 10],
    indicators: [
      { code: "ToC-A1", label: "Inputs Delivered",        dimension: "How Much",     ladderMin: 0, requirement: "required" },
      { code: "ToC-O1", label: "Immediate Outcomes",      dimension: "What",         ladderMin: 2, requirement: "required" },
      { code: "ToC-O2", label: "Intermediate Outcomes",   dimension: "What",         ladderMin: 3, requirement: "required" },
      { code: "ToC-I1", label: "Long-term Impact",        dimension: "What",         ladderMin: 4, requirement: "required" },
      { code: "ToC-A2", label: "Assumptions Tested",      dimension: "Contribution", ladderMin: 3, requirement: "recommended" },
      { code: "ToC-R1", label: "Risk Mitigation Actions", dimension: "Risk",         ladderMin: 1, requirement: "recommended" },
      { code: "ToC-W1", label: "Beneficiary Voices",      dimension: "Who",          ladderMin: 2, requirement: "required" },
    ],
  },
  {
    id: "bia", name: "B Impact", fullName: "B Impact Assessment",
    description: "Comprehensive assessment measuring positive impact on workers, community, and environment.",
    bestFor: ["social enterprise", "B Corp certification", "blended value"],
    sdgs: [1, 3, 8, 10, 12, 13],
    indicators: [
      { code: "BIA-W1", label: "Wages vs Living Wage",     dimension: "How Much",     ladderMin: 2, requirement: "required" },
      { code: "BIA-W2", label: "Worker Ownership",         dimension: "Who",          ladderMin: 3, requirement: "recommended" },
      { code: "BIA-C1", label: "Community Employment",     dimension: "What",         ladderMin: 2, requirement: "required" },
      { code: "BIA-C2", label: "Local Supplier Sourcing",  dimension: "Contribution", ladderMin: 1, requirement: "recommended" },
      { code: "BIA-C3", label: "Civic Engagement",         dimension: "What",         ladderMin: 1, requirement: "optional" },
      { code: "BIA-E1", label: "Environmental Management", dimension: "Risk",         ladderMin: 0, requirement: "required" },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepestRung(org: Org): number {
  for (let i = org.ladder.length - 1; i >= 0; i--) {
    if (org.ladder[i].count !== null) return i
  }
  return -1
}

function indicatorPresent(ind: FrameworkIndicator, org: Org): boolean {
  return deepestRung(org) >= ind.ladderMin
}

function computeCoverage(org: Org, fw: FrameworkDef): number {
  const present = fw.indicators.filter(ind => indicatorPresent(ind, org)).length
  return Math.round((present / fw.indicators.length) * 100)
}

function fmtCount(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toString()
}

function sdgAlignment(fw: FrameworkDef, selected: number[]): number {
  if (!selected.length) return 0
  const matches = selected.filter(s => fw.sdgs.includes(s)).length
  return Math.round((matches / selected.length) * 100)
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function nodeWidth(type: NodeType): number {
  return ({ organisation: 175, framework: 168, domain: 148, geography: 148, dimension: 150, indicator: 162, ladder: 148, beneficiary: 140 } as Record<NodeType, number>)[type]
}

function buildGraph(org: Org, fw: FrameworkDef): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const cx = CANVAS_W / 2

  const fwW = nodeWidth("framework")
  nodes.push({ id: "fw", type: "framework", label: fw.name, sublabel: fw.fullName, x: cx - fwW / 2, y: 55, w: fwW, status: "neutral", meta: { fw } })

  const orgW = nodeWidth("organisation")
  nodes.push({ id: "org", type: "organisation", label: org.name, sublabel: `${org.domain} · ${org.country}`, x: cx - orgW / 2, y: 215, w: orgW, status: "present", meta: { org } })
  edges.push({ id: "fw-org", source: "fw", target: "org", label: "assessed against" })

  const domW = nodeWidth("domain")
  nodes.push({ id: "domain", type: "domain", label: org.domain, sublabel: "sector", x: 260, y: 210, w: domW, status: "neutral" })
  edges.push({ id: "org-dom", source: "org", target: "domain", label: "operates in" })

  const geoW = nodeWidth("geography")
  nodes.push({ id: "geo", type: "geography", label: org.country, sublabel: "primary market", x: CANVAS_W - 260 - geoW, y: 210, w: geoW, status: "neutral" })
  edges.push({ id: "org-geo", source: "org", target: "geo", label: "located in" })

  org.ladder.forEach((rung, i) => {
    const hasData = rung.count !== null
    const status: NodeStatus = rung.count !== null
      ? ((rung as { _userProvided?: boolean })._userProvided ? "user-provided" : "present")
      : "missing"
    nodes.push({
      id: `lad-${i}`, type: "ladder",
      label: rung.label,
      sublabel: hasData ? `${fmtCount(rung.count)} · ${rung.sublabel}` : "no data collected",
      x: 58, y: 395 + i * 92, w: nodeWidth("ladder"),
      status,
      meta: { rung, i },
    })
    if (i === 0) edges.push({ id: "org-lad0", source: "org", target: "lad-0", label: "funnel" })
    else edges.push({ id: `lad-${i - 1}-${i}`, source: `lad-${i - 1}`, target: `lad-${i}`, faint: true })
  })

  const dimX = CANVAS_W - nodeWidth("dimension") - 58
  org.dims.forEach((dim, i) => {
    const status: NodeStatus = (dim as { _userProvided?: boolean })._userProvided
      ? "user-provided"
      : dim.score >= 4 ? "present" : dim.score >= 2 ? "partial" : "missing"
    nodes.push({
      id: `dim-${i}`, type: "dimension",
      label: dim.name, sublabel: dim.question,
      x: dimX, y: 395 + i * 92, w: nodeWidth("dimension"),
      status,
      meta: { dim, i },
    })
    edges.push({ id: `org-dim-${i}`, source: "org", target: `dim-${i}`, label: i === 0 ? "measured on" : undefined, faint: i > 0 })
  })

  org.who.groups.slice(0, 4).forEach((g, i) => {
    nodes.push({ id: `bene-${i}`, type: "beneficiary", label: g, x: 180 + i * 165, y: 865, w: nodeWidth("beneficiary"), status: "present" })
    edges.push({ id: `org-bene-${i}`, source: "org", target: `bene-${i}`, label: i === 0 ? "reaches" : undefined, faint: i > 0 })
  })

  fw.indicators.slice(0, 7).forEach((ind, i) => {
    const present = indicatorPresent(ind, org)
    nodes.push({
      id: `ind-${i}`, type: "indicator",
      label: ind.label, sublabel: `${ind.code} · ${ind.requirement}`,
      x: 750 + i * 158, y: 865, w: nodeWidth("indicator"),
      status: present ? "present" : "missing",
      meta: { ind, present },
    })
  })

  return { nodes, edges }
}

// ─── Edge ─────────────────────────────────────────────────────────────────────

function EdgePath({ edge, nodes }: { edge: GEdge; nodes: GNode[] }) {
  const s = nodes.find(n => n.id === edge.source)
  const t = nodes.find(n => n.id === edge.target)
  if (!s || !t) return null
  const sx = s.x + s.w / 2, sy = s.y + NODE_H / 2
  const tx = t.x + t.w / 2, ty = t.y + NODE_H / 2
  const dx = tx - sx, dy = ty - sy
  const d = Math.abs(dy) >= Math.abs(dx)
    ? `M ${sx} ${sy} C ${sx} ${sy + dy * 0.46}, ${tx} ${ty - dy * 0.46}, ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx + dx * 0.46} ${sy}, ${tx - dx * 0.46} ${ty}, ${tx} ${ty}`
  const color = edge.faint ? "#DDD9D0" : "#C8C2B6"
  const midX = sx + dx * 0.44 + (Math.abs(dy) > Math.abs(dx) ? 14 : 0)
  const midY = sy + dy * 0.44 + (Math.abs(dx) > Math.abs(dy) ? -10 : 0)
  return (
    <g>
      <path d={d} stroke={color} strokeWidth={edge.faint ? 1 : 1.5} fill="none" markerEnd="url(#arr)" />
      {edge.label && <text x={midX} y={midY} textAnchor="middle" fontSize={9} fill="#B8B0A6" fontFamily="Inter, sans-serif" letterSpacing="0.04em">{edge.label}</text>}
    </g>
  )
}

// ─── Node styling ─────────────────────────────────────────────────────────────

function nodeAccent(node: GNode): string {
  if (node.status === "user-provided") return "#7A8B7F"
  switch (node.type) {
    case "organisation": return "#E8604C"
    case "framework":    return "#1A1815"
    case "domain": case "geography": return "#7A8B7F"
    case "beneficiary":  return "#C4A080"
    default: return { present: "#7A8B7F", partial: "#C4A55A", missing: "#C8C2B6", neutral: "#E5E0D8", "user-provided": "#7A8B7F" }[node.status]
  }
}

const TYPE_LABELS: Record<NodeType, string> = {
  organisation: "org", framework: "framework", domain: "domain",
  geography: "geo", dimension: "dimension", indicator: "indicator",
  ladder: "depth", beneficiary: "beneficiary",
}

// ─── Node card ────────────────────────────────────────────────────────────────

function NodeCard({ node, selected, onClick }: { node: GNode; selected: boolean; onClick: () => void }) {
  const accent = nodeAccent(node)
  const dim = node.type === "dimension" ? (node.meta?.dim as Dimension) : null
  const isZeroScore = dim?.score === 0
  const isUserProvided = node.status === "user-provided"

  return (
    <div
      onClick={onClick}
      data-node="1"
      style={{
        position: "absolute", left: node.x, top: node.y, width: node.w,
        cursor: "pointer",
        borderTop: `3px solid ${accent}`,
        boxShadow: selected ? `0 0 0 2px ${accent}, 0 6px 20px rgba(0,0,0,0.12)` : "0 1px 4px rgba(0,0,0,0.06)",
        background: isZeroScore ? "#FFF5F3" : isUserProvided ? "#F0F7F2" : "#FFFFFF",
        borderRadius: 10, border: "1px solid #E5E0D8",
        transition: "box-shadow 0.15s, transform 0.15s",
        transform: selected ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={{ padding: "6px 12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: accent }}>
            {TYPE_LABELS[node.type]}{isUserProvided ? " · you" : ""}
          </span>
          {node.status !== "neutral" && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block",
              background: { present: "#7A8B7F", partial: "#C4A55A", missing: "#D1CBC4", neutral: "transparent", "user-provided": "#7A8B7F" }[node.status] }} />
          )}
        </div>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: "#1A1815", lineHeight: 1.3, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.label}</p>
        {node.sublabel && <p style={{ fontSize: 10.5, color: "#A8A29A", lineHeight: 1.3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.sublabel}</p>}
        {dim && (
          <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i < dim.score ? accent : "#E5E0D8" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetailPanel({ node, org, fw, onClose, onSelectNode }: {
  node: GNode; org: Org; fw: FrameworkDef; onClose: () => void; onSelectNode: (id: string) => void
}) {
  const accent = nodeAccent(node)
  const dim = node.type === "dimension" ? (node.meta?.dim as Dimension) : null
  const rung = node.type === "ladder" ? (node.meta?.rung as LadderRung) : null
  const ind = node.type === "indicator" ? (node.meta?.ind as FrameworkIndicator) : null
  const coverage = computeCoverage(org, fw)

  function Sec({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="border-t border-border pt-4 mt-4">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2.5">{title}</p>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="absolute top-0 right-0 bottom-0 bg-card border-l border-border overflow-y-auto z-20"
      style={{ width: 360 }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: accent }}>{TYPE_LABELS[node.type]}</span>
            <h2 className="mt-0.5 text-2xl text-foreground leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>{node.label}</h2>
            {node.sublabel && node.type !== "dimension" && <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{node.sublabel}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors flex-shrink-0"><X size={15} /></button>
        </div>

        {node.type === "organisation" && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {[{k:"Domain",v:org.domain},{k:"Country",v:org.country},{k:"Cohort",v:org.cohort},{k:"Stage",v:org.stage},{k:"Women reached",v:`${org.who.women}%`},{k:"Runway",v:`${org.health.runwayMonths} mo`,warn:org.health.runwayMonths<6}].map(({k,v,warn}:{k:string;v:string;warn?:boolean}) => (
                <div key={k} className="bg-background rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k}</p>
                  <p className={`text-sm font-medium mt-0.5 ${warn ? "text-primary" : "text-foreground"}`}>{v}</p>
                </div>
              ))}
            </div>
            <Sec title="Framework coverage">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${coverage}%` }} /></div>
                <span className="text-sm font-medium">{coverage}%</span>
              </div>
              <p className="text-xs text-muted-foreground">{fw.indicators.filter(i => indicatorPresent(i, org)).length} of {fw.indicators.length} {fw.name} indicators evidenced</p>
            </Sec>
            <Sec title="Voice from the data">
              <blockquote className="text-base italic text-foreground leading-relaxed" style={{ fontFamily: "'Instrument Serif', serif" }}>"{org.voice.quote}"</blockquote>
              <p className="text-[11px] text-muted-foreground mt-2">— {org.voice.source}</p>
            </Sec>
          </>
        )}

        {node.type === "framework" && (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{fw.description}</p>
            <Sec title="Best for">
              <div className="flex flex-wrap gap-1.5">{fw.bestFor.map(t => <span key={t} className="text-xs bg-secondary text-foreground px-2 py-0.5 rounded-full">{t}</span>)}</div>
            </Sec>
            <Sec title="Aligned SDGs">
              <div className="flex flex-wrap gap-1.5">
                {fw.sdgs.map(n => { const g = SDG_GOALS.find(s => s.n === n)!; return <span key={n} className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: g.color }}>SDG {n}</span> })}
              </div>
            </Sec>
            <Sec title={`${fw.indicators.length} indicators`}>
              {fw.indicators.map(i => {
                const ok = indicatorPresent(i, org)
                return (
                  <div key={i.code} className="flex items-center gap-2 py-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ok ? "#7A8B7F" : "#E5E0D8" }} />
                    <div className="flex-1 min-w-0"><p className="text-xs text-foreground truncate">{i.label}</p><p className="text-[10px] text-muted-foreground">{i.code}</p></div>
                    <span className="text-[9px] text-muted-foreground capitalize flex-shrink-0">{i.requirement}</span>
                  </div>
                )
              })}
            </Sec>
          </>
        )}

        {(node.type === "domain" || node.type === "geography") && (
          <>
            <p className="text-sm text-muted-foreground mb-4">{node.type === "domain" ? `${org.name} operates in the ${org.domain} sector.` : `${org.name} is primarily based in ${org.country}.`}</p>
            <Sec title="Organisation">
              <button onClick={() => onSelectNode("org")} className="text-sm text-foreground hover:text-primary flex items-center gap-1 transition-colors">{org.name} <ChevronRight size={12} /></button>
            </Sec>
          </>
        )}

        {dim && (
          <>
            <p className="text-sm text-muted-foreground italic mb-4 leading-relaxed">{dim.question}</p>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1.5">{Array.from({length:5}).map((_,i) => <div key={i} style={{width:14,height:14,borderRadius:"50%",background:i<dim.score?accent:"#E5E0D8"}} />)}</div>
              <span className="text-sm text-muted-foreground">{dim.score}/5</span>
            </div>
            {dim.score === 0 && (
              <div className="bg-primary/8 border border-primary/20 rounded-xl p-3.5 mb-4">
                <p className="text-sm text-primary font-medium mb-1">No evidence collected</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Funders increasingly require {dim.name.toLowerCase()} data before approving follow-on funding.</p>
              </div>
            )}
            {node.status === "user-provided" && (
              <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 mb-4">
                <p className="text-xs text-accent font-medium">You provided this data · not independently verified</p>
              </div>
            )}
            <Sec title="Gap analysis">{dim.gaps.map((g,i) => <p key={i} className="text-sm text-foreground leading-relaxed">{g}</p>)}</Sec>
            <Sec title="Relevant indicators">
              {fw.indicators.filter(i => i.dimension === dim.name).map(i => {
                const ok = indicatorPresent(i, org)
                return <div key={i.code} className="flex items-center gap-2 py-1.5"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:ok?"#7A8B7F":"#E5E0D8"}} /><p className="text-xs text-foreground flex-1 truncate">{i.label}</p><span className="text-[9px] text-muted-foreground flex-shrink-0">{i.code}</span></div>
              })}
              {fw.indicators.filter(i => i.dimension === dim.name).length === 0 && <p className="text-xs text-muted-foreground">No indicators in {fw.name} map to this dimension.</p>}
            </Sec>
          </>
        )}

        {rung && (
          <>
            <p className="text-sm text-muted-foreground mb-4">{rung.sublabel}</p>
            <div className="bg-background rounded-xl p-5 text-center mb-4">
              <p className="text-5xl text-foreground" style={{fontFamily:"'Instrument Serif', serif"}}>{fmtCount(rung.count)}</p>
              <p className="text-xs text-muted-foreground mt-1">people at this depth</p>
            </div>
            {rung.count === null && <div className="bg-muted rounded-xl p-3.5 mb-4"><p className="text-sm text-muted-foreground leading-relaxed">No data collected. Most organisations stop counting before reaching Impact or Societal level — this is the TOMS failure mode.</p></div>}
            {node.status === "user-provided" && <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 mb-4"><p className="text-xs text-accent font-medium">You provided this data · not independently verified</p></div>}
            <Sec title="Full funnel">
              {org.ladder.map((r,i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:r.count!==null?"#7A8B7F":"#E5E0D8"}} />
                  <p className="text-xs text-foreground w-20 flex-shrink-0">{r.label}</p>
                  <p className="text-xs font-medium text-foreground">{fmtCount(r.count)}</p>
                </div>
              ))}
            </Sec>
          </>
        )}

        {ind && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:(node.meta?.present as boolean)?"#7A8B7F":"#E5E0D8"}} />
              <span className="text-sm text-muted-foreground">{(node.meta?.present as boolean) ? "Evidenced by current data" : "Not yet evidenced"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[{k:"Code",v:ind.code},{k:"Dimension",v:ind.dimension},{k:"Requirement",v:ind.requirement},{k:"Min. depth",v:["Inform","Engage","Outcomes","Impact","Societal"][ind.ladderMin]}].map(({k,v}) => (
                <div key={k} className="bg-background rounded-lg p-2.5"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k}</p><p className="text-xs font-medium text-foreground mt-0.5 capitalize">{v}</p></div>
              ))}
            </div>
            {!(node.meta?.present as boolean) && (
              <Sec title="How to evidence this">
                <p className="text-sm text-muted-foreground leading-relaxed">Collect data at the <strong className="text-foreground">{["Inform","Engage","Outcomes","Impact","Societal"][ind.ladderMin]}</strong> depth or deeper. Currently deepest for {org.name} is <strong className="text-foreground">{org.ladder[deepestRung(org)]?.label ?? "unknown"}</strong>.</p>
              </Sec>
            )}
          </>
        )}

        {node.type === "beneficiary" && (
          <>
            <p className="text-sm text-muted-foreground mb-4">A primary group served by {org.name}.</p>
            <Sec title="All groups">{org.who.groups.map((g,i) => <p key={i} className="text-sm text-foreground py-1">{g}</p>)}</Sec>
            <Sec title="Gender">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-border rounded-full h-2 overflow-hidden"><div className="h-full rounded-full" style={{width:`${org.who.women}%`,background:accent}} /></div>
                <span className="text-sm font-medium">{org.who.women}% women</span>
              </div>
            </Sec>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── Missing data panel ───────────────────────────────────────────────────────

function MissingDataPanel({ org, fw, onClose, onApply }: {
  org: Org; fw: FrameworkDef; onClose: () => void; onApply: (updated: Org) => void
}) {
  const missingLadder = org.ladder.filter(r => r.count === null)
  const lowDims = org.dims.filter(d => d.score <= 1)
  const missingInds = fw.indicators.filter(ind => !indicatorPresent(ind, org))

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)

  function set(key: string, val: string) { setInputs(p => ({ ...p, [key]: val })) }

  function apply() {
    setGenerating(true)
    setTimeout(() => {
      const updated: Org = JSON.parse(JSON.stringify(org))
      Object.entries(inputs).forEach(([key, val]) => {
        if (!val.trim()) return
        if (key.startsWith("lad-")) {
          const i = parseInt(key.slice(4))
          const n = parseInt(val.replace(/[^0-9]/g, ""))
          if (!isNaN(n)) { updated.ladder[i].count = n; (updated.ladder[i] as { _userProvided?: boolean })._userProvided = true }
        } else if (key.startsWith("dim-")) {
          const i = parseInt(key.slice(4))
          const n = Math.min(5, Math.max(0, parseInt(val)))
          if (!isNaN(n)) { updated.dims[i].score = n; (updated.dims[i] as { _userProvided?: boolean })._userProvided = true }
        }
      })
      onApply(updated)
      setGenerating(false)
    }, 1400)
  }

  const hasInputs = Object.values(inputs).some(v => v.trim())

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="absolute top-0 right-0 bottom-0 bg-card border-l border-border z-20 flex flex-col"
      style={{ width: 380 }}
    >
      <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Fill gaps</p>
          <h2 className="text-xl text-foreground mt-0.5" style={{ fontFamily: "'Instrument Serif', serif" }}>Missing information</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {fw.name} requires data you haven't collected yet. Fill in what you know — it will be marked as user-provided and the graph will regenerate.
        </p>

        {/* Missing ladder depths */}
        {missingLadder.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Missing depth data</p>
            <div className="space-y-3">
              {missingLadder.map(r => {
                const i = org.ladder.indexOf(r)
                return (
                  <div key={i} className="bg-background rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">{r.label}</p>
                      <span className="text-xs text-muted-foreground">· {r.sublabel}</span>
                    </div>
                    <input
                      type="text"
                      value={inputs[`lad-${i}`] || ""}
                      onChange={e => set(`lad-${i}`, e.target.value)}
                      placeholder="Number of people (e.g. 420)"
                      className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Low-score dimensions */}
        {lowDims.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Weak dimension evidence</p>
            <div className="space-y-3">
              {lowDims.map(d => {
                const i = org.dims.indexOf(d)
                return (
                  <div key={i} className="bg-background rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      <div className="flex gap-1">{Array.from({length:5}).map((_,j) => <div key={j} style={{width:7,height:7,borderRadius:"50%",background:j<d.score?"#E8604C":"#E5E0D8"}} />)}</div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{d.gaps[0]}</p>
                    <input
                      type="number"
                      min="0" max="5"
                      value={inputs[`dim-${i}`] || ""}
                      onChange={e => set(`dim-${i}`, e.target.value)}
                      placeholder="Updated score (0–5)"
                      className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Missing indicators */}
        {missingInds.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Not yet evidenced</p>
            <div className="space-y-2">
              {missingInds.map(ind => (
                <div key={ind.code} className="flex items-start gap-3 bg-background rounded-xl p-3.5">
                  <AlertCircle size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{ind.label}</p>
                    <p className="text-[10px] text-muted-foreground">{ind.code} · requires {["Inform","Engage","Outcomes","Impact","Societal"][ind.ladderMin]} depth data</p>
                  </div>
                  <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${ind.requirement === "required" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{ind.requirement}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {missingLadder.length === 0 && lowDims.length === 0 && missingInds.length === 0 && (
          <div className="text-center py-12">
            <Check size={24} className="text-accent mx-auto mb-3" />
            <p className="text-sm text-foreground font-medium">All data collected</p>
            <p className="text-xs text-muted-foreground mt-1">No gaps identified for this framework.</p>
          </div>
        )}
      </div>

      <div className="p-5 border-t border-border flex-shrink-0">
        <button
          onClick={apply}
          disabled={!hasInputs || generating}
          className="w-full flex items-center justify-center gap-2 bg-foreground text-background py-3 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-30"
        >
          {generating ? <><Loader2 size={14} className="animate-spin" /> Regenerating graph…</> : <><RotateCw size={14} /> Apply & regenerate graph</>}
        </button>
        <p className="text-[10px] text-muted-foreground text-center mt-2">User-provided data is flagged on nodes. Not a substitute for collected evidence.</p>
      </div>
    </motion.div>
  )
}

// ─── Overview modal ───────────────────────────────────────────────────────────

function OverviewModal({ org, fw, onClose }: { org: Org; fw: FrameworkDef; onClose: () => void }) {
  const coverage = computeCoverage(org, fw)
  const totalReached = org.ladder[0].count
  const deepest = org.ladder[deepestRung(org)]
  const zerosDims = org.dims.filter(d => d.score === 0)

  const verdict = (() => {
    const top = fmtCount(totalReached)
    const bottom = deepest?.count ? fmtCount(deepest.count) : null
    if (!bottom) return `${top} people reached at the surface. Not one figure at Impact or deeper. This organisation is counting views, not change.`
    return `${top} people reached. ${fmtCount(deepest.count)} reached ${deepest.label.toLowerCase()} — ${Math.round((deepest.count! / totalReached!) * 100)}% made it that far. ${zerosDims.length > 0 ? `${zerosDims.map(d => d.name).join(" and ")} has no evidence at all.` : "All five dimensions have some evidence."}`
  })()

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center p-8"
      style={{ background: "rgba(26,24,21,0.6)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
        className="bg-card rounded-2xl border border-border overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Impact overview</p>
            <h2 className="text-3xl text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>{org.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{org.domain} · {org.country} · assessed against {fw.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Framework coverage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{fw.name} coverage</p>
              <span className="text-2xl text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>{coverage}%</span>
            </div>
            <div className="w-full bg-border rounded-full h-2 overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${coverage}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="h-full rounded-full bg-accent" />
            </div>
          </div>

          {/* Five dimensions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Five dimensions</p>
            <div className="space-y-3">
              {org.dims.map((d, i) => (
                <div key={i} className={`rounded-xl p-4 ${d.score === 0 ? "bg-primary/5 border border-primary/20" : "bg-background"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-foreground">{d.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {d.question}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{d.score}/5</span>
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({length:5}).map((_,j) => (
                      <motion.div key={j} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 + j * 0.04 }}
                        style={{ width: 14, height: 14, borderRadius: "50%", background: j < d.score ? (d.score === 0 ? "#E8604C" : "#7A8B7F") : "#E5E0D8" }} />
                    ))}
                  </div>
                  {d.score === 0 && <p className="text-xs text-primary mt-2 font-medium">{d.gaps[0]}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Funnel */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Impact funnel</p>
            <div className="space-y-1.5">
              {org.ladder.map((r, i) => {
                const maxCount = org.ladder[0].count ?? 1
                const pct = r.count ? Math.max(4, Math.round((r.count / maxCount) * 100)) : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground w-16 flex-shrink-0">{r.label}</p>
                    <div className="flex-1 bg-border rounded-full h-5 overflow-hidden">
                      {r.count ? (
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.1, duration: 0.6, ease: "easeOut" }}
                          className="h-full rounded-full bg-foreground/80 flex items-center px-2">
                          <span className="text-[10px] text-background font-medium whitespace-nowrap">{fmtCount(r.count)}</span>
                        </motion.div>
                      ) : (
                        <div className="h-full flex items-center px-2"><span className="text-[10px] text-muted-foreground">no data</span></div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Verdict */}
          <div className="border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">The finding</p>
            <p className="font-serif text-lg text-foreground leading-relaxed" style={{ fontFamily: "'Instrument Serif', serif" }}>{verdict}</p>
          </div>

          {/* Voice */}
          <div className="bg-background rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">From the field</p>
            <blockquote className="text-base italic text-foreground leading-relaxed" style={{ fontFamily: "'Instrument Serif', serif" }}>"{org.voice.quote}"</blockquote>
            <p className="text-[11px] text-muted-foreground mt-2">— {org.voice.source}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Graph canvas ─────────────────────────────────────────────────────────────

function GraphCanvas({ nodes, edges, selectedId, onSelectNode }: {
  nodes: GNode[]; edges: GEdge[]; selectedId: string | null; onSelectNode: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.6)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const cw = containerRef.current.clientWidth, ch = containerRef.current.clientHeight
    const z = Math.min(cw / CANVAS_W, ch / CANVAS_H, 0.68)
    setZoom(z); setPan({ x: (cw - CANVAS_W * z) / 2, y: Math.max(10, (ch - CANVAS_H * z) / 2) })
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!panRef.current) return
    setPan({ x: panRef.current.px + e.clientX - panRef.current.mx, y: panRef.current.py + e.clientY - panRef.current.my })
  }
  function onMouseUp() { panRef.current = null }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const newZ = Math.max(0.18, Math.min(2.2, zoom * (e.deltaY > 0 ? 0.92 : 1.09)))
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setPan(p => ({ x: mx - (mx - p.x) * (newZ / zoom), y: my - (my - p.y) * (newZ / zoom) }))
    setZoom(newZ)
  }
  function fitScreen() {
    if (!containerRef.current) return
    const cw = containerRef.current.clientWidth, ch = containerRef.current.clientHeight
    const z = Math.min(cw / CANVAS_W, ch / CANVAS_H, 0.68)
    setZoom(z); setPan({ x: (cw - CANVAS_W * z) / 2, y: Math.max(10, (ch - CANVAS_H * z) / 2) })
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: panRef.current ? "grabbing" : "grab", background: "#FAF8F4" }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, #D4CFC8 1px, transparent 1px)", backgroundSize: `${22 * zoom}px ${22 * zoom}px`, backgroundPosition: `${pan.x % (22 * zoom)}px ${pan.y % (22 * zoom)}px`, opacity: 0.5 }}
      />
      <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", width: CANVAS_W, height: CANVAS_H }}>
        <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}
          style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, overflow: "visible", pointerEvents: "none" }}>
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="#C8C2B6" />
            </marker>
          </defs>
          {edges.map(e => <EdgePath key={e.id} edge={e} nodes={nodes} />)}
        </motion.svg>
        {nodes.map((node, i) => (
          <motion.div key={node.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025, duration: 0.25 }}>
            <NodeCard node={node} selected={selectedId === node.id} onClick={() => onSelectNode(node.id)} />
          </motion.div>
        ))}
      </div>
      <div className="absolute bottom-5 right-5 flex flex-col gap-1.5 z-10">
        <button onClick={() => setZoom(z => Math.min(2.2, z * 1.15))} className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-sm"><ZoomIn size={13} /></button>
        <button onClick={() => setZoom(z => Math.max(0.18, z * 0.87))} className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-sm"><ZoomOut size={13} /></button>
        <button onClick={fitScreen} className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-sm text-[10px] font-semibold">fit</button>
      </div>
    </div>
  )
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({ org, fw, open, onToggle }: { org: Org; fw: FrameworkDef; open: boolean; onToggle: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem("imp_ant_key") || "" } catch { return "" } })
  const [showKey, setShowKey] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const coverage = computeCoverage(org, fw)

  const systemPrompt = useMemo(() =>
    `You are an impact analysis assistant for Impact Meta-Layer. You are analysing ${org.name}, a ${org.stage} organisation in the ${org.domain} sector in ${org.country}, assessed against ${fw.name}.
DATA: Funnel: ${org.ladder.map(r => `${r.label}=${fmtCount(r.count)}`).join(", ")}. Dimensions: ${org.dims.map(d => `${d.name}=${d.score}/5`).join(", ")}. Coverage: ${coverage}%. Women: ${org.who.women}%. Groups: ${org.who.groups.join(", ")}.
Be concise (3-5 sentences). Cite numbers. Be honest about gaps.`, [org, fw, coverage])

  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 350) }, [open])

  async function send() {
    if (!input.trim() || loading) return
    const key = apiKey.trim()
    if (!key) { setShowKey(true); return }
    const userMsg: ChatMsg = { role: "user", content: input.trim() }
    setMessages(prev => [...prev, userMsg]); setInput(""); setLoading(true)
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 800, system: systemPrompt, messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error?.message || `HTTP ${resp.status}`)
      setMessages(prev => [...prev, { role: "assistant", content: data.content?.[0]?.text ?? "No response." }])
    } catch (e: unknown) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Unknown"}` }])
    }
    setLoading(false)
  }

  function saveKey(k: string) { setApiKey(k); try { localStorage.setItem("imp_ant_key", k) } catch {} }

  return (
    <>
      <button onClick={onToggle} className="absolute bottom-5 left-5 z-30 flex items-center gap-2 bg-foreground text-background px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg hover:bg-foreground/90 transition-colors">
        <MessageSquare size={14} />Ask Claude
        {messages.length > 0 && <span className="bg-primary text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5">{messages.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 400, damping: 38 }}
            className="absolute bottom-0 left-0 right-0 bg-card border-t border-border z-20 flex flex-col" style={{ height: 300 }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Ask about {org.name}</span>
                <span className="text-xs text-muted-foreground">· {fw.name} context</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowKey(s => !s)} className={`p-1.5 rounded-lg hover:bg-secondary transition-colors ${apiKey ? "text-accent" : "text-muted-foreground"}`}><Key size={13} /></button>
                <button onClick={onToggle} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={14} /></button>
              </div>
            </div>
            <AnimatePresence>
              {showKey && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border">
                    <Key size={11} className="text-muted-foreground flex-shrink-0" />
                    <input type="password" value={apiKey} onChange={e => saveKey(e.target.value)} placeholder="sk-ant-… Anthropic API key" className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground outline-none" />
                    {apiKey && <Check size={11} className="text-accent flex-shrink-0" />}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {[`What's ${org.name}'s biggest gap?`,`How does it compare to ${fw.name}?`,"Why is Contribution always missing?"].map(q => (
                    <button key={q} onClick={() => setInput(q)} className="text-xs bg-secondary hover:bg-border text-foreground px-3 py-1.5 rounded-full transition-colors">{q}</button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-foreground text-background" : "bg-background border border-border text-foreground"}`}>{m.content}</div>
                </div>
              ))}
              {loading && <div className="flex justify-start"><div className="bg-background border border-border rounded-xl px-3.5 py-2.5"><Loader2 size={13} className="text-muted-foreground animate-spin" /></div></div>}
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder={apiKey ? "Ask anything about this graph…" : "Enter API key above to ask questions"} className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors" />
              <button onClick={send} disabled={loading || !input.trim()} className="p-2 bg-foreground text-background rounded-lg disabled:opacity-30 hover:bg-foreground/90 transition-colors"><Send size={14} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function DropScreen({ onDrop }: { onDrop: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-6xl text-foreground leading-none mb-4" style={{ fontFamily: "'Instrument Serif', serif" }}>Drop your<br />impact data in.</h1>
        <p className="text-muted-foreground text-base mb-12">19 files · 4 cohorts · 2 languages · no join key — that's fine.</p>
        <div
          onDragOver={e => { e.preventDefault(); setHover(true) }} onDragLeave={() => setHover(false)}
          onDrop={e => { e.preventDefault(); setHover(false); onDrop() }} onClick={onDrop}
          className={`border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all ${hover ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25 hover:bg-card"}`}
        >
          <Upload size={28} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Click to load the sample Aurelia Propel dataset</p>
        </div>
      </div>
    </div>
  )
}

function CleanScreen({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const [phase, setPhase] = useState<"log" | "flags">("log")
  const [resolved, setResolved] = useState<Record<number, string>>({})
  const done = shown >= CLEANING_LOG.length

  useEffect(() => {
    if (shown >= CLEANING_LOG.length) return
    const t = setTimeout(() => setShown(s => s + 1), 360)
    return () => clearTimeout(t)
  }, [shown])

  const flagCount = CLEANING_LOG.filter(l => l.type === "warn").length
  const allResolved = FLAGGED_ITEMS.every((_, i) => resolved[i] !== undefined)

  function autoResolveAll() {
    const r: Record<number, string> = {}
    FLAGGED_ITEMS.forEach((item, i) => { r[i] = item.auto })
    setResolved(r)
  }

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Glass-box cleaning</p>
        <div className="flex items-baseline gap-3 mb-8 flex-wrap">
          <span className="text-3xl text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>312 fixes</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-lg">47 orgs resolved</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-primary text-lg">{flagCount} flagged for you</span>
        </div>

        {/* Tab toggle */}
        {done && (
          <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-6 w-fit">
            {(["log", "flags"] as const).map(t => (
              <button key={t} onClick={() => setPhase(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${phase === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "log" ? "Cleaning log" : `Flagged items (${FLAGGED_ITEMS.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Log view */}
        {phase === "log" && (
          <div className="space-y-2.5 mb-10">
            {CLEANING_LOG.slice(0, shown).map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0">
                  {item.type === "fix" && <Check size={13} className="text-accent" />}
                  {item.type === "warn" && <AlertTriangle size={13} className="text-primary" />}
                  {item.type === "skip" && <span className="text-sm text-muted-foreground leading-none">⊘</span>}
                </span>
                <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
              </motion.div>
            ))}
            {!done && <div className="flex items-center gap-2 pt-1"><Loader2 size={12} className="text-muted-foreground animate-spin" /><p className="text-sm text-muted-foreground">Processing…</p></div>}
          </div>
        )}

        {/* Flags view */}
        {phase === "flags" && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">Each conflict needs a resolution before you can continue.</p>
              <button onClick={autoResolveAll} className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 font-medium transition-colors">
                <Sparkles size={13} /> Auto-resolve all
              </button>
            </div>
            <div className="space-y-3">
              {FLAGGED_ITEMS.map((item, i) => (
                <div key={i} className={`rounded-xl border transition-colors ${resolved[i] !== undefined ? "border-accent/30 bg-accent/5" : "border-border bg-card"}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.org}</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">{item.field}</p>
                      </div>
                      {resolved[i] !== undefined && <span className="flex items-center gap-1 text-xs text-accent font-medium"><Check size={11} /> Resolved: {resolved[i]}</span>}
                    </div>
                    {resolved[i] === undefined && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground mb-2">Two conflicting values — which is correct?</p>
                        <div className="flex gap-2">
                          {item.values.map((v, vi) => (
                            <button key={vi} onClick={() => setResolved(r => ({ ...r, [i]: v.replace(/[^0-9]/g, "") }))}
                              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground hover:border-foreground/30 hover:bg-card transition-colors font-mono">
                              {v}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setResolved(r => ({ ...r, [i]: item.auto }))}
                          className="w-full flex items-center justify-center gap-1.5 text-xs text-accent border border-accent/30 rounded-lg py-2 hover:bg-accent/5 transition-colors">
                          <Sparkles size={11} /> Auto-resolve (use {item.auto})
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (phase === "log" || allResolved) && (
          <motion.button
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            onClick={onDone}
            className="bg-foreground text-background px-8 py-3 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            {phase === "log" && !allResolved ? "Review flagged items →" : "View organisations →"}
          </motion.button>
        )}
        {done && phase === "log" && !allResolved && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setPhase("flags")}
            className="ml-3 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Skip review
          </motion.button>
        )}
      </div>
    </div>
  )
}

function OrgSelectScreen({ onSelect }: { onSelect: (org: Org) => void }) {
  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Step 1 of 3</p>
        <h2 className="text-4xl text-foreground mb-10" style={{ fontFamily: "'Instrument Serif', serif" }}>Which organisation?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORGS.map(org => (
            <button key={org.id} onClick={() => onSelect(org)} className="bg-card border border-border rounded-xl p-5 text-left hover:border-foreground/25 hover:bg-white transition-all">
              <div className="flex items-start justify-between mb-3">
                <div><p className="font-medium text-foreground">{org.name}</p><p className="text-xs text-muted-foreground mt-0.5">{org.domain} · {org.country}</p></div>
                <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full flex-shrink-0">{org.cohort}</span>
              </div>
              <div className="flex gap-1.5">{org.dims.map((d,i) => <div key={i} className="rounded-full" style={{width:8,height:8,background:d.score>=4?"#7A8B7F":d.score>=2?"#C4A55A":"#E5E0D8"}} />)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SdgSelectScreen({ org, onNext, onBack }: { org: Org; onNext: (sdgs: number[]) => void; onBack: () => void }) {
  const [selected, setSelected] = useState<number[]>([])

  function toggle(n: number) {
    setSelected(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n])
  }

  const recommended = [...FRAMEWORKS]
    .map(fw => ({ fw, score: sdgAlignment(fw, selected) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-8 transition-colors"><ArrowLeft size={14} /> Back</button>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Step 2 of 3 · {org.name}</p>
        <h2 className="text-4xl text-foreground mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>What impact do you want to make?</h2>
        <p className="text-muted-foreground mb-10">Select the SDGs most relevant to this organisation. This helps us recommend the right framework.</p>

        {/* SDG grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-10">
          {SDG_GOALS.map(goal => {
            const isSelected = selected.includes(goal.n)
            const isOrgRelevant = goal.orgs.includes(org.name)
            return (
              <button
                key={goal.n}
                onClick={() => toggle(goal.n)}
                className="relative rounded-xl p-3 text-left transition-all group"
                style={{
                  background: isSelected ? goal.color : "#F5F2EC",
                  border: `2px solid ${isSelected ? goal.color : "transparent"}`,
                  transform: isSelected ? "scale(1.04)" : "scale(1)",
                  boxShadow: isSelected ? `0 4px 14px ${goal.color}40` : "none",
                }}
              >
                {isOrgRelevant && !isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: goal.color }} />
                )}
                <p className={`text-xl font-bold mb-1 ${isSelected ? "text-white" : "text-foreground"}`} style={{ fontFamily: "'Instrument Serif', serif" }}>{goal.n}</p>
                <p className={`text-[10px] font-semibold leading-tight ${isSelected ? "text-white/90" : "text-foreground"}`}>{goal.title}</p>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-foreground text-background text-[10px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                  {goal.short}
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected + recommendation */}
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            {selected.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select SDGs to see framework recommendations. Dots indicate goals relevant to {org.name}'s domain.</p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Selected goals ({selected.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.sort((a,b) => a-b).map(n => { const g = SDG_GOALS.find(s => s.n === n)!; return (
                    <button key={n} onClick={() => toggle(n)} className="flex items-center gap-1.5 text-xs font-medium text-white px-2.5 py-1 rounded-full" style={{background:g.color}}>
                      SDG {n} · {g.title} <X size={10} />
                    </button>
                  )})}
                </div>
              </div>
            )}
          </div>

          {recommended.length > 0 && (
            <div className="flex-shrink-0 min-w-[220px]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Recommended frameworks</p>
              <div className="space-y-2">
                {recommended.map(({ fw, score }) => (
                  <div key={fw.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2.5">
                    <div><p className="text-sm font-medium text-foreground">{fw.name}</p><p className="text-xs text-muted-foreground">{fw.fullName.split(" ").slice(0, 3).join(" ")}…</p></div>
                    <span className="text-sm font-semibold text-accent">{score}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 flex items-center gap-4">
          <button
            onClick={() => onNext(selected)}
            className="bg-foreground text-background px-8 py-3 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            {selected.length > 0 ? "Choose framework →" : "Skip to framework →"}
          </button>
          {selected.length > 0 && <p className="text-xs text-muted-foreground">Frameworks will be ranked by your goal alignment.</p>}
        </div>
      </div>
    </div>
  )
}

function FrameworkSelectScreen({ org, selectedSdgs, onSelect, onBack }: {
  org: Org; selectedSdgs: number[]; onSelect: (fw: FrameworkDef) => void; onBack: () => void
}) {
  const ranked = [...FRAMEWORKS].map(fw => ({ fw, alignment: sdgAlignment(fw, selectedSdgs), coverage: computeCoverage(org, fw) }))
    .sort((a, b) => selectedSdgs.length > 0 ? b.alignment - a.alignment : b.coverage - a.coverage)

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-8 transition-colors"><ArrowLeft size={14} /> Back</button>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Step 3 of 3 · {org.name}</p>
        <h2 className="text-4xl text-foreground mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>Which framework?</h2>
        {selectedSdgs.length > 0 && <p className="text-muted-foreground mb-10">Sorted by alignment with your {selectedSdgs.length} selected SDG{selectedSdgs.length > 1 ? "s" : ""}.</p>}
        {selectedSdgs.length === 0 && <p className="text-muted-foreground mb-10">Sorted by data coverage for {org.name}.</p>}
        <div className="space-y-3">
          {ranked.map(({ fw, alignment, coverage }, idx) => (
            <button key={fw.id} onClick={() => onSelect(fw)} className="w-full bg-card border border-border rounded-xl p-5 text-left hover:border-foreground/25 hover:bg-white transition-all flex items-center justify-between gap-4 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-foreground">{fw.name}</p>
                  {idx === 0 && selectedSdgs.length > 0 && <span className="text-[10px] bg-accent text-white font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">Best match</span>}
                  <p className="text-xs text-muted-foreground">{fw.fullName}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{fw.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {fw.bestFor.map(t => <span key={t} className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">{t}</span>)}
                </div>
                {selectedSdgs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {fw.sdgs.filter(n => selectedSdgs.includes(n)).map(n => { const g = SDG_GOALS.find(s => s.n === n)!; return <span key={n} className="text-[9px] font-medium text-white px-1.5 py-0.5 rounded-full" style={{background:g.color}}>SDG {n}</span> })}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0 space-y-1">
                <div>
                  <p className="text-2xl font-medium text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>{coverage}%</p>
                  <p className="text-[10px] text-muted-foreground">data coverage</p>
                </div>
                {selectedSdgs.length > 0 && (
                  <div>
                    <p className="text-lg font-medium text-accent">{alignment}%</p>
                    <p className="text-[10px] text-muted-foreground">SDG alignment</p>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const LOADING_STEPS = [
  "Reading organisation profile…",
  "Loading framework configuration…",
  "Mapping impact dimensions to indicators…",
  "Tracing data coverage across ladder rungs…",
  "Identifying gaps in evidence chains…",
  "Assembling knowledge graph…",
]

function GraphLoadingScreen({ org, fw, onDone }: { org: Org; fw: FrameworkDef; onDone: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= LOADING_STEPS.length) { setTimeout(onDone, 380); return }
    const t = setTimeout(() => setStep(s => s + 1), 470)
    return () => clearTimeout(t)
  }, [step, onDone])
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full px-8 text-center">
        <div className="relative mx-auto mb-12 w-20 h-20">
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="absolute inset-0 rounded-full bg-primary/15" />
          <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.25 }} className="absolute inset-3 rounded-full bg-primary/25" />
          <div className="absolute inset-6 rounded-full bg-primary" />
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Building knowledge graph</p>
        <p className="text-2xl text-foreground mb-8" style={{ fontFamily: "'Instrument Serif', serif" }}>{org.name} × {fw.name}</p>
        <div className="space-y-2.5 text-left">
          {LOADING_STEPS.slice(0, step).map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
              <Check size={12} className="text-accent flex-shrink-0" /><p className="text-sm text-muted-foreground">{s}</p>
            </motion.div>
          ))}
          {step < LOADING_STEPS.length && (
            <div className="flex items-center gap-3">
              <Loader2 size={12} className="text-muted-foreground animate-spin flex-shrink-0" /><p className="text-sm text-foreground">{LOADING_STEPS[step]}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GraphScreen({ org: initialOrg, fw, onBack }: { org: Org; fw: FrameworkDef; onBack: () => void }) {
  const [orgData, setOrgData] = useState<Org>(initialOrg)
  const { nodes, edges } = useMemo(() => buildGraph(orgData, fw), [orgData, fw])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rightPanel, setRightPanel] = useState<"node" | "gaps" | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [graphKey, setGraphKey] = useState(0)

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null
  const coverage = computeCoverage(orgData, fw)
  const missingCount = fw.indicators.filter(ind => !indicatorPresent(ind, orgData)).length

  function handleNodeClick(id: string) {
    setSelectedId(prev => prev === id ? null : id)
    setRightPanel("node")
  }

  function handleApplyGaps(updated: Org) {
    setOrgData(updated)
    setGraphKey(k => k + 1)
    setRightPanel(null)
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 bg-card/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors flex-shrink-0"><ArrowLeft size={13} /> Back</button>
          <div className="w-px h-5 bg-border flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm leading-tight truncate">{orgData.name}</p>
            <p className="text-xs text-muted-foreground truncate">{orgData.domain} · {orgData.country}</p>
          </div>
          <span className="text-xs bg-foreground text-background px-2.5 py-1 rounded-full font-medium flex-shrink-0">{fw.name}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-16 bg-border rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${coverage}%` }} /></div>
            <span className="text-xs text-muted-foreground">{coverage}% covered</span>
          </div>
        </div>
        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {missingCount > 0 && (
            <button
              onClick={() => { setRightPanel(p => p === "gaps" ? null : "gaps"); setSelectedId(null) }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${rightPanel === "gaps" ? "border-primary/30 bg-primary/8 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`}
            >
              <Plus size={11} /> Fill {missingCount} gaps
            </button>
          )}
          <button
            onClick={() => setShowOverview(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-medium"
          >
            <LayoutGrid size={11} /> Overview
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas
          key={graphKey}
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          onSelectNode={handleNodeClick}
        />

        <AnimatePresence>
          {rightPanel === "node" && selectedNode && (
            <NodeDetailPanel key={selectedNode.id} node={selectedNode} org={orgData} fw={fw} onClose={() => { setRightPanel(null); setSelectedId(null) }} onSelectNode={id => { setSelectedId(id); setRightPanel("node") }} />
          )}
          {rightPanel === "gaps" && (
            <MissingDataPanel key="gaps" org={orgData} fw={fw} onClose={() => setRightPanel(null)} onApply={handleApplyGaps} />
          )}
        </AnimatePresence>

        <ChatPanel org={orgData} fw={fw} open={chatOpen} onToggle={() => setChatOpen(o => !o)} />

        {/* Overview modal */}
        <AnimatePresence>
          {showOverview && <OverviewModal org={orgData} fw={fw} onClose={() => setShowOverview(false)} />}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("drop")
  const [org, setOrg] = useState<Org | null>(null)
  const [selectedSdgs, setSelectedSdgs] = useState<number[]>([])
  const [fw, setFw] = useState<FrameworkDef | null>(null)

  return (
    <AnimatePresence mode="wait">
      {screen === "drop" && (
        <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <DropScreen onDrop={() => setScreen("clean")} />
        </motion.div>
      )}
      {screen === "clean" && (
        <motion.div key="clean" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <CleanScreen onDone={() => setScreen("org-select")} />
        </motion.div>
      )}
      {screen === "org-select" && (
        <motion.div key="org-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <OrgSelectScreen onSelect={o => { setOrg(o); setScreen("sdg-select") }} />
        </motion.div>
      )}
      {screen === "sdg-select" && org && (
        <motion.div key="sdg-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <SdgSelectScreen org={org} onNext={sdgs => { setSelectedSdgs(sdgs); setScreen("framework-select") }} onBack={() => setScreen("org-select")} />
        </motion.div>
      )}
      {screen === "framework-select" && org && (
        <motion.div key="fw-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <FrameworkSelectScreen org={org} selectedSdgs={selectedSdgs} onSelect={f => { setFw(f); setScreen("graph-loading") }} onBack={() => setScreen("sdg-select")} />
        </motion.div>
      )}
      {screen === "graph-loading" && org && fw && (
        <motion.div key="graph-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <GraphLoadingScreen org={org} fw={fw} onDone={() => setScreen("graph")} />
        </motion.div>
      )}
      {screen === "graph" && org && fw && (
        <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} style={{ height: "100vh" }}>
          <GraphScreen org={org} fw={fw} onBack={() => setScreen("framework-select")} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
