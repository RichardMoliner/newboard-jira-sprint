import type { StatusSummary } from '../indicators/computeIndicators.js';
import { foldStatusSummariesForChart } from '../indicators/computeIndicators.js';

const MAX_SLICES = 7;
const SLOT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)'];
const OTHERS_COLOR = 'var(--text-muted)';
const OTHERS_HEX = '#898781';
const SLOT_HEXES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 92;
/** Fatias com menos que isso do círculo não recebem rótulo direto — pouco espaço pro texto. */
const MIN_FRACTION_FOR_LABEL = 0.08;

/** Ângulos cumulativos (graus, sentido horário a partir de -90°/12h) de cada fatia proporcional ao total. */
export function pieSliceAngles(values: number[]): { startAngle: number; endAngle: number }[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];

  let cursor = -90;
  return values.map((value) => {
    const sweep = (value / total) * 360;
    const slice = { startAngle: cursor, endAngle: cursor + sweep };
    cursor += sweep;
    return slice;
  });
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Preto ou branco, o que tiver mais contraste (WCAG) sobre o preenchimento — cores categóricas
 * saturadas (amarelo, laranja) têm luminância relativa baixa mesmo parecendo "claras" a olho nu, por
 * isso comparamos os dois contrastes em vez de usar um limiar único de luminância.
 */
export function readableTextColor(hex: string): '#0b0b0b' | '#ffffff' {
  return contrastRatio(hex, '#0b0b0b') >= contrastRatio(hex, '#ffffff') ? '#0b0b0b' : '#ffffff';
}

function polarToCartesian(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function arcPath(startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle;
  // Um arco de 360° com os mesmos pontos de início/fim é ambíguo pro SVG (vira um ponto) — desenha
  // como dois semicírculos de 180° quando a fatia é o total sozinha.
  if (sweep >= 359.99) {
    const mid = startAngle + 180;
    return `${arcPath(startAngle, mid)} ${describeSweep(mid, endAngle)}`.trim();
  }
  return `M ${CENTER},${CENTER} ${describeSweep(startAngle, endAngle)} Z`;
}

function describeSweep(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(startAngle, RADIUS);
  const end = polarToCartesian(endAngle, RADIUS);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `L ${start.x},${start.y} A ${RADIUS},${RADIUS} 0 ${largeArc},1 ${end.x},${end.y}`;
}

export default function StatusPieChart({ summaries }: { summaries: StatusSummary[] }) {
  const slices = foldStatusSummariesForChart(summaries, MAX_SLICES);
  const total = slices.reduce((sum, s) => sum + s.activities, 0);
  const angles = pieSliceAngles(slices.map((s) => s.activities));

  if (total === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Sem atividades para exibir.</p>;
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => {
          const { startAngle, endAngle } = angles[i];
          const fraction = s.activities / total;
          const isOthers = s.status === 'Outros';
          const color = isOthers ? OTHERS_COLOR : SLOT_COLORS[i];
          const hex = isOthers ? OTHERS_HEX : SLOT_HEXES[i];
          const labelAngle = (startAngle + endAngle) / 2;
          const labelPos = polarToCartesian(labelAngle, RADIUS * 0.62);
          return (
            <g key={s.status}>
              <path d={arcPath(startAngle, endAngle)} fill={color} stroke="var(--surface-1)" strokeWidth={2}>
                <title>
                  {s.status}: {s.activities} atividade{s.activities === 1 ? '' : 's'} ({Math.round(fraction * 100)}%)
                </title>
              </path>
              {fraction >= MIN_FRACTION_FOR_LABEL && (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill={readableTextColor(hex)}
                  fontSize={11}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {Math.round(fraction * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
        {slices.map((s, i) => {
          const isOthers = s.status === 'Outros';
          const color = isOthers ? OTHERS_COLOR : SLOT_COLORS[i];
          const percent = Math.round((s.activities / total) * 100);
          return (
            <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{s.status}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {s.activities} · {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
