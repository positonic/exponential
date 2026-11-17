import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { ToolActivity } from '../ToolActivity';
import type { ToolCall } from '~/providers/AgentModalProvider';

const call = (overrides: Partial<ToolCall>): ToolCall => ({
  id: 'call-1',
  name: 'createProjectTool',
  status: 'success',
  ...overrides,
});

describe('ToolActivity', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels a mapped tool with its curated pickArg', () => {
    render(
      <ToolActivity
        calls={[call({ args: { name: 'Website relaunch' } })]}
      />,
    );

    expect(screen.getByText(/Created project: Website relaunch/)).toBeInTheDocument();
  });

  it('never renders an arg value for an unmapped tool', () => {
    render(
      <ToolActivity
        calls={[
          call({
            name: 'doMysteryThingTool',
            args: { includeCompleted: 'false', workspaceId: 'cmx123abc' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Do mystery thing')).toBeInTheDocument();
    expect(screen.queryByText(/false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cmx123abc/)).not.toBeInTheDocument();
  });

  it('renders a failed call as one calm line, with a plain sentence behind expand', () => {
    const rawError = '{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}';
    render(
      <ToolActivity
        calls={[
          call({
            name: 'getAllProjectsTool',
            status: 'error',
            errorMsg: rawError,
            args: { includeCompleted: 'false' },
          }),
        ]}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Get projects — failed');
    expect(row).not.toHaveTextContent('METHOD_NOT_SUPPORTED');
    expect(row).not.toHaveTextContent('false');

    fireEvent.click(row);
    // The raw text only exists on the call when the server sent it (admins).
    expect(screen.getByText(rawError)).toBeInTheDocument();
    expect(
      screen.getByText("This step isn't working right now. The problem is on our side, not something you did."),
    ).toBeInTheDocument();
  });

  it('shows a non-admin the sentence alone: no raw error reaches the page', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'queryMeetingContextTool', status: 'error', errorKind: 'contract', args: { query: 'Cyril' } }),
          call({ id: 'b', name: 'queryMeetingContextTool', status: 'error', errorKind: 'contract', args: { query: 'Cyril stories' } }),
        ]}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Searched meeting notes — 0 of 2 succeeded');
    fireEvent.click(row);
    expect(
      screen.getAllByText("This step isn't working right now. The problem is on our side, not something you did."),
    ).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/400|BAD_REQUEST|zodError|workspaceId/);
  });

  it('falls back to a plain sentence when a failed call carries nothing at all', () => {
    render(
      <ToolActivity
        calls={[call({ name: 'getUserWorkspacesTool', status: 'error' })]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText("This step didn't work.")).toBeInTheDocument();
  });
});
