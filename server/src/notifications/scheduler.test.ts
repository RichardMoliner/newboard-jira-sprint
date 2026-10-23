import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Activity } from '../domain/types.js';
import { AppConfig, SprintSettings, writeConfig } from '../config/configStore.js';
import { readNotifiedState } from './notifiedStore.js';
import { fetchBoardData } from '../jira/fetchBoardData.js';
import { sendGoogleChatMessage } from './googleChat.js';
import { runEarlyDeliveryCheck } from './scheduler.js';

vi.mock('../jira/fetchBoardData.js', () => ({ fetchBoardData: vi.fn() }));
vi.mock('./googleChat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleChat.js')>();
  return { ...actual, sendGoogleChatMessage: vi.fn() };
});

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

function sprintSettings(overrides: Partial<SprintSettings> = {}): SprintSettings {
  return {
    hoursPerPf: null,
    hoursPerDay: null,
    lastPublishDay: null,
    lastTestDay: null,
    publishDay: null,
    group: null,
    includedInGroupFilter: false,
    ...overrides,
  };
}

function emptyConfig(): AppConfig {
  return {
    vertical: null,
    jiraUsername: null,
    jiraPassword: null,
    hoursPerDay: null,
    dashDelayBar: null,
    autoRefreshEnabled: null,
    sprintSettings: {},
    webhooks: { aplicacao: null, extensao: null },
  };
}

function fullConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    vertical: 'CONTRATOS',
    jiraUsername: 'richard.junior',
    jiraPassword: 'segredo',
    hoursPerDay: 8,
    dashDelayBar: null,
    autoRefreshEnabled: null,
    sprintSettings: {},
    webhooks: { aplicacao: null, extensao: null },
    ...overrides,
  };
}

const earlyDeliveryActivity = activity();

describe('runEarlyDeliveryCheck', () => {
  let tmpDir: string;
  let tmpConfigPath: string;
  let tmpNotifiedPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'painel-sprints-scheduler-'));
    tmpConfigPath = join(tmpDir, 'config.json');
    tmpNotifiedPath = join(tmpDir, 'notified.json');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('sem vertical/credenciais configuradas, não chama fetchBoardData e não lança', async () => {
    await writeConfig(tmpConfigPath, emptyConfig());
    await expect(runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath)).resolves.toBeUndefined();
    expect(fetchBoardData).not.toHaveBeenCalled();
  });

  test('tarefa elegível com sprint sem group configurado não envia e não marca como avisada', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig(),
      sprintSettings: { s1: sprintSettings({ group: null }) },
    });
    (fetchBoardData as Mock).mockResolvedValue({
      today: '2026-10-22',
      sprints: [],
      activities: [earlyDeliveryActivity],
    });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    expect(sendGoogleChatMessage).not.toHaveBeenCalled();
    expect(await readNotifiedState(tmpNotifiedPath)).toEqual({});
  });

  test('tarefa elegível com sprint de grupo "aplicacao" sem webhook configurado não envia e não marca como avisada', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig(),
      webhooks: { aplicacao: null, extensao: null },
      sprintSettings: { s1: sprintSettings({ group: 'aplicacao' }) },
    });
    (fetchBoardData as Mock).mockResolvedValue({
      today: '2026-10-22',
      sprints: [],
      activities: [earlyDeliveryActivity],
    });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    expect(sendGoogleChatMessage).not.toHaveBeenCalled();
    expect(await readNotifiedState(tmpNotifiedPath)).toEqual({});
  });

  test('tarefa elegível com sprint de grupo "aplicacao" e webhook configurado envia e marca como avisada', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig(),
      webhooks: { aplicacao: 'https://hook-a', extensao: null },
      sprintSettings: { s1: sprintSettings({ group: 'aplicacao' }) },
    });
    (fetchBoardData as Mock).mockResolvedValue({
      today: '2026-10-22',
      sprints: [],
      activities: [earlyDeliveryActivity],
    });
    (sendGoogleChatMessage as Mock).mockResolvedValue({ ok: true });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    expect(sendGoogleChatMessage).toHaveBeenCalledWith('https://hook-a', expect.any(String));
    const state = await readNotifiedState(tmpNotifiedPath);
    expect(state[earlyDeliveryActivity.key].milestones).toContain(5);
  });

  test('envio falha: não marca o marco como avisado', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig(),
      webhooks: { aplicacao: 'https://hook-a', extensao: null },
      sprintSettings: { s1: sprintSettings({ group: 'aplicacao' }) },
    });
    (fetchBoardData as Mock).mockResolvedValue({
      today: '2026-10-22',
      sprints: [],
      activities: [earlyDeliveryActivity],
    });
    (sendGoogleChatMessage as Mock).mockResolvedValue({ ok: false, error: 'timeout' });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    const state = await readNotifiedState(tmpNotifiedPath);
    expect(state[earlyDeliveryActivity.key]).toBeUndefined();
  });

  test('monta hoursPerPfBySprintId/hoursPerDayBySprintId a partir do sprintSettings e passa o fallback hoursPerDay', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig({ hoursPerDay: 8 }),
      webhooks: { aplicacao: 'https://hook-a', extensao: null },
      sprintSettings: {
        s1: sprintSettings({ group: 'aplicacao', hoursPerPf: 6, hoursPerDay: 7 }),
      },
    });
    (fetchBoardData as Mock).mockResolvedValue({ today: '2026-10-22', sprints: [], activities: [] });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    expect(fetchBoardData).toHaveBeenCalledWith(
      'CONTRATOS',
      { username: 'richard.junior', password: 'segredo' },
      { s1: 6 },
      { s1: 7 },
      8,
    );
  });

  test('lote com 3 notificações: uma pulada (sem grupo), uma com falha de envio e uma com sucesso — a falha/pulo de uma não bloqueia nem desfaz a persistência da outra', async () => {
    await writeConfig(tmpConfigPath, {
      ...fullConfig(),
      webhooks: { aplicacao: 'https://hook-a', extensao: null },
      sprintSettings: {
        'sem-grupo': sprintSettings({ group: null }),
        'falha-envio': sprintSettings({ group: 'aplicacao' }),
        sucesso: sprintSettings({ group: 'aplicacao' }),
      },
    });

    const skippedActivity = activity({ key: 'PROJ-SKIP', url: 'https://jira/PROJ-SKIP', sprintId: 'sem-grupo' });
    const failedActivity = activity({ key: 'PROJ-FAIL', url: 'https://jira/PROJ-FAIL', sprintId: 'falha-envio' });
    const succeededActivity = activity({ key: 'PROJ-OK', url: 'https://jira/PROJ-OK', sprintId: 'sucesso' });

    (fetchBoardData as Mock).mockResolvedValue({
      today: '2026-10-22',
      sprints: [],
      activities: [skippedActivity, failedActivity, succeededActivity],
    });

    (sendGoogleChatMessage as Mock).mockImplementation(async (_webhookUrl: string, text: string) => {
      if (text.includes(failedActivity.url)) {
        return { ok: false, error: 'timeout' };
      }
      return { ok: true };
    });

    await runEarlyDeliveryCheck(tmpConfigPath, tmpNotifiedPath);

    expect(sendGoogleChatMessage).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining(skippedActivity.url));
    expect(sendGoogleChatMessage).toHaveBeenCalledWith('https://hook-a', expect.stringContaining(failedActivity.url));
    expect(sendGoogleChatMessage).toHaveBeenCalledWith('https://hook-a', expect.stringContaining(succeededActivity.url));

    const state = await readNotifiedState(tmpNotifiedPath);
    expect(state[skippedActivity.key]).toBeUndefined();
    expect(state[failedActivity.key]).toBeUndefined();
    expect(state[succeededActivity.key].milestones).toContain(5);
  });
});
