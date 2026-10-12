export const now = (offsetMs = 0) => new Date(Date.now() + offsetMs);
export const isoDay = (d: Date) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
/** Reply-by deadline: end of business day (6pm) N business days later. N=0 means same business day (next business day if received after 4pm or on a weekend). */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  if (n === 0) { if (isWeekend(d) || d.getHours() >= 16) { do { d.setDate(d.getDate() + 1); } while (isWeekend(d)); } }
  else { let k = n; while (k > 0) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) k--; } }
  d.setHours(18, 0, 0, 0); return d;
}
export const weekKey = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return isoDay(x); };
export const dayName = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
export const shortWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function relative(iso: string, ref: Date): string {
  const h = Math.round((new Date(iso).getTime() - ref.getTime()) / 36e5);
  if (Math.abs(h) < 1) return 'now';
  if (h > 0) return h < 24 ? `in ${h}h` : `in ${Math.round(h / 24)}d`;
  return -h < 24 ? `${-h}h overdue` : `${Math.round(-h / 24)}d overdue`;
}
export interface OfficeHours { days: number[]; start: number; end: number }
export const inOffice = (d: Date, oh: OfficeHours) => oh.days.includes(d.getDay()) && d.getHours() >= oh.start && d.getHours() < oh.end;
/** Next moment office hours are open (or `d` itself if open now). */
export function nextOpen(d: Date, oh: OfficeHours): Date {
  if (inOffice(d, oh)) return new Date(d); const x = new Date(d);
  for (let i = 0; i < 8; i++) { if (oh.days.includes(x.getDay()) && x.getHours() < oh.start) { x.setHours(oh.start, 0, 0, 0); return x; } x.setDate(x.getDate() + 1); x.setHours(0, 0, 0, 0); }
  return new Date(d);
}
/** `hours` of office time from `d`: used for urgent messages. */
export function officeDue(d: Date, hours: number, oh: OfficeHours): Date {
  let x = nextOpen(d, oh); let left = hours * 60;
  for (let i = 0; i < 20 && left > 0; i++) { const end = new Date(x); end.setHours(oh.end, 0, 0, 0); const avail = (end.getTime() - x.getTime()) / 6e4; if (left <= avail) return new Date(x.getTime() + left * 6e4); left -= avail; x = nextOpen(new Date(end.getTime() + 1000), oh); }
  return x;
}
