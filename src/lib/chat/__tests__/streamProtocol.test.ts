import { describe, it, expect } from 'vitest';
import {
  parseChatStreamBuffer,
  classifyStreamError,
  describeStreamError,
} from '../streamProtocol';

const toolFrame = (payload: Record<string, unknown>) =>
  `__exp_tool__:${JSON.stringify(payload)}\n`;
const metaFrame = (payload: Record<string, unknown>) =>
  `__exp_meta__:${JSON.stringify(payload)}\n`;

describe('parseChatStreamBuffer', () => {
  it('passes plain text through untouched', () => {
    const result = parseChatStreamBuffer('Hello **world**');
    expect(result.displayText).toBe('Hello **world**');
    expect(result.toolCalls).toEqual([]);
    expect(result.interactionId).toBeUndefined();
  });

  it('is cumulative and idempotent: re-parsing a longer buffer re-derives the same prefix state', () => {
    const b1 = 'Working on it';
    const b2 = b1 + toolFrame({ phase: 'call', id: 't1', name: 'getProjects' });
    expect(parseChatStreamBuffer(b1).displayText).toBe('Working on it');
    const r2 = parseChatStreamBuffer(b2);
    expect(r2.displayText).toBe('Working on it');
    expect(r2.toolCalls).toEqual([
      { id: 't1', name: 'getProjects', args: undefined, status: 'running' },
    ]);
  });

  describe('tool frames', () => {
    it('parses a call frame into a running tool call with args', () => {
      const buffer = toolFrame({
        phase: 'call',
        id: 't1',
        name: 'createAction',
        args: { name: 'Pay Malte' },
      });
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('');
      expect(result.toolCalls).toEqual([
        { id: 't1', name: 'createAction', args: { name: 'Pay Malte' }, status: 'running' },
      ]);
    });

    it('folds call → result into success, preserving args from the call frame', () => {
      const buffer =
        toolFrame({ phase: 'call', id: 't1', name: 'createAction', args: { name: 'x' } }) +
        toolFrame({ phase: 'result', id: 't1', name: 'createAction' });
      const result = parseChatStreamBuffer(buffer);
      expect(result.toolCalls).toEqual([
        { id: 't1', name: 'createAction', args: { name: 'x' }, status: 'success' },
      ]);
    });

    it('folds call → error into error with the message, preserving args', () => {
      const buffer =
        toolFrame({ phase: 'call', id: 't1', name: 'createAction', args: { name: 'x' } }) +
        toolFrame({ phase: 'error', id: 't1', name: 'createAction', msg: 'boom' });
      const result = parseChatStreamBuffer(buffer);
      expect(result.toolCalls).toEqual([
        { id: 't1', name: 'createAction', args: { name: 'x' }, status: 'error', errorMsg: 'boom' },
      ]);
    });

    it('keeps first-seen order across multiple tool calls', () => {
      const buffer =
        toolFrame({ phase: 'call', id: 'a', name: 'one' }) +
        toolFrame({ phase: 'call', id: 'b', name: 'two' }) +
        toolFrame({ phase: 'result', id: 'a', name: 'one' });
      const result = parseChatStreamBuffer(buffer);
      expect(result.toolCalls.map((t) => `${t.id}:${t.status}`)).toEqual([
        'a:success',
        'b:running',
      ]);
    });

    it('strips frames embedded between prose without eating surrounding text', () => {
      const buffer =
        'Let me check.\n' +
        toolFrame({ phase: 'call', id: 't1', name: 'getProjects' }) +
        'Found 3 projects.';
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('Let me check.Found 3 projects.');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('drops a malformed but terminated frame from display without creating a call', () => {
      const buffer = 'before\n__exp_tool__:{not json}\nafter';
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('beforeafter');
      expect(result.toolCalls).toEqual([]);
    });

    it('hides an incomplete frame at the tail so sentinels never leak', () => {
      const buffer = 'Answer so far\n__exp_tool__:{"phase":"call","id":"t1"';
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('Answer so far');
      expect(result.displayText).not.toContain('__exp_tool__');
      expect(result.toolCalls).toEqual([]);
    });

    it('parses the frame once the split tail completes on a later chunk', () => {
      const frame = toolFrame({ phase: 'call', id: 't1', name: 'getProjects' });
      const partial = 'Text\n' + frame.slice(0, 20);
      expect(parseChatStreamBuffer(partial).toolCalls).toEqual([]);
      const full = 'Text\n' + frame + 'more';
      const result = parseChatStreamBuffer(full);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.displayText).toBe('Textmore');
    });
  });

  describe('meta frame', () => {
    it('captures interactionId and strips the frame from display', () => {
      const buffer = 'Final answer.' + metaFrame({ interactionId: 'int_123' });
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('Final answer.');
      expect(result.interactionId).toBe('int_123');
    });

    it('hides text after the meta frame from display', () => {
      const buffer = 'Answer.' + metaFrame({ interactionId: 'int_1' }) + 'trailing noise';
      const result = parseChatStreamBuffer(buffer);
      expect(result.displayText).toBe('Answer.');
    });

    it('recovers when the meta JSON is split across chunks', () => {
      const full = 'Answer.' + metaFrame({ interactionId: 'int_123' });
      const partial = full.slice(0, full.length - 15); // cut inside the JSON
      const early = parseChatStreamBuffer(partial);
      expect(early.interactionId).toBeUndefined();
      expect(early.displayText).toBe('Answer.'); // sentinel already sliced off
      const late = parseChatStreamBuffer(full);
      expect(late.interactionId).toBe('int_123');
      expect(late.displayText).toBe('Answer.');
    });
  });

  it('strips zero-width-space keepalives from display', () => {
    const buffer = 'Hel​lo​';
    const result = parseChatStreamBuffer(buffer);
    expect(result.displayText).toBe('Hello');
  });

  it('handles a realistic full turn: prose, tool lifecycle, meta', () => {
    const buffer =
      'Let me look.\n' +
      toolFrame({ phase: 'call', id: 't1', name: 'getProjects', args: { workspaceId: 'w1' } }) +
      '​' +
      toolFrame({ phase: 'result', id: 't1', name: 'getProjects' }) +
      'You have 3 active projects.' +
      metaFrame({ interactionId: 'int_9' });
    const result = parseChatStreamBuffer(buffer);
    expect(result.displayText).toBe('Let me look.You have 3 active projects.');
    expect(result.toolCalls).toEqual([
      { id: 't1', name: 'getProjects', args: { workspaceId: 'w1' }, status: 'success' },
    ]);
    expect(result.interactionId).toBe('int_9');
  });
});

describe('classifyStreamError', () => {
  it('classifies AbortError / idle timeout as retryable idle-timeout', () => {
    expect(classifyStreamError(new DOMException('stream-idle-timeout', 'AbortError'))).toEqual({
      kind: 'idle-timeout',
      retryable: true,
    });
  });

  it('classifies auth-ish messages as non-retryable auth', () => {
    expect(classifyStreamError(new Error('401 Unauthorized'))).toEqual({
      kind: 'auth',
      retryable: false,
    });
  });

  it('classifies network drops and failed requests as retryable transport', () => {
    expect(classifyStreamError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'transport',
      retryable: true,
    });
    expect(classifyStreamError(new Error('Stream request failed'))).toEqual({
      kind: 'transport',
      retryable: true,
    });
  });

  it('classifies agent/mastra errors as non-retryable model errors', () => {
    expect(classifyStreamError(new Error('Mastra agent exploded'))).toEqual({
      kind: 'model',
      retryable: false,
    });
  });

  it('classifies non-Error throwables as unknown', () => {
    expect(classifyStreamError('nope')).toEqual({ kind: 'unknown', retryable: false });
  });

  it('classifies provider billing and quota refusals as model errors', () => {
    // The exact sentence the Anthropic API returns, which used to fall through
    // to `unknown` and render as "Something went wrong handling that request."
    expect(
      classifyStreamError(
        new Error(
          'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
        ),
      ),
    ).toEqual({ kind: 'model', retryable: false });
    expect(classifyStreamError(new Error('You exceeded your current quota'))).toEqual({
      kind: 'model',
      retryable: false,
    });
  });
});

describe('describeStreamError', () => {
  it('returns the error message so the cause reaches the user', () => {
    expect(describeStreamError(new Error('Your credit balance is too low'))).toBe(
      'Your credit balance is too low',
    );
  });

  it('keeps only the first line, dropping any stack the provider appended', () => {
    expect(describeStreamError(new Error('Boom\n    at postToApi (index.mjs:1)'))).toBe('Boom');
  });

  it('caps a runaway message rather than filling the bubble', () => {
    // Short words, so the masker doesn't take it for one long credential.
    const detail = describeStreamError(new Error('very bad thing '.repeat(40)));
    expect(detail).toHaveLength(241);
    expect(detail?.endsWith('…')).toBe(true);
  });

  it('masks a credential the provider echoed back', () => {
    const secret = 'ff_live_' + 'a'.repeat(40);
    const detail = describeStreamError(new Error(`Invalid API key ${secret}`));
    expect(detail).not.toContain(secret);
    expect(detail).toContain('Invalid API key');
  });

  it('has nothing to add for an empty or non-Error throwable', () => {
    expect(describeStreamError(new Error('   '))).toBeUndefined();
    expect(describeStreamError(undefined)).toBeUndefined();
  });
});
