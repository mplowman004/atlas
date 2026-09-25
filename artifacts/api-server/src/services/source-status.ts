export type SourceRunLike = {
  startedAt: Date;
  finishedAt: Date | null;
  notes: string | null;
};

export type SourceStatus = {
  state: "CURRENT" | "STALE" | "UNAVAILABLE" | "NEVER";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  message: string | null;
};

const STALE_SOURCE_DIAGNOSTIC =
  "The Utah County permit table is stale: its newest non-future records were dated October 22, 2020, and it returned zero permits since March 29, 2026.";

function failureMessage(notes: string | null) {
  if (!notes?.startsWith("SOURCE_FAILED:")) return null;
  return notes.slice("SOURCE_FAILED:".length).trim() || "Official source request failed";
}

function confirmsFreshness(run: SourceRunLike, expectedPermitSourceUrl: string) {
  return Boolean(
    run.notes?.includes(expectedPermitSourceUrl) &&
      /source freshness pass/i.test(run.notes) &&
      !failureMessage(run.notes),
  );
}

function isEmptyFreshSourceFailure(message: string) {
  return /no current commercial permits|no current permits|freshness requires review/i.test(
    message,
  );
}

export function sourceStatusFromRuns(
  runs: SourceRunLike[],
  expectedPermitSourceUrl: string,
): SourceStatus {
  const latest = runs[0];
  if (!latest) {
    return {
      state: "NEVER",
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: "No Utah County source run has established freshness.",
    };
  }

  const error = failureMessage(latest.notes);
  const lastSuccess = runs.find((run) =>
    confirmsFreshness(run, expectedPermitSourceUrl),
  );
  const lastSuccessAt = lastSuccess?.finishedAt?.toISOString() ?? null;

  if (error) {
    return {
      state: isEmptyFreshSourceFailure(error) ? "STALE" : "UNAVAILABLE",
      lastAttemptAt: latest.startedAt.toISOString(),
      lastSuccessAt,
      message: error,
    };
  }

  const hasFreshnessFailure =
    latest.notes?.toLowerCase().includes("source freshness failed") ?? false;
  const isStale =
    hasFreshnessFailure || !confirmsFreshness(latest, expectedPermitSourceUrl);
  return {
    state: isStale ? "STALE" : "CURRENT",
    lastAttemptAt: latest.startedAt.toISOString(),
    lastSuccessAt,
    message: !isStale
      ? null
      : hasFreshnessFailure
        ? "The official source did not provide a current permit set."
        : STALE_SOURCE_DIAGNOSTIC,
  };
}