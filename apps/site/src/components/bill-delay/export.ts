/** PNG, SVG and CSV downloads for the Bill Delay Tracker's figures and tables. Browser only. */

const FONT_STACK = '"Source Sans 3", system-ui, sans-serif';
const STYLE_PROPS = ['font-family', 'font-size', 'font-weight', 'fill', 'fill-opacity', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'opacity', 'text-anchor'];
const SVG_NS = 'http://www.w3.org/2000/svg';

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A standalone copy of a chart: computed styles inlined (the site's stylesheet does not travel with the file),
 *  an explicit size, a white background and white space above the title. */
function standaloneSvg(svg: SVGSVGElement): { text: string; width: number; height: number } {
  const vb = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')] as (SVGElement | HTMLElement)[];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    for (const p of STYLE_PROPS) {
      const v = p === 'font-family' ? FONT_STACK : cs.getPropertyValue(p);
      if (v) dst[i].style.setProperty(p, v);
    }
  });
  // an image of an SVG cannot load the site's webfont, so the fallback font is wider: shrink only the title to fit
  const title = clone.querySelector('text');
  if (title) {
    const ctx = document.createElement('canvas').getContext('2d');
    const base = parseFloat(title.style.getPropertyValue('font-size')) || 14;
    if (ctx) {
      ctx.font = `${title.style.getPropertyValue('font-weight') || 600} ${base}px system-ui, sans-serif`;
      const room = vb.width - (Number(title.getAttribute('x')) || 0) - 12;
      const fit = Math.floor(base * Math.min(1, room / ctx.measureText(title.textContent ?? '').width) * 10) / 10;
      title.style.setProperty('font-size', `${Math.max(12, fit)}px`);
    }
  }
  const pad = Math.max(0, Math.round(20 - (Number(title?.getAttribute('y') ?? 0) - 10)));
  const height = vb.height + pad;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${height}`);
  if (pad) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(0,${pad})`);
    while (clone.firstChild) g.appendChild(clone.firstChild);
    clone.appendChild(g);
  }
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.style.fontFamily = FONT_STACK;
  const bg = document.createElementNS(SVG_NS, 'rect');
  for (const [k, v] of [['x', vb.x], ['y', vb.y], ['width', vb.width], ['height', height], ['fill', '#ffffff']]) bg.setAttribute(String(k), String(v));
  clone.insertBefore(bg, clone.firstChild);
  return { text: new XMLSerializer().serializeToString(clone), width: vb.width, height };
}

export function exportSvg(svg: SVGSVGElement | null, name: string): void {
  if (!svg) return;
  download(new Blob([standaloneSvg(svg).text], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`);
}

/** A PNG at twice the chart's design size, the same file whatever the window width. */
export function exportPng(svg: SVGSVGElement | null, name: string): void {
  if (!svg) return;
  const { text, width, height } = standaloneSvg(svg);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) download(blob, `${name}.png`); }, 'image/png');
  };
  img.onerror = () => console.warn('PNG export failed: the SVG did not load as an image');
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

export function exportCsv(text: string, name: string): void {
  download(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}
