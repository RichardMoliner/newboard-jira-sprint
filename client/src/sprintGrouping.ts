import type { SprintInfo, SprintSettings } from './types.js';

export type SprintGroupType = 'aplicacao' | 'extensao';

export const SPRINT_GROUP_LABELS: Record<SprintGroupType, string> = {
  aplicacao: 'Aplicação',
  extensao: 'Extensões',
};

export interface SprintGroup {
  type: SprintGroupType;
  sprints: SprintInfo[];
}

/** Agrupa as sprints que têm um tipo definido na configuração, preservando a ordem original das
 * sprints; sprints sem tipo ficam de fora (continuam como pills individuais na barra de filtros). */
export function groupSprintsByType(sprints: SprintInfo[], sprintSettingsById: Record<string, SprintSettings>): SprintGroup[] {
  const buckets = new Map<SprintGroupType, SprintInfo[]>();
  for (const sprint of sprints) {
    const group = sprintSettingsById[sprint.id]?.group;
    if (group !== 'aplicacao' && group !== 'extensao') continue;
    const list = buckets.get(group) ?? [];
    list.push(sprint);
    buckets.set(group, list);
  }
  return [...buckets.entries()].map(([type, groupSprints]) => ({ type, sprints: groupSprints }));
}

/**
 * Filtro inicial do painel ao carregar — sprints marcadas como excluídas (`includedInGroupFilter:
 * false`) num grupo ficam de fora; sprints sem grupo estão sempre inclusas. Quando nada está
 * excluído retorna `[]` (equivalente a "Todas as sprints", mesmo destaque/comportamento de hoje).
 */
export function computeInitialSprintFilter(sprints: SprintInfo[], sprintSettingsById: Record<string, SprintSettings>): string[] {
  const included = sprints.filter((s) => {
    const settings = sprintSettingsById[s.id];
    if (!settings || settings.group == null) return true;
    return settings.includedInGroupFilter;
  });
  return included.length === sprints.length ? [] : included.map((s) => s.id);
}

/** Quantas sprints do grupo estão marcadas no filtro atual da sessão — filtro vazio ([]) significa "todas". */
export function countGroupChecked(allSprintIds: string[], currentFilter: string[], groupSprintIds: string[]): number {
  if (currentFilter.length === 0) return groupSprintIds.length;
  return groupSprintIds.filter((id) => currentFilter.includes(id)).length;
}

/**
 * Novo `sprintFilter` da sessão ao marcar/desmarcar uma ou mais sprints no popover do agrupador
 * (usado tanto pro checkbox individual quanto por "Marcar/Desmarcar todas"). Parte do conjunto
 * efetivamente em escopo — todas as sprints quando o filtro está vazio — aplica a mudança, e volta
 * a `[]` se o resultado passar a cobrir todas as sprints de novo.
 */
export function applyGroupSelection(
  allSprintIds: string[],
  currentFilter: string[],
  sprintIdsToToggle: string[],
  checked: boolean,
): string[] {
  const effective = new Set(currentFilter.length === 0 ? allSprintIds : currentFilter);
  for (const id of sprintIdsToToggle) {
    if (checked) effective.add(id);
    else effective.delete(id);
  }
  return effective.size === allSprintIds.length ? [] : allSprintIds.filter((id) => effective.has(id));
}

/**
 * Novo `sprintFilter` ao clicar diretamente na pill do agrupador (não na seta de abrir/fechar o
 * popover) — ação efêmera de filtro, igual ao clique numa pill de sprint individual, NÃO persiste.
 * Clique simples substitui a seleção pelas sprints do grupo; shift+clique soma/remove o grupo
 * inteiro da seleção atual, tratando filtro vazio (`[]`) como "todas selecionadas".
 */
export function computeGroupClickFilter(
  allSprintIds: string[],
  currentFilter: string[],
  groupSprintIds: string[],
  shiftKey: boolean,
): string[] {
  if (!shiftKey) {
    return groupSprintIds.length === allSprintIds.length ? [] : [...groupSprintIds];
  }
  const effective = new Set(currentFilter.length === 0 ? allSprintIds : currentFilter);
  const allPresent = groupSprintIds.every((id) => effective.has(id));
  for (const id of groupSprintIds) {
    if (allPresent) effective.delete(id);
    else effective.add(id);
  }
  return effective.size === allSprintIds.length ? [] : allSprintIds.filter((id) => effective.has(id));
}
