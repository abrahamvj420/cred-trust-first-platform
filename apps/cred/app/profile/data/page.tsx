import { Decisions } from '../../_components/Decisions';
import { Screen } from '../../_shell/Screen';

/** Part of the privacy area (M6 adds "What CRED knows", download and delete). */
export default function DataAndDecisions() {
  return (
    <Screen title="Your data and decisions" back="/profile">
      <p className="text-callout text-muted">Every time CRED considers a suggestion for you, it’s recorded here with the reason, whether or not we showed it.</p>
      <Decisions />
    </Screen>
  );
}
