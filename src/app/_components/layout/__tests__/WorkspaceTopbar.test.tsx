import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { WorkspaceTopbar } from '../WorkspaceTopbar';

const { mockUseWorkspace, mockUsePathname } = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/w/syntrofi/products/exponential/features'),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    page: { parentCrumb: { useQuery: () => ({ data: undefined }) } },
  },
}));

describe('WorkspaceTopbar', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReset();
    mockUseWorkspace.mockReturnValue({
      workspace: { name: 'Syntrofi' },
      workspaceSlug: 'syntrofi',
    });
    mockUsePathname.mockReturnValue('/w/syntrofi/products/exponential/features');
  });

  afterEach(() => {
    cleanup();
  });

  it('links the workspace name back to the workspace root', () => {
    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Syntrofi' })).toHaveAttribute(
      'href',
      '/w/syntrofi',
    );
  });

  it('keeps the workspace link on deep routes, alongside the section crumb', () => {
    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Syntrofi' })).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('links the section crumb to its index when we are below it', () => {
    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'href',
      '/w/syntrofi/products',
    );
  });

  it('leaves the section crumb as text on the section index itself', () => {
    mockUsePathname.mockReturnValue('/w/syntrofi/products');

    render(<WorkspaceTopbar />);

    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Products' }),
    ).not.toBeInTheDocument();
  });

  it('still links a page-detail route back to the pages index', () => {
    mockUsePathname.mockReturnValue('/w/syntrofi/pages/page-1');

    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute(
      'href',
      '/w/syntrofi/pages',
    );
  });

  it('shows no section crumb at the workspace root', () => {
    mockUsePathname.mockReturnValue('/w/syntrofi');

    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Syntrofi' })).toBeInTheDocument();
    expect(screen.queryByText('W')).not.toBeInTheDocument();
  });

  it('leaves the section crumb as text on global routes', () => {
    // Global segments like `/recording/{id}` have no index page to land on.
    mockUsePathname.mockReturnValue('/recording/abc123');

    render(<WorkspaceTopbar />);

    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Recording' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing without a workspace', () => {
    mockUseWorkspace.mockReturnValue({ workspace: null, workspaceSlug: null });

    render(<WorkspaceTopbar />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
