# muse.ai (now Skiv) technical teardown and open-source replication plan

Date: 2026-11-07. Unless noted, artefacts were observed on this date with plain GETs.

## Summary

1. **The product moved.** The video product at muse.ai is now **Skiv (skiv.com)**, rebranded 2026-03-03. muse.ai itself now serves Meta's unrelated "Muse" AI agent. Use skiv.com for all checks.
2. **The data model is largely public.** Unauthenticated per-video JSON endpoints expose word triples, labels with boxes, shots and sound spans. That is enough to design a compatible schema.
3. **In-player search is a literal, time-joined keyword index.** It has no stemming, prefix or fuzzy matching, and returns start times only, thinned to about one hit per 5 s. Semantic "Smart Search" is a separate opt-in index that is not publicly testable.
4. **Delivery is ordinary.** H.264/AAC single-file fMP4 is served as DASH and HLS through Shaka Player from OVH-hosted edge hosts. There is no sign of DRM.
5. **Models and vendors are not published.** The assistant was described as ChatGPT in archived pages until at least 2026-03-01; the current page names no vendor. Everything else about the models is unknown or inferred.
6. **Quality is not measurable from public data.** Public demo labels are all marked as human-curated (`q: 1`), so raw model output cannot be scored.
7. **Recommended stack:** FFmpeg + Shaka Packager + Vidstack/hls.js; Qwen3-ASR-1.7B + Qwen3-ForcedAligner + pyannote community-1; PP-OCRv6; PySceneDetect + Qwen3-VL-Embedding-2B + Qwen3.5-4B captions; YAMNet; Qwen3-Embedding/Reranker; OpenSearch; Qwen3.6-27B for Q&A.
8. **Estimated cost (not benchmarked):** roughly $0.3–$1.0 of compute per video hour for hosting plus speech indexing, and $0.5–$1.8 for the full index. Transcoding is the largest item in the speech-only case.
9. **Build order:** hosting and player, then speech search, then semantic and Q&A over transcripts, then visual, then OCR and sounds. Faces come last, behind a legal review.

Labels used throughout: **Confirmed** = a muse.ai/Skiv source or directly observed artefact. **Inferred** = reasoned from observed behaviour, with the reasoning given. **Unknown** = could not be determined.

### Access notes

- muse.ai now has a robots.txt notice from Meta prohibiting automated collection without written permission, and it disallows `ClaudeBot`. Before reading that notice I had made 3 GETs (homepage, robots.txt, sitemap). I made no further requests to muse.ai and used the Wayback Machine for its old pages.
- skiv.com's robots.txt allows all crawlers, but its [terms](https://skiv.com/terms) (section 3) restrict data mining, harvesting and extraction, and republishing site material. I limited this work to public docs, public JS read as text, and a few dozen GETs against 3 demo video IDs named in its docs, plus a few collection and channel searches. Take legal advice before any systematic benchmarking against Skiv, and build clean-room: do not copy its player code or docs.
- No account, uploads or write requests were used, so nothing behind login was observed.

---

# Part 1: how muse.ai / Skiv works

## 1.1 Identity and status

| Claim | Label | Evidence |
|---|---|---|
| muse.ai rebranded to Skiv on 2026-03-03; building since 2018; legacy embed deadline 2026-03-10; redirects were transitional | Confirmed | [rebrand post](https://skiv.com/blog/muse-ai-is-now-skiv), [migration guide](https://skiv.com/blog/migration-guide) |
| Legal entity is Musai Inc, under California law | Confirmed | [terms](https://skiv.com/terms) |
| muse.ai now belongs to Meta and serves its Muse agent | Confirmed | whois registrant Meta Platforms (updated 2026-08-19), `*.ns.facebook.com` nameservers, page title observed 2026-11-07 |
| The transfer happened between 2026-07-12 and 2026-09-10 | Inferred | Wayback's `muse.ai/about` capture of 2026-07-12 still shows Skiv; its `muse.ai/support` capture of 2026-09-10 carries Meta AI page metadata. Whois was last updated 2026-08-19. A [third-party article](https://www.getaiperks.com/en/ai/meta-muse-vs-muse-ai-skiv) agrees on the handover but gives no date |
| Small team; ML in PyTorch; player and UI in vanilla JS | Confirmed | [careers page](https://skiv.com/opportunities) |
| Antonio Roldao is CEO; Rimvydas Naktinis is CTO | Third-party only | [Product Hunt](https://www.producthunt.com/products/muse-ai/makers); not stated on Skiv's own pages that I read |
| Published patents, papers or engineering talks | Unknown | Searches found none. No patent database was queried directly, so this is not proof of absence |

Consequence: old `muse.ai/embed/...` links now reach a different company.

## 1.2 Indexing pipeline

| Modality | What Skiv says it extracts | Observed shape | Label |
|---|---|---|---|
| Speech | Transcript synced to words | `[[start, end, "word"], ...]`, with separate punctuation and `"\n"` tokens | Confirmed |
| Speakers | Marketing says speakers are identified ([AI page](https://skiv.com/video-artificial-intelligence)) | No speaker field in the public speech JSON | Claim confirmed; output not observed |
| Translation | Subtitles auto-translated; the player page claims 50+ languages; the embed option lists Chinese, French, German, Portuguese and Spanish ([docs](https://skiv.com/docs)) | `language: null` on all 3 demos | Confirmed claim; actual language list unclear |
| OCR | Text on screen | `{"text": [{s, e, x, y, w, h, q, i: "crop_<t>_<x>_<y>_<w>_<h>.jpg"}]}` | Confirmed |
| Objects | Boxed labels | `{"label": [{s, e, x, y, w, h, q}]}` | Confirmed |
| Faces | Clustered and labelled faces | `{"name": [[s, e, {x, y, w, h}, q], ...]}`; the API documents cluster IDs and a per-account face DB (`/faces/db`, `/faces/modify`) | Confirmed |
| Actions | Actions, marked Beta on the [tools page](https://skiv.com/tools) | `{"label": [{s, e, q}]}` | Confirmed |
| Sounds | Docs list speech, music, applause, laughter, silence | `{"label": [[s, e], ...]}`. Observed labels go beyond the docs: `rain`, `water`, `crackle`, `alarm`, `noise`, `wind` | Confirmed |
| Shots | Scene boundaries | `[[[s, e]], ...]`, documented as clusters. All 128 entries across two demos were singletons | Confirmed |
| Colours, sentiment, concepts | Standalone APIs: `/colors`, `/sense`, `/concepts` | Concept math such as `princess -prince +king` returning `queen 0.77` ([API](https://skiv.com/api)) | Confirmed |

Observed index endpoints, all readable without a key for public demos (2026-11-07):

```text
GET https://skiv.com/api/files/i/{speech|objects|scenes|sounds|text|actions|faces}/VBdrD8v

speech : [[11,11.49,"Thank"],[11.49,11.59,"you"],[11.59,11.76,"."],[11.76,11.76,"\n"]]
objects: {"flag":[{"e":1083.85,"h":0.9076,"q":1,"s":867.48,"w":0.0826,"x":0.1189,"y":0}]}
text   : {"president":[{"e":862.87,"h":0.1869,"i":"crop_748.004_0.262_0.656_0.074_0.187.jpg",
                        "q":1,"s":748,"w":0.0738,"x":0.2615,"y":0.6562}]}
faces  : {"John F Kennedy":[[199.0,200.25,{"h":0.14,"w":0.08,"x":0.48,"y":0.23},1.0]]}
actions: {"clapping":[{"e":1093.25,"q":1,"s":1092.62}]}
sounds : {"applause":[[2.88,3.84],[258.24,261.6]]}
scenes : [[[0,9.98]],[[9.98,17.82]]]
```

The documented meaning of `q` is 1 for human-curated and 0.5 for automatic ([API](https://skiv.com/api)). Every label I sampled on the two labelled demos has `q: 1`, so **public demos do not show raw model quality**. Noise remains anyway: OCR labels on `FTBViRx` include `ane`, `conection` and `halicarnassus`.

Inferences from the timing:

| Inference | Label | Reasoning |
|---|---|---|
| Sound tagging uses an AudioSet-style classifier with a 0.48 s hop | Inferred | All 466 sound boundaries across two demos (162 + 304) are exact multiples of 0.48 s. That matches [YAMNet's framing](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) of 0.96 s windows at 50% overlap, and the labels look AudioSet-like. VGGish shares this framing, so the exact model is not established |
| Sound output has clear false positives | Inferred | `rain` and `water` spans sit around applause in the JFK speech demo |
| Actions come from a sliding clip classifier with a hop near 0.67 s | Inferred | Span durations cluster at 0.63, 1.29 and 1.96 s, which differ by about 0.667 s |
| Objects are sampled per shot rather than on a fixed grid | Inferred | The most common object start offset is 1.0 s after a shot start (69/164 and 205/289). Very short 0.57 s shots show about 0.29 s, close to the midpoint. Curated data may distort this |
| Speech combines ASR with forced alignment | Inferred | The public `/align` API returns the same `[start, end, word]` shape as the index |
| 1 fps frames are retained | Confirmed for one video | `thumbnails/00616.jpg` and `00617.jpg` both exist, and the player builds these paths |
| Pipeline stages | Confirmed in outline | Audio and visual are split and processed separately, then combined into concepts ([AI page](https://skiv.com/video-artificial-intelligence)) |
| Staged availability | Confirmed in JS | `ingest_video` 0 = transcoding (player polls every 7 s), 1 = `video.mp4`, 2 = adaptive |

Unknown or unpublished:

- **Model names** for ASR, OCR, detection, faces and actions.
- **Processing time.** The only related language is marketing about sharing in minutes. It could not be measured without an upload.
- **Accuracy figures.** None are published. Skiv's own [university post](https://skiv.com/blog/transforming-university-education-with-ai-video-search) advises reviewing names and technical terms before publishing captions.
- **Source-language ASR coverage.** An archived [Jan 2026 page](https://web.archive.org/web/20260129114933/https://muse.ai/video-audio-transcription) described automatic English transcripts; current pages describe translation. Which languages are transcribed natively is not stated.
- **Re-indexing.** The [SEO post](https://skiv.com/blog/video-search-optimization) shows `two thousand eleven` where today's API returns `2011` for the same 2020 video, so transcripts were re-generated or edited at some point. Which of those is unknown.

## 1.3 Search experience

**Scope** (Confirmed, [API](https://skiv.com/api) and [docs](https://skiv.com/docs)): owned library, channel, public collection, or public video.

```text
GET /api/search?q=            (key required)
GET /api/search/channel/{id}?q=
GET /api/search/collection/{id}?q=
GET /api/search/video/{id}?q=
Response: [["8KsbyKv", [1.23, 3.45]]]    // [video id, [start seconds, ...]]
```

Filters: `s:` speech, `f:` faces, `t:` text, `o:` objects, `a:` actions, `z:` sounds, `n:` title, `d:` description.

No scores, snippets or matched modality are returned. The player's in-video search calls `search.skiv.com/api/search/video/{svid}` with `credentials: include`, draws the returned times on the timeline, and seeks ([player JS](https://skiv.com/static/js/embed-player.min.js)).

Black-box tests of the keyword path on demo `VBdrD8v` (Confirmed observations; the conclusions in the last column are Inferred):

| Query | Result | Conclusion |
|---|---|---|
| `rocket` / `Rocket` | 616.61, 633.36, 934.22 | Case-insensitive; times equal word starts |
| `rockets` | none (transcript contains only `rocket`) | No stemming |
| `rock`, `rockett` | none | No prefix or fuzzy match |
| `spacecraft launch vehicle` | none (`launch` and `vehicle` absent) | All terms required; no semantic fallback |
| `the` | hits, thinned out | No stop-word removal. Of 123 occurrences, a new hit appears only more than about 5 s after the previous hit |
| `kennedy`, `applause` | face and sound spans | Bare terms search every modality |
| `FTBViRx`: `rocket` vs `s:rocket` and `o:rocket` | near-union of the two | Modalities are unioned, then thinned |
| `rocket moon` | none | Terms must co-occur in a short window |
| `s:rocket o:flag` | 934.22 only | Cross-modal **temporal AND**: the flag label spans 867–1084 s |
| `s:moon f:kennedy` | 554.88 only | Same, with a tolerance of about 5 s against a face at 559.07 |
| `choose moon` | includes 527.71 (`moon` before `choose`) | Word order is not enforced |
| `go to the moon` | 541.03, 554.31 | 541.03 matches no public token start, so the search index is not identical to the public word list |
| Channel `moon` | videos in ASCII ID order in the first 7 results | Public API does not appear to rank by relevance. The app's own ranking, which [marketing claims](https://skiv.com/search-inside-video), is Unknown |

**Smart Search** (Confirmed, [docs](https://skiv.com/docs) and [post](https://skiv.com/blog/smart-video-search)):

- It is a separate mode and must be enabled in Preferences. It is built by an initial indexing job with an email on completion, and runs across the library in Studio view.
- It covers two indexes, transcript and visual scenes, which users can toggle.
- Skiv itself recommends running both keyword and semantic searches when recall matters.
- It accepts plain questions and scene descriptions. The [archived post](https://web.archive.org/web/20260211091418/https://muse.ai/blog/smart-video-search) describes speech and sequences of frames feeding an index of meaning.

Inferred: per-account opt-in plus a backfill email suggests a separate, costlier index built after normal ingest. **Unknown:** embedding models, vector store, fusion method, and whether the visual side embeds frames, captions or both. The current post's mention of matching a scene description hints at text descriptions but does not settle it.

**Q&A** (Confirmed): the [homepage](https://skiv.com/) and [pricing](https://skiv.com/pricing) describe a paid add-on that answers questions with timestamps across a library. The assistant sends transcript and metadata to a generative model ([post](https://skiv.com/blog/ai-assistant)). The [archived version](https://web.archive.org/web/20260301115152/https://muse.ai/blog/ai-assistant) names ChatGPT; the current version names no vendor. **Current vendor: Unknown.**

**Deep links:** the player builds `/v/{svid}?t={seconds}` ([JS](https://skiv.com/static/js/embed-player.min.js)). Embeds take `start`. Both Confirmed.

## 1.4 Player and delivery

| Topic | Finding | Label |
|---|---|---|
| Embed | `<div class="skiv-video-player" data-video="ID">` + `embed-player.min.js`; iframe `/embed/ID?start=&volume=`; `SkivPlayer({...})`; oEmbed; `muse-*` classes still supported ([docs](https://skiv.com/docs)) | Confirmed |
| JS API | `play`, `pause`, `seek`, `search(query, seek)`, `setVideo`, `setSpeed`, `setVolume`; events `play`, `pause`, `ended`, `metadata`, `timeupdate`, `search`, `speed` | Confirmed |
| Index on page | `.skiv-video-data` with `data-content` = `description`, `speech`, `objects`, `scenes`, `sounds`, `text`, `actions`; JSON-LD markup for SEO | Confirmed |
| Streaming engine | Bundled `shaka.Player`; bundle contains `v4.7.1-main-8-g8649e7ebb`, likely the Shaka version. DASH by default, native HLS on Safari/iOS, MP4 fallback | Confirmed in JS (version Inferred) |
| Shaka settings | `bufferingGoal: 30`, `rebufferingGoal: 2`, `bufferBehind: 30`, `defaultBandwidthEstimate: 5.5e6` | Confirmed in JS |
| Codecs | H.264 High and AAC-LC stereo in the sampled manifests; AV1/VP9 strings in the bundle come from Shaka | Confirmed for 2 videos |
| 720p source ladder | 240p/360p/720p at peak 658k/915k/1853k video; AAC 96k and 196k | Confirmed |
| 4K source ladder | 240p/360p/720p/1080p/2160p at 378k/594k/1490k/2987k/11369k | Confirmed |
| Encoding mode | Bitrate differs per title at the same rung, so encoding is not fixed-ladder CBR | Inferred |
| Packaging | One fMP4 per rendition, DASH `SegmentBase` on-demand profile, HLS v6 `EXT-X-MAP` + `EXT-X-BYTERANGE` over the same files | Confirmed |
| Segment length | HLS segments of 4–6 s in steps of 2 s, suggesting a 2 s GOP; sidx size implies about 5 s average | Inferred |
| Packager | Not identified; there is no generator comment in the MPD | Unknown |
| Previews | `videos/video-xs.mp4` (2.4 MB for 18 min) drives the seek preview; also `thumbnails/video.jpg` | Confirmed |
| Subtitles | SRT/VTT upload; auto WebVTT at `/api/files/subtitles/{id}/auto`. The player also builds subtitles client-side from word triples | Confirmed |
| Chapters | Parsed from `0:00 Title` lines in the description, minimum 8 s each ([docs](https://skiv.com/docs)). AI drafts are editable | Confirmed |
| Analytics | Heartbeats to `/api/files/view/{id}` (about every 30 s) and action spans to `metrics.{domain}/api/metrics/view/{id}`; `trackViews` option. Dashboard shows views, watch time, countries, bandwidth | Confirmed in JS; on the default domain the metrics call is skipped |
| Ads | VAST/VPAID/VMAP via Google IMA, on Pro and above | Confirmed |
| Access controls | Private, hidden, unlisted, password, public; domain restrictions; expiring links and geo-blocks on Plus and above | Confirmed |
| DRM | Not marketed; no key system configured in the player's `configure` calls. Shaka's DRM code is present but appears unused | Inferred: none |
| URL signing | Public CDN URLs carry `?v=<n>:<unix-now>`, with no visible signature. Private-video behaviour not tested | Observed for public only; otherwise Unknown |

## 1.5 Public API

**Auth** (Confirmed, [API](https://skiv.com/api)): `Key` header. Keys come from Settings or `POST /api/auth/login` (`email`, `passwd`).

**Hosts** (Confirmed): `skiv.com/api/files/*` for library, `api.skiv.com` for AI jobs, `search.`, `metrics.`, `auth.`, `pay.`, `cdn.` ([`/config.js`](https://skiv.com/config.js)).

**Job flow** (Confirmed): `POST /{tool}` returns `{id}`; `GET /{tool}/{id}` returns `pending`, `done` or `error`; results are retained 1 hour. Errors include 402 (out of credits) and 429.

**Video record** (Confirmed, public GET of [a demo](https://skiv.com/api/files/videos/VBdrD8v), abridged):

```json
{"svid":"VBdrD8v","fid":"9329b75e...932cb3","filename":"President_Kennedys_Speech_at_Rice_University.mp4",
 "duration":1095.31,"width":1280,"height":720,"size":254200868,"tcreated":1590495699,
 "ingest_video":2,"ingesting":false,"language":null,"license":"owned","mature":false,"media":"video",
 "subtitles":1,"views":1858,"twatched":413576,"visibility":"public",
 "url":"https://cdn.skiv.com/u/Bhkfhyt/9329b75e...932cb3/data?v=19:1794038569"}
```

The embed page's copy adds `regions: ["eu","na"]`, `owner_*` and `download` ([embed](https://skiv.com/embed/VBdrD8v)). `fid` is 64 hex characters and likely a SHA-256 content hash (Inferred).

| Endpoint group | Details | Limits |
|---|---|---|
| Upload | `POST /api/files/upload` multipart; query `collection`, `visibility` | The app accepts URL imports and resumes uploads; the API mechanism for resuming is not documented |
| Clips | `POST /api/files/cut` (`svid`, `start`, `end`) | |
| Update/delete | `POST /api/files/set/{fid}`, including `domains`; `DELETE /api/files/delete/{fid}` | |
| Subtitles | `/api/files/subtitles/{svid}[/{id}]` | SRT, VTT |
| Collections | `/api/files/collections[...]`; nested via `path` | |
| Speech, Sounds | `POST api.skiv.com/speech`, `/sounds` | 5 GB, 5 h |
| Align | `POST /align` with `phrase` | 50 MB, 1 min |
| Faces, Scenes | `/faces`, `/scenes` | 5 GB; Scenes 5 h |
| Actions | `/actions` | 5 GB, 1 h |
| Objects, Text, Colors | Image input | Objects 5 GB; Text and Colors 50 MB |

**Webhooks:** not documented; "webhook" appears nowhere in the API or docs text. [Integrations](https://skiv.com/integrations) lists a Zapier trigger on upload, so some internal event exists (Inferred).

**Doc errors worth knowing:** box semantics conflict. The docs say `x, y` are box centres, while the OCR crop filenames and values look like top-left (Inferred). The `/faces` samples also carry `/sounds` code.

## 1.6 Observable infrastructure

| Finding | Label | Evidence |
|---|---|---|
| Edge and API hosts sit on OVH (FR/CA ranges and OVH org records) | Confirmed for hosts checked | whois on `skiv.com`, `cdn`, `cdn-eu`, `cdn-na`, `search`, `metrics`, `auth`. Two IP ranges returned a generic RIPE record, so their org was not directly confirmed |
| Probably not a commercial CDN | Inferred | PTRs such as `e35.skiv.com`, `n19.skiv.com`; no vendor headers; `Server` stripped; nginx-style ETag `6a9ffb2c-9cddc`; custom `x-cache: MISS` |
| Regional hosts plus GeoDNS | Inferred | `cdn-eu` and `cdn-na` resolve; other regional names tried did not. `cdn.skiv.com` answers vary by EDNS client subnet. Player fails over `cdn-<region>` → `cdn` → others |
| Own nameservers | Confirmed | `ns1–3.sciv.com` |
| Google Workspace, SendGrid mail | Confirmed | MX and SPF |
| GA4 and Intercom on marketing pages; none in the embed page | Confirmed | `G-S9Q9QN5EN6`, Intercom widget; `embed.html` has no match |
| Subprocessors | Unknown | [Privacy policy](https://skiv.com/privacy) mentions third parties without naming them |
| Search engine, datastore, queue, GPU provider | Unknown | Not exposed |
| On-premise offering | Confirmed | Enterprise row on [pricing](https://skiv.com/pricing) |

## 1.7 Product surface that shapes architecture

| Area | Finding |
|---|---|
| Pricing (billed yearly) | Basic $8, 80 GB; Plus $20, 200 GB; Pro $50, 1 TB; Enterprise custom. Search, indexing and API on all plans; translation from Plus; assistant is an add-on ([pricing](https://skiv.com/pricing)) |
| Economics | Indexing is bundled per GB, not per minute. Unlimited bandwidth is subject to fair use ([docs](https://skiv.com/docs)). Inferred: a low per-hour index cost, or light models |
| Human correction | Every label is editable with a timeline editor ([docs](https://skiv.com/docs)). Labels need provenance and re-indexing on edit |
| Collections, channels, portals | Nested collections with independent visibility; portals with tiers, 5% + 2.9% + $0.30 fees ([portals](https://skiv.com/tryportals)) |
| Other | Browser recorder, clip tool, Zoom via Zapier, WordPress plugin |

---

# Part 2: replicating it with open-source models

"Vendor-published" means the benchmark comes from the model's owner and has not been independently checked here. Licences were read from Hugging Face or GitHub metadata and files on 2026-11-07. **VRAM figures marked "est." are my estimates; the model cards do not state them.** No benchmarks were run.

## 2.1 Recommended stack

| Capability | Primary | Licence | Hardware | Published numbers | Alternative and reason |
|---|---|---|---|---|---|
| Speech-to-text | [Qwen3-ASR-1.7B](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) | Apache-2.0 | Est. 8 GB VRAM | Vendor: TEDLium 4.50 and VoxPopuli 9.15, vs Whisper large-v3 6.84 and 12.05. 30 languages + 22 Chinese dialects. [Secondary source](https://pinggy.io/blog/best_open_source_self_hosted_speech_to_text_models/) reports 5.40 average WER, RTFx 819, on Open ASR; not confirmed on the leaderboard | [Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) (CC-BY-4.0): native word timestamps and very fast, but 25 European languages. Card: 2 GB RAM minimum; up to 3 h with local attention |
| Word timestamps | [Qwen3-ForcedAligner-0.6B](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) | Apache-2.0 | Est. 4 GB VRAM | Vendor: English error 37.5 ms vs WhisperX 92.1. **Only 11 languages and up to 5 min per call**, so chunk it | Parakeet timestamps, for covered languages |
| Diarization | [pyannote community-1](https://huggingface.co/pyannote/speaker-diarization-community-1) | CC-BY-4.0; gated, needs HF token | GPU; no minimum stated | [Repo](https://github.com/pyannote/pyannote-audio): DER 11.2 VoxConverse, 17.0 AMI IHM; 31 s/hour on H100 | [Sortformer 4-speaker v2](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2) (CC-BY-4.0, licence only checked): 4-speaker model |
| OCR | [PP-OCRv6 medium](https://github.com/PaddlePaddle/PaddleOCR) | Apache-2.0 | GPU or CPU (OpenVINO speedup claimed) | Vendor: +4.6% detection and +5.1% recognition over v5 server; 0.13 s on A100; 50 languages in one model | [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6) (Apache-2.0): better for slides and tables, slower. Its 96.33% OmniDocBench score is on documents, not video |
| Shots | [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | BSD-3 | CPU | No benchmark verified | [TransNetV2](https://github.com/soCzech/TransNetV2) (MIT): F1 77.9 ClipShots, 96.2 BBC, 93.9 RAI; better for dissolves, but last pushed 2023 |
| Visual embeddings | [Qwen3-VL-Embedding-2B](https://huggingface.co/Qwen/Qwen3-VL-Embedding-2B) | Apache-2.0 | Est. 6–8 GB VRAM | Vendor on MMEB-V2: video overall about 61–62, moment retrieval about 52–53 (tables differ slightly). 8B: about 66–67. Dimensions 64–2048. Defaults 1 fps, 64 frames ([repo](https://github.com/QwenLM/Qwen3-VL-Embedding)) | [SigLIP 2](https://huggingface.co/google/siglip2-giant-opt-patch16-384) (Apache-2.0): cheaper keyframe-only retrieval, no temporal signal |
| Captions and tags | [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) | Apache-2.0 | Est. 8–10 GB VRAM | Vendor (in [Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B)): VideoMME without subtitles 76.9 (4B), 78.4 (9B) | [Molmo2-8B](https://huggingface.co/allenai/Molmo2-8B) (Apache-2.0 weights; check dataset terms): [paper](https://arxiv.org/abs/2601.10611) reports strong video captioning |
| Audio events | [YAMNet](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) | Apache-2.0 | CPU | 521 classes; 0.96 s windows, 50% overlap | [AST AudioSet](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593) (BSD-3): heavier, usually more accurate |
| Objects (optional) | [RF-DETR Large](https://github.com/roboflow/rf-detr) | Apache-2.0 | GPU | COCO AP50:95 56.5; latency 6.8 ms as published | [OWLv2](https://huggingface.co/google/owlv2-base-patch16-ensemble) (Apache-2.0): open vocabulary, closer to Skiv's claimed thousands of categories |
| Faces (optional) | [YuNet + SFace](https://github.com/opencv/opencv_zoo) | Repo Apache-2.0; check per-model files | CPU or GPU | Third-party note: 128-d embedding | [AdaFace](https://github.com/mk-minchul/AdaFace) (code MIT; check weights and training-data terms) |
| Actions (optional) | Tags from the caption model | As above | As above | Not evaluated for this task | [V-JEPA 2](https://huggingface.co/facebook/vjepa2-vitl-fpc64-256) (MIT) with a trained classifier head |
| Text embeddings | [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | Apache-2.0 | Small GPU; est. 2–4 GB | 100+ languages; dimensions 32–1024; no benchmark figure verified here | [BGE-M3](https://huggingface.co/BAAI/bge-m3) (MIT): also yields sparse vectors |
| Reranking | [Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B); visual: [Qwen3-VL-Reranker-2B](https://huggingface.co/Qwen/Qwen3-VL-Reranker-2B) | Apache-2.0 | Small GPU | VL-2B: video retrieval 53.2 (vendor) | [bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) (Apache-2.0) |
| Hybrid search | [OpenSearch](https://github.com/opensearch-project/OpenSearch) | Apache-2.0 | Separate cluster | [Hybrid query](https://docs.opensearch.org/latest/query-dsl/compound/hybrid/) combines up to 5 clauses via normalization or score-ranker processors | Postgres + [pgvector](https://github.com/pgvector/pgvector) + [pg_search](https://github.com/paradedb/paradedb) (AGPL-3.0): fine for an MVP with one datastore |
| Q&A | [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B) | Apache-2.0 | Est. 16–24 GB VRAM quantized | 262k context | [gpt-oss-20B](https://huggingface.co/openai/gpt-oss-20B) (Apache-2.0): smaller, with less context |
| Transcode and package | [FFmpeg](https://www.ffmpeg.org/legal.html) + [Shaka Packager](https://github.com/shaka-project/shaka-packager) | LGPL, or GPL with libx264; BSD | CPU, or NVENC | Mirrors Skiv's single-file fMP4 approach | [Bento4](https://github.com/axiomatic-systems/Bento4): read its licence first, as GitHub reports none detected |
| Player | [Vidstack](https://github.com/vidstack/player) + [hls.js](https://github.com/video-dev/hls.js) | MIT; Apache-2.0 | Browser | N/A | [Shaka Player](https://github.com/shaka-project/shaka-player) (Apache-2.0): what Skiv uses; choose it if DASH or DRM is needed |
| Upload | [tusd](https://github.com/tus/tusd) | MIT | Small service | Resumable protocol | Direct multipart upload to object storage |

Whisper large-v3 remains a useful fallback for languages outside Qwen3-ASR's list (listed as 100+ languages by a [secondary source](https://www.sevenlabs.site/blogs/best-open-source-speech-to-text-models-2026)). The [card metadata](https://huggingface.co/openai/whisper-large-v3) says Apache-2.0, while secondary sources say MIT, so read the licence file.

## 2.2 Licence traps

| Trap | Status | Action |
|---|---|---|
| [InsightFace](https://github.com/deepinsight/insightface) model packs (`buffalo_l` etc.) | Code MIT; models non-commercial research only | Do not ship without a commercial licence |
| [jina-clip-v2](https://huggingface.co/jinaai/jina-clip-v2), [jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3), [jina-reranker-v3](https://huggingface.co/jinaai/jina-reranker-v3) | CC-BY-NC-4.0 | Avoid in commercial use |
| [VideoMAE](https://huggingface.co/MCG-NJU/videomae-base) | CC-BY-NC-4.0 | Avoid |
| [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) | AGPL-3.0, network clause | Use RF-DETR or buy a licence |
| RF-DETR XL, 2XL, Atto, Femto, Pico | PML 1.0, not Apache | Stay on Nano to Large unless PML terms are acceptable |
| [SAM 3](https://huggingface.co/facebook/sam3) | Custom licence, manual gate | Read before use |
| [EmbeddingGemma](https://huggingface.co/google/embeddinggemma-300m) | Gemma terms, manual gate | Not needed here |
| [pg_search](https://github.com/paradedb/paradedb), [VectorChord](https://github.com/tensorchord/VectorChord) | AGPL-3.0; VectorChord AGPL or ELv2 | Get legal sign-off |
| Kimi K2.6 | Modified MIT | Read the terms |
| FFmpeg with libx264 | GPL applies to that build | Matters if you distribute binaries; H.264 patent licensing is a separate question |
| Gated weights (pyannote, Cohere Transcribe) | Accept conditions per account | Mirror internally only if the terms allow it |
| CC-BY models (Parakeet, pyannote) | Attribution required | Add to notices |
| Biometric data | Face clustering can trigger laws such as BIPA and GDPR | Legal review before building; not legal advice |

## 2.3 Target architecture

```text
INGEST    tusd -> object storage (original) -> job record -> durable workflow (Temporal or Hatchet)

PROCESS   CPU pool  : probe -> mezzanine -> H.264/AAC ladder -> fMP4 -> HLS (and DASH)
                      thumbnails 1 fps, scrub proxy, audio extract, shot detection
          GPU pool  : ASR -> alignment -> diarization -> punctuation tokens
                      keyframes -> near-duplicate gate -> OCR -> merge text tracks
                      shot chunks -> visual embeddings; captions/tags
          CPU       : audio-event tagging -> merge spans
          Each step is idempotent and writes versioned JSON artefacts to storage

INDEX     segments -> Postgres (source of truth) -> OpenSearch (BM25 + vectors)
          Edits write a new segment version with source=human, then partial re-index

SERVE     Web/API: metadata, signed URLs, search, RAG
          Query parser: s: f: t: o: a: z: n: d:
          Keyword: per-modality search -> time-join -> ~5 s hit thinning
          Semantic: BM25 + transcript vectors + visual vectors -> RRF -> reranker
          Player: HLS via CDN; timeline markers; ?t= deep links; WebVTT
          Q&A: top segments -> LLM -> [mm:ss] citations validated against segments
```

Design rules taken from Part 1:

- Publish media as soon as the first MP4 is ready, as Skiv's `ingest_video` stages do, and index asynchronously.
- Sample keyframes per shot at about min(1 s, midpoint), and retain 1 fps thumbnails. Split long shots into chunks of about 8–16 s for visual embedding.
- Gate OCR with a frame-difference check, then merge identical strings across time into one span, as Skiv's long `text` spans suggest.
- Treat the temporal join as an application-level operation; engines will not do it natively. Fetch hits per modality, sort by time, and intersect with a ±5 s tolerance.

## 2.4 Data model for time-aligned segments

Sketch only, Postgres-flavoured, not a proposed migration:

```sql
video(id, owner_id, content_hash, duration_ms, width, height, language, visibility,
      ingest_stage, index_version, created_at)

video_words(video_id, version, words_uri)   -- [[start,end,"word",speaker?],...] as one object,
                                            -- like Skiv's speech JSON (55 KB for 18 min)

shot(id, video_id, start_ms, end_ms, keyframe_ms, cluster_id)

segment(
  id, video_id, version,
  modality,          -- speech|ocr|object|face|action|sound|caption|title|description
  start_ms, end_ms,
  text,              -- chunk text, OCR string, label, or caption
  bbox,              -- {x,y,w,h} normalised, with a declared origin
  speaker_id, entity_id, shot_id, language,
  confidence,        -- model score, which Skiv's public q does not expose
  source,            -- model|human
  model_id, model_version,
  crop_uri,
  embedding_id, superseded_by, created_at
)

embedding(id, segment_id, space, dim, vector)  -- e.g. space=text:qwen3-0.6b:1024

entity(id, owner_id, kind, label, embedding)   -- faces and speakers, with deleted/ignored state,
                                               -- following Skiv's /faces/db

collection(id, owner_id, parent_id, visibility) ; collection_video(collection_id, video_id, added_at)
```

Speech is stored at two grains: words for player highlighting, and overlapping chunks of about 30–60 s with sentence-aware cuts for retrieval. Keep `space` on vectors so models can change without a schema change. Declare the bbox origin once; Skiv's docs and observed values disagree.

## 2.5 Rough cost per hour of video

**Assumptions, all mine and none measured:** 1 h of 1080p30, about 200 shots; 1 RTX-4090-class GPU at $0.34–$0.89/h ([RunPod community and secure rates per a third-party page](https://www.promptquorum.com/prompt-bites/cloud-gpu-cost-per-hour), updated 2026-10-17); 16 vCPU at $0.30–$0.60/h (assumed); software x264 at a medium-to-fast preset. Reference points: Skiv's actual shot counts were 104 for a 62-min and 24 for an 18-min video.

| Step | Resource | Est. minutes | Basis |
|---|---|---|---|
| Transcode 4 rungs + audio | 16 vCPU | 60–90 | Assumption |
| Frames, shots | CPU | 5–10 | Assumption |
| ASR + alignment | GPU | 3–6 | Conservative against reported RTFx 819 |
| Diarization | GPU | 1–2 | 31 s on H100 (published) |
| OCR on 1,000–2,000 frames | GPU | 2–5 | 0.13 s per image (vendor) |
| Visual embeddings | GPU | 5–15 | Assumed 1–2 chunks/s; **test this first** |
| Captions, 200 shots | GPU | 10–20 | Assumed batching |
| Sound tags, text embeddings | CPU/GPU | 1–2 | Assumption |

| Scope | GPU min | GPU $ | CPU $ | Total compute |
|---|---|---|---|---|
| Transcode + speech only (MVP) | 5–9 | $0.03–$0.13 | $0.30–$0.90 | **about $0.3–$1.0** |
| Transcode + full index | 22–50 | $0.12–$0.74 | $0.33–$1.00 | **about $0.5–$1.8** |

Storage: ladder about 2.5 GB/h (at the bitrates observed in §1.4), source 1–4 GB, 1 fps thumbnails about 60 MB, for about 3.5–6.5 GB/h. At [R2 pricing](https://developers.cloudflare.com/r2/pricing/) of $0.015/GB-month with free egress, that is about $0.05–$0.10 per video hour per month. Check your CDN's terms for video at volume. Index data is about 10–20 MB/h and small by comparison.

Not included: idle GPU time, retries, OpenSearch nodes, Q&A inference, and engineering. Hardware encoding cuts transcode cost substantially at some quality cost. As a buy-versus-build reference, a third-party tracker lists Twelve Labs Marengo indexing at [$2.50/h through Sep 2026](https://usagepricing.com/blueprint/twelve-labs), then bundled into storage pricing from 2026-10-15. Check Twelve Labs directly before relying on this.

## 2.6 MVP-first build order

| Phase | Build | Exit test |
|---|---|---|
| 0 | Upload, transcode, HLS, player, `?t=` links, access control | Plays on iOS, Android, desktop; seek accurate within 1 s |
| 1 | ASR, alignment, subtitles, clickable transcript, in-video and library BM25 with timeline markers | WER and quote-search targets on the eval set |
| 2 | Transcript embeddings, hybrid + rerank, cited Q&A | Beats BM25 on paraphrase queries; citations resolve to real segments |
| 3 | Shots, visual embeddings, captions | Visual-query Hit@5 target; GPU cost within budget |
| 4 | OCR, sound tags, prefix filters, temporal join | Slide and on-screen text queries work; acceptable false-positive rate |
| 5 | Human correction, partial re-index, diarization UI, translation | Edits are searchable within a minute |
| 6 | Objects, actions, faces (after legal review), concept expansion | Only if evaluation or customers justify it |

## 2.7 Where open source may fall short

| Area | Assessment | Label |
|---|---|---|
| Named-face recognition | Permissive stacks are weaker, and the best-known packs are non-commercial; a per-account labelled DB closes part of the gap | Inferred |
| Long-tail ASR, word timing outside 11 languages | Aligner coverage is a real gap; expect coarser timestamps there | Confirmed gap for this stack |
| Large label vocabularies | COCO-trained detectors have 80 classes; VLM tags are broader but less consistent, and have no boxes | Inferred |
| Purpose-trained actions and sounds | Skiv recruits for proprietary dataset training; open models need tuning | Inferred from [careers](https://skiv.com/opportunities) and archived careers text |
| Curated corrections | Skiv's demos show labour on labels, which is not a model advantage | Inferred |
| Absolute quality vs Skiv | **Cannot be assessed.** No published accuracy, public labels are curated, and Smart Search and the assistant need an account | Unknown |
| Possible advantages of a new stack | Modern ASR and multimodal embeddings; Skiv's public sound and OCR output shows visible noise even in curated demos. Whether this applies to its current models is unknown | Inferred, weak |

## 2.8 Small evaluation approach

**Corpus:** 30–50 h with rights cleared, split across lectures, meetings, product demos, news or conference video, and at least one non-English set.

**Queries:** 200–300, labelled before tuning, about 40 per class: exact quote, paraphrase/question, visual description, on-screen text, sound or action, cross-video.

**Metrics:**

- Retrieval: a hit counts if its time falls within ±5 s of a labelled moment. Report Hit@1, Hit@5, MRR and nDCG@10 per class, with temporal IoU for range results.
- Components: WER on 2–3 h of hand transcripts; word-time error; DER; OCR character error on sampled frames; shot-boundary F1.
- Operations: seconds and dollars per video hour by step, p95 query latency, index size.

**Method:** run BM25-only first as the baseline, then add one component at a time and keep it only if its query class improves without hurting others. Re-run on each model change. Include null queries with no valid answer, to measure false positives.

**Comparing with Skiv:** only with a legitimate account and your own uploaded corpus, after checking its terms. Run the same queries and score with the same rubric. Treat results as a snapshot, since models change without notice.

## 2.9 Fit with the Exponential stack

This is a brief note only; no decision to ship inside Exponential has been made.

| Fits | Does not fit |
|---|---|
| Next.js/tRPC on Vercel for dashboard, auth, metadata, and issuing signed upload URLs | GPU inference, FFmpeg, and long-running jobs in Vercel functions |
| Prisma/Postgres for videos, collections, segments and job state | Proxying uploads or video bytes through functions |
| pgvector for an MVP of transcript search | Background work tied to a request lifecycle; a durable external worker tier is needed |
| | BM25-grade search in Postgres may need extensions your host does not offer. Check before committing, including any AGPL implications |

A separate worker tier, GPU capacity, object storage and CDN would all be new infrastructure. Raw SQL would be needed for vector columns under Prisma.

---

# Open questions

1. Which models and search engine does Skiv use? Only a direct answer from the company would settle this.
2. What are Smart Search's quality and latency? This needs an account and owned content.
3. How long does Skiv take to index? This needs a timed test upload.
4. Which languages does Skiv transcribe natively, and is speaker output exposed anywhere?
5. How are private videos protected at the CDN, for example signed tokens or cookies?
6. Which model is actually in Skiv's assistant today?
7. What is the real GPU throughput of Qwen3-VL-Embedding and Qwen3.5-4B on target hardware? The cost model is most sensitive to this. Run a one-day benchmark before budgeting.
8. Does PP-OCRv6's accuracy carry over from its benchmarks to compressed video frames? Measure it on the eval corpus.
9. Is "chat with your library" needed for launch, or can it follow search?
10. Is the target hosting-plus-search like Skiv, or search over video hosted elsewhere? The second removes Phase 0's delivery work.

# Sources

**Skiv (formerly muse.ai), observed 2026-11-07**

- https://skiv.com/ , https://skiv.com/pricing , https://skiv.com/docs , https://skiv.com/api , https://skiv.com/tools
- https://skiv.com/search-inside-video , https://skiv.com/video-artificial-intelligence , https://skiv.com/video-labelling-and-tagging
- https://skiv.com/video-audio-transcription , https://skiv.com/player-to-embed-video-hosting , https://skiv.com/video-hosting
- https://skiv.com/opportunities , https://skiv.com/about , https://skiv.com/integrations , https://skiv.com/tryportals , https://skiv.com/terms , https://skiv.com/privacy
- https://skiv.com/blog/muse-ai-is-now-skiv , https://skiv.com/blog/migration-guide , https://skiv.com/blog/smart-video-search , https://skiv.com/blog/ai-assistant
- https://skiv.com/blog/ai-powered-video-embedding-guide , https://skiv.com/blog/transforming-university-education-with-ai-video-search , https://skiv.com/blog/video-search-optimization , https://skiv.com/blog/transcode
- https://skiv.com/static/js/embed-player.min.js , https://skiv.com/static/js/embed-search.min.js , https://skiv.com/config.js
- Demo artefacts: https://skiv.com/api/files/videos/VBdrD8v , https://skiv.com/api/files/i/speech/VBdrD8v , https://skiv.com/api/files/i/objects/FTBViRx , https://skiv.com/api/search/video/VBdrD8v?q=rocket , https://skiv.com/embed/VBdrD8v
- https://wordpress.org/plugins/muse-ai/ (first pointer to the rename)

**Archived muse.ai pages (Wayback Machine)**

- https://web.archive.org/web/20260301115152/https://muse.ai/blog/ai-assistant
- https://web.archive.org/web/20260211091418/https://muse.ai/blog/smart-video-search
- https://web.archive.org/web/20260129114933/https://muse.ai/video-audio-transcription
- https://web.archive.org/web/20260223010102/https://muse.ai/video-artificial-intelligence
- https://web.archive.org/web/20260224222548/https://muse.ai/opportunities
- https://web.archive.org/web/20260305235919/https://muse.ai/

**Third-party on the company**

- https://www.getaiperks.com/en/ai/meta-muse-vs-muse-ai-skiv , https://www.producthunt.com/products/muse-ai/makers

**Models, tools and pricing:** linked inline in §2.1 and §2.2, plus

- https://pinggy.io/blog/best_open_source_self_hosted_speech_to_text_models/ (secondary, Open ASR figures)
- https://arxiv.org/abs/2601.04720 , https://arxiv.org/abs/2601.10611 , https://arxiv.org/abs/2510.06961
- https://developers.cloudflare.com/r2/pricing/ , https://www.promptquorum.com/prompt-bites/cloud-gpu-cost-per-hour , https://usagepricing.com/blueprint/twelve-labs , https://www.sevenlabs.site/blogs/best-open-source-speech-to-text-models-2026

**Unavailable:** G2 reviews returned HTTP 403, so user-reported accuracy was not reviewed.
