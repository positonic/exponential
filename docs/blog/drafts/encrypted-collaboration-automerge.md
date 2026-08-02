# You Can't Just Encrypt a CRDT (But You Almost Can)

*What we learned investigating end-to-end encrypted collaborative documents — why
Automerge's sync server can't help you, why the answer is dumber than you think, and
why the hard part isn't the cryptography at all.*

---

We wanted to answer a simple-sounding question for our product: could we offer
collaborative documents — real-time, multiplayer, Google-Docs-style — where **our own
server cannot read the content**? Not "encrypted at rest," where the server holds the
key anyway. Actually unreadable. The way CryptPad does it.

The obvious building block is a CRDT — a Conflict-free Replicated Data Type — and the
obvious CRDT for documents is [Automerge](https://automerge.org). This is the story of
what we found: one elegant idea, one trap that catches almost everyone, one
surprisingly boring solution, and a set of costs that have nothing to do with
cryptography.

## A sixty-second CRDT primer

Collaborative editing has a core problem: two people edit the same document at the
same time, and someone has to merge the results. Google Docs solves it with a central
server that sees every keystroke and referees the merge.

CRDTs solve it without the referee. Every edit becomes a small, self-contained
**change**: "actor `a4f2`, operation 17, insert 'h' after the character created by
operation 16." Changes are designed so that **any client that eventually collects all
of them converges on the exact same document — regardless of the order they arrive
in**. Merging is a pure function that runs on each participant's machine. No referee
required.

Automerge implements this and adds a detail that matters enormously for our purposes:
every change carries **SHA-256 hashes of the changes it causally depends on**. The
history of an Automerge document is a hash-linked DAG — structurally, a lot like a Git
history. And in current Automerge, `applyChanges()` will happily accept a change whose
dependencies haven't arrived yet: it buffers the change and applies it when the
missing pieces show up.

Hold onto that last fact. It's the keystone.

## The elegant idea

If merging happens entirely on the clients, what does the server actually do? It
stores changes and passes them around. And if changes are just opaque byte blobs to
the server anyway... why not encrypt them?

```text
Client A                                Client B
  edit → Automerge change (bytes)
       → encrypt with doc key
       → send ciphertext ──► Server ──► receive ciphertext
                          (stores blob,     → decrypt with doc key
                           reads nothing)   → applyChanges()
                                            → same document appears
```

Generate a symmetric key in the browser. Never send it to the server. Encrypt every
change before upload; decrypt after download; feed the plaintext to Automerge.
Conflict resolution is completely untouched — it happens *after* decryption, so two
people editing the same sentence offline merge exactly as they would without
encryption. The server becomes a coat check: it stores boxes, it hands back boxes, it
has no idea what's in the boxes.

This works. But there's a trap on the way to it, and it's worth walking into
deliberately, because it teaches you how CRDT sync actually works.

## The trap: the sync server has to read your document

Automerge ships a sync server. Your first instinct — ours too — is: great, run the
official `automerge-repo-sync-server`, encrypt the payloads, done.

It cannot work, and the reason is fundamental rather than incidental.

Automerge's sync protocol is a *conversation between two peers who both understand
the document*. When your client connects, the server computes a Bloom filter over the
**hashes of the changes it holds** and the two sides negotiate: here's roughly what I
have, tell me what I'm missing. When a brand-new collaborator joins, the server
doesn't replay three years of keystrokes — it **compacts the document on the fly** and
sends an efficient snapshot. Every one of these useful behaviors requires reading the
changes. Hand the sync server ciphertext and it can't compute the filters, can't
dedupe, can't compact, can't snapshot. It's not a relay with an inconvenient default;
it's a full participant, with your plaintext in memory and on disk. The Automerge
team says this plainly in the design docs for their next-gen protocol: *"In the
current sync protocol, the sync server has the plaintext in memory and can compact
the document on the fly... for Beelay this isn't an option because the server only
has the ciphertext."*

The second version of the trap is subtler. We caught ourselves asking: *if we go
peer-to-peer and the server never stores documents, do we even need encryption?*
Tempting — and wrong twice over. Run the stock server "storage-free" and plaintext
still streams through its memory on every keystroke: loggable, dumpable,
subpoenable. Go truly serverless with WebRTC and you've traded privacy problems for
an availability disaster: documents that only exist while two browsers happen to be
online simultaneously, new devices with nowhere to fetch from, edits that evaporate
when the last tab closes.

A real product needs a durable, always-on peer. That peer will store either plaintext
or ciphertext. **There is no third option where the server stores nothing and
everything still works.** Once you see it in those terms, the design space collapses
to a binary — and if you want the privacy guarantee, ciphertext it is.

## The solution is dumber than you expect

Here's the turn: **you don't need the sync protocol at all.**

The sync protocol is an optimization — a clever way for two parties to figure out the
minimal set of changes to exchange. But remember the keystone fact: Automerge
tolerates changes arriving in any order, buffering the ones whose dependencies are
missing. If out-of-order delivery is fine, then the world's dumbest server suffices:

**A numbered, append-only log of encrypted blobs, per document.**

- Client edits. Every second or so, it bundles its recent changes, encrypts the
  bundle, and appends it to the log: *blob #48*.
- Every other client asks: *"anything after #47?"* — downloads #48, decrypts,
  `applyChanges()`, done.
- Reconnecting after a week offline is the same operation with a bigger answer.
  Push your queued bundles, pull everything after the last number you saw. Automerge
  sorts out the interleaving; that's its whole job.

The server needs to understand exactly two things: document IDs and sequence numbers.
It never orders operations semantically, never merges, never reads. If this looks
familiar, it should — it's how CryptPad has worked for a decade (encrypted append-only
message log per document), and it's precisely the architecture
[secsync](https://github.com/serenity-kit/secsync) packaged up for Automerge and Yjs
payloads. You are not inventing this wheel; you're re-treading a proven one.

One chore comes with it. An append-only log grows forever, and a new reader would
have to download and decrypt every blob since the document's creation. The usual fix
is compaction — but the server can't compact what it can't read. So **clients
checkpoint**: every few hundred blobs, some client uploads an encrypted snapshot of
the entire document, labeled "covers everything up to #200." New readers grab the
latest snapshot plus the tail. CryptPad checkpoints every 50 patches; secsync makes
snapshots a first-class message type; Automerge's future protocol builds an entire
storage format ("sedimentree") around the idea. Client-side compaction isn't a hack —
it's the pattern.

## Keys: where the actual difficulty lives

Everything above is, honestly, the easy part. AES-GCM via WebCrypto, a fresh nonce
per blob, the document ID and sequence number bound as associated data — an afternoon
of careful work using primitives your browser already ships. The hard questions are
all about the *key*:

**Where does it live?** The beautifully lazy answer — CryptPad's answer — is the URL
fragment: `https://app.example/doc/abc123#VGhlIGtleS4uLg`. Everything after `#` is
never sent to the server by the browser. Sharing the document *is* sharing the link;
the server routes `abc123` while the key rides invisibly behind it. The costs are
real: links leak (chat logs, browser history), and a lost link is a permanently lost
document — no "forgot password" flow can exist, because the server has nothing to
reset. It is, however, a perfect way to validate the architecture.

**How do you share it properly?** The grown-up version: each user has a keypair
generated in their browser. To add a collaborator, someone who holds the doc key
*wraps* (encrypts) it to the newcomer's public key and parks the wrapped copy on the
server. The server becomes a locksmith's pegboard — it hands out locked boxes and
decides *who may take one* (your normal permissions system, fully intact), but can
open none of them. Note what just happened, though: now the *user's private key*
needs a home, and multi-device sync, and a recovery story for people who will
absolutely clear their browser storage. **This — not the CRDT, not the cipher — is
where E2EE products go to die.** Budget accordingly.

**Can you un-share?** Only forwards. Removing a collaborator means rotating: new key,
fresh encrypted snapshot under it, re-wrap to the remaining members. The removed
person can't read anything new — but they keep everything they already saw, and no
protocol can fix that, because their copy of history already exists on their machine.
Revocation in E2EE systems is always "from now on," never "retroactively." Say so in
your product copy before your users discover it for you.

## What the server still knows

"End-to-end encrypted" is a statement about content, not about privacy in general.
Our blind server still observes:

| The server can't see | The server absolutely sees |
|---|---|
| Document content | Who you are (it authenticates you) |
| Edit contents | That the document exists, and who has access |
| — | When edits happen, how often, how large |
| — | Who opened what, from where |

Unbatched, blob timing even approximates typing rhythm — one reason to debounce
uploads beyond mere efficiency. Every serious E2EE product discloses this metadata
honestly; CryptPad's security page is a model of the genre.

## The costs nobody puts in the diagram

Two more truths belong in any honest treatment.

**Encryption deletes features.** A server that can't read documents can't index them
for search, can't feed them to your AI features, can't render previews, can't
publish them as public web pages. Every server-side capability you've built on
readable content stops working for encrypted documents. The pragmatic resolution is
to make encrypted docs a *separate, opt-in document class* — a private vault with
reduced amenities — rather than encrypting everything and gutting your product. This
is a product decision wearing a technical costume.

**The web platform sets your ceiling.** The server that can't read your documents is
the same server that delivers, on every page load, the JavaScript that handles your
keys. A malicious or compromised operator could ship code that quietly exfiltrates
them. CryptPad states this outright in its own docs — *"if you receive bogus code
from the server, you cannot establish any security"* — and mitigates with a two-origin
sandbox. The honest framing of browser-based E2EE: it protects against database
breaches, leaked backups, nosy insiders, and subpoenas of stored data. It does not
protect against an actively malicious operator or an XSS hole. That's still an
enormous upgrade over "trust us." It just isn't magic.

## Are you reinventing the wheel?

Know the landscape before you build:

- **CryptPad** — the existence proof. A full E2EE office suite, self-hostable, running
  this server-blind architecture in production for ~10 years (on its own OT-based
  engine, not a CRDT — Automerge actually simplifies its design by removing the
  server-ordering requirement).
- **secsync** — the closest thing to a reference implementation of this exact
  architecture for Automerge/Yjs. Beta software; read it as a spec even if you don't
  ship it as a dependency.
- **Keyhive + Beelay** (Ink & Switch / Automerge) — the future: MLS-style group key
  agreement with real revocation semantics, plus a sync protocol where the server is
  ciphertext-native. Pre-alpha as of 2026, with a do-not-use-in-production label.
  Design your key layer so you can swap it in later.
- **And if you don't need encryption at all** — stop; different aisle. Plain
  collaborative editing is a solved, productized problem (for ProseMirror/Tiptap
  editors, the Yjs ecosystem: Hocuspocus, Liveblocks, Tiptap Cloud). Reach for the
  encrypted-log architecture only when "our server cannot read your documents" is a
  promise your product actually needs to make.

## The takeaway

Can you build CryptPad-style encrypted collaboration on Automerge? **Yes** — and the
architecture is almost anticlimactic:

1. CRDT changes are opaque, order-tolerant blobs → encrypt them client-side.
2. Skip the smart sync server entirely → dumb numbered log of ciphertext.
3. Clients checkpoint with encrypted snapshots → cold-start and compaction solved.
4. Start with the key in the URL fragment → upgrade to wrapped keys when it's real.

The surprises live elsewhere: the official sync infrastructure is unusable *by
design*; the winning server is the dumbest one you can imagine; and the genuinely
hard engineering is key custody, recovery, and honest communication about what
encryption does and doesn't promise.

The cryptography, it turns out, is the easy part.

---

*Drafted from an internal feasibility investigation. Primary sources: the Automerge
binary format spec and API docs, the Beelay/sedimentree design documents, Ink &
Switch's Keyhive notebooks, CryptPad's developer and security documentation, and the
secsync specification.*
