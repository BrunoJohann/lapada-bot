export interface HistoricalRange {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Computes the UTC timestamps for the start and end of the local day that contains `utcDate`.
 * The `localDate` key is UTC midnight of that local date (used as the DailyAggregate primary key).
 *
 * Example for BRT (UTC-3): "April 5 local" → dayStart = 03:00 UTC Apr 5, dayEnd = 03:00 UTC Apr 6.
 */
export function getLocalDayBoundaries(
  utcDate: Date,
  timezone: string
): { dayStart: Date; dayEnd: Date; localDate: Date } {
  const localDateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(utcDate);

  const utcMidnight = new Date(localDateStr + "T00:00:00Z");
  const localTimeAtUtcMidnight = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(utcMidnight);

  const [hStr, mStr] = localTimeAtUtcMidnight.split(":");
  const h = parseInt(hStr) === 24 ? 0 : parseInt(hStr);
  const m = parseInt(mStr);
  const localMinsAtUtcMidnight = h * 60 + m;

  const dayStartMs =
    localMinsAtUtcMidnight > 720
      ? utcMidnight.getTime() + (1440 - localMinsAtUtcMidnight) * 60_000
      : utcMidnight.getTime() - localMinsAtUtcMidnight * 60_000;

  return {
    dayStart:  new Date(dayStartMs),
    dayEnd:    new Date(dayStartMs + 86_400_000),
    localDate: utcMidnight,
  };
}

/**
 * Returns a Date whose UTC fields represent the current local time in the given timezone.
 * Allows getPeriodStart (which uses getUTC* methods) to operate on local time instead of UTC.
 * Example: at 21:23 BRT (UTC-3) = 00:23 UTC, this returns a date where getUTCHours() === 21.
 */
export function toLocalNow(timezone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");
  const h = get("hour");
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), h === 24 ? 0 : h, get("minute"), get("second")));
}

export function getPeriodStart(date: Date, period: "weekly" | "monthly"): Date {
  const start = new Date(date);
  if (period === "weekly") {
    const day = start.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + diff);
  } else {
    start.setUTCDate(1);
  }
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function getPeriodLabel(date: Date, period: "weekly" | "monthly"): string {
  if (period === "weekly") {
    const start = getPeriodStart(date, "weekly");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  } else {
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/**
 * Resolve um intervalo histórico a partir de semana/mês/ano.
 *
 * Para semanas: usa o mesmo sistema ISO do bot (segunda→domingo).
 *   A âncora é a primeira segunda-feira do mês.
 *   Semana 1 = primeira segunda-feira até o domingo seguinte.
 *
 * Para meses: primeiro ao último dia do mês.
 *
 * Retorna null quando nenhum parâmetro histórico foi fornecido.
 */
export function resolveHistoricalRange(
  semana: number | null,
  mes: number | null,
  ano: number | null
): HistoricalRange | null {
  if (!mes && !semana) return null;

  const now = new Date();
  const year  = ano  ?? now.getUTCFullYear();
  const month = (mes ?? (now.getUTCMonth() + 1)) - 1; // 0-indexed para Date.UTC

  if (semana !== null) {
    const firstOfMonth   = new Date(Date.UTC(year, month, 1));
    const firstDayOfWeek = firstOfMonth.getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
    const daysToFirstMonday = firstDayOfWeek === 1 ? 0 : firstDayOfWeek === 0 ? 1 : 8 - firstDayOfWeek;
    const firstMondayDay    = 1 + daysToFirstMonday;

    const weekStartDay = firstMondayDay + (semana - 1) * 7;
    const start = new Date(Date.UTC(year, month, weekStartDay));
    const end   = new Date(Date.UTC(year, month, weekStartDay + 7));

    const displayEnd = new Date(end.getTime() - 86_400_000);
    const label = `Semana ${semana} — ${fmtDate(start)} a ${fmtDate(displayEnd)}`;
    return { start, end, label };
  } else {
    const start = new Date(Date.UTC(year, month, 1));
    const end   = new Date(Date.UTC(year, month + 1, 1));
    const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    return { start, end, label };
  }
}
