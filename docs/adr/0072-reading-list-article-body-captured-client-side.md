---
status: accepted
---

# Reading-list article bodies are captured by the client that can see the page, normalised by the server

A page saved to the **Reading list** from the Chrome extension must be readable later inside Exponential (web or iPhone), which means its **Article body** has to be stored on the Resource, not fetched again at read time. We decided the *client that can see the page* captures the body (the extension runs a readability extraction against the live DOM and sends the article HTML as `rawContent`), and the *server* derives the markdown `content` and word count from it in `resource.create` whenever the caller omits `content`. A server-side URL fetcher is a later fallback for bare links saved from the web or phone, never the primary path.

## Considered options

- **Server fetches the URL.** Rejected as the primary path: it cannot see pages behind a login, paywall or client-side rendering, it needs an SSRF guard, a DOM library and a synchronous fetch inside a Vercel function, and it re-downloads what the user's browser already has.
- **Client sends only plain text or markdown.** Rejected: plain text is lossy and markdown produced in the extension would diverge from what the web and any future client produce. Keeping the HTML lets the phone reader show headings and images and lets the server re-derive text if the converter improves.

## Consequences

- Every client (extension, web Save link, a future iOS share extension, the later fetcher) gets identical derived text, because normalisation lives in one place.
- Saves carry up to about a megabyte of HTML; `resource.create` caps and rejects beyond that rather than truncating silently.
- Indexing into the Knowledge index stays an explicit choice at save time (D-0026); capturing the body does not imply embedding it.

Decisions D-0024 and D-0025 on the feature "Reading list: save in Chrome, read on iPhone".
