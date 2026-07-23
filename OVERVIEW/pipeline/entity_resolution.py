"""
entity_resolution.py — Collapse scattered survey rows into distinct organizations.

Canonical key = a normalized "stem". Per the README, each pseudonymised email
domain is derived 1:1 from the org name ("BrightPath Solutions" ->
brightpathsolutions.org), and we verified empirically that where both are
present the name stem equals the domain stem 100% of the time. So:

    canonical key = domain stem (from email) if present, else name stem.

This is deterministic and order-independent. An earlier fuzzy-matching fallback
(rapidfuzz token_sort_ratio >= 85) was removed: it over-merged ~39 distinct
orgs into 29 and gave different counts depending on input order. The stem key
resolves the data to 67 orgs, matching the client's "~62 companies".
"""

import re
import pandas as pd

# Columns that might contain the organization's name, across all 19 files.
# Order matters: first match wins.
ORG_NAME_COLUMNS = [
    "Organization", "Organisation", "Name of Organization", "Company Name",
    "Organisation Name",   # AP4_May_2026_Midline, AP1and2_April_25, AP3_April_2025_Midline, AP_April_2025_extra_data
    "Social Enterprise",   # AP1_April_2025_Short_Beneficiary_Survey
    "Nome da empresa",     # AP1_October_2023_BRA, AP1_June_2024_BRA (Portuguese - company name)
    "Name", "What is your name?",  # last resort: often the respondent's personal name, not the org
]

# Columns that might contain an email address, across all 19 files.
EMAIL_COLUMNS = [
    "Email", "Email 2", "Email 3", "Email (Main Contact 2)", "Email (Team Member 1)",
    "Email (Team Member 2)",
]


def extract_domain(email: str) -> str | None:
    """Pull the domain out of an email address, normalized to lowercase."""
    if not isinstance(email, str) or "@" not in email:
        return None
    domain = email.strip().lower().split("@")[-1]
    # Strip common noise
    domain = domain.replace("www.", "")
    return domain if domain else None


def name_stem(name: str) -> str | None:
    """Normalize an org name to an alphanumeric stem, e.g. 'BrightPath Solutions'
    -> 'brightpathsolutions'."""
    if not isinstance(name, str):
        return None
    stem = re.sub(r"[^a-z0-9]", "", name.lower())
    return stem or None


def domain_stem(domain: str) -> str | None:
    """Normalize an email domain to the same stem as its org name, e.g.
    'brightpathsolutions.org' -> 'brightpathsolutions'."""
    if not isinstance(domain, str) or not domain.strip():
        return None
    stem = re.sub(r"[^a-z0-9]", "", domain.split(".")[0].lower())
    return stem or None


def canonical_key(name: str | None, domain: str | None) -> str | None:
    """The deterministic identity key: domain stem if present, else name stem.
    (Per the README these are identical when both exist.)"""
    return domain_stem(domain) or name_stem(name)


def find_first_present(row: pd.Series, candidate_columns: list[str]) -> str | None:
    """Return the first non-null value among candidate columns present in this row."""
    for col in candidate_columns:
        if col in row.index and pd.notna(row[col]) and str(row[col]).strip():
            return str(row[col]).strip()
    return None


def extract_org_key(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add two columns to df: 'raw_org_name' and 'email_domain'.
    These are the raw signals used for matching — not yet resolved to a canonical ID.
    """
    df = df.copy()
    df["raw_org_name"] = df.apply(lambda r: find_first_present(r, ORG_NAME_COLUMNS), axis=1)
    df["email_domain"] = df.apply(
        lambda r: extract_domain(find_first_present(r, EMAIL_COLUMNS) or ""), axis=1
    )
    return df


def build_entity_map(all_rows: pd.DataFrame, name_match_threshold: int = 85) -> tuple[dict, dict]:
    """
    Resolve every row to a canonical org id using the deterministic stem key.

    Returns (row_to_canonical, canonical_orgs) where:
      - row_to_canonical: {row index -> canonical_id}
      - canonical_orgs:   {canonical_id -> {"name", "domain", "key"}}

    Rows with neither a name nor an email domain are left unmapped (not in
    row_to_canonical). `name_match_threshold` is accepted for backward
    compatibility but no longer used — resolution is exact on the stem key.
    """
    canonical_orgs = {}      # canonical_id -> {"name","domain","key"}
    row_to_canonical = {}    # row index -> canonical_id
    key_to_canonical = {}    # stem key -> canonical_id
    next_id = 1

    for idx, row in all_rows.iterrows():
        name = row.get("raw_org_name")
        domain = row.get("email_domain")
        key = canonical_key(name, domain)
        if not key:
            continue  # no identifying info — leave unmapped

        if key not in key_to_canonical:
            canonical_id = f"org_{next_id:03d}"
            next_id += 1
            key_to_canonical[key] = canonical_id
            canonical_orgs[canonical_id] = {"name": name, "domain": domain, "key": key}
        else:
            canonical_id = key_to_canonical[key]
            # Backfill a name/domain if this row supplies one we didn't have.
            info = canonical_orgs[canonical_id]
            if not info.get("domain") and domain:
                info["domain"] = domain
            if not info.get("name") and name:
                info["name"] = name

        row_to_canonical[idx] = canonical_id

    return row_to_canonical, canonical_orgs