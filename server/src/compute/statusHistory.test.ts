import { describe, expect, test } from 'vitest';
import { computeStatusHistory } from './statusHistory.js';

describe('computeStatusHistory', () => {
  test('story not started yet: single open "Ainda não iniciada" segment ending today', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: null,
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-01',
      today: '2026-09-05',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-05' },
    ]);
  });

  test('story in andamento, never reached code review, not done: 2 segments, last ends today', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-02',
      today: '2026-09-06',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-06' },
    ]);
  });

  test('story in code review, not done: 3 segments, "Em code review" ends today', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-04',
      today: '2026-09-08',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-08' },
    ]);
  });

  test('story skipped code review entirely (implCodeReviewEnteredAt null) but implDone: no "Em code review" segment in the list', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-05',
      today: '2026-09-09',
    });

    expect(result.some((segment) => segment.status === 'Em code review')).toBe(false);
    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-09' },
    ]);
  });

  test('story implDone, test not started yet: 4 segments, "Ag. início dos testes" ends today', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-05',
      today: '2026-09-09',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-09' },
    ]);
  });

  test('story fully done, went through every phase: 7 segments, last is "Concluída" ending today, using doneTransitionDate as its start', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      isDone: true,
      doneTransitionDate: '2026-09-08',
      storyUpdated: '2026-09-08',
      today: '2026-09-10',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-06' },
      { status: 'Em testes', start: '2026-09-06', end: '2026-09-07' },
      { status: 'Aguardando liberação', start: '2026-09-07', end: '2026-09-08' },
      { status: 'Concluída', start: '2026-09-08', end: '2026-09-10' },
    ]);
  });

  test('story fully done but storyUpdated used as fallback when doneTransitionDate is null', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      isDone: true,
      doneTransitionDate: null,
      storyUpdated: '2026-09-08',
      today: '2026-09-10',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-06' },
      { status: 'Em testes', start: '2026-09-06', end: '2026-09-07' },
      { status: 'Aguardando liberação', start: '2026-09-07', end: '2026-09-08' },
      { status: 'Concluída', start: '2026-09-08', end: '2026-09-10' },
    ]);
  });

  test('truncates datetime inputs (storyCreated, doneTransitionDate, storyUpdated) to date-only in the segments', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01T10:00:00.000-03:00',
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      isDone: true,
      doneTransitionDate: '2026-09-08T14:30:00.000-03:00',
      storyUpdated: '2026-09-08T14:30:00.000-03:00',
      today: '2026-09-10',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' });
    expect(result[result.length - 1]).toEqual({ status: 'Concluída', start: '2026-09-08', end: '2026-09-10' });
  });

  test('isDone true but implStartDate is null (data anomaly): does not throw, returns a sane single segment instead of crashing the whole fetch', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01', implStartDate: null, implCodeReviewEnteredAt: null,
      implDone: false, implDoneDate: null, firstTestWorklogDate: null,
      testDone: false, testDoneDate: null, isDone: true, doneTransitionDate: '2026-09-05',
      storyUpdated: '2026-09-05', today: '2026-09-08',
    });
    expect(result).toEqual([{ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-05' }]);
  });
});
