import { ControlRoom, DemoSection } from './ControlRoom';
import { ServiceGrid } from './ServiceGrid';

export default function DemoControlRoom() {
  const demo = process.env.DEMO_MODE === 'true';
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Control room</h1>
        <p className="text-sm text-muted">
          Drive the simulated world: every feature’s real-world trigger, time, personas and reset.{' '}
          {demo ? 'DEMO_MODE is on.' : 'DEMO_MODE is off, so services refuse every action here.'}
        </p>
      </header>
      <DemoSection title="Services">
        <ServiceGrid />
      </DemoSection>
      <DemoSection title="Triggers">
        <ControlRoom />
      </DemoSection>
    </main>
  );
}
