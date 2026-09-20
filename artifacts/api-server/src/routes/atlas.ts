import { Router, type IRouter } from "express";
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

type Opportunity = {
  id: number;
  company: string;
  product: string;
  score: number;
  status: string;
  verificationState: string;
  estimatedMin: number | null;
  estimatedMax: number | null;
  reason: string;
  location: string;
  propertyType: string | null;
  marketValue: number | null;
  signalCount: number;
  updatedAt: string;
};

const opportunities: Opportunity[] = [
  {
    id: 1,
    company: "Wasatch Ridge Industrial",
    product: "REFINANCE",
    score: 0.94,
    status: "NEW",
    verificationState: "INFERRED",
    estimatedMin: 1350000,
    estimatedMax: 2250000,
    reason: "Established industrial asset with current capital activity; refinance is a conversation hypothesis.",
    location: "American Fork",
    propertyType: "Industrial",
    marketValue: 3000000,
    signalCount: 4,
    updatedAt: "2026-09-20T15:12:00.000Z",
  },
  {
    id: 2,
    company: "Canyon View Logistics",
    product: "EQUIPMENT",
    score: 0.91,
    status: "NEW",
    verificationState: "CORROBORATED",
    estimatedMin: 520000,
    estimatedMax: 1300000,
    reason: "Commercial expansion permit suggests a material equipment and installation need.",
    location: "Lehi",
    propertyType: "Warehouse",
    marketValue: 4200000,
    signalCount: 5,
    updatedAt: "2026-09-20T13:40:00.000Z",
  },
  {
    id: 3,
    company: "Juniper Commercial Holdings",
    product: "INVESTOR_CRE",
    score: 0.88,
    status: "REVIEW",
    verificationState: "REVIEW_REQUIRED",
    estimatedMin: 900000,
    estimatedMax: 1500000,
    reason: "High-value property improvement with an unresolved owner match needs review before CRM promotion.",
    location: "Provo",
    propertyType: "Office",
    marketValue: 2000000,
    signalCount: 3,
    updatedAt: "2026-09-19T19:05:00.000Z",
  },
  {
    id: 4,
    company: "Copper Peak Manufacturing",
    product: "OWNER_OCCUPIED_CRE",
    score: 0.84,
    status: "NEW",
    verificationState: "CORROBORATED",
    estimatedMin: 480000,
    estimatedMax: 960000,
    reason: "Recent industrial build activity may support owner-occupied CRE financing discussion.",
    location: "Springville",
    propertyType: "Industrial",
    marketValue: 1250000,
    signalCount: 3,
    updatedAt: "2026-09-19T16:22:00.000Z",
  },
  {
    id: 5,
    company: "Maple Street Development",
    product: "REFINANCE",
    score: 0.81,
    status: "CONTACTED",
    verificationState: "INFERRED",
    estimatedMin: 750000,
    estimatedMax: 1250000,
    reason: "Current asset value and capital activity support a refinance conversation hypothesis.",
    location: "Pleasant Grove",
    propertyType: "Retail",
    marketValue: 1650000,
    signalCount: 2,
    updatedAt: "2026-09-18T12:48:00.000Z",
  },
  {
    id: 6,
    company: "Pioneer Valley Storage",
    product: "WORKING_CAP_LOC",
    score: 0.79,
    status: "NEW",
    verificationState: "CORROBORATED",
    estimatedMin: 100000,
    estimatedMax: 325000,
    reason: "Operating expansion may create working-capital needs; borrower intent is unconfirmed.",
    location: "Spanish Fork",
    propertyType: "Self-storage",
    marketValue: 890000,
    signalCount: 2,
    updatedAt: "2026-09-17T21:16:00.000Z",
  },
  {
    id: 7,
    company: "Summit Grove Partners",
    product: "INVESTOR_CRE",
    score: 0.76,
    status: "REVIEW",
    verificationState: "REVIEW_REQUIRED",
    estimatedMin: 675000,
    estimatedMax: 1100000,
    reason: "Parcel value is in range, but source records need a second corroboration before promotion.",
    location: "Orem",
    propertyType: "Multifamily",
    marketValue: 1500000,
    signalCount: 2,
    updatedAt: "2026-09-16T18:32:00.000Z",
  },
];

const referrals = [
  {
    id: 1,
    company: "Canyon View Logistics",
    referralType: "Insurance",
    trigger: "New warehouse expansion with material construction value",
    score: 0.86,
    location: "Lehi",
    status: "READY",
  },
  {
    id: 2,
    company: "Copper Peak Manufacturing",
    referralType: "Equipment vendor",
    trigger: "Industrial permit includes specialized production improvements",
    score: 0.82,
    location: "Springville",
    status: "READY",
  },
  {
    id: 3,
    company: "Juniper Commercial Holdings",
    referralType: "Commercial real estate",
    trigger: "Office improvement activity and unresolved ownership match",
    score: 0.74,
    location: "Provo",
    status: "REVIEW",
  },
  {
    id: 4,
    company: "Maple Street Development",
    referralType: "Property management",
    trigger: "Retail asset activity suggests an operating partner conversation",
    score: 0.68,
    location: "Pleasant Grove",
    status: "NEW",
  },
];

const signals = [
  {
    id: 1,
    label: "Industrial activity is accelerating",
    detail: "4 material commercial permits were added across Lehi and American Fork in the last 48 hours.",
    severity: "HIGH",
    occurredAt: "2026-09-20T14:05:00.000Z",
  },
  {
    id: 2,
    label: "Verification queue needs attention",
    detail: "2 owner matches remain below the automatic promotion threshold of 0.94.",
    severity: "MEDIUM",
    occurredAt: "2026-09-20T11:30:00.000Z",
  },
  {
    id: 3,
    label: "Construction activity remains broad",
    detail: "Permit volume is spread across industrial, office, retail, and multifamily properties.",
    severity: "LOW",
    occurredAt: "2026-09-19T20:10:00.000Z",
  },
];

const followUps = [
  {
    id: 1,
    company: "Wasatch Ridge Industrial",
    task: "Review refinance hypothesis and identify relationship owner",
    dueAt: "2026-09-21T16:00:00.000Z",
    priority: "HIGH",
    status: "DUE_TOMORROW",
  },
  {
    id: 2,
    company: "Canyon View Logistics",
    task: "Route equipment referral to commercial banker",
    dueAt: "2026-09-22T17:00:00.000Z",
    priority: "MEDIUM",
    status: "UPCOMING",
  },
  {
    id: 3,
    company: "Juniper Commercial Holdings",
    task: "Resolve parcel ownership match before promotion",
    dueAt: "2026-09-20T22:00:00.000Z",
    priority: "HIGH",
    status: "DUE_TODAY",
  },
  {
    id: 4,
    company: "Maple Street Development",
    task: "Confirm if existing lender code maps to active relationship",
    dueAt: "2026-09-24T16:00:00.000Z",
    priority: "LOW",
    status: "UPCOMING",
  },
];

let latestIngest = {
  runId: 42,
  seen: 100,
  written: 94,
  verifiedMatches: 78,
  reviewRequired: 14,
  rejected: 8,
  promoted: true,
  startedAt: "2026-09-20T12:00:00.000Z",
  finishedAt: "2026-09-20T12:01:24.000Z",
};

const router: IRouter = Router();

router.get("/atlas/dashboard", (_req, res) => {
  const data = GetAtlasDashboardResponse.parse({
    counts: {
      opportunities: opportunities.length,
      permits: 1428,
      properties: 1096,
      referrals: referrals.length,
      followUps: followUps.length,
    },
    pipeline: [
      { label: "New", value: 4525000, count: 4 },
      { label: "Review", value: 2175000, count: 2 },
      { label: "Contacted", value: 1000000, count: 1 },
    ],
    latestIngest,
    coverage: {
      verified: 78,
      reviewRequired: 14,
      rejected: 8,
    },
  });
  res.json(data);
});

router.get("/atlas/opportunities", (req, res) => {
  const query = ListAtlasOpportunitiesQueryParams.parse(req.query);
  const filtered = opportunities
    .filter((item) => !query.status || item.status === query.status)
    .filter((item) => !query.product || item.product === query.product)
    .filter((item) => query.minScore === undefined || item.score >= query.minScore)
    .slice(0, query.limit);
  res.json(ListAtlasOpportunitiesResponse.parse(filtered));
});

router.get("/atlas/referrals", (_req, res) => {
  res.json(ListAtlasReferralsResponse.parse(referrals));
});

router.get("/atlas/signals", (_req, res) => {
  res.json(ListAtlasSignalsResponse.parse(signals));
});

router.get("/atlas/follow-ups", (_req, res) => {
  res.json(ListAtlasFollowUpsResponse.parse(followUps));
});

router.post("/atlas/ingest", (req, res) => {
  const input = RunAtlasIngestBody.parse(req.body ?? {});
  const now = new Date();
  latestIngest = {
    runId: latestIngest.runId + 1,
    seen: input.limit,
    written: Math.max(0, input.limit - Math.ceil(input.limit * 0.06)),
    verifiedMatches: Math.max(0, Math.floor(input.limit * 0.78)),
    reviewRequired: Math.max(0, Math.floor(input.limit * 0.14)),
    rejected: Math.max(0, Math.ceil(input.limit * 0.08)),
    promoted: input.promoteVerified,
    startedAt: now.toISOString(),
    finishedAt: new Date(now.getTime() + 84000).toISOString(),
  };
  req.log.info({ runId: latestIngest.runId, limit: input.limit }, "Atlas ingest completed");
  res.json(RunAtlasIngestResponse.parse(latestIngest));
});

export default router;