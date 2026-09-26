import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  OREM_JANUARY_AUGUST_PDF_URL,
  OREM_AUGUST_PDF_URL,
  getOremReport,
  parseOremReports,
  type OremPdfDocument,
  type OremPdfPage,
} from "../src/services/orem-permits.ts";

const now = new Date("2026-09-25T00:00:00.000Z");
const pages = (count: number): OremPdfPage[] => Array.from({ length: count }, () => "");
const augustPages = pages(5);
const cumulativePages = pages(28);
augustPages[0] = [
  "8/31/2026  26-2312  ReRoof (C)  Arreola roofing llc  665 N State Street  $4,500.00",
  "8/24/2026  26-2170  Remodel (C)  The Whiting-Turner  965 N 1430 West  $200,987.95",
  "8/24/2026  26-0001  Addition  Builder  665 N State Street  $10,000.00",
  "8/24/2026  26-0002  Single Family Dwelling (C)  Builder  665 N State Street  $10,000.00",
  "9/01/2026  26-0003  New Commercial Building  Builder  665 N State Street  $10,000.00",
  "8/32/2026  26-0006  New Commercial Building  Builder  665 N State Street  $10,000.00",
].join("\n");
augustPages[2] = "8/12/2026  26-2029  Remodel (C)  Johansen Interiors  575 E University Pkwy  $273,731.70";
cumulativePages[8] = [
  "3/29/2026  26-0301  New Commercial Building  Builder March  665 N State Street  $20,000.00",
  "3/28/2026  26-0302  New Commercial Building  Builder Old  665 N State Street  $30,000.00",
].join("\n");
cumulativePages[19] = "6/20/2026  26-0801  Remodel (C)  Builder June  665 N State Street  $50,000.00";
cumulativePages[21] = "7/16/2026  26-1244  Interior Finish (C)  Candoo Construction LLC  700 W 800 North  $110,457.54";
cumulativePages[24] = augustPages[0];
cumulativePages[26] = augustPages[2];
const docs: OremPdfDocument[] = [
  { url: OREM_AUGUST_PDF_URL, pages: augustPages },
  { url: OREM_JANUARY_AUGUST_PDF_URL, pages: cumulativePages },
];

test("frozen official PDF text positions parse three August commercial permits", () => {
  // Coordinates and text were extracted from the city's August PDF pages 1/3
  // and cumulative pages 25/27. This runs even without downloaded PDFs.
  const rows = [
    { id: "26-2312", date: "8/31/2026", type: "ReRoof (C)", builder: "Arreola roofing llc",
      address: "665 N State Street", value: "$4,500.00", monthlyY: 640.18, cumulativeY: 634.30,
      monthlyPage: 1, cumulativePage: 25 },
    { id: "26-2170", date: "8/24/2026", type: "Remodel (C)", builder: "The Whiting-Turner",
      address: "965 N 1430 West", value: "$200,987.95", monthlyY: 195.14, cumulativeY: 171.98,
      monthlyPage: 1, cumulativePage: 25 },
    { id: "26-2029", date: "8/12/2026", type: "Remodel (C)", builder: "Johansen Interiors",
      address: "575 E University Pkwy", value: "$273,731.70", monthlyY: 652.54, cumulativeY: 595.78,
      monthlyPage: 3, cumulativePage: 27 },
  ];
  const positioned = (cumulative: boolean, page: number): OremPdfPage => ({
    items: rows.filter(row => (cumulative ? row.cumulativePage : row.monthlyPage) === page)
      .flatMap(row => {
        const y = cumulative ? row.cumulativeY : row.monthlyY;
        const x = cumulative ? [55.32, 97.2, 145.94, 244.73, 382.15, 506.5]
          : [58.44, 102.6, 148.58, 260.21, 392.47, 507.7];
        return [row.date, row.id, row.type, row.builder, row.address, row.value]
          .map((str, index) => ({ str, transform: [1, 0, 0, 1, x[index], y] }));
      }),
  });
  const monthly = pages(5);
  monthly[0] = positioned(false, 1);
  monthly[2] = positioned(false, 3);
  const cumulative = pages(28);
  cumulative[24] = positioned(true, 25);
  cumulative[26] = positioned(true, 27);
  const result = parseOremReports([
    { url: OREM_AUGUST_PDF_URL, pages: monthly },
    { url: OREM_JANUARY_AUGUST_PDF_URL, pages: cumulative },
  ], new Date("2026-09-25T12:00:00.000Z"));
  assert.equal(result.totalValidatedSignals, 3);
  for (const row of rows) {
    const permit = result.permits.find(item => item.permitId === row.id);
    assert.ok(permit);
    assert.equal(permit.address, row.address);
    assert.equal(permit.valuation, Number(row.value.slice(1).replaceAll(",", "")));
    assert.equal(permit.product, "UNKNOWN");
    assert.deepEqual(permit.provenance.map(source => [source.url, source.page]), [
      [OREM_AUGUST_PDF_URL, row.monthlyPage],
      [OREM_JANUARY_AUGUST_PDF_URL, row.cumulativePage],
    ]);
  }
});

test("August signals deduplicate across both reports while older records remain cumulative-only", () => {
  const report = parseOremReports(docs, now);
  const repeated = parseOremReports(docs, now);
  assert.deepEqual(report.permits, repeated.permits);
  assert.deepEqual(report.permits.map(permit => permit.permitId), [
    "26-0301", "26-0801", "26-1244", "26-2029", "26-2170", "26-2312",
  ]);
  assert.equal(report.totalValidatedSignals, 6);
  assert.equal(report.permits.find(permit => permit.permitId === "26-0301")?.score, 0.65);
  assert.equal(report.permits.find(permit => permit.permitId === "26-0801")?.score, 0.65);
  assert.deepEqual(report.permits[0].provenance, [{
    url: OREM_JANUARY_AUGUST_PDF_URL,
    page: 9,
    row: 1,
  }]);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0302"), false);
  assert.deepEqual(report.permits.find(permit => permit.permitId === "26-1244")?.provenance.map(source => [source.url, source.page]), [
    [OREM_JANUARY_AUGUST_PDF_URL, 22],
  ]);
  assert.equal(report.permits.find(permit => permit.permitId === "26-2312")?.score, 0.9);
});

test("groups normalized Orem addresses without product inference", () => {
  const similarAddresses: OremPdfDocument[] = [
    { url: OREM_AUGUST_PDF_URL, pages: [
      "8/16/2026  26-1001  Interior Finish (C)  Builder One  700 W 800 North  $100,000.00\n8/16/2026  26-1002  Remodel (C)  Builder Two  700 W 800 NORTH  $50,000.00",
      ...pages(4),
    ] },
    { url: OREM_JANUARY_AUGUST_PDF_URL, pages: [
      ...pages(19),
      "6/20/2026  26-1003  Remodel (C)  Builder Three  700 W 800 North  $25,000.00",
      ...pages(4),
      "8/16/2026  26-1001  Interior Finish (C)  Builder One  700 W 800 North  $100,000.00\n8/16/2026  26-1002  Remodel (C)  Builder Two  700 W 800 NORTH  $50,000.00",
      ...pages(3),
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
  const changedCumulative = cumulativePages.slice();
  changedCumulative[24] = String(changedCumulative[24]).replace("$200,987.95", "$200,987.96");
  assert.throws(() => parseOremReports([
    docs[0], { url: OREM_JANUARY_AUGUST_PDF_URL, pages: changedCumulative },
  ], now), /disagree/);
  const report = parseOremReports(docs, new Date("2026-08-20T00:00:00.000Z"));
  assert.ok(report.permits.every(permit => permit.date <= "2026-08-20"));
  assert.ok(report.permits.every(permit => permit.classification === "COMMERCIAL"));
  assert.equal(report.permits.some(permit => permit.permitId === "26-0001"), false);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0002"), false);
  assert.equal(report.permits.some(permit => permit.permitId === "26-0003"), false);
  assert.throws(() => parseOremReports([
    { url: OREM_AUGUST_PDF_URL, pages: pages(4) }, docs[1],
  ], now), /exactly 5 pages/);
  const olderOnly = cumulativePages.slice();
  olderOnly[24] = "";
  olderOnly[26] = "";
  assert.throws(() => parseOremReports([
    { url: OREM_AUGUST_PDF_URL, pages: pages(5) },
    { url: OREM_JANUARY_AUGUST_PDF_URL, pages: olderOnly },
  ], now), /no validated commercial permits/);
});

test("recency includes the 180-day boundary and rejects older signals", () => {
  const report = parseOremReports(docs, now);
  const permit = report.permits[0];
  assert.equal(permit.date, "2026-03-29");
  assert.equal(permit.score, 0.65);
  assert.equal(permit.evidenceStrength, "MODERATE");
  assert.equal(report.permits.find(candidate => candidate.permitId === "26-2312")?.score, 0.9);
  assert.equal(report.permits.find(candidate => candidate.permitId === "26-1244")?.score, 0.65);
  assert.match(report.scoringNote, /not a borrowing-probability/i);
  assert.equal(report.reportThrough, "2026-08-31");
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

test("QA: named August permits agree in the official monthly and cumulative PDFs", {
  skip: !existsSync("/tmp/orem-august-2026.pdf") || !existsSync("/tmp/orem-jan-aug-2026.pdf"),
}, async () => {
  const realDocs = await Promise.all([
    extractPdf("/tmp/orem-august-2026.pdf", OREM_AUGUST_PDF_URL),
    extractPdf("/tmp/orem-jan-aug-2026.pdf", OREM_JANUARY_AUGUST_PDF_URL),
  ]);
  const report = parseOremReports(realDocs, now);
  const expected = [
    { id: "26-2312", date: "2026-08-31", address: "665 N State Street", valuation: 4500,
      type: "ReRoof (C)", pages: [1, 25], rows: [1, 1] },
    { id: "26-2170", date: "2026-08-24", address: "965 N 1430 West", valuation: 200987.95,
      type: "Remodel (C)", pages: [1, 25], rows: [37, 37] },
    { id: "26-2029", date: "2026-08-12", address: "575 E University Pkwy", valuation: 273731.7,
      type: "Remodel (C)", pages: [3, 27], rows: [1, 4] },
  ] as const;
  assert.equal(report.permits.filter(permit => permit.date.startsWith("2026-08-")).length, 14);
  for (const record of expected) {
    const permit = report.permits.find(candidate => candidate.permitId === record.id);
    assert.ok(permit, `Missing expected permit ${record.id}`);
    assert.equal(permit.address, record.address);
    assert.equal(permit.valuation, record.valuation);
    assert.equal(permit.date, record.date);
    assert.equal(permit.permitType, record.type);
    assert.deepEqual(permit.provenance.map(source => source.page), record.pages);
    assert.deepEqual(permit.provenance.map(source => source.row), record.rows);
    assert.deepEqual(permit.provenance.map(source => source.url), [
      OREM_AUGUST_PDF_URL,
      OREM_JANUARY_AUGUST_PDF_URL,
    ]);
    assert.equal(permit.product, "UNKNOWN");
  }
});

test("fetch uses only the two approved URLs with GET and validates PDF responses", {
  skip: !existsSync("/tmp/orem-august-2026.pdf") || !existsSync("/tmp/orem-jan-aug-2026.pdf"),
}, async () => {
  const originalFetch = globalThis.fetch;
  const requested: Array<{ url: string; method?: string }> = [];
  const contents = new Map([
    [OREM_AUGUST_PDF_URL, readFileSync("/tmp/orem-august-2026.pdf")],
    [OREM_JANUARY_AUGUST_PDF_URL, readFileSync("/tmp/orem-jan-aug-2026.pdf")],
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
    assert.ok(report.totalValidatedSignals >= 11);
    assert.ok(report.permits.some(permit => permit.permitId === "26-2312"));
    assert.deepEqual(requested.map(request => request.url).sort(), [...contents.keys()].sort());
    assert.ok(requested.every(request => request.method === "GET"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});