# Data sources and evidence standards

## Investigate first
- Existing Utah County ArcGIS building-permit integration and its date semantics.
- Existing atlas_permits / atlas_properties tables and ingestion API, if present.
- Official city/county building and planning records, assessor/property records, recorder transactions, state business registration, public company websites, professional directories with permitted access, public expansion announcements, and commercial property listings where licensed.
- Existing enrichment provider integration; inspect terms, credits and verified contact availability before use.

## Source record requirements
Record source name, canonical URL, original record ID, retrieval timestamp, event/filing date, last source update when available, business/property matching confidence, and exact observed signal.

## Contact standards
- Business phone and company website must be verified against a cited source.
- Named decision maker requires supporting evidence and recency.
- Professional email must be obtained through lawful permitted means and marked verified/unverified; do not guess email patterns and present them as verified.
- Revenue estimates must be labeled as estimates with source, never treated as financial statements.

## Quality controls
Reject stale-as-current events, duplicate permit spam, unsupported business/property matches, dead websites, wrong geographies, and records without a source. Preserve raw data and quarantine questionable records for review.
