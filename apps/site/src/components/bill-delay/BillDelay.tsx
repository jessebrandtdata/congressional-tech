/** Bill Delay Tracker (proposal IV.2): the lag from a bill's printed text to its first CRS summary. Reads the files
 *  apps/bill_delay builds from the spicy-regs warehouse into public/data/bill-delay/ at deploy time. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  allCongressesLabel, billLabel, billUrl, congressesIn, congressLabel, congressSeries, cumulativeSeries, cumulativeSize,
  dateBounds, defaultCongress, exportName, filterRecords, headerMetrics, longestLags, measureOptions, mergeCongresses,
  monthlySeries, oldestWaiting, ordinal, toCsv, typeOptions, type CongressEntry, type DateRange, type DelayRecord,
} from './metrics.ts';
import { ByCongress, Cumulative, Histogram, MonthlyShare } from './charts.tsx';
import { cardNumber, dayName, fmt } from './scales.ts';
import { exportCsv, exportPng, exportSvg } from './export.ts';

/** The page measures the introduced stage: the one stage every Congress has, and the only one CRS summarizes in
 *  the 119th Congress. Later-stage summaries stay in the data and are counted in the caveat. */
const STAGE = 'introduced';
const ALL = 'all';

interface CongressDoc {
  as_of: string;
  congress: string;
  measures?: string[];
  summary_before_text?: Record<string, number>;
  records: DelayRecord[];
}

interface View {
  key: string;
  entries: CongressEntry[];
  records: DelayRecord[];
  measureLists: string[][];
  summaryBefore: number;
  asOf: string;
}

const dataUrl = (path: string) => `${(import.meta.env?.BASE_URL ?? '').replace(/\/+$/, '')}/data/bill-delay/${path}`;

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(dataUrl(path), { signal });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

const usable = (entries: CongressEntry[]) => entries.filter((e) => (e.comparison?.all?.introduced_bills ?? 0) > 0);
/** The range if it is usable (not inverted), else null. */
const activeRange = (r: DateRange): DateRange | null => ((r.from || r.to) && !(r.from && r.to && r.from > r.to) ? r : null);

function StatTile({ label, value, note, exact }: { label: string; value: string; note?: string; exact?: string }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-label">{label}</span>
      <span className="dash-stat-value bd-stat-value" title={exact}>{value}</span>
      {note && <span className="bd-stat-note">{note}</span>}
    </div>
  );
}

/** A chart card whose PNG and SVG buttons export the SVG drawn inside it. */
function Figure({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const svg = () => ref.current?.querySelector('svg') ?? null;
  return (
    <figure className="dash-card bd-figure" aria-label={label}>
      <div className="bd-export">
        <button type="button" onClick={() => exportPng(svg(), name)} aria-label={`Download ${label} as PNG`}>Download PNG</button>
        <button type="button" onClick={() => exportSvg(svg(), name)} aria-label={`Download ${label} as SVG`}>Download SVG</button>
      </div>
      <div ref={ref}>{children}</div>
    </figure>
  );
}

export default function BillDelay() {
  const [index, setIndex] = useState<CongressEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState<{ label: string; done: number; total: number } | null>(null);
  const [type, setType] = useState('all');
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [measure, setMeasure] = useState<string | null>(null);
  const [width, setWidth] = useState(30);
  const [includeWaiting, setIncludeWaiting] = useState(true);
  const docs = useRef(new Map<string, CongressDoc>());

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ congresses: CongressEntry[] }>('congresses.json', controller.signal)
      .then((doc) => {
        if (!Array.isArray(doc.congresses)) throw new Error('congresses.json has no congresses list');
        const first = defaultCongress(doc.congresses);
        if (first === null) throw new Error('no Congress in the data has an introduced bill');
        setIndex(doc.congresses);
        setSelected(String(first));
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);

  // Load the picked Congress, or every usable one for ALL; a load that lands after a newer pick is dropped.
  useEffect(() => {
    if (!index || selected === null) return;
    let current = true;
    const pooled = selected === ALL;
    const entries = pooled ? usable(index) : index.filter((e) => String(e.congress) === selected);
    const toLoad = entries.filter((e) => !docs.current.has(String(e.congress)));
    const label = pooled ? `Loading ${entries.length} Congresses` : `Loading the ${congressLabel(entries[0])}`;
    let done = 0;
    if (toLoad.length) setLoading({ label, done, total: toLoad.length });
    Promise.all(entries.map(async (e) => {
      const key = String(e.congress);
      let doc = docs.current.get(key);
      if (!doc) {
        doc = await fetchJson<CongressDoc>(e.file);
        if (!Array.isArray(doc.records)) throw new Error(`${e.file} has no records array`);
        docs.current.set(key, doc);
        if (current) setLoading({ label, done: ++done, total: toLoad.length });
      }
      return doc;
    }))
      .then((loaded) => {
        if (!current) return;
        const records = mergeCongresses(entries.map((e, i) => [e.congress, loaded[i]]));
        const measureLists = loaded.map((d) => d.measures ?? []);
        const measures = measureOptions(measureLists);
        setMeasure((m) => (measures.some(([v]) => v === m) ? m : measures[0]?.[0] ?? null));
        setType((t) => (typeOptions(records).some(([v]) => v === t) ? t : 'all'));
        const { min, max } = dateBounds(records);
        const keep = (d: string | null) => (d && min && max && d >= min && d <= max ? d : null);
        setRange((r) => ({ from: keep(r.from), to: keep(r.to) }));
        setView({
          key: selected, entries, records, measureLists,
          summaryBefore: loaded.reduce((n, d) => n + (d.summary_before_text?.[STAGE] ?? 0), 0),
          asOf: loaded.map((d) => d.as_of).sort().at(-1) ?? '',
        });
        setError(null);
      })
      .catch((e: Error) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(null); });
    return () => { current = false; };
  }, [index, selected]);

  const records = view?.records ?? [];
  const introduced = useMemo(() => filterRecords(records, { stage: STAGE, type, range }), [records, type, range]);
  const unranged = useMemo(() => filterRecords(records, { stage: STAGE, type, range: null }), [records, type]);
  const allEditions = useMemo(() => filterRecords(records, { stage: 'all', type, range }), [records, type, range]);

  if (error && !view) {
    return <p className="dash-status bd-error" role="alert">{`Could not load the data (${error}). Run apps/bill_delay first; see its README.`}</p>;
  }
  if (!index || !view) {
    return <p className="dash-status" role="status">{loading ? `${loading.label}…` : 'Loading the Bill Delay Tracker…'}</p>;
  }

  const pooled = view.key === ALL;
  const entry = pooled ? null : view.entries[0];
  const label = pooled ? allCongressesLabel(view.entries) : congressLabel(view.entries[0]);
  const bounds = dateBounds(records);
  const measures = measureOptions(view.measureLists);
  const word = (measure || 'size').toLowerCase();
  const m = headerMetrics(introduced, measure);
  const reported = headerMetrics(allEditions).reported;
  const inView = congressesIn(records);
  const series = congressSeries(index.filter((e) => inView.includes(String(e.congress))), type);
  const active = activeRange(range);
  const scope = active
    ? active.from && active.to ? `${dayName(active.from)} – ${dayName(active.to)}` : active.from ? `from ${dayName(active.from)}` : `to ${dayName(active.to!)}`
    : pooled ? 'All Congresses' : entry?.ended ? 'Whole Congress' : 'Congress to date';
  const nameFor = (kind: string) => exportName(kind, { congress: view.key, type, range }, view.asOf);
  const ends = new Map(index.map((e) => [String(e.congress), e.end]));
  const laterStage = allEditions.filter((r) => r.stage !== null && r.stage !== STAGE && r.lag_days !== null).length;
  const afterEnd = introduced.filter((r) => r.summary_date !== null && r.summary_date > (ends.get(String(r.congress)) ?? '9999')).length;
  const laterOnly = new Set(introduced.filter((r) => r.lag_days != null && r.summary_stage).map((r) => `${r.congress}-${r.type}${r.number}`)).size;
  const sizeSeries = measure ? cumulativeSize(introduced, measure) : [];
  const unmeasured = sizeSeries.length ? sizeSeries[sizeSeries.length - 1].versionsWithoutSize : 0;
  const billText = (r: DelayRecord) => billLabel(r.type, r.number) + (pooled ? ` (${ordinal(r.congress ?? '')})` : '');
  const sizeCell = (r: DelayRecord) => (measure === null || r[measure] == null ? '–' : fmt(Number(r[measure])));
  const sizeHead = measure ? measure[0].toUpperCase() + measure.slice(1) : 'Size';

  const csv = (which: 'longest-lags' | 'oldest-waiting') => {
    const lags = which === 'longest-lags';
    const sizes = measures.map(([v]) => v);
    const rows = (lags ? longestLags(introduced, Infinity) : oldestWaiting(introduced, view.asOf, Infinity)).map((r) => ({
      bill: billLabel(r.type, r.number), congress: r.congress, type: r.type, number: r.number, printed_date: r.text_date,
      summary_date: r.summary_date, days: lags ? r.lag_days : (r as DelayRecord & { days_waiting: number }).days_waiting,
      ...Object.fromEntries(sizes.map((s) => [s, r[s] ?? null])), title: r.title, url: billUrl(r.congress, r.type, r.number),
    }));
    const columns = ['bill', 'congress', 'type', 'number', 'printed_date', ...(lags ? ['summary_date'] : []), 'days', ...sizes, 'title', 'url'];
    exportCsv(toCsv(rows, columns), nameFor(which));
  };

  const longest = longestLags(introduced);
  const waiting = oldestWaiting(introduced, view.asOf);

  return (
    <div className={loading ? 'dash bd is-loading' : 'dash bd'}>
      <p className="bd-subtitle">
        {`Lag between a bill text version and its CRS summary on Congress.gov, ${label}, as of ${view.asOf}. Measured from the date printed on the bill.`}
      </p>
      <form className="dash-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label className="dash-filter">
          <span className="dash-filter-label">Congress</span>
          <select value={selected ?? ''} disabled={loading !== null} onChange={(e) => setSelected(e.target.value)}>
            {usable(index).length > 1 && <option value={ALL}>{allCongressesLabel(usable(index))}</option>}
            {index.map((e) => <option key={e.congress} value={String(e.congress)}>{congressLabel(e)}</option>)}
          </select>
        </label>
        <label className="dash-filter">
          <span className="dash-filter-label">Bill type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {typeOptions(records).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="dash-filter">
          <span className="dash-filter-label">Printed from</span>
          <input type="date" min={bounds.min ?? undefined} max={bounds.max ?? undefined} value={range.from ?? ''}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || null }))} />
        </label>
        <label className="dash-filter">
          <span className="dash-filter-label">to</span>
          <input type="date" min={bounds.min ?? undefined} max={bounds.max ?? undefined} value={range.to ?? ''}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || null }))} />
        </label>
        <button type="button" className="bd-clear" onClick={() => setRange({ from: null, to: null })}>Clear date filters</button>
        {measures.length > 1 && (
          <label className="dash-filter">
            <span className="dash-filter-label">Bill size in</span>
            <select value={measure ?? ''} onChange={(e) => setMeasure(e.target.value)}>
              {measures.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        )}
      </form>

      {loading && (
        <div className="bd-loading" role="status" aria-live="polite">
          <span className="bd-spinner" aria-hidden="true" />
          {loading.total > 1 ? `${loading.label}… ${loading.done} of ${loading.total} loaded` : `${loading.label}…`}
        </div>
      )}
      {error && <p className="dash-status bd-error" role="alert">{`Could not load the data (${error}).`}</p>}

      <div className="dash-kpis bd-dim">
        {m.sizeCounted
          ? <StatTile label={`${word} of bill text`} value={cardNumber(m.sizeTotal)} exact={fmt(m.sizeTotal)}
              note={`${fmt(m.sizeCounted)} of ${fmt(m.versions)} introduced versions measured`} />
          : <StatTile label={`${word} of bill text`} value="–" note="no parsed text for these bills" />}
        <StatTile label="bills summarized" value={fmt(m.summarized)} note={`${fmt(m.waiting)} still waiting`} />
        <StatTile label="reported by committee" value={fmt(reported)} note="bills with an rh/rs text version" />
        <StatTile label="mean lag (days)" value={fmt(m.lagMean)} note={`n=${fmt(m.n)}`} />
        <StatTile label="median lag (days)" value={fmt(m.lagMedian)} />
        <StatTile label="max lag (days)" value={fmt(m.lagMax)} />
      </div>
      {view.summaryBefore > 0 && (
        <p className="bd-note">{`${fmt(view.summaryBefore)} introduced summaries exist for bills with no printed introduced text in the data.`}</p>
      )}

      <div className="bd-dim">
        <Figure label="histogram" name={nameFor('histogram')}>
          <Histogram records={introduced} width={width} includeWaiting={includeWaiting} />
          <div className="bd-strip">
            <label className="bd-slider">
              Bin width
              <input type="range" min={7} max={90} step={1} value={width} aria-label="Bin width in days"
                onChange={(e) => setWidth(Number(e.target.value))} />
              <span>{`${width}-day bins`}</span>
            </label>
            <label className="bd-check">
              <input type="checkbox" checked={includeWaiting} onChange={(e) => setIncludeWaiting(e.target.checked)} />
              Include bills still waiting
            </label>
          </div>
        </Figure>
        {inView.length > 1 && (
          <Figure label="by Congress" name={nameFor('by-congress')}>
            <ByCongress series={series} current={pooled ? null : view.key} />
          </Figure>
        )}
        <Figure label="share by month" name={nameFor('timeseries')}>
          <MonthlyShare series={monthlySeries(unranged)} range={active} />
        </Figure>
        <Figure label="cumulative bills" name={nameFor('cumulative')}>
          <Cumulative series={cumulativeSeries(introduced)} keys={['withText', 'summarized']} labels={['with text', 'summarized']}
            title={`${scope}: bills with text printed, and bills with a CRS summary. The gap is the backlog.`} yLabel="bills" />
        </Figure>
        {measure && (
          <Figure label="cumulative size" name={nameFor('cumulative-pages')}>
            <Cumulative series={sizeSeries} keys={['sizeIssued', 'sizeSummarized']} labels={[`${word} issued`, `${word} summarized`]}
              title={`${scope}: ${word} of bill text issued, and ${word} covered by a CRS summary.`} yLabel={word}
              note={[unmeasured ? `${fmt(unmeasured)} versions without parsed text.` : '', `${word[0].toUpperCase()}${word.slice(1)} of introduced text versions.`].filter(Boolean).join(' ')} />
          </Figure>
        )}

        <section className="dash-card bd-list" aria-label="Longest lags">
          <div className="bd-heading">
            <h2 className="dash-card-title">Longest lags</h2>
            <button type="button" className="bd-link-button" onClick={() => csv('longest-lags')} aria-label="Download longest lags as CSV">Download CSV</button>
          </div>
          {longest.length === 0 ? <p className="dash-status">No bills in this view.</p> : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Bill</th><th>Printed</th><th>Summary date</th><th className="num">Days</th><th className="num">{sizeHead}</th><th>Title</th></tr></thead>
                <tbody>
                  {longest.map((r) => (
                    <tr key={`${r.congress}-${r.type}${r.number}-${r.text_date}`}>
                      <td className="bd-nowrap"><a href={billUrl(r.congress, r.type, r.number)} target="_blank" rel="noopener">{billText(r)}</a></td>
                      <td className="bd-nowrap">{r.text_date}</td>
                      <td className="bd-nowrap">{r.summary_date}</td>
                      <td className="num">{fmt(r.lag_days)}</td>
                      <td className="num">{sizeCell(r)}</td>
                      <td className="bd-title">{r.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dash-card bd-list" aria-label="Oldest bills still waiting">
          <div className="bd-heading">
            <h2 className="dash-card-title">Oldest bills still waiting</h2>
            <button type="button" className="bd-link-button" onClick={() => csv('oldest-waiting')} aria-label="Download oldest waiting bills as CSV">Download CSV</button>
          </div>
          {waiting.length === 0 ? <p className="dash-status">No bills in this view.</p> : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Bill</th><th>Printed</th><th className="num">Days waiting</th><th className="num">{sizeHead}</th><th>Title</th></tr></thead>
                <tbody>
                  {waiting.map((r) => (
                    <tr key={`${r.congress}-${r.type}${r.number}-${r.text_date}`}>
                      <td className="bd-nowrap"><a href={billUrl(r.congress, r.type, r.number)} target="_blank" rel="noopener">{billText(r)}</a></td>
                      <td className="bd-nowrap">{r.text_date}</td>
                      <td className="num">{fmt(r.days_waiting)}</td>
                      <td className="num">{sizeCell(r)}</td>
                      <td className="bd-title">{r.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="bd-caveat">
        This page measures the introduced stage, the one stage every Congress has: CRS writes summaries for introduced
        versions only in the 119th Congress (&ldquo;CRS is not writing bill summaries for subsequent versions of measures as
        they move through the legislative process&rdquo;, Congress.gov help, Bill Summaries), while earlier Congresses&apos;
        summaries also cover later versions. Each lag runs from the date printed on the introduced text to the bill&apos;s
        first CRS summary, whatever version that summary describes.
        {laterOnly > 0 && ` For ${fmt(laterOnly)} bills in view the first summary describes a later version (a reported bill or the public law, say) because CRS never summarized the introduced one; their lag runs to that summary.`}
        {` The ${fmt(laterStage)} summaries of later versions in view are kept in the data under their stage.`} Every lag starts at
        the date printed on the bill, the one start date every Congress has; the text usually becomes readable online days to
        weeks later, so lags read that much longer than the wait a reader sees. Proposal IV.2 counts pages of bill text; the
        source data has no page count yet, so the page sizes bills in characters or sections of their parsed text instead.
        The summary date is the earliest the summary record retains. Summaries first captured before the spicy-regs warehouse
        began keeping revisions (2026-11-06) carry only their latest revision, so a summary revised later reads slower than it
        was.
        {afterEnd > 0 && ` ${fmt(afterEnd)} introduced summaries in view are dated after their Congress ended (on January 2 of the year after its second session): very late summaries, or re-publications of earlier ones.`}
      </div>
    </div>
  );
}
