import { Link } from 'wouter';
import { ArrowRight, CircleAlert, FileCheck2, ShieldCheck } from 'lucide-react';
import {
  getGetOremSourceReportQueryKey,
  useGetAtlasDashboard,
  useGetOremSourceReport,
} from '@workspace/api-client-react';

function countyLabel(state?: string) {
  if (state === 'STALE') return 'Stale';
  if (state === 'CURRENT') return 'Current';
  if (state === 'UNAVAILABLE') return 'Unavailable';
  return 'Not verified';
}

function reportMonth(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function OpportunitiesSourceContext() {
  const county = useGetAtlasDashboard();
  const orem = useGetOremSourceReport({
    query: { queryKey: getGetOremSourceReportQueryKey(), staleTime: 15 * 60 * 1000, retry: 1 },
  });
  const countyState = county.data?.sourceStatus?.state;

  return (
    <section className="mb-5 grid gap-3 lg:grid-cols-2" aria-label="Source status and research">
      <div className="rounded-2xl border border-[#e2c8b8] bg-[#fff8f3] p-5" data-testid="card-county-status">
        <div className="flex flex-wrap items-center gap-2">
          <CircleAlert size={16} className="text-[#9b493a]" />
          <h2 className="text-sm font-semibold text-[#493b36]">Utah County GIS</h2>
          <span className="rounded-full bg-[#f3e0d8] px-2 py-1 font-mono text-[10px] font-semibold uppercase text-[#9b493a]" data-testid="badge-county-status">
            {county.isLoading ? 'Checking' : county.isError ? 'Unavailable' : countyLabel(countyState)}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#775f54]" data-testid="text-county-status">
          {county.isLoading ? 'Checking official county source health…' :
            county.isError ? 'County source health cannot be verified right now. Stored records are not treated as current.' :
            countyState === 'STALE' ? 'The official county permit table is stale. Stored county records do not establish current activity.' :
            countyState === 'CURRENT' ? 'Current source health alone does not qualify a property for lending outreach.' :
            'No current county source verification is available for lead promotion.'}
        </p>
      </div>
      <div className="rounded-2xl border border-[#d9e6dc] bg-[#f6faf6] p-5" data-testid="card-orem-research">
        <div className="flex flex-wrap items-center gap-2">
          <FileCheck2 size={16} className="text-[#2d6b56]" />
          <h2 className="text-sm font-semibold text-[#314a3f]">City of Orem PDFs</h2>
          <span className="rounded-full bg-[#e3eee7] px-2 py-1 font-mono text-[10px] font-semibold uppercase text-[#2d6b56]" data-testid="badge-orem-scope">
            Orem only · research
          </span>
          <span className="rounded-full bg-[#f1e6d3] px-2 py-1 font-mono text-[10px] font-semibold uppercase text-[#755a2f]" data-testid="badge-orem-freshness">
            {orem.isLoading ? 'Checking report' : orem.isError || !orem.data ? 'Unavailable' :
              orem.data.freshness === 'CURRENT_REPORT' ? 'Latest complete month' : 'Lagging report'}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#5e7167]" data-testid="text-orem-status">
          {orem.isLoading ? 'Checking the official City of Orem PDFs…' :
            orem.isError || !orem.data ? 'The city PDFs are unavailable for verification right now; no city permits are shown as leads.' :
            `${orem.data.propertyCount} grouped site addresses · ${orem.data.signalCount} commercial permit signals through ${reportMonth(orem.data.reportThrough)}.`}
          {' '}Research only: neither financing intent nor a lending product is verified.
        </p>
        <Link href="/orem-research" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2d6b56] hover:underline" data-testid="link-orem-research-from-opportunities">
          Inspect Orem research signals <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}

export function OpportunitiesEmptyState() {
  const dashboard = useGetAtlasDashboard();
  const noCurrentLeads = dashboard.data?.counts.opportunities === 0;

  return (
    <section className="rounded-2xl border border-dashed border-[#d9d1c4] bg-[#fbf8f1] px-6 py-10 text-center" data-testid="state-empty-opportunities">
      <ShieldCheck className="mx-auto mb-3 text-[#2d6b56]" size={25} />
      <h2 className="font-serif text-2xl text-[#25343a]">
        {noCurrentLeads ? 'No current lending-qualified opportunities' : 'No opportunities match this view'}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#65716d]">
        {noCurrentLeads
          ? 'This is intentional: no current, source-verified and lending-qualified evidence has passed Atlas safeguards. A new source run alone does not create a lead.'
          : 'Only current, verified evidence can enter this queue. Try clearing filters, or inspect the separate city permit research.'}
      </p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-[#827b6e]">
        Stale county records and Orem monthly permit snapshots are not call-ready opportunities. Permit valuation is not a loan amount; lending product remains unknown without evidence.
      </p>
      <Link href="/orem-research" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#b7cfbf] bg-[#e3eee7] px-4 py-2.5 text-xs font-semibold text-[#2d6b56] hover:bg-[#d6e8da]" data-testid="link-orem-research-from-empty">
        Explore Orem permit research <ArrowRight size={14} />
      </Link>
    </section>
  );
}

export function SourceStatusSidebar({ onNavigate }: { onNavigate: () => void }) {
  const county = useGetAtlasDashboard();
  const orem = useGetOremSourceReport({
    query: { queryKey: getGetOremSourceReportQueryKey(), staleTime: 15 * 60 * 1000, retry: 1 },
  });
  const countyState = county.data?.sourceStatus?.state;

  return (
    <div className="mt-auto rounded-2xl border border-[#40585a] bg-[#2b4145] p-4" data-testid="sidebar-source-status">
      <div className="mb-3 flex items-center gap-2 text-[#d8b66e]">
        <ShieldCheck size={15} />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]">Source status</span>
      </div>
      <div className="flex items-start justify-between gap-2 text-xs text-[#e2e8dc]">
        <span>Utah County GIS</span>
        <span className={`font-mono text-[10px] uppercase ${countyState === 'CURRENT' ? 'text-[#90c6a6]' : 'text-[#edb099]'}`} data-testid="badge-sidebar-county">
          {county.isLoading ? 'Checking' : county.isError ? 'Unavailable' : countyLabel(countyState)}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-[#afc0b7]">
        {countyState === 'STALE' ? 'Official permit data is stale; stored records are not current.' : 'Only freshness-verified evidence can enter the lead queue.'}
      </p>
      <div className="mt-3 border-t border-[#40585a] pt-3">
        <Link href="/orem-research" onClick={onNavigate} className="text-xs font-semibold text-[#e1dfc8] hover:underline" data-testid="link-orem-research-sidebar">
          Orem · {orem.data ? reportMonth(orem.data.reportThrough) : 'permit'} research <ArrowRight className="inline" size={12} />
        </Link>
        <p className="mt-1 text-[10px] leading-4 text-[#afc0b7]" data-testid="text-sidebar-orem-freshness">
          Orem only · {orem.isLoading ? 'checking official PDFs' : orem.isError || !orem.data ? 'report unavailable' :
            orem.data.freshness === 'CURRENT_REPORT' ? 'latest complete-month report' : 'lagging report'} · research, not leads.
        </p>
      </div>
    </div>
  );
}