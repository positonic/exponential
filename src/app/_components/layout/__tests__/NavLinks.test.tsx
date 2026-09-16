import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { NavLinks } from '../NavLinks';

const { mockUseWorkspace, mockUsePathname } = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/today'),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    navigationPreference: { getPreferences: { useQuery: () => ({ data: undefined }) } },
    pluginConfig: { getEnabled: { useQuery: () => ({ data: [] }) } },
  },
}));

vi.mock('../InboxCount', () => ({ InboxCount: () => null }));
vi.mock('../TodayCount', () => ({ TodayCount: () => null }));
vi.mock('~/lib/wiki/useWikiBridge', () => ({ useLocalWikiAvailable: () => false }));

function timeLink(): HTMLElement {
  return screen.getByRole('link', { name: 'Time' });
}

describe('NavLinks — Time', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' });
  });

  afterEach(() => {
    cleanup();
  });

  it('links to the global /time page, for members and guests alike', () => {
    render(<NavLinks />);
    expect(timeLink()).toHaveAttribute('href', '/time');

    cleanup();
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'guest' });
    render(<NavLinks />);
    expect(timeLink()).toHaveAttribute('href', '/time');
  });

  it('is active on /time', () => {
    mockUsePathname.mockReturnValue('/time');
    render(<NavLinks />);
    expect(timeLink()).toHaveAttribute('aria-current', 'page');
  });

  it('is not active on /timeline, which only shares a prefix', () => {
    mockUsePathname.mockReturnValue('/timeline');
    render(<NavLinks />);
    expect(timeLink()).not.toHaveAttribute('aria-current');
  });
});
