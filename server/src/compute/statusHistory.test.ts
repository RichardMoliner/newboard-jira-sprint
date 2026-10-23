import { describe, expect, test } from 'vitest';
import { computeStatusHistory } from './statusHistory.js';

describe('computeStatusHistory', () => {
  test('story not started yet: single open "Ainda não iniciada" segment ending today', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: null,
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: true,
      doneTransitionDate: '2026-09-08T14:30:00.000-03:00',
      storyUpdated: '2026-09-08T14:30:00.000-03:00',
      today: '2026-09-10',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' });
    expect(result[result.length - 1]).toEqual({ status: 'Concluída', start: '2026-09-08', end: '2026-09-10' });
  });

  test('data anomaly: implCodeReviewEnteredAt later than implDoneDate (different upstream sources disagree) clamps "Em code review" to zero duration instead of going negative', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-06',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-06',
      today: '2026-09-09',
    });

    const codeReview = result.find((segment) => segment.status === 'Em code review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.start).toBe('2026-09-06');
    expect(codeReview!.end).toBe('2026-09-06');
    expect(codeReview!.start).toBe(codeReview!.end);
  });

  test('isDone true but implStartDate is null (data anomaly): does not throw, returns a sane single segment instead of crashing the whole fetch', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null, implStartDate: null, implCodeReviewEnteredAt: null,
      implDone: false, implDoneDate: null, firstTestWorklogDate: null,
      testDone: false, testDoneDate: null, firstDevBugWorklogDate: null, lastDevBugWorklogDate: null, firstTesterBugWorklogDate: null, lastTesterBugWorklogDate: null, isDone: true, doneTransitionDate: '2026-09-05',
      storyUpdated: '2026-09-05', today: '2026-09-08',
    });
    expect(result).toEqual([{ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-05' }]);
  });

  test('"Ainda não iniciada" starts at sprintEnteredAt, not storyCreated, when the story is not carried over', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-08-01',
      sprintEnteredAt: '2026-09-03T10:00:00.000-03:00',
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-04',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-04',
      today: '2026-09-06',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-09-03', end: '2026-09-04' });
  });

  test('"Ainda não iniciada" starts at storyCreated (not sprintEnteredAt) for a carried-over story — the wait-time clock does not reset when it rolls to a new sprint', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-08-01',
      sprintEnteredAt: '2026-09-03T10:00:00.000-03:00', // entrou na sprint ATUAL, mas é herdada
      isCarried: true,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-04',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-04',
      today: '2026-09-06',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-08-01', end: '2026-09-04' });
  });

  test('falls back to storyCreated when sprintEnteredAt is null (story created already inside the sprint, no Sprint-field changelog event)', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-03',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-04',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-04',
      today: '2026-09-06',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-09-03', end: '2026-09-04' });
  });

  test('"Ainda não iniciada" ends at emAndamentoEnteredAt (literal Jira status transition), not implStartDate, when both are present', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: '2026-09-02',
      implStartDate: '2026-09-05', // só criou a subtarefa de Implementação bem depois
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-05',
      today: '2026-09-06',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-06' },
    ]);
  });

  test('falls back to implStartDate when emAndamentoEnteredAt is null (status da story nunca mudou literalmente — progresso só via subtarefa)', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-02',
      today: '2026-09-06',
    });

    expect(result[0]).toEqual({ status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' });
  });

  test('progresses past "Ainda não iniciada" using emAndamentoEnteredAt alone, even with no Implementação subtask yet (implStartDate null)', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: '2026-09-02',
      implStartDate: null,
      implCodeReviewEnteredAt: null,
      implDone: false,
      implDoneDate: null,
      firstTestWorklogDate: null,
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
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

  test('inserts "Correção de bugs" between "Em testes" and "Aguardando liberação" when the dev logged bug worklogs', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: '2026-09-07',
      lastDevBugWorklogDate: '2026-09-09',
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: true,
      doneTransitionDate: '2026-09-10',
      storyUpdated: '2026-09-10',
      today: '2026-09-12',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-06' },
      { status: 'Em testes', start: '2026-09-06', end: '2026-09-07' },
      { status: 'Correção de bugs', start: '2026-09-07', end: '2026-09-09' },
      { status: 'Aguardando liberação', start: '2026-09-07', end: '2026-09-10' },
      { status: 'Concluída', start: '2026-09-10', end: '2026-09-12' },
    ]);
  });

  test('omits "Correção de bugs" entirely when the dev never logged a bug worklog', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-07',
      today: '2026-09-09',
    });

    expect(result.some((segment) => segment.status === 'Correção de bugs')).toBe(false);
  });

  test('a single dev bug worklog entry (first === last) produces a zero-duration "Correção de bugs" segment, not a crash', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: '2026-09-07',
      lastDevBugWorklogDate: '2026-09-07',
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-07',
      today: '2026-09-09',
    });

    const bugFix = result.find((segment) => segment.status === 'Correção de bugs');
    expect(bugFix).toEqual({ status: 'Correção de bugs', start: '2026-09-07', end: '2026-09-07' });
  });

  test('"Correção de bugs" does not appear before "Aguardando liberação" is reached (testDone false), even with dev bug worklogs already logged', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: false,
      testDoneDate: null,
      firstDevBugWorklogDate: '2026-09-07',
      lastDevBugWorklogDate: '2026-09-08',
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-08',
      today: '2026-09-09',
    });

    expect(result.some((segment) => segment.status === 'Correção de bugs')).toBe(false);
  });

  test('inserts "Teste de bugs" after "Correção de bugs" when the tester logged bug worklogs, independent of dev worklogs', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: '2026-09-04',
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: '2026-09-07',
      lastDevBugWorklogDate: '2026-09-08',
      firstTesterBugWorklogDate: '2026-09-09',
      lastTesterBugWorklogDate: '2026-09-10',
      isDone: true,
      doneTransitionDate: '2026-09-11',
      storyUpdated: '2026-09-11',
      today: '2026-09-13',
    });

    expect(result).toEqual([
      { status: 'Ainda não iniciada', start: '2026-09-01', end: '2026-09-02' },
      { status: 'Em andamento', start: '2026-09-02', end: '2026-09-04' },
      { status: 'Em code review', start: '2026-09-04', end: '2026-09-05' },
      { status: 'Ag. início dos testes', start: '2026-09-05', end: '2026-09-06' },
      { status: 'Em testes', start: '2026-09-06', end: '2026-09-07' },
      { status: 'Correção de bugs', start: '2026-09-07', end: '2026-09-08' },
      { status: 'Teste de bugs', start: '2026-09-09', end: '2026-09-10' },
      { status: 'Aguardando liberação', start: '2026-09-07', end: '2026-09-11' },
      { status: 'Concluída', start: '2026-09-11', end: '2026-09-13' },
    ]);
  });

  test('"Teste de bugs" can appear without "Correção de bugs" (tester logged bug worklogs, dev never did)', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: '2026-09-08',
      lastTesterBugWorklogDate: '2026-09-08',
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-08',
      today: '2026-09-09',
    });

    expect(result.some((segment) => segment.status === 'Correção de bugs')).toBe(false);
    const bugTest = result.find((segment) => segment.status === 'Teste de bugs');
    expect(bugTest).toEqual({ status: 'Teste de bugs', start: '2026-09-08', end: '2026-09-08' });
  });

  test('omits "Teste de bugs" entirely when the tester never logged a bug worklog', () => {
    const result = computeStatusHistory({
      storyCreated: '2026-09-01',
      sprintEnteredAt: null,
      isCarried: false,
      emAndamentoEnteredAt: null,
      implStartDate: '2026-09-02',
      implCodeReviewEnteredAt: null,
      implDone: true,
      implDoneDate: '2026-09-05',
      firstTestWorklogDate: '2026-09-06',
      testDone: true,
      testDoneDate: '2026-09-07',
      firstDevBugWorklogDate: null,
      lastDevBugWorklogDate: null,
      firstTesterBugWorklogDate: null,
      lastTesterBugWorklogDate: null,
      isDone: false,
      doneTransitionDate: null,
      storyUpdated: '2026-09-07',
      today: '2026-09-09',
    });

    expect(result.some((segment) => segment.status === 'Teste de bugs')).toBe(false);
  });
});
