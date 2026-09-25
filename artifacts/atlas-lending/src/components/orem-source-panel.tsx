import { useState } from 'react';
import { Link } from 'wouter';
import { getGetOremSourceReportQueryKey, useGetOremSourceReport } from '@workspace/api-client-react';
import { ExternalLink, FileCheck2, MapPin, RefreshCw } from 'lucide-react';

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export function OremSourcePanel({ showAll = false }: { showAll?: boolean }) {
  const [search, setSearch] = useState('');
  const report = useGetOremSourceReport({
    query: { queryKey: getGetOremSourceReportQueryKey(), staleTime: 15 * 60 * 1000, retry: 1 },
  });
  const matchingProperties = report.data?.properties.filter((property) =>
    !showAll || !search.trim() ||
    `${property.siteAddress} ${property.permits.map((permit) => permit.permitId).join(' ')}`
      .toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const visibleProperties = showAll ? matchingProperties : matchingProperties.slice(0, 6);

  return (
    <section className={`${showAll ? '' : 'mt-6'} rounded-2xl border border-[#ded8cd] bg-[#fffdf8] p-5 md:p-6`} data-testid="panel-orem-source">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl text-[#25343a]">{showAll ? 'Orem permit research signals' : 'City of Orem permit report'}</h2>
            <span className="rounded-full bg-[#e3eee7] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#2d6b56]">Orem only</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#78827c]">
             Official city PDF evidence, displayed read-only. Orem only; not a call-ready lending opportunity.
          </p>
        </div>
        <a href="https://orem.gov/buildingsafety" target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#8b6b38] hover:underline">
          City source page <ExternalLink size={12} />
        </a>
      </div>

      {report.isLoading ? (
        <p className="mt-5 text-sm text-[#78827c]">Checking the official Orem PDFs…</p>
      ) : report.isError || !report.data ? (
        <div className="mt-5 rounded-xl border border-[#e6c9bf] bg-[#fff8f4] p-4">
          <p className="text-sm font-semibold text-[#74463a]">Orem report cannot be verified right now.</p>
          <p className="mt-1 text-xs text-[#8f6256]">No city records are shown or promoted. The Utah County source status is unchanged.</p>
          <button type="button" onClick={() => report.refetch()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8b6b38] hover:underline">
            <RefreshCw size={12} /> Retry PDF check
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#eadfca] bg-[#fbf8f1] p-3 text-xs text-[#626d66]">
            <span className="font-semibold text-[#6e5426]">{report.data.freshness === 'LAGGING_REPORT' ? 'Historical snapshot' : 'Latest report window'}</span>
            <span>Report through {dateLabel(report.data.reportThrough)}</span>
             <span>{report.data.propertyCount} grouped site addresses · {report.data.signalCount} commercial permit signals</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#8a7760]">{report.data.freshnessMessage}</p>
           {showAll && (
             <div className="mt-4">
               <label htmlFor="orem-research-search" className="mb-1.5 block text-xs font-semibold text-[#4d5959]">Find a site address or permit number</label>
               <input id="orem-research-search" data-testid="input-orem-research-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Orem research signals" className="w-full max-w-md rounded-lg border border-[#d8d0c2] bg-white px-3 py-2 text-sm text-[#25343a] outline-none focus:ring-2 focus:ring-[#c79b48]" />
               <p className="mt-1.5 text-xs text-[#78827c]" data-testid="text-orem-research-count">Showing {visibleProperties.length} of {report.data.propertyCount} grouped site addresses. Grouping is by reported address, not verified parcel identity.</p>
             </div>
           )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
             {visibleProperties.map((property) => (
              <article key={property.propertyKey} className="rounded-xl border border-[#e8e2d7] p-4" data-testid={`orem-property-${property.propertyKey}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1 text-sm font-semibold text-[#3e4d50]"><MapPin size={13} /> {property.siteAddress}, Orem</p>
                    <p className="mt-1 text-[11px] text-[#7c8580]">{property.signalCount} supporting {property.signalCount === 1 ? 'permit' : 'permits'} · latest {dateLabel(property.latestPermitDate)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-[#6e5426]">{usd(property.totalValuation)} reported</span>
                </div>
                <div className="mt-3 space-y-2 border-t border-[#eee9df] pt-3">
                  {property.permits.map((permit) => (
                    <div key={permit.permitId} className="text-[11px] leading-5 text-[#66716d]">
                      <span className="font-mono font-semibold text-[#344d4c]">{permit.permitId}</span>
                      {' · '}{permit.permitType} · {dateLabel(permit.permitDate)}
                      {' · '}{usd(permit.valuation)}
                       <span className="ml-2 text-[#9a8060]">Lending product unknown</span>
                      <div className="flex flex-wrap gap-x-3">
                        {permit.sources.map((source) => (
                          <a key={`${source.url}-${source.page}-${source.row}`} href={`${source.url}#page=${source.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#8b6b38] hover:underline">
                            <FileCheck2 size={11} /> {source.url === report.data.monthlyPdfUrl ? 'July report' : 'Jan–July report'} p.{source.page}, row {source.row}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
           {showAll && visibleProperties.length === 0 && <p className="mt-4 text-sm text-[#78827c]">No reported site addresses match that search.</p>}
           {!showAll && report.data.propertyCount > 6 && (
             <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#66716d]">
               <span>Showing 6 of {report.data.propertyCount} Orem address groups. No city permit is added to the lending queue.</span>
               <Link href="/orem-research" className="font-semibold text-[#8b6b38] hover:underline" data-testid="link-orem-research-from-brief">Explore all Orem research signals →</Link>
             </div>
           )}
          <p className="mt-4 text-[11px] leading-5 text-[#858b87]">
            Valuation is the city's reported construction valuation, not a loan size. Scores measure permit-source evidence only; financing intent and parcel ownership are not verified.
          </p>
        </>
      )}
    </section>
  );
}