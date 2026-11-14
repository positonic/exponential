import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { MenuPicker } from '../MenuPicker';

const {
  mockGetPreferences,
  mockGetWorkspaceLayout,
  mockEnabledPlugins,
  mockGetSetup,
  mockSetVisibleItems,
  mockSetUseCase,
  mockSetPreferencesData,
} = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(() => ({ data: { navLayout: null as unknown }, isLoading: false })),
  mockGetWorkspaceLayout: vi.fn(() => ({ data: { navLayout: null as unknown }, isLoading: false })),
  mockEnabledPlugins: vi.fn(() => ({ data: [] as string[], isLoading: false })),
  mockGetSetup: vi.fn(() => ({ data: { state: { useCase: null as string | null } } })),
  mockSetVisibleItems: vi.fn((_input: { visibleItemIds: string[] }) => Promise.resolve({ navLayout: [] })),
  mockSetUseCase: vi.fn(),
  mockSetPreferencesData: vi.fn(),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({ workspaceSlug: 'test', workspaceId: 'ws1', userRole: 'member' }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/welcome' }));

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({
      navigationPreference: {
        invalidate: vi.fn(),
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
  beforeEach(() => {
    mockGetPreferences.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockGetWorkspaceLayout.mockReturnValue({ data: { navLayout: null }, isLoading: false });
    mockEnabledPlugins.mockReturnValue({ data: [], isLoading: false });
    mockGetSetup.mockReturnValue({ data: { state: { useCase: null } } });
    mockSetVisibleItems.mockClear();
    mockSetUseCase.mockClear();
    mockSetPreferencesData.mockClear();
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
    expect(sw('CRM')).not.toBeChecked();
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
    mockGetPreferences.mockReturnValue({ data: undefined as never, isLoading: true });
    render(<MenuPicker />);
    expect(screen.getByText('Loading your menu…')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Both' })).toBeDisabled();
  });
});
