import { describe, expect, test } from 'vitest';
import { parseAllSprintFields, parseSprintField } from './parseSprintField.js';

const ACTIVE_SPRINT =
  'com.atlassian.greenhopper.service.sprint.Sprint@6da27755[id=7590,rapidViewId=28,state=ACTIVE,name=ALM S09 2026 Edital,startDate=2026-09-03T00:00:06.884-03:00,endDate=2026-10-05T23:59:00.000-03:00,completeDate=<null>,sequence=7590]';

const CLOSED_SPRINT =
  'com.atlassian.greenhopper.service.sprint.Sprint@1111111[id=7400,rapidViewId=28,state=CLOSED,name=ALM S08 2026,startDate=2026-08-01T00:00:00.000-03:00,endDate=2026-08-15T23:59:00.000-03:00,completeDate=2026-08-15T20:00:00.000-03:00,sequence=7400]';

describe('parseSprintField', () => {
  test('parses id, name, state, startDate and endDate (date-only) from a single raw sprint string', () => {
    expect(parseSprintField([ACTIVE_SPRINT])).toEqual({
      id: '7590',
      name: 'ALM S09 2026 Edital',
      state: 'ACTIVE',
      startDate: '2026-09-03',
      endDate: '2026-10-05',
      startDateTime: '2026-09-03T00:00:06.884-03:00',
      endDateTime: '2026-10-05T23:59:00.000-03:00',
    });
  });

  test('picks the ACTIVE sprint when an issue carries multiple sprint entries', () => {
    expect(parseSprintField([CLOSED_SPRINT, ACTIVE_SPRINT])).toEqual({
      id: '7590',
      name: 'ALM S09 2026 Edital',
      state: 'ACTIVE',
      startDate: '2026-09-03',
      endDate: '2026-10-05',
      startDateTime: '2026-09-03T00:00:06.884-03:00',
      endDateTime: '2026-10-05T23:59:00.000-03:00',
    });
  });

  test('falls back to the last entry when none is ACTIVE', () => {
    expect(parseSprintField([CLOSED_SPRINT])).toEqual({
      id: '7400',
      name: 'ALM S08 2026',
      state: 'CLOSED',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      startDateTime: '2026-08-01T00:00:00.000-03:00',
      endDateTime: '2026-08-15T20:00:00.000-03:00',
    });
  });

  test('uses completeDate (when present) instead of the nominal endDate, since a closed sprint often '
    + 'finishes a bit after its planned end', () => {
    const raw =
      'com.atlassian.greenhopper.service.sprint.Sprint@2[id=7561,rapidViewId=478,state=CLOSED,name=Compras S08 2026 Extensões,startDate=2026-08-11T00:00:13.092-03:00,endDate=2026-08-31T23:59:00.000-03:00,completeDate=2026-09-01T00:03:25.811-03:00,sequence=7561]';
    expect(parseSprintField([raw])).toEqual({
      id: '7561',
      name: 'Compras S08 2026 Extensões',
      state: 'CLOSED',
      startDate: '2026-08-11',
      endDate: '2026-09-01',
      startDateTime: '2026-08-11T00:00:13.092-03:00',
      endDateTime: '2026-09-01T00:03:25.811-03:00',
    });
  });

  test('ignores a literal "<null>" completeDate (sprint not yet closed) and keeps using endDate', () => {
    expect(parseSprintField([ACTIVE_SPRINT])?.endDate).toBe('2026-10-05');
  });

  test('returns null for an empty or missing field', () => {
    expect(parseSprintField(undefined)).toBeNull();
    expect(parseSprintField([])).toBeNull();
  });

  test('does not truncate a sprint name that itself contains a comma', () => {
    const raw =
      'com.atlassian.greenhopper.service.sprint.Sprint@abc[id=7576,rapidViewId=12,state=ACTIVE,name=COM - S9 - EL, Ed. e Melhorias,startDate=2026-09-03T00:00:00.000-03:00,endDate=2026-10-05T23:59:00.000-03:00,completeDate=<null>,sequence=7576]';
    expect(parseSprintField([raw])).toEqual({
      id: '7576',
      name: 'COM - S9 - EL, Ed. e Melhorias',
      state: 'ACTIVE',
      startDate: '2026-09-03',
      endDate: '2026-10-05',
      startDateTime: '2026-09-03T00:00:00.000-03:00',
      endDateTime: '2026-10-05T23:59:00.000-03:00',
    });
  });
});

describe('parseAllSprintFields', () => {
  test('returns every sprint entry parsed, not just the ACTIVE one', () => {
    const parsed = parseAllSprintFields([CLOSED_SPRINT, ACTIVE_SPRINT]);
    expect(parsed.map((s) => s.id)).toEqual(['7400', '7590']);
    expect(parsed.map((s) => s.state)).toEqual(['CLOSED', 'ACTIVE']);
  });

  test('returns an empty array for an empty or missing field', () => {
    expect(parseAllSprintFields(undefined)).toEqual([]);
    expect(parseAllSprintFields([])).toEqual([]);
  });

  test('skips an unparseable entry without throwing', () => {
    expect(parseAllSprintFields(['garbage', ACTIVE_SPRINT]).map((s) => s.id)).toEqual(['7590']);
  });
});
