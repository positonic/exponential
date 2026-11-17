import { describe, it, expect } from 'vitest';
import { pageContextWorkspaceId, resolveChatWorkspaceId } from '../chatWorkspace';

const recordingPage = (workspaceId: unknown) => ({
  pageType: 'recording',
  data: { transcriptionId: 'meeting-1', workspaceId },
});

describe('resolveChatWorkspaceId', () => {
  it("prefers the page's workspace over the provider's default-workspace fallback", () => {
    // /recording/<id>: no slug in the URL, so the provider reports the
    // person's default workspace while the meeting lives in another.
    expect(
      resolveChatWorkspaceId({ pageContext: recordingPage('ws-meeting'), provider: 'ws-default' }),
    ).toBe('ws-meeting');
  });

  it('lets a workspace the person picked outrank the page', () => {
    expect(
      resolveChatWorkspaceId({
        explicit: 'ws-picked',
        pageContext: recordingPage('ws-meeting'),
        provider: 'ws-default',
      }),
    ).toBe('ws-picked');
  });

  it('falls back to the provider when the page names no workspace', () => {
    expect(resolveChatWorkspaceId({ pageContext: recordingPage(null), provider: 'ws-default' })).toBe(
      'ws-default',
    );
    expect(resolveChatWorkspaceId({ pageContext: null, provider: 'ws-default' })).toBe('ws-default');
  });

  it('is undefined when nothing names a workspace', () => {
    expect(resolveChatWorkspaceId({ explicit: null, pageContext: null, provider: null })).toBeUndefined();
  });
});

describe('pageContextWorkspaceId', () => {
  it('ignores anything that is not a non-empty string', () => {
    expect(pageContextWorkspaceId(recordingPage('ws-1'))).toBe('ws-1');
    expect(pageContextWorkspaceId(recordingPage(''))).toBeUndefined();
    expect(pageContextWorkspaceId(recordingPage(42))).toBeUndefined();
    expect(pageContextWorkspaceId({})).toBeUndefined();
    expect(pageContextWorkspaceId(undefined)).toBeUndefined();
  });
});
