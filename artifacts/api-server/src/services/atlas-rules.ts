export const PROMOTION_THRESHOLD = 0.78;
export const MAX_PERMIT_AGE_DAYS = 180;

export function isCommercialProperty(parcel: Record<string, unknown>) {
  const type = `${parcel.PROP_TYPE_DESCR ?? ""} ${parcel.SPC_PROP_TYP_DESCR ?? ""}`.toUpperCase();
  return Boolean(type.trim()) && !/(RESIDENTIAL|SINGLE FAMILY|CONDO|TOWNHOME)/.test(type);
}

export function scoreVerifiedSignal(permit: Record<string, unknown>, parcel: Record<string, unknown>, ownerMatch: boolean) {
  // Score is source/fit strength, not probability of borrowing or approval.
  let score = 0.42 + 0.22; // exact account-to-parcel match is a prerequisite
  if (ownerMatch) score += 0.08;
  if (isCommercialProperty(parcel)) score += 0.1;
  const value = Number(parcel.MKT_CUR_VALUE);
  if (Number.isFinite(value) && value >= 500_000 && value <= 5_000_000) score += 0.08;
  else if (Number.isFinite(value) && value >= 100_000 && value <= 20_000_000) score += 0.04;
  const amount = Number(permit.PERMITAMOUNT);
  if (Number.isFinite(amount) && amount >= 100_000) score += 0.05;
  if (permit.LENDERCODE != null && String(permit.LENDERCODE).trim()) score += 0.03;
  return Math.min(0.97, score);
}

export function isCurrentPermit(date: Date | null, now = new Date()) {
  if (!date || !Number.isFinite(date.getTime())) return false;
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= MAX_PERMIT_AGE_DAYS * 86_400_000;
}

export function classifyProduct(permit: Record<string, unknown>) {
  // Property type and permit type do not establish borrower intent.
  const evidence = `${permit.PERMITREASON ?? ""} ${permit.PERMITREASONDETAIL ?? ""} ${permit.PERMITUSE ?? ""}`.toUpperCase();
  if (/\b(REFINANCE|REFINANCING|REFI)\b/.test(evidence)) return "REFINANCE";
  if (/\b(EQUIPMENT FINANCING|EQUIPMENT LOAN|MACHINERY FINANCING)\b/.test(evidence)) return "EQUIPMENT";
  return "UNKNOWN";
}
