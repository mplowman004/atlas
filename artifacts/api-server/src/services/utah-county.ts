const PARCEL_LAYER =
  "https://maps.utahcounty.gov/arcgis/rest/services/Pictometry/POL_Assr_TaxParcel/MapServer/0";
const PERMIT_TABLE =
  "https://maps200.utahcounty.gov/arcgis/rest/services/Assessor/Building_Permits/MapServer/1";

export const atlasSources = {
  parcel: PARCEL_LAYER,
  permit: PERMIT_TABLE,
} as const;

type ArcFeature = { attributes: Record<string, unknown> };
type ArcResponse = {
  features?: ArcFeature[];
  count?: number;
  error?: { message?: string; details?: string[] };
};

function queryUrl(
  base: string,
  params: Record<string, string | number | boolean>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `${base}/query?${query.toString()}`;
}

async function arcQuery(
  base: string,
  params: Record<string, string | number | boolean>,
) {
  const url = queryUrl(base, {
    f: "json",
    returnGeometry: false,
    ...params,
  });
  const response = await fetch(url, {
    headers: { "user-agent": "Atlas-Lending/1.0 (+official-source-ingest)" },
  });
  if (!response.ok) throw new Error(`Utah County source HTTP ${response.status}`);
  const body = (await response.json()) as ArcResponse;
  if (body.error) {
    throw new Error(`Utah County source error: ${body.error.message ?? "unknown"}`);
  }
  return body.features ?? [];
}

async function arcCount(base: string, where: string) {
  const url = queryUrl(base, { f: "json", where, returnCountOnly: true });
  const response = await fetch(url, { headers: { "user-agent": "Atlas-Lending/1.0 (+official-source-ingest)" } });
  if (!response.ok) throw new Error(`Utah County count HTTP ${response.status}`);
  const body = (await response.json()) as ArcResponse;
  if (body.error || !Number.isSafeInteger(body.count) || body.count! < 0)
    throw new Error(`Utah County permit count unavailable: ${body.error?.message ?? "invalid count"}`);
  return body.count!;
}

export async function fetchRecentPermits(limit: number) {
  const fields = [
    "ESRI_OID",
    "PERMITNO",
    "LOCALPERMITNO",
    "ACCOUNTNO",
    "PERMITTYPE",
    "PERMITCLASSIFICATION",
    "PERMITDATE",
    "PERMITSTATUS",
    "PERMITWORKDATE",
    "PERMITAMOUNT",
    "PERMITREASON",
    "PERMITREASONDETAIL",
    "PERMITUSE",
    "OWNERNAME",
    "CONTRACTORCODE",
    "LENDERCODE",
  ].join(",");
  // A bounded date predicate prevents an old first page from masquerading as
  // the newest activity when the ArcGIS layer cannot honor ORDER BY.
  const since = new Date(Date.now() - 180 * 86_400_000);
  const dateLiteral = `${since.getUTCFullYear()}-${String(since.getUTCMonth() + 1).padStart(2, "0")}-${String(since.getUTCDate()).padStart(2, "0")}`;
  const where = `PERMITDATE >= DATE '${dateLiteral}' AND PERMITCLASSIFICATION IN ('COMMERCIAL','MULTI-FAMILY')`;
  const total = await arcCount(PERMIT_TABLE, where);
  if (total === 0) throw new Error("Utah County source returned no current commercial permits; freshness requires review");
  // Fail closed if the service has more than a safe bounded pull; a partial
  // unsorted page cannot establish which permits are newest.
  if (total > 10_000) throw new Error(`Recent permit set (${total}) exceeds safe 10,000-record scan`);
  const all: ArcFeature[] = [];
  for (let offset = 0; offset < total; offset += 500) {
    const page = await arcQuery(PERMIT_TABLE, { where, outFields: fields,
      orderByFields: "PERMITDATE DESC, ESRI_OID DESC", resultOffset: offset,
      resultRecordCount: Math.min(500, total - offset) });
    if (page.length !== Math.min(500, total - offset))
      throw new Error(`Utah County permit page incomplete at offset ${offset}`);
    all.push(...page);
  }
  if (new Set(all.map(f => String(f.attributes.ESRI_OID))).size !== total)
    throw new Error("Utah County permit pagination returned duplicate or missing identifiers");
  all.sort((a, b) => (toDate(b.attributes.PERMITDATE)?.getTime() ?? 0) -
    (toDate(a.attributes.PERMITDATE)?.getTime() ?? 0) ||
    Number(b.attributes.ESRI_OID ?? 0) - Number(a.attributes.ESRI_OID ?? 0));
  return all.slice(0, Math.min(limit, 1000));
}

function sqlEscape(value: string) {
  return value.replaceAll("'", "''");
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function findParcelForAccount(accountNo: string) {
  const raw = accountNo.trim();
  if (!raw) return [];
  const digitsOnly = digits(raw);
  const clauses = [
    `PARCELID='${sqlEscape(raw)}'`,
    `PARCELID='${sqlEscape(digitsOnly)}'`,
  ];
  if (digitsOnly && /^\d+$/.test(digitsOnly)) {
    clauses.push(`PARCEL_NO=${Number(digitsOnly)}`);
  }
  const fields = [
    "OBJECTID",
    "PARCEL_NO",
    "PARCELID",
    "OWNER_NAME",
    "ACREAGE",
    "SITE_FULL_ADDRESS",
    "SITE_CITY",
    "SITE_ZIP5",
    "PROP_TYPE_DESCR",
    "SPC_PROP_TYP_DESCR",
    "GLA_WEIGHTED_YRBLT",
    "TOTAL_ABOVE_GRADE_AREA",
    "MKT_LAND_COM",
    "MKT_IMP_COM",
    "MKT_CUR_VALUE",
    "MKT_PRV_VAL",
    "LASTUPDATE",
  ].join(",");
  return arcQuery(PARCEL_LAYER, {
    where: clauses.join(" OR "),
    outFields: fields,
    resultRecordCount: 3,
  });
}

export function exactAccountParcelMatch(
  accountNo: string,
  parcel: Record<string, unknown>,
) {
  const accountDigits = digits(accountNo);
  const parcelId = digits(String(parcel.PARCELID ?? ""));
  const parcelNo = digits(String(parcel.PARCEL_NO ?? ""));
  return Boolean(
    accountDigits && (accountDigits === parcelId || accountDigits === parcelNo),
  );
}

export function toDate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value);
}

export function num(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function textValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
