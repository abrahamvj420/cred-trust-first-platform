'use client';

import { ApiError, call, type CallInput, type Endpoint, type EndpointResponse } from '@cred/types';
import { useEffect, useState } from 'react';

export const CRED_API = process.env.NEXT_PUBLIC_CRED_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'cred_demo_token';

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

/** The member app calls only cred-api. */
export async function api<E extends Endpoint>(endpoint: E, input: CallInput<E> = {}): Promise<EndpointResponse<E>> {
  const token = session.get();
  try {
    return await call(CRED_API, endpoint, { ...input, headers: { ...input.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      session.clear();
      window.location.href = '/';
    }
    throw e;
  }
}

/** Token from localStorage, read after mount (undefined while loading). */
export function useToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(session.get()), []);
  return token;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');
