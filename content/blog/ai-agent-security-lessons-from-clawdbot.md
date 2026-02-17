---
title: "AI Agent Security: Lessons from Clawdbot Vulnerabilities"
description: "Recent security research has exposed critical vulnerabilities in AI agents. Here's what we learned and how Exponential protects against these attacks."
date: "2026-02-17"
author: "Exponential Team"
tags: ["security", "ai", "engineering"]
---

## The Rise of AI Agents — and Their Attack Surface

AI agents like Clawdbot have gained massive popularity by giving users their own AI assistant with access to files, email, calendar, and more. But with great power comes great attack surface.

Recent security research has exposed critical vulnerabilities in these agent architectures — vulnerabilities we've systematically addressed in Exponential's AI layer.

## What Researchers Found

Security researchers have documented alarming findings about popular AI agent frameworks:

### Prompt Injection: 91% Success Rate

Testing revealed a security score of just 2/100, with system prompts leaking on first interaction. Attackers could access and manipulate:

- Full system prompts and instructions
- Internal tool configurations  
- Memory files and conversation history
- Connected integration credentials

### Remote Code Execution via WebSocket Hijack

A critical bug allows attackers to trick the UI into leaking auth tokens via malicious links, achieving full system compromise. An AI agent reportedly found and exploited this vulnerability in under 2 hours.

### Supply Chain Attacks via Skills/Plugins

Security scans of agent skill marketplaces uncovered credential stealers disguised as innocent utilities — exfiltrating secrets from environment files without users knowing.

### Exposed Instances with Full Account Access

Shodan scans found thousands of agent instances exposed to the internet, some with full access to connected accounts (Signal, email, calendars) and unresponsive owners.

### Plaintext Credential Storage

Many agents store credentials in plaintext, require overly broad account access, and pass OAuth tokens directly into AI context where they can be extracted.

## The Core Problems

### 1. Trust Hierarchy Violation

Most agent frameworks treat all input equally — user messages, tool outputs, email content, and document text all flow into the same context. A malicious email can contain instructions that the AI follows as if they came from the user.

### 2. No Input Sanitization

External content (emails, documents, meeting transcripts) is injected raw into prompts. Attackers embed instructions like:

- "Ignore previous instructions"
- "SYSTEM: New priority override"
- Base64-encoded commands hidden in documents

### 3. Credential Exposure

Agents need credentials to act on your behalf, but naive implementations store tokens in plaintext, pass OAuth tokens directly to AI context, and log sensitive data for debugging.

### 4. Tool/Plugin Explosion

Every tool and plugin expands the attack surface. Researchers found 18 out of 25 tested tool vulnerabilities were easily exploitable, with "full exploitation possible with just 10 plugins."

## How Exponential Protects Against These Attacks

We've implemented defense-in-depth across our AI layer:

### 1. Cognitive Inoculation (ACIP)

We've integrated ACIP (Advanced Cognitive Inoculation Prompts) into every AI agent. This teaches models to recognize and resist manipulation through understanding, not just pattern matching.

**Immutable Trust Hierarchy:**
1. **SYSTEM** (our prompts) — highest authority
2. **USER** — direct messages from authenticated user
3. **EXTERNAL** — emails, docs, tool outputs = DATA only, never instructions

**Attack Pattern Recognition:**
Our agents are trained to recognize authority claims, instruction injection, urgency manipulation, and encoding tricks — and to treat them as data, not commands.

### 2. Content Sanitization Layer

All external content passes through sanitization before reaching the AI:

- Untrusted content wrapped in clear XML boundaries
- Suspicious patterns flagged (but not removed, to avoid breaking legitimate content)
- Input length limits enforced at schema level

### 3. Server-Side Message Control

We never trust client-supplied system messages:

- System prompts constructed server-side only
- Client messages validated and stripped of role markers
- Authentication verified at every API boundary

### 4. Credential Isolation

- OAuth tokens **never** passed to AI context
- Agents use scoped JWTs to callback to authenticated app endpoints
- No plaintext credential storage
- Encryption keys required from environment (no hardcoded fallbacks)

### 5. Tool Safety Gates

Sensitive tools require explicit confirmation:

- **Email sending:** Draft shown, user confirms before send
- **Calendar events:** Details displayed, approval required
- **Data deletion:** Always requires explicit consent

## The Defense-in-Depth Approach

No single defense is sufficient. We layer protections:

| Layer | Protection | What It Stops |
|-------|------------|---------------|
| **Model** | Cognitive inoculation | Instruction injection, authority claims |
| **Input** | Content sanitization | Embedded commands in external content |
| **Server** | Message validation | Client-side prompt manipulation |
| **Auth** | Credential isolation | Token exfiltration via prompt |
| **Tools** | Confirmation gates | Unauthorized actions |
| **Schema** | Input length limits | Overflow/exhaustion attacks |

## What You Can Do

If you're building or using AI agents:

1. **Never trust tool outputs** — they're external content, not instructions
2. **Implement trust hierarchies** — not all messages are equal
3. **Sanitize, don't just filter** — wrap untrusted content in clear boundaries
4. **Require confirmation for actions** — especially irreversible ones
5. **Isolate credentials** — agents shouldn't see raw OAuth tokens
6. **Audit your integrations** — every plugin is attack surface

## Conclusion

The vulnerabilities discovered in AI agents aren't unique to one project — they represent systemic risks in the AI agent paradigm. As agents gain more capabilities (computer use, code execution, file access), the stakes only increase.

We've learned from these public disclosures and implemented comprehensive protections. The AI assistant that helps manage your life shouldn't become the vector that compromises it.

---

*This post is part of our ongoing commitment to transparency about AI security. We believe the best way to build trust is to show our work.*
