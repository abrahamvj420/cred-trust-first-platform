'use client';

import { ApiError, call, type CallInput, type Endpoint, type EndpointResponse } from '@cred/types';

export const CRED_API = process.env.NEXT_PUBLIC_CRED_API_URL ?? 'http://localhost:4000';
const KEY = 'cred_console_token';

/** Staff session for the console (separate from member sessions in the CRED app). */
export const staffSession = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(KEY, token);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};

/** The console calls only cred-api (plus the documented control-room exception), as the signed-in staff member. */
export async function credAdmin<E extends Endpoint>(endpoint: E, input: CallInput<E> = {}): Promise<EndpointResponse<E>> {
  const token = staffSession.get();
  try {
    return await call(CRED_API, endpoint, { ...input, headers: { ...input.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && endpoint.path !== '/admin/v1/login') {
      staffSession.clear();
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw e;
  }
}
