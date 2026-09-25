import assert from "node:assert/strict";
import test from "node:test";
import { fetchRecentPermits } from "../src/services/utah-county.ts";

test("county table query uses its published fields and returns the newest permits", async () => {
  const original = globalThis.fetch;
  const now = Date.now();
  const requests: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.searchParams.get("returnCountOnly") === "true")
      return Response.json({ count: 3 });
    return Response.json({ features: [
      { attributes: { ESRI_OID: 10, PERMITDATE: now - 8 * 86_400_000 } },
      { attributes: { ESRI_OID: 12, PERMITDATE: now - 2 * 86_400_000 } },
      { attributes: { ESRI_OID: 11, PERMITDATE: now - 2 * 86_400_000 } },
    ] });
  }) as typeof fetch;
  try {
    const permits = await fetchRecentPermits(2);
    assert.deepEqual(permits.map(p => p.attributes.ESRI_OID), [12, 11]);
    assert.equal(requests.length, 2);
    for (const url of requests) {
      assert.match(url.pathname, /Building_Permits\/MapServer\/1\/query$/);
      assert.match(url.searchParams.get("where") ?? "", /PERMITDATE >= DATE/);
    }
    const fields = requests[1].searchParams.get("outFields") ?? "";
    assert.match(fields, /ESRI_OID,PERMITNO/);
    assert.match(fields, /PERMITREASONDETAIL/);
    assert.doesNotMatch(fields, /OBJECTID_1/);
    assert.equal(requests[1].searchParams.get("orderByFields"), "PERMITDATE DESC, ESRI_OID DESC");
  } finally {
    globalThis.fetch = original;
  }
});
