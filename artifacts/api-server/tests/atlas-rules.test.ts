import assert from "node:assert/strict";
import test from "node:test";
import { classifyProduct, isCurrentPermit, scoreVerifiedSignal, PROMOTION_THRESHOLD } from "../src/services/atlas-rules.ts";

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
