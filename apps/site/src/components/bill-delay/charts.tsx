/** The Bill Delay Tracker's charts, as inline SVG: lag histogram, by-Congress comparison, monthly share and the
 *  two cumulative charts. Each draws in a fixed 920-unit-wide viewBox, so an export is the same file at any width. */
import type { ReactNode } from 'react';
import { binLags, headerMetrics, histogramMax, ordinal, type DateRange, type DelayRecord } from './metrics.ts';
import {
  bandScale, dateTicks, fmt, fmtPercent, fmtPercent1, fmtShort, isoDay, linearScale, monthName, stepArea, stepPath,
} from './scales.ts';

// The site's coverage colors (the YouTube dashboard): "has it" is the primary blue, "missing it" is the gold.
// Here a bill that has its summary is blue, one still waiting is gold.
export const BLUE = '#104378'; // --ctdc-primary
export const GOLD = '#eec05e'; // --ctdc-gold
const INK = '#1b1b1b'; // --ctdc-ink
const MUTED = '#565c65'; // --ctdc-ink-muted
const W = 920;

function Title({ children, y = 18 }: { children: ReactNode; y?: number }) {
  return <text x={0} y={y} className="bd-chart-title">{children}</text>;
}

function Note({ children, y = 36 }: { children: ReactNode; y?: number }) {
  return <text x={0} y={y} className="bd-chart-note">{children}</text>;
}

function YLabel({ y, children }: { y: number; children: ReactNode }) {
  return <text transform={`translate(14,${y}) rotate(-90)`} textAnchor="middle" className="bd-chart-label">{children}</text>;
}

function YAxis({ scale, left, format }: { scale: ((v: number) => number) & { ticks: number[] }; left: number; format: (v: number) => string }) {
  return (
    <g>
      {scale.ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 16} y1={scale(t)} y2={scale(t)} stroke="rgba(11, 26, 48, 0.08)" />
          <text x={left - 6} y={scale(t) + 4} textAnchor="end" className="dash-axis-text">{format(t)}</text>
        </g>
      ))}
    </g>
  );
}

function Legend({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {([[BLUE, 'has a summary'], [GOLD, 'still waiting']] as const).map(([color, label], i) => (
        <g key={label} transform={`translate(${i * 100},0)`}>
          <rect width={10} height={10} rx={2} fill={color} />
          <text x={14} y={9} className="bd-chart-label">{label}</text>
        </g>
      ))}
    </g>
  );
}

/** Lag in days, in fixed-width bins, with the bills still waiting as one gold bar on the same scale. */
export function Histogram({ records, width, includeWaiting }: { records: DelayRecord[]; width: number; includeWaiting: boolean }) {
  const bins = binLags(records, width);
  if (bins.length === 0) return <p className="dash-status">No summarized bills in this view.</p>;
  const m = headerMetrics(records);
  const negative = records.filter((r) => r.lag_days !== null && r.lag_days < 0).length;
  const H = 320, left = 56, right = 16, top = 36, bottom = 56;
  const keys: (number | 'waiting')[] = [...bins.map((_, i) => i), ...(includeWaiting ? ['waiting' as const] : [])];
  const x = bandScale(keys, [left, W - right], 0.12);
  const y = linearScale(histogramMax(bins, includeWaiting ? m.waiting : 0), [H - bottom, top], 6);
  const binLabel = (b: { from: number; to: number }) => `${b.from}–${b.to - 1}`;
  // room for the longest label at 9 px (about 5.5 px a character) plus a gap
  const every = Math.max(1, Math.ceil((binLabel(bins[bins.length - 1]).length * 5.5 + 14) / x.step));
  const pos = (v: number) => {
    const i = Math.min(Math.floor(v / width), bins.length - 1);
    return x(i) + x.bandwidth * Math.min(1, (v - i * width) / width);
  };
  const rules = ([[m.lagMedian, 'median'], [m.lagMean, 'mean']] as const).filter(([v]) => v !== null) as [number, string][];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogram of lag in days" className="bd-chart">
      <Title y={13}>
        {`Days from the printed date to CRS summary, ${width}-day bins (n=${fmt(m.n)} summarized, ${fmt(m.waiting)} still waiting${negative ? `; ${fmt(negative)} dated before the printed date, not binned` : ''})`}
      </Title>
      <YAxis scale={y} left={left} format={fmt} />
      {bins.map((b, i) => (
        <g key={b.from}>
          <rect x={x(i)} y={y(b.count)} width={x.bandwidth} height={y(0) - y(b.count)} fill={BLUE} rx={2}>
            <title>{`${binLabel(b)} days: ${fmt(b.count)} bills (${fmtPercent1(m.n ? b.count / m.n : 0)} of summarized)`}</title>
          </rect>
          {x.bandwidth >= 18 && b.count > 0 && (
            <text x={x(i) + x.bandwidth / 2} y={y(b.count) - 4} textAnchor="middle" className="bd-chart-label">{fmt(b.count)}</text>
          )}
          {i % every === 0 && (
            <text x={x(i) + x.bandwidth / 2} y={H - bottom + 14} textAnchor="middle" className="dash-axis-text bd-small">{binLabel(b)}</text>
          )}
        </g>
      ))}
      {includeWaiting && (
        <g>
          <rect x={x('waiting')} y={y(m.waiting)} width={x.bandwidth} height={y(0) - y(m.waiting)} fill={GOLD} rx={2}>
            <title>{`still waiting: ${fmt(m.waiting)}`}</title>
          </rect>
          <text x={x('waiting') + x.bandwidth} y={y(m.waiting) - 4} textAnchor="end" className="bd-chart-label">{fmt(m.waiting)}</text>
          <text x={x('waiting') + x.bandwidth / 2} y={H - bottom + 14} textAnchor="middle" className="dash-axis-text bd-small">waiting</text>
        </g>
      )}
      {rules.map(([v, label]) => {
        const crowded = label === 'mean' && m.lagMedian !== null && Math.abs(pos(v) - pos(m.lagMedian)) < 60;
        return (
          <g key={label}>
            <line x1={pos(v)} x2={pos(v)} y1={top - 6} y2={H - bottom} stroke={INK} strokeWidth={1.5} strokeDasharray={label === 'mean' ? '4 3' : undefined} />
            <text x={pos(v) - 4} y={crowded ? top + 4 : top - 10} textAnchor="end" className="bd-chart-label">{`${label} ${Math.round(v)}d`}</text>
          </g>
        );
      })}
      <text x={(left + W - right) / 2} y={H - 14} textAnchor="middle" className="bd-chart-label">lag in days</text>
      <YLabel y={(top + H - bottom) / 2}>bills</YLabel>
    </svg>
  );
}

export interface CongressPoint {
  congress: string;
  ended: boolean;
  bills: number;
  summarized: number;
  waiting: number;
  share: number;
  median: number | null;
  afterEnd: number;
}

/** The Congresses in view side by side: the share of introduced bills with a summary, and the median days to it. */
export function ByCongress({ series, current }: { series: CongressPoint[]; current: string | null }) {
  if (series.length < 2) return <p className="dash-status">Fewer than two of these Congresses have bills of this type.</p>;
  const left = 76, right = 16, topY = 58, topH = 120, gap = 40, lowH = 130, H = topY + topH + gap + lowH + 44;
  const lowY = topY + topH + gap;
  const x = bandScale(series.map((s) => s.congress), [left, W - right], 0.18);
  const share = linearScale(1, [topY + topH, topY], 4, false);
  const lag = linearScale(Math.max(1, ...series.map((s) => s.median ?? 0)), [lowY + lowH, lowY], 4);
  const tip = (s: CongressPoint) => `${ordinal(s.congress)} Congress${s.ended ? '' : ' (in session)'}: ${fmt(s.bills)} introduced, `
    + `${fmt(s.summarized)} summarized (${fmtPercent(s.share)}), median ${s.median === null ? '–' : Math.round(s.median)} days`
    + (s.afterEnd ? `; ${fmt(s.afterEnd)} summaries dated after the Congress ended` : '');
  const cur = series.find((s) => s.congress === current);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of introduced bills with a CRS summary and median lag, by Congress" className="bd-chart">
      <Title>Introduced bills by Congress: share with a CRS summary, and median days to it.</Title>
      <Note>Measured from the date printed on the bill in every Congress, so the Congresses line up. Follows the bill type filter, not the dates.</Note>
      <YAxis scale={share} left={left} format={fmtPercent} />
      <YAxis scale={lag} left={left} format={fmt} />
      <YLabel y={topY + topH / 2}>share summarized</YLabel>
      <YLabel y={lowY + lowH / 2}>median days</YLabel>
      {series.map((s) => (
        <g key={s.congress}>
          <title>{tip(s)}</title>
          <rect x={x(s.congress)} y={topY} width={x.bandwidth} height={share(s.share) - topY} fill={GOLD} />
          <rect x={x(s.congress)} y={share(s.share)} width={x.bandwidth} height={topY + topH - share(s.share)} fill={BLUE} />
          {s.median !== null && (
            <>
              <rect x={x(s.congress)} y={lag(s.median)} width={x.bandwidth} height={lowY + lowH - lag(s.median)} fill={BLUE} rx={2} />
              <text x={x(s.congress) + x.bandwidth / 2} y={lag(s.median) - 4} textAnchor="middle" className="bd-chart-label">{Math.round(s.median)}</text>
            </>
          )}
          <text x={x(s.congress) + x.bandwidth / 2} y={lowY + lowH + 16} textAnchor="middle"
            className={s.congress === current ? 'bd-chart-label bd-strong' : 'bd-chart-label'}>{ordinal(s.congress)}</text>
        </g>
      ))}
      {cur && (
        <rect x={x(cur.congress) - 3} y={topY - 4} width={x.bandwidth + 6} height={lowY + lowH - topY + 8} fill="none" stroke={INK} strokeWidth={1.5} rx={3} />
      )}
      <Legend x={W - right - 190} y={topY - 14} />
      <text x={(left + W - right) / 2} y={H - 6} textAnchor="middle" className="bd-chart-label">Congress</text>
    </svg>
  );
}

/** By month the text was printed: the share of that month's bills with a summary, the selected dates shaded. */
export function MonthlyShare({ series, range }: { series: { month: string; summarized: number; waiting: number }[]; range: DateRange | null }) {
  if (series.length === 0) return null;
  const left = 76, right = 16, topY = 40, topH = 170, H = topY + topH + 60;
  const x = bandScale(series.map((s) => s.month), [left, W - right], 0.18);
  const y = linearScale(1, [topY + topH, topY], 4, false);
  const inside = range ? series.filter((s) => (!range.from || s.month >= range.from.slice(0, 7)) && (!range.to || s.month <= range.to.slice(0, 7))) : [];
  const half = (x.step * x.padding) / 2;
  const showMonths = x.step >= 18;
  const yearEvery = Math.max(1, Math.ceil(32 / (x.step * 12)));
  const axisY = topY + topH + 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of bills with a CRS summary, by month the text was printed" className="bd-chart">
      <Title>By month the text was printed: share with a CRS summary.</Title>
      {inside.length > 0 && (
        <rect x={x(inside[0].month) - half} y={topY} width={x(inside[inside.length - 1].month) + x.bandwidth + half - (x(inside[0].month) - half)}
          height={topH + 34} fill={MUTED} fillOpacity={0.15} />
      )}
      <YAxis scale={y} left={left} format={fmtPercent} />
      <YLabel y={topY + topH / 2}>Share of that month&apos;s bills</YLabel>
      <Legend x={W - right - 190} y={6} />
      {series.map((s, i) => {
        const total = s.summarized + s.waiting || 1;
        const cx = x(s.month) + x.bandwidth / 2;
        const year = Number(s.month.slice(0, 4));
        const yearMark = (s.month.endsWith('-01') && year % yearEvery === 0) || (showMonths && i === 0);
        return (
          <g key={s.month}>
            <title>{`${s.month}: ${fmt(s.summarized)} summarized, ${fmt(s.waiting)} waiting`}</title>
            <rect x={x(s.month)} y={topY} width={x.bandwidth} height={y(1 - s.waiting / total) - topY} fill={GOLD} />
            <rect x={x(s.month)} y={y(s.summarized / total)} width={x.bandwidth} height={topY + topH - y(s.summarized / total)} fill={BLUE} />
            {showMonths && <text x={cx} y={axisY} textAnchor="middle" className="dash-axis-sub">{monthName(s.month)}</text>}
            {yearMark && <text x={cx} y={showMonths ? axisY + 12 : axisY + 6} textAnchor="middle" className="bd-chart-label bd-strong">{year}</text>}
          </g>
        );
      })}
      <text x={(left + W - right) / 2} y={axisY + 28} textAnchor="middle" className="bd-chart-label">Month the text was printed</text>
    </svg>
  );
}

/** Two running totals over time as step lines, the gap between them (the backlog) shaded gold. */
export function Cumulative({ series, keys, labels, title, yLabel, note = '' }: {
  series: Record<string, number | string>[];
  keys: [string, string];
  labels: [string, string];
  title: string;
  yLabel: string;
  note?: string;
}) {
  if (series.length === 0) return null;
  const H = 300, left = 76, right = 16, top = note ? 52 : 36, bottom = 56;
  const dates = series.map((s) => String(s.date));
  const d0 = isoDay(dates[0]), d1 = Math.max(isoDay(dates[dates.length - 1]), d0 + 1);
  const x = (iso: string) => left + ((isoDay(iso) - d0) / (d1 - d0)) * (W - right - left);
  const upper = series.map((s) => Number(s[keys[0]]));
  const lower = series.map((s) => Number(s[keys[1]]));
  const y = linearScale(Math.max(1, ...upper), [H - bottom, top], 5);
  // millions of characters do not fit the left margin in full: short form once the axis reaches a million
  const yFormat = y.top >= 1e6 ? fmtShort : fmt;
  const xs = dates.map(x);
  const last = series.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="bd-chart">
      <Title>{title}</Title>
      {note && <Note>{note}</Note>}
      <YAxis scale={y} left={left} format={yFormat} />
      {dateTicks(dates[0], dates[last]).map((t) => (
        <text key={t.iso} x={x(t.iso)} y={H - bottom + 16} textAnchor="middle" className="dash-axis-text">{t.label}</text>
      ))}
      <YLabel y={(top + H - bottom) / 2}>{yLabel}</YLabel>
      <path d={stepArea(xs, upper.map(y), lower.map(y))} fill={GOLD} fillOpacity={0.45} />
      <path d={stepPath(xs.map((px, i) => [px, y(upper[i])]))} fill="none" stroke={INK} strokeWidth={2} />
      <path d={stepPath(xs.map((px, i) => [px, y(lower[i])]))} fill="none" stroke={BLUE} strokeWidth={2} />
      <text x={W - right} y={y(upper[last]) - 6} textAnchor="end" className="bd-chart-label">{`${fmt(upper[last])} ${labels[0]}`}</text>
      <text x={W - right} y={y(lower[last]) - 6} textAnchor="end" className="bd-chart-label bd-blue">{`${fmt(lower[last])} ${labels[1]}`}</text>
    </svg>
  );
}
