import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('~/env', () => ({ env: { NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' } }));

const posthog = {
  init: vi.fn(),
  sessionRecordingStarted: vi.fn(() => false),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
};
vi.mock('posthog-js', () => ({ default: posthog }));

/** Waits until posthog-js has loaded and been initialised, then lets the
 * component's .then callbacks run. */
const loaded = async () => {
  await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled());
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

describe('SessionReplay on navigation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('never starts recording on a customer page reached while posthog-js was loading', async () => {
    const { SessionReplay } = await import('../SessionReplay');
    pathname = '/welcome';
    const view = render(<SessionReplay />);
    // Leave before the import resolves.
    pathname = '/w/clear/products';
    view.rerender(<SessionReplay />);
    await loaded();

    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  it('starts on a recorded page and stops on leaving it', async () => {
    const { SessionReplay } = await import('../SessionReplay');
    pathname = '/welcome';
    const view = render(<SessionReplay />);
    await loaded();
    expect(posthog.startSessionRecording).toHaveBeenCalledTimes(1);

    pathname = '/w/clear/products';
    view.rerender(<SessionReplay />);
    await settle();
    expect(posthog.stopSessionRecording).toHaveBeenCalled();
  });

  it('does not load posthog-js on pages that are never recorded', async () => {
    const { SessionReplay } = await import('../SessionReplay');
    pathname = '/w/clear/products';
    render(<SessionReplay />);
    await settle();

    expect(posthog.init).not.toHaveBeenCalled();
  });
});
