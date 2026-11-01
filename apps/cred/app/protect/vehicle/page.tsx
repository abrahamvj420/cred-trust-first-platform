'use client';

import { credApi, type ProtectionGap } from '@cred/types';
import { Button, ButtonLink, Card, Choice, Field, Icon, Notice } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Screen } from '../../_shell/Screen';

type Cover = 'comprehensive' | 'third_party' | 'not_sure';

/** A cover check on a car: the member says what came with it; we recommend only if there's a real gap. */
export default function VehicleCheck() {
  const [makeModel, setMakeModel] = useState('');
  const [registration, setRegistration] = useState('');
  const [price, setPrice] = useState('');
  const [cover, setCover] = useState<Cover | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProtectionGap | null>(null);
  const idv = Math.round(Number(price.replace(/,/g, '')) * 100);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(credApi.products.declareVehicle, { body: { vehicle: { makeModel: makeModel.trim(), registration: registration.trim().toUpperCase(), year: 2026, idvPaise: idv }, cover: cover! } }));
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  const motor = result?.areas.find((a) => a.area === 'motor');
  return (
    <Screen
      title="Check your car’s cover"
      back="/protect"
      footer={
        result ? null : (
          <Button block loading={busy} disabled={!makeModel.trim() || registration.trim().length < 4 || idv < 1_00_000_00 || !cover} onClick={check}>
            Check my cover
          </Button>
        )
      }
    >
      {result ? (
        <>
          <Card elevation={2} className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-overline uppercase text-accent">
              <Icon name="car" size={16} /> Cover check
            </p>
            <p className="text-headline">{motor?.covered ? 'You’re covered' : result.offerId ? 'There’s a gap' : 'We’ll wait for the details'}</p>
            <p className="text-callout text-muted">{result.explanation}</p>
          </Card>
          {result.offerId ? <ButtonLink href={`/offers/${result.offerId}`}>See the cheapest way to close it</ButtonLink> : <ButtonLink href="/protect" variant="secondary">Back to Protect</ButtonLink>}
        </>
      ) : (
        <>
          <p className="text-callout text-muted">Tell us about the car and the cover that came with it. We’ll check it and suggest something only if there’s a real gap.</p>
          <Field label="Make and model" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} autoFocus />
          <Field label="Registration number" value={registration} onChange={(e) => setRegistration(e.target.value)} />
          <Field label="What it cost (ex-showroom)" prefix="₹" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,]/g, ''))} hint="Used as its insured value" />
          <Choice
            legend="What cover came with it?"
            name="cover"
            value={cover}
            onChange={setCover}
            options={[
              { value: 'comprehensive', title: 'Comprehensive', detail: 'Damage to my car, theft, and damage to others' },
              { value: 'third_party', title: 'Third-party only', detail: 'Damage to others only (the legal minimum)' },
              { value: 'not_sure', title: 'Not sure', detail: 'We’ll tell you where to look' },
            ]}
          />
          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
