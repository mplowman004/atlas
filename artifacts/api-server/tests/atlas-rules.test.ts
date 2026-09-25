import assert from "node:assert/strict";
import test from "node:test";
import { classifyProduct, isCurrentPermit, scoreVerifiedSignal, shouldReplaceAnchor, PROMOTION_THRESHOLD } from "../src/services/atlas-rules.ts";
import { sourceStatusFromRuns } from "../src/services/source-status.ts";

const now = new Date("2026-09-24T12:00:00Z");
test("historical, missing and future permits cannot be current", () => {
  assert.equal(isCurrentPermit(new Date("2020-09-01T00:00:00Z"), now), false);
  assert.equal(isCurrentPermit(null, now), false);
  assert.equal(isCurrentPermit(new Date("2026-09-25T00:00:00Z"), now), false);
  assert.equal(isCurrentPermit(new Date("2026-09-20T00:00:00Z"), now), true);
});

test("score reflects verified fit signals, not an inferred loan product", () => {
  const parcel = { PROP_TYPE_DESCR: "COMMERCIAL", MKT_CUR_VALUE: 1_000_000 };
  const bare = scoreVerifiedSignal({}, parcel, false);
  const corroborated = scoreVerifiedSignal({ PERMITAMOUNT: 200_000 }, parcel, true);
  assert.equal(bare, 0.82);
  assert.ok(corroborated >= PROMOTION_THRESHOLD);
  assert.ok(corroborated > bare);
  assert.equal(classifyProduct({ PERMITTYPE: "NEW", PERMITAMOUNT: 200_000 }), "UNKNOWN");
});

test("generic construction or manufacturing descriptions do not imply debt product", () => {
  assert.equal(classifyProduct({ PERMITTYPE: "NEW", PERMITREASON: "manufacturing addition" }), "UNKNOWN");
  assert.equal(classifyProduct({ PERMITREASON: "equipment installation" }), "UNKNOWN");
  assert.equal(classifyProduct({ PERMITREASONDETAIL: "refinance existing mortgage" }), "REFINANCE");
  assert.equal(classifyProduct({ PERMITUSE: "equipment financing" }), "EQUIPMENT");
});

test("older supporting permits cannot replace the newest property anchor", () => {
  const newest = new Date("2026-09-20T00:00:00Z");
  const older = new Date("2026-08-20T00:00:00Z");
  assert.equal(shouldReplaceAnchor(newest, older), false);
  assert.equal(shouldReplaceAnchor(older, newest), true);
  assert.equal(shouldReplaceAnchor(null, newest), true);
});

test("failed source attempts are unavailable and never look current", () => {
  const permitSource =
    "https://maps200.utahcounty.gov/arcgis/rest/services/Assessor/Building_Permits/MapServer/1";
  const status = sourceStatusFromRuns([
    {
      startedAt: new Date("2026-09-25T12:00:00Z"),
      finishedAt: new Date("2026-09-25T12:00:01Z"),
      notes: "SOURCE_FAILED: Utah County source HTTP 401",
    },
    {
      startedAt: new Date("2026-09-24T12:00:00Z"),
      finishedAt: new Date("2026-09-24T12:01:00Z"),
      notes: `Official Utah County sources only. Permit: ${permitSource}; source freshness pass; 180-day gate.`,
    },
  ], permitSource);
  assert.equal(status.state, "UNAVAILABLE");
  assert.equal(status.message, "Utah County source HTTP 401");
  assert.equal(status.lastSuccessAt, "2026-09-24T12:01:00.000Z");
});

test("a successful run must confirm freshness for the configured permit table", () => {
  const permitSource =
    "https://maps200.utahcounty.gov/arcgis/rest/services/Assessor/Building_Permits/MapServer/1";
  const status = sourceStatusFromRuns([
    {
      startedAt: new Date("2026-09-24T16:13:00Z"),
      finishedAt: new Date("2026-09-24T16:13:06Z"),
      notes: "Official Utah County sources only. Permit: https://maps200.utahcounty.gov/arcgis/rest/services/Assessor/Building_Permits_Recent/MapServer/0",
    },
  ], permitSource);
  assert.equal(status.state, "STALE");
  assert.match(status.message ?? "", /October 22, 2020/);
  assert.match(status.message ?? "", /zero permits since March 29, 2026/);
  assert.equal(status.lastSuccessAt, null);
});

test("an empty recent official permit set is stale rather than a network outage", () => {
  const permitSource =
    "https://maps200.utahcounty.gov/arcgis/rest/services/Assessor/Building_Permits/MapServer/1";
  const status = sourceStatusFromRuns([
    {
      startedAt: new Date("2026-09-25T12:00:00Z"),
      finishedAt: new Date("2026-09-25T12:00:01Z"),
      notes: "SOURCE_FAILED: Utah County source returned no current commercial permits; freshness requires review",
    },
  ], permitSource);
  assert.equal(status.state, "STALE");
  assert.match(status.message ?? "", /no current commercial permits/);
});
