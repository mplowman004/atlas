# Atlas Lending Intelligence — Claude Code instructions

## Mission
Complete the existing Atlas Lending Dashboard into a Utah-first, evidence-based commercial lending prospecting engine. Work in the existing repository; do not rebuild from scratch.

## First actions
1. Inspect repository structure, README, package scripts, tests, database schema, ingestion endpoints, background jobs, and deployment configuration.
2. Run existing tests and document baseline failures.
3. Read all documents in this handoff package and compare assumptions against actual code.
4. Write a concise implementation plan with dependencies and a checklist; then implement the highest-impact safe vertical slice.
5. Report verified progress, blockers, and next steps. Do not claim features are working without tests.

## Non-negotiable safeguards
- Preserve existing data and functionality. Back up before migrations; use reversible migrations and never perform destructive data cleanup without approval.
- Do not commit secrets, credentials, or customer nonpublic financial information.
- Use permitted data sources, obey terms and rate limits, and record source URL and retrieval date.
- Never invent business contacts, email addresses, revenue, financing needs, or creditworthiness.
- Distinguish observed signals, third-party estimates, and verified borrower-provided facts.
- A lead score is sales prioritization, not a credit decision.
- Human review before outreach. Follow consent, opt-out, privacy, fair-lending and applicable lending/marketing requirements.
- If requirements conflict with current implementation, flag the conflict and choose the least destructive option.

## Definition of done
A working, tested daily lead-research workflow that surfaces sourced, deduplicated, contactable Utah business prospects with explainable scoring, useful financing-product hypotheses, and CRM next actions. See QA_CHECKLIST.md.
