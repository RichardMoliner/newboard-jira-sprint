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
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/config');
}

export function saveConfig(vertical: string): Promise<AppConfig> {
  return request<AppConfig>('/config', { method: 'POST', body: JSON.stringify({ vertical }) });
}

export function getBoardData<T>(): Promise<T> {
  return request<T>('/board-data');
}
