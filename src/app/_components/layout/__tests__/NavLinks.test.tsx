import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { NavLinks, GlobalNavLinks } from '../NavLinks';
import { SidebarModeProvider } from '../sidebarMode';

const {
  mockUseWorkspace,
  mockUsePathname,
  mockGetPreferences,
  mockUpdateNavLayout,
  mockSetPreferencesData,
} = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/today'),
  mockGetPreferences: vi.fn(() => ({ data: undefined })),
  mockUpdateNavLayout: vi.fn(),
  mockSetPreferencesData: vi.fn(),
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
        getPreferences: { invalidate: vi.fn(), setData: mockSetPreferencesData },
      },
    }),
    navigationPreference: {
      getPreferences: { useQuery: () => mockGetPreferences() },
      updateNavLayout: { useMutation: () => ({ mutate: mockUpdateNavLayout }) },
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
    mockGetPreferences.mockReturnValue({ data: undefined });
    mockUpdateNavLayout.mockReset();
    mockSetPreferencesData.mockReset();
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

  it('folds a section on click and persists the fold on the layout', () => {
    render(<NavLinks />);
    const heading = screen.getByRole('button', { name: 'Plan' });
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Decisions' })).toBeInTheDocument();

    fireEvent.click(heading);

    expect(mockSetPreferencesData).toHaveBeenCalled();
    const saved = mockUpdateNavLayout.mock.calls[0]?.[0] as Array<{ id: string; collapsed?: boolean }>;
    expect(saved.find((s) => s.id === 'align')?.collapsed).toBe(true);
    expect(saved.find((s) => s.id === 'deliver')?.collapsed).toBeFalsy();
  });

  it('hides the items of a section saved as collapsed', () => {
    mockGetPreferences.mockReturnValue({
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
    mockGetPreferences.mockReturnValue({
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
