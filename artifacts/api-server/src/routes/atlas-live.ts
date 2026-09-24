import { Router, type IRouter } from "express";
import { count, desc, eq, inArray } from "drizzle-orm";
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
import { classifyProduct, isCommercialProperty, isCurrentPermit, MAX_PERMIT_AGE_DAYS, PROMOTION_THRESHOLD, scoreVerifiedSignal } from "../services/atlas-rules";

const router: IRouter = Router();

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

function estimateRange(marketValue: number | null) {
  // Screening range only — not a statement of borrower intent,
  // existing debt, collateral eligibility, or approved loan amount.
  if (!marketValue || marketValue < 100_000) return [null, null] as const;

  const estimatedMin = clamp(
    Math.round((marketValue * 0.45) / 10_000) * 10_000,
    100_000,
    20_000_000,
  );
  const estimatedMax = clamp(
    Math.round((marketValue * 0.75) / 10_000) * 10_000,
    100_000,
    20_000_000,
  );

  // Atlas target profile: $100k hard minimum / $20MM hard maximum.
  return [estimatedMin, estimatedMax] as const;
}

// The legacy table has one row per permit. Read it as one lead per property,
// anchored to the newest current, verified permit; preserve historical rows.
async function currentOpportunities() {
  const rows = await db.select({ opportunity: atlasOpportunities, permit: atlasPermits })
    .from(atlasOpportunities)
    .innerJoin(atlasPermits, eq(atlasOpportunities.permitId, atlasPermits.id));
  const current = rows.filter(({ permit }) =>
    isCurrentPermit(permit.permitDate) &&
    (permit.verificationState === "CORROBORATED" || permit.verificationState === "VERIFIED_SOURCE_LINK"));
  const ids = [...new Set(current.map(({ opportunity }) => opportunity.propertyId).filter((id): id is number => id !== null))];
  const supporting = ids.length ? await db.select({ id: atlasPermits.id, propertyId: atlasPermits.propertyId, permitDate: atlasPermits.permitDate })
    .from(atlasPermits).where(inArray(atlasPermits.propertyId, ids)) : [];
  const counts = new Map<number, number>();
  for (const permit of supporting) if (permit.propertyId !== null && isCurrentPermit(permit.permitDate))
    counts.set(permit.propertyId, (counts.get(permit.propertyId) ?? 0) + 1);
  const byProperty = new Map<number, (typeof current)[number]>();
  for (const item of current) {
    const id = item.opportunity.propertyId;
    if (id === null) continue;
    const previous = byProperty.get(id);
    if (!previous || (item.permit.permitDate?.getTime() ?? 0) > (previous.permit.permitDate?.getTime() ?? 0)) byProperty.set(id, item);
  }
  return [...byProperty.values()].map(({ opportunity }) => ({
    ...opportunity, signalCount: counts.get(opportunity.propertyId!) ?? 1,
  }));
}

router.get("/atlas/dashboard", async (_req, res, next) => {
  try {
    const [opportunities, [perm], [prop], [latest]] = await Promise.all([
      currentOpportunities(),
      db.select({ n: count() }).from(atlasPermits),
      db.select({ n: count() }).from(atlasProperties),
      db.select().from(atlasIngestRuns).orderBy(desc(atlasIngestRuns.id)).limit(1),
    ]);
    const rows = opportunities;
    const pipelineMap = new Map<string, { value: number; count: number }>();
    for (const row of rows) {
      if (row.product === "UNKNOWN") continue;
      const bucket = pipelineMap.get(row.product) ?? { value: 0, count: 0 };
      bucket.count += 1;
      bucket.value += ((row.estimatedMin ?? 0) + (row.estimatedMax ?? 0)) / 2;
      pipelineMap.set(row.product, bucket);
    }
    const data = GetAtlasDashboardResponse.parse({
      counts: {
        opportunities: opportunities.length,
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
    const rows = (await currentOpportunities())
      .filter(row => (!query.status || row.status === query.status) &&
        (!query.product || row.product === query.product) &&
        (query.minScore === undefined || row.score >= query.minScore))
      .sort((a, b) => b.score - a.score).slice(0, query.limit);
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
    let stale = 0;

    // A "recent" endpoint returning only historical data is a source failure.
    // Do not promote anything from that run, even when individual records verify.
    const sourceIsCurrent = permits.length === 0 || permits.some(feature =>
      isCurrentPermit(toDate(feature.attributes.PERMITDATE), startedAt));

    for (const feature of permits) {
      const permitAttrs = feature.attributes;
      const permitNo = textValue(permitAttrs.PERMITNO) ?? `OID-${permitAttrs.OBJECTID_1 ?? permitAttrs.ESRI_OID}`;
      const accountNo = textValue(permitAttrs.ACCOUNTNO);
      if (!accountNo) {
        rejected += 1;
        continue;
      }

      const permitDate = toDate(permitAttrs.PERMITDATE);
    if (!permitDate || permitDate.getTime() > startedAt.getTime()) {
      reviewRequired += 1;
      await db.insert(atlasPermits).values({
        permitNo,
        accountNo,
        verificationState: "REVIEW_REQUIRED",
        verificationReason: "Permit date is missing, invalid, or in the future relative to ingestion time",
        sourceObjectId: textValue(permitAttrs.OBJECTID_1 ?? permitAttrs.ESRI_OID),
        sourceUrl: atlasSources.permit,
        raw: permitAttrs,
      }).onConflictDoNothing({ target: atlasPermits.permitNo });
      continue;
    }

    if (!isCurrentPermit(permitDate, startedAt)) stale += 1;

    const parcels = await findParcelForAccount(accountNo);
      if (parcels.length !== 1) {
        reviewRequired += 1;
        await db.insert(atlasPermits).values({ permitNo, accountNo, verificationState: "REVIEW_REQUIRED", verificationReason: parcels.length === 0 ? "No official parcel match found for permit account number" : "Multiple official parcel matches found for permit account number", sourceObjectId: textValue(permitAttrs.OBJECTID_1 ?? permitAttrs.ESRI_OID), sourceUrl: atlasSources.permit, raw: permitAttrs }).onConflictDoNothing({ target: atlasPermits.permitNo });
        continue;
      }
      const parcelAttrs = parcels[0].attributes;
      const directMatch = exactAccountParcelMatch(accountNo, parcelAttrs);
      if (!directMatch) {
        reviewRequired += 1;
        await db.insert(atlasPermits).values({ permitNo, accountNo, verificationState: "REVIEW_REQUIRED", verificationReason: "Parcel candidate found but official account/parcel identifiers did not exactly match", sourceObjectId: textValue(permitAttrs.OBJECTID_1 ?? permitAttrs.ESRI_OID), sourceUrl: atlasSources.permit, raw: permitAttrs }).onConflictDoNothing({ target: atlasPermits.permitNo });
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
          permitDate,
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
          sourceObjectId: textValue(permitAttrs.OBJECTID_1 ?? permitAttrs.ESRI_OID),
          sourceUrl: atlasSources.permit,
          raw: permitAttrs,
        })
        .onConflictDoUpdate({
          target: atlasPermits.permitNo,
          set: {
            propertyId: property.id,
            verificationState,
            verificationReason: ownerMatch
              ? "Exact official account/parcel match plus owner-name corroboration"
              : "Exact official account/parcel match; owner name not used as a fact match",
            permitDate,
            permitAmount: num(permitAttrs.PERMITAMOUNT),
            permitType: textValue(permitAttrs.PERMITTYPE),
            classification: textValue(permitAttrs.PERMITCLASSIFICATION),
            reason: textValue(permitAttrs.PERMITREASON),
            reasonDetail: textValue(permitAttrs.PERMITREASONDETAIL),
            permitUse: textValue(permitAttrs.PERMITUSE),
            raw: permitAttrs,
            updatedAt: new Date(),
          },
        })
        .returning();

      written += 1;
      verifiedMatches += 1;
      const score = scoreVerifiedSignal(permitAttrs, parcelAttrs, ownerMatch);
      if (
        input.promoteVerified &&
        sourceIsCurrent &&
        isCurrentPermit(permitDate, startedAt) &&
        score >= PROMOTION_THRESHOLD &&
        isCommercialProperty(parcelAttrs)
      ) {
        const marketValue = num(parcelAttrs.MKT_CUR_VALUE);
        const [estimatedMin, estimatedMax] = estimateRange(marketValue);
        const product = classifyProduct(permitAttrs);
        const company =
          textValue(parcelAttrs.OWNER_NAME) ??
          textValue(permitAttrs.OWNERNAME) ??
          "Unknown property owner";
        const location = [textValue(parcelAttrs.SITE_CITY), "UT"]
          .filter(Boolean)
          .join(", ");
        const reason = `Current verified Utah County permit activity at this commercial property. Product: ${product === "UNKNOWN" ? "unconfirmed" : product.replaceAll("_", " ") + " (source evidence)"}. Borrower intent and financing need are not confirmed.`;
        const existing = await db
          .select({ id: atlasOpportunities.id, permitId: atlasOpportunities.permitId })
          .from(atlasOpportunities)
          .where(eq(atlasOpportunities.propertyId, property.id))
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
            signalCount: 1,
          });
        } else {
          // Reuse the property's existing lead, including a legacy 2020 lead.
          // The permit remains a separate source signal in atlas_permits.
          await db.update(atlasOpportunities).set({ permitId: permit.id, company, product,
            score, verificationState, estimatedMin, estimatedMax, reason, location,
            propertyType: textValue(parcelAttrs.SPC_PROP_TYP_DESCR) ?? textValue(parcelAttrs.PROP_TYPE_DESCR),
            marketValue, updatedAt: new Date() })
            .where(eq(atlasOpportunities.id, existing[0].id));
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
        promoted: input.promoteVerified && sourceIsCurrent,
        startedAt,
        finishedAt,
        notes: `Official Utah County sources only. ${stale} stale permits; source freshness ${sourceIsCurrent ? "pass" : "failed"}; ${MAX_PERMIT_AGE_DAYS}-day gate. Parcel: ${atlasSources.parcel}; Permit: ${atlasSources.permit}`,
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
        promoted: input.promoteVerified && sourceIsCurrent,
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
