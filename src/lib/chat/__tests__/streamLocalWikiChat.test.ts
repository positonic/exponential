import { describe, expect, it, vi } from 'vitest';

import { streamLocalWikiChat, type WikiStreamChunk } from '../streamLocalWikiChat';
import type { ChatStreamUpdate } from '../streamChatResponse';
import type { WikiClientTool } from '../../localWiki';

/**
 * The local wiki is the one chat path that doesn't go through
 * `/api/chat/stream`, so nothing else exercises it.
 *
 * These stubs replay chunk sequences shaped like the ones the *real* server
 * sends — which is the lesson from the first version of this file. It asserted a
 * `tool-result` event that this build never emits, so every test passed while
 * the transport was broken in production: chips stuck on "running" and, worse,
 * no turn ever looked like it had written anything, so nothing was committed. A
 * tool's outcome now comes from the call we make ourselves, and the tests
 * reflect that.
 */

/** One round of the model: what the server streams before it stops. */
type Round = WikiStreamChunk[];

/**
 * Stub agent replaying one round per `stream()` call, recording the history and
 * tools it was handed each time.
 */
function agentRounds(...rounds: Round[]) {
  const calls: unknown[][] = [];
  const toolsSeen: Record<string, unknown>[] = [];
  let round = 0;

  return {
    calls,
    toolsSeen,
    stream: vi
      .fn()
      .mockImplementation((messages: unknown[], opts: { clientTools: Record<string, unknown> }) => {
        calls.push(messages);
        toolsSeen.push(opts.clientTools);
        const chunks = rounds[round++] ?? [];
        return Promise.resolve({
          processDataStream: async ({
            onChunk,
          }: {
            onChunk: (chunk: WikiStreamChunk) => void | Promise<void>;
          }) => {
            for (const chunk of chunks) await onChunk(chunk);
          },
        });
      }),
  };
}

const text = (t: string): WikiStreamChunk => ({ type: 'text-delta', payload: { text: t } });
const call = (
  toolName: string,
  toolCallId: string,
  args: Record<string, unknown> = {},
): WikiStreamChunk => ({ type: 'tool-call', payload: { toolName, toolCallId, args } });

function tool(id: string, execute = vi.fn().mockResolvedValue({ ok: true })): WikiClientTool {
  return {
    id,
    description: id,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute,
  };
}

const NO_TOOLS: Record<string, WikiClientTool> = {};
const USER = [{ role: 'user' as const, content: 'what is in my wiki?' }];

describe('text streaming', () => {
  it('accumulates deltas into the text ManyChat renders', async () => {
    const updates: ChatStreamUpdate[] = [];
    const final = await streamLocalWikiChat(
      agentRounds([text('There are '), text('three pages.')]),
      USER,
      NO_TOOLS,
      { onUpdate: (u) => updates.push(structuredClone(u)) },
    );
    expect(final.displayText).toBe('There are three pages.');
    expect(updates.map((u) => u.displayText)).toEqual(['There are ', 'There are three pages.']);
  });

  it('carries text across rounds, since a turn is several requests', async () => {
    const final = await streamLocalWikiChat(
      agentRounds([text('Let me look. '), call('wiki_list_pages', 'c1')], [text('Three pages.')]),
      USER,
      { wiki_list_pages: tool('wiki_list_pages') },
    );
    expect(final.displayText).toBe('Let me look. Three pages.');
  });

  it('counts raw bytes so a tool-only turn is not mistaken for empty', async () => {
    // ManyChat reads rawLength to decide whether a failed turn "had content". A
    // turn that only ran tools may have touched the user's files and must not be
    // silently auto-retried.
    const final = await streamLocalWikiChat(
      agentRounds([call('wiki_write_page', 'c1')], []),
      USER,
      { wiki_write_page: tool('wiki_write_page') },
    );
    expect(final.displayText).toBe('');
    expect(final.rawLength).toBeGreaterThan(0);
  });
});

describe('the turn loop', () => {
  it('executes the tool locally and continues the turn', async () => {
    const execute = vi.fn().mockResolvedValue({ pages: [] });
    const agent = agentRounds([call('wiki_list_pages', 'c1', { a: 1 })], [text('done')]);

    const final = await streamLocalWikiChat(agent, USER, {
      wiki_list_pages: tool('wiki_list_pages', execute),
    });

    expect(execute).toHaveBeenCalledWith({ a: 1 });
    expect(final.toolCalls).toEqual([
      { id: 'c1', name: 'wiki_list_pages', args: { a: 1 }, status: 'success' },
    ]);
  });

  it('keeps the user message in the continuation', async () => {
    // The bug this loop exists for. client-js's own continuation re-POSTs only
    // what accumulated during the stream, dropping the user's message — so the
    // model got a tool result with no idea what was asked and answered by
    // introducing itself. Verified against the real server before the rewrite.
    const agent = agentRounds([call('wiki_list_pages', 'c1')], [text('done')]);
    await streamLocalWikiChat(agent, USER, { wiki_list_pages: tool('wiki_list_pages') });

    expect(agent.calls).toHaveLength(2);
    expect(agent.calls[1]).toContainEqual({ role: 'user', content: 'what is in my wiki?' });
  });

  it('sends the tool call and its result back so the model can use it', async () => {
    const agent = agentRounds([call('wiki_read_page', 'c1', { path: 'index.md' })], [text('ok')]);
    await streamLocalWikiChat(agent, USER, {
      wiki_read_page: tool('wiki_read_page', vi.fn().mockResolvedValue({ content: '# Index' })),
    });

    const second = agent.calls[1] as { role: string; content: unknown }[];
    expect(second[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'wiki_read_page',
          args: { path: 'index.md' },
        },
      ],
    });
    expect(second[2]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'wiki_read_page',
          result: { content: '# Index' },
        },
      ],
    });
  });

  it('hands the server schemas without execute, so it cannot drive the loop', async () => {
    // Passing an executable tool is exactly what makes client-js take over the
    // continuation, and its continuation is the broken one.
    const agent = agentRounds([text('hi')]);
    await streamLocalWikiChat(agent, USER, { wiki_list_pages: tool('wiki_list_pages') });

    const declared = agent.toolsSeen[0]!.wiki_list_pages as Record<string, unknown>;
    expect(declared).toHaveProperty('inputSchema');
    expect(declared).not.toHaveProperty('execute');
  });

  it('runs several tools from one round before continuing', async () => {
    const agent = agentRounds(
      [call('wiki_read_page', 'c1'), call('wiki_read_page', 'c2')],
      [text('done')],
    );
    const execute = vi.fn().mockResolvedValue({ content: '' });
    const final = await streamLocalWikiChat(agent, USER, {
      wiki_read_page: tool('wiki_read_page', execute),
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(final.toolCalls.map((t) => `${t.id}:${t.status}`)).toEqual(['c1:success', 'c2:success']);
  });

  it('stops after the round cap rather than looping on the user machine', async () => {
    // Every round runs tools against their disk; a model stuck in a loop must
    // not be able to keep going forever.
    const forever: Round[] = Array.from({ length: 40 }, (_, i) => [
      call('wiki_list_pages', `c${i}`),
    ]);
    const agent = agentRounds(...forever);
    await streamLocalWikiChat(agent, USER, { wiki_list_pages: tool('wiki_list_pages') });
    expect(agent.stream.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('ignores chunk types it does not recognise', async () => {
    const final = await streamLocalWikiChat(
      agentRounds([
        { type: 'start' },
        { type: 'tool-call-input-streaming-start', payload: { toolCallId: 'c1' } },
        text('fine'),
        { type: 'step-finish' },
      ]),
      USER,
      NO_TOOLS,
    );
    expect(final.displayText).toBe('fine');
    expect(final.toolCalls).toHaveLength(0);
  });
});

describe('tool failures', () => {
  it('marks the chip failed and tells the model, without ending the turn', async () => {
    // The model needs to know, so it can say the write failed rather than
    // reporting success it never had.
    const agent = agentRounds(
      [call('wiki_write_page', 'c1', { path: '../escape.md' })],
      [text('I could not write there.')],
    );
    const execute = vi.fn().mockRejectedValue('path is outside the wiki folder');

    const final = await streamLocalWikiChat(agent, USER, {
      wiki_write_page: tool('wiki_write_page', execute),
    });

    expect(final.toolCalls[0]).toMatchObject({
      status: 'error',
      errorMsg: 'path is outside the wiki folder',
    });
    const second = agent.calls[1] as { content: { result?: unknown }[] }[];
    expect(second[2]?.content[0]?.result).toEqual({ error: 'path is outside the wiki folder' });
    expect(final.displayText).toBe('I could not write there.');
  });
});

describe('stream errors', () => {
  it('throws so the caller can reuse the existing failure handling', async () => {
    await expect(
      streamLocalWikiChat(
        agentRounds([text('partial'), { type: 'error', payload: { error: { message: 'boom' } } }]),
        USER,
        NO_TOOLS,
      ),
    ).rejects.toThrow('boom');
  });

  it('throws something readable when the payload has no message', async () => {
    await expect(
      streamLocalWikiChat(agentRounds([{ type: 'error', payload: {} }]), USER, NO_TOOLS),
    ).rejects.toThrow('The local wiki agent stream failed');
  });

  it('still fails the turn if the stream library swallows callback errors', async () => {
    // We record the error and re-throw after the stream rather than throwing
    // from inside onChunk. The pinned build propagates a throw, but it is an OM
    // snapshot we pin because it moves — and if a future build caught and logged
    // instead, a failed turn would quietly resolve as a partial answer.
    const swallowing = {
      stream: vi.fn().mockResolvedValue({
        processDataStream: async ({
          onChunk,
        }: {
          onChunk: (chunk: WikiStreamChunk) => void | Promise<void>;
        }) => {
          for (const chunk of [
            text('half an answer'),
            { type: 'error', payload: { error: { message: 'model exploded' } } },
          ]) {
            try {
              await onChunk(chunk);
            } catch {
              /* swallowed, as a future client-js might */
            }
          }
        },
      }),
    };

    await expect(streamLocalWikiChat(swallowing, USER, NO_TOOLS)).rejects.toThrow('model exploded');
  });

  it('stops folding chunks into the answer once the turn has failed', async () => {
    const updates: ChatStreamUpdate[] = [];
    await expect(
      streamLocalWikiChat(
        agentRounds([
          text('before'),
          { type: 'error', payload: { error: { message: 'boom' } } },
          text('after'),
        ]),
        USER,
        NO_TOOLS,
        { onUpdate: (u) => updates.push(structuredClone(u)) },
      ),
    ).rejects.toThrow('boom');

    const rendered = updates.map((u) => u.displayText);
    expect(rendered).toContain('before');
    expect(rendered.some((t) => t.includes('after'))).toBe(false);
  });
});

describe('commit per turn', () => {
  /** A turn that files a page, links it from the index and logs it. */
  const writingTurn = () =>
    agentRounds(
      [
        call('wiki_write_page', 'c1', { path: 'people/ada.md' }),
        call('wiki_write_page', 'c2', { path: 'index.md' }),
        call('wiki_write_page', 'c3', { path: 'log.md' }),
      ],
      [text('Filed it.')],
    );

  it('commits exactly once for a turn that wrote several pages', async () => {
    // Three commits would let you revert the page and leave the index pointing
    // at a file that no longer exists.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await streamLocalWikiChat(
      writingTurn(),
      USER,
      { wiki_write_page: tool('wiki_write_page') },
      { onTurnWrote, turnSummary: 'Tell me about Ada' },
    );
    expect(onTurnWrote).toHaveBeenCalledTimes(1);
    expect(onTurnWrote).toHaveBeenCalledWith('Tell me about Ada');
  });

  it('does not commit a turn that only read', async () => {
    // An empty commit every turn would bury the real ones.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await streamLocalWikiChat(
      agentRounds([call('wiki_list_pages', 'c1')], [text('Three pages.')]),
      USER,
      { wiki_list_pages: tool('wiki_list_pages') },
      { onTurnWrote },
    );
    expect(onTurnWrote).not.toHaveBeenCalled();
  });

  it('does not commit when the only write failed', async () => {
    // A write the jail refused changed nothing on disk.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await streamLocalWikiChat(
      agentRounds([call('wiki_write_page', 'c1')], [text('could not')]),
      USER,
      { wiki_write_page: tool('wiki_write_page', vi.fn().mockRejectedValue(new Error('nope'))) },
      { onTurnWrote },
    );
    expect(onTurnWrote).not.toHaveBeenCalled();
  });

  it('commits after the whole turn, not after the round that wrote', async () => {
    // Writes can land across several rounds; committing early would split one
    // conversation into several commits.
    const seen: string[] = [];
    await streamLocalWikiChat(
      agentRounds([call('wiki_write_page', 'c1')], [call('wiki_write_page', 'c2')], [text('done')]),
      USER,
      {
        wiki_write_page: tool(
          'wiki_write_page',
          vi.fn().mockImplementation(() => {
            seen.push('write');
            return Promise.resolve({ ok: true });
          }),
        ),
      },
      {
        onTurnWrote: async () => {
          seen.push('commit');
        },
      },
    );
    expect(seen).toEqual(['write', 'write', 'commit']);
  });

  it('does not commit a turn that failed mid-stream', async () => {
    // Throwing before the commit is deliberate: a turn that died half-written
    // should be inspectable in `git status`, not sealed into history as though
    // it completed.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await expect(
      streamLocalWikiChat(
        agentRounds([
          call('wiki_write_page', 'c1'),
          { type: 'error', payload: { error: { message: 'boom' } } },
        ]),
        USER,
        { wiki_write_page: tool('wiki_write_page') },
        { onTurnWrote },
      ),
    ).rejects.toThrow('boom');
    expect(onTurnWrote).not.toHaveBeenCalled();
  });

  it('falls back to an empty summary rather than failing the commit', async () => {
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await streamLocalWikiChat(
      writingTurn(),
      USER,
      { wiki_write_page: tool('wiki_write_page') },
      { onTurnWrote },
    );
    expect(onTurnWrote).toHaveBeenCalledWith('');
  });
});
