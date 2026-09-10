import { useCallback, useEffect, useState } from 'react';
import { getBoardData } from './client.js';
import type { BoardDataResponse } from '../types.js';

export function useBoardData() {
  const [data, setData] = useState<BoardDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  return { data, loading, error, refresh };
}
