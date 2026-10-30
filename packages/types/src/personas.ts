import type { PersonaKey } from './enums';

/**
 * Synthetic demo identities, shared by every app. Phone numbers are fictional
 * and are the link between a person in the ecosystem and a CRED member.
 */
export interface DemoPersona {
  key: PersonaKey;
  name: string;
  phone: string;
  city: string;
  age: number;
  tagline: string;
  /** Default UPI ID at the persona's bank. */
  vpa: string;
}

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    key: 'aarav',
    name: 'Aarav Mehta',
    phone: '9000000001',
    city: 'Bengaluru',
    age: 32,
    tagline: 'Product manager, pays on time, about to buy a laptop',
    vpa: 'aarav@mockbank',
  },
  {
    key: 'priya',
    name: 'Priya Nair',
    phone: '9000000002',
    city: 'Mumbai',
    age: 38,
    tagline: 'Family of five, employer cover only, renewal due',
    vpa: 'priya@mockbank',
  },
  {
    key: 'sneha',
    name: 'Sneha Kapoor',
    phone: '9000000003',
    city: 'Delhi',
    age: 45,
    tagline: 'Strong savings, saving for a house down payment',
    vpa: 'sneha@mockbank',
  },
  {
    key: 'kabir',
    name: 'Kabir Singh',
    phone: '9000000004',
    city: 'Hyderabad',
    age: 29,
    tagline: 'Newer member, one partial bill after a wedding',
    vpa: 'kabir@mockbank',
  },
  {
    key: 'rohan',
    name: 'Rohan Das',
    phone: '9000000005',
    city: 'Pune',
    age: 27,
    tagline: 'Under financial stress: high utilisation, partial payments',
    vpa: 'rohan@mockbank',
  },
] as const;

export function personaByKey(key: PersonaKey): DemoPersona {
  const p = DEMO_PERSONAS.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown persona ${key}`);
  return p;
}

/** Simulated "today" at seed time. ecosystem-api owns the clock after that. */
export const SIM_START_DATE = '2026-11-02';
