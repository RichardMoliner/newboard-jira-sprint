import type { BugLabelSummary } from '../indicators/computeIndicators.js';
import { describeBugLabel } from '../bugLabels.js';
import { pieSliceAngles, readableTextColor } from './StatusPieChart.js';

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 92;
/** Fatias com menos que isso do círculo não recebem rótulo direto — pouco espaço pro texto. */
const MIN_FRACTION_FOR_LABEL = 0.08;

function polarToCartesian(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function describeSweep(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(startAngle, RADIUS);
  const end = polarToCartesian(endAngle, RADIUS);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `L ${start.x},${start.y} A ${RADIUS},${RADIUS} 0 ${largeArc},1 ${end.x},${end.y}`;
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

/**
 * Distribuição dos rótulos (labels) dos bugs — como um bug pode ter mais de um rótulo, as fatias
 * representam proporção entre ocorrências de rótulo, não bugs (a soma pode passar de 100% dos bugs).
 */
export default function BugLabelsPieChart({ summaries }: { summaries: BugLabelSummary[] }) {
  const slices = summaries.map((s) => ({ ...describeBugLabel(s.label), count: s.count }));
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const angles = pieSliceAngles(slices.map((s) => s.count));

  if (total === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Nenhum bug com rótulo para exibir.</p>;
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => {
          const { startAngle, endAngle } = angles[i];
          const fraction = s.count / total;
          const labelAngle = (startAngle + endAngle) / 2;
          const labelPos = polarToCartesian(labelAngle, RADIUS * 0.62);
          return (
            <g key={s.text}>
              <path d={arcPath(startAngle, endAngle)} fill={s.color} stroke="var(--surface-1)" strokeWidth={2}>
                <title>
                  {s.text}: {s.count} ocorrência{s.count === 1 ? '' : 's'} ({Math.round(fraction * 100)}%)
                </title>
              </path>
              {fraction >= MIN_FRACTION_FOR_LABEL && (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill={readableTextColor(s.hex)}
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
        {slices.map((s) => {
          const percent = Math.round((s.count / total) * 100);
          return (
            <div key={s.text} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{s.text}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {s.count} · {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
