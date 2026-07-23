"""
config.py — Central registry of all raw data files and their quirks.
"""

from pathlib import Path

RAW_DIR = Path("data/raw")

# Delimiter override — default is comma, these three are semicolon (per README)
SEMICOLON_FILES = {
    "AP3_Baseline_October_2024.csv",
    "AP_April_2025_extra_data.csv",
    "IMM_Assessment_October_2025.csv",
}

# Files with Portuguese headers/content
PORTUGUESE_FILES = {
    "AP1_October_2023_BRA.csv",
    "AP1_June_2024_BRA.csv",
}
# Note: AP1_October_2024_SA_BR.csv is COMBINED SA+Brazil — may be mixed language per row

# Registry: filename -> metadata
FILES = {
    "AP1_Baseline_Nov_22_SA.csv": {
        "cohort": "AP1", "wave": "baseline", "date": "2022-11", "region": "SA",
    },
    "AP1_April_2023_SA__Knowledge___Behaviour.csv": {
        "cohort": "AP1", "wave": "knowledge_behaviour", "date": "2023-04", "region": "SA",
    },
    "AP1_April_23_Org_Performance_SA.csv": {
        "cohort": "AP1", "wave": "org_performance", "date": "2023-04", "region": "SA",
    },
    "AP1_October_2023_SA.csv": {
        "cohort": "AP1", "wave": "followup", "date": "2023-10", "region": "SA",
    },
    "AP1_October_2023_BRA.csv": {
        "cohort": "AP1", "wave": "followup", "date": "2023-10", "region": "BRA", "language": "pt",
    },
    "AP1_Endline_April_24_SA.csv": {
        "cohort": "AP1", "wave": "endline", "date": "2024-04", "region": "SA",
    },
    "AP1_June_2024_BRA.csv": {
        "cohort": "AP1", "wave": "followup", "date": "2024-06", "region": "BRA", "language": "pt",
    },
    "AP1_October_2024_SA_BR.csv": {
        "cohort": "AP1", "wave": "followup", "date": "2024-10", "region": "SA+BRA",
    },
    "AP1_April_2025_Short_Beneficiary_Survey.csv": {
        "cohort": "AP1", "wave": "beneficiary_survey", "date": "2025-04", "region": None,
    },
    "AP1and2_April_25.csv": {
        "cohort": "AP1+AP2", "wave": "combined", "date": "2025-04", "region": None,
    },
    "AP2_Baseline_October_2023.csv": {
        "cohort": "AP2", "wave": "baseline", "date": "2023-10", "region": None,
    },
    "AP2_March_2024.csv": {
        "cohort": "AP2", "wave": "programme_feedback", "date": "2024-03", "region": None,
    },
    "AP2_October_2024.csv": {
        "cohort": "AP2", "wave": "followup", "date": "2024-10", "region": None,
    },
    "AP3_Baseline_October_2024.csv": {
        "cohort": "AP3", "wave": "baseline", "date": "2024-10", "region": None,
    },
    "AP3_April_2025_Midline.csv": {
        "cohort": "AP3", "wave": "midline", "date": "2025-04", "region": None,
    },
    "AP4_2025_2026_Baseline_Survey.csv": {
        "cohort": "AP4", "wave": "baseline", "date": "2025-2026", "region": None,
    },
    "AP4_May_2026_Midline.csv": {
        "cohort": "AP4", "wave": "midline", "date": "2026-05", "region": None,
    },
    "AP_April_2025_extra_data.csv": {
        "cohort": None, "wave": "prize_recipients", "date": "2025-04", "region": None,
    },
    "IMM_Assessment_October_2025.csv": {
        "cohort": "cross-cohort", "wave": "imm_assessment", "date": "2025-10", "region": None,
    },
}


def get_delimiter(filename: str) -> str:
    return ";" if filename in SEMICOLON_FILES else ","


def get_encoding(filename: str) -> str:
    # utf-8-sig safely handles both plain utf-8 and BOM-prefixed files
    return "utf-8-sig"


def load_raw(filename: str, **kwargs):
    """Load a single raw CSV with the correct delimiter/encoding, robust to bad lines."""
    import pandas as pd
    path = RAW_DIR / filename
    return pd.read_csv(
        path,
        sep=get_delimiter(filename),
        encoding=get_encoding(filename),
        on_bad_lines="warn",
        **kwargs,
    )