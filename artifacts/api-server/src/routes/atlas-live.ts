import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte } from "drizzle-orm";
import {
  atlasIngestRuns,
  atlasOpportunities,
  atlasPermits,
  atlasProperties,
  db,
} from "@workspace/db";
import {
  GetAtlasDashboardResponse,
  ListAtlasFollowUpsResponse,
  ListAtlasOpportunitiesQueryParams,
  ListAtlasOpportunitiesResponse,
  ListAtlasReferralsResponse,
  ListAtlasSignalsResponse,
  RunAtlasIngestBody,
  RunAtlasIngestResponse,
} from "@workspace/api-zod";
import {
  atlasSources,
  exactAccountParcelMatch,
  fetchRecentPermits,
  findParcelForAccount,
  num,
  textValue,
  toDate,
} from "../services/utah-county";

const router: IRouter = Router();
const PROMOTION_THRESHOLD = 0.78;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function norm(s: string | null) {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function ownerCorroborates(a: string | null, b: string | null) {
  const x = norm(a);
  const y = norm(b);
  return Boolean(
    x &&
      y &&
      (x === y ||
        (x.length > 8 && y.length > 8 && (x.includes(y) || y.includes(x)))),
  );
}

function isCommercial(a: Record<string, unknown>) {
  const type = `${a.PROP_TYPE_DESCR ?? ""} ${a.SPC_PROP_TYP_DESCR ?? ""}`.toUpperCase();
  return !/(RESIDENTIAL|SINGLE FAMILY|CONDO|TOWNHOME)/.test(type) && Boolean(type.trim());
}

function productHypothesis(
  permit: Record<string, unknown>,
  parcel: Record<string, unknown>,
) {
  const corpus = `${permit.PERMITTYPE ?? ""} ${permit.PERMITREASON ?? ""} ${permit.PERMITREASONDETAIL ?? ""} ${permit.PERMITUSE ?? ""} ${parcel.PROP_TYPE_DESCR ?? ""} ${parcel.SPC_PROP_TYP_DESCR ?? ""}`.toUpperCase();
  if (/(EQUIPMENT|MACHIN|PRODUCTION LINE|MANUFACTUR)/.test(corpus)) return "EQUIPMENT";
  return "REFINANCE";
}

function scoreRecord(
  permit: Record<string, unknown>,
  parcel: Record<string, unknown>,
  directMatch: boolean,
  ownerMatch: boolean,
) {
  let score = 0.42;
  if (directMatch) score += 0.22;
  if (ownerMatch) score += 0.08;
  if (isCommercial(parcel)) score += 0.1;
  const value = num(parcel.MKT_CUR_VALUE) ?? 0;
  if (value >= 500_000 && value <= 5_000_000) score += 0.08;
  else if (value >= 100_000 && value <= 20_000_000) score += 0.04;
  const amount = num(permit.PERMITAMOUNT) ?? 0;
  if (amount >= 100_000) score += 0.05;
  if (num(permit.LENDERCODE)) score += 0.03;
  return clamp(score, 0, 0.97);
}

function estimateRange(marketValue: number | null) {
  if (!marketValue || marketValue < 100_000) return [null, null] as const;
  return [
    clamp(Math.round((marketValue * 0.45) / 10_000) * 10_000, 100_000, 20_000_000),
    clamp(Math.round((marketValue * 0.75) / 10_000) * 10_000, 100_000, 20_000_000),
  ] as const;
}

router.get("/atlas/dashboard", async (_req, res, next) => {
  try {
    const [[opp], [perm], [prop], [latest]] = await Promise.all([
      db.select({ n: count() }).from(atlasOpportunities),
      db.select({ n: count() }).from(atlasPermits),
      db.select({ n: count() }).from(atlasProperties),
      db.select().from(atlasIngestRuns).orderBy(desc(atlasIngestRuns.id)).limit(1),
    ]);
    const rows = await db
      .select()
      .from(atlasOpportunities)
      .orderBy(desc(atlasOpportunities.score))
      .limit(100);
    const pipelineMap = new Map<string, { value: number; count: number }>();
    for (const row of rows) {
      const bucket = pipelineMap.get(row.product) ?? { value: 0, count: 0 };
      bucket.count += 1;
      bucket.value += ((row.estimatedMin ?? 0) + (row.estimatedMax ?? 0)) / 2;
      pipelineMap.set(row.product, bucket);
    }
    const data = GetAtlasDashboardResponse.parse({
      counts: {
        opportunities: opp?.n ?? 0,
        permits: perm?.n ?? 0,
        properties: prop?.n ?? 0,
        referrals: 0,
        followUps: 0,
      },
      pipeline: [...pipelineMap].map(([label, value]) => ({ label, ...value })),
      latestIngest: latest
        ? {
            runId: latest.id,
            seen: latest.seen,
            written: latest.written,
            verifiedMatches: latest.verifiedMatches,
            reviewRequired: latest.reviewRequired,
            rejected: latest.rejected,
            promoted: latest.promoted,
            startedAt: latest.startedAt.toISOString(),
            finishedAt: latest.finishedAt?.toISOString() ?? null,
          }
        : null,
      coverage: latest
        ? {
            verified: latest.verifiedMatches,
            reviewRequired: latest.reviewRequired,
            rejected: latest.rejected,
          }
        : { verified: 0, reviewRequired: 0, rejected: 0 },
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/atlas/opportunities", async (req, res, next) => {
  try {
    const query = ListAtlasOpportunitiesQueryParams.parse(req.query);
    const filters = [];
    if (query.status) filters.push(eq(atlasOpportunities.status, query.status));
    if (query.product) filters.push(eq(atlasOpportunities.product, query.product));
    if (query.minScore !== undefined) {
      filters.push(gte(atlasOpportunities.score, query.minScore));
    }
    const rows = await db
      .select()
      .from(atlasOpportunities)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(atlasOpportunities.score))
      .limit(query.limit);
    res.json(
      ListAtlasOpportunitiesResponse.parse(
        rows.map((row) => ({
          id: row.id,
          company: row.company,
          product: row.product,
          score: row.score,
          status: row.status,
          verificationState: row.verificationState,
          estimatedMin: row.estimatedMin,
          estimatedMax: row.estimatedMax,
          reason: row.reason,
          location: row.location,
          propertyType: row.propertyType,
          marketValue: row.marketValue,
          signalCount: row.signalCount,
          updatedAt: row.updatedAt.toISOString(),
        })),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/atlas/referrals", (_req, res) =>
  res.json(ListAtlasReferralsResponse.parse([])),
);

router.get("/atlas/follow-ups", (_req, res) =>
  res.json(ListAtlasFollowUpsResponse.parse([])),
);

router.get("/atlas/signals", async (_req, res, next) => {
  try {
    const latest = await db
      .select()
      .from(atlasIngestRuns)
      .orderBy(desc(atlasIngestRuns.id))
      .limit(1);
    const signals = latest[0]
      ? [
          {
            id: latest[0].id,
            label: "Official-source ingest completed",
            detail: `${latest[0].seen} permits checked; ${latest[0].verifiedMatches} corroborated parcel matches; ${latest[0].reviewRequired} held for review; ${latest[0].rejected} rejected.`,
            severity: latest[0].reviewRequired ? "MEDIUM" : "LOW",
            occurredAt: (latest[0].finishedAt ?? latest[0].startedAt).toISOString(),
          },
        ]
      : [];
    res.json(ListAtlasSignalsResponse.parse(signals));
  } catch (error) {
    next(error);
  }
});

router.post("/atlas/ingest", async (req, res, next) => {
  const input = RunAtlasIngestBody.parse(req.body ?? {});
  const startedAt = new Date();
  try {
    const permits = await fetchRecentPermits(input.limit);
    let written = 0;
    let verifiedMatches = 0;
    let reviewRequired = 0;
    let rejected = 0;

    for (const feature of permits) {
      const permitAttrs = feature.attributes;
      const permitNo = textValue(permitAttrs.PERMITNO) ?? `OID-${permitAttrs.ESRI_OID}`;
      const accountNo = textValue(permitAttrs.ACCOUNTNO);
      if (!accountNo) {
        rejected += 1;
        continue;
      }

      const parcels = await findParcelForAccount(accountNo);
      if (parcels.length !== 1) {
        reviewRequired += 1;
        continue;
      }
      const parcelAttrs = parcels[0].attributes;
      const directMatch = exactAccountParcelMatch(accountNo, parcelAttrs);
      if (!directMatch) {
        reviewRequired += 1;
        continue;
      }
      const parcelId = textValue(parcelAttrs.PARCELID);
      if (!parcelId) {
        rejected += 1;
        continue;
      }

      const ownerMatch = ownerCorroborates(
        textValue(permitAttrs.OWNERNAME),
        textValue(parcelAttrs.OWNER_NAME),
      );
      const [property] = await db
        .insert(atlasProperties)
        .values({
          parcelId,
          parcelNo: textValue(parcelAttrs.PARCEL_NO),
          ownerName: textValue(parcelAttrs.OWNER_NAME),
          siteAddress: textValue(parcelAttrs.SITE_FULL_ADDRESS),
          city: textValue(parcelAttrs.SITE_CITY),
          zip: textValue(parcelAttrs.SITE_ZIP5),
          propertyType:
            textValue(parcelAttrs.SPC_PROP_TYP_DESCR) ??
            textValue(parcelAttrs.PROP_TYPE_DESCR),
          acreage: num(parcelAttrs.ACREAGE),
          marketLandValue: num(parcelAttrs.MKT_LAND_COM),
          marketImprovementValue: num(parcelAttrs.MKT_IMP_COM),
          marketValue: num(parcelAttrs.MKT_CUR_VALUE),
          previousMarketValue: num(parcelAttrs.MKT_PRV_VAL),
          yearBuilt: num(parcelAttrs.GLA_WEIGHTED_YRBLT)
            ? Math.round(num(parcelAttrs.GLA_WEIGHTED_YRBLT)!)
            : null,
          aboveGradeArea: num(parcelAttrs.TOTAL_ABOVE_GRADE_AREA)
            ? Math.round(num(parcelAttrs.TOTAL_ABOVE_GRADE_AREA)!)
            : null,
          sourceObjectId: textValue(parcelAttrs.OBJECTID),
          sourceUrl: atlasSources.parcel,
          sourceUpdatedAt: toDate(parcelAttrs.LASTUPDATE),
          raw: parcelAttrs,
        })
        .onConflictDoUpdate({
          target: atlasProperties.parcelId,
          set: {
            ownerName: textValue(parcelAttrs.OWNER_NAME),
            siteAddress: textValue(parcelAttrs.SITE_FULL_ADDRESS),
            city: textValue(parcelAttrs.SITE_CITY),
            zip: textValue(parcelAttrs.SITE_ZIP5),
            propertyType:
              textValue(parcelAttrs.SPC_PROP_TYP_DESCR) ??
              textValue(parcelAttrs.PROP_TYPE_DESCR),
            marketValue: num(parcelAttrs.MKT_CUR_VALUE),
            previousMarketValue: num(parcelAttrs.MKT_PRV_VAL),
            raw: parcelAttrs,
            updatedAt: new Date(),
          },
        })
        .returning();

      const verificationState = ownerMatch ? "CORROBORATED" : "VERIFIED_SOURCE_LINK";
      const [permit] = await db
        .insert(atlasPermits)
        .values({
          permitNo,
          accountNo,
          permitType: textValue(permitAttrs.PERMITTYPE),
          classification: textValue(permitAttrs.PERMITCLASSIFICATION),
          permitDate: toDate(permitAttrs.PERMITDATE),
          permitAmount: num(permitAttrs.PERMITAMOUNT),
          reason: textValue(permitAttrs.PERMITREASON),
          reasonDetail: textValue(permitAttrs.PERMITREASONDETAIL),
          permitUse: textValue(permitAttrs.PERMITUSE),
          status: textValue(permitAttrs.PERMITSTATUS),
          ownerName: textValue(permitAttrs.OWNERNAME),
          contractorCode: textValue(permitAttrs.CONTRACTORCODE),
          lenderCode: textValue(permitAttrs.LENDERCODE),
          propertyId: property.id,
          verificationState,
          verificationReason: ownerMatch
            ? "Exact official account/parcel match plus owner-name corroboration"
            : "Exact official account/parcel match; owner name not used as a fact match",
          sourceObjectId: textValue(permitAttrs.ESRI_OID),
          sourceUrl: atlasSources.permit,
          raw: permitAttrs,
        })
        .onConflictDoUpdate({
          target: atlasPermits.permitNo,
          set: {
            propertyId: property.id,
            verificationState,
            raw: permitAttrs,
            updatedAt: new Date(),
          },
        })
        .returning();

      written += 1;
      verifiedMatches += 1;
      const score = scoreRecord(permitAttrs, parcelAttrs, directMatch, ownerMatch);
      if (
        input.promoteVerified &&
        score >= PROMOTION_THRESHOLD &&
        isCommercial(parcelAttrs)
      ) {
        const marketValue = num(parcelAttrs.MKT_CUR_VALUE);
        const [estimatedMin, estimatedMax] = estimateRange(marketValue);
        const product = productHypothesis(permitAttrs, parcelAttrs);
        const company =
          textValue(parcelAttrs.OWNER_NAME) ??
          textValue(permitAttrs.OWNERNAME) ??
          "Unknown property owner";
        const location = [textValue(parcelAttrs.SITE_CITY), "UT"]
          .filter(Boolean)
          .join(", ");
        const reason = `${product.replaceAll("_", " ")} is an Atlas hypothesis based on a corroborated Utah County permit-to-parcel link, commercial property context, and recent capital activity. Borrower intent is not confirmed.`;
        const existing = await db
          .select({ id: atlasOpportunities.id })
          .from(atlasOpportunities)
          .where(eq(atlasOpportunities.permitId, permit.id))
          .limit(1);
        if (!existing.length) {
          await db.insert(atlasOpportunities).values({
            permitId: permit.id,
            propertyId: property.id,
            company,
            product,
            score,
            verificationState,
            estimatedMin,
            estimatedMax,
            reason,
            location,
            propertyType:
              textValue(parcelAttrs.SPC_PROP_TYP_DESCR) ??
              textValue(parcelAttrs.PROP_TYPE_DESCR),
            marketValue,
            signalCount: ownerMatch ? 4 : 3,
          });
        }
      }
    }

    const finishedAt = new Date();
    const [run] = await db
      .insert(atlasIngestRuns)
      .values({
        seen: permits.length,
        written,
        verifiedMatches,
        reviewRequired,
        rejected,
        promoted: input.promoteVerified,
        startedAt,
        finishedAt,
        notes: `Official Utah County sources only. Parcel: ${atlasSources.parcel}; Permit: ${atlasSources.permit}`,
      })
      .returning();
    res.json(
      RunAtlasIngestResponse.parse({
        runId: run.id,
        seen: permits.length,
        written,
        verifiedMatches,
        reviewRequired,
        rejected,
        promoted: input.promoteVerified,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Atlas official-source ingest failed");
    next(error);
  }
});

export default router;