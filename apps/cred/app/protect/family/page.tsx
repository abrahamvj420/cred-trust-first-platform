'use client';

import { credApi, type FloaterComparison, type Relation } from '@cred/types';
import { Avatar, Badge, Button, ButtonLink, Card, Choice, ErrorState, Field, Icon, List, ListRow, LoadingScreen, Money, Notice, SectionHeader, Sheet } from '@cred/ui';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { lakhs, RELATION_LABEL } from '@/lib/format';
import { useApi } from '@/lib/live';
import { Why } from '../../_components/Cards';
import { Screen } from '../../_shell/Screen';

const RELATIONS: Relation[] = ['spouse', 'child', 'parent', 'parent_in_law'];
const COVERS = ['5', '10', '15'] as const;

function Comparison({ c }: { c: FloaterComparison }) {
  const best = c.options.find((o) => o.recommended);
  return (
    <section className="flex flex-col gap-3" aria-label="Ways to cover them">
      <SectionHeader title="Two ways to cover them" />
      {c.netBenefitPaise > 0 && best ? (
        <div className="flex items-baseline gap-2">
          <Money paise={c.netBenefitPaise} size="title" className="text-positive" />
          <span className="text-callout text-muted">a year less with the cheaper way</span>
        </div>
      ) : null}
      {c.options.map((o) => (
        <Card key={o.key} elevation={o.recommended ? 2 : 1} className={`flex flex-col gap-3 ${o.recommended ? 'border-accent/60' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-headline">{o.label}</h3>
            {o.recommended ? <Badge tone="accent">Costs less</Badge> : null}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted">Extra you’d pay a year</span>
            <Money paise={o.totalPremiumPaise} size="title" />
          </div>
          <ul className="flex flex-col gap-1 border-t border-border pt-3 text-caption text-muted">
            {o.policies.map((p) => (
              <li key={p.productName + p.coverPaise} className="flex justify-between gap-3">
                <span>
                  {p.productName}, {lakhs(p.coverPaise)}
                  {p.deductiblePaise ? ` above ${lakhs(p.deductiblePaise)}` : ''}
                </span>
                <Money paise={p.annualPremiumPaise} />
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted">{o.note}</p>
          {c.offerId ? (
            <ButtonLink href={`/offers/${c.offerId}/key-facts?option=${o.key}`} variant={o.recommended ? 'primary' : 'secondary'} block>
              Continue with this
            </ButtonLink>
          ) : null}
        </Card>
      ))}
      <Card className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-headline">
          <Icon name="info" size={18} className="text-accent" /> Waiting periods
        </h3>
        <p className="text-caption text-muted">New cover doesn’t pay for everything straight away:</p>
        <dl className="flex flex-col gap-1 text-callout">
          {c.waitingPeriods.map((w) => (
            <div key={w.label} className="flex justify-between gap-3">
              <dt className="text-muted">{w.label}</dt>
              <dd className="text-right">{w.detail}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Why text={c.explanation} label="How we compared" />
    </section>
  );
}

/** Family Health Insurance: add the people you'd like to cover; compare two ways from the insurer's own prices. */
export default function Family() {
  const q = useApi(credApi.products.family);
  const me = useApi(credApi.member.home, undefined, { live: false });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<Relation | null>(null);
  const [age, setAge] = useState('');
  const [picked, setPicked] = useState<string[]>([]); // nothing pre-ticked
  const [cover, setCover] = useState<(typeof COVERS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FloaterComparison | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(credApi.products.addFamilyMember, { body: { name: name.trim(), relation: relation!, age: Number(age) } });
      setAdding(false);
      setName('');
      setRelation(null);
      setAge('');
      q.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  async function compare() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api(credApi.products.healthQuote, { body: { coverPaise: Number(cover) * 1_00_000_00, familyMemberIds: picked } }));
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  const people = [...(me.data ? [{ id: 'self', name: me.data.member.name, relation: 'self' as Relation, age: null as number | null }] : []), ...(q.data?.family ?? []).map((f) => ({ ...f, age: f.age as number | null }))];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen title="Family" back="/protect">
      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <LoadingScreen label="Loading family" />
      ) : (
        <>
          <List>
            {q.data.family.map((f) => (
              <ListRow key={f.id} leading={<Avatar name={f.name} />} title={f.name} subtitle={`${RELATION_LABEL[f.relation]} · ${f.age}`} />
            ))}
            <ListRow onClick={() => setAdding(true)} leading={<Avatar icon="plus" />} title="Add someone" subtitle="Parents, children, spouse" />
          </List>

          <section className="flex flex-col gap-3" aria-label="Compare cover">
            <SectionHeader title="Compare cover" />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-callout font-semibold">Who would you like to cover?</legend>
              {people.map((p) => (
                <label key={p.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-calm ${picked.includes(p.id) ? 'border-accent bg-raised' : 'border-border bg-surface hover:border-muted'}`}>
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="h-5 w-5 shrink-0 accent-current text-accent" />
                  <span className="flex-1">
                    <span className="block text-body">{p.relation === 'self' ? 'You' : p.name}</span>
                    <span className="block text-caption text-muted">{p.relation === 'self' ? p.name : `${RELATION_LABEL[p.relation]} · ${p.age}`}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Choice legend="How much cover?" name="cover" value={cover} onChange={setCover} options={COVERS.map((c) => ({ value: c, title: `₹${c} lakh`, detail: c === '10' ? 'What we usually suggest for a family' : undefined }))} />
            <Button block loading={busy} disabled={!picked.length || !cover} onClick={compare}>
              Compare from the insurer
            </Button>
            <p className="text-caption text-muted">The insurer sees only ages and relations to price this. Names go to them only if you buy.</p>
          </section>

          {error && !adding ? <Notice>{error}</Notice> : null}
          {result ? (
            result.options.length ? (
              <Comparison c={result} />
            ) : (
              <Card className="flex items-start gap-3">
                <Icon name="info" size={20} className="mt-0.5 shrink-0 text-muted" />
                <p className="text-callout">{result.explanation}</p>
              </Card>
            )
          ) : null}

          <Sheet open={adding} title="Add someone" onClose={() => setAdding(false)}>
            <div className="flex flex-col gap-4">
              <Field label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <Choice legend="They are your" name="relation" value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, title: RELATION_LABEL[r]! }))} />
              <Field label="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              {error ? <Notice>{error}</Notice> : null}
              <Button block loading={busy} disabled={!name.trim() || !relation || !age || Number(age) > 110} onClick={add}>
                Add
              </Button>
            </div>
          </Sheet>
        </>
      )}
    </Screen>
  );
}
