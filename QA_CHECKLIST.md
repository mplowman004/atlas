# Acceptance tests

## Data integrity
- [ ] Existing database backed up; schema migrations reversible.
- [ ] Historical records preserved and existing features still work.
- [ ] Event dates distinguish 2020 permits from 2026 activity.
- [ ] Multiple permits for same property are grouped without erasing distinct businesses.
- [ ] Repeated ingestion is idempotent.

## Lead quality
- [ ] At least 20 sampled Utah County leads manually checked against source links.
- [ ] Each lead has a real business identity, location, source and freshness status.
- [ ] Missing phone, email, owner, revenue, credit or cash flow explicitly marked unknown.
- [ ] No invented contacts, emails, funding needs or credit scores.
- [ ] Product recommendation and scoring rationale visible and evidence-backed.

## Workflow
- [ ] Daily queue filters by county, product, score and verification.
- [ ] Operator can review, accept/reject, edit, set next action and export/use CRM.
- [ ] Dry-run and safe scheduling work; job retries, error logging and rate limits tested.
- [ ] Zero-result day shows truthful zero, not fabricated prospects.
- [ ] Duplicate creation and stale data regression tests pass.

## Compliance and delivery
- [ ] Data collection and contact workflows reviewed for applicable terms and legal requirements.
- [ ] Secrets not exposed; sensitive data secured; opt-out/consent controls where outreach exists.
- [ ] README documents setup, environment variables, testing, known blockers and deployment.
- [ ] Working demo and test evidence provided before claiming production readiness.
