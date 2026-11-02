'use client';

import { credApi } from '@cred/types';
import { Button, Choice, Field, Notice } from '@cred/ui';
import { useState, type FormEvent } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

type Network = 'visa' | 'mastercard' | 'rupay';

/** Add a card: the last 4 digits here, then the member approves at their bank. */
export default function AddCard() {
  const [last4, setLast4] = useState('');
  const [network, setNetwork] = useState<Network | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!network) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.signup.startCard, { body: { last4, network } });
      window.location.href = r.redirectUrl;
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Screen title="Add your first card" back="/">
      <form onSubmit={submit} className="flex flex-col gap-section">
        <p className="text-callout text-muted">Your bank will ask you to approve this. We never see your full card number or CVV.</p>
        <Field label="Last 4 digits of your card" inputMode="numeric" autoComplete="off" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} hint="Demo: any 4 digits. Mock Bank is the issuer." />
        <Choice<Network>
          legend="Card network"
          name="network"
          value={network}
          onChange={setNetwork}
          options={[
            { value: 'visa', title: 'Visa' },
            { value: 'mastercard', title: 'Mastercard' },
            { value: 'rupay', title: 'RuPay' },
          ]}
        />
        {error ? <Notice>{error}</Notice> : null}
        <Button block loading={busy} disabled={last4.length !== 4 || !network}>Continue to Mock Bank</Button>
      </form>
    </Screen>
  );
}
