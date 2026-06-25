import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { WorkspaceTopNav } from '../WorkspaceTopNav';

const { mockUseWorkspace, mockUsePathname } = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/w/test/projects'),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('WorkspaceTopNav', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReset();
    mockUsePathname.mockReturnValue('/w/test/projects');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all nav items for a workspace member', () => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', userRole: 'member' });

    render(<WorkspaceTopNav />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Knowledge')).toBeInTheDocument();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByText('Goals')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders only Projects for a guest', () => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: 'test', userRole: 'guest' });

    render(<WorkspaceTopNav />);

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Knowledge')).not.toBeInTheDocument();
    expect(screen.queryByText('Pages')).not.toBeInTheDocument();
    expect(screen.queryByText('Meetings')).not.toBeInTheDocument();
    expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    expect(screen.queryByText('Goals')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no workspace slug', () => {
    mockUseWorkspace.mockReturnValue({ workspaceSlug: null, userRole: null });

    render(<WorkspaceTopNav />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
