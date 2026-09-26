import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// The API is bundled into dist/index.mjs; PDF.js otherwise looks for a worker
// beside the bundle rather than in its installed package.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export const OREM_AUGUST_PDF_URL =
  "https://orem.gov/wp-content/uploads/2026/09/Building-Permits-August-2026.pdf";
export const OREM_JANUARY_AUGUST_PDF_URL =
  "https://orem.gov/wp-content/uploads/2026/09/Building-Permits-2026-Web-Jan-August.pdf";
export const OREM_SOURCE_URLS = [
  OREM_AUGUST_PDF_URL,
  OREM_JANUARY_AUGUST_PDF_URL,
] as const;
export const OREM_REPORT_THROUGH = "2026-08-31";
export const OREM_CACHE_TTL_MS = 5 * 60 * 1000;

export type OremPdfTextItem = { str: string; transform: number[] };
export type OremPdfPage = string | { items: OremPdfTextItem[] };
export type OremPdfDocument = { url: string; pages: OremPdfPage[] };

export type OremPermitProvenance = {
  url: string;
  page: number;
  row: number;
};

export type OremPermit = {
  permitId: string;
  date: string;
  permitType: string;
  builder: string;
  address: string;
  normalizedAddress: string;
  valuation: number;
  classification: "COMMERCIAL";
  product: "UNKNOWN";
  score: number;
  evidenceStrength: "STRONG" | "MODERATE";
  provenance: OremPermitProvenance[];
};

export type OremPermitGroup = {
  address: string;
  normalizedAddress: string;
  permitCount: number;
  totalValuation: number;
  permitIds: string[];
};

export type OremReport = {
  source: "City of Orem";
  sourceScope: "City of Orem only";
  sourceUrls: typeof OREM_SOURCE_URLS;
  reportThrough: typeof OREM_REPORT_THROUGH;
  freshness: "Monthly report; not real-time";
  generatedAt: string;
  totalValidatedSignals: number;
  groupCount: number;
  permits: OremPermit[];
  groups: OremPermitGroup[];
  scoringNote: string;
};

type ParsedRow = Omit<OremPermit, "score" | "evidenceStrength" | "provenance"> & {
  provenance: OremPermitProvenance;
};

const CACHE_MS = OREM_CACHE_TTL_MS;
let cachedDocuments: { expiresAt: number; docs: OremPdfDocument[] } | undefined;
let inFlight: Promise<OremPdfDocument[]> | undefined;

function assertAllowedUrl(url: string): asserts url is (typeof OREM_SOURCE_URLS)[number] {
  if (!(OREM_SOURCE_URLS as readonly string[]).includes(url))
    throw new Error(`Unapproved City of Orem PDF URL: ${url}`);
}

function normalizeAddress(address: string) {
  return address
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[.,#]/g, " ")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\b(STREET|ST)\b/g, "ST")
    .replace(/\b(AVENUE|AVE)\b/g, "AVE")
    .replace(/\b(BOULEVARD|BLVD)\b/g, "BLVD")
    .replace(/\b(DRIVE|DR)\b/g, "DR")
    .replace(/\s+/g, " ")
    .trim();
}

function isExplicitCommercial(type: string) {
  const normalized = type.trim();
  if (/\b(RESIDENTIAL|SINGLE\s+FAMILY|TOWN\s?HOMES?|CONDO(?:MINIUMS?)?)\b/i.test(normalized))
    return false;
  return /\(\s*C\s*\)/i.test(normalized) ||
    /\bNEW\s+COMMERCIAL\s+BUILDING\b/i.test(normalized);
}

function parseDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, monthText, dayText, yearText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day) return null;
  return date;
}

function allowedReportDate(value: string, now: Date) {
  const date = parseDate(value);
  return date && date.getTime() <= now.getTime() &&
    date.getTime() <= Date.parse(`${OREM_REPORT_THROUGH}T23:59:59.999Z`) ? date : null;
}

function cleanColumn(items: OremPdfTextItem[], minX: number, maxX: number) {
  return items
    .filter(item => item.transform?.length >= 6 &&
      item.transform[4] >= minX && item.transform[4] < maxX)
    .sort((a, b) => a.transform[4] - b.transform[4])
    .map(item => item.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageLines(page: OremPdfPage): string[] | OremPdfTextItem[][] {
  if (typeof page === "string") return page.split(/\r?\n/);
  const groups: OremPdfTextItem[][] = [];
  const sorted = page.items
    .filter(item => item.str.trim() && item.transform?.length >= 6)
    .slice()
    .sort((a, b) => Math.abs(b.transform[5] - a.transform[5]) > 2
      ? b.transform[5] - a.transform[5]
      : a.transform[4] - b.transform[4]);
  for (const item of sorted) {
    let group = groups.find(candidate =>
      Math.abs(candidate[0].transform[5] - item.transform[5]) <= 2);
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(item);
  }
  return groups;
}

function parseTextLine(line: string, source: OremPermitProvenance, now: Date): ParsedRow | null {
  const match = line.match(
    /^\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+(26-\d{3,5})\s+(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}\$?([\d,]+\.\d{2})\s*$/,
  );
  if (!match) return null;
  return makeRow(match[1], match[2], match[3], match[4], match[5], match[6], source, now);
}

function makeRow(
  rawDate: string, permitId: string, type: string, builder: string,
  address: string, rawValuation: string, provenance: OremPermitProvenance, now: Date,
): ParsedRow | null {
  const date = allowedReportDate(rawDate, now);
  if (!date) return null;
  if (!isExplicitCommercial(type)) return null;
  const valuation = Number(rawValuation.replaceAll(",", ""));
  if (!Number.isFinite(valuation) || valuation < 0) return null;
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || !/^\d+\s/.test(normalizedAddress)) return null;
  const isoDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return {
    permitId,
    date: isoDate,
    permitType: type.trim(),
    builder: builder.trim(),
    address: address.trim(),
    normalizedAddress,
    valuation,
    classification: "COMMERCIAL",
    product: "UNKNOWN",
    provenance,
  };
}

function isWithinRecencyWindow(row: ParsedRow, now: Date) {
  const timestamp = Date.parse(`${row.date}T00:00:00.000Z`);
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= 180 * 86_400_000;
}

function parsePage(page: OremPdfPage, url: string, pageNumber: number, now: Date) {
  const lines = pageLines(page);
  const rows: ParsedRow[] = [];
  let dataRowNumber = 0;
  for (const line of lines) {
    let row: ParsedRow | null = null;
    if (typeof line === "string") {
      if (!/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s+26-\d{3,5}\b/.test(line)) continue;
      const source = { url, page: pageNumber, row: ++dataRowNumber };
      row = parseTextLine(line, source, now);
      const rawDate = line.trim().split(/\s+/, 1)[0];
      if (!row && allowedReportDate(rawDate, now) && isExplicitCommercial(line))
        throw new Error(`Unparseable commercial permit in ${url}, page ${pageNumber}, row ${dataRowNumber}`);
    } else {
      // The published table's columns have stable PDF x-coordinates. Requiring
      // each field to come from its own column avoids guessing from prose order.
      const date = cleanColumn(line, 50, 92);
      const permitId = cleanColumn(line, 92, 128);
      const type = cleanColumn(line, 128, 210);
      const builder = cleanColumn(line, 210, 303);
      const address = cleanColumn(line, 303, 400);
      const valuation = cleanColumn(line, 400, 600).replace(/^\$/, "");
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ||
        !/^26-\d{3,5}$/.test(permitId)) continue;
      const source = { url, page: pageNumber, row: ++dataRowNumber };
      if (type && builder && address && valuation && /^[\d,]+\.\d{2}$/.test(valuation))
        row = makeRow(date, permitId, type, builder, address, valuation, source, now);
      if (!row && isExplicitCommercial(type) && allowedReportDate(date, now) &&
        (!builder || !address || !/^[\d,]+\.\d{2}$/.test(valuation)))
        throw new Error(`Unparseable commercial permit in ${url}, page ${pageNumber}, row ${dataRowNumber}`);
    }
    if (row) rows.push(row);
  }
  return rows;
}

export function parseOremReports(docs: OremPdfDocument[], now = new Date()): OremReport {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid report reference date");
  if (!Array.isArray(docs) || docs.length !== OREM_SOURCE_URLS.length)
    throw new Error("Both official City of Orem August 2026 PDFs are required");
  const byUrl = new Map<string, OremPdfDocument>();
  for (const doc of docs) {
    assertAllowedUrl(doc.url);
    if (byUrl.has(doc.url)) throw new Error(`Duplicate City of Orem PDF: ${doc.url}`);
    byUrl.set(doc.url, doc);
  }
  const monthly = byUrl.get(OREM_AUGUST_PDF_URL);
  const cumulative = byUrl.get(OREM_JANUARY_AUGUST_PDF_URL);
  if (!monthly || !cumulative) throw new Error("Official monthly and cumulative reports are both required");
  if (monthly.pages.length !== 5) throw new Error("August 2026 monthly report must contain exactly 5 pages");
  if (cumulative.pages.length !== 28) throw new Error("January–August 2026 cumulative report must contain exactly 28 pages");

  const rowsByUrl = new Map<string, Map<string, ParsedRow>>();
  for (const doc of [monthly, cumulative]) {
    const rows = doc.pages.flatMap((page, index) => parsePage(page, doc.url, index + 1, now));
    const unique = new Map<string, ParsedRow>();
    for (const row of rows) {
      const previous = unique.get(row.permitId);
      if (previous && (previous.date !== row.date || previous.permitType !== row.permitType ||
        previous.address !== row.address || previous.valuation !== row.valuation ||
        previous.builder !== row.builder))
        throw new Error(`Conflicting duplicate permit ${row.permitId} in ${doc.url}`);
      if (!previous) unique.set(row.permitId, row);
    }
    rowsByUrl.set(doc.url, unique);
  }

  const monthlyRows = rowsByUrl.get(OREM_AUGUST_PDF_URL)!;
  const cumulativeRows = rowsByUrl.get(OREM_JANUARY_AUGUST_PDF_URL)!;
  if (monthlyRows.size === 0)
    throw new Error("August monthly report contained no validated commercial permits");
  if ([...monthlyRows.values()].some(row => !row.date.startsWith("2026-08-")))
    throw new Error("Monthly report contains a commercial record outside August 2026");
  const cumulativeAugustRows = new Map(
    [...cumulativeRows].filter(([, row]) => row.date.startsWith("2026-08-")),
  );
  if (monthlyRows.size !== cumulativeAugustRows.size ||
    [...monthlyRows.keys()].some(id => !cumulativeAugustRows.has(id)))
    throw new Error("August commercial permits are not present in both official reports");
  const permits: OremPermit[] = [];
  for (const [id, row] of cumulativeRows) {
    const augustDuplicate = row.date.startsWith("2026-08-")
      ? monthlyRows.get(id)
      : undefined;
    if (row.date.startsWith("2026-08-") && !augustDuplicate)
      throw new Error(`Monthly report is missing August permit ${id}`);
    if (augustDuplicate && (
      augustDuplicate.date !== row.date || augustDuplicate.permitType !== row.permitType ||
      augustDuplicate.address !== row.address || augustDuplicate.valuation !== row.valuation ||
      augustDuplicate.builder !== row.builder
    ))
      throw new Error(`Monthly and cumulative reports disagree for permit ${id}`);
    if (!isWithinRecencyWindow(row, now)) continue;
    permits.push({
      ...row,
      provenance: augustDuplicate
        ? [augustDuplicate.provenance, row.provenance]
        : [row.provenance],
      // Scores reflect evidence corroboration only, never lending fit.
      score: augustDuplicate ? 0.9 : 0.65,
      evidenceStrength: augustDuplicate ? "STRONG" : "MODERATE",
    });
  }
  if (permits.length === 0)
    throw new Error("No commercial permit signals within the 180-day reporting window were validated");
  permits.sort((a, b) => a.date.localeCompare(b.date) ||
    a.permitId.localeCompare(b.permitId));

  const grouped = new Map<string, OremPermit[]>();
  for (const permit of permits) {
    const group = grouped.get(permit.normalizedAddress) ?? [];
    group.push(permit);
    grouped.set(permit.normalizedAddress, group);
  }
  const groups = [...grouped].map(([normalizedAddress, group]) => ({
    address: group[0].address,
    normalizedAddress,
    permitCount: group.length,
    totalValuation: group.reduce((total, permit) => total + permit.valuation, 0),
    permitIds: group.map(permit => permit.permitId),
  })).sort((a, b) => a.normalizedAddress.localeCompare(b.normalizedAddress));

  return {
    source: "City of Orem",
    sourceScope: "City of Orem only",
    sourceUrls: OREM_SOURCE_URLS,
    reportThrough: OREM_REPORT_THROUGH,
    freshness: "Monthly report; not real-time",
    generatedAt: now.toISOString(),
    totalValidatedSignals: permits.length,
    groupCount: groups.length,
    permits,
    groups,
    scoringNote: "Evidence-strength score (0–1), not a borrowing-probability, lending-fit, or approval score. 0.90 indicates an explicitly commercial August record corroborated by both official reports; 0.65 indicates an explicitly commercial cumulative-only record.",
  };
}

async function readOfficialPdf(url: string): Promise<OremPdfDocument> {
  assertAllowedUrl(url);
  const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`City of Orem PDF request failed (${response.status})`);
  if (response.url && response.url !== url)
    throw new Error("City of Orem PDF redirected away from the approved source URL");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/application\/pdf/i.test(contentType))
    throw new Error(`City of Orem PDF response had unexpected content type: ${contentType || "missing"}`);
  const maxBytes = 5_000_000;
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("City of Orem PDF exceeds the safe download limit");
  if (!response.body) throw new Error("City of Orem PDF body is unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("City of Orem PDF exceeds the safe download limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("City of Orem response did not contain a valid PDF signature");
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  } catch (error) {
    throw new Error(`Unable to decode official City of Orem PDF: ${String(error)}`);
  }
  const expectedPages = url === OREM_AUGUST_PDF_URL ? 5 : 28;
  if (pdf.numPages !== expectedPages)
    throw new Error(`Unexpected page count in official City of Orem PDF: expected ${expectedPages}, received ${pdf.numPages}`);
  const pages: OremPdfPage[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items.flatMap(item => {
      if (!("str" in item) || !("transform" in item)) return [];
      return [{ str: item.str, transform: item.transform }];
    });
    pages.push({ items });
  }
  const extractedText = pages.flatMap(page =>
    typeof page === "string" ? [page] : page.items.map(item => item.str)).join(" ").toUpperCase();
  if (!extractedText.includes("CITY OF OREM") ||
    !extractedText.includes("PERMIT STATISTICS FOR AUGUST 2026"))
    throw new Error(`Official PDF does not identify the City of Orem August 2026 permit report: ${url}`);
  return { url, pages };
}

async function fetchOfficialDocuments() {
  if (cachedDocuments && cachedDocuments.expiresAt > Date.now())
    return cachedDocuments.docs;
  if (inFlight) return inFlight;
  inFlight = Promise.all(OREM_SOURCE_URLS.map(readOfficialPdf));
  try {
    const docs = await inFlight;
    cachedDocuments = { docs, expiresAt: Date.now() + CACHE_MS };
    return docs;
  } finally {
    inFlight = undefined;
  }
}

export async function getOremReport(now = new Date()): Promise<OremReport> {
  const docs = await fetchOfficialDocuments();
  return parseOremReports(docs, now);
}