/** Pure computations behind the Bill Delay Tracker (proposal IV.2). No DOM, no React: every chart and table reads these. */

/** One bill text version as delays.py writes it into <congress>/delays.json. */
export interface DelayRecord {
  type: string;
  number: string;
  /** introduced / reported / passed / enrolled; null for a later edition no summary is matched to. */
  stage: string | null;
  text_date: string;
  summary_date: string | null;
  lag_days: number | null;
  /** The version a bill's first summary describes, when it is not the introduced one. */
  summary_stage?: string;
  pages?: number | null;
  characters?: number | null;
  sections?: number | null;
  reported?: boolean;
  title: string;
  /** Set when the page loads the record, so bills from several Congresses stay apart. */
  congress?: string;
  [key: string]: unknown;
}

export interface Comparison {
  introduced_bills: number;
  introduced_summarized: number;
  summarized_other_stage?: number;
  median_lag_printed: number | null;
  summaries_after_end: number;
}

/** One Congress in congresses.json, the index the page opens with. */
export interface CongressEntry {
  congress: string;
  start: string;
  end: string;
  ended: boolean;
  as_of: string;
  file: string;
  measures?: string[];
  comparison?: Record<string, Comparison>;
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

// A bill is its Congress, type and number: H.R. 1 of the 118th and of the 119th are different bills. Records carry
// congress once the page has tagged them with the Congress they were loaded for; untagged records share one Congress.
export const billKey = (r: DelayRecord): string => `${r.congress ?? ''}-${r.type}${r.number}`;

// A record's bill has a CRS summary when its lag is set: delays.py measures introduced text to the bill's first summary,
// whatever version that summary describes (summary_stage names it when it is a later one; S. 1869 of the 115th was
// summarized once, at Public Law).
export const isSummarized = (r: DelayRecord): boolean => r.lag_days != null;
/** The date the record's bill first had a summary; null if none. */
export const firstSummaryDate = (r: DelayRecord): string | null => r.summary_date ?? null;

export function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** Header-row numbers over the records in view. lag* are null when nothing is summarized.
 *  waiting = distinct bills with a staged record and no summary in the set, so summarized + waiting === bills. */
export function headerMetrics(records: DelayRecord[], measure: string | null = 'pages') { // measure: the size field summed, pages / characters / sections
  const summarizedBills = new Set(records.filter(isSummarized).map(billKey));
  const waitingBills = new Set(records.filter((r) => r.stage !== null && !summarizedBills.has(billKey(r))).map(billKey));
  const summarized = records.filter((r) => r.lag_days !== null);
  const lags = summarized.map((r) => r.lag_days as number).sort((a, b) => a - b);
  const size = (r: DelayRecord) => (measure === null ? null : ((r[measure] as number | null | undefined) ?? null));
  const withSize = records.filter((r) => size(r) !== null);
  return {
    bills: new Set(records.map(billKey)).size,
    summarized: summarizedBills.size,
    waiting: waitingBills.size,
    reported: new Set(records.filter((r) => r.stage === 'reported').map(billKey)).size,
    sizeTotal: withSize.reduce((s, r) => s + (size(r) as number), 0),
    sizeCounted: withSize.length,
    versions: records.length,
    n: lags.length,
    lagMean: lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : null,
    lagMedian: median(lags),
    lagMax: lags.length ? lags[lags.length - 1] : null,
  };
}

/** Top of the histogram y scale: the tallest bin, or the waiting count when that bar is drawn and taller. One linear scale. */
export function histogramMax(bins: { count: number }[], waiting = 0): number {
  return Math.max(1, waiting, ...bins.map((b) => b.count));
}

/** Fixed-width bins of lag_days from 0 to the largest lag in view; no open-ended bin. A negative lag (a summary
 *  dated before its printed date; a handful exist) is left out rather than folded into the first bin. */
export function binLags(records: DelayRecord[], width: number): { from: number; to: number; count: number }[] {
  const lags = records.filter((r) => r.lag_days !== null && r.lag_days >= 0).map((r) => r.lag_days as number);
  if (lags.length === 0) return [];
  // a loop, not Math.max(...lags): spreading every Congress's lags as arguments overflows the call stack
  const count = Math.floor(lags.reduce((m, v) => (v > m ? v : m), 0) / width) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: i * width, to: (i + 1) * width, count: 0 }));
  for (const lag of lags) bins[Math.min(Math.max(0, Math.floor(lag / width)), count - 1)].count += 1;
  return bins;
}

/** Records in view. range is null or {from, to} as ISO 'YYYY-MM-DD' or null (open side); inclusive of both days, compared on text_date.
 *  ISO dates sort as strings, so no Date objects. A from later than to is treated as no range. */
export function filterRecords(
  records: DelayRecord[],
  { stage = 'all', type = 'all', range = null }: { stage?: string; type?: string; range?: DateRange | null },
): DelayRecord[] {
  const from = range?.from || null, to = range?.to || null;
  const ranged = !(from && to && from > to) && (from || to);
  return records.filter((r) => {
    if (stage !== 'all' && r.stage !== stage) return false;
    if (type !== 'all' && r.type !== type) return false;
    if (!ranged) return true;
    return (!from || r.text_date >= from) && (!to || r.text_date <= to);
  });
}

/** Earliest and latest text_date in the records ({min, max}, ISO dates; both null when empty). Bounds the date inputs. */
export function dateBounds(records: DelayRecord[]): { min: string | null; max: string | null } {
  let min: string | null = null, max: string | null = null;
  for (const r of records) {
    if (min === null || r.text_date < min) min = r.text_date;
    if (max === null || r.text_date > max) max = r.text_date;
  }
  return { min, max };
}

/** Per month of text_date: how many got a summary and how many wait. */
export function monthlySeries(records: DelayRecord[]): { month: string; summarized: number; waiting: number }[] {
  const byMonth = new Map<string, { summarized: number; waiting: number }>();
  for (const r of records) {
    if (r.stage === null) continue; // later editions never get a summary of their own
    const month = r.text_date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { summarized: 0, waiting: 0 });
    const m = byMonth.get(month)!;
    if (isSummarized(r)) m.summarized += 1; else m.waiting += 1;
  }
  return [...byMonth.keys()].sort().map((month) => ({ month, ...byMonth.get(month)! }));
}

/** Running counts of distinct bills with any text and with any summary, by date. */
export function cumulativeSeries(records: DelayRecord[]): { date: string; withText: number; summarized: number }[] {
  const firstText = new Map<string, string>(), firstSummary = new Map<string, string>();
  for (const r of records) {
    if (r.stage === null) continue;
    const k = billKey(r);
    if (!firstText.has(k) || r.text_date < firstText.get(k)!) firstText.set(k, r.text_date);
    const sd = firstSummaryDate(r);
    if (sd !== null && (!firstSummary.has(k) || sd < firstSummary.get(k)!)) firstSummary.set(k, sd);
  }
  const dates = [...new Set([...firstText.values(), ...firstSummary.values()])].sort();
  const textDates = [...firstText.values()].sort(), summaryDates = [...firstSummary.values()].sort();
  const countLE = (sorted: string[], d: string) => { let lo = 0, hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= d) lo = mid + 1; else hi = mid; } return lo; };
  return dates.map((date) => ({ date, withText: countLE(textDates, date), summarized: countLE(summaryDates, date) }));
}

/** Running size totals over the given records, in the given measure (pages, characters or sections; the caller scopes
 *  the records to a stage, or passes every edition for 'all'): size issued, and size of the staged records whose summary
 *  has arrived. A record without a value for the measure counts toward versionsWithoutSize. */
export function cumulativeSize(
  records: DelayRecord[],
  measure = 'pages',
): { date: string; sizeIssued: number; sizeSummarized: number; versionsWithoutSize: number }[] {
  const issued: [string, number][] = [], summarized: [string, number][] = [], missing: string[] = [];
  for (const r of records) {
    const n = (r[measure] as number | null | undefined) ?? null;
    if (n === null) missing.push(r.text_date);
    else {
      issued.push([r.text_date, n]);
      const sd = firstSummaryDate(r);
      if (r.stage !== null && sd !== null) summarized.push([sd, n]);
    }
  }
  const dates = [...new Set([...issued.map((p) => p[0]), ...summarized.map((p) => p[0]), ...missing])].sort();
  const running = (pairs: [string, number][]) => { const sorted = pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); let i = 0, sum = 0; return (d: string) => { while (i < sorted.length && sorted[i][0] <= d) sum += sorted[i++][1]; return sum; }; };
  const pi = running(issued), ps = running(summarized), pm = running(missing.map((d): [string, number] => [d, 1]));
  return dates.map((date) => ({ date, sizeIssued: pi(date), sizeSummarized: ps(date), versionsWithoutSize: pm(date) }));
}

// Size measures, in the order the page offers them; pages is the proposal's (IV.2) and appears once the data carries it.
export const MEASURES: [string, string][] = [['pages', 'Pages'], ['characters', 'Characters'], ['sections', 'Sections']];

/** Size options for documents' measure lists ([[value, label], ...] in MEASURES order): every measure any document has. */
export function measureOptions(lists: string[][]): [string, string][] {
  const have = new Set(lists.flat());
  return MEASURES.filter(([m]) => have.has(m));
}

// Every measure type the GovInfo BILLS collection lists, in the order the page offers them (congress.py's BILL_TYPES).
export const BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
export const BILL_LABELS: Record<string, string> = { hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.' };
export const BILL_SLUGS: Record<string, string> = { hr: 'house-bill', s: 'senate-bill', hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution', hres: 'house-resolution', sres: 'senate-resolution' };

/** Bill-type filter options for the records in view: [value, label] pairs, 'all' first, then each type present in the
 *  known order, then any type the page has no label for, alphabetically. Read from the data, so a Congress with no
 *  concurrent resolutions offers none. */
export function typeOptions(records: DelayRecord[]): [string, string][] {
  const present = new Set(records.map((r) => r.type));
  const known = BILL_TYPES.filter((t) => present.has(t));
  const other = [...present].filter((t) => !BILL_TYPES.includes(t)).sort();
  return [['all', 'All types'], ...[...known, ...other].map((t): [string, string] => [t, BILL_LABELS[t] ?? String(t).toUpperCase()])];
}

/** "119th Congress (2025–2026)": the ordinal and the two calendar years it sits in (it ends on January 2 of the third). */
export function congressLabel(entry: { congress: string | number; start: string; end: string }): string {
  const first = Number(entry.start.slice(0, 4)), last = Number(entry.end.slice(0, 4)) - 1;
  return `${ordinal(entry.congress)} Congress (${first}–${last})`;
}

/** The Congress the page opens on: the newest one in the index that has an introduced bill. Null for an empty index. */
export function defaultCongress(entries: CongressEntry[]): string | null {
  const usable = entries.filter((e) => (e.comparison?.all?.introduced_bills ?? 0) > 0);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (Number(b.congress) > Number(a.congress) ? b : a)).congress;
}

/** "H.R. 360": the conventional abbreviation for the bill type, a space, the number. */
export function billLabel(type: string, number: string | number): string {
  return `${BILL_LABELS[type] ?? String(type).toUpperCase()} ${number}`;
}

/** English ordinal: 119 -> "119th", 101 -> "101st", 112 -> "112th". */
export function ordinal(n: string | number): string {
  const k = Number(n), mod100 = k % 100, mod10 = k % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[mod10] ?? 'th');
  return `${k}${suffix}`;
}

/** congress.gov page for a bill; congress is the envelope's number (119 or "119"). */
export function billUrl(congress: string | number | undefined, type: string, number: string | number): string {
  return `https://www.congress.gov/bill/${ordinal(congress ?? 0)}-congress/${BILL_SLUGS[type]}/${number}`;
}

const byNumber = (a: DelayRecord, b: DelayRecord): number => Number(a.congress ?? 0) - Number(b.congress ?? 0) || Number(a.number) - Number(b.number)
  || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0);

/** The records of several Congress documents as one list. Each record is tagged in place with its Congress (a string)
 *  rather than copied: the pooled view holds a quarter of a million records and a copy would double that.
 *  docs is [[congress, doc], ...]. */
export function mergeCongresses(docs: [string | number, { records: DelayRecord[] }][]): DelayRecord[] {
  const out: DelayRecord[] = [];
  for (const [congress, doc] of docs) {
    const c = String(congress);
    for (const r of doc.records) { r.congress = c; out.push(r); }
  }
  return out;
}

/** Header for the pooled view: "All Congresses (108th–119th)", from the lowest and highest number in the index. */
export function allCongressesLabel(entries: { congress: string | number }[]): string {
  const ns = entries.map((e) => Number(e.congress));
  return `All Congresses (${ordinal(Math.min(...ns))}–${ordinal(Math.max(...ns))})`;
}

/** Top n records by lag_days descending among those with a summary; stage-less records excluded; ties by bill number ascending. */
export function longestLags(records: DelayRecord[], n = 10): DelayRecord[] {
  return records
    .filter((r) => r.stage != null && r.summary_date != null && r.lag_days != null)
    .sort((a, b) => (b.lag_days as number) - (a.lag_days as number) || byNumber(a, b))
    .slice(0, n);
}

const utcDays = (iso: string): number => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

/** Top n records with no summary by whole days from text_date to asOf (ISO), descending, as copies carrying days_waiting; ties by bill number ascending. */
export function oldestWaiting(records: DelayRecord[], asOf: string, n = 10): (DelayRecord & { days_waiting: number })[] {
  return records
    .filter((r) => r.stage != null && !isSummarized(r))
    .map((r) => ({ ...r, days_waiting: utcDays(asOf) - utcDays(r.text_date) }))
    .sort((a, b) => b.days_waiting - a.days_waiting || byNumber(a, b))
    .slice(0, n);
}

/** Download filename (no extension): bill-delay-<kind>[-<congress>]-<type>[-<from>_<to>]-<asOf>.
 *  The Congress part appears when the view names one. The range part appears only for a usable range (an inverted one
 *  is ignored, as in filterRecords); an open side reads "start"/"end". */
export function exportName(
  kind: string,
  { congress = null, type = 'all', range = null }: { congress?: string | null; type?: string; range?: DateRange | null } = {},
  asOf: string,
): string {
  const from = range?.from || null, to = range?.to || null;
  const ranged = (from || to) && !(from && to && from > to);
  return ['bill-delay', kind, ...(congress ? [String(congress)] : []), type,
    ...(ranged ? [`${from || 'start'}_${to || 'end'}`] : []), asOf].join('-');
}

/** RFC 4180 CSV: header row of the column keys, then one row per record; fields with a comma, quote, CR or LF are quoted
 *  with embedded quotes doubled; null/undefined become empty; rows are joined by CRLF (no trailing newline). */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [columns, ...rows.map((r) => columns.map((c) => r[c]))].map((line) => line.map(cell).join(',')).join('\r\n');
}
