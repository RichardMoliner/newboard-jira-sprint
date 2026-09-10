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
  hoursPerPf: number;
  hoursPerDay: number;
}

export interface SaveConfigInput {
  vertical: string;
  jiraUsername: string;
  /** Em branco na edição mantém a senha já salva. */
  jiraPassword: string;
  hoursPerPf: number;
  hoursPerDay: number;
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
