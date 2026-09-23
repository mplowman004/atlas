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

export async function fetchRecentPermits(limit: number) {
  const fields = [
    "ESRI_OID",
    "PERMITNO",
    "ACCOUNTNO",
    "PERMITSOURCE",
    "PERMITTYPE",
    "PERMITCLASSIFICATION",
    "PERMITDATE",
    "PERMITAMOUNT",
    "PERMITREASON",
    "PERMITREASONDETAIL",
    "PERMITUSE",
    "PERMITACTIVEFLAG",
    "CONTRACTORCODE",
    "LENDERCODE",
    "PERMITSTATUS",
    "OWNERNAME",
    "WRITEDATE",
  ].join(",");
  return arcQuery(PERMIT_TABLE, {
    where: "1=1",
    outFields: fields,
    orderByFields: "PERMITDATE DESC",
    resultRecordCount: Math.min(limit, 1000),
  });
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