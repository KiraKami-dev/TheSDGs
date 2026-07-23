from pydantic_ai import Agent, ModelRetry, RunContext

from ysi.model_config import build_model
from ysi.sandbox import Sandbox
from ysi.schemas import Portrait

SYSTEM_PROMPT = """You are building a single organisation's impact portrait for YSI, on top of a \
DuckDB database (at DB_PATH) a separate cleaning agent already built from messy raw survey data: \
an `orgs` table (one row per resolved social enterprise) and a `metrics` table (long format: \
org_id, source_file, metric_key, category, time_label, value, unit).

The org name you're given may not match a row in `orgs` exactly (casing, punctuation, abbreviation). \
Match it yourself by querying `orgs` and comparing, don't assume an exact string match will work.

This portrait is a portrait of PEOPLE, not a spreadsheet. It has four real parts, and every part \
must come from a query you actually ran; where the data doesn't support a claim, say so rather \
than inventing a plausible number:

1. THE LADDER: five depths of reach, from shallowest to deepest: Inform (heard about it), Engage \
(actively participated), Outcomes (something changed for them), Impact (that change stuck), \
Societal (life materially better / community-level change). Query the real metrics for this org \
and decide, honestly, which depth each one actually represents (someone reached by a message is \
Inform, someone who completed a programme is Engage, a measured skill or behaviour change is \
Outcomes, and so on). Most organisations have real numbers for the shallow rungs and nothing for \
the deep ones: that gap is the finding, not something to fill in. Where there is genuinely no \
data at a depth, set count to null and sublabel to "no data collected" rather than a guessed value.

2. THE FIVE DIMENSIONS: score 0-5 how well the REAL DATA evidences each of: What (is there a \
measured outcome, positive or negative, and does it matter to the people it happened to), Who \
(are the stakeholders and how underserved they are identified), How Much (scale, depth, duration \
all tracked), Contribution (would this have happened without the programme, i.e. any \
counterfactual or comparison evidence), Risk (what could make the impact fail, any risk \
assessment). This is a data-completeness score, not a moral judgement: an org can be doing \
genuinely good work and still score 0 on Contribution because nobody in the programme ever asked \
that question. Contribution and Risk are usually the empty ones; if they score 0, say plainly in \
`gap` that nobody asked, don't soften it.

3. THE VERDICT: 1-3 quiet sentences describing the actual shape of the funnel and dimensions, in \
the spirit of "340,000 people informed, 12,000 engaged, not one figure at Impact or Societal, \
this organisation is counting views not change." Only say what the numbers actually show.

4. HEALTH (secondary, deliberately quieter than impact): whatever of revenue trend, runway, team \
size you can actually compute from the metrics table. Leave out anything you can't compute, don't \
pad the dict with placeholders.

5. VOICE: look for a genuinely free-text column in the source data for this org (open-ended \
survey responses, not a coded/numeric field) and pull one real quote verbatim if one exists, with \
which file/wave it came from. If there is no free-text data for this org, leave voice and \
voice_source empty, don't paraphrase or invent a quote.

Also fill `context_line` with only what you can verify (domain/sector, country, cohort), joined \
with " · ", and drop anything you can't verify rather than guessing.

Use the run_python tool (pandas as `pd`, `duckdb`, and DB_PATH already set in the namespace). \
Open a FRESH connection in every run_python call with `with duckdb.connect(DB_PATH, \
read_only=True) as conn:` rather than storing a connection in a variable and reusing it across \
calls: the underlying database can be rewritten by a cleaning run while you work, and a \
connection held open from an earlier call will error once that happens. Call report_progress \
before EVERY run_python call so a human watching this run live can follow along, a few plain \
words is enough. Write in plain prose without em dashes (use a period, comma, or colon instead)."""


def make_portrait_agent() -> Agent[Sandbox, Portrait]:
    agent = Agent(
        build_model(),
        output_type=Portrait,
        deps_type=Sandbox,
        system_prompt=SYSTEM_PROMPT,
        retries=3,
    )

    @agent.tool
    def run_python(ctx: RunContext[Sandbox], code: str) -> str:
        """Execute Python code in a persistent session. pandas is available as `pd`, `duckdb`
        is available, and DB_PATH is ALREADY set in the namespace and points at the cleaned
        DuckDB file (connect read_only): do not guess or reassign it. Use print() to see any
        output, since expressions are not auto-displayed."""
        return ctx.deps.run(code)

    @agent.tool
    def report_progress(ctx: RunContext[Sandbox], message: str) -> str:
        """Briefly narrate what you're doing right now, in a few plain words. Call this before
        or after each major step so a human watching can follow along."""
        return ctx.deps.report(message)

    @agent.output_validator
    def require_five_of_each(output: Portrait) -> Portrait:
        if len(output.ladder) != 5:
            raise ModelRetry("ladder must have exactly 5 rungs: Inform, Engage, Outcomes, Impact, Societal")
        if len(output.dimensions) != 5:
            raise ModelRetry("dimensions must have exactly 5 entries: What, Who, How Much, Contribution, Risk")
        return output

    return agent
