import type { Page } from '@playwright/test';
import type { IsoDate } from './working-days';

/**
 * Goi REST API cua RON tu trong trinh duyet (dung Bearer token app luu o localStorage.token).
 * Chi dung cho viec CHUAN BI va DON DEP du lieu test; hanh vi can kiem thu phai di qua UI.
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' | string;

export interface WorkTimeRegister {
  id: number;
  type: 'DAYOFF' | 'REMOTE' | 'OVERTIME' | string;
  approvalStatus: ApprovalStatus;
  reason: string | null;
  /** Bien phap khac phuc (Nghi phep) / Kenh giao tiep (Remote). Chi co o getDetail. */
  solution?: string | null;
  /** SDT ca nhan (Remote). */
  emergencyRemoteContact?: string | null;
  /** Ngay OT va loai ngay server tu phan loai (NORMAL / WEEKEND / le). Chi co o getDetail. */
  otDay?: IsoDate | null;
  otDayType?: 'NORMAL' | 'WEEKEND' | string | null;
  havePlanned?: boolean;
  timeIntervals: { day: IsoDate; from: string; to: string }[];
  /** Nguoi kiem duyet duoc chon / nguoi da duyet that (null khi chua duyet). */
  assignedUser?: { username: string } | null;
  actualApprovalUser?: { username: string } | null;
  /** Ghi chu cua nguoi duyet, hoac li do huy sau khi tu huy. */
  note?: string | null;
  createdAt?: string;
}

/** Response GET /api/workTime/summary (modal Thong ke), don vi PHUT. Chi khai bao field dang dung. */
export interface WorkTimeSummary {
  remoteInMonth: number;
  totalTimeAllowRemoteInMonth: number;
  totalRemoteTimeInYear: number;
  unpaidDayOffTime: number;
  insuranceLeaveDayOffTime: number;
  normalDayOtTime: number;
  normalNightOtTime: number;
  normalDayOffDayOtTime: number;
  normalDayOffNightOtTime: number;
  holidayOtTime: number;
  holidayNightOtTime: number;
}

/** Trang thai don cham cong: TBP duyet -> WAIT_CONFIRM (cho Timekeeper) -> APPROVED. */
export type CheckInStatus = 'PENDING' | 'WAIT_CONFIRM' | 'APPROVED' | 'REJECTED' | 'CANCELED' | string;

export interface CheckInRegister {
  id: number;
  day: IsoDate;
  checkIn: string; // 'HH:mm:ss'
  checkOut: string;
  approvalStatus: CheckInStatus;
  reason: string | null;
  isRemote: boolean;
  /** URL anh bang chung da luu tren server. */
  imageUrl: string[];
  /** Ghi chu cua nguoi duyet (Tu choi) hoac ghi chu tu huy. */
  note?: string | null;
  /** Nguoi dang ky - chi co o API assigned (danh sach cua nguoi duyet, doc 15). */
  user?: { username: string };
}

/** 1 dong nhat ky cham cong (man Thoi gian cham cong): check-in dau / check-out cuoi trong ngay. */
export interface CheckInRecord {
  userId: number;
  day: IsoDate;
  checkIn: string | null; // 'HH:mm:ss'
  checkOut: string | null;
  type: 'SYSTEM' | string;
}

/**
 * Gio cong 1 ngay (man Gio cong thang, don vi gio). approvalX = false khi ngay do co don loai X
 * chua duoc duyet (UI to cam).
 */
export interface MonthlyWorkingDay {
  date: IsoDate;
  checkInTotal: number;
  checkInRemoteTotal: number;
  remoteTimeTotal: number;
  dayOffTimeTotal: number;
  workTimeTotal: number;
  overTimeTotal: number;
  approvalCheckIn: boolean;
  approvalRemote: boolean;
  approvalDayOff: boolean;
  approvalOT: boolean;
}

/** Khoang thoi gian don trong 1 ngay (API workTime/detail). */
export interface DetailInterval {
  localDate: IsoDate;
  startTime: string;
  endTime: string;
  approvalStatus: string;
}

/** Chi tiet 1 ngay cua man Gio cong thang: cac don dang ky trong ngay. */
export interface WorkTimeDayDetail {
  date: IsoDate;
  checkInRegister: unknown[];
  checkInRegisterRemote: unknown[];
  dayOff: DetailInterval[];
  remoteTime: DetailInterval[];
  otTime: DetailInterval[];
}

/** 1 team (man Danh sach team). email co the null hoac rong. */
export interface Team {
  id: number;
  name: string;
  email: string | null;
  description: string | null;
  status: 'ACTIVE' | string;
  avatar: string | null;
}

/** 1 thanh vien team (modal Danh sach thanh vien). UI ghep "Ho ten" = lastName + firstName. */
export interface TeamMember {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

/** 1 nguoi duyet cua user dang dang nhap (option "Nguoi quan ly" o Trang chu, "Nguoi kiem duyet" o form don). */
export interface ApprovalUser {
  id: number;
  username: string;
}

/** 1 don tren lich Trang chu (API assignedForTeamMembers). Loai OT o API nay la 'OT', khong phai 'OVERTIME'. */
export interface TeamCalendarRequest {
  id: number;
  type: 'DAYOFF' | 'REMOTE' | 'OT' | string;
  approvalStatus: ApprovalStatus;
  timeIntervals: { day: IsoDate; from: string; to: string }[];
  user: { id: number; username: string };
}

/** Ho so user dang dang nhap (GET /api/user/info, man Trang ca nhan). Chi khai bao field dang dung. */
export interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  email: string;
  gender: 'MALE' | 'FEMALE' | string;
  contractType: 'STAFF' | string;
  /** 'yyyy-MM-dd'. contractDate = Ngay nhan vien chinh thuc. */
  contractDate: IsoDate | null;
  joinedDate: IsoDate | null;
  birthday: IsoDate | null;
  phoneNumber: string | null;
  status: 'ACTIVE' | string;
  roles: unknown[];
  /** URL day du cua anh dai dien. */
  avatar: string | null;
}

/** QD-04-02 muc 1.7: moi ngay chi 1 don;server bao EXISTED neu ngay da co don con hieu luc. */
export const ACTIVE_CHECK_IN_STATUSES = new Set<CheckInStatus>(['PENDING', 'WAIT_CONFIRM', 'APPROVED']);

interface ApiEnvelope<T> {
  error: { errorCode: string } | null;
  data: T;
}

/** Don con hieu luc (chiem ngay): server bao REGISTERED_OVERLAP_ERROR neu dang ky trung. */
const OCCUPYING_STATUSES = new Set<ApprovalStatus>(['PENDING', 'APPROVED']);

export class RonApiClient {
  constructor(private readonly page: Page) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiEnvelope<T>> {
    return this.page.evaluate(
      async ({ method, path, body }) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Chua dang nhap: localStorage.token trong');
        const res = await fetch(path, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          // Mang toi ron-dev chap chon thi fetch treo vo han -> teardown don dep treo theo.
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}`);
        return res.json();
      },
      { method, path, body },
    );
  }

  /**
   * 1 trang danh sach don cua user dang dang nhap, cung query voi man Don dang ky
   * (page, size, from, to, type, status) -> dung lam oracle cho bang + phan trang.
   */
  async searchMyRequests(query: Record<string, string | number>): Promise<{ total: number; results: WorkTimeRegister[] }> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    const res = await this.call<{ total: number; results: WorkTimeRegister[] }>('GET', `/api/workTimeRegisters?${qs}`);
    if (res.error) throw new Error(`searchMyRequests: ${res.error.errorCode}`);
    return res.data;
  }

  /**
   * 1 trang danh sach don ma user dang dang nhap duoc chon lam nguoi kiem duyet, cung query voi
   * man Phe duyet don (page, size, from, to, type, status) -> oracle cho bang (doc 14).
   */
  async searchAssignedRequests(
    query: Record<string, string | number>,
  ): Promise<{ total: number; results: (WorkTimeRegister & { user?: { username: string } })[] }> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    const res = await this.call<{ total: number; results: (WorkTimeRegister & { user?: { username: string } })[] }>(
      'GET',
      `/api/workTimeRegisters/assigned?${qs}`,
    );
    if (res.error) throw new Error(`searchAssignedRequests: ${res.error.errorCode}`);
    return res.data;
  }

  /** Don cua user dang dang nhap co khoang thoi gian nam trong [from, to]. */
  async listMyRequests(from: IsoDate, to: IsoDate): Promise<WorkTimeRegister[]> {
    return (await this.searchMyRequests({ page: 1, size: 500, from, to })).results;
  }

  async getById(id: number, from: IsoDate, to: IsoDate): Promise<WorkTimeRegister | undefined> {
    return (await this.listMyRequests(from, to)).find((r) => r.id === id);
  }

  /** Chi tiet 1 don. API danh sach KHONG tra `solution` / `emergencyRemoteContact`, chi tiet thi co. */
  async getDetail(id: number): Promise<WorkTimeRegister> {
    const res = await this.call<WorkTimeRegister>('GET', `/api/workTimeRegisters/${id}`);
    if (res.error) throw new Error(`getDetail(${id}): ${res.error.errorCode}`);
    return res.data;
  }

  /** Cac ngay da co don Cho xu ly / Chap thuan (moi loai don) trong [from, to]. */
  async occupiedDays(from: IsoDate, to: IsoDate): Promise<Set<IsoDate>> {
    const requests = await this.listMyRequests(from, to);
    return new Set(
      requests.filter((r) => OCCUPYING_STATUSES.has(r.approvalStatus)).flatMap((r) => r.timeIntervals.map((t) => t.day)),
    );
  }

  /** Tu huy don (chi don Cho xu ly). Tra ve errorCode neu server tu choi, null neu thanh cong. */
  async selfCancel(id: number, cancelNote: string): Promise<string | null> {
    const res = await this.call<unknown>('POST', `/api/workTimeRegisters/${id}/selfCancel`, { cancelNote });
    return res.error?.errorCode ?? null;
  }

  /** Han muc remote THANG HIEN TAI (phut): da dung (tinh ca don Cho xu ly) va toi da. Nguon: modal Thong ke. */
  async remoteMinutesThisMonth(): Promise<{ used: number; allowed: number }> {
    const summary = await this.workTimeSummary();
    return { used: summary.remoteInMonth, allowed: summary.totalTimeAllowRemoteInMonth };
  }

  /** So lieu modal Thong ke (thang / nam hien tai), don vi PHUT. */
  async workTimeSummary(): Promise<WorkTimeSummary> {
    const res = await this.call<WorkTimeSummary>('GET', '/api/workTime/summary');
    if (res.error) throw new Error(`workTimeSummary: ${res.error.errorCode}`);
    return res.data;
  }

  /**
   * 1 trang danh sach don cham cong cua user dang dang nhap, cung query voi man Don dang ky cham cong
   * (page, size, from, to) -> oracle cho bang + phan trang (doc 10).
   */
  async searchMyCheckInRegisters(query: Record<string, string | number>): Promise<{ total: number; results: CheckInRegister[] }> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    const res = await this.call<{ total: number; results: CheckInRegister[] }>('GET', `/api/workTime/checkInRegisters?${qs}`);
    if (res.error) throw new Error(`searchMyCheckInRegisters: ${res.error.errorCode}`);
    return res.data;
  }

  /** Don cham cong cua user dang dang nhap co ngay nam trong [from, to]. */
  async listMyCheckInRegisters(from: IsoDate, to: IsoDate): Promise<CheckInRegister[]> {
    return (await this.searchMyCheckInRegisters({ page: 1, size: 500, from, to })).results;
  }

  /**
   * GET `path` va tra ve errorCode trong body (null neu thanh cong). Dung de kiem tra phan quyen:
   * backend RON bao loi quyen bang HTTP 200 + errorCode FORBIDDEN (doc 13).
   */
  async errorCodeOfGet(path: string): Promise<string | null> {
    return (await this.call<unknown>('GET', path)).error?.errorCode ?? null;
  }

  /**
   * Nhat ky cham cong cua user dang dang nhap trong [from, to] (API cua man Thoi gian cham cong).
   * `username` chi dung de kiem tra IDOR: server phai bo qua, van tra du lieu cua chinh minh.
   */
  async listMyCheckIns(from: IsoDate, to: IsoDate, opts: { page?: number; size?: number; username?: string } = {}) {
    const { page = 1, size = 500, username } = opts;
    const userParam = username === undefined ? '' : `&username=${encodeURIComponent(username)}`;
    const res = await this.call<{ total: number; results: CheckInRecord[] }>(
      'GET',
      `/api/workTime/checkIn?page=${page}&size=${size}${userParam}&from=${from}&to=${to}`,
    );
    if (res.error) throw new Error(`listMyCheckIns: ${res.error.errorCode}`);
    return res.data;
  }

  /** Gio cong tung ngay trong thang cua user dang dang nhap (API man Gio cong thang). */
  async monthlyWorkingHours(year: number, month: number): Promise<MonthlyWorkingDay[]> {
    const res = await this.call<MonthlyWorkingDay[]>('GET', `/api/work-time/monthly?page=1&size=20&year=${year}&month=${month}`);
    if (res.error) throw new Error(`monthlyWorkingHours: ${res.error.errorCode}`);
    return res.data;
  }

  /** Don dang ky theo tung ngay trong [from, to], key = ngay. */
  async workTimeDetail(from: IsoDate, to: IsoDate): Promise<Record<IsoDate, WorkTimeDayDetail>> {
    const res = await this.call<Record<IsoDate, WorkTimeDayDetail>>('GET', `/api/workTime/detail?from=${from}&to=${to}`);
    if (res.error) throw new Error(`workTimeDetail: ${res.error.errorCode}`);
    return res.data;
  }

  /** 1 trang danh sach team, cung query voi man Danh sach team (page, size, teamName) -> oracle cho bang. */
  async listTeams(query: { page: number; size: number; teamName?: string }): Promise<{ total: number; results: Team[] }> {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) });
    if (query.teamName) params.set('teamName', query.teamName);
    const res = await this.call<{ total: number; results: Team[] }>('GET', `/api/manage/teams?${params}`);
    if (res.error) throw new Error(`listTeams: ${res.error.errorCode}`);
    return res.data;
  }

  /** Thanh vien cua 1 team (API modal Danh sach thanh vien). */
  async listTeamMembers(teamId: number): Promise<TeamMember[]> {
    const res = await this.call<{ items: TeamMember[] }>('GET', `/api/manage/teamMemberships/${teamId}/members`);
    if (res.error) throw new Error(`listTeamMembers: ${res.error.errorCode}`);
    return res.data.items;
  }

  /** Nguoi duyet cua user dang dang nhap (dropdown "Nguoi quan ly" Trang chu). */
  async approvalUsers(): Promise<ApprovalUser[]> {
    const res = await this.call<{ items: ApprovalUser[] }>('GET', '/api/user/approvalUsers');
    if (res.error) throw new Error(`approvalUsers: ${res.error.errorCode}`);
    return res.data.items;
  }

  /** Don cua cac thanh vien co nguoi duyet = `poId` trong [from, to] (lich Trang chu). */
  async teamCalendarRequests(from: IsoDate, to: IsoDate, poId: number): Promise<TeamCalendarRequest[]> {
    const res = await this.call<TeamCalendarRequest[]>(
      'GET',
      `/api/workTimeRegisters/assignedForTeamMembers?page=1&from=${from}&to=${to}&poID=${poId}`,
    );
    if (res.error) throw new Error(`teamCalendarRequests: ${res.error.errorCode}`);
    return res.data;
  }

  /** Ho so user dang dang nhap (man Trang ca nhan). */
  async userInfo(): Promise<UserInfo> {
    const res = await this.call<UserInfo>('GET', '/api/user/info');
    if (res.error) throw new Error(`userInfo: ${res.error.errorCode}`);
    return res.data;
  }

  /**
   * 1 trang danh sach don cham cong ma user dang dang nhap duoc chon lam nguoi kiem duyet, cung query
   * voi man Phe duyet don cham cong (page, size, from, to, status, username) -> oracle cho bang (doc 15).
   */
  async searchAssignedCheckInRegisters(query: Record<string, string | number>): Promise<{ total: number; results: CheckInRegister[] }> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    const res = await this.call<{ total: number; results: CheckInRegister[] }>('GET', `/api/workTime/checkInRegisters/assigned?${qs}`);
    if (res.error) throw new Error(`searchAssignedCheckInRegisters: ${res.error.errorCode}`);
    return res.data;
  }

  /** Tu huy don cham cong. Tra ve errorCode neu server tu choi, null neu thanh cong. */
  async selfCancelCheckInRegister(id: number, cancelNote: string): Promise<string | null> {
    const res = await this.call<unknown>('POST', `/api/workTime/checkInRegisters/${id}/selfCancel`, { cancelNote });
    return res.error?.errorCode ?? null;
  }
}
