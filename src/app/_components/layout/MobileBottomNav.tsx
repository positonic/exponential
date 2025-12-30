'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconCalendarEvent,
  IconLayoutKanban,
  IconTargetArrow,
  IconMessageCircle,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useAgentDrawer } from '~/providers/AgentDrawerProvider';

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
  const { isOpen, openDrawer } = useAgentDrawer();

  const navItems = [
    { href: '/today', icon: IconCalendarEvent, label: 'Today' },
    { href: '/projects', icon: IconLayoutKanban, label: 'Projects' },
    { href: '/goals', icon: IconTargetArrow, label: 'Goals' },
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
        <NavItem
          icon={IconMessageCircle}
          label="Agent"
          isActive={isOpen}
          onClick={() => openDrawer()}
        />
      </div>
    </nav>
  );
}
