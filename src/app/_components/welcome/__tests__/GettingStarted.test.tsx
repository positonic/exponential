import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { GettingStarted } from '../GettingStarted';

const { mockSetup } = vi.hoisted(() => ({ mockSetup: vi.fn() }));

vi.mock('../useWelcomeSetup', () => ({ useWelcomeSetup: () => mockSetup() }));
vi.mock('../WelcomeChatView', () => ({ WelcomeChatView: () => <div>chat view</div> }));
vi.mock('../WelcomeChecklistView', () => ({ WelcomeChecklistView: () => <div>checklist view</div> }));
vi.mock('../WelcomeInvited', () => ({ WelcomeInvited: () => <div>invited view</div> }));
vi.mock('../WelcomeMenuStep', () => ({
  WelcomeMenuStep: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>menu step</button>
  ),
}));

function setup(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    firstName: 'Ada',
    state: { useCase: null },
    doneCount: 0,
    allDone: false,
    invitedContext: null,
    finishMenuStep: vi.fn(),
    exploreOnOwn: vi.fn(),
    ...overrides,
  };
}

describe('GettingStarted — the menu picker comes first', () => {
  beforeEach(() => {
    mockSetup.mockReturnValue(setup());
  });

  afterEach(() => {
    cleanup();
  });

  it('opens with the picker for someone who has not been past it', () => {
    render(<GettingStarted />);
    expect(screen.getByRole('button', { name: 'menu step' })).toBeInTheDocument();
    expect(screen.queryByText('chat view')).not.toBeInTheDocument();
  });

  it('keeps a way out on the picker', () => {
    const current = setup();
    mockSetup.mockReturnValue(current);
    render(<GettingStarted />);
    fireEvent.click(screen.getByRole('button', { name: "I'll explore on my own" }));
    expect(current.exploreOnOwn).toHaveBeenCalled();
  });

  it('stays on the picker after a card is chosen, until the person continues', () => {
    const { rerender } = render(<GettingStarted />);
    // Choosing a card records the answer straight away.
    mockSetup.mockReturnValue(setup({ state: { useCase: 'team' } }));
    rerender(<GettingStarted />);
    expect(screen.getByRole('button', { name: 'menu step' })).toBeInTheDocument();
  });

  it('moves on to the steps, with focus, when the person continues', () => {
    const current = setup();
    mockSetup.mockReturnValue(current);
    render(<GettingStarted />);
    fireEvent.click(screen.getByRole('button', { name: 'menu step' }));
    expect(current.finishMenuStep).toHaveBeenCalledTimes(1);
    expect(screen.getByText('chat view')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Getting started' })).toHaveFocus();
  });

  it('skips the picker for someone who has already answered or skipped it', () => {
    mockSetup.mockReturnValue(setup({ state: { useCase: 'unsure' } }));
    render(<GettingStarted />);
    expect(screen.getByText('chat view')).toBeInTheDocument();
  });

  it('skips the picker for someone already part-way through the steps', () => {
    mockSetup.mockReturnValue(setup({ doneCount: 2 }));
    render(<GettingStarted />);
    expect(screen.getByText('chat view')).toBeInTheDocument();
  });

  it('does not hold the page on a spinner when the setup state failed to load', () => {
    mockSetup.mockReturnValue(setup({ state: null }));
    render(<GettingStarted />);
    expect(screen.getByText('chat view')).toBeInTheDocument();
  });

  it('gives an invited person the invited view, which holds its own picker', () => {
    mockSetup.mockReturnValue(
      setup({ invitedContext: { workspaceName: 'CLEAR', workspaceSlug: 'clear', inviterName: 'James' } }),
    );
    render(<GettingStarted />);
    expect(screen.getByText('invited view')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'menu step' })).not.toBeInTheDocument();
  });
});
