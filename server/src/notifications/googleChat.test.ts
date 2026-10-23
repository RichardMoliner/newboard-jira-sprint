import { describe, test, expect, vi } from 'vitest';
import { Activity } from '../domain/types';
import { formatEarlyDeliveryMessage, sendGoogleChatMessage } from './googleChat';
import { DueNotification } from './eligibility';

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    key: 'PROJ-1',
    url: 'https://jira/PROJ-1',
    title: 'Tarefa',
    sprintId: 's1',
    sprintName: 'Sprint 1',
    isCarried: false,
    developer: 'Fulano',
    tester: null,
    storyPoints: null,
    startDate: '2026-10-01',
    dueDate: null,
    deliveredDate: null,
    deliveredOnTime: null,
    assertividadePercent: null,
    assertividadeComBugsPercent: null,
    status: 'Em andamento',
    isDone: false,
    isOverdue: false,
    notStarted: false,
    implDone: false,
    implDoneDate: null,
    testDone: false,
    implWindow: null,
    testWindow: null,
    statusHistory: [],
    implEstimatedHours: null,
    testEstimatedHours: null,
    implLoggedHours: null,
    testLoggedHours: null,
    bugsLoggedHours: null,
    implBugsLoggedHours: null,
    testBugsLoggedHours: null,
    worklogEntries: [],
    bugs: [],
    addedAfterSprintStart: false,
    sprintEnteredAt: null,
    notImpactsDeploy: false,
    earlyDelivery: true,
    featureFlag: false,
    legalRequirement: null,
    legalDeadline: '2026-10-27',
    ...overrides,
  };
}

describe('formatEarlyDeliveryMessage', () => {
  test('formata com dias restantes positivos', () => {
    const notification: DueNotification = {
      activity: activity({ key: 'PROJ-1', title: 'Corrigir X', url: 'https://jira/PROJ-1', developer: 'Fulano' }),
      milestone: 5,
      daysRemaining: 5,
    };
    expect(formatEarlyDeliveryMessage(notification)).toBe(
      'Liberação antecipada — faltam 5 dias\nCorrigir X\nhttps://jira/PROJ-1\nDev: Fulano',
    );
  });

  test('marco 0 com dias restantes 0 (dia da liberação)', () => {
    const notification: DueNotification = {
      activity: activity({ title: 'Y', url: 'https://jira/PROJ-2', developer: 'Ciclana' }),
      milestone: 0,
      daysRemaining: 0,
    };
    expect(formatEarlyDeliveryMessage(notification)).toBe(
      'Liberação antecipada — é hoje\nY\nhttps://jira/PROJ-2\nDev: Ciclana',
    );
  });

  test('marco 0 com dias restantes negativos (prazo já vencido)', () => {
    const notification: DueNotification = {
      activity: activity({ title: 'Z', url: 'https://jira/PROJ-3', developer: 'Beltrano' }),
      milestone: 0,
      daysRemaining: -2,
    };
    expect(formatEarlyDeliveryMessage(notification)).toBe(
      'Liberação antecipada — prazo já passou\nZ\nhttps://jira/PROJ-3\nDev: Beltrano',
    );
  });
});

describe('sendGoogleChatMessage', () => {
  test('faz POST com o payload { text } e retorna ok quando a resposta é 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
    expect(fetchMock).toHaveBeenCalledWith('https://chat.googleapis.com/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'oi' }),
    });
    expect(result).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  test('retorna ok:false com erro quando a resposta não é 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
    const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
    vi.unstubAllGlobals();
  });

  test('retorna ok:false com erro quando fetch rejeita (sem lançar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await sendGoogleChatMessage('https://chat.googleapis.com/hook', 'oi');
    expect(result).toEqual({ ok: false, error: 'network down' });
    vi.unstubAllGlobals();
  });
});
