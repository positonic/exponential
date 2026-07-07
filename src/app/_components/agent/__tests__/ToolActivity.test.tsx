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

  it('renders a failed call as one calm line with the raw error behind expand', () => {
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
    expect(screen.getByText(rawError)).toBeInTheDocument();
  });

  it('falls back to a placeholder when a failed call has no error message', () => {
    render(
      <ToolActivity
        calls={[call({ name: 'getUserWorkspacesTool', status: 'error' })]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No error details available.')).toBeInTheDocument();
  });
});
