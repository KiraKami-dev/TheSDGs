"""
qualitative.py — Pull free-text survey answers (needs, challenges, wins, support
asks, impact stories) out of the raw files and attach them to canonical orgs.

These are the human quotes that make the deep-dive real for a programme manager:
"growing revenue but here's what they say they still need." Each quote keeps its
source file + wave so it can be shown in context.

Output (data/processed/quotes.csv):
    canonical_org_id, org_name, source_file, wave_date, theme, question, answer
"""

import re
import pandas as pd

from pipeline.config import FILES, load_raw
from pipeline.entity_resolution import extract_org_key, canonical_key

# Free-text themes -> keyword rules on the column header (same engine idea as
# metric_mapping, but the *value* is kept as text, not parsed to a number).
QUOTE_RULES = {
    "Needs": [
        {"all": ["top 3 needs"]},
        {"all": ["current needs"]},
        {"all": ["anticipated support needs"]},
        {"all": ["additional support was needed"]},
        {"all": ["support on from the community"]},
        {"all": ["necessidades"]},                 # Portuguese
    ],
    "Challenges": [
        {"all": ["biggest challenges"]},
        {"all": ["challenge"], "none": ["fewer", "top 3 needs"]},
    ],
    "Wins / Proud of": [
        {"all": ["proud"]},
        {"all": ["excited about"]},
        {"all": ["key business and impact updates"]},
        {"all": ["biggest take-away"]},
    ],
    "Impact story": [
        {"all": ["impact story"]},
        {"all": ["evidence of impact"]},
    ],
    "Programme benefit": [
        {"all": ["ways has the program"]},
        {"all": ["ways has the programme"]},
        {"all": ["benefitted you"]},
    ],
    "Partnerships": [
        {"all": ["new partnerships were enabled"]},
        {"all": ["partnerships that have formed"]},
    ],
}

MIN_LEN = 15   # ignore trivially short answers ("N/A", "none", "-")
_JUNK = {"na", "n/a", "none", "nil", "-", "--", "n.a.", "tbd", "."}


def classify_quote_column(header: str) -> str | None:
    if not isinstance(header, str):
        return None
    h = header.lower()
    for theme, rules in QUOTE_RULES.items():
        for rule in rules:
            if all(k in h for k in rule.get("all", [])) and not any(
                k in h for k in rule.get("none", [])
            ):
                return theme
    return None


def _clean(text) -> str | None:
    if not isinstance(text, str):
        return None
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) < MIN_LEN or t.lower() in _JUNK:
        return None
    return t


def extract_quotes_from_file(df: pd.DataFrame, filename: str) -> pd.DataFrame:
    df = extract_org_key(df)
    wave_date = FILES.get(filename, {}).get("date")
    names = df["raw_org_name"].tolist()
    domains = df["email_domain"].tolist()

    records = []
    for col_pos, header in enumerate(df.columns):
        theme = classify_quote_column(header)
        if not theme:
            continue
        series = df.iloc[:, col_pos]
        for row_pos, raw in enumerate(series.tolist()):
            answer = _clean(raw)
            if not answer:
                continue
            key = canonical_key(names[row_pos], domains[row_pos])
            if not key:
                continue
            records.append({
                "org_key": key,
                "raw_org_name": names[row_pos],
                "source_file": filename,
                "wave_date": wave_date,
                "theme": theme,
                "question": header,
                "answer": answer,
            })
    return pd.DataFrame(records)


def extract_all_quotes() -> pd.DataFrame:
    frames = []
    for filename in FILES:
        try:
            df = load_raw(filename)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! skipped {filename}: {exc}")
            continue
        frames.append(extract_quotes_from_file(df, filename))
    if not frames:
        return pd.DataFrame(
            columns=["org_key", "raw_org_name", "source_file", "wave_date",
                     "theme", "question", "answer"]
        )
    return pd.concat(frames, ignore_index=True)


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    q = extract_all_quotes()
    print(f"Extracted {len(q)} quotes across {q['org_key'].nunique()} orgs")
    print("\nBy theme:")
    print(q["theme"].value_counts().to_string())
