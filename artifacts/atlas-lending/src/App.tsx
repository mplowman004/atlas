import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  Layers3,
  Loader2,
  MapPin,
  Menu,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetAtlasDashboardQueryKey,
  getListAtlasFollowUpsQueryKey,
  getListAtlasOpportunitiesQueryKey,
  getListAtlasReferralsQueryKey,
  getListAtlasSignalsQueryKey,
  useGetAtlasDashboard,
  useListAtlasFollowUps,
  useListAtlasOpportunities,
  useListAtlasReferrals,
  useListAtlasSignals,
  useRunAtlasIngest,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Morning brief', icon: Sparkles },
  { href: '/opportunities', label: 'Opportunities', icon: Target },
  { href: '/referrals', label: 'Referrals', icon: UsersRound },
  { href: '/signals', label: 'Signals', icon: Activity },
  { href: '/settings', label: 'Sources & rules', icon: Settings2 },
];

function formatCurrency(value?: number | null) {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

function relativeDate(value?: string | null) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(diff / 3_600_000));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function currentBriefDate() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function scoreTone(score: number) {
  if (score >= 0.8) return 'bg-[#dfeee5] text-[#1d624c]';
  if (score >= 0.6) return 'bg-[#f5e8c9] text-[#866224]';
  return 'bg-[#f2ded6] text-[#9b493a]';
}

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}`;
}

function PageTitle({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#a36d25]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c79b48]" />
          {eyebrow}
        </div>
        <h1 className="font-serif text-4xl leading-none tracking-[-0.03em] text-[#25343a] md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#667175]">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon, accent = 'green' }: {
  label: string; value: string | number; note: string; icon: typeof Target; accent?: 'green' | 'gold' | 'rust';
}) {
  const styles = {
    green: 'bg-[#e5efe9] text-[#24644f]',
    gold: 'bg-[#f4e8c9] text-[#866224]',
    rust: 'bg-[#f3e0d8] text-[#9b493a]',
  }[accent];
  return (
    <div className="group rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5 shadow-[0_8px_30px_rgba(58,52,40,0.04)] transition-transform duration-200 hover:-translate-y-0.5" data-testid={`stat-card-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="mb-6 flex items-start justify-between">
        <span className={`rounded-xl p-2.5 ${styles}`}><Icon size={17} strokeWidth={1.8} /></span>
        <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#9a9a8e]">Live</span>
      </div>
      <div className="font-serif text-3xl tracking-[-0.02em] text-[#25343a]">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#737b7c]">
        <span>{label}</span><span className="font-mono text-[10px] text-[#a36d25]">{note}</span>
      </div>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#e9e4da] ${className}`} />;
}

function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}

function ErrorBlock({ retry }: { retry: () => void }) {
  return (
    <div className="rounded-2xl border border-[#e6c9bf] bg-[#fff8f4] p-8 text-center" data-testid="state-error">
      <CircleAlert className="mx-auto mb-3 text-[#a45342]" size={22} />
      <p className="text-sm font-semibold text-[#3d4648]">Atlas could not load this view.</p>
      <p className="mt-1 text-xs text-[#7d8381]">The source may be briefly unavailable. Try again.</p>
      <button onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#25343a] px-4 py-2 text-xs font-semibold text-[#fffdf8] transition hover:bg-[#355056] focus:outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="button-retry">
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d1c4] bg-[#fbf8f1] p-10 text-center" data-testid="state-empty">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#e9efe9] text-[#2d6b56]"><FileCheck2 size={18} /></div>
      <p className="text-sm font-semibold text-[#455153]">No {label} right now</p>
      <p className="mt-1 text-xs text-[#838984]">New verified activity will appear here after the next source run.</p>
    </div>
  );
}

function SectionHeading({ title, detail, href }: { title: string; detail?: string; href?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div><h2 className="text-sm font-semibold tracking-[-0.01em] text-[#354247]">{title}</h2>{detail && <p className="mt-1 text-xs text-[#858b87]">{detail}</p>}</div>
      {href && <Link href={href} className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a36d25] hover:text-[#6d4e1f]" data-testid={`link-view-${title.toLowerCase().replaceAll(' ', '-')}`}>View all <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" /></Link>}
    </div>
  );
}

function SignalBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const style = normalized.includes('high') || normalized.includes('critical')
    ? 'bg-[#f3e0d8] text-[#9b493a]'
    : normalized.includes('medium') || normalized.includes('watch')
      ? 'bg-[#f4e8c9] text-[#866224]'
      : 'bg-[#e3eee7] text-[#2c6752]';
  return <span className={`rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${style}`}>{severity}</span>;
}

function BriefPanel() {
  const dashboard = useGetAtlasDashboard();
  const queryClient = useQueryClient();
  const ingest = useRunAtlasIngest({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetAtlasDashboardQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAtlasOpportunitiesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAtlasReferralsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAtlasSignalsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAtlasFollowUpsQueryKey() }),
        ]);
      },
    },
  });
  const [ingestNotice, setIngestNotice] = useState('');
  const runIngest = () => {
    setIngestNotice('');
    ingest.mutate({ data: { limit: 250, promoteVerified: true } }, {
      onSuccess: (result) => setIngestNotice(`Run #${result.runId} completed · ${result.written} records written`),
      onError: () => setIngestNotice('Run could not complete. Check source access and try again.'),
    });
  };
  if (dashboard.isLoading) return <PageScaffold><PageTitle eyebrow={`Utah County · ${currentBriefDate()}`} title="Morning brief" description="Recent verified property activity for lending research. Financing intent requires confirmation." /><div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div><div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></PageScaffold>;
  if (dashboard.isError || !dashboard.data) return <PageScaffold><ErrorBlock retry={() => dashboard.refetch()} /></PageScaffold>;
  const data = dashboard.data;
  const totalPipeline = data.pipeline.reduce((sum, bucket) => sum + bucket.value, 0);
  const coverageTotal = data.coverage.verified + data.coverage.reviewRequired + data.coverage.rejected;
  const verifiedPct = coverageTotal ? Math.round((data.coverage.verified / coverageTotal) * 100) : 0;
  return (
    <PageScaffold>
      <PageTitle eyebrow={`Utah County · ${currentBriefDate()}`} title="Morning brief" description="Recent verified property activity for lending research. Financing intent requires confirmation." action={
        <div className="flex flex-col items-end gap-2">
          <button onClick={runIngest} disabled={ingest.isPending} className="inline-flex items-center gap-2 rounded-lg bg-[#25343a] px-4 py-2.5 text-xs font-semibold text-[#fffdf8] shadow-sm transition hover:bg-[#355056] disabled:cursor-wait disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="button-run-ingest">
            {ingest.isPending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            {ingest.isPending ? 'Running source run' : 'Run source update'}
          </button>
          {ingestNotice && <span className={`text-[11px] ${ingestNotice.includes('could not') ? 'text-[#a45342]' : 'text-[#2d6b56]'}`} data-testid="status-ingest">{ingestNotice}</span>}
        </div>
      } />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Prioritized opportunities" value={data.counts.opportunities} note="recent verified properties" icon={Target} accent="green" />
        <StatCard label="Pipeline identified" value={formatCurrency(totalPipeline)} note={`${data.pipeline.length} bands`} icon={BarChart3} accent="gold" />
        <StatCard label="Property records" value={data.counts.properties.toLocaleString()} note={`${data.counts.permits} permits`} icon={Building2} accent="rust" />
        <StatCard label="Follow-ups due" value={data.counts.followUps} note="this week" icon={Bell} accent="green" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-6" data-testid="panel-pipeline">
          <SectionHeading title="Pipeline by lending hypothesis" detail="Only products with explicit source evidence" />
          <div className="mt-7 space-y-5">
            {data.pipeline.length ? data.pipeline.map((bucket, index) => {
              const max = Math.max(...data.pipeline.map((item) => item.value), 1);
              return <div key={bucket.label} data-testid={`row-pipeline-${index}`}>
                <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-[#4d5859]">{bucket.label}</span><span className="font-mono text-[11px] text-[#7f8580]">{bucket.count} signals · {formatCurrency(bucket.value)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eee9df]"><div className={`h-full rounded-full ${index === 0 ? 'bg-[#2b6955]' : index === 1 ? 'bg-[#c79b48]' : 'bg-[#be7054]'}`} style={{ width: `${Math.max(7, (bucket.value / max) * 100)}%` }} /></div>
              </div>;
            }) : <EmptyBlock label="pipeline bands" />}
          </div>
          <div className="mt-8 border-t border-[#eee9df] pt-4 text-[11px] text-[#858b87]">Value is a directional estimate, not a commitment. Confirm before outreach.</div>
        </div>
        <div className="rounded-2xl border border-[#ded8cd] bg-[#283b40] p-6 text-[#f7f2e8]" data-testid="panel-coverage">
          <div className="mb-7 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c9a45a]">Source quality</p><h2 className="mt-2 text-lg font-semibold">Coverage you can trust</h2></div><ShieldCheck className="text-[#d3b06b]" size={21} strokeWidth={1.5} /></div>
          <div className="mb-7 flex items-center gap-5"><div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(#d3b06b ${verifiedPct}%, #708078 ${verifiedPct}% ${Math.min(verifiedPct + 18, 100)}%, #40575a ${Math.min(verifiedPct + 18, 100)}% 100%)` }}><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#283b40] font-serif text-2xl">{verifiedPct}%</div></div><div className="space-y-2 text-xs"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d3b06b]" />Verified <strong>{data.coverage.verified}</strong></div><div className="flex items-center gap-2 text-[#c3cfcb]"><span className="h-2 w-2 rounded-full bg-[#708078]" />Review required <strong>{data.coverage.reviewRequired}</strong></div><div className="flex items-center gap-2 text-[#aebdb7]"><span className="h-2 w-2 rounded-full bg-[#40575a]" />Rejected <strong>{data.coverage.rejected}</strong></div></div></div>
          <div className="border-t border-[#4b6060] pt-4"><div className="flex items-center justify-between text-xs text-[#bfcbc4]"><span>Last official-source run</span><span className="font-mono text-[10px]">{data.latestIngest ? relativeDate(data.latestIngest.finishedAt) : 'Never'}</span></div><div className="mt-2 flex items-center justify-between text-sm"><span>{data.latestIngest ? `Run #${data.latestIngest.runId}` : 'Awaiting first run'}</span><span className="text-[#d3b06b]">{data.latestIngest?.written ?? 0} written</span></div></div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <SignalsPreview />
        <FollowUpsPreview />
      </div>
    </PageScaffold>
  );
}

function SignalsPreview() {
  const query = useListAtlasSignals({ query: { queryKey: getListAtlasSignalsQueryKey() } });
  return <div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-6"><SectionHeading title="Significant signal changes" detail="The few changes worth acting on" href="/signals" />{query.isLoading ? <LoadingBlock rows={3} /> : query.isError ? <ErrorBlock retry={() => query.refetch()} /> : !query.data?.length ? <EmptyBlock label="signal changes" /> : <div className="divide-y divide-[#eee9df]">{query.data.slice(0, 4).map((signal) => <div className="flex gap-3 py-3 first:pt-1 last:pb-0" key={signal.id} data-testid={`signal-preview-${signal.id}`}><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#c79b48]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#405052]">{signal.label}</p><SignalBadge severity={signal.severity} /></div><p className="mt-1 truncate text-xs text-[#7d8581]">{signal.detail}</p></div><span className="shrink-0 font-mono text-[10px] text-[#a0a39b]">{relativeDate(signal.occurredAt)}</span></div>)}</div>}</div>;
}

function FollowUpsPreview() {
  const query = useListAtlasFollowUps({ query: { queryKey: getListAtlasFollowUpsQueryKey() } });
  return <div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-6"><SectionHeading title="Follow-ups due" detail="A short list for your first calls" href="/opportunities" />{query.isLoading ? <LoadingBlock rows={3} /> : query.isError ? <ErrorBlock retry={() => query.refetch()} /> : !query.data?.length ? <EmptyBlock label="follow-ups" /> : <div className="space-y-2">{query.data.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#eee9df] bg-[#fcfaf4] p-3 transition hover:border-[#d1bf91]" data-testid={`follow-up-preview-${item.id}`}><div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.priority.toLowerCase().includes('high') ? 'bg-[#f3e0d8] text-[#9b493a]' : 'bg-[#e9efe9] text-[#2d6b56]'}`}><Clock3 size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#405052]">{item.company}</p><p className="truncate text-[11px] text-[#858b87]">{item.task}</p></div><span className="font-mono text-[10px] text-[#9a6c2c]">{formatDate(item.dueAt)}</span></div>)}</div>}</div>;
}

function PageScaffold({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-[1480px] px-5 py-7 md:px-10 md:py-10">{children}</main>;
}

function OpportunitiesPage() {
  const [product, setProduct] = useState('');
  const [status, setStatus] = useState('');
  const [minScore, setMinScore] = useState('');
  const params = useMemo(() => ({ ...(product ? { product } : {}), ...(status ? { status } : {}), ...(minScore ? { minScore: Number(minScore) } : {}), limit: 100 }), [product, status, minScore]);
  const query = useListAtlasOpportunities(params, { query: { queryKey: getListAtlasOpportunitiesQueryKey(params) } });
  return <PageScaffold><PageTitle eyebrow="Prioritized by fit · 100 records max" title="Opportunities" description="Recent verified property signals for research. A permit alone does not establish financing need." action={<div className="flex items-center gap-2 rounded-lg border border-[#ded8cd] bg-[#fffdf8] px-3 py-2 text-xs text-[#77807b]"><Database size={14} className="text-[#a36d25]" /> Utah County coverage</div>} />
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-3 md:flex-row md:items-center"><div className="flex items-center gap-2 px-2 text-xs font-semibold text-[#5a6361]"><SlidersHorizontal size={15} /> Filter view</div><select value={product} onChange={(event) => setProduct(event.target.value)} className="rounded-lg border border-[#e1dbd0] bg-[#fcfaf4] px-3 py-2 text-xs text-[#4f5958] outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="select-filter-product"><option value="">All products</option><option value="REFINANCE">Refinance</option><option value="EQUIPMENT">Equipment</option><option value="INVESTOR_CRE">Investor CRE</option><option value="OWNER_OCCUPIED_CRE">Owner-occupied CRE</option><option value="WORKING_CAP_LOC">Working-capital LOC</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-[#e1dbd0] bg-[#fcfaf4] px-3 py-2 text-xs text-[#4f5958] outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="select-filter-status"><option value="">All statuses</option><option value="NEW">New</option><option value="REVIEW">Review</option><option value="CONTACTED">Contacted</option></select><select value={minScore} onChange={(event) => setMinScore(event.target.value)} className="rounded-lg border border-[#e1dbd0] bg-[#fcfaf4] px-3 py-2 text-xs text-[#4f5958] outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="select-filter-score"><option value="">Any signal score</option><option value="0.8">80+ score</option><option value="0.65">65+ score</option><option value="0.5">50+ score</option></select><button onClick={() => { setProduct(''); setStatus(''); setMinScore(''); }} className="ml-auto inline-flex items-center gap-1.5 px-2 text-xs text-[#8b6b38] hover:text-[#5e4824]" data-testid="button-clear-filters"><X size={13} /> Clear</button></div>
    {query.isLoading ? <LoadingBlock rows={6} /> : query.isError ? <ErrorBlock retry={() => query.refetch()} /> : !query.data?.length ? <EmptyBlock label="opportunities" /> : <div className="overflow-hidden rounded-2xl border border-[#ded8cd] bg-[#fffdf8]"><div className="hidden grid-cols-[1.3fr_1.1fr_0.65fr_0.8fr_0.9fr] gap-4 border-b border-[#eee9df] bg-[#faf7f0] px-5 py-3 font-mono text-[9px] uppercase tracking-[0.13em] text-[#999b91] md:grid"><span>Company & context</span><span>Product hypothesis</span><span>Signal</span><span>Range</span><span>Verification</span></div><div className="divide-y divide-[#eee9df]">{query.data.map((opportunity) => <div key={opportunity.id} className="grid gap-4 px-5 py-4 transition hover:bg-[#fbf7ef] md:grid-cols-[1.3fr_1.1fr_0.65fr_0.8fr_0.9fr] md:items-center" data-testid={`row-opportunity-${opportunity.id}`}><div><div className="flex items-center gap-2"><span className="font-semibold text-[#364548]">{opportunity.company}</span><ExternalLink size={12} className="text-[#a3a49b]" /></div><p className="mt-1 flex items-center gap-1 text-[11px] text-[#858b87]"><MapPin size={11} /> {opportunity.location} · {opportunity.propertyType || 'Property context pending'}</p><p className="mt-2 line-clamp-1 text-xs text-[#777f7c]">{opportunity.reason}</p></div><div><p className="text-sm font-medium text-[#4c5b5b]">{opportunity.product}</p><p className="mt-1 font-mono text-[10px] text-[#9a9f97]">{opportunity.signalCount ?? 0} supporting signals</p></div><div><span className={`inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1.5 font-mono text-xs font-medium ${scoreTone(opportunity.score)}`}>{scoreLabel(opportunity.score)}</span></div><div><p className="font-mono text-xs text-[#4f5b5a]">{formatCurrency(opportunity.estimatedMin)}–{formatCurrency(opportunity.estimatedMax)}</p><p className="mt-1 text-[10px] text-[#9a9f97]">market {formatCurrency(opportunity.marketValue)}</p></div><div className="flex items-center justify-between gap-2 md:block"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] ${opportunity.verificationState.toLowerCase().includes('verified') ? 'bg-[#e3eee7] text-[#2c6752]' : 'bg-[#f4e8c9] text-[#866224]'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{opportunity.verificationState}</span><span className="block mt-2 text-[10px] text-[#a0a39b]">{relativeDate(opportunity.updatedAt)}</span></div></div>)}</div></div>}
  </PageScaffold>;
}

function ReferralsPage() {
  const query = useListAtlasReferrals({ query: { queryKey: getListAtlasReferralsQueryKey() } });
  return <PageScaffold><PageTitle eyebrow="Warm introductions · Utah County" title="Referral opportunities" description="Adjacent relationships surfaced from the same verified signals, ready for a thoughtful handoff." action={<div className="rounded-lg bg-[#e5efe9] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#2c6752]"><Zap size={13} className="mr-1 inline" /> Warm signal queue</div>} />{query.isLoading ? <LoadingBlock rows={5} /> : query.isError ? <ErrorBlock retry={() => query.refetch()} /> : !query.data?.length ? <EmptyBlock label="referrals" /> : <div className="grid gap-3">{query.data.map((referral) => <div className="group grid gap-4 rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5 transition hover:-translate-y-0.5 hover:border-[#cdbd98] hover:shadow-[0_10px_30px_rgba(58,52,40,0.06)] md:grid-cols-[1.2fr_1.3fr_0.65fr_0.9fr_0.7fr] md:items-center" key={referral.id} data-testid={`row-referral-${referral.id}`}><div><div className="flex items-center gap-2"><span className="font-semibold text-[#364548]">{referral.company}</span><span className={`h-1.5 w-1.5 rounded-full ${referral.status.toLowerCase().includes('new') ? 'bg-[#c79b48]' : 'bg-[#79a68f]'}`} /></div><p className="mt-1 flex items-center gap-1 text-[11px] text-[#858b87]"><MapPin size={11} /> {referral.location}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#a36d25]">{referral.referralType}</p><p className="mt-1 text-sm text-[#576261]">{referral.trigger}</p></div><div><span className={`inline-flex rounded-lg px-2 py-1.5 font-mono text-xs font-medium ${scoreTone(referral.score)}`}>{scoreLabel(referral.score)}</span></div><div className="text-xs text-[#6f7976]"><span className="text-[10px] uppercase tracking-[0.08em] text-[#a0a39b]">Status</span><p className="mt-1 font-semibold capitalize text-[#4d5959]">{referral.status}</p></div><span className="justify-self-start rounded-lg border border-[#ded8cd] px-3 py-2 text-xs font-semibold text-[#7a817c] md:justify-self-end">Ready for review <ChevronRight className="ml-1 inline text-[#a36d25]" size={13} /></span></div>)}</div>}</PageScaffold>;
}

function SignalsPage() {
  const query = useListAtlasSignals({ query: { queryKey: getListAtlasSignalsQueryKey() } });
  const freshQuery = useGetAtlasDashboard();
  return <PageScaffold><PageTitle eyebrow="Monitor · official source changes" title="Signals" description="A focused audit trail of meaningful movement across the county, with freshness visible at a glance." action={<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7e8681]"><span className="h-2 w-2 rounded-full bg-[#6eaa8d]" /> Source monitor active</div>} /><div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#92978f]">Signal changes</p><p className="mt-3 font-serif text-3xl text-[#25343a]">{query.data?.length ?? '—'}</p><p className="mt-1 text-xs text-[#7c8580]">meaningful in current window</p></div><div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#92978f]">Last run</p><p className="mt-3 font-serif text-3xl text-[#25343a]">{freshQuery.data?.latestIngest ? relativeDate(freshQuery.data.latestIngest.finishedAt) : '—'}</p><p className="mt-1 text-xs text-[#7c8580]">official source freshness</p></div><div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#92978f]">Verified matches</p><p className="mt-3 font-serif text-3xl text-[#25343a]">{freshQuery.data?.latestIngest?.verifiedMatches ?? '—'}</p><p className="mt-1 text-xs text-[#7c8580]">from the latest run</p></div></div>{query.isLoading ? <LoadingBlock rows={6} /> : query.isError ? <ErrorBlock retry={() => query.refetch()} /> : !query.data?.length ? <EmptyBlock label="signal changes" /> : <div className="overflow-hidden rounded-2xl border border-[#ded8cd] bg-[#fffdf8]"><div className="divide-y divide-[#eee9df]">{query.data.map((signal) => <div className="grid gap-4 p-5 md:grid-cols-[0.55fr_1.6fr_0.75fr_0.5fr] md:items-center" key={signal.id} data-testid={`row-signal-${signal.id}`}><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${signal.severity.toLowerCase().includes('high') ? 'bg-[#f3e0d8] text-[#9b493a]' : 'bg-[#f4e8c9] text-[#866224]'}`}><Activity size={16} /></span><span className="font-mono text-[10px] text-[#a1a49c]">{formatDate(signal.occurredAt)}</span></div><div><p className="font-semibold text-[#3e4d50]">{signal.label}</p><p className="mt-1 text-sm leading-5 text-[#7d8581]">{signal.detail}</p></div><SignalBadge severity={signal.severity} /><span className="font-mono text-[10px] text-[#a2a59e] md:text-right">{relativeDate(signal.occurredAt)}</span></div>)}</div></div>}</PageScaffold>;
}

function SettingsPage() {
  const dashboard = useGetAtlasDashboard();
  const ingest = useRunAtlasIngest();
  const run = () => ingest.mutate({ data: { limit: 250, promoteVerified: true } });
  return <PageScaffold><PageTitle eyebrow="Configuration · controlled and reviewable" title="Sources & rules" description="Atlas keeps source access explicit and decision thresholds visible, so every call starts from a defensible signal." action={<button onClick={run} disabled={ingest.isPending} className="inline-flex items-center gap-2 rounded-lg border border-[#c5b17c] bg-[#f7f0dd] px-4 py-2.5 text-xs font-semibold text-[#6e5426] transition hover:bg-[#f1e4c4] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#c79b48]" data-testid="button-settings-ingest">{ingest.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {ingest.isPending ? 'Running…' : 'Run source update'}</button>} /><div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"><div className="space-y-4"><div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-semibold text-[#3e4c4f]">Official sources</h2><p className="mt-1 text-xs text-[#858b87]">Only configured sources can promote a record.</p></div><ShieldCheck className="text-[#2d6b56]" size={20} /></div><div className="space-y-3"><div className="flex items-center justify-between rounded-xl border border-[#e4dfd5] bg-[#fbf8f1] p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-[#e3eee7] p-2 text-[#2d6b56]"><Building2 size={16} /></div><div><p className="text-sm font-semibold text-[#495655]">Utah County permit records</p><p className="mt-1 text-[11px] text-[#878e88]">Permits · property context · ownership</p></div></div><span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#2d6b56]"><Check size={13} /> Connected</span></div><div className="flex items-center justify-between rounded-xl border border-[#e4dfd5] bg-[#fbf8f1] p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-[#f4e8c9] p-2 text-[#866224]"><Database size={16} /></div><div><p className="text-sm font-semibold text-[#495655]">Property & market value feed</p><p className="mt-1 text-[11px] text-[#878e88]">Assessed value · property type · location</p></div></div><span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#2d6b56]"><Check size={13} /> Connected</span></div></div></div><div className="rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-6"><div className="mb-5 flex items-center gap-3"><div className="rounded-lg bg-[#e9efe9] p-2 text-[#2d6b56]"><SlidersHorizontal size={16} /></div><div><h2 className="font-semibold text-[#3e4c4f]">Decision thresholds</h2><p className="mt-1 text-xs text-[#858b87]">The rules behind the call-ready queue.</p></div></div><div className="space-y-1">{[['Signal threshold', '≥ 0.78', 'Also requires a verified match and permit within 180 days'], ['Verification', 'Official match', 'Eligible for promotion'], ['Unknown product', 'Unclassified', 'No loan type inferred from a permit'], ['Estimated range', 'Directional', 'Never a commitment']].map(([label, value, detail]) => <div className="flex items-center justify-between border-t border-[#eee9df] py-3" key={label}><div><p className="text-xs font-semibold text-[#596461]">{label}</p><p className="mt-1 text-[10px] text-[#929891]">{detail}</p></div><span className="rounded-lg bg-[#f7f0dd] px-2 py-1 font-mono text-[11px] text-[#775925]">{value}</span></div>)}</div></div></div><div className="rounded-2xl border border-[#283b40] bg-[#283b40] p-6 text-[#f7f2e8]"><div className="flex items-center gap-3"><div className="rounded-lg bg-[#3d5557] p-2 text-[#d3b06b]"><Clock3 size={17} /></div><div><p className="font-semibold">Latest ingest result</p><p className="mt-1 text-xs text-[#b9c5bd]">The last controlled run across configured sources.</p></div></div>{dashboard.isLoading ? <div className="mt-7 space-y-3"><Skeleton className="h-8 bg-[#3a5153]" /><Skeleton className="h-8 bg-[#3a5153]" /><Skeleton className="h-8 bg-[#3a5153]" /></div> : dashboard.data?.latestIngest ? <div className="mt-7 space-y-3">{[['Run ID', `#${dashboard.data.latestIngest.runId}`], ['Records seen', dashboard.data.latestIngest.seen], ['Written', dashboard.data.latestIngest.written], ['Verified matches', dashboard.data.latestIngest.verifiedMatches], ['Review required', dashboard.data.latestIngest.reviewRequired], ['Finished', formatDate(dashboard.data.latestIngest.finishedAt, true)]].map(([label, value]) => <div className="flex items-center justify-between border-b border-[#40585a] pb-3 text-xs last:border-0" key={label}><span className="text-[#bdc9c1]">{label}</span><span className="font-mono text-[#e1c277]">{value}</span></div>)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[#536b6a] p-6 text-center"><p className="text-sm text-[#dce4dc]">No source run yet.</p><p className="mt-1 text-xs text-[#aebdb5]">Start an update to establish the first baseline.</p></div>}<div className="mt-5 border-t border-[#40585a] pt-4 text-[11px] leading-5 text-[#aebdb5]">All source runs are bounded, logged, and safe to repeat. Promoted records require an official match.</div></div></div></PageScaffold>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = navItems.find((item) => item.href === location)?.label ?? 'Atlas Lending';
  return <div className="min-h-[100dvh] bg-[#f4f0e7] text-[#25343a]"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#25343a] px-5 py-6 text-[#f5f0e5] transition-transform duration-200 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="mb-10 flex items-center justify-between"><Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)} data-testid="link-brand"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d2ac61] text-[#25343a]"><Layers3 size={18} strokeWidth={2} /></span><span><span className="block font-serif text-xl leading-none">Atlas</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.2em] text-[#b9c8bf]">Lending intelligence</span></span></Link><button onClick={() => setMobileOpen(false)} className="text-[#aebdb4] md:hidden" aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button></div><div className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[0.18em] text-[#78908b]">Workspace</div><nav className="space-y-1">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${location === href ? 'bg-[#3a5053] font-semibold text-[#f7f1e6]' : 'text-[#b8c5bd] hover:bg-[#30464a] hover:text-[#f7f1e6]'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} strokeWidth={location === href ? 2 : 1.7} className={location === href ? 'text-[#d6b46b]' : 'text-[#8fa49c]'} /><span>{label}</span>{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#d6b46b]" />}</Link>)}</nav><div className="mt-auto rounded-2xl border border-[#40585a] bg-[#2b4145] p-4"><div className="mb-3 flex items-center gap-2 text-[#d8b66e]"><ShieldCheck size={15} /><span className="font-mono text-[9px] uppercase tracking-[0.12em]">Source status</span></div><p className="text-xs leading-5 text-[#c1cec5]">County source status depends on the latest successful run.</p><div className="mt-3 flex items-center gap-2 text-[10px] text-[#9db1a7]"><span className="h-1.5 w-1.5 rounded-full bg-[#78af91]" /> Check latest run</div></div></aside><div className="md:pl-[250px]"><header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-[#ded8cd] bg-[#f4f0e7]/95 px-5 backdrop-blur md:px-10"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#566260] hover:bg-[#e9e4da] md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button><div className="md:hidden"><p className="font-serif text-xl">{activeLabel}</p></div><div className="hidden items-center gap-2 md:flex"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b918c]">Utah County</span><span className="text-[#c5bba9]">/</span><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a36d25]">{activeLabel}</span></div></div><div className="flex items-center gap-4"><div className="hidden items-center gap-2 text-xs text-[#7e8782] sm:flex"><span className="h-2 w-2 rounded-full bg-[#d6b46b]" /> Check latest run</div><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe8df] font-mono text-[10px] font-medium text-[#2d6752]" data-testid="avatar-user">RM</div></div></header>{children}</div>{mobileOpen && <button className="fixed inset-0 z-30 bg-[#25343a]/30 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-navigation-overlay" />}</div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={BriefPanel} /><Route path="/opportunities" component={OpportunitiesPage} /><Route path="/referrals" component={ReferralsPage} /><Route path="/signals" component={SignalsPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;