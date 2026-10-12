<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="mergewise_frontend/public/logo-full-dark.png">
    <img src="mergewise_frontend/public/logo-full.png" alt="Mergewise" width="420">
  </picture>
</p>

# Mergewise

Mergewise (formerly DevPulse) scores every pull request 0–100 for review risk and explains why.
The repository and its folders keep the original `devpulse` name.

GitHub-connected PR intelligence: a rule-based PR risk engine + engineering-memory and
RAG. See the original design docs for the full product vision — **this repo
implements it slice by slice, not all at once.**

## What's built right now: Slice 1 + Slice 2 + Slice 3 + Slice 4 + Slice 5 + Slice 6 + Slice 7 + Slice 8 + Slice 9 + Slice 10

```
Open app → "Sign in with GitHub" → OAuth → session → dashboard
                                                          ↓
                                              "Connect repository" → GitHub App
                                              installation → repos stored in DB
                                              → repos appear in /repositories
                                                          ↓
                                              /repositories/:repoId/pulls (PR list)
                                                          ↓
                                              /pulls/:pullId — risk breakdown AND AI context
                                                   (both computed + persisted on first view)

GitHub (PR opened/reopened/synchronize/closed on a connected repo)
   │  webhook delivery
   ▼
POST /webhooks/github → verify signature → dedupe by delivery id → store WebhookEvent (RECEIVED)
                                                                          │
                                                            background poller (every 3s)
                                                                          ▼
                                                    fetch current PR state from GitHub API
                                                     (via GitHub App installation credentials)
                                                                          │
                                                                          ▼
                                              upsert PullRequest  +  WebhookEvent → PROCESSED

ingestRepositoryDocs(repositoryId)   ← callable service, not yet wired to any trigger
        ↓
list README.md + docs/**/*.md → fetch each → hash → unchanged? skip : chunk on headings
        ↓
KnowledgeSource → Document (hashed, titled) → DocumentChunk[] (ordered)
        ↓
embedPendingChunks()   ← callable service, not yet wired to any trigger
        ↓
batch-embed un-embedded/stale-model chunks → store vector in DocumentChunk.embedding (pgvector)

getOrCreatePrIntelligence(pullRequestId)   ← GET /pull-requests/:id/intelligence
        ↓
existing PRAnalysis? return it : reuse/compute RiskAssessment → LOW risk? skip (no AI, no cost)
        ↓
retrieveRelevantContext → build prompt → call LLM → parse + schema-validate JSON
        ↓
persist PRAnalysis { deterministicScore, riskLevel, summary, findings, recommendations,
                      confidence, riskEngineVersion, promptVersion, embeddingModel,
                      retrievalVersion, llmModel }
```

That's it. That's the whole surface, on purpose. Nothing below is built yet:

- ❌ Notifications, Slack integration, workflow automation (Slice 11)
- ❌ Everything past that

If you (or an AI coding assistant) are tempted to jump ahead and start
scaffolding a `Notification` table, a Slack client, or any workflow
infrastructure before Slice 11 is actually underway — don't. That's the
exact "layer-by-layer instead of vertical-slice" trap this build plan
exists to avoid.

## What Slice 1 demonstrates

- Real GitHub OAuth (not a mocked login) — authorize → callback → token exchange → profile fetch
- CSRF protection on the OAuth callback via signed session state (tested — see `mergewise_backend/src/auth/auth.routes.test.ts`)
- Redis-backed sessions (HttpOnly, Secure-in-prod, SameSite=Lax cookie)
- Organizations are created deliberately, not on sign-in: a signed-in user with no membership lands on `/welcome`, names their organization, and becomes its ADMIN (`POST /organizations`); every later feature is org-scoped
- A validated, fail-fast environment config (missing env vars crash on boot with a clear message, not a mysterious runtime error later)
- Structured JSON request logging (pino) — every request line is queryable by `requestId`
- `/health` (process alive) and `/ready` (Redis reachable) endpoints

## What Slice 2 adds — connect a repository

- A **GitHub App** installation flow, separate from the Slice 1 OAuth App — installing a
  GitHub App is how a user actually grants Mergewise access to specific repos (an OAuth
  token alone can't do that).
- The install flow follows the same CSRF pattern as OAuth login: a random state token is
  generated, stashed in the session, and checked on the way back — plus the organization
  the install is *for* is pinned server-side too, so the setup callback can't be tricked
  into attaching repos to the wrong org (tested — see `mergewise_backend/src/github/github.routes.test.ts`).
- After install, Mergewise asks GitHub which repos the installation actually has access to
  (never trusting a client-supplied repo list) and upserts them into `Repository`, scoped
  to the org.
- `GET /repositories` is scoped to the caller's own organization, resolved from their
  session — never from a client-supplied org id.
- A `/repositories` page: connect button, list of connected repos, no fancy cards, no
  analytics, no notifications — exactly what the Slice 2 spec asked for and nothing more.

## What Slice 3 adds — reliable webhook ingestion

- `POST /webhooks/github`: the one thing this route does is durably record a GitHub event
  and acknowledge it. No PR sync, no risk scoring, no calling back out to GitHub's API
  happens here — that's deliberate, so a slow downstream call can never turn into a
  webhook timeout that GitHub interprets as failure and retries.
- **Signature verification** (`webhook-signature.service.ts`): HMAC-SHA256 over the raw
  request bytes, checked with a timing-safe comparison. The route uses `express.raw()`
  scoped to just this one path — mounted *before* the app's global `express.json()` — since
  signature verification needs the exact bytes GitHub signed, and re-serializing parsed
  JSON isn't guaranteed to reproduce them byte-for-byte.
- **Idempotency**: `WebhookEvent.deliveryId` is a unique DB constraint, and duplicate
  inserts are handled by catching the constraint violation — not a check-then-insert, which
  has a race window under concurrent retries. A replayed delivery returns `200
  already_processed` without creating a second row.
- **Scoped processing, full audit trail**: only `pull_request` events with actions
  `opened`/`reopened`/`synchronize`/`closed` are marked `RECEIVED` (what Slice 4's future
  worker will act on). Everything else GitHub sends — other event types, other PR actions,
  `ping` — is still stored (raw payload and all, for replay if a parser bug ever needs
  reproducing) but marked `IGNORED`.
- **Rate limiting** (`middleware/rate-limit.ts`): a generous limiter on `/webhooks/github`
  (GitHub's own traffic is legitimately bursty — don't throttle a real installation
  syncing hundreds of repos) and a tighter one on the user-initiated `/auth/github/login`
  and `/github/install-url` routes.
- Tested (`src/webhooks/`): valid/invalid/missing/tampered signatures, missing headers,
  supported vs. ignored events stored with the right status, duplicate-delivery dedup, and
  a 500 (so GitHub retries) on an unexpected DB failure.

## What Slice 4 adds — PR synchronization

- **The Slice 3/4 boundary is structural, not just a comment**: `webhooks/webhook.routes.ts`
  is untouched by this slice — it still only verifies, persists, and returns. All of
  Slice 4's logic lives in a separate `pull-requests/` module that the webhook route never
  imports and never calls.
- **A processor, not a queue**: `pull-request-processor.service.ts` consumes `RECEIVED`
  `WebhookEvent` rows and turns each into current `PullRequest` state. `webhook-poller.ts`
  drives it with a plain `setInterval` (every 3s) — no BullMQ, since nothing in the
  architecture calls for a real queue at this slice. It's started only from `server.ts`,
  never from `app.ts`/`buildApp()`, so tests that build the app directly never have a
  background timer running against a mocked or absent database.
- **Fetches current state, never trusts the webhook payload's PR fields**: the processor
  calls GitHub's API (`github/pull-request.service.ts`) for the PR's canonical state on
  every event, using the **GitHub App installation's** credentials — not any user's OAuth
  token, since the installation, not the person who happened to be logged in, is what was
  actually granted access to the repo.
- **Idempotent upsert**: `PullRequest` is keyed on `(repositoryId, githubPrId)`. Processing
  the same PR multiple times — `opened` then `synchronize` then `closed`, or a duplicate
  poll pass — always targets the same row and always reflects the *latest* fetch, never a
  stale merge of old and new.
- **Unknown repo/installation is IGNORED, not FAILED**: if an event's repo+installation
  don't match a connected `Repository` (disconnected since, or an installation Mergewise
  doesn't track), that's not an error — there's nothing to retry.
- **404 vs. transient failure are handled differently, on purpose**: a GitHub 404 means the
  PR genuinely doesn't exist — permanent, so the event is marked `FAILED`. Anything else
  (network blip, GitHub 5xx, rate limit) is presumed transient — the event is left at
  `RECEIVED`, untouched, so the next poll retries it instead of giving up on something that
  might just work next time.
- Tested (`src/pull-requests/`): all four supported PR actions reach `PROCESSED`; PR-number
  extraction from either payload shape; malformed events (missing repo/installation id, no
  extractable PR number) are `FAILED`; an unmatched repo is `IGNORED`; a 404 is `FAILED`; a
  transient failure leaves the event untouched; repeated processing reflects the latest
  GitHub state rather than merging; a missing PR author doesn't crash the upsert; batch
  processing via `processPendingWebhookEvents` reports how many it handled.

## What Slice 5 adds — deterministic PR risk engine

- **No AI here, on purpose**: every score is the sum of six named, deterministic rules —
  diff size, sensitive paths touched, file count, test-file presence, dependency changes,
  migration changes. "72/100, HIGH" always comes with exactly which rules fired and why —
  see `RiskAssessment.rulesTriggered`. This is the reproducible baseline a future AI layer
  (Slice 9+) will *explain*, not replace.
- **Pure scoring, impure everything else**: `risk-engine.ts`'s `calculateRiskSignals` and
  `calculateRiskScore` are plain functions — no database, no network, no side effects. All
  the I/O (fetching the PR's changed files from GitHub, loading the PR/Repository rows,
  writing the result) lives in separate `risk-context.service.ts` /
  `risk-assessment.repository.ts` files that the engine itself never imports. That split is
  what makes the 32 rule/scoring tests run in milliseconds with zero mocking.
- **Thresholds are named, not scattered magic numbers**: every bucket, point value, path
  list, and severity cutoff lives in `risk-rules.config.ts`, each documented as a product
  decision rather than a derived fact. Tuning the engine later means editing constants in
  one file, not hunting through rule logic.
- **`engineVersion` on every assessment**: the scoring logic will change over time, and
  every `RiskAssessment` row is stamped with the version that produced it (`"v1"` today) —
  so a score changing between runs is traceable to "the engine changed," not a mystery.
  Every run is a new row (not an overwrite), so a PR's score history is never lost.
- **Exact-segment path matching, not substring matching**: `src/auth/login.ts` and
  `config.yml` trigger the sensitive-path rule; `src/authors.ts` and `webpack.config.js`
  don't. Same care on the test-presence rule: it claims "no test files changed in this
  diff," never "this change is untested" — those are different claims, and only the first
  one is actually true of what the engine can see.
- **A callable service, not a wired-up pipeline**: `assessPullRequest(pullRequestId)` is
  the only entry point this slice adds. It's not triggered automatically from the Slice 4
  webhook processor, and there's no HTTP route yet (`GET /pull-requests/:id/risk` is
  Slice 6's job) — invoking it is a deliberate choice for whoever calls it, not smuggled
  in as a side effect of PR sync.
- Three new `PullRequest` columns (`additions`, `deletions`, `changedFilesCount`) — not
  scope creep: GitHub's PR-fetch response already includes them and Slice 4 was already
  making that exact API call, just not storing three of its fields.
- Tested (`src/risk/`, `src/github/pull-request.service.test.ts`): 32 table-driven tests
  for every rule's bucket boundaries and trigger conditions plus score-capping and
  level-mapping (all pure, no mocks); risk-input assembly from a mocked GitHub files
  response; the orchestrator's not-found handling, GitHub-App-credential usage, and
  end-to-end score computation with a real (unmocked) engine; the new GitHub files-fetch
  client's pagination and 404-vs-other-failure handling.

## What Slice 6 adds — PR detail + risk UI

- **The whole product becomes demoable**: `/repositories/:repoId/pulls` (a PR table —
  number/title, author, risk badge, status, updated) → `/pulls/:pullId` (title, branches,
  diff stats, and the full risk breakdown — every rule, triggered or not, with its points,
  explanation, and evidence file paths). This is the first slice where a person other than
  the developer can actually look at Mergewise and understand what it does.
- **Multi-tenancy is enforced at the query layer, not bolted on after**: every PR lookup
  (`GET /pull-requests`, `GET /pull-requests/:id`, `GET /pull-requests/:id/risk`) resolves
  the caller's organization from their session and either scopes the query by
  `repository.organizationId` (the list) or checks it before returning anything (the
  detail routes). A PR belonging to a different organization returns **404, not 403** —
  distinguishing the two would confirm to an attacker that the id is real, which is its
  own small leak.
- **Slice 5's loose end gets tied off, deliberately**: `GET /pull-requests/:id/risk`
  returns the latest existing `RiskAssessment` if one exists, and computes one on demand
  via `assessPullRequest` if it doesn't. This is the first thing that actually calls
  Slice 5's engine — still not automatic on every sync, still a human looking at a PR
  triggering it, which was the intentional design left open in Slice 5's own README entry.
- **The risk filter genuinely is applied in-memory**, as flagged as a known limitation in
  `pull-request.repository.ts`: `?risk=CRITICAL` filters the already-fetched list rather
  than being pushed into the SQL query, since "latest assessment has level X" doesn't map
  cleanly onto a single Prisma relation filter. Documented, not hidden.
- UI states handled explicitly: loading, empty (with a message that explains *why* it
  might be empty — sync hasn't run yet — rather than just "no data"), and error, on both
  the list and detail pages independently for the PR fetch and the risk fetch (the risk
  assessment can take a few seconds longer on first view, and the UI says so rather than
  looking stuck).
- Tested (`src/pull-requests/pull-request.routes.test.ts`, 14 tests): auth required on
  every route; org-scoping on the list (a spoofed filter has no effect); the core
  multi-tenancy case — a PR in a different org returns 404, not the data; risk-level
  filtering; existing-assessment-returned-without-recompute vs. compute-on-demand; a
  GitHub failure during on-demand assessment surfaces as 502, not a raw 500 or a hang.

## What Slice 7 adds — engineering memory ingestion

- **No embeddings, no vector search, no LLM — a document pipeline, full stop**: fetch a
  connected repo's `README.md` and everything under `docs/`, hash each file's content,
  chunk it along Markdown heading boundaries, store the result. That's the entire scope,
  matching the doc's own instruction not to jump straight to embeddings.
- **`contentHash` makes re-ingestion cheap**: re-running `ingestRepositoryDocs` on a repo
  whose docs haven't changed does real work (fetches every file, computes every hash) but
  writes nothing — a matching hash short-circuits straight to `skipped_unchanged` before
  any chunking or DB write happens.
- **Chunking respects code fences**: `markdown-chunker.ts` (pure, 15 tests, zero mocking)
  splits on heading boundaries, then further splits any section over the size target at
  paragraph boundaries — but a fenced code block is never split across two chunks, even if
  that means one chunk exceeds the target size. A broken-in-half code fence is invalid
  Markdown, not a smaller chunk; staying syntactically intact wins over staying under a
  soft size limit.
- **Multi-tenancy via `KnowledgeSource`**: every `Document`/`DocumentChunk` traces back to
  a `KnowledgeSource` scoped to one `organizationId` — the same non-negotiable boundary as
  every other org-scoped table in this schema.
- **One bad file doesn't sink the batch**: `ingestRepositoryDocs` wraps each file's
  fetch/hash/chunk/store in its own try/catch. A single unreadable or oversized file is
  recorded as `failed` with its error message; every other file still gets ingested. A
  partial success is more useful than an all-or-nothing run one flaky file can block.
- **A callable service, same pattern as Slice 5's `assessPullRequest`**: `ingestRepositoryDocs(repositoryId)`
  is the only entry point this slice adds — no HTTP route, no automatic trigger on repo
  connection, no scheduled re-ingestion. Retrieval (Slice 8) is what will actually need
  this data to exist, so that's a more natural place to decide when ingestion runs.
- Tested (`src/knowledge/`, `src/github/docs.service.test.ts`): 33 tests — chunker
  boundary/code-fence/ordering behavior (15, pure); content-hash determinism (4, pure);
  the GitHub docs client's path-filtering (README.md + docs/** only, case-insensitive),
  base64 decoding, and correct path URL-encoding (7); the orchestrator's not-found
  handling, org-scoping, skip-on-unchanged-hash, reprocess-on-changed-hash, per-file
  failure isolation, and empty-document handling (7).

## What Slice 8 adds — embeddings + retrieval

- **pgvector, not a new vector database**: the `docker-compose.yml` Postgres image
  (`pgvector/pgvector:pg16`) was already pgvector-enabled since Slice 1 — this slice turns
  that on (`extensions = [vector]` in `schema.prisma`) rather than introducing Pinecone or
  similar, matching the doc's own "you don't need a new vector DB just because every
  tutorial says so" guidance.
- **Raw SQL for every embedding read/write, on purpose**: `DocumentChunk.embedding` is
  declared `Unsupported("vector")` — Prisma Client has no native type for pgvector's
  column, so `embeddings/embedding.repository.ts` and `retrieval/retrieval.repository.ts`
  use `$queryRaw`/`$executeRaw` for anything touching it, while every other column still
  goes through the normal generated client.
- **No fixed vector dimension in the schema**: the column is `vector` (unsized), not
  `vector(1536)`. Each chunk's actual dimensionality is recorded in
  `embeddingDimensions` — read from the embedding API's own response, never hardcoded —
  so switching embedding models later doesn't require a schema migration.
- **Model changes are self-healing**: `findChunksNeedingEmbedding` matches chunks where
  `embedding IS NULL` *or* `embeddingModel` doesn't match the currently-configured model.
  Change `EMBEDDING_MODEL` and every existing chunk is automatically re-queued for
  re-embedding on the next pipeline run — no special-cased migration script needed to
  "version" a model upgrade.
- **Tenant isolation is structural, not a post-filter**: `searchSimilarChunks`'s SQL joins
  `DocumentChunk → Document → KnowledgeSource.organizationId` and filters on it directly
  in the `WHERE` clause — there's no code path that fetches broadly and filters after.
  Same principle as Slice 6's PR authorization, applied to vector search.
- **Batched, not one-request-per-chunk**: `embedPendingChunks` sends every pending chunk's
  content to the embedding API in a single request (`embedding-provider.ts`), consistent
  with the doc's "batch where sensible" guidance. A whole-batch API failure fails every
  chunk in that batch (nothing to attribute per-item when the request itself never got a
  response); a per-chunk *save* failure is isolated from the rest.
- **Citations are structural, not an afterthought**: every retrieved chunk carries its
  source path, title, and heading alongside the content and similarity score — exactly
  what Slice 9's RAG layer will need to say "according to `docs/caching.md`" instead of
  "according to my knowledge."
- **A pure evaluation harness** (`retrieval-evaluation.ts`): `scoreRetrieval`/
  `scoreRetrievalSuite` compute precision@K/recall@K from a set of expected vs. retrieved
  document paths — pure, no embedding calls, no database. This scores results you already
  have; actually running queries against real retrieval to produce those results is I/O
  and isn't this function's job, matching the "evidence retrieval works, not an academic
  benchmark" scope the doc asks for.
- **Two more callable services, same pattern as Slice 5/7**: `embedPendingChunks(limit?)`
  and `retrieveRelevantContext({ organizationId, query, topK? })` are the only entry
  points this slice adds — no HTTP route, no automatic trigger. Slice 9 is what will
  actually call `retrieveRelevantContext` as part of answering a question.
- Tested (`src/embeddings/`, `src/retrieval/`): 29 tests — the embedding provider's
  batching, response-order-independent vector assignment, and dimension derivation (5);
  raw-query parameter passing for both find-pending and save (3); the pipeline's
  empty/happy/partial-failure/whole-batch-failure paths (4); the search repository's
  org-id inclusion, parameter passing, and metadata-to-citation mapping (5); the retrieval
  service's blank-query short-circuit and correct wiring of embed-then-search (4); the
  evaluation harness's precision/recall math including its zero-division edge cases (8).

## What Slice 9 adds — RAG-assisted PR intelligence

- **The deterministic engine (Slice 5) is explained, never overridden**: the LLM is given
  the already-computed score, level, and every triggered rule with its explanation and
  evidence, and is told explicitly it's *explaining* those signals, not recalculating
  them. The reproducible baseline stays reproducible; the AI adds narrative context on
  top of it, never a competing number.
- **A real cost control, not a config knob nobody uses**: `model-selector.ts` returns
  `null` for LOW-risk PRs — `analyzePullRequest` skips retrieval and the LLM call
  entirely, with a test asserting neither gets called. MEDIUM risk uses
  `LLM_MODEL_SMALL`; HIGH/CRITICAL use `LLM_MODEL_STRONG`. A PR the deterministic engine
  already considers unremarkable never costs an API call.
- **Prompt injection is treated as a real threat, not a footnote**: the PR title/body and
  every retrieved memory chunk are repository- and PR-author-controlled text — genuinely
  untrusted. Each is wrapped in explicit `BEGIN UNTRUSTED DATA`/`END UNTRUSTED DATA`
  markers, and the system prompt tells the model plainly that content inside those
  markers is data to analyze, never instructions to follow, even if it looks like a
  system message trying to override these instructions.
- **Grounding is enforced by the prompt, not assumed**: the system prompt requires that
  every recommendation's `source` field be an actual retrieved document path, or `null`
  when a recommendation isn't grounded in a specific document — no vague "the docs
  suggest" with nothing to point at. An empty retrieval result is stated plainly in the
  prompt ("no relevant organizational documentation was found") rather than silently
  omitted, so the model can't paper over a genuine gap in organizational memory.
- **Never trust model output blindly, enforced at runtime**: every response is
  `JSON.parse`'d and then validated against a Zod schema (`pr-analysis.types.ts`) before
  anything else touches it. Malformed JSON, a missing field, or a `confidence`/`severity`
  value outside the allowed enum all throw immediately — a bad response never silently
  propagates as if it were valid.
- **Confidence is categorical, not fake precision**: `LOW`/`MEDIUM`/`HIGH`, deliberately
  not a manufactured decimal like `0.81` — same "honest granularity over false
  precision" philosophy as the risk engine's own severity bands (Slice 5).
- **No persistence, on purpose**: `analyzePullRequest` returns its result and stores
  nothing. The unified data model that will actually persist this alongside the
  deterministic score (`PRAnalysis`) is explicitly Slice 10's job — building a
  throw-away table now that Slice 10 would immediately replace is exactly the
  "scaffold ahead of the slice that needs it" trap this whole build avoids.
- **A callable service, same pattern as every prior slice's orchestrator**:
  `analyzePullRequest(pullRequestId)` is the only entry point this slice adds — no HTTP
  route, no automatic trigger after PR sync or risk assessment.
- Tested (`src/rag/`): 38 tests, all deterministic — no live LLM calls anywhere, matching
  the design doc's own guidance to test payload construction, context selection, org
  scoping, schema validation, and fallback behavior rather than trying to unit-test model
  output. Model-tier selection (4); JSON/schema validation of LLM responses including
  malformed JSON, missing fields, and invalid enum values (8); prompt construction —
  untrusted-data wrapping, only-triggered-signals-included, empty-memory phrasing,
  citation formatting (12); the LLM client's request shape and response-parsing edge
  cases (5); the orchestrator's not-found handling, LOW-risk skip, assessment reuse vs.
  fresh computation, org-scoped retrieval query construction, model-tier wiring, and
  propagation of a schema-validation failure (9).

## What Slice 10 adds — unified risk + AI intelligence

- **The deterministic score is never replaced, only accompanied**: `PRAnalysis.deterministicScore`
  and `.riskLevel` are denormalized straight off the `RiskAssessment` this analysis was
  grounded in — and `riskAssessmentId` is a real foreign key, so the full rule-by-rule
  breakdown is always one relation away. The AI's `summary`/`findings`/`recommendations`
  sit alongside that number, never instead of it — exactly the doc's own "don't let AI
  override the reproducible baseline" instruction, now actually persisted that way.
- **Every dimension that can independently change is versioned separately**:
  `riskEngineVersion`, `promptVersion`, `embeddingModel`, `retrievalVersion`, `llmModel` —
  five columns, five independent version knobs. If a stored analysis looks different from
  a fresh run next month, the row tells you *which* piece changed, not just that something
  did.
- **Thin wrapper, not a rewrite**: `pr-intelligence.service.ts`'s `getOrCreatePrIntelligence`
  is a wrapper around Slice 9's `analyzePullRequest` — all the actual analysis logic
  (retrieval, prompting, the LLM call, schema validation) still lives in Slice 9's module
  untouched. This layer's entire job is reuse-if-persisted, else-call-Slice-9-and-persist.
  Slice 9's contract only grew (three new fields on the "analyzed" result — `riskAssessmentId`,
  `score`, `level` — needed to know what to persist), it wasn't rewritten.
- **A LOW-risk skip is never persisted**: no embedding call, no LLM call, no version stamps
  to record — persisting a placeholder row would just be noise a UI has to filter back
  out. `GET /pull-requests/:id/intelligence` still returns `{ status: "skipped_low_risk"
  }` as a normal `200`, not an error — "there's genuinely no AI analysis for this PR" is
  an expected response shape, not a failure.
- **The PR detail page finally shows both halves together**: `/pulls/:id` now has an "AI
  context" section below the deterministic risk breakdown — confidence badge, summary,
  and each recommendation with its citation — matching the design doc's own two-section
  mockup. Independent loading/error/skipped states from the risk section, since they're
  two separate (if related) queries that can each be slow, fail, or succeed on their own
  schedule.
- **Still no automatic trigger**: `getOrCreatePrIntelligence` is reachable via the new
  route, and the route computes on demand — but nothing runs this after PR sync or on a
  schedule. A human opening the PR detail page is still what triggers generation, same
  deliberate choice as Slice 6's risk endpoint.
- Tested (`src/rag/pr-intelligence.*.test.ts`, `pull-request.routes.test.ts`'s new
  suite): 18 new tests — the repository layer's version-stamp persistence and null-embeddingModel
  handling (4); the orchestrator's reuse-existing/persist-new/pass-through-skip/propagate-error
  paths (4); the new route's auth requirement, cross-org 404, analyzed/skipped/error
  response shapes, and repository-gone 404 (6 of the route file's 20 total, the rest
  carried over unchanged from Slice 6).

## Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)
- A GitHub **OAuth App** (Slice 1 — identity/login). Create one at
  https://github.com/settings/developers → "New OAuth App":
  - Homepage URL: `http://localhost:5173`
  - Authorization callback URL: `http://localhost:3000/auth/github/callback`
- A GitHub **App** (Slice 2 — repository access; a *different* thing from an
  OAuth App). Full setup instructions, including exact permissions, are in
  `.env.example`. Create it at https://github.com/settings/apps.
- That same GitHub App's **Webhook** turned on (Slice 3), pointed at
  `/webhooks/github`, with a secret in `GITHUB_WEBHOOK_SECRET` — see
  `.env.example` for the exact steps. To receive a real delivery in local
  dev, GitHub needs a public URL, so tunnel `localhost:3000` with
  [ngrok](https://ngrok.com) or a Cloudflare Tunnel and point the webhook
  at the tunnel URL instead of `localhost`.
- An **embeddings API key** (Slice 8) — an OpenAI API key is the zero-config
  path (the defaults already point at it); any OpenAI-compatible endpoint
  works with the right `EMBEDDING_API_BASE_URL` override. This is a real,
  paid external API — nothing else in this project has an ongoing cost per
  call, so it's worth knowing this is the one that does.
- An **LLM API key** (Slice 9) — can be the same OpenAI key as above (the
  defaults point at OpenAI's `/chat/completions` too) or a different
  provider entirely via `LLM_API_BASE_URL`. Also a real, paid API — see
  "What Slice 9 adds" for the cost control that keeps this from firing on
  every PR regardless of risk.

## Running it locally

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (pgvector-enabled) + Redis
docker compose up -d

# 3. Configure environment
cp .env.example mergewise_backend/.env
# edit mergewise_backend/.env: fill in GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET,
# GITHUB_APP_SLUG, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET,
# EMBEDDING_API_KEY, LLM_API_KEY (OpenAI API keys, or a compatible provider's
# — see .env.example) (see comments in .env.example for exactly how to
# create/fill each one), and SESSION_SECRET (generate with: openssl rand -hex 32)

# 4. Generate the Prisma client and run the first migration
# (If you already ran this for Slice 1-9 and have a migrations/ folder from
# before the PRAnalysis table was added, run
# `npx prisma migrate dev --name add_pr_analysis` instead of `--name init`.)
npm run db:generate
npx prisma migrate dev --name init --schema=mergewise_backend/prisma/schema.prisma

# 5. Run both apps (separate terminals)
npm run dev:api   # http://localhost:3000
npm run dev:web   # http://localhost:5173
```

Open `http://localhost:5173`, click "Sign in with GitHub," name your
organization on the welcome screen, and you should land on a dashboard showing
your GitHub login and that organization.
From there, click "Manage repositories" → "Connect repository" to install the
GitHub App and pick which repos to connect — they'll show up on
`/repositories` once the install redirects back.

To see the full pipeline work end-to-end: with the GitHub App's webhook
pointed at a tunnel to your local API (see Prerequisites), open a pull
request on a connected repo. Watch the API's structured logs for `"Webhook
delivery received"` with `action: "opened"`, then — within ~3 seconds, once
the poller picks it up — `"Webhook delivery received"`-adjacent processor
logs ending in a `WebhookEvent.status` flip to `PROCESSED` and a new
`PullRequest` row (check both with `npx prisma studio`). Push another commit
— `action: "synchronize"` updates the same `PullRequest` row. Close the PR —
`action: "closed"` updates it again, with `closedAt`/`mergedAt` set.

Then click through to it: `/repositories` → click a repo → `/repositories/:id/pulls`
→ click the PR → `/pulls/:id`. The risk section shows a "Computing risk assessment…"
message the first time (it's calling GitHub's API server-side to fetch the changed
files) and then the full score breakdown; revisiting the same PR is instant since
the assessment is now persisted.

Slice 7's document ingestion isn't wired to anything yet (see "What Slice 7 adds"), so
to actually ingest a repo's docs, call it directly — e.g. from a Node REPL in `mergewise_backend`:
```bash
cd mergewise_backend
npx tsx
> const { ingestRepositoryDocs } = await import("./src/knowledge/document-ingestion.service.ts")
> const { prisma } = await import("./src/db/client.ts")
> const repo = await prisma.repository.findFirst()
> await ingestRepositoryDocs(repo.id)
```
Then inspect the result with `npx prisma studio` — look at `KnowledgeSource`, `Document`
(check `contentHash`/`title`), and `DocumentChunk` (check `chunkIndex` ordering and the
`metadata.heading` field).

Slice 8's embedding pipeline and retrieval are the same "callable, not wired up" pattern.
Once you've ingested some docs (above), embed them and try a query:
```bash
cd mergewise_backend
npx tsx
> const { embedPendingChunks } = await import("./src/embeddings/embedding-pipeline.service.ts")
> await embedPendingChunks()
> const { retrieveRelevantContext } = await import("./src/retrieval/retrieval.service.ts")
> const { prisma } = await import("./src/db/client.ts")
> const org = await prisma.organization.findFirst()
> await retrieveRelevantContext({ organizationId: org.id, query: "how do we invalidate the cache?" })
```
Each result includes `similarity`, `path`, `heading`, and `content` — everything Slice 9
needs to ground an answer in an actual citation.

With docs ingested and embedded (above), and at least one synced `PullRequest` (from the
webhook walkthrough further up), try Slice 9's full RAG analysis:
```bash
cd mergewise_backend
npx tsx
> const { analyzePullRequest } = await import("./src/rag/pr-analysis.service.ts")
> const { prisma } = await import("./src/db/client.ts")
> const pr = await prisma.pullRequest.findFirst()
> const result = await analyzePullRequest(pr.id)
> console.log(JSON.stringify(result, null, 2))
```
If the PR's deterministic risk level is LOW you'll get back `{ status: "skipped_low_risk",
... }` with no LLM call made at all — that's the cost control working as intended, not a
bug. For MEDIUM/HIGH/CRITICAL PRs, expect `{ status: "analyzed", model, analysis: {
summary, riskExplanation, recommendations, confidence } }`.

Or skip the REPL entirely for Slice 10: open `/pulls/:id` in the browser for a
MEDIUM/HIGH/CRITICAL PR and the "AI context" section generates and persists a
`PRAnalysis` on first view, the same way the risk section already does for
`RiskAssessment` — reload the page and it's instant, since `getOrCreatePrIntelligence`
reused the persisted row instead of calling the LLM again.

## Teams: organizations and invitations

- **Creating an organization.** Signing in never creates one. A signed-in user
  with no organization lands on `/welcome`, names it, and becomes its ADMIN.
- **Linking GitHub.** Connecting a repository (admins only) also ties the
  organization to the GitHub account the App was installed on. The installation
  id in GitHub's redirect is client-supplied, so the account is looked up from
  GitHub and the installer must own it — be that user, or an owner of that GitHub
  organization (`mergewise_backend/src/organizations/github-link.service.ts`).
  One GitHub account per Mergewise organization, and vice versa.
- **Inviting.** Admins invite by email on `/members`. Each invitation is a
  random 256-bit link that works once and expires after 24 hours; only its
  SHA-256 hash is stored. It's emailed through Resend when `RESEND_API_KEY` and
  `EMAIL_FROM` are set; otherwise the admin copies the link.
- **Accepting.** The link opens `/invite/:token`; "Connect your GitHub" signs in
  and the OAuth callback accepts the invitation. The invitee's GitHub account
  must belong to the linked account: a member of the GitHub organization, or —
  when it's a personal account — that person or a collaborator on a connected
  repository. Anyone signing in without an invitation can only create their own
  organization.
- **Managing.** `/members` (admins only, enforced by the API) lists members with
  how they joined, last activity and live GitHub status; admins change roles,
  remove people, and resend or cancel invitations. The last admin can't be
  demoted or removed. A MEMBER who has left the GitHub organization loses their
  membership at their next sign-in (only on GitHub's definite "not a member" —
  never on an error).
- **GitHub App permission.** Checking GitHub organization membership needs the
  App's **Organization → Members: Read** permission, accepted once by an owner
  of each GitHub organization it's installed on.

## Deploying

Pushing to `main` deploys automatically:

- **Frontend** — Vercel's GitHub integration builds `mergewise_frontend/` and
  publishes it (project settings: Root Directory `mergewise_frontend`,
  Production Branch `main`).
- **Backend** — Railway builds `mergewise_backend/Dockerfile` (settings in
  `railway.json` at the repo root), runs pending migrations when the container
  starts, and switches traffic over once `/ready` answers. It rebuilds only
  when backend files change. `.github/workflows/backend-tests.yml` separately
  runs the backend's typecheck and tests on every push and pull request.

One-time Railway setup, in one project:

1. **Postgres** — add it from the **pgvector** template (the plain Postgres
   image lacks the `vector` extension the first migration creates).
2. **Redis** — add Railway's Redis.
3. **API** — new service from this GitHub repo, branch `main`. Leave Root
   Directory empty (the Dockerfile builds from the repo root). Under
   Variables, set `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
   `REDIS_URL=${{Redis.REDIS_URL}}`, `NODE_ENV=production`, and the rest of
   `.env.example`. Don't set `PORT`; Railway provides it.
4. Under Networking, generate a public domain for the API, then point
   `mergewise_frontend/vercel.json`'s `/api` rewrite, the GitHub App's webhook
   URL and `API_BASE_URL` at it.

Production settings live in the API service's Variables on Railway; changing
them redeploys the service.

## Running the tests

```bash
cd mergewise_backend
npm test
```

Note: the auth and GitHub App test files construct a real `PrismaClient`, which requires
`npm run db:generate` to have completed successfully (needs network access to fetch
Prisma's query engine binary). The webhook and PR-sync test files mock `db/client.js`
entirely and have no such dependency — they'll pass even in a network-restricted
environment.

**Auth (4 tests)** — `src/auth/auth.routes.test.ts`:
1. A callback with no matching session state is rejected (CSRF protection)
2. A callback missing `code`/`state` entirely is rejected
3. A full login round-trip (login → callback with matching state) succeeds
4. `/me` with no session returns 401

**GitHub App install + repositories (11 tests)** — `src/github/github.routes.test.ts`:
- `/repositories` requires auth, is scoped to the caller's own organization
  (resolved server-side — a spoofed `?organizationId=` query param has no effect),
  and returns an empty list gracefully when the user has no org
- `/github/install-url` requires auth, rejects when the user has no org, and
  redirects to GitHub with a fresh state token
- `/github/setup` rejects missing params, rejects a mismatched/replayed state
  (CSRF protection), completes the flow end-to-end (fetches the installation's
  repos and upserts them under the org pinned in session), and degrades to a
  clear error redirect if the GitHub API call fails

**Webhook signature verification (6 tests)** — `src/webhooks/webhook-signature.service.test.ts`:
- Accepts a correctly signed body; rejects a wrong-secret signature, a tampered
  body, a missing header, a header missing the `sha256=` prefix, and mismatched-length
  garbage (without throwing)

**Webhook ingestion (11 tests)** — `src/webhooks/webhook.routes.test.ts`:
- Signature verification: valid → 202, missing/invalid/tampered → 401
- Validation: missing `X-GitHub-Delivery` or `X-GitHub-Event` → 400
- A supported `pull_request` action is stored as `RECEIVED`; an unsupported action
  or out-of-scope event type (e.g. `ping`) is stored as `IGNORED` but still 2xx'd
- A replayed delivery id is a harmless `200 already_processed`, not a second row
- An unexpected DB failure returns 500, so GitHub's own retry does the right thing

**PR upsert (6 tests)** — `src/pull-requests/pull-request.repository.test.ts`:
- Upserts on `(repositoryId, githubPrId)`, not a plain create
- Maps GitHub's PR fields onto the DB row correctly (author, branches, shas, url)
- Falls back to a placeholder author instead of crashing when GitHub omits the user
  (e.g. a deleted account)
- Processing the same PR twice targets the same row and reflects the *latest* fetch,
  not a merge of old and new
- `closedAt`/`mergedAt` are set from GitHub's timestamps when closed/merged, and left
  `null` for an open PR

**Webhook → PR processor (13 tests)** — `src/pull-requests/pull-request-processor.service.test.ts`:
- All four supported actions (`opened`/`reopened`/`synchronize`/`closed`) fetch current
  state and mark the event `PROCESSED`
- PR number is read correctly from either payload shape (top-level or nested)
- Missing repo/installation id, or no extractable PR number → `FAILED`
- No matching connected `Repository` → `IGNORED` (not `FAILED`), and GitHub is never called
- A GitHub 404 → `FAILED` (permanent); any other GitHub API failure leaves the event
  untouched at `RECEIVED` (retryable)
- `processPendingWebhookEvents` processes every event in a batch and reports the count

**Risk engine — pure logic (32 tests)** — `src/risk/risk-engine.test.ts`:
- Every diff-size bucket boundary (0/5/10/20/30-point thresholds, inclusive-max edges)
- File-count bucket boundaries
- Sensitive-path rule: triggers on an exact path segment, does *not* trigger on a
  substring match (`authors.ts`) or an unrelated `*.config.js`, does trigger on an exact
  `config.*` filename
- Migration-path detection; dependency-manifest detection (and non-detection of an
  unrelated JSON file)
- Test-presence rule: penalizes when no test file is in the diff, doesn't when one is
  (including the `__tests__/` directory convention), and never triggers on an empty diff
- Score summing across multiple simultaneously-triggered rules, capping at 100, and every
  LOW/MEDIUM/HIGH/CRITICAL boundary value mapping to the right level

**Risk input assembly (2 tests)** — `src/risk/risk-context.service.test.ts`:
- Uses the PR's own stored diff totals rather than re-deriving them from the files list;
  correctly maps the fetched files onto `RiskInput.changedFiles`

**Risk orchestrator (5 tests)** — `src/risk/risk-assessment.service.test.ts`:
- PR-not-found and repository-not-found both throw before any GitHub call or DB write
- Calls GitHub with the repository's installation id (not any user's credentials)
- Computes a real score/level via the actual (unmocked) engine and persists it stamped
  with the current `engineVersion`; returns the persisted record

**GitHub PR-files client (4 tests)** — `src/github/pull-request.service.test.ts`:
- Returns a single page's files; follows pagination and combines every page; a 404
  throws `GithubApiNotFoundError` specifically; any other non-2xx throws a generic error

**PR/risk routes (14 tests)** — `src/pull-requests/pull-request.routes.test.ts`:
- All three routes require authentication
- `GET /pull-requests` is scoped to the caller's organization (a spoofed
  `?repositoryId=` filter is passed through as a filter, not used to bypass scoping) and
  filters by risk level in the response
- `GET /pull-requests/:id` and `GET /pull-requests/:id/risk` both return 404 (not 403,
  not the data) for a PR belonging to a different organization — the core multi-tenancy
  test — and 404 for a PR that doesn't exist at all
- `GET /pull-requests/:id/risk` returns an existing assessment without recomputing;
  computes one on demand when none exists; surfaces a GitHub failure during on-demand
  computation as 502, and a missing-repository failure as 404

**Markdown chunker (15 tests)** — `src/knowledge/markdown-chunker.test.ts` (pure, no mocks):
- Empty content → zero chunks; short content → one chunk; one chunk per heading with the
  heading text retained; document order preserved; content before the first heading
  becomes a `heading: null` chunk
- A `#` inside a fenced code block is never mistaken for a heading; a code block is kept
  whole in one chunk even when forced to split for length, and an unterminated fence
  doesn't hang or throw
- A section over the size target splits at paragraph boundaries into multiple chunks
  without losing or duplicating any paragraph, generally staying under the target size

**Content hashing (4 tests)** — `src/knowledge/content-hash.test.ts` (pure, no mocks):
- Deterministic for identical content, different for different content (including
  whitespace-only differences), and returns a real sha256 hex string

**GitHub docs client (7 tests)** — `src/github/docs.service.test.ts`:
- Returns the repo's default branch; keeps only `README.md` (case-insensitive) and
  anything under `docs/`, dropping everything else including directory entries;
  base64-decodes file content correctly; URL-encodes path segments without escaping
  slashes; 404s surface as `GithubApiNotFoundError` specifically

**Document ingestion orchestrator (7 tests)** — `src/knowledge/document-ingestion.service.test.ts`:
- Repository-not-found throws before any GitHub call; every new file gets ingested; a
  file whose hash matches the stored one is skipped without rewriting its chunks; a
  changed hash triggers reprocessing; the knowledge source is scoped to the repository's
  own organization; one file's failure doesn't abort the batch (recorded, others still
  ingest); an empty document is still ingested, with zero chunks

**Embedding provider (5 tests)** — `src/embeddings/embedding-provider.test.ts`:
- Empty input short-circuits without a network call; every text is sent in one batched
  request; vectors are assigned by the response's own `index`, not array position (the
  API doesn't guarantee response order matches request order); dimensions are read from
  the actual response, never hardcoded; non-2xx responses throw

**Embedding repository (3 tests)** — `src/embeddings/embedding.repository.test.ts`:
- `findChunksNeedingEmbedding` returns whatever the raw query yields and passes the
  current model + limit into it; `saveEmbedding` writes the vector as a pgvector literal
  alongside model/dimensions/chunk id (checked via the tagged-template's interpolated
  values, not a brittle exact-SQL-string match)

**Embedding pipeline (4 tests)** — `src/embeddings/embedding-pipeline.service.test.ts`:
- Nothing pending → no provider call; a normal batch embeds and saves every chunk; a
  per-chunk save failure is isolated (the rest of the batch still saves); a whole-batch
  provider failure fails every chunk in that batch with zero partial saves

**Retrieval repository (5 tests)** — `src/retrieval/retrieval.repository.test.ts`:
- The organization id is always part of the query (the tenant-isolation contract); topK
  and the vector literal are passed through; raw rows map correctly into `RetrievedChunk`,
  pulling `heading` out of the chunk's metadata; a chunk with no heading defaults to
  `null`; no matches returns an empty array without throwing

**Retrieval service (4 tests)** — `src/retrieval/retrieval.service.test.ts`:
- A blank query short-circuits to `[]` without embedding or searching anything; a real
  query embeds then searches with the org id and the default topK; a custom topK is
  respected; results from the search layer are passed through unmodified

**Retrieval evaluation harness (8 tests)** — `src/retrieval/retrieval-evaluation.test.ts`:
- Perfect match scores 1.0/1.0; partial precision and partial recall are computed
  correctly; zero-division edge cases (nothing retrieved, nothing expected) resolve to 0
  or a defined vacuous value rather than `NaN`; suite-level macro-averaging across
  multiple cases and the empty-suite case

**Model tier selection (4 tests)** — `src/rag/model-selector.test.ts` (pure):
- LOW → `null` (no AI call); MEDIUM → the small model; HIGH and CRITICAL → the strong model

**LLM response validation (8 tests)** — `src/rag/response-parser.test.ts` (pure):
- A valid response parses correctly, including a `null` recommendation source; invalid
  JSON, a missing required field, an out-of-enum `confidence`, an out-of-enum `severity`,
  and plain prose instead of JSON all throw `InvalidLlmResponseError`; empty
  `riskExplanation`/`recommendations` arrays are accepted

**Prompt construction (12 tests)** — `src/rag/prompt-builder.test.ts` (pure):
- The system prompt instructs treating untrusted sections as data not instructions,
  instructs against inventing ungrounded policies, and specifies the exact JSON response
  shape; the PR title/body are wrapped inside untrusted-data markers while diff stats and
  branch names aren't; a null PR body doesn't crash; only *triggered* risk signals are
  included; score/level and evidence paths are formatted correctly; an empty memory
  result states plainly that nothing relevant was found rather than omitting the section;
  each retrieved chunk gets its own untrusted-data-wrapped block with its citation
  (path/heading/similarity); a chunk with no heading is handled gracefully

**LLM client (5 tests)** — `src/rag/llm-client.test.ts`:
- Sends the model, both messages, and JSON-mode `response_format`; returns the message
  content string; throws `LlmResponseError` for a response with no message content or no
  choices at all; throws a generic error on a non-2xx response

**RAG orchestrator (9 tests)** — `src/rag/pr-analysis.service.test.ts`:
- PR-not-found and repository-not-found both throw before any retrieval or LLM call; a
  LOW-risk PR skips retrieval and the LLM call entirely (the cost control, verified
  directly); an existing risk assessment is reused rather than recomputed, and a missing
  one is computed fresh via Slice 5's engine; the retrieval query is built from the PR
  title plus triggered-signal explanations, scoped to the repository's own organization;
  HIGH risk selects the strong model and MEDIUM selects the small one; a successful run
  returns the parsed, schema-validated analysis; a schema-validation failure propagates
  rather than returning malformed data

**PR intelligence repository (4 tests)** — `src/rag/pr-intelligence.repository.test.ts`:
- Writing a record persists every field, including all four version stamps; a `null`
  `embeddingModel` is accepted; the latest-record lookup queries by `pullRequestId` and
  orders by `createdAt desc`; returns `null` when nothing exists yet

**PR intelligence orchestrator (4 tests)** — `src/rag/pr-intelligence.service.test.ts`:
- An existing persisted analysis is returned without calling Slice 9 again; a LOW-risk
  skip passes through without persisting anything; a fresh analysis is persisted with
  every version stamp filled in; an error from `analyzePullRequest` (e.g. PR not found)
  propagates without attempting to persist

**Unified intelligence route (part of the 20-test `pull-request.routes.test.ts` suite)**:
- `GET /pull-requests/:id/intelligence` requires auth; returns 404 (not the data) for a
  PR in a different organization without ever calling the intelligence layer; returns the
  analyzed result on success; returns a `skipped_low_risk` result as a normal `200`, not
  an error; returns 502 on an unexpected generation failure; returns 404 when the
  underlying repository has gone missing

## Project structure

```
mergewise_backend/   Express + TypeScript API
    src/
      auth/          GitHub OAuth flow, session-backed /me
      github/        GitHub App install flow, installation→repo sync, /repositories,
                      PR fetch + PR-files fetch services, docs fetch service (Slice 7)
                      (all GitHub App-authorized)
      webhooks/      Webhook signature verification, WebhookEvent persistence, /webhooks/github
      pull-requests/ Webhook→PR processor, PullRequest upsert, background poller (Slice 4),
                      /pull-requests + /pull-requests/:id + /pull-requests/:id/risk (Slice 6)
                      + /pull-requests/:id/intelligence (Slice 10)
      risk/          Deterministic risk engine: pure rules/scoring, context assembly,
                      RiskAssessment persistence, assessPullRequest orchestrator (Slice 5)
      knowledge/     Markdown chunker + content hashing (pure), Document/DocumentChunk
                      persistence, ingestRepositoryDocs orchestrator (Slice 7)
      embeddings/    Batched embedding provider, pgvector raw-SQL read/write,
                      embedPendingChunks orchestrator (Slice 8)
      retrieval/     Org-scoped cosine-similarity search (raw SQL), retrieveRelevantContext
                      orchestrator, pure precision/recall evaluation harness (Slice 8)
      rag/           Prompt construction (with prompt-injection defenses), model-tier
                      selection, LLM client, Zod response validation, analyzePullRequest
                      orchestrator (Slice 9); PRAnalysis persistence + getOrCreatePrIntelligence
                      unifying orchestrator (Slice 10)
      config/        validated env loading
      db/            Prisma client + Redis client singletons
      logger.ts      structured logger for non-request-scoped code (the poller)
      middleware/    requireAuth, rate limiting (webhook + auth-flow limiters)
      app.ts         Express app assembly (helmet, CORS, sessions, logging, raw-body webhook route)
      server.ts      entrypoint — also starts the webhook event poller
    prisma/
      schema.prisma   v8: User, Organization, Membership, Repository, WebhookEvent,
                       PullRequest, RiskAssessment, KnowledgeSource, Document, DocumentChunk,
                       PRAnalysis (+ pgvector extension, embedding columns on DocumentChunk)
mergewise_frontend/  React + TypeScript + Vite + TanStack Query
    src/
      pages/       LoginPage, DashboardPage, RepositoriesPage, PullRequestsPage,
                   PullRequestDetailPage (risk breakdown + AI context sections)
      components/  RiskBadge
      lib/         api client, useCurrentUser/useRepositories/usePullRequest(s)/
                   usePullRequestRisk/usePullRequestIntelligence hooks, ProtectedRoute
packages/
  shared/        (empty for now — shared types land here once a later slice needs them)
```

## Known limitations, stated honestly

- Rate limiting now covers `/webhooks/github`, `/auth/github/login`, and
  `/github/install-url` — earlier slices' READMEs flagged this as missing;
  it's the one thing this slice's own checklist explicitly called
  non-optional before a public webhook endpoint ships.
- `MembershipRole` is 2-valued (ADMIN/MEMBER) by design — see the design docs'
  reasoning on RBAC scope.
- The org-slug collision handling (auth.service.ts) retries once with a random
  suffix; it's a real edge case handler, not just a TODO, but it hasn't been
  exercised by an automated test yet.
- "The org this user belongs to" (`resolvePrimaryOrganizationId`) is
  currently just "their first membership" — correct today because every user
  has exactly one, Slice-1-bootstrapped org, but it's a placeholder for real
  org selection once multi-org membership is a real scenario.
- No UI affordance yet to *disconnect* a repository or re-run the install flow
  to add more repos to an existing installation — GitHub's install page
  supports "Configure" for that today; a Mergewise-side control is a small
  follow-up, not scoped into this slice.
- `GET /github/setup` doesn't yet distinguish `setup_action=install` from
  `setup_action=request` (the case where an org owner must approve the
  install before it's usable) — both are treated the same, and a `request`
  install session will surface as `error=install_failed` when the sync call
  is rejected, which is honest but not maximally friendly.
- Webhook events are stored, not processed by the webhook route itself — a separate
  processor consumes `RECEIVED` rows (Slice 4). That decoupling is the point (see "What
  Slice 4 adds"), not a gap.
- No UI to browse stored `WebhookEvent` or `PullRequest` rows — `npx prisma studio` is the
  way to inspect them for now. A small debug view might be worth adding once Slice 5+
  gives them something to point at (a risk score, a PR detail page), but it's not needed
  to prove the pipeline works today.
- The Slice 4 processor now cross-checks a delivered event's repo/installation against
  connected `Repository` rows before doing any work (unmatched → `IGNORED`) — the Slice 3
  README flagged this as a gap; it's closed as of this slice.
- `webhookRateLimiter` / `authFlowRateLimiter` use `express-rate-limit`'s
  default in-memory store — fine for one API instance, but won't share
  state across multiple instances behind a load balancer. A Redis-backed
  store (you already have Redis) is the natural upgrade for that case.
- The webhook poller (`setInterval`, every 3s) is a single-process, in-memory
  scheduler. It doesn't coordinate across multiple API instances — if you ever
  run more than one, each would poll independently, and since `processWebhookEvent`
  itself is idempotent (safe upsert, no double-processing corruption) that's wasteful
  rather than incorrect, but a real queue (BullMQ, as the architecture docs allow for
  later) is the right fix once that matters.
- `findRepositoryByGithubIds` returns the first matching `Repository`; if the same
  GitHub repo were ever connected by two different organizations independently, only
  one org's PR data gets synced from a given webhook event. Documented in
  `github/repository.service.ts` — not handled because nothing in this codebase creates
  that scenario yet.
- No retry backoff or max-attempt limit on transient failures — an event that keeps
  failing (e.g. a sustained GitHub outage) will be retried by the poller forever, every
  3 seconds, rather than backing off or eventually giving up loudly. Fine at this scale;
  worth revisiting before this runs against real, unpredictable third-party uptime.
- `PullRequest.state` stores GitHub's raw `"open"`/`"closed"` string as-is rather than a
  richer enum (e.g. distinguishing "closed" from "merged" as separate states) — merged
  status is derivable from `mergedAt` being non-null, which was enough for Slice 4's
  scope, but a future risk-engine or UI consumer may prefer a proper enum.
- `assessPullRequest` has exactly one caller now: `GET /pull-requests/:id/risk` on
  first view of a PR (Slice 6). Still no automatic run after PR sync and no scheduled
  re-assessment — a human looking at the PR detail page is what triggers it, which was
  the deliberate design left open in Slice 5.
- The six rules are heuristic and intentionally simple: `SENSITIVE_PATH` and
  `DEPENDENCY_CHANGE` match on exact path segments/filenames from a fixed list — a
  legitimate sensitive file with an unlisted name, or a dependency file from an
  unsupported ecosystem, won't be flagged. `NO_TEST_FILES` only knows whether a test file
  is *in this diff*, not whether the changed code has any test coverage at all. These are
  documented trade-offs (see risk-rules.config.ts), not oversights — the doc's own
  guidance is "start with a small rule set," not an exhaustive one.
- No caching or content-hash skip on the GitHub files fetch — every `assessPullRequest`
  call re-fetches the PR's changed files from GitHub, even if assessed moments ago. Now
  that Slice 6 calls this on every first PR view, a PR nobody's ever opened costs nothing
  extra, but revisiting `/pulls/:id` after the assessment already exists correctly skips
  recomputation (see the route's "existing assessment" check) — the *fetch-from-GitHub*
  cost only applies to genuinely new assessments, not every page view.
- Every `assessPullRequest` call creates a new `RiskAssessment` row rather than checking
  whether the PR has actually changed since the last assessment — full history is kept
  (arguably a feature, not a bug, matching engineVersion's "why did this change"
  reasoning). Not an issue in practice yet since Slice 6 only calls it when no assessment
  exists at all, but a future "re-assess on demand" UI affordance would need to think
  about this.
- No pagination on `GET /pull-requests` — it returns every PR in the org in one response.
  Fine at demo scale; would need `?page=`/`?limit=` before this saw a repo with thousands
  of historical PRs.
- No UI affordance to manually re-trigger a risk assessment (e.g. after pushing new
  commits to a PR that already has a stale assessment) — the detail page always shows the
  latest stored assessment, which won't reflect a `synchronize` that happened after it was
  computed. A "re-assess" button is a natural, small follow-up, not implemented because
  nothing in Slice 6's scope asked for automatic re-assessment on every sync.
- `ingestRepositoryDocs` is triggered manually (a Node REPL call, per "Running it
  locally") — no automatic run on repo connection, no HTTP route, no scheduled
  re-ingestion. It's a tested, callable service, same shape as `assessPullRequest`
  (Slice 5) and `embedPendingChunks`/`retrieveRelevantContext` (Slice 8) — nothing in
  this codebase yet decides *when* any of these three should run automatically; that's
  a product decision for whichever later slice actually needs it on a schedule.
- The Git Trees API call in `listMarkdownFilePaths` doesn't handle GitHub's `truncated:
  true` response for very large repos — an enormous monorepo could have some `docs/`
  files silently missed. Documented in `github/docs.service.ts`; not handled because nothing
  this has been tested against actually triggers it yet.
- Chunking is heading-based only, with no minimum chunk size — a document with many small
  subheadings produces many small chunks rather than merging trivially short ones. Not
  revisited in Slice 8 either; would need a concrete retrieval-quality problem to justify
  tuning either way.
- `tokenCount` is still a rough `length / 4` estimate, not a real tokenizer count for the
  actual configured embedding model. Slice 8 didn't need a real count for anything (no
  per-request token budget is enforced yet); worth adding once a specific model's context
  limits actually start to matter, likely in Slice 9.
- No organizationId denormalized onto `Document`/`DocumentChunk` — both only reach their
  org through `KnowledgeSource.organizationId`, and Slice 8's retrieval query joins
  through both relations on every search rather than filtering on a denormalized column.
  Fine at today's data volume; worth revisiting for query performance once an org's
  chunk count is large enough for the join to show up in practice.
- Deleted files aren't detected or cleaned up — if a doc is removed from the repo,
  ingestion only ever adds/updates paths it sees in the current file listing; a `Document`
  row for a since-deleted file is never pruned. Not handled because nothing in this slice's
  scope covers repo drift over time, only single-pass ingestion.
- No vector index (`ivfflat`/`hnsw`) on `DocumentChunk.embedding` — similarity search is
  an exact, full-scan nearest-neighbor query. Correct and fine at the data volumes this
  is meant to run at; an approximate index is the right move once a single organization
  has enough embedded chunks for a full scan to actually show up as slow, and pgvector's
  index types generally want a fixed vector dimension, which this schema deliberately
  doesn't have yet (see the "no fixed vector dimension" note above) — adding one is a
  deliberate tradeoff to make later, not an oversight now.
- No retry or backoff on embedding API failures — `embedPendingChunks` treats a whole-batch
  provider failure as "failed, try again next run" with no exponential backoff, no
  max-attempt limit, and no distinction between "rate limited, will succeed shortly" and
  "invalid API key, will never succeed." Same category of gap as the webhook poller's
  retry behavior (Slice 4), not fixed here either.
- No cost or rate control on embedding calls — nothing limits how often
  `embedPendingChunks` can run, how large a batch it processes, or tracks spend. Every
  chunk re-embedded after a model change re-costs a real API call. Fine for a single
  developer running this manually; a real deployment would want at minimum a per-run
  batch size cap (the `limit` parameter exists, but nothing enforces a sane default in
  production) and ideally actual cost tracking.
- `retrieveRelevantContext` has no minimum-similarity cutoff — it always returns the top
  `topK` chunks, even if the best match is a poor one (e.g. an org with no ingested docs
  relevant to the query, or one whose only doc is unrelated to the question asked).
  Slice 9 didn't add one either: the prompt tells the model when memory is *empty*, but a
  *low-quality* non-empty match is still handed to the model as if it were relevant. A
  minimum-similarity threshold is a reasonable follow-up, not implemented because nothing
  has surfaced a concrete case where it mattered yet.
- The retrieval evaluation harness (`retrieval-evaluation.ts`) scores results you already
  have; nothing in this codebase yet runs a fixed set of benchmark queries against real
  retrieval and feeds the results in automatically. Building that harness-plus-fixtures is
  a reasonable follow-up once there's a stable, ingested corpus worth benchmarking against
  — not done now because this project doesn't have one yet.
- `analyzePullRequest` is triggered manually (a Node REPL call, per "Running it locally")
  — no automatic run after PR sync or risk assessment, no HTTP route. Same "callable,
  nothing decides when it runs yet" pattern as `ingestRepositoryDocs` and
  `embedPendingChunks`; a real product would presumably run this after a risk assessment
  crosses a threshold, but that's an integration decision for a later slice, not smuggled
  in here.
- No token-budget management on the prompt sent to the LLM — a PR with an enormous diff,
  a very long description, or many large retrieved chunks could produce a prompt that
  exceeds the target model's context window, and nothing here truncates, summarizes, or
  reduces `topK` to compensate. The request would simply fail at the API level in that
  case rather than degrading gracefully.
- The prompt-injection defenses (untrusted-data markers, explicit instructions to ignore
  embedded commands) are the standard mitigation for this class of problem, not a
  guarantee — a sufficiently adversarial README or PR description could still influence
  model behavior. This is a known, openly-acknowledged limitation of prompting-based
  defenses in general, not specific to this codebase, and no output-side validation
  beyond the response schema itself (Zod) exists to catch a successfully injected result.
- No retry or backoff on LLM API failures (rate limits, transient 5xx) — a failed call to
  `generateChatCompletion` propagates as a rejected promise immediately. Same category of
  gap as the embedding pipeline's lack of retry logic; not addressed here either.
- `analyzePullRequest`'s retrieval query is built mechanically (PR title + triggered risk
  signal explanations, concatenated) rather than being itself LLM-generated or otherwise
  refined — a reasonable, cheap heuristic per the design doc's own suggestion, but not
  necessarily the best possible query for a given PR. Worth revisiting if retrieval
  quality turns out to be the bottleneck once this runs against real data.
- `getOrCreatePrIntelligence` reuses *any* existing `PRAnalysis` for a PR, even if the PR
  has changed (a new `synchronize` webhook) since that analysis was generated — there's no
  staleness check comparing the analysis against the PR's current `headSha`/`updatedAt`.
  The PR detail UI can show an AI analysis of an earlier version of the PR without saying
  so. Same category of gap as the risk section's own "no re-assess on new commits"
  limitation (Slice 6) — worth solving once, for both, rather than twice.
- No UI affordance to manually re-trigger a PR intelligence analysis, mirroring the same
  gap already noted for risk re-assessment (Slice 6). A "re-analyze" button is a natural
  small follow-up for both, not implemented because nothing in this slice's scope asked
  for automatic or manual re-analysis.
- `PRAnalysis` rows are never cleaned up or superseded — every `getOrCreatePrIntelligence`
  call either reuses the single existing row or creates the first one; there's currently
  no path that creates a *second* row for the same PR (unlike `RiskAssessment`, which
  intentionally keeps full history). If re-analysis is added later, deciding whether
  `PRAnalysis` should also keep full history or just update-in-place is an open design
  question, not yet answered here.
- The unified route (`GET /pull-requests/:id/intelligence`) and the risk-only route
  (`GET /pull-requests/:id/risk`) now overlap: both trigger risk assessment, and the
  intelligence route additionally triggers AI analysis. A PR detail page that calls both
  (as this one does) makes two separate requests where a single combined endpoint might
  eventually make more sense — kept separate here because they were built in different
  slices with different callers in mind, and merging them isn't necessary for anything
  in this project's current scope.
