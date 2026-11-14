import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { applyNavVisibility, parseNavLayout } from '~/lib/navLayout';
import { MenuPicker } from '../MenuPicker';

const {
  mockGetPreferences,
  mockGetWorkspaceLayout,
  mockEnabledPlugins,
  mockGetSetup,
  mockSetVisibleItems,
  mockSetUseCase,
  mockSetPreferencesData,
  mockInvalidate,
} = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(() => ({ data: { navLayout: null as unknown }, isLoading: false })),
  mockGetWorkspaceLayout: vi.fn(() => ({ data: { navLayout: null as unknown }, isLoading: false })),
  mockEnabledPlugins: vi.fn(() => ({ data: [] as string[], isLoading: false })),
  mockGetSetup: vi.fn(() => ({ data: { state: { useCase: null as string | null } } })),
  mockSetVisibleItems: vi.fn((_input: { visibleItemIds: string[] }) => Promise.resolve({ navLayout: [] })),
  mockSetUseCase: vi.fn(),
  mockSetPreferencesData: vi.fn(
    (_input: undefined, _updater: (old: { navLayout: unknown }) => { navLayout: unknown }) => undefined,
  ),
  mockInvalidate: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/welcome' }));

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({
      navigationPreference: {
        invalidate: mockInvalidate,
        getPreferences: { cancel: vi.fn(), setData: mockSetPreferencesData },
        getWorkspaceLayout: { cancel: vi.fn(), invalidate: vi.fn(), setData: vi.fn() },
      },
      welcome: { getSetup: { setData: vi.fn() } },
    }),
    navigationPreference: {
      getPreferences: { useQuery: () => mockGetPreferences() },
      getWorkspaceLayout: { useQuery: () => mockGetWorkspaceLayout() },
      updateWorkspaceLayout: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      resetWorkspaceLayout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      setVisibleItems: { useMutation: () => ({ mutateAsync: mockSetVisibleItems }) },
    },
    pluginConfig: { getEnabled: { useQuery: () => mockEnabledPlugins() } },
    welcome: {
      getSetup: { useQuery: () => mockGetSetup() },
      setUseCase: { useMutation: () => ({ mutate: mockSetUseCase }) },
    },
    project: { navChildren: { useQuery: () => ({ data: [], isLoading: false }) } },
    goal: { navChildren: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}));

vi.mock('~/app/_components/layout/InboxCount', () => ({ InboxCount: () => null }));
vi.mock('~/app/_components/layout/TodayCount', () => ({ TodayCount: () => null }));
vi.mock('~/lib/wiki/useWikiBridge', () => ({ useLocalWikiAvailable: () => false }));

const sw = (name: string) => screen.getByRole('switch', { name });
const lastSaved = () => mockSetVisibleItems.mock.calls.at(-1)?.[0]?.visibleItemIds;

describe('MenuPicker', () => {
  // A stand-in for the user-wide layout query and the server behind it: the
  // optimistic write lands in `cached`, a successful save in `stored`, and a
  // refetch copies `stored` over `cached`. Enough to watch the picker after
  // it has let go of its draft.
  let stored: unknown = null;
  let cached: unknown = null;

  beforeEach(() => {
    stored = null;
    cached = null;
    mockGetPreferences.mockImplementation(() => ({ data: { navLayout: cached }, isLoading: false }));
    mockSetPreferencesData.mockReset();
    mockSetPreferencesData.mockImplementation((_input, updater) => {
      cached = updater({ navLayout: cached }).navLayout;
    });
    mockSetVisibleItems.mockReset();
    mockSetVisibleItems.mockImplementation(({ visibleItemIds }) => {
      stored = applyNavVisibility(parseNavLayout(stored), visibleItemIds);
      return Promise.resolve({ navLayout: [] });
    });
    mockInvalidate.mockReset();
    mockInvalidate.mockImplementation(() => {
      cached = stored;
      return Promise.resolve();
    });
    mockGetWorkspaceLayout.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockEnabledPlugins.mockReturnValue({ data: [], isLoading: false });
    mockGetSetup.mockReturnValue({ data: { state: { useCase: null } } });
    mockSetUseCase.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('asks the question as a radio group and requires no answer', () => {
    render(<MenuPicker />);
    const group = screen.getByRole('group', { name: /What would you like to use/ });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-labelledby')).every(Boolean)).toBe(true);
    expect(within(group).getByRole('radio', { name: 'My own to-do list' })).not.toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Working with a team' })).not.toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Both' })).not.toBeChecked();
  });

  it('says what each answer starts the menu with', () => {
    render(<MenuPicker />);
    expect(screen.getByRole('radio', { name: 'My own to-do list' })).toHaveAccessibleDescription(
      /Starts with: Goals, Actions, Projects$/,
    );
  });

  it('offers every item as a named, described switch showing the short default', () => {
    render(<MenuPicker />);
    expect(sw('Goals')).toBeChecked();
    expect(sw('Meetings')).toBeChecked();
    expect(sw('Actions')).not.toBeChecked();
    expect(sw('CRM')).not.toBeChecked();
    expect(sw('CRM')).toHaveAccessibleDescription(
      'The people and organisations you work with.',
    );
    // The state is written out, never left to the colour of the switch.
    expect(within(sw('Goals').closest('label')!).getByText('On')).toBeInTheDocument();
    expect(within(sw('CRM').closest('label')!).getByText('Off')).toBeInTheDocument();
  });

  it('leaves out items this workspace does not offer, and counts only what it shows', () => {
    render(<MenuPicker />);
    expect(screen.queryByRole('switch', { name: 'Products' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Metrics' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('5 of 10 switched on');
  });

  it('offers the product pages where the product plugin is on', () => {
    mockEnabledPlugins.mockReturnValue({ data: ['product'], isLoading: false });
    render(<MenuPicker />);
    expect(sw('Products')).toBeChecked();
    expect(sw('Metrics')).not.toBeChecked();
  });

  it('sets the whole menu from an answer, saves it, and records the answer', async () => {
    render(<MenuPicker />);
    fireEvent.click(screen.getByRole('radio', { name: 'My own to-do list' }));

    expect(screen.getByRole('radio', { name: 'My own to-do list' })).toBeChecked();
    expect(sw('Actions')).toBeChecked();
    expect(sw('Decisions')).not.toBeChecked();
    expect(mockSetUseCase).toHaveBeenCalledWith({ useCase: 'personal' });
    await waitFor(() => expect(lastSaved()).toEqual(['goals', 'actions', 'projects']));
    // The sidebar's own query is rewritten at once, so the real menu follows.
    expect(mockSetPreferencesData).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 of 10 switched on'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('saves a single switch on top of what was already showing', async () => {
    render(<MenuPicker />);
    fireEvent.click(sw('Actions'));
    expect(sw('Actions')).toBeChecked();
    await waitFor(() =>
      expect([...(lastSaved() ?? [])].sort()).toEqual(
        ['actions', 'decisions', 'goals', 'meetings', 'pages', 'products', 'projects'],
      ),
    );

    fireEvent.click(sw('Goals'));
    await waitFor(() => expect(lastSaved()).not.toContain('goals'));
    expect(lastSaved()).toContain('actions');
    // A single switch is not an answer to the question.
    expect(mockSetUseCase).not.toHaveBeenCalled();
  });

  it('puts the switches back and says so when a save fails', async () => {
    mockSetVisibleItems.mockRejectedValueOnce(new Error('offline'));
    render(<MenuPicker />);
    fireEvent.click(sw('CRM'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Not saved'));
    await waitFor(() => expect(sw('CRM')).not.toBeChecked());
  });

  it('carries on from a failed save when a later choice went through', async () => {
    // Every save sends the whole menu, so the later one includes the earlier change.
    mockSetVisibleItems.mockRejectedValueOnce(new Error('offline'));
    render(<MenuPicker />);
    fireEvent.click(sw('CRM'));
    fireEvent.click(sw('Agents'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(lastSaved()).toEqual(expect.arrayContaining(['crm', 'agents']));
    expect(sw('CRM')).toBeChecked();
    expect(sw('Agents')).toBeChecked();
    expect(screen.getByRole('status')).not.toHaveTextContent('Not saved');
  });

  it('follows the sidebar again once a save has landed, and does not undo edits made there', async () => {
    const { rerender } = render(<MenuPicker />);
    fireEvent.click(sw('CRM'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());

    // The customiser, open beside the picker, hides Goals in this workspace.
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: { navLayout: applyNavVisibility(parseNavLayout(cached), ['decisions', 'projects', 'pages', 'meetings', 'crm']) },
    });
    rerender(<MenuPicker />);
    await waitFor(() => expect(sw('Goals')).not.toBeChecked());
    expect(sw('CRM')).toBeChecked();

    // The next switch builds on that edit instead of sending a stale menu over it.
    fireEvent.click(sw('Agents'));
    await waitFor(() => expect(lastSaved()).toContain('agents'));
    expect(lastSaved()).not.toContain('goals');
    expect(lastSaved()).toContain('crm');
  });

  it('keeps a choice in place while its save is still on the way', async () => {
    let release: () => void = () => undefined;
    mockSetVisibleItems.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ navLayout: [] }); }),
    );
    const { rerender } = render(<MenuPicker />);
    fireEvent.click(sw('CRM'));
    await waitFor(() => expect(mockSetVisibleItems).toHaveBeenCalled());

    // A refetch lands mid-save with what the server still holds: CRM off.
    cached = null;
    rerender(<MenuPicker />);
    expect(sw('CRM')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Saving');

    stored = applyNavVisibility(parseNavLayout(null), ['goals', 'decisions', 'projects', 'products', 'pages', 'meetings', 'crm']);
    release();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(sw('CRM')).toBeChecked();
  });

  it('shows the answer given on an earlier visit, and none for someone who skipped', () => {
    mockGetSetup.mockReturnValue({ data: { state: { useCase: 'team' } } });
    const { unmount } = render(<MenuPicker />);
    expect(screen.getByRole('radio', { name: 'Working with a team' })).toBeChecked();
    unmount();

    mockGetSetup.mockReturnValue({ data: { state: { useCase: 'unsure' } } });
    render(<MenuPicker />);
    expect(screen.queryByRole('radio', { checked: true })).not.toBeInTheDocument();
  });

  it('reads the menu the person actually has, not the default', () => {
    mockGetWorkspaceLayout.mockReturnValue({
      isLoading: false,
      data: {
        navLayout: [
          { id: 'connect', name: 'People', hidden: false, items: [{ id: 'crm', hidden: false }] },
          { id: 'align', name: 'Plan', hidden: true, items: [{ id: 'goals', hidden: false }] },
        ],
      },
    });
    render(<MenuPicker />);
    expect(sw('CRM')).toBeChecked();
    // Goals sits in a hidden section, so it is not in the menu.
    expect(sw('Goals')).not.toBeChecked();
  });

  it('holds the choices back until the saved menu has loaded', () => {
    mockGetPreferences.mockImplementation(() => ({ data: undefined as never, isLoading: true }));
    render(<MenuPicker />);
    expect(screen.getByText('Loading your menu…')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Both' })).toBeDisabled();
  });
});
