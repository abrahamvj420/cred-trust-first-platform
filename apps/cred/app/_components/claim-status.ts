import type { Claim } from '@cred/types';

export const CLAIM_STATUS: Record<Claim['status'], { text: string; tone: 'neutral' | 'accent' | 'positive' | 'warning' }> = {
  filed: { text: 'Filed', tone: 'neutral' },
  documents_pending: { text: 'Needs a document', tone: 'warning' },
  under_review: { text: 'Being reviewed', tone: 'accent' },
  approved: { text: 'Approved', tone: 'positive' },
  settled: { text: 'Paid', tone: 'positive' },
  rejected: { text: 'Not approved', tone: 'neutral' },
};
