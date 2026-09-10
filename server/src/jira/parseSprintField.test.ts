import { describe, expect, test } from 'vitest';
import { parseSprintField } from './parseSprintField.js';

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
    });
  });

  test('picks the ACTIVE sprint when an issue carries multiple sprint entries', () => {
    expect(parseSprintField([CLOSED_SPRINT, ACTIVE_SPRINT])).toEqual({
      id: '7590',
      name: 'ALM S09 2026 Edital',
      state: 'ACTIVE',
      startDate: '2026-09-03',
      endDate: '2026-10-05',
    });
  });

  test('falls back to the last entry when none is ACTIVE', () => {
    expect(parseSprintField([CLOSED_SPRINT])).toEqual({
      id: '7400',
      name: 'ALM S08 2026',
      state: 'CLOSED',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    });
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
    });
  });
});
