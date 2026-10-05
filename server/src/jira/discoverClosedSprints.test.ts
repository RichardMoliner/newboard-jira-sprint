import { describe, expect, test } from 'vitest';
import { extractClosedSprints } from './discoverClosedSprints.js';

const CLOSED_AUGUST =
  'com.atlassian.greenhopper.service.sprint.Sprint@1[id=7400,rapidViewId=28,state=CLOSED,name=ALM S08 2026,startDate=2026-08-01T00:00:00.000-03:00,endDate=2026-08-15T23:59:00.000-03:00,completeDate=2026-08-15T20:00:00.000-03:00,sequence=7400]';

const CLOSED_JULY =
  'com.atlassian.greenhopper.service.sprint.Sprint@2[id=7300,rapidViewId=28,state=CLOSED,name=ALM S07 2026,startDate=2026-07-01T00:00:00.000-03:00,endDate=2026-07-15T23:59:00.000-03:00,completeDate=2026-07-15T20:00:00.000-03:00,sequence=7300]';

const ACTIVE_SPRINT =
  'com.atlassian.greenhopper.service.sprint.Sprint@3[id=7590,rapidViewId=28,state=ACTIVE,name=ALM S09 2026 Edital,startDate=2026-09-03T00:00:06.884-03:00,endDate=2026-10-05T23:59:00.000-03:00,completeDate=<null>,sequence=7590]';

describe('extractClosedSprints', () => {
  test('extracts a closed sprint referenced by an issue', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_AUGUST] }], '2026-01-01');
    expect(result).toEqual([
      { id: '7400', name: 'ALM S08 2026', startDate: '2026-08-01', endDate: '2026-08-15', startDateTime: '2026-08-01T00:00:00.000-03:00', endDateTime: '2026-08-15T20:00:00.000-03:00' },
    ]);
  });

  test('dedupes the same sprint referenced by multiple issues', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_AUGUST] }, { customfield_10001: [CLOSED_AUGUST] }], '2026-01-01');
    expect(result).toHaveLength(1);
  });

  test('excludes a sprint that is not CLOSED (e.g. ACTIVE)', () => {
    const result = extractClosedSprints([{ customfield_10001: [ACTIVE_SPRINT] }], '2026-01-01');
    expect(result).toEqual([]);
  });

  test('excludes a closed sprint that started before the given date', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_JULY] }], '2026-08-01');
    expect(result).toEqual([]);
  });

  test('includes a closed sprint that started exactly on the given date', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_AUGUST] }], '2026-08-01');
    expect(result).toHaveLength(1);
  });

  test('extracts multiple distinct closed sprints across issues, sorted by startDate descending', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_JULY] }, { customfield_10001: [CLOSED_AUGUST] }], '2026-01-01');
    expect(result.map((s) => s.id)).toEqual(['7400', '7300']);
  });

  test('picks up every closed sprint an issue passed through, not just one', () => {
    const result = extractClosedSprints([{ customfield_10001: [CLOSED_JULY, CLOSED_AUGUST, ACTIVE_SPRINT] }], '2026-01-01');
    expect(result.map((s) => s.id)).toEqual(['7400', '7300']);
  });

  test('returns an empty array for no issues', () => {
    expect(extractClosedSprints([], '2026-01-01')).toEqual([]);
  });

  test('handles an issue with no sprint field at all', () => {
    expect(extractClosedSprints([{ customfield_10001: undefined }], '2026-01-01')).toEqual([]);
  });
});
