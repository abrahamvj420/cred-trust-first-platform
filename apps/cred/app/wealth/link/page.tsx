'use client';

import { LinkViaAa } from '../../_components/LinkViaAa';

export default function LinkWealth() {
  return (
    <LinkViaAa
      purpose="portfolio_tracking"
      returnTo="/wealth"
      title="Link investments"
      cta="Continue to Account Aggregator"
      points={[
        'On SimAA you choose which fund folios and fixed deposits to share. Nothing is pre-selected.',
        'CRED sees holdings and values (not your bank transactions), refreshed when they change, for 12 months.',
        'Use it to track everything in one place and plan goals. Fees are shown in rupees.',
        'Turn it off any time in Permissions: we delete the linked holdings straight away.',
      ]}
    />
  );
}
