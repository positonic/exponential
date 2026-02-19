/**
 * Output sanitization for AI responses.
 *
 * Scans AI-generated text for patterns that look like leaked secrets
 * (JWT tokens, API keys, bearer tokens, etc.) and redacts them.
 * This is a defense-in-depth layer — the ACIP security policy instructs
 * the model not to leak secrets, but this catches cases where that fails.
 */

// Patterns that indicate leaked secrets in AI output
const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  // JWT tokens (3 base64 segments separated by dots)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT' },
  // API keys with common prefixes
  { pattern: /(?:sk|pk|api|key|token|secret|bearer)[_-][A-Za-z0-9]{20,}/gi, label: 'API_KEY' },
  // OpenAI API keys
  { pattern: /sk-[A-Za-z0-9]{32,}/g, label: 'OPENAI_KEY' },
  // GitHub tokens
  { pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g, label: 'GITHUB_TOKEN' },
  // Fireflies API keys
  { pattern: /ff_[A-Za-z0-9]{20,}/g, label: 'FIREFLIES_KEY' },
  // Generic bearer tokens in output
  { pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/g, label: 'BEARER_TOKEN' },
  // Base64-encoded strings that are suspiciously long (likely tokens)
  { pattern: /[A-Za-z0-9+/]{64,}={0,2}/g, label: 'BASE64_TOKEN' },
  // Hex-encoded secrets (64+ chars = 32+ bytes)
  { pattern: /[0-9a-f]{64,}/gi, label: 'HEX_SECRET' },
];

/**
 * Scan AI output text and redact any patterns that look like leaked secrets.
 * Returns the sanitized text and a flag indicating if redaction occurred.
 */
export function sanitizeAIOutput(text: string): { text: string; redacted: boolean } {
  let redacted = false;

  let sanitized = text;
  for (const { pattern, label } of SECRET_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      redacted = true;
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, `[REDACTED_${label}]`);
    }
  }

  return { text: sanitized, redacted };
}
