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
  timeIntervals: { day: IsoDate; from: string; to: string }[];
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
}

/** QD-04-02 muc 1.7: moi ngay chi 1 don; server bao EXISTED neu ngay da co don con hieu luc. */
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

  /** Don cua user dang dang nhap co khoang thoi gian nam trong [from, to]. */
  async listMyRequests(from: IsoDate, to: IsoDate): Promise<WorkTimeRegister[]> {
    const res = await this.call<{ total: number; results: WorkTimeRegister[] }>(
      'GET',
      `/api/workTimeRegisters?page=1&size=500&from=${from}&to=${to}`,
    );
    if (res.error) throw new Error(`listMyRequests: ${res.error.errorCode}`);
    return res.data.results;
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
    const res = await this.call<{ remoteInMonth: number; totalTimeAllowRemoteInMonth: number }>('GET', '/api/workTime/summary');
    if (res.error) throw new Error(`remoteMinutesThisMonth: ${res.error.errorCode}`);
    return { used: res.data.remoteInMonth, allowed: res.data.totalTimeAllowRemoteInMonth };
  }

  /** Don cham cong cua user dang dang nhap co ngay nam trong [from, to]. */
  async listMyCheckInRegisters(from: IsoDate, to: IsoDate): Promise<CheckInRegister[]> {
    const res = await this.call<{ total: number; results: CheckInRegister[] }>(
      'GET',
      `/api/workTime/checkInRegisters?page=1&size=500&from=${from}&to=${to}`,
    );
    if (res.error) throw new Error(`listMyCheckInRegisters: ${res.error.errorCode}`);
    return res.data.results;
  }

  /** Tu huy don cham cong. Tra ve errorCode neu server tu choi, null neu thanh cong. */
  async selfCancelCheckInRegister(id: number, cancelNote: string): Promise<string | null> {
    const res = await this.call<unknown>('POST', `/api/workTime/checkInRegisters/${id}/selfCancel`, { cancelNote });
    return res.error?.errorCode ?? null;
  }
}
