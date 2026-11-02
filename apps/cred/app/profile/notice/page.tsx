'use client';

import { credApi, type NoticeLanguage } from '@cred/types';
import { Card, ErrorState, LoadingScreen } from '@cred/ui';
import { useState } from 'react';
import { longDate } from '@/lib/format';
import { useApi } from '@/lib/live';
import { LanguageToggle, NoticeBody } from '../../signup/_Notice';
import { Screen } from '../../_shell/Screen';

/** The notice, any time, with what this member agreed to. */
export default function NoticePage() {
  const notice = useApi(credApi.signup.notice, undefined, { live: false });
  const status = useApi(credApi.signup.status, undefined, { live: false });
  const agreed = status.data?.noticeAgreement;
  const [language, setLanguage] = useState<NoticeLanguage>('en');
  return (
    <Screen title="Privacy notice" back="/profile/privacy">
      {notice.error && !notice.data ? (
        <ErrorState message={notice.error} onRetry={notice.reload} />
      ) : !notice.data ? (
        <LoadingScreen label="Loading the notice" />
      ) : (
        <>
          {agreed ? (
            <Card>
              <p className="text-callout">
                You agreed to version <span className="tabular">{agreed.version}</span> on {longDate(agreed.agreedAt.slice(0, 10))}, in {notice.data.languages[agreed.language].languageLabel}.
              </p>
            </Card>
          ) : null}
          <div className="flex justify-end">
            <LanguageToggle languages={notice.data.languages} value={language} onChange={setLanguage} />
          </div>
          <NoticeBody notice={notice.data.languages[language]} language={language} version={notice.data.version} />
        </>
      )}
    </Screen>
  );
}
