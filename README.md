# Impact Meta-Layer

**Team: TheSDGs** · YSI Track — Claude Impact Lab Hackathon (ZOLLHOF Nuremberg, July 2026)

A layer that sits *above* impact frameworks, not beside them. Drop in messy survey exports; get a clear picture of **who a social enterprise actually changed, how deeply, and how sure you are** — in under 30 seconds for a programme manager who has never heard of IRIS+.

---

## The problem

Impact frameworks are everywhere: IRIS+, SDG indicators, Theory of Change, GRI, B Impact Assessment. What’s missing is anything that answers:

> *Which framework should I use — and is my data actually feeding it?*

Organisations pick a framework because a funder asked. They can’t compare with peers on a different one. They rarely know how badly their own data covers the framework they chose. Contribution and Risk — the dimensions that stop you from celebrating vanity metrics — are almost never measured at all.

Meanwhile the data itself is hostile: mixed delimiters, two languages, no shared join key, mutating question wording, clashing number formats. Cleaning it is half the job; making the cleaning *auditable* is the other half.

---

## The idea

**Impact Meta-Layer** takes any project, in any domain, and runs four steps:

| # | Step | Output |
|---|---|---|
| **1** | **Classify** | Project → impact category + semantic profile (domain, stakeholders, intervention, geography, maturity) |
| **2** | **Recommend** | The framework that actually fits — with the reasoning shown |
| **3** | **Assess** | Ingest messy exports → score how well the data covers that framework |
| **4** | **Guide & compare** | Name what’s missing, prescribe fixes, benchmark against comparable projects |

Wrapped around step 3 is a **glass-box cleaning agent**: every fix is a plain-English sentence you can read and trust, not a silent coercion.

### The backbone: Five Dimensions of Impact

Frameworks are brands. The Five Dimensions are the grammar underneath them. Every indicator, whatever it’s called, reduces to five questions:

| Dimension | The question |
|---|---|
| **What** | What outcome occurs? Positive or negative? How much does it matter? |
| **Who** | Which stakeholders experience it? How underserved are they? |
| **How Much** | Scale · Depth · Duration |
| **Contribution** | Would this have happened anyway, without us? |
| **Risk** | What could make the impact fail to materialise? |

A solar project on GRI, a hygiene project on IRIS+, and an education project on a custom Theory of Change all normalise to the same five slots. **We compare on the backbone, not on the framework.**

Only the structure layer is hard-coded. Framework vocabulary (e.g. IRIS+) and domain depth instruments (e.g. WASH Inform → Engage → Outcomes → Impact → Societal) are pluggable configuration.

### The insight the system is built to surface

Most organisations report huge numbers at the top of the depth ladder and nothing at the bottom — and never report Contribution or Risk at all. That is the TOMS failure mode: millions of shoes donated is an enormous *How Much · Scale* number, and Contribution was never measured. The system produces that finding automatically, per organisation.

---

## Proof case: Aurelia Propel

The dataset is 19 CSV exports from the Aurelia accelerator programmes (AP1–AP4, Nov 2022 → May 2026) — **67 social enterprises**, financial *and* social impact, provided by Yunus Social Innovation for the hackathon.

It is deliberately messy:

- Mixed delimiters (comma / semicolon)
- English and Portuguese
- No shared organisation ID
- Inconsistent number formats (`120.000`, `150000`, `$65,000`)
- Survey questions whose wording drifts every wave

If the meta-layer can eat this, it can eat anything.

---

## What’s in this repo

```
TheSDGs/
├── ui/           # React app — Drop → Clean (glass box) → Field / Demo
├── backend/      # FastAPI + cleaning & analyse agents (PydanticAI)
└── OVERVIEW/     # Deterministic pipeline + Streamlit portfolio dashboard
```

| Surface | Role |
|---|---|
| **UI + API** | Product path: drop files, watch glass-box cleaning, explore the portfolio, run the scripted pitch demo |
| **OVERVIEW** | Rule-based timeline builder, Impact Health Score, SDG/IRIS+ tagging, and a five-screen Streamlit dashboard that shows every join and rejection |

### Product principles

- Every AI-generated claim, tag, or figure traces to a real data point
- SDG / IRIS+ tags only where an org’s actual metrics support them
- Cleaning is transparent: rejected values are reported, never silently coerced
- Empty Contribution / Risk rows should feel loud — that silence *is* the finding

---

## Quick start

### UI + backend

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
# then start the API (see backend package docs / uvicorn entry)

# Frontend
cd ui
npm i
npm run dev
```

### OVERVIEW dashboard

```bash
cd OVERVIEW
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m pipeline.build_timeline
streamlit run app.py
```

---

## Data notice

The Aurelia dataset is **pseudonymised** accelerator data from Yunus Social Innovation. Names, contacts, and phone numbers are generated stand-ins. Use it for the hackathon; treat findings as illustrations of the method, not claims about named real-world organisations.

---

## Hackathon context

Built for the **YSI Track — AI-Powered Impact Intelligence** challenge at the Claude Impact Lab Hackathon.
