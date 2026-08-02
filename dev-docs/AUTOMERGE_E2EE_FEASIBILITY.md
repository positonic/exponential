# Feasibility: CryptPad-like E2EE collaborative documents on Automerge

**Status:** Research / feasibility assessment (no decision yet)
**Date:** 2026-07-05
**Question:** Can Automerge provide the collaboration engine for end-to-end-encrypted
documents inside Exponential, with encryption wrapped around the Automerge change
stream so the server only ever stores/relays ciphertext?

**Verdict: Yes — the model is architecturally sound and proven by prior art, with three
structural caveats:**

1. **Automerge's sync protocol cannot run on the server.** The server must be demoted to
   a dumb encrypted append-only log + relay (the CryptPad/secsync architecture). This
   works because Automerge changes are self-contained binary blobs and
   `applyChanges()` buffers out-of-order arrivals.
2. **Exponential has zero realtime infrastructure and deploys pure-serverless on
   Vercel.** The relay is net-new infra (polling for a PoC; a small websocket service on
   Railway for the real thing).
3. **Revocation is re-keying at snapshot boundaries, not cryptographic revocation.**
   The "real" solution (Ink & Switch's Keyhive/Beelay) is pre-alpha and not shippable
   in 2026.

The dominant cost is not the CRDT or the crypto — both are well-trodden. It is **key
management UX** (where user private keys live, multi-device, recovery) and the
**feature cost**: an E2EE page cannot participate in server-side search embeddings,
AI/Mastra features, markdown projection, or ADR-0038 server-rendered public
publishing. E2EE pages are necessarily a separate, reduced-capability class of page.

---

## 1. How Automerge represents state and changes

- A document is a **hash-linked DAG of changes**. Each change is a binary blob carrying
  an actor ID (16 random bytes), a per-actor sequence number, **SHA-256 hashes of its
  causal dependencies**, and columnar-encoded operations (RLE/delta/LEB128,
  optionally DEFLATE per column). Spec: <https://automerge.org/automerge-binary-format-spec/>
- Current versions (verified against the npm registry 2026-07-05):
  `@automerge/automerge` **3.2.6** (Automerge 3 shipped July 2025 with ~10–500×
  memory reduction — Moby Dick: ~700 MB → 1.3 MB — same file format;
  <https://automerge.org/blog/automerge-3/>), `@automerge/automerge-repo` **2.5.6**.
- Persistence APIs: `save()` (full compressed snapshot incl. history), `load()`,
  `saveIncremental()` / `saveSince(doc, heads)` (appendable byte bundles of changes
  since a point), `loadIncremental()`, `getChanges()` / `getAllChanges()` /
  `applyChanges()`.
- **`applyChanges()` explicitly tolerates missing dependencies**: changes whose deps
  haven't arrived are stored in the document and applied when the deps arrive
  (<https://automerge.org/automerge/api-docs/js/functions/applyChanges.html>). This is
  the property that makes an unordered/dumb relay viable.
- automerge-repo's canonical storage pattern: append `[docId, "incremental", changeHash]`
  entries; compact to `[docId, "snapshot", headsHash]` when incrementals exceed
  snapshot size (<https://automerge.org/docs/reference/under-the-hood/storage/>). We
  replicate this pattern, but with client-side compaction because the server can't read.

## 2. Can individual changes be encrypted before persist/broadcast?

**Yes.** Changes are opaque, self-describing binary blobs; nothing in Automerge needs to
inspect them in transit. Encrypt with an AEAD, ship ciphertext, decrypt on the other
side, `applyChanges()`. Conflict resolution is completely unaffected (see §7).

Caveat — **granularity**: one change is produced per `Automerge.change()` call, so naive
wiring produces per-keystroke changes, and per-change encryption adds fixed
nonce/tag/signature overhead per tiny change. The Automerge team itself calls naive
per-change encryption "prohibitively expensive"
(<https://automerge.org/blog/automerge-repo/>). Mitigation, proven by secsync: **batch**
— debounce ~1s (matching the existing `RichDocEditor` autosave cadence) and encrypt
the `saveSince()` bundle as one blob, plus periodic encrypted snapshots.

## 3. Encryption granularity: per document, per change, per user, per session?

**Per document, per epoch** — one symmetric key (the "doc key") per document per key
epoch; each uploaded blob encrypted under it with a fresh random nonce.

- AEAD: XChaCha20-Poly1305 (libsodium) or AES-256-GCM (WebCrypto, zero-dependency).
- AAD should bind `{docId, epoch, seq}` so blobs can't be replayed across documents
  or reordered undetectably.
- **Not per-user** (every collaborator must decrypt every other collaborator's changes —
  per-user content keys break the model). **Not per-session** (offline clients and new
  joiners must decrypt historical blobs written in long-dead sessions).
- Epochs exist to make rotation possible: rotate = new epoch key + new snapshot (§4).

Separately, **edit rights can be cryptographic** (CryptPad's model): a per-document
Ed25519 signing keypair, where viewers get only the decrypt key and editors also get
the signing key; the server verifies signatures over ciphertext and rejects unsigned
writes. This gives real read/write separation even though the server can't read —
notably stronger than our current server-side-only role checks (cf. the known
`feature.update` viewer-gating gap). MVP can defer this and rely on
`knowledgePageResolver` role checks server-side.

## 4. Key lifecycle: generation, storage, sharing, rotation, revocation

**Generation:** in the browser, `crypto.getRandomValues` / WebCrypto `generateKey`.
The key must never leave the client unwrapped.

**Storage & sharing — two tiers:**

- **Tier 1 (PoC/MVP): key in the URL fragment** — `/w/{ws}/pages/{id}#<base64key>`.
  The fragment never reaches the server. Zero server-side key infrastructure;
  possession of the link = capability. Weaknesses: links leak (browser history, chat
  logs), revocation ≈ rotation only, lost link = permanently lost document. This is
  exactly CryptPad's model and is fine for validating the architecture.
- **Tier 2 (product): per-user keypairs + server-distributed wrapped keys.** Each user
  gets an X25519 keypair generated client-side. The doc key is wrapped (sealed) to
  each collaborator's public key; wrapped keys are stored server-side in a
  `DocKeyGrant` table. The server enforces *who may fetch a wrapped key* using the
  existing `knowledgePageResolver` permissions — server-enforced authorization layered
  under client-side confidentiality. **The hard part is the private key**: device-bound
  (IndexedDB) means multi-device and recovery need explicit design — passphrase-wrapped
  key escrow, device-pairing (QR), or printed recovery codes. NextAuth gives us no
  passphrase to derive from. This key UX is the single biggest product cost of E2EE.

**New collaborator:** inviter's client (which holds the doc key) wraps it to the
invitee's public key and posts the grant; or, in Tier 1, you share the fragment link.
Choose whether they get all epoch keys (full history) or only the current epoch
(history hidden before their join — secsync demonstrates this).

**Rotation & revocation:** generate a new epoch key, write a fresh encrypted snapshot
under it, wrap it to the *remaining* members, stop honoring the old epoch for new
writes. The revoked member cannot read anything after the boundary — but **retains
everything they already saw; that is information-theoretically unavoidable**. Server-side
access checks (stop serving them blobs at all) remain the first line; crypto rotation is
the backstop against a leaked key. True forward secrecy / post-compromise security /
concurrent revocation is exactly what Keyhive's BeeKEM (TreeKEM/MLS lineage) is being
built for (<https://www.inkandswitch.com/keyhive/notebook/02/>) — pre-alpha, "DO NOT use
in production" (<https://github.com/inkandswitch/keyhive>), no beta/audit as of mid-2026.

## 5. Offline edits

Natural fit — Automerge is local-first by construction:

- Local doc persisted in IndexedDB (encrypt at rest under the doc key as well).
- While offline: edits accumulate locally; the client tracks the last server sequence
  number it has seen.
- On reconnect: push the encrypted `saveSince(lastSyncedHeads)` bundle; pull all blobs
  with `seq > lastSeenSeq`; decrypt; `applyChanges()`. Out-of-order and duplicate
  delivery are safe (dedup by change hash, buffering by deps).
- No server merge logic exists or is needed; the merge happens on each client.

## 6. Conflict resolution

**Unchanged from plaintext Automerge.** Encryption sits strictly outside the CRDT:
decrypt → apply → deterministic convergence. Two clients editing the same sentence
offline produce a merged result identical to what unencrypted Automerge would produce.
This *replaces* the current Pages model (whole-doc overwrite + `docVersion`
compare-and-set + "reload and lose your work" modal in
`src/app/_components/shared/RichDocEditor.tsx`) with real merge semantics.

## 7. What the server still sees (metadata)

Content is hidden; a lot is not:

| Visible to server | Notes |
|---|---|
| User identity | NextAuth session gates every request — full identity, unlike CryptPad's anonymous tiers |
| Document existence, ID, membership/sharing graph | Who has grants on what |
| Blob count, sizes, timestamps | Edit cadence; without batching, keystroke-timing patterns |
| Access patterns, IPs | Who opened what, when |
| Title (decision needed) | CryptPad encrypts titles; if we do too, lists/breadcrumbs/search need client-side decryption of a per-doc metadata blob |

**Feature cost (the real product decision):** because the server can't read content, an
E2EE page **cannot**: feed `KnowledgeChunk` search embeddings (`includeInSearch`),
be read by AI/Mastra agents, maintain the `body` markdown projection, or use the
ADR-0038 server-rendered public publishing pipeline (`renderPublicPageHtml`).
E2EE pages should be a distinct page class with these features explicitly off.

## 8. Fit with existing Exponential infrastructure

Findings from the codebase survey (branch `page-public-publishing`):

- **Editor:** Pages use Tiptap/ProseMirror via the shared `RichDocEditor`
  (`src/app/_components/shared/RichDocEditor.tsx`), storing canonical ProseMirror JSON
  in `KnowledgePage.bodyDoc` + a derived markdown `body` (ADR-0024). The editor loads
  content once and never re-syncs — collaborative editing requires different wiring
  regardless of encryption. For rich text on Automerge there is an official
  ProseMirror binding (`automerge-prosemirror`; Automerge ≥2.2 has native rich-text
  marks/blocks) — its Tiptap interop is unverified and is the riskiest integration
  area. **The PoC should use plain text and defer rich text.**
- **Data model:** no retrofit of `KnowledgePage.bodyDoc` — E2EE content lives in new
  tables. Precedent for opaque binary columns exists (CRM's encrypted
  `Bytes @db.ByteA` fields). Sketch:
  - `EncryptedDocChange(id BigInt autoincrement, docId, epoch, ciphertext Bytes, authorId, createdAt)`
    — clients poll `WHERE docId = ? AND id > lastSeen`; global autoincrement id gives
    per-doc total order without extra sequencing machinery.
  - `EncryptedDocSnapshot(docId, epoch, coversUpToId, ciphertext Bytes, createdById, createdAt)`
  - `DocKeyGrant(docId, userId, epoch, wrappedKey Bytes)` (Tier 2 only)
- **Access control:** the existing dedicated resolver
  (`src/server/services/access/resolvers/knowledgePageResolver.ts`) gates who may
  append/fetch blobs and fetch key grants. Crypto adds a second layer under it; the
  authz model doesn't change.
- **Auth:** NextAuth v5 JWT sessions gate the tRPC/relay endpoints as today. Note
  NextAuth gives us no client-held secret — nothing to derive user keys from; user
  keypairs are a separate mechanism (§4 Tier 2).
- **Realtime: none exists.** No websockets/SSE/subscriptions anywhere; the app's
  realtime idiom is react-query `refetchInterval` polling, and the deploy is pure
  serverless Vercel (no host for a socket server). Options in order:
  1. **PoC/MVP: tRPC polling** (~2s `refetchInterval`) — consistent with existing
     patterns, zero new infra, fine for 2–5 collaborators.
  2. **Product: a small dumb websocket relay on Railway** (where mastra + the WhatsApp
     gateway already run): authenticates the session, fans out ciphertext blobs
     per-doc, carries encrypted ephemeral presence/cursor messages. It never needs to
     read anything.
  3. Managed relays (PartyKit/Ably/Cloudflare DO) are acceptable precisely *because*
     payloads are ciphertext — the third party sees only metadata.
- **Existing crypto:** `src/server/utils/encryption.ts` is server-side AES-GCM under a
  single `DATABASE_ENCRYPTION_KEY` — encryption **at rest**, a fundamentally weaker
  guarantee than E2EE. Don't conflate them in product copy.

## 9. Automerge sync protocol: direct use, or custom transport?

**Custom transport.** The sync protocol (`generateSyncMessage`/`receiveSyncMessage`)
is pairwise with per-peer state and negotiates via Bloom filters over change hashes —
a participating peer must hold the plaintext document. The stock
`automerge-repo-sync-server` is exactly that: a full Repo peer with plaintext on disk.
The Beelay docs confirm it directly: "In the current sync protocol, the sync server has
the plaintext in memory… for Beelay this isn't an option because the server only has
the ciphertext" (<https://github.com/automerge/beelay/blob/main/docs/sedimentree.md>).

Viable shapes, in order of preference:

1. **Sequence-numbered encrypted log (recommended).** Clients push encrypted change
   bundles; server appends and fans out; clients pull-since-seq and `applyChanges()`.
   No sync protocol at all. This is secsync's and (structurally) CryptPad's design —
   the simplest thing that works, and it degrades gracefully to polling.
2. Pairwise client↔client Automerge sync with encrypted payloads relayed through the
   server — more machinery (per-peer sessions), and it still doesn't solve cold-start
   storage. Not worth it.
3. automerge-repo with custom Network/Storage adapters is possible
   (`@localfirst/auth-provider-automerge-repo` proves the wrapping pattern, though its
   sync server is a trusted peer, not blind storage) — but for an MVP, core
   `@automerge/automerge` APIs without automerge-repo are less moving parts.

**Compaction** (the append-only log grows forever, and cold-load = download+decrypt
everything): the server can't compact ciphertext, so **clients checkpoint** — every N
changes / M bytes, an editor uploads `encrypt(Automerge.save(doc))` as a snapshot
marked "covers up to blob #K"; loading = latest snapshot + tail. CryptPad (checkpoint
every 50 patches, server-visible marker), secsync (client snapshots + server-verified
proof chain), and Beelay's sedimentree are all versions of this. Snapshot boundaries
double as key-rotation boundaries (§4).

## 10. Security limitations — stated honestly

- **Browser-delivered JS is the trust root.** The server ships the JavaScript that
  handles keys; a malicious or compromised deploy can exfiltrate them. CryptPad says
  this outright ("If you receive bogus code from the server, you cannot establish any
  security") and mitigates with a two-origin sandboxed-iframe architecture; code
  transparency (e.g. FPF's WEBCAT) is emerging but immature.
  **What this design honestly provides:** protection against database compromise,
  leaked backups, honest-but-curious operators/hosting providers, and subpoena of
  stored data. **What it does not provide:** protection against an actively malicious
  operator serving targeted code, or XSS (strict CSP is a prerequisite).
- **Client compromise = game over for that user's docs** (as in any E2EE system).
- **Metadata is not protected** (§7).
- **Revocation is bounded** (§4): departed members keep what they saw.
- The Electron desktop target is worth noting: a packaged desktop build pins the code
  and meaningfully hardens the delivered-JS problem for users who want it.

## 11. Prior art (why we're confident)

- **secsync** (<https://github.com/serenity-kit/secsync>) — "relay E2EE CRDTs over a
  central service"; snapshots + updates + ephemeral messages, XChaCha20-Poly1305 +
  Ed25519, **supports Automerge and Yjs**. Beta software, NLnet-funded, modest
  activity. Worth reading in full and possibly adopting/cribbing the message spec even
  if we don't take the dependency.
- **CryptPad** — same server-blind architecture in production for ~a decade, but on
  ChainPad (OT over a hash chain, needs server total-ordering), not a CRDT. Automerge
  strictly improves on ChainPad here: no ordering requirement, real offline merge.
- **Keyhive/Beelay** (Ink & Switch) — capability model + BeeKEM group key agreement +
  ciphertext-servable sedimentree storage, i.e. this entire document as a first-class
  protocol. Pre-alpha; design our key/epoch/snapshot layer so it can be swapped out
  for Keyhive when it matures.
- **Jazz / Evolu / any-sync / DXOS** — adjacent E2EE local-first stacks with their own
  CRDTs (not Automerge); adopting one would replace our stack rather than integrate
  with it. Jazz's rotate-on-removal group keys validate the §4 revocation model.

## 12. MVP / proof-of-concept scope

**PoC (~1 week, one engineer), validating the full loop end-to-end:**

1. New route (e.g. `/w/[workspaceSlug]/secure-docs/[id]`), plain-text editor
   (textarea) bound to an Automerge doc with `updateText`. No Tiptap, no rich text.
2. Doc key generated in-browser (WebCrypto AES-256-GCM), shared via URL fragment.
3. Prisma: `EncryptedDocChange` table (+ `protectedProcedure` mutations
   `appendChanges` / query `changesSince(docId, afterId)` gated by page access).
4. Client: debounce 1s → `saveSince()` → encrypt → push; poll `changesSince` at 2s →
   decrypt → `applyChanges()`. Persist doc + cursor in IndexedDB.
5. Verify in Prisma Studio that only ciphertext ever reaches Postgres.
6. Test: two browser sessions typing concurrently; one session offline for 10 min of
   edits on both sides, then reconnect and confirm clean merge.
7. Add a naive client checkpoint (every 200 blobs, upload encrypted `save()`) to
   prove the compaction story.

**Explicitly deferred beyond PoC:** rich text (automerge-prosemirror/Tiptap interop —
spike separately), per-user keypairs & wrapped-key grants, key rotation, websocket
relay, presence/cursors, encrypted titles, Ed25519 write-signing.

**Kill criteria for the PoC:** unacceptable typing latency under polling with 3+
concurrent editors; change-log growth that checkpointing doesn't tame; IndexedDB
persistence proving unreliable.

## Related follow-ups

- **Product fork to decide before any full PRD:** is "our server cannot read your
  documents" part of Exponential's pitch? If **no**, plain multiplayer Pages should
  use the Yjs ecosystem (Tiptap's official collaboration extension + Hocuspocus or a
  managed service) — Automerge exits the conversation. If **yes**, this document's
  architecture applies. The PoC above is worth running either way; it is cheap and
  de-risks the decision itself.
- An educational write-up of this research lives at
  `docs/blog/drafts/encrypted-collaboration-automerge.md`.

## References

- Automerge binary format spec — <https://automerge.org/automerge-binary-format-spec/>
- `applyChanges` buffering — <https://automerge.org/automerge/api-docs/js/functions/applyChanges.html>
- Automerge 3 announcement — <https://automerge.org/blog/automerge-3/>
- automerge-repo storage model — <https://automerge.org/docs/reference/under-the-hood/storage/>
- E2EE named a hard problem — <https://automerge.org/blog/automerge-repo/>
- Beelay + sedimentree — <https://github.com/automerge/beelay>
- Keyhive project — <https://www.inkandswitch.com/project/keyhive/> (BeeKEM: <https://www.inkandswitch.com/keyhive/notebook/02/>)
- secsync spec — <https://www.secsync.com/docs/specification>
- CryptPad ChainPad/dev guide — <https://docs.cryptpad.org/en/dev_guide/client/chainpad.html>; security model — <https://docs.cryptpad.org/en/user_guide/security.html>
- localfirst/auth automerge-repo provider — <https://www.npmjs.com/package/@localfirst/auth-provider-automerge-repo>
