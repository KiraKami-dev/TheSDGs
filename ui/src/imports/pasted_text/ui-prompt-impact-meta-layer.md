# UI Prompt — Impact Meta-Layer

> Paste this into Claude / v0 / Cursor as the design brief.

---

## What we're building (the solution this UI is for)

**Impact Meta-Layer — a layer that sits *above* impact frameworks, not beside them.**

There is no shortage of impact frameworks: IRIS+, SDG indicators, Theory of Change, GRI, B Impact Assessment. There is a shortage of anything that answers *which framework should I use, and is my data actually feeding it?* Organisations pick a framework because a funder asked, can't compare with anyone who picked a different one, and have no idea how badly their own data covers it.

The system takes any project, in any domain, and runs four steps:

| # | Step | Output |
|---|---|---|
| **1** | **Classify** | Project → impact category + semantic profile (domain, stakeholders, intervention type, geography, maturity) |
| **2** | **Recommend** | The framework that actually fits — with the reasoning shown |
| **3** | **Assess** | Ingest their existing messy exports → score how well the data covers that framework |
| **4** | **Guide & compare** | Name the missing elements, prescribe fixes, benchmark against comparable projects |

Wrapped around step 3 is a **glass-box cleaning agent** that turns real-world exports into something assessable — and shows every fix it made and why.

**The backbone is the Five Dimensions of Impact.** Frameworks are brands; the Five Dimensions are the grammar underneath all of them. Every indicator, whatever it's called, reduces to five questions:

| Dimension | The question |
|---|---|
| **What** | What outcome occurs? Positive or negative? How much does it matter to the stakeholder? |
| **Who** | Which stakeholders experience it? How underserved are they? |
| **How Much** | Scale — how many. Depth — how significant. Duration — how long. |
| **Contribution** | Would this have happened anyway, without us? |
| **Risk** | What could make the impact fail to materialise? |

A solar project on GRI, a hygiene project on IRIS+, and an education project running a custom ToC all normalise to the same five slots. **We compare on the backbone, not on the framework.** Only the structure layer is hard-coded — framework vocabulary (IRIS+) and domain depth instruments (e.g. the WASH Inform → Engage → Outcomes → Impact → Societal ladder) are pluggable configuration.

**The proof case** is the Aurelia Propel dataset: 19 CSV exports, four cohorts, Nov 2022 → May 2026, no join key, mutating question wording, two languages, mixed delimiters, clashing number formats. If the meta-layer can eat this, it can eat anything.

**The insight it surfaces:** most organisations report huge numbers at the top of the depth ladder and nothing at the bottom, and never report Contribution or Risk at all. That is exactly the TOMS failure mode — millions of shoes donated is an enormous *How Much · Scale* number, and Contribution was never measured. The system produces that finding automatically, per organisation.

**The UI's job is to make all of the above legible in thirty seconds.** Everything below is how.

---

## The one-line brief

Build a single-page web app called **Impact Meta-Layer** that turns a folder of messy survey exports into a human-readable picture of *who a social enterprise actually changed, how deeply, and how sure we are.*

The whole product must be understandable by a programme manager who has never heard of IRIS+ in **under 30 seconds**. If a screen needs explaining, it's wrong.

---

## The emotional target

This is not a BI dashboard. It is a **portrait of people**.

Every big number on screen is a human being. The UI should keep reminding you of that — not with stock photos of smiling children, but with restraint, warmth and honesty. The most powerful moment in the product is when it says *"you counted 340,000 views and zero lives changed."* Design toward that moment.

**Tone:** quiet confidence. Editorial, not corporate. Think a well-set annual report crossed with a medical chart. Never gamified, never celebratory about weak data.

---

## Visual direction

- **Palette:** warm off-white paper `#FBF9F5` base, deep near-black `#1A1815` text, one signal coral `#E8604C` (YSI red), one calm sage `#7A8B7F`. Grey `#A8A29A` for "no data". Nothing else. Colour is a *statement*, not decoration.
- **Type:** a high-contrast serif for headlines (Instrument Serif / Fraunces) at genuinely large sizes; a clean grotesque (Inter) for everything else. Big headline, small quiet body. That contrast alone carries the design.
- **Layout:** generous whitespace, single column, max ~1100px, one idea per vertical band. Scroll, don't tab.
- **Corners:** soft (12–16px). **Shadows:** almost none — use hairline `#E5E0D8` borders instead.
- **Motion:** slow and few. Numbers count up once on reveal. Bars fill left to right in 600ms ease-out. Nothing bounces.

---

## The one visual idea everything hangs on: **the Five Dots**

Every dimension of impact is shown as **five dots** — filled coral, hollow grey.

```
What          ● ● ● ○ ○
Who           ● ● ● ● ○
How Much      ● ● ● ● ●
Contribution  ○ ○ ○ ○ ○      ← empty is the story
Risk          ● ○ ○ ○ ○
```

Rules:
- Dots are **large** (14px) and finger-sized clickable.
- An **all-empty row must feel loud** — give it a faint coral wash behind it and a short plain-English line: *"Nobody asked whether this would have happened anyway."*
- Hovering a dot reveals what evidence would fill it.
- These dots appear at every scale: one org, one cohort, the whole portfolio. Same five rows, always in the same order. Learn it once, read it everywhere.

---

## Screens (four, no more)

### 1 · Drop
A near-empty page. Huge serif line: **"Drop your impact data in."** One dashed drop zone. Below, in small grey text: *19 files, 4 cohorts, 2 languages, no join key — that's fine.*

### 2 · The Clean (glass box)
As files process, rows stream in like a live log — each one a plain sentence, not a JSON diff:

- ✓ *Found `120.000` in a revenue column — read as **120,000**, Brazilian format*
- ✓ *`Brightpath Sol.` and `BrightPath Solutions` are the same org — matched on email domain*
- ⚠ *`$65,000` vs `65000` in the same column — **flagged, not guessed***
- ⊘ *This question wasn't asked in 2023 — left blank, not zero*

A running counter at top: **312 fixes · 47 orgs resolved · 9 flagged for you.** Nothing is silently changed. The flagged items sit in a small review tray the user can open and resolve.

### 3 · The Portrait (the hero screen)
One organisation. Structured as a story, top to bottom:

**a) Header** — org name in large serif, one line of plain English underneath: *WASH & hygiene · South Africa · AP1 cohort · early growth.*

**b) The Ladder** — the emotional centrepiece. Five horizontal bars, widest at top, narrowing downward, showing how many people made it to each depth:

```
Inform      ████████████████████  340,000   saw a video
Engage      ███                    12,000   attended a workshop
Outcomes    ▏                         800   learned the skill
Impact                                  —   changed behaviour
Societal                                —   life materially better
```

Where the ladder goes empty, the bar area shouldn't just be blank — it should show a soft grey band with the words *no data collected here.* The visual shape of the funnel **is** the insight.

**c) The Five Dots** for this org, with one-line plain-English gaps under each.

**d) The verdict card** — a single bordered card, serif, quiet, generated per org:

> *"340,000 people informed. 12,000 engaged. Not one figure at Impact or Societal Impact. This organisation is counting views, not change."*

**e) Health strip** — small, secondary: revenue ↑, runway **4 months ⚠**, team 6 FTE. Deliberately visually subordinate to impact.

**f) Traceability** — every single number on this page is clickable. Click → a slim right-hand drawer slides in showing the exact source file, the exact original column header (in its original wording and language), and the raw cell value. This drawer is the trust mechanism. Make it feel instant.

### 4 · The Field
All organisations at once. A grid of small cards, each showing just: name + the five dots. Sortable by "most complete" / "biggest gap". Instantly you can see the pattern — a whole column of empty Contribution rows across the entire portfolio. Click one → back to its Portrait.

---

## Social-aspect elements (must be present)

1. **People, not rows.** Never label anything "records" or "entities". Say *organisations*, *people reached*, *women*, *communities*.
2. **The Who dimension gets its own small panel** on the Portrait: share of women, which marginalised groups, and an honest grey marker where underservedness was never baselined.
3. **Voices.** Pull one real free-text answer from the org's own survey responses and set it as a large pull-quote in serif, attributed to the wave it came from. Their words, unedited, next to their numbers.
4. **Geography, lightly.** A tiny non-interactive map dot showing where beneficiaries are — presence, not analytics.
5. **Honest absence.** Missing data is never zero and never hidden. It is drawn as a deliberate grey shape with the words *not measured*. Absence is a finding.

---

## Hard constraints

- No sidebar. No tabs. No modals except the source drawer.
- No more than **two** numbers above 1,000 visible at once — everything else is prose or shape.
- Every technical term must be immediately followed by plain English on first appearance (*Contribution — would this have happened anyway?*).
- Responsive down to 380px; the five dots and the ladder must both survive mobile.
- Accessible: dots need shape/label redundancy, not colour alone. AA contrast throughout.

---

## The 30-second demo path

Drop ZIP → watch it clean itself in plain English → land on one organisation → see the funnel collapse to nothing at the bottom → read the one-sentence verdict → click a number and see exactly which cell it came from.

If a judge understands the product without you narrating it, the UI has done its job.