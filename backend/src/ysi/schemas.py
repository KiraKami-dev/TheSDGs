"""Structured outputs the two agents produce.

The Analyze Agent's output includes typed "blocks" rather than only prose:
the agent decides which blocks to use and what goes in them, and the frontend
has a small fixed set of renderers (company_roster / insight / stat /
leaderboard / timeseries / table / markdown) for each type. That's the
"dynamic UI" idea: the agent picks the shape per answer, not a hardcoded
fixed layout.

company_roster is the primary one for the portfolio overview: a scannable,
click-to-expand list of specific companies worth a look, since that is what
YSI actually asked for (a company-level view, not a topic-level one).
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class CleaningDecision(BaseModel):
    what: str = Field(description="What was done, concretely, e.g. the specific merge/mapping")
    why: str = Field(description="Why, especially for anything ambiguous or judgment-call-y")


class CleaningResult(BaseModel):
    summary: str = Field(description="1-3 sentence overview of what the raw data was and how it was cleaned")
    decisions: list[CleaningDecision] = Field(default_factory=list)
    tables_written: list[str] = Field(default_factory=list, description="Names of DuckDB tables written")
    open_questions: list[str] = Field(
        default_factory=list, description="Things a human should weigh in on or double-check"
    )


class InsightBlock(BaseModel):
    """A single actionable finding: something that needs a decision or a look,
    not just a number. Rendered prominently, e.g. "3 organisations need
    support" with the reason and which ones, or "EverGreen Access is your top
    performer" with why."""

    type: Literal["insight"] = "insight"
    tone: Literal["positive", "warning", "neutral"] = "neutral"
    title: str = Field(description="Short headline, e.g. 'Needs support' or 'Top performer'")
    body: str = Field(description="1-2 sentences: what, why, and which organisation(s)")
    org_names: list[str] = Field(default_factory=list)


class CompanyStatusItem(BaseModel):
    name: str
    tone: Literal["positive", "warning", "neutral"] = "neutral"
    headline: str = Field(
        description="One line: why this company is worth a look right now, e.g. "
        "'Only 2 months runway despite 2M+ people reached'"
    )
    detail: str = Field(
        default="", description="1-3 sentences shown when expanded: the fuller story and what to do"
    )
    metrics: dict[str, str] = Field(
        default_factory=dict,
        description="A few key label to value pairs shown when expanded, e.g. "
        '{"Revenue": "$172K", "Runway": "2 months", "Beneficiaries": "2.0M"}',
    )


class CompanyRosterBlock(BaseModel):
    """The primary view: a curated, scannable list of companies worth looking
    at right now, not all of them. Each row expands on click to show why."""

    type: Literal["company_roster"] = "company_roster"
    title: str
    companies: list[CompanyStatusItem]


class StatBlock(BaseModel):
    type: Literal["stat"] = "stat"
    label: str
    value: str
    caption: str = ""


class LeaderboardItem(BaseModel):
    name: str
    value: float
    note: str = ""


class LeaderboardBlock(BaseModel):
    type: Literal["leaderboard"] = "leaderboard"
    title: str
    higher_is_better: bool = True
    items: list[LeaderboardItem]


class TimeseriesPoint(BaseModel):
    date: str
    value: float


class TimeseriesBlock(BaseModel):
    type: Literal["timeseries"] = "timeseries"
    title: str
    series_label: str
    points: list[TimeseriesPoint]


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    title: str
    columns: list[str]
    rows: list[list[str]]


class MarkdownBlock(BaseModel):
    type: Literal["markdown"] = "markdown"
    content: str


Block = Annotated[
    Union[
        CompanyRosterBlock,
        InsightBlock,
        StatBlock,
        LeaderboardBlock,
        TimeseriesBlock,
        TableBlock,
        MarkdownBlock,
    ],
    Field(discriminator="type"),
]


class AnalysisResult(BaseModel):
    markdown: str = Field(
        description="A SHORT closing note, 1-3 sentences max. The substantive findings belong "
        "in blocks, not here. This is not a report."
    )
    blocks: list[Block] = Field(
        default_factory=list,
        description="Structured UI blocks, chosen to fit the finding: an actionable finding "
        "becomes an insight block, a ranking becomes a leaderboard, a trend becomes a "
        "timeseries, a headline number becomes a stat, tabular detail becomes a table.",
    )
