'use client';

import { ApiError, credApi } from '@cred/types';
import { Button, Surface } from '@cred/ui';
import { useState } from 'react';
import { credAdmin, staffSession } from '@/lib/api';

/** Staff sign-in. The demo account is in the README; members can't sign in here. */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await credAdmin(credApi.admin.login, { body: { email, password } });
      staffSession.set(r.token);
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next?.startsWith('/') && !next.startsWith('/login') ? next : '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'cred-api unreachable');
      setBusy(false);
    }
  }

  const input = 'rounded-md border border-border bg-raised px-3 py-2 text-sm';
  return (
    <main className="grid min-h-dvh flex-1 place-items-center px-6">
      <Surface className="flex w-full max-w-sm flex-col gap-5 p-6">
        <div>
          <h1 className="text-xl font-semibold">CRED Console</h1>
          <p className="text-sm text-muted">Staff only. Every action you take here is logged under your name.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Work email
            <input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </form>
        <p className="text-xs text-muted">Demo account: see README → Admin console.</p>
      </Surface>
    </main>
  );
}
