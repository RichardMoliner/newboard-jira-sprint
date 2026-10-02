function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Domingo de Páscoa (algoritmo de Gauss), usado para feriados móveis. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados nacionais (fixos + móveis a partir da Páscoa) para um ano. */
function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [
    addDays(toISODate(easter), -48), // Carnaval (segunda)
    addDays(toISODate(easter), -47), // Carnaval (terça)
    addDays(toISODate(easter), -2), // Sexta-feira Santa
    addDays(toISODate(easter), 60), // Corpus Christi
  ];

  const fixed = [
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
  ];

  return new Set([...fixed, ...movable]);
}

const holidayCache = new Map<number, Set<string>>();

function isHoliday(dateISO: string): boolean {
  const year = Number(dateISO.slice(0, 4));
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = nationalHolidays(year);
    holidayCache.set(year, holidays);
  }
  return holidays.has(dateISO);
}

export function isBusinessDay(dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !isHoliday(dateISO);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Lista os dias úteis (sem fins de semana nem feriados) entre startISO e endISO, inclusive. */
export function listBusinessDays(startISO: string, endISO: string): string[] {
  const days: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO) {
    if (isBusinessDay(cursor)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
