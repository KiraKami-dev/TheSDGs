"""
build_timeline.py — Final pipeline stage. Joins canonical orgs to their metrics
and produces every table the Streamlit dashboard consumes.

Outputs (data/processed/):
    timeline.csv         tidy: canonical_org x metric x wave  (drives charts)
    org_summary.csv      one row per org: latest + delta + trend arrow for every
                         metric, health flag, impact-ladder stage, SDG tags,
                         cohort(s), region(s), survey count, last report date
    file_coverage.csv    metrics + records per source file
    entity_crosswalk.csv messy raw org-name variants -> one canonical org
    metric_crosswalk.csv raw survey questions -> one canonical metric
    quotes.csv           free-text needs/challenges/wins per org

Answers Janine's brief: financial + social side by side, portfolio overview,
who's growing vs struggling and why, and the health & hygiene reach story.
"""

from pathlib import Path

import pandas as pd

from pipeline.config import FILES
from pipeline.metric_mapping import (
    map_all_files, SDG_MAP, IMPACT_LADDER, LADDER_ORDER, IRIS_CATEGORY_MAP,
)
from pipeline.entity_resolution import build_entity_map

PROCESSED_DIR = Path("data/processed")

# Financial / social signals used for the health flag, in preference order.
FINANCIAL_SIGNALS = ["monthly_revenue", "revenue_actuals", "funding_total", "ebitda"]
SOCIAL_SIGNALS = ["beneficiaries_reached", "health_hygiene_informed",
                  "wash_access_improved", "livelihoods_improved"]

FLAT_TOLERANCE = 0.05   # ±5% change counts as "flat"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def wave_sort_key(wave_date) -> tuple[int, int]:
    """'YYYY-MM' / 'YYYY' / 'YYYY-YYYY' -> sortable (year, month); unknown last."""
    if not isinstance(wave_date, str) or not wave_date.strip():
        return (9999, 99)
    parts = wave_date.split("-")
    try:
        year = int(parts[0])
    except ValueError:
        return (9999, 99)
    month = 0
    if len(parts) > 1 and len(parts[1]) <= 2:
        try:
            month = int(parts[1])
        except ValueError:
            month = 0
    return (year, month)


def direction(old, new, tol: float = FLAT_TOLERANCE) -> str | None:
    """'up' / 'down' / 'flat' comparing two values (None if either missing)."""
    if old is None or new is None or pd.isna(old) or pd.isna(new):
        return None
    if old == 0:
        return "up" if new > 0 else "flat"
    change = (new - old) / abs(old)
    if change > tol:
        return "up"
    if change < -tol:
        return "down"
    return "flat"


# ---------------------------------------------------------------------------
# Attach canonical org id + cohort/region to every metric row
# ---------------------------------------------------------------------------
def resolve_rows(long_df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    identity = (
        long_df[["source_file", "row_idx", "raw_org_name", "email_domain"]]
        .drop_duplicates()
        .reset_index(drop=True)
    )
    row_to_canonical, canonical_orgs = build_entity_map(identity)
    identity["canonical_org_id"] = identity.index.map(row_to_canonical)

    named = identity.dropna(subset=["raw_org_name"])
    name_map = (
        named.groupby("canonical_org_id")["raw_org_name"]
        .agg(lambda s: s.value_counts().idxmax())
        .to_dict()
    )
    identity["org_name"] = identity["canonical_org_id"].map(name_map)

    merged = long_df.merge(
        identity[["source_file", "row_idx", "canonical_org_id", "org_name"]],
        on=["source_file", "row_idx"],
        how="left",
    )
    merged["cohort"] = merged["source_file"].map(lambda f: FILES.get(f, {}).get("cohort"))
    merged["region"] = merged["source_file"].map(lambda f: FILES.get(f, {}).get("region"))
    return merged, canonical_orgs


# ---------------------------------------------------------------------------
# Tidy timeline
# ---------------------------------------------------------------------------
def build_timeline(resolved_df: pd.DataFrame) -> pd.DataFrame:
    # Only cleaned/accepted values (rejected cells carry value = NaN).
    df = resolved_df.dropna(subset=["canonical_org_id", "value"]).copy()
    grouped = (
        df.groupby(["canonical_org_id", "org_name", "metric_name", "wave_date"])
        .agg(value=("value", "mean"), value_max=("value", "max"), n_records=("value", "size"))
        .reset_index()
    )
    keys = grouped["wave_date"].map(wave_sort_key)
    grouped["_year"] = keys.map(lambda k: k[0])
    grouped["_month"] = keys.map(lambda k: k[1])
    grouped = flag_outliers(grouped)
    return grouped.sort_values(["org_name", "metric_name", "_year", "_month"]).reset_index(drop=True)


def flag_outliers(timeline_df: pd.DataFrame, thresh: float = 3.5) -> pd.DataFrame:
    """
    Mark values that are extreme within their metric. Counts/money are heavily
    right-skewed, so we run a robust (median/MAD) z-score on log10 of the value
    and flag only the UPPER tail. Outliers are KEPT (they may be legitimately
    huge, e.g. 150M video reach) but flagged, so the dashboard can annotate them
    and offer to exclude them from portfolio totals rather than letting one org
    dominate a sum.
    """
    import numpy as np
    # Bounded metrics (ratings, %, runway) have natural ceilings — a max score is
    # not an outlier. Only flag unbounded count/money metrics.
    bounded = {"pct_women_reached", "confidence_rating", "business_perf_rating",
               "nps_recommend", "runway_months"}
    df = timeline_df.copy()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["is_outlier"] = False
    for metric, idx in df.groupby("metric_name").groups.items():
        if metric in bounded:
            continue
        pos = df.loc[idx, "value"]
        pos = pos[pos > 0]
        if len(pos) < 6:
            continue
        logv = np.log10(pos.to_numpy(dtype=float))
        med = np.median(logv)
        mad = np.median(np.abs(logv - med))
        if mad == 0:
            continue
        rz = 0.6745 * (logv - med) / mad          # signed; upper tail only
        df.loc[pos.index[rz > thresh], "is_outlier"] = True
    return df


# ---------------------------------------------------------------------------
# Per-org summary
# ---------------------------------------------------------------------------
def _metric_dir(org_df: pd.DataFrame, metric: str) -> str | None:
    sub = org_df[org_df["metric_name"] == metric].sort_values(["_year", "_month"])
    if len(sub) < 2:
        return None
    return direction(sub.iloc[0]["value"], sub.iloc[-1]["value"])


def _health_flag(org_df: pd.DataFrame) -> str:
    fin = next((d for m in FINANCIAL_SIGNALS if (d := _metric_dir(org_df, m))), None)
    soc = next((d for m in SOCIAL_SIGNALS if (d := _metric_dir(org_df, m))), None)
    dirs = [d for d in (fin, soc) if d]
    if not dirs:
        return "Insufficient data"
    ups = sum(d == "up" for d in dirs)
    downs = sum(d == "down" for d in dirs)
    if ups and not downs:
        return "Improving"
    if downs and not ups:
        return "Declining"
    return "Flat"


def _ladder_stage(org_df: pd.DataFrame) -> str:
    """Highest health & hygiene IMM funnel stage the org reports with a value > 0."""
    stage = "No maturity data"
    for metric, label in IMPACT_LADDER:
        sub = org_df[org_df["metric_name"] == metric].sort_values(["_year", "_month"])
        if not sub.empty and pd.notna(sub.iloc[-1]["value"]) and sub.iloc[-1]["value"] > 0:
            stage = label
    return stage


# ---------------------------------------------------------------------------
# Impact Health Score (0-100). Weighted; per-org weights renormalise over the
# components that are actually computable from that org's data (no faked values).
# ---------------------------------------------------------------------------
HEALTH_WEIGHTS = {            # documented in the UI tooltip
    "financial": 0.40,        # growth in revenue / funding
    "social": 0.30,           # growth + scale of beneficiaries / reach
    "reporting": 0.10,        # proxy: how many metrics the org actually reports
    "imm": 0.10,              # IMM maturity: impact-ladder stage
    "consistency": 0.10,      # proxy: number of survey waves responded to
}
_REPORTING_TARGET = 10        # ~metrics a thorough reporter provides (proxy denom)
_CONSISTENCY_TARGET = 4       # ~waves = a consistent reporter (proxy denom)


def _growth_score(pct: float) -> float:
    """Map a % change to 0-100: +50%→100, flat→55, -50%→10 (clamped)."""
    return max(5.0, min(100.0, 55 + 0.9 * max(-50.0, min(50.0, pct))))


def _scale_score(latest: float) -> float:
    """Log-scaled reach magnitude: 10M→100, 10k→~57, 100→~29."""
    import math
    if latest is None or pd.isna(latest) or latest <= 0:
        return 0.0
    return max(0.0, min(100.0, math.log10(latest) / 7 * 100))


def _pct_change_from_rec(rec: dict, metric: str):
    latest, delta, waves = rec.get(f"{metric}_latest"), rec.get(f"{metric}_delta"), rec.get(f"{metric}_waves")
    if latest is None or pd.isna(latest) or waves is None or waves < 2 or delta is None or pd.isna(delta):
        return None
    earliest = latest - delta
    if not earliest:
        return None
    return delta / abs(earliest) * 100


def compute_health_score(rec: dict) -> dict:
    """Return {score, status, components:{name:subscore|None}} for one org rec."""
    comp = {}

    # Financial growth
    fin = None
    for m in ["monthly_revenue", "revenue_actuals", "funding_total", "ebitda"]:
        pct = _pct_change_from_rec(rec, m)
        if pct is not None:
            fin = _growth_score(pct)
            break
    comp["financial"] = fin

    # Social impact = growth (if trend available) blended with reach scale
    soc = None
    for m in ["beneficiaries_reached", "health_hygiene_informed", "wash_access_improved"]:
        latest = rec.get(f"{m}_latest")
        if latest is None or pd.isna(latest):
            continue
        pct = _pct_change_from_rec(rec, m)
        scale = _scale_score(latest)
        soc = 0.6 * _growth_score(pct) + 0.4 * scale if pct is not None else scale
        break
    comp["social"] = soc

    # Reporting quality (proxy: breadth of metrics reported)
    comp["reporting"] = min(100.0, (rec.get("metrics_tracked", 0) / _REPORTING_TARGET) * 100)

    # IMM maturity (impact-ladder stage index / 5)
    stage = rec.get("ladder_stage")
    comp["imm"] = ((LADDER_ORDER.index(stage) + 1) / len(LADDER_ORDER) * 100) if stage in LADDER_ORDER else None

    # Survey consistency (proxy: waves responded to)
    comp["consistency"] = min(100.0, (rec.get("n_surveys", 0) / _CONSISTENCY_TARGET) * 100)

    avail = {k: v for k, v in comp.items() if v is not None}
    wsum = sum(HEALTH_WEIGHTS[k] for k in avail)
    score = round(sum(HEALTH_WEIGHTS[k] * v for k, v in avail.items()) / wsum) if wsum else None
    status = ("green" if score is not None and score >= 70
              else "yellow" if score is not None and score >= 40
              else "red" if score is not None else "grey")
    return {"score": score, "status": status, "components": comp}


def build_org_summary(timeline_df: pd.DataFrame, resolved: pd.DataFrame,
                      canonical_orgs: dict) -> pd.DataFrame:
    metrics = sorted(timeline_df["metric_name"].unique())

    res = resolved.dropna(subset=["canonical_org_id"])
    n_surveys = res.groupby("canonical_org_id")["source_file"].nunique().rename("n_surveys")
    cohorts = (res.groupby("canonical_org_id")["cohort"]
               .apply(lambda s: ",".join(sorted({str(x) for x in s.dropna()}))).rename("cohorts"))
    regions = (res.groupby("canonical_org_id")["region"]
               .apply(lambda s: ",".join(sorted({str(x) for x in s.dropna()}))).rename("regions"))

    rows = []
    for (cid, org_name), org_df in timeline_df.groupby(["canonical_org_id", "org_name"]):
        rec = {"canonical_org_id": cid, "org_name": org_name,
               "org_key": canonical_orgs.get(cid, {}).get("key"),
               "n_surveys": int(n_surveys.get(cid, 0))}   # needed by the score below
        sdgs, iris, present = set(), set(), 0
        for metric in metrics:
            sub = org_df[org_df["metric_name"] == metric].sort_values(["_year", "_month"])
            if sub.empty:
                continue
            present += 1
            latest = sub.iloc[-1]["value"]
            earliest = sub.iloc[0]["value"]
            prev = sub.iloc[-2]["value"] if len(sub) >= 2 else None
            rec[f"{metric}_latest"] = latest
            rec[f"{metric}_delta"] = (latest - earliest) if len(sub) >= 2 else None
            rec[f"{metric}_arrow"] = direction(prev, latest)
            rec[f"{metric}_waves"] = len(sub)
            for s in SDG_MAP.get(metric, []):
                sdgs.add(s)
            if metric in IRIS_CATEGORY_MAP:
                iris.add(IRIS_CATEGORY_MAP[metric])
        rec["metrics_tracked"] = present
        rec["health_flag"] = _health_flag(org_df)
        rec["ladder_stage"] = _ladder_stage(org_df)
        rec["sdgs"] = ",".join(str(s) for s in sorted(sdgs))
        rec["iris_categories"] = " | ".join(sorted(iris))
        last = org_df.sort_values(["_year", "_month"]).iloc[-1]
        rec["last_wave"] = last["wave_date"]
        rec["n_outliers"] = int(org_df["is_outlier"].sum()) if "is_outlier" in org_df else 0
        rec["has_outlier"] = rec["n_outliers"] > 0

        # Impact Health Score (weights renormalised over computable components)
        hs = compute_health_score(rec)
        rec["health_score"] = hs["score"]
        rec["health_status"] = hs["status"]
        for k, v in hs["components"].items():
            rec[f"score_{k}"] = None if v is None else round(v)
        rows.append(rec)

    summary = pd.DataFrame(rows).set_index("canonical_org_id")
    summary = summary.join(cohorts).join(regions).reset_index()  # n_surveys already set in rec
    return summary.sort_values("org_name").reset_index(drop=True)


# ---------------------------------------------------------------------------
# "Show your work" crosswalks
# ---------------------------------------------------------------------------
def build_entity_crosswalk(resolved: pd.DataFrame) -> pd.DataFrame:
    r = resolved.dropna(subset=["canonical_org_id"])
    rows = []
    for (cid, org_name), g in r.groupby(["canonical_org_id", "org_name"]):
        variants = sorted({str(x) for x in g["raw_org_name"].dropna()})
        domains = sorted({str(x) for x in g["email_domain"].dropna()})
        rows.append({
            "canonical_org_id": cid, "org_name": org_name,
            "n_variants": len(variants),
            "raw_name_variants": " | ".join(variants),
            "email_domain": domains[0] if domains else "",
        })
    return pd.DataFrame(rows).sort_values("n_variants", ascending=False).reset_index(drop=True)


def build_metric_crosswalk(long_df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for metric, g in long_df.groupby("metric_name"):
        cols = sorted({str(c) for c in g["source_column"].dropna()})
        rows.append({
            "metric_name": metric,
            "n_question_variants": len(cols),
            "n_records": len(g),
            "example_questions": " ||| ".join(cols[:10]),
        })
    return pd.DataFrame(rows).sort_values("n_question_variants", ascending=False).reset_index(drop=True)


def build_quotes(summary_df: pd.DataFrame) -> pd.DataFrame:
    from pipeline.qualitative import extract_all_quotes
    q = extract_all_quotes()
    key2org = (summary_df.dropna(subset=["org_key"])[["org_key", "canonical_org_id", "org_name"]]
               .drop_duplicates("org_key"))
    q = q.merge(key2org, on="org_key", how="left")
    q["org_name"] = q["org_name"].fillna(q["raw_org_name"])
    return q


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def build_cleaning_report(long_df: pd.DataFrame) -> pd.DataFrame:
    """Per-metric tally of accepted vs each rejection reason, for the trust panel."""
    rep = (long_df.groupby(["metric_name", "clean_flag"]).size()
           .unstack(fill_value=0).reset_index())
    if "ok" not in rep:
        rep["ok"] = 0
    reject_cols = [c for c in rep.columns if c not in ("metric_name", "ok")]
    rep["accepted"] = rep["ok"]
    rep["rejected"] = rep[reject_cols].sum(axis=1) if reject_cols else 0
    rep["total_candidates"] = rep["accepted"] + rep["rejected"]
    ordered = ["metric_name", "accepted", "rejected", "total_candidates"] + sorted(reject_cols)
    return rep[ordered].sort_values("rejected", ascending=False).reset_index(drop=True)


def run(write: bool = True) -> dict:
    long_df = map_all_files()
    resolved, canonical_orgs = resolve_rows(long_df)

    timeline_df = build_timeline(resolved)
    summary_df = build_org_summary(timeline_df, resolved, canonical_orgs)
    accepted = long_df[long_df["value"].notna()]
    coverage_df = (
        accepted.groupby("source_file")
        .agg(metrics=("metric_name", "nunique"), records=("metric_name", "size"))
        .sort_values("metrics", ascending=False).reset_index()
    )
    entity_x = build_entity_crosswalk(resolved)
    metric_x = build_metric_crosswalk(accepted)
    quotes_df = build_quotes(summary_df)
    cleaning_report = build_cleaning_report(long_df)

    # A handful of concrete rejected cells per reason (for the trust panel).
    rej = long_df[long_df["value"].isna()].copy()
    rej["raw_value"] = rej["raw_value"].astype(str).str.slice(0, 120)
    rejected_samples = (rej.sort_values("clean_flag").groupby("clean_flag").head(6)
                        [["clean_flag", "metric_name", "raw_value", "source_file"]]
                        .reset_index(drop=True))

    if write:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        timeline_df.drop(columns=["_year", "_month"]).to_csv(PROCESSED_DIR / "timeline.csv", index=False)
        summary_df.to_csv(PROCESSED_DIR / "org_summary.csv", index=False)
        coverage_df.to_csv(PROCESSED_DIR / "file_coverage.csv", index=False)
        entity_x.to_csv(PROCESSED_DIR / "entity_crosswalk.csv", index=False)
        metric_x.to_csv(PROCESSED_DIR / "metric_crosswalk.csv", index=False)
        quotes_df.to_csv(PROCESSED_DIR / "quotes.csv", index=False)
        cleaning_report.to_csv(PROCESSED_DIR / "cleaning_report.csv", index=False)
        rejected_samples.to_csv(PROCESSED_DIR / "rejected_samples.csv", index=False)

    n_rejected = int(long_df["value"].isna().sum())
    print(f"Canonical orgs: {len(canonical_orgs)}  |  timeline rows: {len(timeline_df)}")
    print(f"Candidate cells: {len(long_df)}  |  accepted: {len(accepted)}  |  rejected: {n_rejected}")
    print(f"Outlier values flagged: {int(timeline_df['is_outlier'].sum())}")
    print("Rejections by reason:", long_df[long_df['value'].isna()]['clean_flag'].value_counts().to_dict())
    print("Health flags:", summary_df["health_flag"].value_counts().to_dict())
    if write:
        print(f"Wrote 7 CSVs to {PROCESSED_DIR}/")
    return {"timeline": timeline_df, "summary": summary_df, "coverage": coverage_df,
            "entity": entity_x, "metric": metric_x, "quotes": quotes_df,
            "cleaning_report": cleaning_report}


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    run()
