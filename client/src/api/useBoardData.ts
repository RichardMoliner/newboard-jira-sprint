import { useCallback, useEffect, useState } from 'react';
import { getBoardData } from './client.js';
import type { BoardDataResponse } from '../types.js';

export const AUTO_REFRESH_SECONDS = 5 * 60;

export function useBoardData() {
  const [data, setData] = useState<BoardDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsToNextRefresh, setSecondsToNextRefresh] = useState(AUTO_REFRESH_SECONDS);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSecondsToNextRefresh(AUTO_REFRESH_SECONDS);
    try {
      const next = await getBoardData<BoardDataResponse>();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados do Jira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Busca os dados de novo automaticamente a cada AUTO_REFRESH_SECONDS, mesmo sem ação do usuário.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsToNextRefresh((prev) => {
        if (prev <= 1) {
          refresh();
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh, secondsToNextRefresh };
}
