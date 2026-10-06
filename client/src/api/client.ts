import type { SprintInfo, SprintSettings } from '../types.js';

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Erro ${res.status} ao chamar ${path}`);
  }
  return body as T;
}

export interface AppConfig {
  vertical: string | null;
  jiraUsername: string | null;
  jiraPasswordSet: boolean;
  hoursPerDay: number;
  dashDelayBar: boolean;
  autoRefreshEnabled: boolean;
}

export interface SaveConfigInput {
  vertical: string;
  jiraUsername: string;
  /** Em branco na edição mantém a senha já salva. */
  jiraPassword: string;
  hoursPerDay: number;
  dashDelayBar: boolean;
  autoRefreshEnabled: boolean;
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/config');
}

export function saveConfig(input: SaveConfigInput): Promise<AppConfig> {
  return request<AppConfig>('/config', { method: 'POST', body: JSON.stringify(input) });
}

export function getBoardData<T>(): Promise<T> {
  return request<T>('/board-data');
}

export function getBoardDataProgress(): Promise<{ messages: string[] }> {
  return request<{ messages: string[] }>('/board-data/progress');
}

export function getHistoricalSprints(since: string): Promise<{ sprints: SprintInfo[] }> {
  return request<{ sprints: SprintInfo[] }>(`/historical-sprints?since=${encodeURIComponent(since)}`);
}

export function getHistoricalBoardData<T>(sprintIds: string[]): Promise<T> {
  return request<T>(`/historical-board-data?sprintIds=${encodeURIComponent(sprintIds.join(','))}`);
}

/** Configuração (horas/PF e prazos) de todas as sprints já salvas, chaveada pelo id da sprint. */
export function getSprintSettings(): Promise<Record<string, SprintSettings>> {
  return request<Record<string, SprintSettings>>('/sprint-settings');
}

export function saveSprintSettings(sprintId: string, input: SprintSettings): Promise<SprintSettings> {
  return request<SprintSettings>(`/sprint-settings/${encodeURIComponent(sprintId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
