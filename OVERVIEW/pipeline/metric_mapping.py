"""
metric_mapping.py — Collapse wildly-varied survey question wordings into a small
set of canonical metrics, in long (tidy) format.

Why this exists (per the README + Janine's brief):
  YSI changes its measurement methods every wave, so the "same" metric is worded
  differently across the 19 files, in two languages, sometimes with two
  date-stamped columns in a single row. We map by KEYWORD RULES rather than exact
  strings so the mapping survives that drift.

Output schema (one row per (survey row x mapped column)):
    source_file, row_idx, raw_org_name, email_domain,
    metric_name, raw_value, value, wave_date, source_column

Entity resolution stays a SEPARATE concern: we carry raw_org_name/email_domain
through so pipeline/build_timeline.py can join each row to a canonical org id
(via entity_resolution.build_entity_map) and then aggregate.

Canonical metrics cover both sides of Janine's ask:
  Social / impact ....... beneficiaries_reached, pct_women_reached, and the
                          5-stage health & hygiene funnel (the headline metric
                          for this client: "how many people reached").
  Financial ............. monthly_revenue, revenue_actuals, funding_total,
                          runway_months, monthly_expenses, valuation
  Operational ........... fte_count, customer_count
"""

import re
import pandas as pd

from pipeline.config import FILES
from pipeline.entity_resolution import extract_org_key


# ---------------------------------------------------------------------------
# Canonical metric rules
# ---------------------------------------------------------------------------
# Each metric maps to a list of RULES. A column matches the metric if ANY rule
# matches. A rule matches if EVERY substring in "all" is present in the
# lower-cased header AND NONE of the substrings in "none" are present.
#
# Order matters: METRIC_PRIORITY is checked top-to-bottom and the FIRST metric
# that matches wins, so put the most specific metrics first (the funnel stages
# before the generic beneficiaries/financial catch-alls).

METRIC_RULES = {
    # --- Health & hygiene funnel (5 stages) — the headline social metric ------
    "health_hygiene_informed": [
        {"all": ["inform", "health & hygiene messaging"]},
    ],
    "health_hygiene_engaged": [
        {"all": ["engage", "two-way interaction"]},
    ],
    "health_hygiene_outcomes": [
        {"all": ["outcomes", "immediate positive outcomes"]},
    ],
    "health_hygiene_impact": [
        {"all": ["impact", "positive changes in their day-to-day"]},
    ],
    "health_hygiene_societal": [
        {"all": ["societal impact", "material positive impact"]},
    ],

    # --- Broader social / impact ---------------------------------------------
    "beneficiaries_reached": [
        # English: "how many beneficiaries does your company reach / is reaching"
        {"all": ["benefic", "reach"],
         "none": ["are women", "percentage", "share of women", "gender", "% "]},
        {"all": ["benefic", "reaching"]},
        # Portuguese: "quantos beneficiarios sua empresa chega ..."
        {"all": ["benefic", "chega"]},
        # AP1 org-performance snapshot
        {"all": ["users/beneficiaries"]},
        # "How many people have you impacted as of May 2025 (cumulative ...)"
        {"all": ["people have you impacted"]},
        # IMM: "How many people has your organisation reached one year ago ..."
        {"all": ["people has your organisation reached"]},
    ],
    "pct_women_reached": [
        {"all": ["percentage", "women"], "none": ["informed"]},
    ],

    # --- Financial ------------------------------------------------------------
    "monthly_revenue": [
        {"all": ["monthly", "revenue"], "none": ["expenses"]},
    ],
    "revenue_actuals": [
        {"all": ["total revenues"]},
    ],
    "funding_total": [
        {"all": ["funding size"]},
        {"all": ["total amount of funding"]},
        {"all": ["financiamento"]},          # Portuguese
        {"all": ["amount raising"]},
    ],
    "runway_months": [
        {"all": ["runway"]},
    ],
    "monthly_expenses": [
        {"all": ["monthly", "expenses"]},
    ],
    "valuation": [
        {"all": ["company valuation"]},
    ],

    # --- Operational ----------------------------------------------------------
    "fte_count": [
        {"all": ["full time employees"]},
        {"all": ["full-time employees"]},
        {"all": ["number of full-time employees"]},
        {"all": ["employees (fte)"]},
        {"all": ["how many employees do you currently have"]},
        {"all": ["funcion", "integral"]},    # Portuguese (funcionarios ... integral)
    ],
    "customer_count": [
        {"all": ["customers", "serve"]},
        {"all": ["clientes", "atende"]},     # Portuguese
    ],
    "jobs_created": [
        {"all": ["jobs"], "none": ["needs"]},   # full-time/contract jobs created
    ],
    "livelihoods_improved": [
        {"all": ["improved livelihoods"]},
    ],
    "wash_access_improved": [
        {"all": ["access to wash"]},
    ],

    # --- Extra financial ------------------------------------------------------
    "ebitda": [
        {"all": ["ebitda"]},
    ],
    "net_profit": [
        {"all": ["net profit"]},
    ],

    # --- Sentiment / self-assessment (0-10 scales) ---------------------------
    "confidence_rating": [
        {"all": ["confident", "managing and growing your business"]},
        {"all": ["confidence", "managing and growing"]},
    ],
    "business_perf_rating": [
        {"all": ["business performance"],
         "none": ["explain", "factors", "effected", "affected", "change in your",
                  "tell us more", "influenced your current"]},
    ],
    "nps_recommend": [
        {"all": ["how likely are you to recommend"]},
    ],
}

# Most-specific first; first match wins.
METRIC_PRIORITY = [
    "health_hygiene_informed",
    "health_hygiene_engaged",
    "health_hygiene_outcomes",
    "health_hygiene_impact",
    "health_hygiene_societal",
    "wash_access_improved",
    "livelihoods_improved",
    "beneficiaries_reached",
    "pct_women_reached",
    "ebitda",
    "net_profit",
    "monthly_revenue",
    "revenue_actuals",
    "funding_total",
    "runway_months",
    "monthly_expenses",
    "valuation",
    "jobs_created",
    "fte_count",
    "customer_count",
    "confidence_rating",
    "business_perf_rating",
    "nps_recommend",
]

# Metrics whose value is a percentage (0-100), not a raw count/amount.
PERCENT_METRICS = {"pct_women_reached"}

# Which side of the story each metric belongs to (financial vs social vs ...).
# Powers the side-by-side "growing revenue but stagnant impact" view.
METRIC_DOMAIN = {
    "monthly_revenue": "financial", "revenue_actuals": "financial",
    "ebitda": "financial", "net_profit": "financial", "funding_total": "financial",
    "runway_months": "financial", "monthly_expenses": "financial", "valuation": "financial",
    "beneficiaries_reached": "social", "pct_women_reached": "social",
    "livelihoods_improved": "social", "wash_access_improved": "social",
    "health_hygiene_informed": "social", "health_hygiene_engaged": "social",
    "health_hygiene_outcomes": "social", "health_hygiene_impact": "social",
    "health_hygiene_societal": "social",
    "fte_count": "operational", "jobs_created": "operational", "customer_count": "operational",
    "confidence_rating": "sentiment", "business_perf_rating": "sentiment",
    "nps_recommend": "sentiment",
}

# SDG attribution — rule-based, tag ONLY what an org's real metrics support.
# Rules (per framework-alignment spec):
#   beneficiaries / livelihoods → SDG 1 (No Poverty) + economic where relevant
#   jobs / employees / income / revenue / funding → SDG 8 (Decent Work & Growth)
#   health & hygiene → SDG 3 (Good Health)
#   improved WASH access → SDG 6 (Clean Water & Sanitation) + SDG 3
#   women / gender reach → SDG 5 (Gender Equality)
#   (environmental → SDG 13 and education/knowledge → SDG 4 are NOT tagged:
#    the cleaned dataset has no metric that supports them — see SDG_RULE_TEXT.)
SDG_MAP = {
    "beneficiaries_reached": [1, 3],
    "health_hygiene_informed": [3], "health_hygiene_engaged": [3],
    "health_hygiene_outcomes": [3], "health_hygiene_impact": [3],
    "health_hygiene_societal": [3],
    "wash_access_improved": [6, 3],
    "pct_women_reached": [5],
    "livelihoods_improved": [1, 8],
    "fte_count": [8], "jobs_created": [8],
    "monthly_revenue": [8], "revenue_actuals": [8], "ebitda": [8],
    "funding_total": [8], "valuation": [8],
}

SDG_LABELS = {
    1: "SDG 1 · No Poverty",
    3: "SDG 3 · Good Health & Well-being",
    5: "SDG 5 · Gender Equality",
    6: "SDG 6 · Clean Water & Sanitation",
    8: "SDG 8 · Decent Work & Economic Growth",
}

# Plain-language justification per SDG, shown in the "Show your work" panel.
SDG_RULE_TEXT = {
    1: "Beneficiaries reached / improved livelihoods (underserved people served).",
    3: "Health & hygiene reach (Inform→Societal funnel) and health beneficiaries.",
    5: "Reported share of women among people reached.",
    6: "Reported improvement in access to water, sanitation & hygiene.",
    8: "Jobs, full-time employees, revenue, funding — enterprise economic growth.",
}

# IRIS+ THEMATIC CATEGORIES (category-level only — no IRIS metric codes, by design:
# a wrong code is worse than none). Enterprise-financial metrics (revenue, funding,
# EBITDA, valuation, runway, expenses) are intentionally NOT given an IRIS+ impact
# category — they measure enterprise performance, not a social/environmental theme.
IRIS_CATEGORY_MAP = {
    "beneficiaries_reached": "Health",
    "health_hygiene_informed": "Health", "health_hygiene_engaged": "Health",
    "health_hygiene_outcomes": "Health", "health_hygiene_impact": "Health",
    "health_hygiene_societal": "Health",
    "wash_access_improved": "Water, Sanitation & Hygiene (WASH)",
    "fte_count": "Employment", "jobs_created": "Employment",
    "pct_women_reached": "Diversity & Inclusion",
    "livelihoods_improved": "Financial Inclusion",
}

# The Impact Ladder / IMM maturity stages, in order (health & hygiene IMM funnel).
IMPACT_LADDER = [
    ("health_hygiene_informed", "Inform"),
    ("health_hygiene_engaged", "Engage"),
    ("health_hygiene_outcomes", "Outcome"),
    ("health_hygiene_impact", "Impact"),
    ("health_hygiene_societal", "Societal Impact"),
]
LADDER_ORDER = ["Inform", "Engage", "Outcome", "Impact", "Societal Impact"]


# ---------------------------------------------------------------------------
# Column classification
# ---------------------------------------------------------------------------
def _rule_matches(header_lower: str, rule: dict) -> bool:
    if any(kw not in header_lower for kw in rule.get("all", [])):
        return False
    if any(kw in header_lower for kw in rule.get("none", [])):
        return False
    return True


def classify_column(header: str) -> str | None:
    """Return the canonical metric name for a column header, or None."""
    if not isinstance(header, str):
        return None
    h = header.lower()
    for metric in METRIC_PRIORITY:
        for rule in METRIC_RULES[metric]:
            if _rule_matches(h, rule):
                return metric
    return None


# ---------------------------------------------------------------------------
# Date extraction from a column header
# ---------------------------------------------------------------------------
# Handles the many "as of October 2024", "(May 2023)", "Sept 2022", "Okt 2022",
# "oct 2023" and Portuguese "outubro de 2023" forms seen across the files.
_MONTHS = {
    # English full
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
    # English / German abbreviations
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "okt": 10, "nov": 11, "dec": 12,
    # Portuguese
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5,
    "junho": 6, "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10,
    "novembro": 11, "dezembro": 12, "abr": 4, "mai": 5,
}

_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_MONTH_YEAR_RE = re.compile(rf"\b({_MONTH_ALT})\b[a-z]*\s*(?:de\s+)?((?:19|20)\d{{2}})", re.I)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")


def extract_date_from_header(header: str) -> str | None:
    """
    Pull a wave date out of a column header.
    Returns 'YYYY-MM' when a month+year is found, else 'YYYY' for a lone year,
    else None (caller falls back to the file's configured date).
    """
    if not isinstance(header, str):
        return None
    m = _MONTH_YEAR_RE.search(header)
    if m:
        month = _MONTHS[m.group(1).lower()]
        return f"{m.group(2)}-{month:02d}"
    y = _YEAR_RE.search(header)
    if y:
        return y.group(1)
    return None


# ---------------------------------------------------------------------------
# Value parsing + cleaning / validation
# ---------------------------------------------------------------------------
# The raw cells are dirty: essays typed into number fields, cash balances typed
# into "runway (months)", "$4,449" typed into "# employees", "4.5M" vs 56000000
# in the same valuation column, EUR/BRL mixed with USD. clean_value() rejects or
# normalises these and returns (value, reason) so the pipeline can report exactly
# what it dropped and why — nothing is silently coerced into a wrong number.
_NA_TOKENS = {"", "na", "n/a", "n.a.", "-", "--", "none", "nil", "tbd", "n/a.",
              "n\\a", "0.0.0", "x", "none yet", "not yet", "no valuation yet."}

# Monetary metrics — currency conversion + magnitude ("15M") apply; a currency
# token in a NON-monetary metric is a red flag that the answer belongs elsewhere.
MONEY_METRICS = {"monthly_revenue", "revenue_actuals", "ebitda", "net_profit",
                 "funding_total", "monthly_expenses", "valuation"}

# Approximate FX to USD (fixed, documented — this is pseudonymised demo data, not
# a finance system). Enough to stop EUR/BRL being compared as if they were USD.
CURRENCY_TO_USD = {"brl": 0.18, "r$": 0.18, "reais": 0.18,
                   "zar": 0.055, "rand": 0.055,
                   "eur": 1.08, "€": 1.08,
                   "gbp": 1.27, "£": 1.27,
                   "usd": 1.0, "$": 1.0, "dollar": 1.0}

# Plausibility bounds per metric. Values outside → rejected as 'out_of_range'
# (kept visible in the cleaning report, never fed into a total).
METRIC_BOUNDS = {
    "pct_women_reached": (0, 100),
    "confidence_rating": (0, 10), "business_perf_rating": (0, 10), "nps_recommend": (0, 10),
    "runway_months": (0, 120),
    "fte_count": (0, 8000), "jobs_created": (0, 500_000), "customer_count": (0, 50_000_000),
    "beneficiaries_reached": (0, 200_000_000),
    "health_hygiene_informed": (0, 200_000_000), "health_hygiene_engaged": (0, 200_000_000),
    "health_hygiene_outcomes": (0, 200_000_000), "health_hygiene_impact": (0, 200_000_000),
    "health_hygiene_societal": (0, 200_000_000),
    "livelihoods_improved": (0, 50_000_000), "wash_access_improved": (0, 50_000_000),
    "monthly_revenue": (0, 100_000_000), "monthly_expenses": (0, 100_000_000),
    "revenue_actuals": (0, 1_000_000_000), "funding_total": (0, 1_000_000_000),
    "ebitda": (-1_000_000_000, 1_000_000_000), "net_profit": (-1_000_000_000, 1_000_000_000),
    "valuation": (10_000, 100_000_000_000),
}

# A number immediately followed by one of these means multiply. The negative
# lookahead stops "6 months" being read as 6 million.
_MAGNITUDE_RE = re.compile(r"(-?\d[\d.,]*)\s*(million|billion|thousand|mn|bn|mm|[mkb])\b(?![a-z])", re.I)
_MAGNITUDE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "mn": 1e6, "mm": 1e6,
              "million": 1e6, "b": 1e9, "bn": 1e9, "billion": 1e9}
_CURRENCY_TOKEN_RE = re.compile(r"[$€£]|r\$|\b(?:usd|eur|brl|zar|gbp|dollars?)\b", re.I)
_MAX_WORDS = 6   # more than this and the cell is prose, not a data point


def _norm_separators(num: str) -> str:
    """Interpret '.'/',' as thousands vs decimal (handles US and European)."""
    if "," in num and "." in num:
        if num.rfind(",") > num.rfind("."):
            return num.replace(".", "").replace(",", ".")   # 1.234,56
        return num.replace(",", "")                         # 1,234.56
    if "," in num:
        if re.fullmatch(r"-?\d{1,3}(,\d{3})+", num):
            return num.replace(",", "")
        return num.replace(",", ".")
    if "." in num and re.fullmatch(r"-?\d{1,3}(\.\d{3})+", num):
        return num.replace(".", "")                         # 120.000 -> 120000
    return num


def _detect_fx(*texts) -> float:
    """First currency mentioned across cell then column; default USD (1.0)."""
    for t in texts:
        if not isinstance(t, str):
            continue
        low = t.lower()
        for token, rate in CURRENCY_TO_USD.items():
            if token in low:
                return rate
    return 1.0


def _to_number(s: str) -> float | None:
    """Parse the leading numeric token, applying a magnitude suffix if present."""
    mag = _MAGNITUDE_RE.search(s)
    if mag:
        base = _norm_separators(mag.group(1))
        mult = _MAGNITUDE[mag.group(2).lower()]
    else:
        m = re.search(r"-?\d[\d.,]*", s)
        if not m:
            return None
        base = _norm_separators(m.group(0))
        mult = 1.0
    try:
        return float(base) * mult
    except ValueError:
        return None


def clean_value(raw, metric: str, source_column: str = "") -> tuple[float | None, str]:
    """
    Validate + normalise one raw cell for a given metric.
    Returns (value, reason): reason is 'ok' when value is usable, otherwise
    'blank' / 'free_text' / 'currency_in_nonmeasure' / 'unparseable' /
    'out_of_range' and value is None.
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None, "blank"

    if isinstance(raw, (int, float)):
        val = float(raw)
    else:
        if not isinstance(raw, str):
            return None, "blank"
        s = raw.strip()
        if s == "" or s.lower() in _NA_TOKENS:
            return None, "blank"
        # A currency amount in a headcount/percent/rating field = wrong answer.
        if metric not in MONEY_METRICS and _CURRENCY_TOKEN_RE.search(s):
            return None, "currency_in_nonmeasure"
        # Prose (an essay typed into a number field).
        if len(s.split()) > _MAX_WORDS:
            return None, "free_text"
        val = _to_number(s)
        if val is None:
            return None, "unparseable"
        if metric in MONEY_METRICS:
            val *= _detect_fx(s, source_column)

    # Percentages: a bare 0<x<=1 means a fraction.
    if metric in PERCENT_METRICS and 0 < val <= 1:
        val *= 100

    lo, hi = METRIC_BOUNDS.get(metric, (float("-inf"), float("inf")))
    if val < lo or val > hi:
        return None, "out_of_range"
    return val, "ok"


def parse_value(raw, is_percent: bool = False) -> float | None:
    """Back-compat shim: numeric normalisation without metric-specific bounds."""
    val, _ = clean_value(raw, "pct_women_reached" if is_percent else "__raw__")
    return val


# ---------------------------------------------------------------------------
# File -> long table
# ---------------------------------------------------------------------------
LONG_COLUMNS = [
    "source_file", "row_idx", "raw_org_name", "email_domain",
    "metric_name", "raw_value", "value", "clean_flag", "wave_date", "source_column",
]


def map_file_to_long(df: pd.DataFrame, filename: str) -> pd.DataFrame:
    """
    Melt one raw dataframe into canonical long-format metric rows.

    Iterates positionally so duplicate column labels (which pandas keeps) are
    handled correctly — several files repeat the same funnel header twice.
    """
    df = extract_org_key(df)
    file_date = FILES.get(filename, {}).get("date")
    org_names = df["raw_org_name"].tolist()
    domains = df["email_domain"].tolist()

    records = []
    for col_pos, header in enumerate(df.columns):
        metric = classify_column(header)
        if not metric:
            continue
        wave_date = extract_date_from_header(header) or file_date
        series = df.iloc[:, col_pos]
        for row_pos, raw in enumerate(series.tolist()):
            value, reason = clean_value(raw, metric, header)
            if reason == "blank":
                continue  # truly empty — not a data-quality event, just skip
            # Keep rejected non-blank cells (value=None) so we can report them.
            records.append({
                "source_file": filename,
                "row_idx": row_pos,
                "raw_org_name": org_names[row_pos],
                "email_domain": domains[row_pos],
                "metric_name": metric,
                "raw_value": raw,
                "value": value,
                "clean_flag": reason,
                "wave_date": wave_date,
                "source_column": header,
            })

    return pd.DataFrame(records, columns=LONG_COLUMNS)


def map_all_files() -> pd.DataFrame:
    """Load every registered file and return one combined long-format table."""
    from pipeline.config import load_raw
    frames = []
    for filename in FILES:
        try:
            df = load_raw(filename)
        except Exception as exc:  # noqa: BLE001 — keep going, report at the end
            print(f"  ! skipped {filename}: {exc}")
            continue
        frames.append(map_file_to_long(df, filename))
    if not frames:
        return pd.DataFrame(columns=LONG_COLUMNS)
    return pd.concat(frames, ignore_index=True)


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")

    long_df = map_all_files()
    accepted = long_df[long_df["value"].notna()]
    rejected = long_df[long_df["value"].isna()]
    print(f"\nCandidate cells: {len(long_df)}  |  accepted: {len(accepted)}  |  rejected: {len(rejected)}\n")
    print("Accepted rows per canonical metric:")
    print(accepted["metric_name"].value_counts().to_string())
    print("\nRejections by reason:")
    print(rejected["clean_flag"].value_counts().to_string())
    print("\nExamples of what was rejected (raw -> reason):")
    for _, r in rejected.head(12).iterrows():
        print(f"  [{r['clean_flag']:>20}] {r['metric_name']:<22} {str(r['raw_value'])[:60]!r}")
