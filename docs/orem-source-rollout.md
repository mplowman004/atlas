# City of Orem permit-source rollout and safe migration

## Present state

The Orem source is a **read-only PDF-backed report**. Its API retrieves the city's
fixed July monthly and January–July 2026 reports, verifies their identity and
matching July records, and returns deduplicated commercial permit signals grouped
by normalized Orem site address. It does not call Atlas ingestion, write to the
database, change schemas, or add Orem results to the lending queue. The existing
Utah County GIS source and its stale status remain separate. The PDF covers Orem
only and does not establish activity after July 31, 2026; the city source page
may link newer reports.

## Before any future persistent ingest or migration

1. Obtain explicit authorization for an Orem persistence run and confirm the
   desired report window, permit semantics, city coverage and permitted use.
   In particular, publication in the report does not itself verify ownership,
   financing need, or a loan product.
2. Take a complete, consistent backup of the existing database using the
   approved database backup process. Keep the backup **outside the repository**,
   verify its integrity and demonstrate a restore in an isolated environment.
   Record pre-migration row counts and identifiers for Atlas permits, properties,
   opportunities, source runs and signals. Do not delete or rewrite existing
   rows before this is complete.
3. Prepare an **additive** migration with an explicit city source identifier
   and a unique `(source, permit number)` key. Do not reuse the county source
   URL, county object IDs, or assume an Orem address is an exact county parcel
   match. Store the original PDF URL, page and row per signal; keep dated source
   snapshots distinct from current-source health.
4. Test the migration and an ingest with promotion **disabled** against the
   restored copy. Repeat the same run to prove idempotency, verify grouped
   address counts, noncommercial/future-date exclusions and unchanged legacy
   records, and inspect differences before approving any live write.
5. If a live migration is authorized, run it in a controlled window with
   monitored pre/post counts and a documented rollback using the tested backup.
   A separately approved promotion policy must first verify parcel identity,
   source freshness and score semantics; an Orem PDF alone is not sufficient
   to create a call-ready lending opportunity.

No database backup or migration was performed by the read-only rollout.