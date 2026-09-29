export interface BugLabelInfo {
  text: string;
  /** Cor CSS (var categórica) — usada tanto no badge inline quanto na fatia da pizza. */
  color: string;
  /** Hex correspondente, para cálculo de contraste do texto sobre a fatia da pizza. */
  hex: string;
}

const KNOWN_LABELS: Record<string, BugLabelInfo> = {
  bug_alteracao_requisito: { text: 'Alteração de requisito', color: 'var(--cat-1)', hex: '#2a78d6' },
  bug_requisito_nao_implementado: { text: 'Requisito não implementado', color: 'var(--cat-2)', hex: '#eb6834' },
  bug_prototipo_nao_atendido: { text: 'Protótipo não atendido', color: 'var(--cat-3)', hex: '#1baf7a' },
  bug_devolvido: { text: 'Devolvido', color: 'var(--cat-4)', hex: '#eda100' },
  bug_liberacao_nao_validada: { text: 'Liberação não validada', color: 'var(--cat-5)', hex: '#e87ba4' },
  bug_impeditivo: { text: 'Impeditivo', color: 'var(--cat-6)', hex: '#008300' },
};

const FALLBACK_COLOR = 'var(--text-muted)';
const FALLBACK_HEX = '#898781';

function fallbackText(rawLabel: string): string {
  const stripped = rawLabel.replace(/^bug_/, '').replace(/_/g, ' ');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** Traduz um rótulo (label) de bug do Jira para exibição — usado tanto nos badges inline quanto na pizza de distribuição por rótulo. */
export function describeBugLabel(rawLabel: string): BugLabelInfo {
  return KNOWN_LABELS[rawLabel] ?? { text: fallbackText(rawLabel), color: FALLBACK_COLOR, hex: FALLBACK_HEX };
}
