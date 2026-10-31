import { Icon, type IconName } from '@cred/ui';

export type Tab = 'home' | 'cards' | 'upi' | 'rewards' | 'profile';

const TABS: { id: Tab; label: string; href: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', href: '/', icon: 'home' },
  { id: 'cards', label: 'Cards', href: '/cards', icon: 'card' },
  { id: 'upi', label: 'UPI', href: '/upi', icon: 'upi' },
  { id: 'rewards', label: 'Rewards', href: '/rewards', icon: 'gift' },
  { id: 'profile', label: 'Profile', href: '/profile', icon: 'user' },
];

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-30 border-t border-border bg-bg/90 backdrop-blur-md">
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <a
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-caption transition-calm ${on ? 'text-accent' : 'text-muted hover:text-text'}`}
              >
                <Icon name={t.icon} size={22} />
                <span className={on ? 'font-semibold' : ''}>{t.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
