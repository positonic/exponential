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

const { mockWorkspaceLayout } = vi.hoisted(() => ({
  mockWorkspaceLayout: { current: null as unknown },
}));

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({ navigationPreference: { getWorkspaceLayout: { invalidate: vi.fn(), setData: vi.fn() } } }),
    navigationPreference: {
      getPreferences: { useQuery: () => ({ data: undefined }) },
      getWorkspaceLayout: { useQuery: () => ({ data: { navLayout: mockWorkspaceLayout.current }, isLoading: false }) },
      updateWorkspaceLayout: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      resetWorkspaceLayout: { useMutation: () => ({ mutate: vi.fn() }) },
    },
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

describe('NavLinks — workspace layout', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' });
    mockUsePathname.mockReturnValue('/today');
  });

  afterEach(() => {
    cleanup();
    mockWorkspaceLayout.current = null;
  });

  it('renders pinned shortcuts under the global items, and custom links as links', () => {
    mockWorkspaceLayout.current = [
      {
        id: 'shortcuts',
        name: 'Shortcuts',
        hidden: false,
        items: [
          { id: 'pages', hidden: false },
          { id: 'link-1', hidden: false, label: 'Docs', href: 'https://example.com/docs' },
        ],
      },
    ];
    render(<NavLinks />);
    expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute('href', '/w/test/pages');
    const docs = screen.getByRole('link', { name: 'Docs' });
    expect(docs).toHaveAttribute('href', 'https://example.com/docs');
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides an item the workspace layout marks hidden', () => {
    mockWorkspaceLayout.current = [
      { id: 'align', name: 'Align', hidden: false, items: [{ id: 'goals', hidden: true }, { id: 'decisions', hidden: false }] },
    ];
    render(<NavLinks />);
    expect(screen.queryByRole('link', { name: 'Goals' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Decisions' })).toBeInTheDocument();
  });
});
