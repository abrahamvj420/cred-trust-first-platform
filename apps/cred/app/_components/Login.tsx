'use client';

import { credApi, type PersonaSummary } from '@cred/types';
import { Avatar, ErrorState, List, ListRow, LoadingScreen } from '@cred/ui';
import { useEffect, useState } from 'react';
import { api, errorText, session } from '@/lib/api';

export function Login() {
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    setError(null);
    api(credApi.member.personas).then((r) => setPersonas(r.personas), (e) => setError(`${errorText(e)}. Is cred-api running?`));
  };
  useEffect(load, []);

  async function login(key: PersonaSummary['key']) {
    setBusy(key);
    try {
      const r = await api(credApi.member.demoLogin, { body: { personaKey: key } });
      session.set(r.token);
      window.location.href = '/';
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 animate-enter flex-col justify-center gap-section px-gutter py-12">
      <div className="flex flex-col gap-3">
        <p className="text-overline uppercase text-accent">Prototype · synthetic data</p>
        <h1 className="text-display">Pay bills. Earn rewards. Save only when it’s real.</h1>
        <p className="text-callout text-muted">Choose a demo member to sign in. No real accounts, cards or money.</p>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !personas ? <LoadingScreen label="Loading members" /> : (
        <List>
          {personas.map((p) => (
            <ListRow key={p.key} onClick={() => login(p.key)} leading={<Avatar name={p.name} />} title={busy === p.key ? 'Signing in…' : `${p.name} · ${p.city}`} subtitle={p.tagline} chevron />
          ))}
        </List>
      )}
    </main>
  );
}
