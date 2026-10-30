import { ServiceGrid } from './ServiceGrid';

export default function DemoControlRoom() {
  const demo = process.env.DEMO_MODE === 'true';
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Demo control room</h1>
        <p className="text-sm text-muted">
          Service status. Persona switching, scenarios, time travel and reset arrive in M6.
          {demo ? '' : ' DEMO_MODE is off, so the control room is disabled.'}
        </p>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Services</h2>
        <ServiceGrid />
      </section>
    </main>
  );
}
