'use client';

import { credApi, ApiError, type EndpointResponse, type NoticeLanguage } from '@cred/types';
import { Button, ButtonLink, ErrorState, Field, Icon, LoadingScreen } from '@cred/ui';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText, session } from '@/lib/api';
import { LanguageToggle, NoticeBody } from './_Notice';

type Step = 'welcome' | 'notice' | 'phone' | 'otp' | 'dob' | 'details' | 'under_18';
type NoticeData = EndpointResponse<typeof credApi.signup.notice>;

/** Steps before there's a member record: pre-signed-in, so no Screen and no tab bar. */
function Shell({ title, back, footer, children }: { title?: string; back?: () => void; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 flex min-h-14 items-center gap-1 border-b border-border/60 bg-bg/85 px-2 backdrop-blur-md">
        {back ? (
          <button onClick={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full text-text transition-calm hover:bg-raised">
            <Icon name="back" />
          </button>
        ) : (
          <span className="w-3" />
        )}
        <h1 className="flex-1 truncate text-headline">{title}</h1>
      </header>
      <main className="flex flex-1 animate-enter flex-col gap-section px-gutter pt-5 pb-8">{children}</main>
      {footer ? <div className="sticky bottom-0 z-20 border-t border-border/60 bg-bg/90 px-gutter py-4 backdrop-blur-md">{footer}</div> : null}
    </div>
  );
}

const DemoHint = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-2 text-caption text-muted">
    <span className="rounded-sm border border-border px-1.5 text-overline uppercase">Demo</span>
    <span>{children}</span>
  </p>
);

export default function SignUp() {
  const [step, setStep] = useState<Step>('welcome');
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [language, setLanguage] = useState<NoticeLanguage>('en');
  // What the person has told us so far stays in this token, on this screen, until the member record exists
  const [signupToken, setSignupToken] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [dob, setDob] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotice = () => {
    setNoticeError(null);
    api(credApi.signup.notice).then(setNotice, (e) => setNoticeError(`${errorText(e)}. Is cred-api running?`));
  };
  useEffect(loadNotice, []);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
    window.scrollTo(0, 0);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      // A lost or expired sign-up starts again from the notice
      if (e instanceof ApiError && e.status === 401) {
        setSignupToken('');
        go('notice');
      }
      setError(errorText(e));
    }
    setBusy(false);
  };
  const submit = (fn: () => Promise<void>) => (e: FormEvent) => {
    e.preventDefault();
    void run(fn);
  };

  if (step === 'welcome') {
    return (
      <main className="flex flex-1 animate-enter flex-col justify-between gap-section px-gutter py-12">
        <div className="flex flex-col gap-3">
          <p className="text-overline uppercase text-accent">Welcome</p>
          <h1 className="text-display">Pay bills. Earn rewards. Save only when it’s real.</h1>
          <p className="text-callout text-muted">Join in a few minutes. First, here’s what we’ll need from you and why, before you share anything.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button block onClick={() => go('notice')}>Get started</Button>
          <ButtonLink href="/" variant="secondary" block>I’m already a member</ButtonLink>
        </div>
      </main>
    );
  }

  if (step === 'notice') {
    const n = notice?.languages[language];
    return (
      <Shell
        title="Privacy notice"
        back={() => go('welcome')}
        footer={
          n && notice ? (
            <div className="flex flex-col gap-3">
              {error ? <p role="alert" className="text-caption text-negative">{error}</p> : null}
              <Button
                block
                loading={busy}
                onClick={() =>
                  run(async () => {
                    const r = await api(credApi.signup.agree, { body: { noticeVersion: notice.version, language, agreed: true } });
                    setSignupToken(r.signupToken);
                    go('phone');
                  })
                }
              >
                <span lang={language === 'hi' ? 'hi' : 'en-IN'}>{n.agree}</span>
              </Button>
            </div>
          ) : null
        }
      >
        {noticeError ? (
          <ErrorState message={noticeError} onRetry={loadNotice} />
        ) : !n || !notice ? (
          <LoadingScreen label="Loading the notice" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <LanguageToggle languages={notice.languages} value={language} onChange={setLanguage} />
            </div>
            <div lang={language === 'hi' ? 'hi' : 'en-IN'} className="flex flex-col gap-2">
              <p className={language === 'hi' ? 'text-callout font-semibold text-accent' : 'text-overline uppercase text-accent'}>{n.eyebrow}</p>
              <h2 className="text-title">{n.title}</h2>
            </div>
            <NoticeBody notice={n} language={language} version={notice.version} />
            <p lang={language === 'hi' ? 'hi' : 'en-IN'} className="rounded-lg border border-border bg-raised p-4 text-callout">{n.later}</p>
          </>
        )}
      </Shell>
    );
  }

  if (step === 'phone') {
    return (
      <Shell title="Your phone number">
        <form
          className="flex flex-1 flex-col gap-section"
          onSubmit={submit(async () => {
            const r = await api(credApi.signup.phone, { body: { signupToken, phone } });
            setSignupToken(r.signupToken);
            go('otp');
          })}
        >
          <p className="text-callout text-muted">We’ll send a one-time code to confirm it’s yours.</p>
          <Field label="Mobile number" prefix="+91" inputMode="numeric" autoComplete="off" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} error={error} />
          <DemoHint>Use a made-up number, never your own. Any 10 digits starting 6–9 work. End it in 0 to see the path for a lower credit score.</DemoHint>
          <Button block loading={busy} disabled={!/^[6-9]\d{9}$/.test(phone)}>Send code</Button>
        </form>
      </Shell>
    );
  }

  if (step === 'otp') {
    return (
      <Shell title="Enter the code" back={() => go('phone')}>
        <form
          className="flex flex-1 flex-col gap-section"
          onSubmit={submit(async () => {
            const r = await api(credApi.signup.otp, { body: { signupToken, otp } });
            setSignupToken(r.signupToken);
            go('dob');
          })}
        >
          <p className="text-callout text-muted">Sent to +91 {phone}.</p>
          <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} error={error} inputClassName="tracking-[0.4em] tabular" />
          <DemoHint>Any 6 digits work.</DemoHint>
          <Button block loading={busy} disabled={otp.length !== 6}>Confirm</Button>
        </form>
      </Shell>
    );
  }

  if (step === 'dob') {
    return (
      <Shell title="Your date of birth">
        <form
          className="flex flex-1 flex-col gap-section"
          onSubmit={submit(async () => {
            const r = await api(credApi.signup.dob, { body: { signupToken, dob } });
            if (r.outcome === 'under_18') {
              setSignupToken('');
              setPhone('');
              setOtp('');
              setDob('');
              go('under_18');
              return;
            }
            setSignupToken(r.signupToken);
            go('details');
          })}
        >
          <p className="text-callout text-muted">CRED is for adults, so we confirm you’re 18 or over. The credit bureau also uses it to find your record.</p>
          <Field label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} error={error} />
          <Button block loading={busy} disabled={!dob}>Continue</Button>
        </form>
      </Shell>
    );
  }

  if (step === 'under_18') {
    return (
      <main className="flex flex-1 animate-enter flex-col justify-center gap-section px-gutter py-12">
        <div className="flex flex-col gap-3">
          <p className="text-overline uppercase text-accent">Thanks for your interest</p>
          <h1 className="text-title">CRED is for adults</h1>
          <p className="text-body text-muted">You need to be 18 or over to join, so we’ve stopped here. We haven’t kept anything you entered. We’d love to see you when you turn 18.</p>
        </div>
        <ButtonLink href="/" variant="secondary" block>Back to start</ButtonLink>
      </main>
    );
  }

  return (
    <Shell title="About you">
      <form
        className="flex flex-1 flex-col gap-section"
        onSubmit={submit(async () => {
          const r = await api(credApi.signup.details, { body: { signupToken, name, email } });
          session.set(r.token);
          window.location.href = '/signup/check';
        })}
      >
        <Field label="Full name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} hint="For statements and notices about your membership. Never marketing." error={error} />
        <DemoHint>Use a made-up name and email. This is a prototype with synthetic data.</DemoHint>
        <Button block loading={busy} disabled={name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)}>Continue</Button>
      </form>
    </Shell>
  );
}

