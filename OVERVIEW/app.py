"""
app.py — Aurelia Propel Impact Intelligence dashboard (Streamlit).

Five screens for the programme manager + investor story:
  1. Portfolio Overview  — searchable grid of all orgs, snapshot + trend arrows + health flag
  2. Company Deep-Dive   — timelines (financial vs social), impact ladder, SDG tags, raw quotes
  3. Key Questions       — the five programme questions, pre-answered with ranked lists
  4. Cross-Portfolio     — aggregate investor numbers, who's struggling, cohort/region filters
  5. Show Your Work      — messy names -> one org, messy questions -> one metric

Data comes from pipeline/build_timeline.py (data/processed/*.csv).
Run:  streamlit run app.py
"""

from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

from pipeline.metric_mapping import (
    METRIC_DOMAIN, SDG_LABELS, SDG_RULE_TEXT, IRIS_CATEGORY_MAP, IMPACT_LADDER,
)
from pipeline.build_timeline import HEALTH_WEIGHTS

PROCESSED_DIR = Path("data/processed")
REFERENCE_DATE = pd.Timestamp("2026-07-23")   # "today" for reporting-recency checks

# --- Validated palette (dataviz reference instance) --------------------------
INK, MUTED, GRID = "#0b0b0b", "#898781", "#e1e0d9"
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
FUNNEL_BLUES = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#184f95"]
# Status palette (fixed) — hue always paired with an icon
FLAG_STYLE = {
    "Improving": ("#0ca30c", "🟢"),
    "Flat": ("#fab219", "🟡"),
    "Declining": ("#d03b3b", "🔴"),
    "Insufficient data": ("#898781", "⚪"),
}
ARROW = {"up": ("↑", "#0ca30c"), "down": ("↓", "#d03b3b"), "flat": ("→", "#898781")}
DOMAIN_COLOR = {"financial": CAT[1], "social": CAT[2], "operational": CAT[0], "sentiment": CAT[6]}

FLAG_HELP = (
    "Health flag = combined financial + social trend across an org's survey waves.\n\n"
    "🟢 Improving — financial and social both trending up\n\n"
    "🔴 Declining — both trending down\n\n"
    "🟡 Flat — mixed, or within ±5% (no clear change)\n\n"
    "⚪ Insufficient data — fewer than 2 waves to compare\n\n"
    "Financial signal = first available of monthly revenue → total revenue → funding → EBITDA. "
    "Social signal = beneficiaries reached → people informed (H&H)."
)
MONEY_FMT_METRICS = {"monthly_revenue", "revenue_actuals", "ebitda", "net_profit",
                     "funding_total", "monthly_expenses", "valuation"}

METRIC_LABELS = {
    "beneficiaries_reached": "Beneficiaries reached", "pct_women_reached": "% women reached",
    "health_hygiene_informed": "H&H — Informed", "health_hygiene_engaged": "H&H — Engaged",
    "health_hygiene_outcomes": "H&H — Outcomes", "health_hygiene_impact": "H&H — Impact",
    "health_hygiene_societal": "H&H — Societal impact",
    "livelihoods_improved": "Improved livelihoods", "wash_access_improved": "Improved WASH access",
    "monthly_revenue": "Monthly revenue (USD)", "revenue_actuals": "Total revenues (USD)",
    "ebitda": "EBITDA (USD)", "net_profit": "Net profit (USD)",
    "funding_total": "Funding raised (USD)", "runway_months": "Runway (months)",
    "monthly_expenses": "Monthly expenses (USD)", "valuation": "Valuation (USD)",
    "fte_count": "Full-time employees", "jobs_created": "Jobs created", "customer_count": "Customers served",
    "confidence_rating": "Confidence (self-rated)", "business_perf_rating": "Business performance (rated)",
    "nps_recommend": "Recommend score",
}
FINANCIAL = [m for m, d in METRIC_DOMAIN.items() if d == "financial"]
SOCIAL = [m for m, d in METRIC_DOMAIN.items() if d == "social"]
OPERATIONAL = [m for m, d in METRIC_DOMAIN.items() if d == "operational"]
SENTIMENT = [m for m, d in METRIC_DOMAIN.items() if d == "sentiment"]


# --- Data --------------------------------------------------------------------
def wave_to_ts(w):
    if not isinstance(w, str):
        return pd.NaT
    parts = w.split("-")
    try:
        year = int(parts[0])
    except ValueError:
        return pd.NaT
    month = 1
    if len(parts) > 1 and len(parts[1]) <= 2:
        try:
            month = int(parts[1]) or 1
        except ValueError:
            month = 1
    return pd.Timestamp(year=year, month=month, day=1)


def ensure_data():
    needed = ["timeline.csv", "org_summary.csv", "file_coverage.csv",
              "entity_crosswalk.csv", "metric_crosswalk.csv", "quotes.csv",
              "cleaning_report.csv", "rejected_samples.csv"]
    if all((PROCESSED_DIR / f).exists() for f in needed):
        return
    with st.spinner("Building the pipeline for the first time…"):
        from pipeline.build_timeline import run
        run(write=True)


@st.cache_data
def load_data():
    timeline = pd.read_csv(PROCESSED_DIR / "timeline.csv")
    summary = pd.read_csv(PROCESSED_DIR / "org_summary.csv")
    coverage = pd.read_csv(PROCESSED_DIR / "file_coverage.csv")
    entity_x = pd.read_csv(PROCESSED_DIR / "entity_crosswalk.csv")
    metric_x = pd.read_csv(PROCESSED_DIR / "metric_crosswalk.csv")
    quotes = pd.read_csv(PROCESSED_DIR / "quotes.csv")
    cleaning = pd.read_csv(PROCESSED_DIR / "cleaning_report.csv")
    rejects = pd.read_csv(PROCESSED_DIR / "rejected_samples.csv")
    timeline["wave_ts"] = timeline["wave_date"].map(wave_to_ts)
    if "is_outlier" not in timeline:
        timeline["is_outlier"] = False
    summary["last_wave_ts"] = summary["last_wave"].map(wave_to_ts)
    return timeline, summary, coverage, entity_x, metric_x, quotes, cleaning, rejects


def latest_per_org(timeline, metric, exclude_outliers=False):
    """Latest value per org for a metric, optionally dropping flagged outliers."""
    sub = timeline[timeline["metric_name"] == metric].dropna(subset=["wave_ts"])
    if exclude_outliers:
        sub = sub[~sub["is_outlier"]]
    if sub.empty:
        return pd.Series(dtype=float)
    return sub.sort_values("wave_ts").groupby("org_name").tail(1).set_index("org_name")["value"]


# --- Small helpers -----------------------------------------------------------
def fmt(val, money=False):
    if val is None or pd.isna(val):
        return "—"
    return f"${val:,.0f}" if money else f"{val:,.0f}"


def arrow_txt(d):
    return ARROW.get(d, ("", ""))[0] if isinstance(d, str) else ""


def tokens(series):
    out = set()
    for v in series.dropna():
        for tok in str(v).split(","):
            tok = tok.strip()
            if tok and tok.lower() != "nan":
                out.add(tok)
    return sorted(out)


STATUS_DOT = {"green": "🟢", "yellow": "🟡", "red": "🔴", "grey": "⚪"}
_SCORE_COMPONENT_LABEL = {
    "financial": "Financial growth", "social": "Social impact",
    "reporting": "Reporting quality", "imm": "IMM maturity", "consistency": "Survey consistency",
}
SCORE_HELP = (
    "Impact Health Score (0–100), weighted:\n\n"
    + "\n".join(f"• {_SCORE_COMPONENT_LABEL[k]} {int(w*100)}%" for k, w in HEALTH_WEIGHTS.items())
    + "\n\n🟢 ≥70  🟡 40–69  🔴 <40. When a component can't be computed from an "
    "org's data (e.g. only one survey → no growth), its weight is redistributed "
    "across the components that can — never faked. Reporting quality & survey "
    "consistency are proxies (metrics reported / waves responded to)."
)


def score_breakdown(row):
    """Per-org tooltip: each component's subscore + weight, or 'n/a (reweighted)'."""
    lines = ["Impact Health Score components:"]
    for k, w in HEALTH_WEIGHTS.items():
        v = row.get(f"score_{k}")
        shown = "n/a (reweighted)" if v is None or pd.isna(v) else f"{int(v)}/100"
        lines.append(f"• {_SCORE_COMPONENT_LABEL[k]} ({int(w*100)}%): {shown}")
    return "\n".join(lines)


def iris_chips(iris_str):
    if not isinstance(iris_str, str) or not iris_str.strip():
        return "—"
    cats = [c.strip() for c in iris_str.split("|") if c.strip()]
    return " · ".join(f"{c} *(IRIS+ category)*" for c in cats) if cats else "—"


def sdg_chips(sdg_str):
    if not isinstance(sdg_str, str) or not sdg_str.strip():
        return "—"
    parts = []
    for s in sdg_str.split(","):
        try:
            parts.append(SDG_LABELS.get(int(s), s))
        except ValueError:
            continue
    return " · ".join(parts) if parts else "—"


def timeline_chart(df, metric, color):
    """
    One metric over an org's survey waves. Each data point = one survey wave (NOT
    a calendar month), so with < 3 points we render DISCRETE DOTS rather than a
    connected line — a 2-point line implies a trend the data can't support. The
    chart subtitle carries the data-completeness label (point count).
    """
    sub = df[df["metric_name"] == metric].dropna(subset=["wave_ts"]).sort_values("wave_ts")
    if sub.empty:
        return None
    n = len(sub)
    label = METRIC_LABELS.get(metric, metric)
    sparse = n < 3
    subtitle = (f"{n} data point{'s' if n != 1 else ''} across survey waves — too few to trend"
                if sparse else f"{n} data points across survey waves")
    title = alt.TitleParams(text=label, subtitle=subtitle, fontSize=13,
                            subtitleColor=("#d03b3b" if sparse else MUTED), subtitleFontSize=10)
    base = alt.Chart(sub).encode(
        x=alt.X("wave_ts:T", title=None, axis=alt.Axis(grid=False, labelColor=MUTED, format="%b %Y")),
        y=alt.Y("value:Q", title=None, axis=alt.Axis(grid=True, gridColor=GRID, labelColor=MUTED, format="~s")),
        tooltip=[alt.Tooltip("wave_date:N", title="Wave"),
                 alt.Tooltip("value:Q", title=label, format=",")],
    )
    if sparse:
        mark = base.mark_circle(color=color, size=110)          # discrete dots, NO line
    else:
        mark = base.mark_line(color=color, strokeWidth=2,
                              point=alt.OverlayMarkDef(color=color, size=55))
    return mark.properties(height=180, title=title)


def small_multiples(container, org_tl, metrics, color, per_row=2):
    charts = [c for m in metrics if (c := timeline_chart(org_tl, m, color)) is not None]
    if not charts:
        container.caption("No data reported.")
        return
    for i in range(0, len(charts), per_row):
        cols = container.columns(per_row)
        for col, ch in zip(cols, charts[i:i + per_row]):
            col.altair_chart(ch, use_container_width=True)


def _trend_phrase(row, metric):
    """One clause describing a metric's latest value + movement — numbers only."""
    latest = row.get(f"{metric}_latest")
    if latest is None or pd.isna(latest):
        return None
    label = METRIC_LABELS.get(metric, metric)
    val = fmt(latest, money=metric in MONEY_FMT_METRICS)
    waves, delta = row.get(f"{metric}_waves"), row.get(f"{metric}_delta")
    if waves and not pd.isna(waves) and waves >= 2 and delta is not None and not pd.isna(delta):
        earliest = latest - delta
        if earliest and earliest != 0:
            pct = delta / abs(earliest) * 100
            d = "up" if delta > 0 else ("down" if delta < 0 else "flat")
            return f"{label} {d} {abs(pct):.0f}% to {val} over {int(waves)} waves"
        return f"{label} at {val} over {int(waves)} waves"
    return f"{label} at {val} (single reading)"


def org_narrative(row, org_quotes):
    """
    Deterministic, plain-language summary built ONLY from this org's numbers +
    quotes — no model, no invented figures. Every clause traces to the data.
    """
    n = int(row.get("n_surveys") or 0)
    parts = [f"**{row['org_name']}** is flagged **{row.get('health_flag')}**, based on "
             f"{n} survey wave{'s' if n != 1 else ''} (latest {row.get('last_wave') or '—'})."]

    fin = [p for m in ["monthly_revenue", "funding_total", "runway_months"] if (p := _trend_phrase(row, m))]
    soc = [p for m in ["beneficiaries_reached", "health_hygiene_informed"] if (p := _trend_phrase(row, m))]
    if fin:
        parts.append("**Financial —** " + "; ".join(fin) + ".")
    if soc:
        parts.append("**Social —** " + "; ".join(soc) + f". Impact ladder: {row.get('ladder_stage')}.")

    fdir = row.get("monthly_revenue_arrow")
    sdir = row.get("beneficiaries_reached_arrow")
    if pd.isna(sdir) if isinstance(sdir, float) else sdir is None:
        sdir = row.get("health_hygiene_informed_arrow")
    if fdir == "up" and sdir in ("flat", "down"):
        parts.append(f"⚠️ **Growth without impact:** revenue is rising while reach is {sdir} — the case "
                     "Janine flagged. Check whether commercial growth is translating into beneficiaries.")
    elif sdir == "up" and fdir == "down":
        parts.append("📈 **Impact up, finances tightening:** reach is growing but revenue is declining — "
                     "a candidate for financial-sustainability support.")

    if n <= 1:
        parts.append("_Only one survey on file — treat as a baseline; trends can't be computed yet._")

    if org_quotes is not None and not org_quotes.empty:
        needs = org_quotes[org_quotes["theme"] == "Needs"]
        qrow = needs.iloc[0] if not needs.empty else org_quotes.iloc[0]
        parts.append(f"🗣️ *In their words ({qrow['theme']}):* “{str(qrow['answer'])[:220]}”")
    return "\n\n".join(parts)


# --- App ---------------------------------------------------------------------
st.set_page_config(page_title="Aurelia Impact Intelligence", page_icon="💧", layout="wide")
ensure_data()
timeline, summary, coverage, entity_x, metric_x, quotes, cleaning, rejects = load_data()

st.title("💧 Aurelia Propel — Impact Intelligence")
st.caption("Financial + social performance across the portfolio of social enterprises · "
           "resolved & cleaned from 19 inconsistent survey exports (Nov 2022 → May 2026).")

t_overview, t_org, t_questions, t_cross, t_work = st.tabs([
    "📊 Portfolio Overview", "🏢 Company Deep-Dive", "❓ Key Questions",
    "🌍 Portfolio Intelligence", "🔍 Show Your Work",
])

# ======================================================= 1. PORTFOLIO OVERVIEW
with t_overview:
    total_benef = summary["beneficiaries_reached_latest"].sum(skipna=True) if "beneficiaries_reached_latest" in summary else 0
    total_rev = summary["monthly_revenue_latest"].sum(skipna=True) if "monthly_revenue_latest" in summary else 0
    pct_improving = (summary["health_flag"] == "Improving").mean() * 100

    med_score = summary["health_score"].median()
    a, b, c, d, e = st.columns(5)
    a.metric("Organisations", f"{summary['canonical_org_id'].nunique()}")
    b.metric("Total beneficiaries", fmt(total_benef))
    c.metric("Total monthly revenue", fmt(total_rev, money=True))
    d.metric("Median health score", f"{med_score:.0f}", help=SCORE_HELP)
    e.metric("🟢 Healthy / 🔴 at-risk",
             f"{(summary['health_status']=='green').sum()} / {(summary['health_status']=='red').sum()}",
             help=SCORE_HELP)
    with st.expander("ℹ️ How the Impact Health Score & trend arrows are computed"):
        st.markdown(SCORE_HELP)
        st.markdown("---")
        st.markdown(FLAG_HELP)
        st.caption("Trend arrows (↑ ↓ →) compare the latest wave to the previous one. "
                   "All figures are cleaned + validated; extreme outliers are flagged (⚠️) and excluded from portfolio totals by default.")

    st.divider()
    f1, f2, f3, f4 = st.columns([2, 1, 1, 1])
    search = f1.text_input("🔎 Search organisation", "")
    flag_sel = f2.multiselect("Status", list(FLAG_STYLE), default=list(FLAG_STYLE))
    cohort_sel = f3.multiselect("Cohort", tokens(summary["cohorts"]))
    region_sel = f4.multiselect("Region", tokens(summary["regions"]))

    view = summary.copy()
    if search:
        view = view[view["org_name"].str.contains(search, case=False, na=False)]
    view = view[view["health_flag"].isin(flag_sel)]
    if cohort_sel:
        view = view[view["cohorts"].apply(lambda s: any(t in str(s).split(",") for t in cohort_sel))]
    if region_sel:
        view = view[view["regions"].apply(lambda s: any(t in str(s).split(",") for t in region_sel))]

    def col(name):
        return view[name] if name in view else pd.Series([None] * len(view), index=view.index)

    grid = pd.DataFrame({
        "Organisation": view["org_name"],
        "●": view["health_status"].map(lambda s: STATUS_DOT.get(s, "⚪")),
        "Score": col("health_score"),
        "Trend": view["health_flag"].map(lambda f: f"{FLAG_STYLE.get(f, ('', '⚪'))[1]} {f}"),
        "Beneficiaries": col("beneficiaries_reached_latest"),
        "▲▼ ben": col("beneficiaries_reached_arrow").map(arrow_txt),
        "Monthly rev": col("monthly_revenue_latest"),
        "▲▼ rev": col("monthly_revenue_arrow").map(arrow_txt),
        "Funding": col("funding_total_latest"),
        "FTEs": col("fte_count_latest"),
        "Surveys": col("n_surveys"),
        "Ladder": view["ladder_stage"],
        "⚠": col("has_outlier").map(lambda x: "⚠️" if x in (True, "True") else ""),
        "Cohort": view["cohorts"],
    })
    st.caption(f"{len(grid)} organisations · Score = Impact Health Score (hover the column header for the formula) · "
               "arrows compare latest vs previous wave · ⚠️ = extreme outlier flagged (kept, not dropped)")
    st.dataframe(
        grid.sort_values("Score", ascending=False, na_position="last"),
        use_container_width=True, hide_index=True, height=520,
        column_config={
            "Score": st.column_config.NumberColumn("Score", help=SCORE_HELP, format="%d"),
            "Trend": st.column_config.TextColumn("Trend", help=FLAG_HELP),
            "Beneficiaries": st.column_config.NumberColumn(format="%.0f"),
            "Monthly rev": st.column_config.NumberColumn(format="$%.0f"),
            "Funding": st.column_config.NumberColumn(format="$%.0f"),
            "FTEs": st.column_config.NumberColumn(format="%.0f"),
            "Surveys": st.column_config.NumberColumn(format="%d"),
        },
    )

# ========================================================= 2. COMPANY DEEP-DIVE
with t_org:
    org = st.selectbox("Select an organisation", sorted(summary["org_name"].dropna().unique()))
    row = summary[summary["org_name"] == org].iloc[0]
    org_tl = timeline[timeline["org_name"] == org]

    color, icon = FLAG_STYLE.get(row["health_flag"], ("#898781", "⚪"))
    st.markdown(f"### {org} &nbsp;&nbsp; <span style='color:{color};font-size:0.7em'>{icon} {row['health_flag']}</span>",
                unsafe_allow_html=True)
    outlier_note = "  ·  ⚠️ has an extreme flagged value" if row.get("has_outlier") in (True, "True") else ""
    st.caption(f"Cohort {row.get('cohorts') or '—'} · Region {row.get('regions') or '—'} · "
               f"{int(row.get('n_surveys') or 0)} surveys · {int(row.get('metrics_tracked') or 0)} metrics · "
               f"last reported {row.get('last_wave') or '—'}{outlier_note}")

    # Impact Health Score + framework tags
    sc1, sc2 = st.columns([1, 3])
    hs = row.get("health_score")
    dot = STATUS_DOT.get(row.get("health_status"), "⚪")
    sc1.metric("Impact Health Score", f"{dot} {int(hs)}" if pd.notna(hs) else "—",
               help=score_breakdown(row))
    sc2.markdown(f"**SDG tags:** {sdg_chips(row.get('sdgs'))}")
    sc2.markdown(f"**IRIS+ aligned categories:** {iris_chips(row.get('iris_categories'))}")

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Beneficiaries", fmt(row.get("beneficiaries_reached_latest")),
              arrow_txt(row.get("beneficiaries_reached_arrow")) or None)
    k2.metric("H&H informed", fmt(row.get("health_hygiene_informed_latest")))
    k3.metric("Monthly revenue", fmt(row.get("monthly_revenue_latest"), money=True),
              arrow_txt(row.get("monthly_revenue_arrow")) or None)
    k4.metric("Funding raised", fmt(row.get("funding_total_latest"), money=True))

    # Data completeness — must be visible (some orgs have 1 survey, some 7)
    n_surv = int(row.get("n_surveys") or 0)
    st.progress(min(n_surv / 7, 1.0), text=f"🧭 Data completeness — appears in {n_surv} of up to 7 survey waves")

    # Auto-generated summary (rule-based, cited to the numbers on this page)
    oq = quotes[quotes["canonical_org_id"] == row["canonical_org_id"]]
    st.markdown("#### 📝 Summary")
    st.info(org_narrative(row, oq))
    st.caption("Generated from this org's figures + survey quotes with a rule-based template — "
               "no AI guesswork; every number above is on this page.")

    # Impact ladder / IMM maturity
    st.markdown("#### Impact ladder (IMM maturity)")
    if row.get("ladder_stage") == "No maturity data":
        st.info("**No maturity data** — this organisation doesn't report the health & hygiene "
                "IMM funnel (Inform → Societal Impact), so no ladder stage can be shown.")
    else:
        reached = set()
        for metric, label in IMPACT_LADDER:
            sub = org_tl[org_tl["metric_name"] == metric].dropna(subset=["wave_ts"]).sort_values("wave_ts")
            if not sub.empty and sub.iloc[-1]["value"] > 0:
                reached.add(label)
        ladder_cols = st.columns(len(IMPACT_LADDER))
        for lc, (_, label) in zip(ladder_cols, IMPACT_LADDER):
            on = label in reached
            bg, fg = (CAT[0], "#ffffff") if on else ("#efeee9", MUTED)
            lc.markdown(
                f"<div style='background:{bg};color:{fg};padding:8px 4px;border-radius:6px;"
                f"text-align:center;font-size:0.8em;font-weight:600'>{label}</div>",
                unsafe_allow_html=True)
        st.caption(f"Current stage: **{row.get('ladder_stage')}**")

    st.divider()
    st.markdown("#### Financial vs. social impact")
    st.caption("Side by side, so 'growing revenue but stagnant impact' cases are obvious. "
               "Each point is one **survey wave** (baseline/midline/endline), not a calendar month — "
               "series with fewer than 3 waves show as dots, not a trend line. "
               "'Monthly revenue' is the *average monthly revenue* an org reported at each wave "
               "(a per-month figure sampled per survey), not month-by-month data.")
    left, right = st.columns(2)
    left.markdown("**💰 Financial & operational**")
    small_multiples(left, org_tl, FINANCIAL + OPERATIONAL, DOMAIN_COLOR["financial"], per_row=2)
    right.markdown("**🌱 Social & impact**")
    small_multiples(right, org_tl, SOCIAL, DOMAIN_COLOR["social"], per_row=2)

    sent = [c for m in SENTIMENT if (c := timeline_chart(org_tl, m, DOMAIN_COLOR["sentiment"])) is not None]
    if sent:
        st.markdown("#### Confidence & sentiment")
        cols = st.columns(len(sent))
        for cc, ch in zip(cols, sent):
            cc.altair_chart(ch, use_container_width=True)

    # Quotes
    st.divider()
    st.markdown("#### In their own words")
    oq = quotes[quotes["canonical_org_id"] == row["canonical_org_id"]]
    if oq.empty:
        st.caption("No free-text responses captured for this organisation.")
    else:
        for theme in ["Needs", "Challenges", "Wins / Proud of", "Impact story",
                      "Programme benefit", "Partnerships"]:
            tq = oq[oq["theme"] == theme]
            if tq.empty:
                continue
            with st.expander(f"{theme} ({len(tq)})"):
                for _, q in tq.iterrows():
                    st.markdown(f"> {q['answer']}")
                    st.caption(f"— {q['source_file']} · {q['wave_date']}")

# ============================================================ 3. KEY QUESTIONS
with t_questions:
    st.caption("The five questions a programme manager asks — pre-answered, with the number that backs each.")
    q = st.radio("Pick a question", [
        "Which orgs improved most?",
        "Which orgs are flat or declining?",
        "Which orgs haven't reported in a year?",
        "Which orgs never went past Inform / Engage?",
        "Gender equity spread across beneficiaries",
    ], label_visibility="collapsed")

    if q == "Which orgs improved most?":
        metric = st.selectbox("Ranked by growth in",
                              ["beneficiaries_reached", "monthly_revenue", "health_hygiene_informed", "funding_total"],
                              format_func=lambda m: METRIC_LABELS.get(m, m))
        dcol = f"{metric}_delta"
        if dcol in summary:
            r = summary.dropna(subset=[dcol]).nlargest(15, dcol)[["org_name", dcol, "health_flag"]]
            r = r.rename(columns={dcol: "growth", "org_name": "Organisation", "health_flag": "Status"})
            st.dataframe(r, hide_index=True, use_container_width=True,
                         column_config={"growth": st.column_config.NumberColumn(f"Δ {METRIC_LABELS.get(metric, metric)}", format="%.0f")})
        else:
            st.info("No delta data for that metric.")

    elif q == "Which orgs are flat or declining?":
        r = summary[summary["health_flag"].isin(["Flat", "Declining"])]
        st.metric("Flat or declining", f"{len(r)} of {len(summary)}")
        show = r[["org_name", "health_flag", "monthly_revenue_latest", "beneficiaries_reached_latest", "last_wave"]]
        st.dataframe(show.rename(columns={"org_name": "Organisation", "health_flag": "Status", "last_wave": "Last wave"}),
                     hide_index=True, use_container_width=True,
                     column_config={
                         "monthly_revenue_latest": st.column_config.NumberColumn("Monthly rev", format="$%.0f"),
                         "beneficiaries_reached_latest": st.column_config.NumberColumn("Beneficiaries", format="%.0f")})

    elif q == "Which orgs haven't reported in a year?":
        cutoff = REFERENCE_DATE - pd.Timedelta(days=365)
        stale = summary[summary["last_wave_ts"].notna() & (summary["last_wave_ts"] < cutoff)]
        st.metric("Silent > 12 months", f"{len(stale)} of {len(summary)}",
                  help=f"Last wave before {cutoff.date()}")
        show = stale[["org_name", "last_wave", "n_surveys", "health_flag"]].sort_values("last_wave")
        st.dataframe(show.rename(columns={"org_name": "Organisation", "last_wave": "Last reported",
                                          "n_surveys": "Surveys", "health_flag": "Status"}),
                     hide_index=True, use_container_width=True)

    elif q == "Which orgs never went past Inform / Engage?":
        stuck = summary[summary["ladder_stage"].isin(["Inform", "Engage"])]
        st.metric("Stuck at Inform/Engage", f"{len(stuck)}",
                  help="Orgs with health & hygiene data that never reached Outcome, Impact or Societal.")
        show = stuck[["org_name", "ladder_stage", "health_hygiene_informed_latest", "health_flag"]]
        st.dataframe(show.rename(columns={"org_name": "Organisation", "ladder_stage": "Highest stage",
                                          "health_flag": "Status"}),
                     hide_index=True, use_container_width=True,
                     column_config={"health_hygiene_informed_latest": st.column_config.NumberColumn("People informed", format="%.0f")})
        st.caption("Note: 31 orgs have *no* ladder data at all (not shown here) — they don't report the H&H funnel.")

    else:  # Gender equity
        if "pct_women_reached_latest" in summary:
            g = summary.dropna(subset=["pct_women_reached_latest"])
            c1, c2, c3 = st.columns(3)
            c1.metric("Orgs reporting", f"{len(g)}")
            c2.metric("Median % women", f"{g['pct_women_reached_latest'].median():.0f}%")
            c3.metric("Below 30% women", f"{(g['pct_women_reached_latest'] < 30).sum()}")
            hist = alt.Chart(g).mark_bar(color=CAT[4], cornerRadiusEnd=3).encode(
                x=alt.X("pct_women_reached_latest:Q", bin=alt.Bin(step=10), title="% women reached",
                        axis=alt.Axis(labelColor=MUTED)),
                y=alt.Y("count():Q", title="orgs", axis=alt.Axis(grid=True, gridColor=GRID, labelColor=MUTED)))
            st.altair_chart(hist.properties(height=240), use_container_width=True)
            st.dataframe(
                g[["org_name", "pct_women_reached_latest", "beneficiaries_reached_latest"]]
                .sort_values("pct_women_reached_latest")
                .rename(columns={"org_name": "Organisation"}),
                hide_index=True, use_container_width=True,
                column_config={
                    "pct_women_reached_latest": st.column_config.NumberColumn("% women", format="%.0f%%"),
                    "beneficiaries_reached_latest": st.column_config.NumberColumn("Beneficiaries", format="%.0f")})

# =========================================================== 4. CROSS-PORTFOLIO
with t_cross:
    st.caption("The aggregate story to report upward to the investor — filterable.")
    fc1, fc2 = st.columns(2)
    coh = fc1.multiselect("Cohort", tokens(summary["cohorts"]), key="x_coh")
    reg = fc2.multiselect("Region", tokens(summary["regions"]), key="x_reg")
    sub = summary.copy()
    if coh:
        sub = sub[sub["cohorts"].apply(lambda s: any(t in str(s).split(",") for t in coh))]
    if reg:
        sub = sub[sub["regions"].apply(lambda s: any(t in str(s).split(",") for t in reg))]

    st.markdown("#### Aggregate impact")
    excl = st.checkbox("Exclude flagged outliers from totals", value=True,
                       help="A few orgs report extreme reach (e.g. 150M video views) that would dominate a naive sum.")
    orgset = set(sub["org_name"])

    def agg(metric):
        s = latest_per_org(timeline, metric, exclude_outliers=excl)
        return s[s.index.isin(orgset)].sum()

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Organisations", f"{len(sub)}")
    m2.metric("Beneficiaries reached", fmt(agg("beneficiaries_reached")))
    m3.metric("People informed (H&H)", fmt(agg("health_hygiene_informed")))
    m4.metric("Total funding raised", fmt(agg("funding_total"), money=True))

    st.divider()
    perf_cols = {
        "org_name": "Organisation",
        "health_score": st.column_config.NumberColumn("Score", format="%d", help=SCORE_HELP),
        "monthly_revenue_latest": st.column_config.NumberColumn("Monthly rev", format="$%.0f"),
        "beneficiaries_reached_latest": st.column_config.NumberColumn("Beneficiaries", format="%.0f"),
    }
    perf_fields = ["org_name", "health_score", "monthly_revenue_latest", "beneficiaries_reached_latest"]
    scored = sub.dropna(subset=["health_score"])
    tp, ar = st.columns(2)
    with tp:
        st.markdown("#### 🏆 Top performers")
        st.caption("Highest Impact Health Score in this segment.")
        st.dataframe(scored.nlargest(8, "health_score")[perf_fields],
                     hide_index=True, use_container_width=True, column_config=perf_cols)
    with ar:
        st.markdown("#### 🚨 At-risk")
        st.caption("Lowest Impact Health Score — candidates for YSI support.")
        st.dataframe(scored.nsmallest(8, "health_score")[perf_fields],
                     hide_index=True, use_container_width=True, column_config=perf_cols)

    st.divider()
    left, right = st.columns(2)
    with left:
        st.markdown("#### ⚠️ Who's struggling")
        strug = sub[sub["health_flag"] == "Declining"].sort_values("beneficiaries_reached_latest", ascending=False, na_position="last")
        if strug.empty:
            st.caption("No declining organisations in this segment.")
        for _, o in strug.head(12).iterrows():
            need = quotes[(quotes["canonical_org_id"] == o["canonical_org_id"]) & (quotes["theme"] == "Needs")]
            st.markdown(f"**🔴 {o['org_name']}** · rev {fmt(o.get('monthly_revenue_latest'), money=True)} · "
                        f"beneficiaries {fmt(o.get('beneficiaries_reached_latest'))}")
            if not need.empty:
                st.caption(f"Needs: {need.iloc[0]['answer'][:180]}")

    with right:
        st.markdown("#### Portfolio health")
        fc = sub["health_flag"].value_counts().rename_axis("flag").reset_index(name="count")
        order = list(FLAG_STYLE)
        fc["flag"] = pd.Categorical(fc["flag"], order, ordered=True)
        chart = alt.Chart(fc.sort_values("flag")).mark_bar(cornerRadiusEnd=4).encode(
            x=alt.X("count:Q", title=None, axis=alt.Axis(grid=True, gridColor=GRID, labelColor=MUTED)),
            y=alt.Y("flag:N", sort=order, title=None, axis=alt.Axis(labelColor=INK)),
            color=alt.Color("flag:N", scale=alt.Scale(domain=order, range=[FLAG_STYLE[f][0] for f in order]), legend=None),
            tooltip=["flag:N", "count:Q"]).properties(height=180)
        st.altair_chart(chart, use_container_width=True)

        st.markdown("#### Beneficiaries by cohort")
        cohort_rows = []
        for c in tokens(summary["cohorts"]):
            seg = summary[summary["cohorts"].apply(lambda s: c in str(s).split(","))]
            cohort_rows.append({"cohort": c, "beneficiaries": seg.get("beneficiaries_reached_latest", pd.Series()).sum()})
        cdf = pd.DataFrame(cohort_rows)
        ch = alt.Chart(cdf).mark_bar(cornerRadiusEnd=4, color=CAT[2]).encode(
            x=alt.X("beneficiaries:Q", title=None, axis=alt.Axis(grid=True, gridColor=GRID, labelColor=MUTED, format="~s")),
            y=alt.Y("cohort:N", sort="-x", title=None, axis=alt.Axis(labelColor=INK)),
            tooltip=["cohort:N", alt.Tooltip("beneficiaries:Q", format=",")]).properties(height=180)
        st.altair_chart(ch, use_container_width=True)

    st.divider()
    st.markdown("#### 🗣️ Common challenges & needs")
    seg_q = quotes[quotes["canonical_org_id"].isin(sub["canonical_org_id"]) &
                   quotes["theme"].isin(["Needs", "Challenges"])]
    st.caption(f"{seg_q['canonical_org_id'].nunique()} organisations in this segment voiced needs or challenges "
               f"({len(seg_q)} responses). A sample, each cited to its source:")
    for _, qr in seg_q.head(8).iterrows():
        st.markdown(f"- *{qr['org_name']}* ({qr['theme']}): “{str(qr['answer'])[:200]}”")

# ============================================================= 5. SHOW YOUR WORK
with t_work:
    st.caption("Why the numbers are trustworthy: the messy inputs, and how they collapse.")

    st.markdown("#### Entity resolution — messy names → one organisation")
    st.caption("Email-domain stem, falling back to the normalised name stem (per the README the two are identical). "
               "Deterministic — no fuzzy guessing.")
    multi = entity_x[entity_x["n_variants"] > 1][["org_name", "n_variants", "raw_name_variants", "email_domain"]]
    if multi.empty:
        st.info("Each organisation appeared under a single spelling — nothing to collapse.")
    else:
        st.dataframe(multi.rename(columns={"org_name": "Resolved to", "n_variants": "# raw spellings",
                                           "raw_name_variants": "Raw variants seen", "email_domain": "Domain"}),
                     hide_index=True, use_container_width=True)
    st.metric("Distinct organisations resolved", f"{len(entity_x)}",
              help="Down from many inconsistent raw spellings across 19 files.")

    st.divider()
    st.markdown("#### Metric mapping — many worded questions → one canonical metric")
    st.caption("Survey wording drifts every wave (and across two languages). Keyword rules map them to one metric.")
    for _, m in metric_x.iterrows():
        with st.expander(f"**{METRIC_LABELS.get(m['metric_name'], m['metric_name'])}** — "
                         f"{m['n_question_variants']} question variants, {m['n_records']} records"):
            for qtext in str(m["example_questions"]).split(" ||| "):
                st.markdown(f"- {qtext}")

    st.divider()
    st.markdown("#### SDG & IRIS+ tagging — the rules, so you can see why each tag applied")
    st.caption("Tags are rule-based and attached to an org ONLY when it reports a metric that supports them — "
               "never blanket-applied. Environmental (SDG 13) and education (SDG 4) are intentionally absent: "
               "the cleaned dataset has no metric that would justify them.")

    sdg_rows = [{"SDG": SDG_LABELS[s], "Applied when the org reports…": SDG_RULE_TEXT[s]}
                for s in sorted(SDG_RULE_TEXT)]
    st.markdown("**UN SDG rules**")
    st.dataframe(pd.DataFrame(sdg_rows), hide_index=True, use_container_width=True)

    iris_rows = {}
    for metric, cat in IRIS_CATEGORY_MAP.items():
        iris_rows.setdefault(cat, []).append(METRIC_LABELS.get(metric, metric))
    iris_df = pd.DataFrame([{"IRIS+ aligned category": c, "Derived from metrics": ", ".join(sorted(set(ms)))}
                            for c, ms in sorted(iris_rows.items())])
    st.markdown("**IRIS+ thematic categories** (category-level only — no IRIS+ metric codes, by design)")
    st.dataframe(iris_df, hide_index=True, use_container_width=True)
    st.caption("Enterprise-financial metrics (revenue, funding, EBITDA, valuation, runway) are deliberately NOT "
               "given an IRIS+ impact category — they measure enterprise performance, not a social/environmental theme.")

    st.divider()
    st.markdown("#### Data cleaning — what we rejected, and why")
    total_acc = int(cleaning["accepted"].sum())
    total_rej = int(cleaning["rejected"].sum())
    cc1, cc2, cc3 = st.columns(3)
    cc1.metric("Values accepted", f"{total_acc:,}")
    cc2.metric("Values rejected", f"{total_rej:,}")
    cc3.metric("Outliers flagged (kept)", f"{int(timeline['is_outlier'].sum())}")
    st.caption("Rejected = essays typed into number fields (free_text), currency amounts in headcount/% fields "
               "(currency_in_nonmeasure), impossible values like a 100,000-month runway (out_of_range), or "
               "un-numeric text (unparseable). Rejected values are excluded from every total — never silently coerced.")

    reason_cols = [c for c in cleaning.columns
                   if c not in ("metric_name", "accepted", "rejected", "total_candidates")]
    show = cleaning[cleaning["rejected"] > 0][["metric_name", "accepted", "rejected"] + reason_cols]
    st.dataframe(show.rename(columns={"metric_name": "Metric"}), hide_index=True, use_container_width=True)

    with st.expander("See concrete examples of rejected cells"):
        st.dataframe(rejects.rename(columns={"clean_flag": "Reason", "metric_name": "Mapped to",
                                             "raw_value": "Raw cell", "source_file": "File"}),
                     hide_index=True, use_container_width=True)
