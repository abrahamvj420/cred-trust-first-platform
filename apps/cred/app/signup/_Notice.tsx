'use client';

import type { NoticeContent, NoticeLanguage } from '@cred/types';
import { Card, Icon } from '@cred/ui';

/** The privacy notice, read the same way at sign-up and later from Profile. It has no tick boxes: agreement is the one button. */
export function NoticeBody({ notice, language, version }: { notice: NoticeContent; language: NoticeLanguage; version: string }) {
  return (
    <div lang={language === 'hi' ? 'hi' : 'en-IN'} className="flex flex-col gap-section">
      <Card className="flex flex-col gap-3">
        <p className="text-body">{notice.summary}</p>
        <p className="flex gap-3 text-body font-semibold">
          <Icon name="shield" className="mt-0.5 shrink-0 text-accent" />
          <span>{notice.scoreCheck}</span>
        </p>
      </Card>

      <details className="group rounded-lg border border-border bg-surface shadow-e1">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-callout font-semibold">
          {notice.itemsTitle}
          <Icon name="chevron" size={20} className="shrink-0 text-muted transition-calm group-open:rotate-90" />
        </summary>
        <dl className="flex flex-col divide-y divide-border border-t border-border">
          {notice.items.map((i) => (
            <div key={i.key} className="flex flex-col gap-1 px-4 py-3">
              <dt className="text-callout font-semibold">{i.label}</dt>
              <dd className="text-callout text-muted">{i.purpose}</dd>
            </div>
          ))}
        </dl>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-headline">{notice.rightsTitle}</h2>
        <dl className="grid grid-cols-2 gap-3">
          {notice.rights.map((r) => (
            <div key={r.title} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
              <dt className="text-callout font-semibold">{r.title}</dt>
              <dd className="text-caption text-muted">{r.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-headline">{notice.withdrawTitle}</h2>
        <p className="text-callout text-muted">{notice.withdraw}</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-headline">{notice.complainTitle}</h2>
        <p className="text-callout text-muted">{notice.complain}</p>
        <p className="text-callout font-semibold">{notice.board}</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-headline">{notice.contactTitle}</h2>
        <p className="text-callout text-muted">{notice.contact}</p>
      </section>

      <p className="text-caption text-muted">
        {notice.versionLabel}: <span className="tabular">{version}</span>
      </p>
    </div>
  );
}

export function LanguageToggle({ languages, value, onChange }: { languages: Record<NoticeLanguage, NoticeContent>; value: NoticeLanguage; onChange: (l: NoticeLanguage) => void }) {
  return (
    <div role="group" aria-label="Language" className="flex rounded-full border border-border bg-surface p-1">
      {(Object.keys(languages) as NoticeLanguage[]).map((l) => (
        <button key={l} type="button" aria-pressed={value === l} onClick={() => onChange(l)} className={`min-h-11 rounded-full px-4 text-callout font-semibold transition-calm ${value === l ? 'bg-accent text-accent-text' : 'text-muted hover:text-text'}`}>
          {languages[l].languageLabel}
        </button>
      ))}
    </div>
  );
}
