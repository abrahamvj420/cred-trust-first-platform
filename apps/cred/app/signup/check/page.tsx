'use client';

import { credApi, type SignupStatus } from '@cred/types';
import { ButtonLink, Card, ErrorState, Icon, Spinner } from '@cred/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

/** The credit score check and the membership gate. */
export default function Check() {
  const router = useRouter();
  const [status, setStatus] = useState<SignupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    setError(null);
    api(credApi.signup.creditCheck).then(
      (s) => {
        if (s.membership === 'limited') router.replace('/signup/not-yet');
        else setStatus(s);
      },
      (e) => setError(errorText(e)),
    );
  }, [router]);
  useEffect(check, [check]);

  return (
    <Screen title="Your membership">
      {error ? (
        <ErrorState message={error} onRetry={check} />
      ) : !status ? (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner size={32} label="Checking" />
          <p className="text-headline">Checking your credit score…</p>
          <p className="max-w-[30ch] text-callout text-muted">We’re asking the credit bureau, as the notice said. This doesn’t affect your score.</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-positive">
              <Icon name="check" />
            </span>
            <h2 className="text-title">You’re in</h2>
            <p className="text-callout text-muted">Your score from {status.bureauName} is</p>
            <p className="text-display tabular">{status.creditScore}</p>
            <p className="text-caption text-muted">Full membership starts at {status.minScore}.</p>
          </Card>
          <p className="text-callout text-muted">Add your first card to see its bills and pay them here.</p>
          <ButtonLink href="/signup/card" block>Add your first card</ButtonLink>
        </>
      )}
    </Screen>
  );
}
