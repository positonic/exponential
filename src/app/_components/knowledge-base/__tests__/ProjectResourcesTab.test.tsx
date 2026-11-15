/**
 * The Project page's Resources view (retro.beacon, ADR-0082): who sees which
 * control. The owner gets theirs, a Project editor gets Unfile on what others
 * filed and nothing more, and everyone else opens and reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';

const { listState, unfileMutate, invalidateList } = vi.hoisted(() => ({
  listState: { current: {} as Record<string, unknown> },
  unfileMutate: vi.fn(),
  invalidateList: vi.fn(),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({ resource: { list: { invalidate: invalidateList } } }),
    resource: {
      list: { useInfiniteQuery: () => listState.current },
      unfile: {
        useMutation: (options: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            unfileMutate(input);
            options.onSuccess?.();
          },
          isPending: false,
          variables: undefined,
        }),
      },
      setPinned: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

import { ProjectResourcesTab } from '../ProjectResourcesTab';

const mine = {
  id: 'mine',
  title: 'My listing',
  url: 'https://www.airbnb.com/rooms/1?check_in=2027-01-25',
  createdAt: new Date('2026-11-10T10:00:00Z'),
  pinnedAsContext: false,
  isMine: true,
  owner: { id: 'me', name: 'Me' },
  readStatus: 'to_read',
};
const theirs = {
  id: 'theirs',
  title: 'Their listing',
  url: 'https://www.airbnb.com/rooms/2',
  createdAt: new Date('2026-11-12T10:00:00Z'),
  pinnedAsContext: false,
  isMine: false,
  owner: { id: 'james', name: 'James' },
  readStatus: null,
};

function show(resources: unknown[], canEdit: boolean) {
  listState.current = { isLoading: false, error: null, data: { pages: [{ resources }] }, hasNextPage: false };
  render(<ProjectResourcesTab projectId="p1" workspaceSlug="acme" canEdit={canEdit} />);
}

/** The row a title sits in: the title is inside the row's link. */
const row = (title: string) => screen.getByText(title).closest('a')!.parentElement as HTMLElement;

describe('ProjectResourcesTab', () => {
  beforeEach(() => {
    unfileMutate.mockReset();
    invalidateList.mockReset();
  });

  it('lists every Resource with who saved it and when; the title opens the reader and a separate link the saved address', () => {
    show([mine, theirs], false);

    expect(screen.getByText(/Saved by you · Nov 10/)).toBeInTheDocument();
    expect(screen.getByText(/Saved by James · Nov 12/)).toBeInTheDocument();

    expect(screen.getByText('Their listing').closest('a')).toHaveAttribute('href', '/w/acme/knowledge-base/theirs');
    const original = within(row('My listing')).getByLabelText('Open original');
    expect(original).toHaveAttribute('href', 'https://www.airbnb.com/rooms/1?check_in=2027-01-25');
    expect(original).toHaveAttribute('target', '_blank');
  });

  it("a Project editor gets Unfile on a Resource they do not own, and nothing else; using it refreshes the list", () => {
    show([theirs], true);
    const actions = within(row('Their listing'));

    expect(actions.queryByLabelText('Pin')).not.toBeInTheDocument();
    expect(actions.queryByLabelText('Delete')).not.toBeInTheDocument();
    fireEvent.click(actions.getByLabelText('Unfile'));

    expect(unfileMutate).toHaveBeenCalledWith({ id: 'theirs' });
    expect(invalidateList).toHaveBeenCalled();
  });

  it('a viewer who cannot edit the Project sees no Unfile and no owner controls on what others filed', () => {
    show([theirs], false);
    const actions = within(row('Their listing'));

    expect(actions.queryByLabelText('Unfile')).not.toBeInTheDocument();
    expect(actions.queryByLabelText('Pin')).not.toBeInTheDocument();
    expect(actions.queryByLabelText('Delete')).not.toBeInTheDocument();
    expect(actions.getByText('Their listing')).toBeInTheDocument();
  });

  it('the owner gets their Knowledge page controls, and may unfile, whether or not they can edit the Project', () => {
    show([mine], false);
    const actions = within(row('My listing'));

    expect(actions.getByLabelText('Pin')).toBeInTheDocument();
    expect(actions.getByLabelText('Unfile')).toBeInTheDocument();
    expect(actions.getByLabelText('Delete')).toBeInTheDocument();
  });

  it('shows no read state, the viewer\'s own included', () => {
    show([mine, theirs], true);

    expect(screen.queryByText(/to read|unread|mark read|reading/i)).not.toBeInTheDocument();
  });

  it('an empty Project says how a page gets filed', () => {
    show([], true);

    expect(screen.getByText('No pages filed under this project yet')).toBeInTheDocument();
    expect(screen.getByText(/Chrome extension's Resources tab with this project selected/)).toBeInTheDocument();
  });
});
