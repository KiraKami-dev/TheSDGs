# Aurelia Propel — Impact Measurement & Management (IMM) Dataset

Provided by **Yunus Social Innovation (YSI)** for the **YSI Track — AI-Powered
Impact Intelligence** challenge at the Claude Impact Lab Hackathon, ZOLLHOF
Nuremberg, 23 July 2026.

## What this is

19 CSV exports from the Aurelia accelerator programmes (AP1–AP4), spanning
Nov 2022 → May 2026. They are exactly the kind of scattered, inconsistent,
real-world impact data the YSI track is about: baseline surveys, midline and
endline surveys, organisational performance snapshots, and IMM assessments —
collected at different times, in different languages, with different question
sets and different column conventions.

Nobody has cleaned this up for you. That's the challenge.

## The files

| File | What it covers |
| --- | --- |
| `AP1_Baseline_Nov_22_SA.csv` | AP1 baseline, South Africa, Nov 2022 |
| `AP1_April_2023_SA__Knowledge___Behaviour.csv` | AP1 knowledge & behaviour, Apr 2023 |
| `AP1_April_23_Org_Performance_SA.csv` | AP1 org performance (revenue, EBITDA, funding), Apr 2023 |
| `AP1_October_2023_SA.csv` | AP1 follow-up, South Africa, Oct 2023 |
| `AP1_October_2023_BRA.csv` | AP1 follow-up, Brazil, Oct 2023 (Portuguese) |
| `AP1_Endline_April_24_SA.csv` | AP1 endline, Apr 2024 |
| `AP1_June_2024_BRA.csv` | AP1 follow-up, Brazil, Jun 2024 (Portuguese) |
| `AP1_October_2024_SA_BR.csv` | AP1 combined SA + Brazil, Oct 2024 |
| `AP1_April_2025_Short_Beneficiary_Survey.csv` | AP1 short beneficiary survey, Apr 2025 |
| `AP1and2_April_25.csv` | AP1 + AP2 combined, Apr 2025 |
| `AP2_Baseline_October_2023.csv` | AP2 baseline, Oct 2023 |
| `AP2_March_2024.csv` | AP2 programme feedback, Mar 2024 |
| `AP2_October_2024.csv` | AP2 follow-up, Oct 2024 |
| `AP3_Baseline_October_2024.csv` | AP3 baseline / applications, Oct 2024 |
| `AP3_April_2025_Midline.csv` | AP3 midline, Apr 2025 |
| `AP4_2025_2026_Baseline_Survey.csv` | AP4 baseline, 2025–2026 cohort |
| `AP4_May_2026_Midline.csv` | AP4 midline, May 2026 |
| `AP_April_2025_extra_data.csv` | Aurelia prize recipients, Apr 2025 |
| `IMM_Assessment_October_2025.csv` | Cross-cohort IMM assessment, Oct 2025 |

## Gotchas worth knowing before you start

- **Mixed delimiters.** Most files are comma-separated. `AP3_Baseline_October_2024.csv`,
  `AP_April_2025_extra_data.csv` and `IMM_Assessment_October_2025.csv` are
  **semicolon**-separated. Set the delimiter explicitly when parsing.
- **Multi-line quoted fields.** Free-text answers contain newlines. Counting
  physical lines will not give you a row count — use a real CSV parser.
- **Two languages.** The Brazil files (`*_BRA.csv`) have Portuguese headers and
  answers; the rest are in English. Some cells mix both.
- **No shared join key.** Organisations appear across files with inconsistent
  spelling and no ID column. Entity resolution is part of the problem.
- **Inconsistent number formats.** `120.000`, `150000`, `40351` and `$65,000` all
  appear in the same conceptual column. Percentages appear as `50%`, `50`, and
  `0.5`.
- **Sparse and blank rows.** Several files have empty rows and mostly-empty
  columns where a question was added mid-programme.
- **Question text changes between waves.** The "same" metric is often worded
  differently in the baseline vs. the midline. Mapping them is on you.

## About the identifiers in this data

This dataset is **pseudonymised**. The organisation names, contact names, email
addresses and phone numbers in it are generated stand-ins, not real people or
real organisations. You can confirm this yourself: email domains are derived
from the pseudonymised organisation names (`adaeze.igwe@brightpathsolutions.org`
for "BrightPath Solutions"), and every phone number is a sequential placeholder
of the form `+000-000-0000N`.

That means the contact columns are safe to work with — and they're genuinely
useful for the challenge, since joining records across survey waves is one of
the hardest parts of this dataset and those columns are one of the few
consistent keys you have.

Still, treat it as you would the real thing:

- Use it for the hackathon. It isn't yours to redistribute or publish.
- Don't upload it to third-party services beyond the AI tooling you are
  building with on the day.
- The underlying programme data reflects real organisations' experiences, even
  with the labels swapped — so don't present findings as claims about named
  real-world enterprises.

Questions about the data on the day: ask an organiser.
