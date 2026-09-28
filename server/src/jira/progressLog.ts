let messages: string[] = [];

/** Reinicia o log de progresso — chamado no início de cada busca do board. */
export function startProgress(): void {
  messages = [];
}

/** Registra uma etapa em andamento, visível para o cliente via `/api/board-data/progress`. */
export function report(message: string): void {
  messages.push(message);
}

export function getMessages(): string[] {
  return messages;
}
