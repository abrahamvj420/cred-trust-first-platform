'use client';

import { credApi } from '@cred/types';
import { Button, Card, Icon, Spinner } from '@cred/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

/** Back from the Account Aggregator: wait for the data to arrive, then return where the member started. */
function AaReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const consentId = params.get('consent') ?? '';
  const rejected = params.get('status') === 'rejected';
  const [state, setState] = useState<'waiting' | 'rejected' | 'error'>(rejected ? 'rejected' : 'waiting');
  const [message, setMessage] = useState('');
  const [back, setBack] = useState('/');

  useEffect(() => {
    if (!consentId) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api(credApi.member.aaConsent, { params: { consentId } });
        if (!alive) return;
        setBack(r.returnTo);
        if (r.consent.status === 'REJECTED' || rejected) setState('rejected');
        else if (r.dataReady) router.replace(r.returnTo);
        else setTimeout(tick, 800);
      } catch (e) {
        if (alive) {
          setState('error');
          setMessage(errorText(e));
        }
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [consentId, rejected, router]);

  return (
    <Screen title="Account Aggregator" back={back}>
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        {state === 'waiting' ? (
          <>
            <Spinner size={32} label="Fetching" />
            <p className="text-headline">Approved. Fetching your data…</p>
            <p className="max-w-[30ch] text-callout text-muted">SimAA is sending only what you agreed to share.</p>
          </>
        ) : state === 'rejected' ? (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-muted">
              <Icon name="close" />
            </span>
            <p className="text-headline">Nothing was shared</p>
            <p className="max-w-[30ch] text-callout text-muted">You declined at the Account Aggregator. You can try again whenever you like.</p>
            <Button variant="secondary" onClick={() => router.replace(back)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <p className="text-headline">We couldn’t check that</p>
            <p className="text-callout text-muted">{message}</p>
            <Button variant="secondary" onClick={() => router.replace(back)}>
              Back
            </Button>
          </>
        )}
      </Card>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AaReturn />
    </Suspense>
  );
}
