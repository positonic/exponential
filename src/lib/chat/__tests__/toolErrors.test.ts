import { describe, it, expect } from 'vitest';
import {
  asToolErrorKind,
  classifyToolError,
  isReportableToolError,
  summarizeToolError,
  toolErrorSentence,
} from '../toolErrors';

// Verbatim (and cut off mid-object, as the tool row received it) from the
// meeting page where query-meeting-context 400'd on every call.
const WORKSPACE_ID_400 = String.raw`{"message":"Request failed: 400 Bad Request - {\"error\":{\"json\":{\"message\":\"[\\n {\\n \\\"code\\\": \\\"invalid_type\\\",\\n \\\"expected\\\": \\\"string\\\",\\n \\\"received\\\": \\\"undefined\\\",\\n \\\"path\\\": [\\n \\\"workspaceId\\\"\\n ],\\n \\\"message\\\": \\\"Required\\\"\\n }\\n]\",\"code\":-32600,\"data\":{\"code\":\"BAD_REQUEST\",\"httpStatus\":400,\"path\":\"mastra.queryMeetingContext\",\"zodError\":{\"formErrors\":[],\"fieldErrors\":{\"workspaceId\"`;

describe('classifyToolError', () => {
  it('reads an app that rejected the request shape as a contract fault', () => {
    expect(classifyToolError(WORKSPACE_ID_400)).toBe('contract');
    expect(classifyToolError('{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}')).toBe('contract');
  });

  it('lets the HTTP status decide before any phrase in the body', () => {
    expect(classifyToolError('Request failed: 404 Not Found - {"code":"BAD_REQUEST"}')).toBe('not-found');
    expect(classifyToolError('Request failed: 403 Forbidden')).toBe('forbidden');
    expect(classifyToolError('Request failed: 429 Too Many Requests')).toBe('rate-limit');
    expect(classifyToolError('Request failed: 502 Bad Gateway')).toBe('server');
  });

  it('files "not found or access denied" under not-found, not forbidden', () => {
    expect(classifyToolError('Project not found or access denied')).toBe('not-found');
    expect(classifyToolError('You are not a member of this workspace (FORBIDDEN)')).toBe('forbidden');
  });

  it('recognises timeouts and upstream failures without a status', () => {
    expect(classifyToolError('The operation timed out')).toBe('timeout');
    expect(classifyToolError('TypeError: fetch failed')).toBe('server');
  });

  it('is unknown for empty or unrecognised text', () => {
    expect(classifyToolError(undefined)).toBe('unknown');
    expect(classifyToolError('')).toBe('unknown');
    expect(classifyToolError('boom')).toBe('unknown');
  });
});

describe('toolErrorSentence', () => {
  it('never contains transport vocabulary', () => {
    for (const kind of ['contract', 'server', 'not-found', 'forbidden', 'rate-limit', 'timeout', 'unknown'] as const) {
      const sentence = toolErrorSentence(kind);
      expect(sentence).not.toMatch(/400|zod|json|trpc|bad request|schema/i);
      expect(sentence.length).toBeLessThan(110);
    }
  });

  it('falls back to the unknown sentence when no kind is known', () => {
    expect(toolErrorSentence(undefined)).toBe(toolErrorSentence('unknown'));
  });
});

describe('isReportableToolError', () => {
  it('reports only faults that are ours to fix', () => {
    expect(isReportableToolError('contract')).toBe(true);
    expect(isReportableToolError('server')).toBe(true);
    expect(isReportableToolError('not-found')).toBe(false);
    expect(isReportableToolError('forbidden')).toBe(false);
    expect(isReportableToolError('rate-limit')).toBe(false);
    expect(isReportableToolError('timeout')).toBe(false);
    expect(isReportableToolError('unknown')).toBe(false);
  });
});

describe('summarizeToolError', () => {
  it('names the tool, the procedure and the field from a nested, cut-off error', () => {
    expect(summarizeToolError('queryMeetingContextTool', WORKSPACE_ID_400)).toBe(
      'queryMeetingContextTool: mastra.queryMeetingContext rejected the request (invalid_type at workspaceId)',
    );
  });

  it('is identical for two occurrences that differ only in ids, so they share one ticket', () => {
    const other = WORKSPACE_ID_400.replace('-32600', '-32601');
    expect(summarizeToolError('queryMeetingContextTool', other)).toBe(
      summarizeToolError('queryMeetingContextTool', WORKSPACE_ID_400),
    );
  });

  it('falls back to the app when no procedure is named', () => {
    expect(summarizeToolError('getAllProjectsTool', '{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}')).toBe(
      'getAllProjectsTool: the app rejected the request',
    );
    expect(summarizeToolError('getAllProjectsTool', 'Request failed: 500 Internal Server Error')).toBe(
      'getAllProjectsTool: the app failed while handling the request',
    );
  });

  it('keeps the first line for anything else', () => {
    expect(summarizeToolError('weatherTool', 'boom\nstack line')).toBe('weatherTool: boom');
    expect(summarizeToolError('weatherTool', undefined)).toBe('weatherTool: failed with no message');
  });
});

describe('asToolErrorKind', () => {
  it('accepts known kinds and rejects anything else off the wire', () => {
    expect(asToolErrorKind('contract')).toBe('contract');
    expect(asToolErrorKind('nonsense')).toBeUndefined();
    expect(asToolErrorKind(400)).toBeUndefined();
  });
});
