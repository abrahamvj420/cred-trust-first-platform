import {
  formatInr,
  type BenefitComparison,
  type CheckResult,
  type DecisionOutcome,
  type EngineCheck,
  type FeatureKey,
  type LoanTerms,
  type OfferOption,
  type ReasonCode,
  type StressSignal,
  type TriggerOrigin,
} from '@cred/types';
import { stressSignals, utilisationBps } from './checks/stress';
import { CARD_INTEREST_MONTHLY_BPS, DECLINE_COOLDOWN_DAYS, GST_BPS, MONTHLY_PROACTIVE_OFFER_CAP } from './constants';
import type { MemberSnapshot } from './snapshot';

export interface OfferDraft {
  status: 'awaiting_permission' | 'shown';
  headline: string;
  subline: string;
  netBenefitPaise: number;
  comparison: BenefitComparison;
  options: OfferOption[];
  terms: LoanTerms;
  trigger: { merchant: string; amountPaise: number } | null;
  /** Partner quote per acceptable option key. */
  quoteRefs: Record<string, string>;
}

export interface HelpDraft {
  kind: 'repayment_plan';
  title: string;
  body: string;
  monthlyInterestPaise: number;
}

export interface DecisionDraft {
  feature: FeatureKey;
  origin: TriggerOrigin;
  outcome: DecisionOutcome;
  reasons: ReasonCode[];
  checks: CheckResult[];
  stressSignals: StressSignal[];
  netBenefitPaise: number | null;
  offer: OfferDraft | null;
  help: HelpDraft | null;
  /** First proactive offer: ask once for Smart Savings, showing this offer's value. */
  promptPermission: boolean;
}

export type EngineResult =
  | { kind: 'decision'; decision: DecisionDraft }
  | { kind: 'needs_quotes'; principalPaise: number; tenureMonths: number };

/** Accumulates checks in order; every outcome, including blocked, is a full record. */
export class Decision {
  private checks: CheckResult[] = [];
  private signals: StressSignal[] = [];
  private pendingPermission = false;

  constructor(
    private readonly feature: FeatureKey,
    private readonly origin: TriggerOrigin,
  ) {}

  pass(check: EngineCheck, detail: string): void {
    this.checks.push({ check, passed: true, reason: 'ok', detail });
  }

  pending(check: EngineCheck, reason: ReasonCode, detail: string): void {
    this.checks.push({ check, passed: false, reason, detail });
    if (reason === 'awaiting_permission') this.pendingPermission = true;
  }

  private draft(outcome: DecisionOutcome, reasons: ReasonCode[], extra: Partial<DecisionDraft> = {}): EngineResult {
    return {
      kind: 'decision',
      decision: {
        feature: this.feature,
        origin: this.origin,
        outcome,
        reasons,
        checks: this.checks,
        stressSignals: this.signals,
        netBenefitPaise: null,
        offer: null,
        help: null,
        promptPermission: false,
        ...extra,
      },
    };
  }

  stop(check: EngineCheck, reason: ReasonCode, detail: string): EngineResult {
    this.checks.push({ check, passed: false, reason, detail });
    return this.draft('blocked', [reason]);
  }

  help(signals: StressSignal[], detail: string, help: HelpDraft | null): EngineResult {
    this.signals = signals;
    this.checks.push({ check: 'stress', passed: false, reason: 'stress_signal', detail });
    return this.draft('help', ['stress_signal'], { help });
  }

  offer(netBenefitPaise: number, o: Omit<OfferDraft, 'status' | 'netBenefitPaise'>): EngineResult {
    const reasons: ReasonCode[] = this.pendingPermission ? ['awaiting_permission'] : ['ok'];
    return this.draft('offer', reasons, {
      netBenefitPaise,
      offer: { ...o, netBenefitPaise, status: this.pendingPermission ? 'awaiting_permission' : 'shown' },
      promptPermission: this.pendingPermission,
    });
  }
}

/** Proactive offers need Smart Savings. If never asked, continue and ask once with the offer's value. */
export function permissionCheck(d: Decision, s: MemberSnapshot): EngineResult | null {
  if (s.smartSavings === 'granted') {
    d.pass('permission', 'Smart Savings is on.');
    return null;
  }
  if (s.smartSavings === 'never' && !s.smartSavingsPrompted) {
    d.pending('permission', 'awaiting_permission', 'Smart Savings not yet asked; will ask once, with this offer’s value.');
    return null;
  }
  return d.stop('permission', 'no_permission', s.smartSavings === 'withdrawn' ? 'Smart Savings was withdrawn.' : 'Member said not now to Smart Savings.');
}

export function repaymentHelp(s: MemberSnapshot): HelpDraft {
  const monthlyInterest = Math.round((s.card.outstandingPaise * CARD_INTEREST_MONTHLY_BPS * (10_000 + GST_BPS)) / 10_000 / 10_000);
  const bill = s.statements[0];
  return {
    kind: 'repayment_plan',
    title: `You’re carrying ${formatInr(s.card.outstandingPaise)} on your card`,
    body:
      `At 3.5% a month plus GST that costs about ${formatInr(monthlyInterest)} a month. ` +
      `We won’t offer you new credit right now. ` +
      (bill ? `Paying the full bill of ${formatInr(bill.totalDuePaise)} by ${bill.dueDate} stops the interest; ` : '') +
      `if that’s hard this month, set up a repayment plan or talk to us.`,
    monthlyInterestPaise: monthlyInterest,
  };
}

/** Stressed members get help, not credit. */
export function stressCheck(d: Decision, s: MemberSnapshot): EngineResult | null {
  const signals = stressSignals(s);
  if (!signals.length) {
    d.pass('stress', `No stress signals (utilisation ${Math.round(utilisationBps(s) / 100)}%).`);
    return null;
  }
  return d.help(
    signals,
    `Stress: ${signals.join(', ')} (utilisation ${Math.round(utilisationBps(s) / 100)}%). Repayment help instead of credit.`,
    s.helpThisMonth === 0 ? repaymentHelp(s) : null,
  );
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** One active offer at a time, a monthly cap, and a cooling-off after "No thanks". */
export function capCheck(d: Decision, s: MemberSnapshot, feature: FeatureKey): EngineResult | null {
  if (s.offers.activeOfferId) return d.stop('offer_cap', 'active_offer_exists', 'Another offer is already active; one at a time.');
  if (s.offers.proactiveThisMonth >= MONTHLY_PROACTIVE_OFFER_CAP) {
    return d.stop('offer_cap', 'monthly_cap_reached', `Monthly cap of ${MONTHLY_PROACTIVE_OFFER_CAP} proactive offers reached.`);
  }
  const recent = s.offers.declines.find((x) => x.feature === feature && daysBetween(x.decidedOn, s.today) < DECLINE_COOLDOWN_DAYS);
  if (recent) return d.stop('offer_cap', 'recently_declined', `Member said no thanks on ${recent.decidedOn}; quiet for ${DECLINE_COOLDOWN_DAYS} days.`);
  d.pass('offer_cap', `No active offer; ${s.offers.proactiveThisMonth} of ${MONTHLY_PROACTIVE_OFFER_CAP} this month.`);
  return null;
}
