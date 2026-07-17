# Matrix DMs ship unencrypted; the bot creates the DM room

The Matrix gateway MVP (DM chat with `@zoe:syntro.fi` on matrix.syntro.fi; `matrix-gateway.ts` in `../mastra`, matrix-js-sdk, transcribed from the Telegram gateway) deliberately ships **without E2EE**. Element encrypts DMs *it* creates by default, and a crypto-less bot cannot read them — so instead of adding the crypto stack, the gateway sidesteps room creation entirely: on **Gateway pairing** redemption it creates the canonical DM room itself *without* the `m.room.encryption` state event and invites the user. Rooms never auto-upgrade to encrypted, so that DM stays readable forever with zero crypto. Invited to an encrypted room, the bot posts a plaintext "I can't read encrypted rooms yet — DM me" notice and leaves.

Why: matrix-js-sdk's Node E2EE story (rust-wasm crypto store that must survive restarts, cross-signing/device verification for a headless bot) was the single largest cost and risk in the MVP, while the privacy loss is bounded — messages transit only our own homeserver, the same trust level the WhatsApp/Telegram gateways already accept.

## Considered options

- **Rust crypto from day one** (`initRustCrypto`) — honest E2EE, rejected for MVP: browser-oriented persistence in Node, new-device-per-deploy failure mode, verification UX for a bot.
- **matrix-bot-sdk** instead of matrix-js-sdk — better bot ergonomics and a sqlite crypto store, rejected: slower-moving, one maintainer deep; matrix-js-sdk is first-party and its rust-crypto path is where the eventual E2EE retrofit will land.

## Consequences

- Rooms created unencrypted **stay** unencrypted; the E2EE retrofit means new encrypted rooms plus a persistent crypto store, not upgrading existing ones. "Self-hosted E2EE assistant" remains future work, deliberately.
- Same-session companion decisions (context for this ADR, not separately recorded): single bot account (`@zoe:syntro.fi`, agents multiplexed in the gateway), DM-only scope (rooms later arrive as ADR-0023-style **Channel link** capture, not commands), pairing mappings in `IntegrationUserMapping` rather than the Telegram gateway's local JSON file, bot credentials as gateway env vars (absent token = gateway off; `DISABLE_MATRIX_GATEWAY` override), replies rendered markdown→HTML (`formatted_body`).
