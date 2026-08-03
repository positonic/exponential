import { describe, expect, it, vi } from 'vitest';

import { streamLocalWikiChat, type WikiStreamChunk } from '../streamLocalWikiChat';
import type { ChatStreamUpdate } from '../streamChatResponse';
import type { WikiClientTool } from '../../localWiki';

/**
 * The local wiki is the one chat path that doesn't go through
 * `/api/chat/stream`, so it's also the one whose events nothing else exercises.
 * These tests feed synthetic client-js chunks through the adapter and assert the
 * `ChatStreamUpdate` sequence ManyChat would render — no network, no Mastra, no
 * UI. Same seam as `streamProtocol.test.ts` covers for the server transport.
 */

/** A stub agent that replays a fixed chunk sequence. */
function agentEmitting(chunks: WikiStreamChunk[]) {
  return {
    stream: vi.fn().mockResolvedValue({
      processDataStream: async ({
        onChunk,
      }: {
        onChunk: (chunk: WikiStreamChunk) => void | Promise<void>;
      }) => {
        for (const chunk of chunks) await onChunk(chunk);
      },
    }),
  };
}

const text = (t: string): WikiStreamChunk => ({ type: 'text-delta', payload: { text: t } });
const call = (toolName: string, toolCallId: string, args?: Record<string, unknown>): WikiStreamChunk => ({
  type: 'tool-call',
  payload: { toolName, toolCallId, args },
});
const result = (toolName: string, toolCallId: string): WikiStreamChunk => ({
  type: 'tool-result',
  payload: { toolName, toolCallId, result: { ok: true } },
});

const NO_TOOLS: Record<string, WikiClientTool> = {};

async function run(chunks: WikiStreamChunk[], options = {}) {
  const updates: ChatStreamUpdate[] = [];
  const final = await streamLocalWikiChat(
    agentEmitting(chunks),
    [{ role: 'user', content: 'hello' }],
    NO_TOOLS,
    { onUpdate: (u) => updates.push(structuredClone(u)), ...options },
  );
  return { final, updates };
}

describe('text streaming', () => {
  it('accumulates deltas into the text ManyChat renders', async () => {
    const { final, updates } = await run([text('There are '), text('three pages.')]);
    expect(final.displayText).toBe('There are three pages.');
    expect(updates.map((u) => u.displayText)).toEqual(['There are ', 'There are three pages.']);
  });

  it('counts raw bytes so a tool-only turn is not mistaken for empty', async () => {
    // ManyChat reads rawLength to decide whether a failed turn "had content".
    // A turn that only ran tools did real work — it may have touched the user's
    // files — and must never be silently auto-retried.
    const { final } = await run([call('wiki_write_page', 'c1'), result('wiki_write_page', 'c1')]);
    expect(final.displayText).toBe('');
    expect(final.rawLength).toBeGreaterThan(0);
  });
});

describe('tool lifecycle', () => {
  it('upgrades a running call to success rather than adding a second chip', async () => {
    const { final } = await run([
      call('wiki_list_pages', 'c1', { foo: 1 }),
      result('wiki_list_pages', 'c1'),
    ]);
    expect(final.toolCalls).toEqual([
      { id: 'c1', name: 'wiki_list_pages', args: { foo: 1 }, status: 'success' },
    ]);
  });

  it('keeps the call arguments when the result arrives', async () => {
    // The result frame carries no args; losing them would blank the chip's
    // detail halfway through the turn.
    const { final } = await run([
      call('wiki_read_page', 'c1', { path: 'index.md' }),
      result('wiki_read_page', 'c1'),
    ]);
    expect(final.toolCalls[0]?.args).toEqual({ path: 'index.md' });
  });

  it('preserves first-seen order across interleaved calls', async () => {
    const { final } = await run([
      call('wiki_list_pages', 'c1'),
      call('wiki_read_page', 'c2'),
      result('wiki_read_page', 'c2'),
      result('wiki_list_pages', 'c1'),
    ]);
    expect(final.toolCalls.map((t) => t.id)).toEqual(['c1', 'c2']);
  });

  it('marks a result carrying an error as failed, with its message', async () => {
    const { final } = await run([
      call('wiki_read_page', 'c1', { path: '../etc/passwd' }),
      {
        type: 'tool-result',
        payload: {
          toolName: 'wiki_read_page',
          toolCallId: 'c1',
          isError: true,
          error: { message: 'path is outside the wiki folder' },
        },
      },
    ]);
    expect(final.toolCalls[0]).toMatchObject({
      status: 'error',
      errorMsg: 'path is outside the wiki folder',
    });
  });

  it('handles a dedicated tool-error frame', async () => {
    const { final } = await run([
      call('wiki_write_page', 'c1'),
      { type: 'tool-error', payload: { toolCallId: 'c1', error: 'disk full' } },
    ]);
    expect(final.toolCalls[0]).toMatchObject({ status: 'error', errorMsg: 'disk full' });
  });

  it('still shows a result for a call it never saw', async () => {
    // Dropping it would hide work that actually touched the user's files.
    const { final } = await run([result('wiki_write_page', 'orphan')]);
    expect(final.toolCalls).toHaveLength(1);
    expect(final.toolCalls[0]).toMatchObject({ name: 'wiki_write_page', status: 'success' });
  });

  it('ignores chunk types it does not recognise', async () => {
    // The stream format is a moving target on a pinned snapshot build; an
    // unfamiliar chunk must never cost the user their answer.
    const { final } = await run([
      { type: 'start-step' },
      text('fine'),
      { type: 'reasoning-delta', payload: { text: 'hmm' } },
      { type: 'finish' },
    ]);
    expect(final.displayText).toBe('fine');
  });
});

describe('stream errors', () => {
  it('throws so the caller can reuse the existing failure handling', async () => {
    await expect(
      run([text('partial'), { type: 'error', payload: { error: { message: 'model exploded' } } }]),
    ).rejects.toThrow('model exploded');
  });

  it('throws something readable even when the payload has no message', async () => {
    await expect(run([{ type: 'error', payload: {} }])).rejects.toThrow(
      'The local wiki agent stream failed',
    );
  });
});

describe('commit per turn', () => {
  const writeTurn: WikiStreamChunk[] = [
    call('wiki_write_page', 'c1', { path: 'people/ada.md' }),
    result('wiki_write_page', 'c1'),
    call('wiki_write_page', 'c2', { path: 'index.md' }),
    result('wiki_write_page', 'c2'),
    text('Filed it.'),
  ];

  it('commits exactly once for a turn that wrote several pages', async () => {
    // The whole point of commit-per-turn: filing a page and linking it from the
    // index are one change. Two commits would let you revert the page and leave
    // the index pointing at a file that no longer exists.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await run(writeTurn, { onTurnWrote, turnSummary: 'Tell me about Ada' });
    expect(onTurnWrote).toHaveBeenCalledTimes(1);
    expect(onTurnWrote).toHaveBeenCalledWith('Tell me about Ada');
  });

  it('does not commit a turn that only read', async () => {
    // An empty commit every turn would bury the real ones.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await run(
      [call('wiki_list_pages', 'c1'), result('wiki_list_pages', 'c1'), text('Three pages.')],
      { onTurnWrote },
    );
    expect(onTurnWrote).not.toHaveBeenCalled();
  });

  it('does not commit when the only write failed', async () => {
    // A write the jail refused changed nothing on disk; committing for it would
    // produce an empty commit implying otherwise.
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await run(
      [
        call('wiki_write_page', 'c1', { path: '../escape.md' }),
        {
          type: 'tool-result',
          payload: { toolName: 'wiki_write_page', toolCallId: 'c1', isError: true },
        },
      ],
      { onTurnWrote },
    );
    expect(onTurnWrote).not.toHaveBeenCalled();
  });

  it('commits after the stream ends, not mid-turn', async () => {
    // Client-js resumes a tool call by re-POSTing the turn, so writes can land
    // across several rounds. Committing early would split one conversation into
    // several commits.
    const seen: string[] = [];
    const onTurnWrote = vi.fn().mockImplementation(async () => {
      seen.push('commit');
    });
    await run(
      [
        call('wiki_write_page', 'c1'),
        result('wiki_write_page', 'c1'),
        { type: 'text-delta', payload: { text: 'done' } },
      ],
      {
        onTurnWrote,
        onUpdate: () => seen.push('update'),
      },
    );
    expect(seen[seen.length - 1]).toBe('commit');
  });

  it('falls back to an empty summary rather than failing the commit', async () => {
    const onTurnWrote = vi.fn().mockResolvedValue(undefined);
    await run(writeTurn, { onTurnWrote });
    expect(onTurnWrote).toHaveBeenCalledWith('');
  });
});

describe('client tools', () => {
  it('hands the tools to the agent so they execute on this device', async () => {
    const tools: Record<string, WikiClientTool> = {
      wiki_list_pages: {
        id: 'wiki_list_pages',
        description: 'list',
        inputSchema: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue({ pages: [] }),
      },
    };
    const agent = agentEmitting([text('ok')]);
    await streamLocalWikiChat(agent, [{ role: 'user', content: 'hi' }], tools);

    expect(agent.stream).toHaveBeenCalledWith([{ role: 'user', content: 'hi' }], {
      clientTools: tools,
    });
  });
});
