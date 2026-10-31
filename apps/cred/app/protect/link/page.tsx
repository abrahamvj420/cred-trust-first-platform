'use client';

import { LinkViaAa } from '../../_components/LinkViaAa';

export default function LinkPolicies() {
  return (
    <LinkViaAa
      purpose="protection_review"
      returnTo="/protect"
      title="Link your policies"
      cta="Continue to Account Aggregator"
      points={[
        'On SimAA you choose to share your policies with the insurer, including any cover from your employer. Nothing is pre-selected.',
        'CRED reads what each policy covers and when it renews. Not your medical history; not claims you made elsewhere.',
        'We compare your cover with what we’d suggest and show the cheapest way to close a gap, or nothing if you’re covered.',
        'Turn it off any time in Permissions: we delete the linked policies straight away.',
      ]}
    />
  );
}
