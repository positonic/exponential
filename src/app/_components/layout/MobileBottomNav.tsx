'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconInbox,
  IconSun,
  IconCalendar,
  IconListCheck,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

interface NavItemProps {
  href?: string;
  icon: TablerIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}

function NavItem({ href, icon: Icon, label, isActive, onClick }: NavItemProps) {
  const baseClasses = `flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors ${
    isActive
      ? 'text-brand-primary'
      : 'text-text-muted hover:text-text-secondary'
  }`;

  if (onClick) {
    return (
      <button onClick={onClick} className={baseClasses}>
        <Icon size={24} className={isActive ? 'text-brand-primary' : ''} />
        <span className="text-xs font-medium">{label}</span>
      </button>
    );
  }

  return (
    <Link href={href!} className={baseClasses}>
      <Icon size={24} className={isActive ? 'text-brand-primary' : ''} />
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/inbox', icon: IconInbox, label: 'Inbox' },
    { href: '/today', icon: IconSun, label: 'Today' },
    { href: '/calendar', icon: IconCalendar, label: 'Calendar' },
    { href: '/plan', icon: IconListCheck, label: 'Plan' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background-secondary border-t border-border-primary pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </div>
    </nav>
  );
}
