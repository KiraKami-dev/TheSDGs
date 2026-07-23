# Aurelia Propel — AI-Powered Impact Intelligence

YSI Track submission for the Claude Impact Lab Hackathon. Turns 19 inconsistent
survey exports from the Aurelia accelerator programmes (AP1–AP4, Nov 2022 → May
2026) into a decision-ready portfolio view of **67 social enterprises** — across
**financial *and* social impact**.

The raw data is deliberately messy: mixed delimiters, two languages (EN/PT), no
shared join key between organisations, inconsistent number formats, and survey
questions whose wording changes every wave. The pipeline resolves, maps, cleans,
and scores all of it, and the dashboard makes it legible to a programme manager.

## Run it

```bash
python -m venv venv
venv/Scripts/activate        # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python -m pipeline.build_timeline    # builds data/processed/*.csv from data/raw
streamlit run app.py
```

The app auto-builds the processed data on first launch if it's missing.

## Pipeline (`pipeline/`)

| Module | What it does |
| --- | --- |
| `config.py` | File registry + robust CSV loading (per-file delimiter/encoding) |
| `entity_resolution.py` | Collapses inconsistent org spellings into 67 canonical orgs via a deterministic name-/email-domain **stem** key (no fuzzy guessing) |
| `metric_mapping.py` | Keyword rules map drifting survey questions → ~20 canonical metrics; a validation layer rejects essays/currency-in-wrong-field/out-of-range values and normalises units; also holds SDG + IRIS+ + Impact-Ladder rules |
| `qualitative.py` | Extracts free-text quotes (needs / challenges / wins) per org |
| `build_timeline.py` | Joins everything into per-org timelines, the **Impact Health Score**, SDG/IRIS+ tags, and writes `data/processed/*.csv` |

## Dashboard (`app.py`) — 5 screens

1. **Portfolio Overview** — Impact Health Score + status dot per org, trend arrows, search/filter by cohort & region.
2. **Company Deep-Dive** — financial-vs-social timelines (sparse series render as dots, not fake trend lines), Impact Ladder / IMM maturity, SDG & IRIS+ category tags, data-completeness, and a rule-based (traceable) summary + raw quotes.
3. **Key Questions** — five programme questions pre-answered with the number behind each.
4. **Portfolio Intelligence** — top performers, at-risk orgs, common challenges, cross-cohort/region comparison, investor aggregates.
5. **Show Your Work** — org-name resolution, metric mapping, SDG/IRIS+ tagging rules, and the data-cleaning report — so every number is auditable.

## Impact Health Score (0–100)

Weighted: Financial growth 40% · Social impact 30% · Reporting quality 10% ·
IMM maturity 10% · Survey consistency 10%. When a component can't be computed
from an org's data, its weight is redistributed across the components that can —
never faked. 🟢 ≥70 · 🟡 40–69 · 🔴 <40.

## Principles

- Every AI-generated claim, tag, or figure traces to a real data point.
- SDG / IRIS+ tags applied only where an org's actual metrics support them.
- IRIS+ is aligned at the **thematic-category** level only — no invented metric codes.
- Cleaning is transparent: rejected values are reported, never silently coerced.

## Data notice

The dataset under `data/` is pseudonymised accelerator data provided by Yunus
Social Innovation for the hackathon. Names, contacts and phone numbers are
generated stand-ins. Treat findings as illustrative of the method, not as claims
about named real-world organisations.
