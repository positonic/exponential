import type { StreamFailureKind } from './streamProtocol';

/**
 * User-facing copy for a *terminal* stream failure (auto-retries already
 * exhausted). Deliberately calm and free of alarming/irrelevant advice (the
 * old text told users to go check API keys on every network blip). A Retry
 * button is rendered alongside, so the copy stays short. Shared by every chat
 * surface (the Zoe drawer via ManyChat, the Zoe canvas).
 */
export function failureCopy(kind: StreamFailureKind, severity: 'error' | 'incomplete'): string {
  if (severity === 'incomplete') {
    return `The connection dropped before this finished.`;
  }
  switch (kind) {
    case 'transport':
    case 'idle-timeout':
      return `The connection to the assistant dropped before it could respond.`;
    case 'auth':
      return `Your session looks expired — try refreshing the page, or re-check /settings/api-keys.`;
    case 'model':
      return `The assistant hit a snag handling that request.`;
    default:
      return `Something went wrong handling that request.`;
  }
}
