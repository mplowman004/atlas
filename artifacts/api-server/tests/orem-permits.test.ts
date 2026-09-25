import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  OREM_JANUARY_JULY_PDF_URL,
  OREM_JULY_PDF_URL,
  getOremReport,
  parseOremReports,
  type OremPdfDocument,
  type OremPdfPage,
} from "../src/services/orem-permits.ts";

const now = new Date("2026-07-31T00:00:00.000Z");
const pages = (count: number): OremPdfPage[] => Array.from({ length: count }, () => "");
const julyPages = pages(3);
const cumulativePages = pages(24);
julyPages[1] = [
  "7/16/2026  26-1244  Interior Finish (C)  Candoo Construction LLC  700 W 800 North  $110,457.54",
  "7/16/2026  26-1477  Interior Finish (C)  Dutson Builders  500 E Park Avenue  $654,946.70",
  "7/16/2026  26-1533  Interior Finish (C)  Design Build  1439 N 1380 West  $1,984,683.62",
  "7/16/2026  26-1658  Remodel (C)  Sheeran Construction  575 E University Pkwy A21  $15,573.18",
  "7/16/2026  26-0001  Addition  Builder  700 W 800 North  $10,000.00",
  "7/16/2026  26-0002  Single Family Dwelling (C)  Builder  500 E Park Avenue  $10,000.00",
  "8/01/2026  26-0003  New Commercial Building  Builder  500 E Park Avenue  $10,000.00",
  "7/32/2026  26-0006  New Commercial Building  Builder  500 E Park Avenue  $10,000.00",
].join("\n");
cumulativePages[21] = julyPages[1];
cumulativePages[0] = [
  "City of Orem",
  "Permit Statistics for January 2026",
  "Date     Permit # Permit Type  Builder  Site Address  Valuation",
  "2/01/2026  26-0004  New Commercial Building  Builder Feb  700 W 800 North  $20,000.00",
  "1/31/2026  26-0005  New Commercial Building  Builder Old  700 W 800 North  $30,000.00",
].join("\n");
cumulativePages[3] = "6/20/2026  26-0801  Remodel (C)  Builder June  700 W 800 North  $50,000.00";
const docs: OremPdfDocument[] = [
  { url: OREM_JULY_PDF_URL, pages: julyPages },
  { url: OREM_JANUARY_JULY_PDF_URL, pages: cumulativePages },
];

test("frozen official PDF text positions parse three July commercial permits", () => {
  // Coordinates and text were extracted from the city's published PDF page 2
  // and the cumulative PDF page 22. This runs even without downloaded PDFs.
  const rows = [
    { id: "26-1244", builder: "Candoo Construction LLC", address: "700 W 800 North",
      value: "$110,457.54", monthlyY: 589.06, cumulativeY: 338.93 },
    { id: "26-1477", builder: "Dutson Builders", address: "500 E Park Avenue",
      value: "$654,946.70", monthlyY: 569.38, cumulativeY: 313.25 },
    { id: "26-1533", builder: "Design Build", address: "1439 N 1380 West",
      value: "$1,984,683.62", monthlyY: 559.54, cumulativeY: 300.41 },
  ];
  const positioned = (cumulative: boolean): OremPdfPage => ({
    items: rows.flatMap(row => {
      const y = cumulative ? row.cumulativeY : row.monthlyY;
      const x = cumulative ? [55.32, 97.2, 145.94, 244.73, 382.15, 506.5]
        : [56.76, 92.28, 129.02, 210.14, 303.29, 409.99];
      return ["7/16/2026", row.id, "Interior Finish (C)", row.builder, row.address, row.value]
        .map((str, index) => ({ str, transform: [1, 0, 0, 1, x[index], y] }));
    }),
  });
  const monthly = pages(3);
  monthly[1] = positioned(false);
  const cumulative = pages(24);
  cumulative[21] = positioned(true);
  const result = parseOremReports([
    { url: OREM_JULY_PDF_URL, pages: monthly },
    { url: OREM_JANUARY_JULY_PDF_URL, pages: cumulative },
  ], new Date("2026-09-25T12:00:00.000Z"));
  assert.equal(result.totalValidatedSignals, 3);
  for (const row of rows) {
    const permit = result.permits.find(item => item.permitId === row.id);
    assert.ok(permit);
    assert.equal(permit.address, row.address);
    assert.equal(permit.valuation, Number(row.value.slice(1).replaceAll(",", "")));
    assert.equal(permit.product, "UNKNOWN");
    assert.deepEqual(permit.provenance.map(source => [source.url, source.page]), [
      [OREM_JULY_PDF_URL, 2],
      [OREM_JANUARY_JULY_PDF_URL, 22],
    ]);
  }
});

test("July signals deduplicate idempotently across both official reports", () => {
  const report = parseOremReports(docs, now);
  const repeated = parseOremReports(docs, now);
  assert.deepEqual(report.permits, repeated.permits);
  assert.deepEqual(report.permits.map(permit => permit.permitId), [
    "26-0004", "26-0801", "26-1244", "26-1477", "26-1533", "26-1658",
  ]);
  assert.equal(report.totalValidatedSignals, 6);
  assert.equal(report.permits.find(permit => permit.permitId === "26-0004")?.score, 0.65);
  assert.equal(report.permits.find(permit => permit.permitId === "26-0801")?.score, 0.65);
  assert.deepEqual(report.permits[0].provenance, [{
    url: OREM_JANUARY_JULY_PDF_URL,
    page: 1,
    row: 1,
  }]);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0005"), false);
  assert.deepEqual(report.permits[0].provenance.map(source => [source.url, source.page]), [
    [OREM_JANUARY_JULY_PDF_URL, 1],
  ]);
});

test("groups normalized Orem addresses without product inference", () => {
  const similarAddresses: OremPdfDocument[] = [
    { url: OREM_JULY_PDF_URL, pages: [
      "7/16/2026  26-1001  Interior Finish (C)  Builder One  700 W 800 North  $100,000.00\n7/16/2026  26-1002  Remodel (C)  Builder Two  700 W 800 NORTH  $50,000.00",
      "",
      "",
    ] },
    { url: OREM_JANUARY_JULY_PDF_URL, pages: [
      "6/20/2026  26-1003  Remodel (C)  Builder Three  700 W 800 North  $25,000.00",
      ...pages(20),
      "7/16/2026  26-1001  Interior Finish (C)  Builder One  700 W 800 North  $100,000.00\n7/16/2026  26-1002  Remodel (C)  Builder Two  700 W 800 NORTH  $50,000.00",
      ...pages(2),
    ] },
  ];
  const report = parseOremReports(similarAddresses, now);
  assert.equal(report.groupCount, 1);
  assert.equal(report.groups[0].permitCount, 3);
  assert.equal(report.groups[0].totalValuation, 175_000);
  assert.ok(report.permits.every(permit => permit.product === "UNKNOWN"));
});

test("rejects unapproved sources, mismatched reports, and future or unclassified records", () => {
  assert.throws(() => parseOremReports([
    { ...docs[0], url: "https://example.invalid/report.pdf" },
    docs[1],
  ], now), /Unapproved/);
  const report = parseOremReports(docs, new Date("2026-07-16T00:00:00.000Z"));
  assert.ok(report.permits.every(permit => permit.date <= "2026-07-16"));
  assert.ok(report.permits.every(permit => permit.classification === "COMMERCIAL"));
  assert.equal(report.permits.some(permit => permit.permitId === "26-0001"), false);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0002"), false);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0003"), false);
});

test("recency includes the 180-day boundary and rejects older signals", () => {
  const report = parseOremReports(docs, now);
  const permit = report.permits[0];
  assert.equal(permit.date, "2026-02-01");
  assert.equal(permit.score, 0.65);
  assert.equal(permit.evidenceStrength, "MODERATE");
  assert.equal(report.permits.find(candidate => candidate.permitId === "26-1244")?.score, 0.9);
  assert.match(report.scoringNote, /not a borrowing-probability/i);
  assert.equal(report.reportThrough, "2026-07-31");
  assert.equal(report.freshness, "Monthly report; not real-time");
});

async function extractPdf(path: string, url: string): Promise<OremPdfDocument> {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
  }).promise;
  const extracted: OremPdfPage[] = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
    const content = await (await document.getPage(pageNo)).getTextContent();
    extracted.push({
      items: content.items.flatMap(item => {
        if (!("str" in item) || !("transform" in item)) return [];
        return [{ str: item.str, transform: item.transform }];
      }),
    });
  }
  return { url, pages: extracted };
}

test("QA: named July permits agree in the official monthly and cumulative PDFs", {
  skip: !existsSync("/tmp/orem-july-2026.pdf") || !existsSync("/tmp/orem-jan-july-2026.pdf"),
}, async () => {
  const realDocs = await Promise.all([
    extractPdf("/tmp/orem-july-2026.pdf", OREM_JULY_PDF_URL),
    extractPdf("/tmp/orem-jan-july-2026.pdf", OREM_JANUARY_JULY_PDF_URL),
  ]);
  const report = parseOremReports(realDocs, now);
  const expected = [
    ["26-1244", "700 W 800 North", 110457.54],
    ["26-1477", "500 E Park Avenue", 654946.7],
    ["26-1533", "1439 N 1380 West", 1984683.62],
  ] as const;
  for (const [id, address, valuation] of expected) {
    const permit = report.permits.find(candidate => candidate.permitId === id);
    assert.ok(permit, `Missing expected permit ${id}`);
    assert.equal(permit.address, address);
    assert.equal(permit.valuation, valuation);
    assert.equal(permit.date, "2026-07-16");
    assert.equal(permit.permitType, "Interior Finish (C)");
    assert.deepEqual(permit.provenance.map(source => source.page), [2, 22]);
    const expectedRows: Record<string, number[]> = {
      "26-1244": [7, 24],
      "26-1477": [9, 26],
      "26-1533": [10, 27],
    };
    assert.deepEqual(permit.provenance.map(source => source.row), expectedRows[id]);
    assert.deepEqual(permit.provenance.map(source => source.url), [
      OREM_JULY_PDF_URL,
      OREM_JANUARY_JULY_PDF_URL,
    ]);
  }
});

test("fetch uses only the two approved URLs with GET and validates PDF responses", {
  skip: !existsSync("/tmp/orem-july-2026.pdf") || !existsSync("/tmp/orem-jan-july-2026.pdf"),
}, async () => {
  const originalFetch = globalThis.fetch;
  const requested: Array<{ url: string; method?: string }> = [];
  const contents = new Map([
    [OREM_JULY_PDF_URL, readFileSync("/tmp/orem-july-2026.pdf")],
    [OREM_JANUARY_JULY_PDF_URL, readFileSync("/tmp/orem-jan-july-2026.pdf")],
  ]);
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requested.push({ url, method: init?.method });
    const bytes = contents.get(url);
    if (!bytes) return new Response("not found", { status: 404 });
    return new Response(bytes, { headers: { "content-type": "application/pdf" } });
  }) as typeof fetch;
  try {
    const report = await getOremReport(now);
    assert.ok(report.totalValidatedSignals >= 3);
    assert.ok(report.permits.some(permit => permit.permitId === "26-1244"));
    assert.deepEqual(requested.map(request => request.url).sort(), [...contents.keys()].sort());
    assert.ok(requested.every(request => request.method === "GET"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});