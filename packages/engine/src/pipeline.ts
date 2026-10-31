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
import { describeStress, stressSignals, utilisationBps } from './checks/stress';
import type { RuleValues } from './rules';
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
  /** Plain-English "why am I seeing this / why not", shown to the member and in admin. */
  explanation: string;
}

export type EngineResult =
  | { kind: 'decision'; decision: DecisionDraft }
  | { kind: 'needs_quotes'; principalPaise: number; tenureMonths: number };

export const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const prettyDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Accumulates checks in order; every outcome, including blocked, is a full record with a reason and a why. */
export class Decision {
  private checks: CheckResult[] = [];
  private signals: StressSignal[] = [];
  private pendingPermission = false;

  constructor(
    readonly feature: FeatureKey,
    readonly origin: TriggerOrigin,
  ) {}

  pass(check: EngineCheck, detail: string): void {
    this.checks.push({ check, passed: true, reason: 'ok', detail });
  }

  pending(check: EngineCheck, reason: ReasonCode, detail: string): void {
    this.checks.push({ check, passed: false, reason, detail });
    if (reason === 'awaiting_permission') this.pendingPermission = true;
  }

  get awaitingPermission(): boolean {
    return this.pendingPermission;
  }

  private draft(outcome: DecisionOutcome, reasons: ReasonCode[], explanation: string, extra: Partial<DecisionDraft> = {}): EngineResult {
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
        explanation,
        ...extra,
      },
    };
  }

  /** Blocked: `detail` is for admin, `why` is for the member. */
  stop(check: EngineCheck, reason: ReasonCode, detail: string, why: string): EngineResult {
    this.checks.push({ check, passed: false, reason, detail });
    return this.draft('blocked', [reason], why);
  }

  help(signals: StressSignal[], detail: string, why: string, help: HelpDraft | null): EngineResult {
    this.signals = signals;
    this.checks.push({ check: 'stress', passed: false, reason: 'stress_signal', detail });
    return this.draft('help', ['stress_signal'], why, { help });
  }

  offer(netBenefitPaise: number, o: Omit<OfferDraft, 'status' | 'netBenefitPaise'>, why: string): EngineResult {
    const reasons: ReasonCode[] = this.pendingPermission ? ['awaiting_permission'] : ['ok'];
    return this.draft('offer', reasons, why, {
      netBenefitPaise,
      offer: { ...o, netBenefitPaise, status: this.pendingPermission ? 'awaiting_permission' : 'shown' },
      promptPermission: this.pendingPermission,
    });
  }
}

/**
 * Proactive offers need Smart Savings. Never asked → continue and ask once,
 * with the offer's value. "Not now" → not asked again for the re-ask period.
 * Member-initiated requests need no permission.
 */
export function permissionCheck(d: Decision, s: MemberSnapshot, rules: RuleValues): EngineResult | null {
  if (d.origin === 'member_initiated') {
    d.pass('permission', 'Member asked; no Smart Savings permission needed.');
    return null;
  }
  if (s.smartSavings === 'granted') {
    d.pass('permission', 'Smart Savings is on.');
    return null;
  }
  if (s.smartSavings === 'withdrawn') {
    return d.stop('permission', 'no_permission', 'Smart Savings was withdrawn.', 'No suggestion: you turned Smart Savings off, so CRED doesn’t look for savings for you. You can turn it back on in Permissions.');
  }
  if (s.smartSavingsLastAskedOn && daysBetween(s.smartSavingsLastAskedOn, s.today) < rules.permissionReaskDays) {
    const until = addDays(s.smartSavingsLastAskedOn, rules.permissionReaskDays);
    return d.stop(
      'permission',
      'no_permission',
      `Asked on ${s.smartSavingsLastAskedOn}, not turned on; re-ask after ${until}.`,
      `No suggestion: you said not now to Smart Savings on ${prettyDate(s.smartSavingsLastAskedOn)}, so we won’t ask again before ${prettyDate(until)}.`,
    );
  }
  d.pending('permission', 'awaiting_permission', 'Smart Savings not on; will ask once, with this offer’s value.');
  return null;
}

export function repaymentHelp(s: MemberSnapshot, rules: RuleValues): HelpDraft {
  const monthlyInterest = Math.round((s.card.outstandingPaise * rules.cardInterestMonthlyBps * (10_000 + rules.gstBps)) / 10_000 / 10_000);
  const bill = s.statements[0];
  return {
    kind: 'repayment_plan',
    title: `You’re carrying ${formatInr(s.card.outstandingPaise)} on your card`,
    body:
      `At 3.5% a month plus GST that costs about ${formatInr(monthlyInterest)} a month. ` +
      `We won’t offer you new credit right now. ` +
      (bill ? `Paying the full bill of ${formatInr(bill.totalDuePaise)} by ${prettyDate(bill.dueDate)} stops the interest; ` : '') +
      `if that’s hard this month, set up a repayment plan or talk to us.`,
    monthlyInterestPaise: monthlyInterest,
  };
}

/** Stressed members get help, not credit, whoever asked. */
export function stressCheck(d: Decision, s: MemberSnapshot, rules: RuleValues): EngineResult | null {
  const signals = stressSignals(s, rules);
  const util = Math.round(utilisationBps(s) / 100);
  if (!signals.length) {
    d.pass('stress', `No stress signals (utilisation ${util}%).`);
    return null;
  }
  return d.help(
    signals,
    `Stress: ${signals.join(', ')} (utilisation ${util}%). Repayment help instead of credit.`,
    `No credit offer: your recent card activity shows ${describeStress(signals)} (${util}% of your limit used). More credit wouldn’t help, so here are ways to bring the balance down instead.`,
    s.helpThisMonth === 0 ? repaymentHelp(s, rules) : null,
  );
}

/** One active offer at a time (every feature, every origin); proactive offers also have a monthly cap and a quiet period after "No thanks". */
export function capCheck(d: Decision, s: MemberSnapshot, rules: RuleValues): EngineResult | null {
  if (s.offers.activeOfferId) {
    return d.stop('offer_cap', 'active_offer_exists', 'Another offer is already active; one at a time.', 'No new suggestion: you already have one open, and we show at most one at a time. Accept or dismiss it first.');
  }
  if (d.origin === 'proactive') {
    if (s.offers.proactiveThisMonth >= rules.monthlyProactiveOfferCap) {
      return d.stop(
        'offer_cap',
        'monthly_cap_reached',
        `Monthly cap of ${rules.monthlyProactiveOfferCap} proactive offers reached.`,
        `No new suggestion: you’ve already had ${rules.monthlyProactiveOfferCap} this month, which is our limit.`,
      );
    }
    const recent = s.offers.declines.find((x) => x.feature === d.feature && daysBetween(x.decidedOn, s.today) < rules.declineCooldownDays);
    if (recent) {
      const until = addDays(recent.decidedOn, rules.declineCooldownDays);
      return d.stop(
        'offer_cap',
        'recently_declined',
        `Declined on ${recent.decidedOn}; quiet until ${until}.`,
        `No suggestion: you said no thanks to a similar one on ${prettyDate(recent.decidedOn)}, so we’re staying quiet until ${prettyDate(until)}.`,
      );
    }
  }
  d.pass('offer_cap', d.origin === 'proactive' ? `No active offer; ${s.offers.proactiveThisMonth} of ${rules.monthlyProactiveOfferCap} this month.` : 'No active offer.');
  return null;
}
