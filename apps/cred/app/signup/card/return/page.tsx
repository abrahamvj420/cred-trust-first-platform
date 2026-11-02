'use client';

import { credApi } from '@cred/types';
import { ButtonLink, Card, ErrorState, Icon, Spinner } from '@cred/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../../_shell/Screen';

/** Back from Mock Bank: the card arrives by webhook, so wait for it. */
function CardReturn() {
  const router = useRouter();
  const rejected = useSearchParams().get('status') === 'rejected';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rejected) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api(credApi.signup.status);
        if (!alive) return;
        if (s.hasCard) router.replace('/');
        else setTimeout(tick, 800);
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [rejected, router]);

  return (
    <Screen title="Add your first card">
      {error ? (
        <ErrorState message={error} />
      ) : rejected ? (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-muted">
            <Icon name="close" />
          </span>
          <p className="text-headline">Your card wasn’t added</p>
          <p className="max-w-[30ch] text-callout text-muted">You declined at your bank, so nothing was shared. You can try again whenever you like.</p>
          <ButtonLink href="/signup/card" variant="secondary">Try again</ButtonLink>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner size={32} label="Adding" />
          <p className="text-headline">Approved. Adding your card…</p>
          <p className="max-w-[30ch] text-callout text-muted">Mock Bank is sharing your card and recent bills.</p>
        </Card>
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CardReturn />
    </Suspense>
  );
}
