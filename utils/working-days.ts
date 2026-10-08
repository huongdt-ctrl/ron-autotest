/**
 * Tinh ngay lam viec (LV) theo QD-04-02 muc 2.15: khong tinh Thu 7, Chu nhat.
 * Ngay le dat qua env RON_HOLIDAYS (vd "2027-01-01,2027-02-05"), mac dinh rong.
 *
 * Cach dem "bao truoc N ngay LV" (vi du trong chu thich 2.15 cua QD, da doi chieu he thong):
 * dem cac ngay LV SAU ngay nop, TINH CA ngay bat dau nghi. Nop 07/10 (T4) -> nghi 12/10 (T2)
 * = 08, 09, 12 = 3 ngay LV. Vi vay ngay bat dau som nhat hop le = addWorkingDays(homNay, N).
 */

/** Ngay theo lich, dang 'YYYY-MM-DD' (mui gio Viet Nam, khong phu thuoc may chay). */
export type IsoDate = string;

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function holidaysFromEnv(): Set<IsoDate> {
  return new Set((process.env.RON_HOLIDAYS || '').split(',').map((s) => s.trim()).filter(Boolean));
}

export function todayInVietnam(): IsoDate {
  // en-CA cho dinh dang YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TIMEZONE }).format(new Date());
}

function shiftDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(date: IsoDate, holidays: Set<IsoDate> = holidaysFromEnv()): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = CN, 6 = T7
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
}

/** Ngay LV thu n sau `from` (khong tinh `from`). n = 0 tra ve chinh `from`. */
export function addWorkingDays(from: IsoDate, n: number, holidays: Set<IsoDate> = holidaysFromEnv()): IsoDate {
  let date = from;
  for (let counted = 0; counted < n; ) {
    date = shiftDays(date, 1);
    if (isWorkingDay(date, holidays)) counted++;
  }
  return date;
}

/** `count` ngay LV lien tiep bat dau tu `start` (start phai la ngay LV). */
export function consecutiveWorkingDays(start: IsoDate, count: number, holidays: Set<IsoDate> = holidaysFromEnv()): IsoDate[] {
  const days = [start];
  while (days.length < count) days.push(addWorkingDays(days[days.length - 1], 1, holidays));
  return days;
}

/** Ngay LV cuoi cung cua thang lien truoc thang chua `date`. */
export function lastWorkingDayOfPreviousMonth(date: IsoDate, holidays: Set<IsoDate> = holidaysFromEnv()): IsoDate {
  let d = shiftDays(`${date.slice(0, 7)}-01`, -1);
  while (!isWorkingDay(d, holidays)) d = shiftDays(d, -1);
  return d;
}

/** Ngay dau thang, lech `months` thang so voi thang cua `date`. */
export function shiftMonthStart(date: IsoDate, months: number): IsoDate {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** [ngay dau, ngay cuoi] cua thang chua `date`. */
export function monthRange(date: IsoDate): [IsoDate, IsoDate] {
  const [y, m] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // ngay 0 cua thang sau = ngay cuoi thang nay
  return [`${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-${lastDay}`];
}

/** So thang chenh lech giua 2 ngay (dung de bam nut chuyen thang tren datepicker). */
export function monthDiff(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
