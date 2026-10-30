'use client';

import { credApi, type PersonaSummary } from '@cred/types';
import { Surface } from '@cred/ui';
import { useEffect, useState } from 'react';
import { api, errorText, session } from '@/lib/api';

export function Login() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api(credApi.member.personas).then((r) => setPersonas(r.personas), (e) => setError(errorText(e)));
  }, []);

  async function login(key: PersonaSummary['key']) {
    const r = await api(credApi.member.demoLogin, { body: { personaKey: key } });
    session.set(r.token);
    window.location.href = '/';
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in to the demo</h1>
      <p className="text-sm text-muted">Pick a synthetic member. No real accounts or data.</p>
      <ul className="flex flex-col gap-3">
        {personas.map((p) => (
          <li key={p.key}>
            <button onClick={() => login(p.key)} className="w-full text-left">
              <Surface className="flex flex-col gap-1 hover:border-accent">
                <span className="font-semibold">{p.name} · {p.city}</span>
                <span className="text-sm text-muted">{p.tagline}</span>
              </Surface>
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-negative">{error} Is cred-api running?</p> : null}
    </main>
  );
}
