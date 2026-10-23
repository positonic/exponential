import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { NavLinks, GlobalNavLinks } from '../NavLinks';
import { SidebarModeProvider } from '../sidebarMode';

const {
  mockUseWorkspace,
  mockUsePathname,
  mockGetPreferences,
  mockGetWorkspaceLayout,
  mockUpdateWorkspaceLayout,
  mockSetWorkspaceLayoutData,
} = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/today'),
  // `data: undefined, isLoading: true` is the in-flight query.
  mockGetPreferences: vi.fn(() => ({ data: undefined as unknown, isLoading: true })),
  mockGetWorkspaceLayout: vi.fn(() => ({ data: { navLayout: null as unknown }, isLoading: false })),
  mockUpdateWorkspaceLayout: vi.fn(() => Promise.resolve()),
  mockSetWorkspaceLayoutData: vi.fn(),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({
      navigationPreference: {
        getWorkspaceLayout: { invalidate: vi.fn(), setData: mockSetWorkspaceLayoutData },
      },
    }),
    navigationPreference: {
      getPreferences: { useQuery: () => mockGetPreferences() },
      getWorkspaceLayout: { useQuery: () => mockGetWorkspaceLayout() },
      updateWorkspaceLayout: {
        useMutation: () => ({ mutateAsync: mockUpdateWorkspaceLayout, isPending: false, error: null }),
      },
      resetWorkspaceLayout: { useMutation: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }) },
    },
    pluginConfig: { getEnabled: { useQuery: () => ({ data: [] }) } },
    project: { navChildren: { useQuery: () => ({ data: [], isLoading: false }) } },
    goal: { navChildren: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}));

vi.mock('../InboxCount', () => ({ InboxCount: () => null }));
vi.mock('../TodayCount', () => ({ TodayCount: () => null }));
vi.mock('~/lib/wiki/useWikiBridge', () => ({ useLocalWikiAvailable: () => false }));

function timeLink(): HTMLElement {
  return screen.getByRole('link', { name: 'Time' });
}

describe('GlobalNavLinks — Time', () => {
  afterEach(() => {
    cleanup();
  });

  it('links to the global /time page', () => {
    render(<GlobalNavLinks />);
    expect(timeLink()).toHaveAttribute('href', '/time');
  });

  it('is active on /time', () => {
    mockUsePathname.mockReturnValue('/time');
    render(<GlobalNavLinks />);
    expect(timeLink()).toHaveAttribute('aria-current', 'page');
  });

  it('is not active on /timeline, which only shares a prefix', () => {
    mockUsePathname.mockReturnValue('/timeline');
    render(<GlobalNavLinks />);
    expect(timeLink()).not.toHaveAttribute('aria-current');
  });
});

describe('NavLinks — sections', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' });
    mockGetPreferences.mockReturnValue({ data: undefined, isLoading: true });
    mockGetWorkspaceLayout.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockUpdateWorkspaceLayout.mockClear();
    mockSetWorkspaceLayoutData.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a heading only for sections with more than one item', () => {
    render(<NavLinks />);
    // Plan (Goals, Decisions) and Tools (Agents, Meetings, Knowledge) fold.
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument();
    // People holds only CRM, so the label would cost more than it tells.
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CRM' })).toBeInTheDocument();
  });

  it('does not write the layout back while preferences are still loading', () => {
    // The in-flight query; the fold would otherwise persist the defaults over
    // the user's saved renames and hidden items.
    render(<NavLinks />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(mockUpdateWorkspaceLayout).not.toHaveBeenCalled();
    expect(mockSetWorkspaceLayoutData).not.toHaveBeenCalled();
  });

  it('does not write the layout back when the preferences query failed', () => {
    mockGetPreferences.mockReturnValue({ data: undefined, isLoading: false });
    render(<NavLinks />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(mockUpdateWorkspaceLayout).not.toHaveBeenCalled();
    expect(mockSetWorkspaceLayoutData).not.toHaveBeenCalled();
  });

  it('folds a section on click and persists the fold on this workspace\'s layout', async () => {
    mockGetPreferences.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    render(<NavLinks />);
    const heading = screen.getByRole('button', { name: 'Plan' });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Decisions' })).toBeInTheDocument();

    fireEvent.click(heading);

    expect(mockSetWorkspaceLayoutData).toHaveBeenCalledWith({ workspaceId: 'ws1' }, expect.anything());
    // Saves are chained on a promise so they land in edit order.
    await waitFor(() => expect(mockUpdateWorkspaceLayout).toHaveBeenCalled());
    const call = mockUpdateWorkspaceLayout.mock.calls[0]?.[0] as
      | { workspaceId: string; layout: Array<{ id: string; collapsed?: boolean }> }
      | undefined;
    expect(call?.workspaceId).toBe('ws1');
    expect(call?.layout.find((s) => s.id === 'align')?.collapsed).toBe(true);
    expect(call?.layout.find((s) => s.id === 'deliver')?.collapsed).toBeFalsy();
  });

  it('hides the items of a section saved as collapsed', () => {
    mockGetPreferences.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: {
        navLayout: [
          { id: 'align', name: 'Plan', hidden: false, collapsed: true, items: [{ id: 'goals', hidden: false }, { id: 'decisions', hidden: false }] },
        ],
      },
    });
    render(<NavLinks />);
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument();
    // Other sections still render from the defaults.
    expect(screen.getByRole('link', { name: 'Actions' })).toBeInTheDocument();
  });

  it('in the rail shows every icon, ignoring headings and folds', () => {
    mockGetPreferences.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: {
        navLayout: [
          { id: 'align', name: 'Plan', hidden: false, collapsed: true, items: [{ id: 'goals', hidden: false }, { id: 'decisions', hidden: false }] },
        ],
      },
    });
    render(
      <SidebarModeProvider value="rail">
        <NavLinks />
      </SidebarModeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Decisions' })).toBeInTheDocument();
    // The rail relies on native tooltips.
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveAttribute('title', 'Decisions');
  });

  it('gives Projects and Goals a disclosure control', () => {
    render(<NavLinks />);
    expect(screen.getByRole('button', { name: 'Show active projects' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show active goals' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show active projects' }));
    expect(screen.getByText('No active projects')).toBeInTheDocument();
  });

  it('shows a guest only Projects', () => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'guest' });
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/w/test/projects');
    expect(screen.queryByRole('link', { name: 'Goals' })).not.toBeInTheDocument();
  });
});

describe('NavLinks — workspace layout', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' });
    mockUsePathname.mockReturnValue('/today');
    mockGetPreferences.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockGetWorkspaceLayout.mockReturnValue({ data: { navLayout: null }, isLoading: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders pinned shortcuts without a heading, and custom links as external links', () => {
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: {
        navLayout: [
          {
            id: 'shortcuts',
            name: 'Shortcuts',
            hidden: false,
            items: [
              { id: 'pages', hidden: false },
              { id: 'link-1', hidden: false, label: 'Docs', href: 'https://example.com/docs' },
            ],
          },
        ],
      },
    });
    render(<NavLinks />);
    expect(screen.queryByRole('button', { name: 'Shortcuts' })).not.toBeInTheDocument();
    expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute('href', '/w/test/pages');
    const docs = screen.getByRole('link', { name: 'Docs' });
    expect(docs).toHaveAttribute('href', 'https://example.com/docs');
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('prefers the workspace layout over the user-wide one', () => {
    mockGetPreferences.mockReturnValue({
      isLoading: false,
      data: { navLayout: [{ id: 'align', name: 'Plan', hidden: false, items: [{ id: 'goals', hidden: true }, { id: 'decisions', hidden: false }] }] },
    });
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: { navLayout: [{ id: 'align', name: 'Plan', hidden: false, items: [{ id: 'goals', hidden: false }, { id: 'decisions', hidden: true }] }] },
    });
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument();
  });

  it('falls back to the user-wide layout when the workspace has none', () => {
    mockGetPreferences.mockReturnValue({
      isLoading: false,
      data: { navLayout: [{ id: 'align', name: 'Plan', hidden: false, items: [{ id: 'goals', hidden: true }, { id: 'decisions', hidden: false }] }] },
    });
    render(<NavLinks />);
    expect(screen.queryByRole('link', { name: 'Goals' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Decisions' })).toBeInTheDocument();
  });
});
