export interface WithOneRetryOptions {
  delayMs?: number;
  onRetry?: (error: unknown) => void;
}

/** Executa `fn`; se a primeira tentativa falhar, espera `delayMs` e tenta mais uma vez. */
export async function withOneRetry<T>(fn: () => Promise<T>, options: WithOneRetryOptions = {}): Promise<T> {
  const { delayMs = 2000, onRetry } = options;

  try {
    return await fn();
  } catch (err) {
    onRetry?.(err);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return fn();
  }
}
