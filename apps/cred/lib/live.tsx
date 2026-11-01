'use client';

import { call, credApi, MemberStreamEvent, type CallInput, type Endpoint, type EndpointResponse } from '@cred/types';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, CRED_API, errorText, session } from './api';

interface Live {
  /** Bumps on every pushed event, so screens refetch without a reload. */
  version: number;
  last: MemberStreamEvent | null;
  subscribe: (fn: (e: MemberStreamEvent) => void) => () => void;
}

const LiveContext = createContext<Live>({ version: 0, last: null, subscribe: () => () => undefined });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [last, setLast] = useState<MemberStreamEvent | null>(null);
  const subs = useRef(new Set<(e: MemberStreamEvent) => void>());

  useEffect(() => {
    const token = session.get();
    if (!token) return;
    const es = new EventSource(`${CRED_API}/v1/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (m) => {
      const parsed = MemberStreamEvent.safeParse(JSON.parse(m.data));
      if (!parsed.success || parsed.data.type === 'heartbeat') return;
      // Control room: switch the phone to another persona
      if (parsed.data.type === 'demo.persona_switched') {
        void call(CRED_API, credApi.member.demoLogin, { body: { personaKey: parsed.data.data.personaKey } }).then((r) => {
          session.set(r.token);
          window.location.href = '/';
        });
        return;
      }
      setLast(parsed.data);
      setVersion((v) => v + 1);
      for (const fn of subs.current) fn(parsed.data);
    };
    return () => es.close();
  }, []);

  const subscribe = useCallback((fn: (e: MemberStreamEvent) => void) => {
    subs.current.add(fn);
    return () => subs.current.delete(fn);
  }, []);

  return <LiveContext.Provider value={{ version, last, subscribe }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

/** Fetch a contract endpoint; refetches when inputs change or a live event arrives. */
export function useApi<E extends Endpoint>(endpoint: E, input?: CallInput<E>, opts: { live?: boolean; enabled?: boolean } = {}) {
  const { live = true, enabled = true } = opts;
  const { version } = useLive();
  const key = JSON.stringify(input ?? {});
  const [state, setState] = useState<{ data: EndpointResponse<E> | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    api(endpoint, JSON.parse(key) as CallInput<E>).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState((s) => ({ data: s.data, error: errorText(e), loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, key, nonce, enabled, live ? version : 0]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
