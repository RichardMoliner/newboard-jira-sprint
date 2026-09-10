const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseISO(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Easter Sunday (Gregorian, Anonymous algorithm), returned as a UTC Date. */
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Brazilian national holidays (fixed dates + movable dates anchored on Easter) for a given year. */
function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [
    addDays(easter, -48), // Carnaval (segunda)
    addDays(easter, -47), // Carnaval (terça)
    addDays(easter, -2), // Sexta-feira Santa
    addDays(easter, 60), // Corpus Christi
  ].map(toISO);

  const fixed = [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência do Brasil
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
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
  const date = parseISO(dateISO);
  const weekday = date.getUTCDay(); // 0 = domingo, 6 = sábado
  if (weekday === 0 || weekday === 6) return false;
  return !isHoliday(dateISO);
}

/** Returns the date that is `days` business days after `startISO` (0 returns startISO itself). */
export function addBusinessDays(startISO: string, days: number): string {
  let current = parseISO(startISO);
  let remaining = days;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (isBusinessDay(toISO(current))) {
      remaining -= 1;
    }
  }
  return toISO(current);
}
