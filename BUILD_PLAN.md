# Implementation backlog — ordered

## P0: Audit and protect
- Map app architecture, deployed environment, DB schema, existing endpoints, current jobs, providers, permissions and secrets management.
- Baseline tests, backup strategy, migration rollback plan, error logging.
- Identify and fix stale permit timestamp classification; inspect property-level consolidation.

## P1: Complete first end-to-end slice
- Ingest current Utah County signals with source URL, event date, retrieval date, original source ID, and business/property IDs.
- Deduplicate by stable source IDs and business/property association without collapsing unrelated businesses.
- Enrich a small sample with lawful business phone/site and verifiable decision maker; label unknown fields.
- Compute explainable conservative lead score and product hypothesis.
- Display in daily review queue with source evidence, freshness, CRM status and next action.
- Manually review at least 20 real records for accuracy; document failure cases.

## P2: Reliable scheduled operation
- Add configurable daily run target (default 25), dry-run, idempotency, rate limits, retries, audit log, error summaries, and no-data behavior.
- Add configurable score threshold (default 80), county/product filters, and operator approval workflow.
- Add CSV export or existing CRM integration without duplicate creation.

## P3: Scale and optimize
- Extend to Salt Lake, Davis, Weber, Washington and other Utah counties as source availability permits.
- Add additional lawful public business and real estate signals.
- Add quality dashboard, feedback loop and source-level yield tracking.
- Tune score based on verified user feedback, not inferred loan approvals.

## Delivery protocol
After each milestone: list changed functionality, tests run/results, real sample records reviewed, unresolved data/API blockers, risks, and next steps. Do not deploy or incur new paid API charges without approval.
