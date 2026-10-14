import type { ApprovalStatus, TeamCalendarRequest } from '../utils/ron-api-client';
import type { IsoDate } from '../utils/working-days';

/**
 * Quy uoc hien thi su kien tren lich Trang chu (doc 02) + dung danh sach su kien mong doi tu API
 * assignedForTeamMembers (oracle cho test lich).
 */

/** Option filter "Trang thai don" -> approvalStatus API. null = khong loc. */
export const STATUS_FILTER: Record<string, ApprovalStatus | null> = {
  'Tất cả': null,
  'Chờ duyệt': 'PENDING',
  // CAN CHECK LAI: chua co don nao o trang thai nay tren dev (do 12/10) -> map theo ten trang thai don cham cong.
  'Chờ xác nhận': 'WAIT_CONFIRM',
  'Từ chối': 'REJECTED',
  'Đã duyệt': 'APPROVED',
};

/** Loai don API -> ma tren lich, class CSS, mau nen (do 12/10). */
export const EVENT_TYPES: Record<string, { code: string; cssClass: string; background: string }> = {
  DAYOFF: { code: 'NP', cssClass: 'dayoff', background: 'rgb(255, 215, 207)' },
  REMOTE: { code: 'RM', cssClass: 'remote', background: 'rgb(207, 234, 220)' },
  OT: { code: 'OT', cssClass: 'ot', background: 'rgb(82, 184, 255)' },
};

/** Mau icon trang thai tren su kien (do 12/10): cam = cho duyet, xanh = da duyet, do = tu choi. */
export const STATUS_ICON_COLORS: Record<string, string> = {
  PENDING: 'rgb(255, 166, 0)',
  APPROVED: 'rgb(0, 128, 0)',
  REJECTED: 'rgb(255, 0, 0)',
};

/** '08:00:00' -> '8:00' (lich bo so 0 dau gio). */
const shortTime = (hms: string) => `${Number(hms.slice(0, 2))}:${hms.slice(3, 5)}`;

/** Su kien lich mong doi tu API: moi khoang thoi gian 1 su kien; don Huy khong hien. */
export function expectedEvents(requests: TeamCalendarRequest[], range: [IsoDate, IsoDate]) {
  return requests
    .filter((r) => r.approvalStatus !== 'CANCELED')
    .flatMap((r) =>
      r.timeIntervals.map((t) => ({
        date: t.day,
        label: `${r.user.username}: ${EVENT_TYPES[r.type]?.code ?? r.type} - ${shortTime(t.from)}-${shortTime(t.to)}`,
        type: r.type,
        status: r.approvalStatus,
      })),
    )
    .filter((e) => e.date >= range[0] && e.date <= range[1]);
}

/** So sanh khong phu thuoc thu tu hien thi trong ngay. */
export const sortEvents = <T extends { date: IsoDate; label: string }>(events: T[]) =>
  events.map(({ date, label }) => ({ date, label })).sort((a, b) => `${a.date}${a.label}`.localeCompare(`${b.date}${b.label}`));
