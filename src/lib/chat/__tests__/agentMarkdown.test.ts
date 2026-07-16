import { describe, it, expect } from 'vitest';
import { preprocessAgentMarkdown, linkifyBareUrls } from '../agentMarkdown';

describe('linkifyBareUrls', () => {
  it('linkifies a bare domain with a path', () => {
    expect(linkifyBareUrls('their GitHub profile (github.com/Banksy-said-hi) linked')).toBe(
      'their GitHub profile ([github.com/Banksy-said-hi](https://github.com/Banksy-said-hi)) linked',
    );
  });

  it('linkifies www.-prefixed hosts without a path', () => {
    expect(linkifyBareUrls('see www.example.com today')).toBe(
      'see [www.example.com](https://www.example.com) today',
    );
  });

  it('keeps trailing punctuation out of the link', () => {
    expect(linkifyBareUrls('go to exponential.im/home.')).toBe(
      'go to [exponential.im/home](https://exponential.im/home).',
    );
  });

  it('leaves existing markdown links untouched', () => {
    const input = 'in your [CRM](https://exponential.im/w/syntrofi/crm/contacts).';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it('leaves protocol URLs untouched (GFM already autolinks them)', () => {
    const input = 'visit https://github.com/foo/bar for details';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it('does not linkify bare domains without a path (e.g. package names)', () => {
    const input = 'we use socket.io for transport';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it('does not linkify file paths with code-ish extensions', () => {
    const input = 'see route.ts/handler and ManyChat.tsx for details';
    expect(linkifyBareUrls(input)).toBe(input);
  });
});

describe('preprocessAgentMarkdown', () => {
  it('splits narration at colon-followed action boundaries', () => {
    expect(preprocessAgentMarkdown('Here is the plan:Now I will create the task.')).toBe(
      'Here is the plan:\n\nNow I will create the task.',
    );
  });

  it('leaves ordinary colons alone', () => {
    const input = 'Status: done. Priority: high.';
    expect(preprocessAgentMarkdown(input)).toBe(input);
  });
});
