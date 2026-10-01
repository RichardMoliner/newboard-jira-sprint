import { useCallback, useEffect, useRef, useState } from 'react';
import { getBoardData, getBoardDataProgress } from './client.js';
import type { BoardDataResponse } from '../types.js';

export const AUTO_REFRESH_SECONDS = 5 * 60;
const PROGRESS_POLL_MS = 800;

export function useBoardData(autoRefreshEnabled: boolean) {
  const [data, setData] = useState<BoardDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsToNextRefresh, setSecondsToNextRefresh] = useState(AUTO_REFRESH_SECONDS);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  // Evita duas buscas simultâneas (StrictMode no mount duplica o efeito, e o timer de
  // auto-refresh pode disparar de novo antes de uma busca lenta terminar) — sem essa trava,
  // as duas requisições concorrentes embaralham o log de progresso, que é global no servidor.
  const isFetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    setSecondsToNextRefresh(AUTO_REFRESH_SECONDS);
    setProgressMessages([]);

    const pollProgress = async () => {
      try {
        const { messages } = await getBoardDataProgress();
        setProgressMessages(messages);
      } catch {
        // Falha ao consultar o progresso não deve interromper a busca principal.
      }
    };
    const progressInterval = setInterval(pollProgress, PROGRESS_POLL_MS);

    try {
      const next = await getBoardData<BoardDataResponse>();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados do Jira.');
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Busca os dados de novo automaticamente a cada AUTO_REFRESH_SECONDS, mesmo sem ação do usuário —
  // a menos que o usuário tenha desligado o auto-refresh nas configurações.
  useEffect(() => {
    if (!autoRefreshEnabled) return;
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
  }, [refresh, autoRefreshEnabled]);

  return { data, loading, error, refresh, secondsToNextRefresh, progressMessages };
}
