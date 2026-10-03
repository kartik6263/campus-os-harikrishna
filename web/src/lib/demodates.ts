/**
 * The sample registers were written around 20 September 2024. When the demo
 * loads them, every date in them is moved forward by the same amount, so the
 * demo always reads as current — an SLA due "in 3 days" stays due in 3 days.
 * Only dates in 2023–2025 move, so birth dates and the like are untouched.
 */
const ANCHOR = Date.UTC(2024, 8, 20);
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const today = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
export const demoOffsetDays = () => Math.round((today() - ANCHOR) / DAY);

/** The date the sample data treated as today, moved to now: i.e. today. */
export const demoToday = () => new Date(today());

const pad = (n: number) => String(n).padStart(2, '0');
const inRange = (y: number) => y >= 2023 && y <= 2025;
const move = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) + demoOffsetDays() * DAY);

function shiftString(s: string): string {
  return s
    // 2024-09-20 (and 2024-09-20T10:00…)
    .replace(/\b(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (all, y, m, d) => {
      if (!inRange(+y)) return all;
      const t = move(+y, +m - 1, +d);
      return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    })
    // 20-09-2024 and 20/09/2024
    .replace(/\b(\d{2})([-/])(\d{2})\2(\d{4})\b/g, (all, d, sep, m, y) => {
      if (!inRange(+y)) return all;
      const t = move(+y, +m - 1, +d);
      return `${pad(t.getUTCDate())}${sep}${pad(t.getUTCMonth() + 1)}${sep}${t.getUTCFullYear()}`;
    })
    // 20-Sep-2024, 20 Sep 2024, 20 Sep, 2024
    .replace(/\b(\d{1,2})([- ])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*([- ],? ?)(\d{4})\b/g, (all, d, s1, mon, s2, y) => {
      if (!inRange(+y)) return all;
      const t = move(+y, MONTHS.indexOf(mon), +d);
      return `${t.getUTCDate()}${s1}${MONTHS[t.getUTCMonth()]}${s2}${t.getUTCFullYear()}`;
    })
    // Academic years: 2024–25, 2024-25
    .replace(/\b(20(?:23|24|25))([–-])(\d{2})(?![-\d])/g, (all, y, sep, y2) => {
      if ((+y + 1) % 100 !== +y2) return all;
      const years = Math.round(demoOffsetDays() / 365);
      return `${+y + years}${sep}${pad((+y2 + years) % 100)}`;
    });
}

/** A deep copy of a sample row with its dates brought up to now. */
export function shiftDemoDates<T>(value: T): T {
  if (typeof value === 'string') return shiftString(value) as T;
  if (Array.isArray(value)) return value.map(shiftDemoDates) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDemoDates(v)])) as T;
  }
  return value;
}
