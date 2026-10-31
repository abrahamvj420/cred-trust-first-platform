'use client';

import { credApi } from '@cred/types';
import { Button, Choice, ErrorState, Field, LoadingScreen, Notice } from '@cred/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { lakhs } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Screen } from '../../../_shell/Screen';

export default function NewClaim() {
  const router = useRouter();
  const q = useApi(credApi.products.policies, undefined, { live: false });
  const [policy, setPolicy] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paise = Math.round(Number(amount.replace(/,/g, '')) * 100);
  const health = q.data?.policies.filter((p) => !p.vehicle) ?? [];

  async function file() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(credApi.products.fileClaim, { body: { policyId: policy!, amountPaise: paise, description: what.trim() } });
      router.replace(`/protect/claims/${r.claim.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="File a claim"
      back="/protect/claims"
      footer={
        <Button block loading={busy} disabled={!policy || paise < 100 || what.trim().length < 3} onClick={file}>
          File with the insurer
        </Button>
      }
    >
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading policies" />
      ) : (
        <>
          <Choice
            legend="Which policy?"
            name="policy"
            value={policy}
            onChange={setPolicy}
            options={health.map((p) => ({ value: p.id, title: p.productName, detail: `${lakhs(p.coverPaise)}${p.isEmployer ? ` · from ${p.employerName ?? 'your employer'}` : ''}` }))}
          />
          <Field label="Amount to claim" prefix="₹" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} />
          <Field label="What happened" value={what} maxLength={280} onChange={(e) => setWhat(e.target.value)} hint="For example: two nights at City Hospital, fever. We’ll ask for documents only if the insurer needs them." />
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
