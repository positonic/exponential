import { describe, it, expect } from 'vitest';

import { buildRequestAck, narrateTool } from '../thinkingMessages';

describe('buildRequestAck', () => {
  it('returns null for empty / whitespace-only text (falls back to thinking lines)', () => {
    expect(buildRequestAck(undefined)).toBeNull();
    expect(buildRequestAck('')).toBeNull();
    expect(buildRequestAck('   \n\t ')).toBeNull();
  });

  it('acknowledges capture intent for create/add-style requests', () => {
    expect(buildRequestAck('Add a task to call the dentist')).toBe(
      'On it — capturing that now…',
    );
    expect(buildRequestAck('create an action for the launch')).toBe(
      'On it — capturing that now…',
    );
    expect(buildRequestAck('remind me to pay rent')).toBe(
      'On it — capturing that now…',
    );
  });

  it('acknowledges look-up intent for questions', () => {
    expect(buildRequestAck('What is on my calendar today?')).toBe(
      'On it — looking into that…',
    );
    expect(buildRequestAck('how many projects do I have')).toBe(
      'On it — looking into that…',
    );
    // Trailing "?" alone is enough even without a leading interrogative.
    expect(buildRequestAck('My projects, sorted by priority?')).toBe(
      'On it — looking into that…',
    );
  });

  it('echoes a trimmed, single-line version of other requests', () => {
    expect(buildRequestAck('Tell James the meeting moved to Friday')).toBe(
      'On it — “Tell James the meeting moved to Friday”…',
    );
  });

  it('collapses whitespace/newlines in the echo', () => {
    expect(buildRequestAck('Tell   James\nthe meeting moved')).toBe(
      'On it — “Tell James the meeting moved”…',
    );
  });

  it('truncates a long echo to keep the status line short', () => {
    const long =
      'Tell the entire team that the quarterly planning session has been rescheduled to next Thursday afternoon';
    const ack = buildRequestAck(long)!;
    expect(ack.startsWith('On it — “')).toBe(true);
    expect(ack.endsWith('”…')).toBe(true);
    // The echoed slice is capped (60 chars) — the full sentence must not fit.
    expect(ack.length).toBeLessThan(long.length);
    expect(ack).not.toContain('Thursday');
  });
});

describe('narrateTool', () => {
  it('narrates write verbs as jotting, before entity matches', () => {
    expect(narrateTool('create-project-action')).toBe('Jotting that down…');
    expect(narrateTool('quick-create-action')).toBe('Jotting that down…');
  });

  it('narrates read tools by entity', () => {
    expect(narrateTool('get-all-projects')).toBe('Going through your projects…');
    expect(narrateTool('search-emails')).toBe('Skimming your inbox…');
  });

  it('falls back for unknown tools', () => {
    expect(narrateTool('some-unmapped-tool')).toBe('Having a look…');
  });
});
