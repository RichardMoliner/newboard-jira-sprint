import { useLayoutEffect, useRef, useState } from 'react';
import type { BurndownData } from '../indicators/computeIndicators.js';

const MIN_WIDTH = 320;
const HEIGHT = 220;
const MARGIN = { top: 12, right: 16, bottom: 24, left: 36 };
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const Y_TICKS = 4;
const TOOLTIP_WIDTH = 132;
const TOOLTIP_LINE_HEIGHT = 14;

function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function formatSp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function BurndownChart({ data }: { data: BurndownData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(MIN_WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    function recompute() {
      const el = containerRef.current;
      if (!el) return;
      setWidth(Math.max(MIN_WIDTH, el.clientWidth));
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  const { totalStoryPoints, points } = data;
  const plotWidth = width - MARGIN.left - MARGIN.right;

  if (totalStoryPoints <= 0 || points.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Sem story points estimados para calcular o burndown.</p>;
  }

  const lastIndex = points.length - 1;
  const x = (i: number) => (lastIndex === 0 ? 0 : (i / lastIndex) * plotWidth);
  const y = (value: number) => PLOT_HEIGHT - (value / totalStoryPoints) * PLOT_HEIGHT;

  const idealPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(p.ideal)}`).join(' ');

  // Conecta só os pontos conhecidos (actual != null) — dias futuros ficam sem segmento, não em 0.
  const actualSegments: string[] = [];
  let current = '';
  points.forEach((p, i) => {
    if (p.actual === null) {
      if (current) actualSegments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'} ${x(i)},${y(p.actual)} `;
  });
  if (current) actualSegments.push(current);

  // Rótulos do eixo X: primeiro, último e alguns intermediários, pra não colidir com muitos dias úteis.
  const labelStep = Math.max(1, Math.ceil(points.length / Math.max(4, Math.round(plotWidth / 70))));
  const xLabelIndexes = points.map((_, i) => i).filter((i) => i % labelStep === 0 || i === lastIndex);

  const yTickValues = Array.from({ length: Y_TICKS + 1 }, (_, i) => (totalStoryPoints * (Y_TICKS - i)) / Y_TICKS);

  // Régua: acha o dia mais próximo do mouse pra destacar e mostrar os valores exatos — clicar o
  // pontinho certinho é difícil, seguir o mouse não.
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left - MARGIN.left;
    if (localX < -8 || localX > plotWidth + 8) {
      setHoverIndex(null);
      return;
    }
    const step = lastIndex === 0 ? plotWidth : plotWidth / lastIndex;
    const idx = Math.round(localX / step);
    setHoverIndex(Math.min(lastIndex, Math.max(0, idx)));
  }

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipLines = hoverPoint
    ? [formatFullDate(hoverPoint.date), `Ideal: ${formatSp(hoverPoint.ideal)} SP`, hoverPoint.actual !== null ? `Real: ${formatSp(hoverPoint.actual)} SP` : 'Real: ainda sem dado']
    : [];
  const tooltipHeight = tooltipLines.length * TOOLTIP_LINE_HEIGHT + 10;
  const tooltipOnRight = hoverIndex !== null && x(hoverIndex) + 10 + TOOLTIP_WIDTH <= plotWidth;
  const tooltipX = hoverIndex !== null ? (tooltipOnRight ? x(hoverIndex) + 10 : x(hoverIndex) - 10 - TOOLTIP_WIDTH) : 0;

  return (
    <div ref={containerRef}>
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        style={{ maxWidth: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTickValues.map((value) => (
            <g key={value}>
              <line x1={0} x2={plotWidth} y1={y(value)} y2={y(value)} stroke="var(--gridline)" strokeWidth={1} />
              <text x={-6} y={y(value)} textAnchor="end" dominantBaseline="middle" fontSize={9.5} fill="var(--text-muted)">
                {Math.round(value)}
              </text>
            </g>
          ))}

          {xLabelIndexes.map((i) => (
            <text key={i} x={x(i)} y={PLOT_HEIGHT + 16} textAnchor="middle" fontSize={9.5} fill="var(--text-muted)">
              {formatShort(points[i].date)}
            </text>
          ))}

          <path d={idealPath} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="4 3" />

          {actualSegments.map((d, i) => (
            <path key={i} d={d.trim()} fill="none" stroke="var(--series-impl)" strokeWidth={2} />
          ))}

          {points.map((p, i) => (p.actual === null ? null : <circle key={p.date} cx={x(i)} cy={y(p.actual)} r={3} fill="var(--series-impl)" />))}

          {hoverPoint && (
            <g pointerEvents="none">
              <line x1={x(hoverIndex!)} x2={x(hoverIndex!)} y1={0} y2={PLOT_HEIGHT} stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="2 2" />
              <circle cx={x(hoverIndex!)} cy={y(hoverPoint.ideal)} r={4} fill="var(--text-muted)" stroke="var(--surface-1)" strokeWidth={1.5} />
              {hoverPoint.actual !== null && (
                <circle cx={x(hoverIndex!)} cy={y(hoverPoint.actual)} r={5} fill="var(--series-impl)" stroke="var(--surface-1)" strokeWidth={1.5} />
              )}

              <g transform={`translate(${tooltipX},0)`}>
                <rect width={TOOLTIP_WIDTH} height={tooltipHeight} rx={6} fill="var(--surface-1)" stroke="var(--gridline)" />
                {tooltipLines.map((line, i) => (
                  <text
                    key={i}
                    x={10}
                    y={10 + i * TOOLTIP_LINE_HEIGHT}
                    fontSize={10.5}
                    fontWeight={i === 0 ? 700 : 400}
                    fill={i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          )}
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={16} height={2} aria-hidden>
            <line x1={0} x2={16} y1={1} y2={1} stroke="var(--series-impl)" strokeWidth={2} />
          </svg>
          Real
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={16} height={2} aria-hidden>
            <line x1={0} x2={16} y1={1} y2={1} stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="4 3" />
          </svg>
          Ideal
        </span>
      </div>
    </div>
  );
}

function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
