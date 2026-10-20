import { describe, expect, test } from 'vitest';
import {
  applyGroupSelection,
  computeGroupClickFilter,
  computeInitialSprintFilter,
  countGroupChecked,
  groupSprintsByType,
} from './sprintGrouping.js';
import type { SprintInfo, SprintSettings } from './types.js';

function sprint(id: string, overrides: Partial<SprintInfo> = {}): SprintInfo {
  return {
    id,
    name: `Sprint ${id}`,
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    startDateTime: '2026-09-01T00:00:00.000-03:00',
    endDateTime: '2026-09-15T23:59:00.000-03:00',
    ...overrides,
  };
}

function settings(overrides: Partial<SprintSettings> = {}): SprintSettings {
  return {
    hoursPerPf: null,
    hoursPerDay: null,
    lastPublishDay: null,
    lastTestDay: null,
    publishDay: null,
    group: null,
    includedInGroupFilter: true,
    ...overrides,
  };
}

describe('groupSprintsByType', () => {
  test('groups sprints that have a group type set, in sprint order', () => {
    const sprints = [sprint('1'), sprint('2'), sprint('3')];
    const settingsById = {
      '1': settings({ group: 'aplicacao' }),
      '3': settings({ group: 'aplicacao' }),
    };
    expect(groupSprintsByType(sprints, settingsById)).toEqual([
      { type: 'aplicacao', sprints: [sprints[0], sprints[2]] },
    ]);
  });

  test('ignores sprints with no group or no settings at all', () => {
    const sprints = [sprint('1'), sprint('2')];
    const settingsById = { '1': settings({ group: null }) };
    expect(groupSprintsByType(sprints, settingsById)).toEqual([]);
  });

  test('separates sprints into multiple group buckets', () => {
    const sprints = [sprint('1'), sprint('2')];
    const settingsById = {
      '1': settings({ group: 'aplicacao' }),
      '2': settings({ group: 'extensao' }),
    };
    expect(groupSprintsByType(sprints, settingsById)).toEqual([
      { type: 'aplicacao', sprints: [sprints[0]] },
      { type: 'extensao', sprints: [sprints[1]] },
    ]);
  });
});

describe('computeInitialSprintFilter', () => {
  test('returns [] (sem filtro) when no sprint is excluded', () => {
    const sprints = [sprint('1'), sprint('2')];
    const settingsById = { '1': settings({ group: 'aplicacao', includedInGroupFilter: true }) };
    expect(computeInitialSprintFilter(sprints, settingsById)).toEqual([]);
  });

  test('returns [] when nothing has settings at all (ungrouped, always included)', () => {
    expect(computeInitialSprintFilter([sprint('1'), sprint('2')], {})).toEqual([]);
  });

  test('excludes sprints marked includedInGroupFilter: false in their group', () => {
    const sprints = [sprint('1'), sprint('2'), sprint('3')];
    const settingsById = {
      '2': settings({ group: 'aplicacao', includedInGroupFilter: false }),
    };
    expect(computeInitialSprintFilter(sprints, settingsById)).toEqual(['1', '3']);
  });

  test('a sprint with no group is always included even if includedInGroupFilter happens to be false', () => {
    const sprints = [sprint('1')];
    const settingsById = { '1': settings({ group: null, includedInGroupFilter: false }) };
    expect(computeInitialSprintFilter(sprints, settingsById)).toEqual([]);
  });
});

describe('countGroupChecked', () => {
  test('counts every group sprint as checked when the current filter is empty (todas as sprints)', () => {
    expect(countGroupChecked(['1', '2', '3'], [], ['1', '2'])).toBe(2);
  });

  test('counts only the group sprints present in a non-empty filter', () => {
    expect(countGroupChecked(['1', '2', '3'], ['1'], ['1', '2'])).toBe(1);
  });
});

describe('applyGroupSelection', () => {
  test('checking a sprint while filter is empty (todas) keeps everyone but that one explicit', () => {
    const result = applyGroupSelection(['1', '2', '3'], [], ['2'], true);
    expect(result).toEqual([]);
  });

  test('unchecking a sprint while filter is empty (todas) produces an explicit list without it', () => {
    const result = applyGroupSelection(['1', '2', '3'], [], ['2'], false);
    expect(result).toEqual(['1', '3']);
  });

  test('re-checking the last excluded sprint collapses back to [] (todas as sprints)', () => {
    const result = applyGroupSelection(['1', '2', '3'], ['1', '3'], ['2'], true);
    expect(result).toEqual([]);
  });

  test('can toggle a whole group at once (marcar/desmarcar todas)', () => {
    const uncheckAll = applyGroupSelection(['1', '2', '3'], [], ['1', '2'], false);
    expect(uncheckAll).toEqual(['3']);

    const recheckAll = applyGroupSelection(['1', '2', '3'], ['3'], ['1', '2'], true);
    expect(recheckAll).toEqual([]);
  });

  test('preserves the original sprint order in the resulting list', () => {
    const result = applyGroupSelection(['1', '2', '3', '4'], ['1', '2', '3', '4'], ['3'], false);
    expect(result).toEqual(['1', '2', '4']);
  });
});

describe('computeGroupClickFilter', () => {
  test('plain click replaces the filter with exactly the group sprints', () => {
    expect(computeGroupClickFilter(['1', '2', '3'], [], ['1', '2'], false)).toEqual(['1', '2']);
    expect(computeGroupClickFilter(['1', '2', '3'], ['3'], ['1', '2'], false)).toEqual(['1', '2']);
  });

  test('plain click on a group covering every sprint collapses to [] (todas as sprints)', () => {
    expect(computeGroupClickFilter(['1', '2'], ['1'], ['1', '2'], false)).toEqual([]);
  });

  test('shift-click adds the group to the current selection when not fully present', () => {
    expect(computeGroupClickFilter(['1', '2', '3', '4'], ['3'], ['1', '2'], true)).toEqual(['1', '2', '3']);
  });

  test('shift-click removes the group from the current selection when fully present', () => {
    expect(computeGroupClickFilter(['1', '2', '3', '4'], ['1', '2', '3'], ['1', '2'], true)).toEqual(['3']);
  });

  test('shift-click treats an empty filter (todas) as everyone selected, so it can remove just the group', () => {
    expect(computeGroupClickFilter(['1', '2', '3'], [], ['1', '2'], true)).toEqual(['3']);
  });

  test('shift-click re-adding a group that completes the full set collapses to [] (todas as sprints)', () => {
    expect(computeGroupClickFilter(['1', '2'], ['1'], ['2'], true)).toEqual([]);
  });
});
