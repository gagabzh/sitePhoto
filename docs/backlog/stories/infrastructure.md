# Infrastructure & Quality

**IQ-1 — Apply HTTP security headers and rate-limit auth routes**
As a logged-in user, I can trust that every page response carries the full set of hardening headers and that brute-force login attempts are throttled — so the site cannot be trivially compromised through missing headers or credential-stuffing.

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` is present on every HTTPS response (helmet `hsts` option, not disabled).
- `X-Frame-Options: DENY` is present on every response (helmet `frameguard` option, action `deny`).
- `X-Content-Type-Options: nosniff` is present on every response (helmet `noSniff` option).
- `Referrer-Policy: strict-origin-when-cross-origin` is present on every response (helmet `referrerPolicy` option).
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` is present on every response, set manually in `src/app.js` after the helmet call (helmet does not set this header).
- The existing CSP, nonce injection, and `csrfMiddleware` are unchanged — they already satisfy those attack vectors.
- `POST /login` and `POST /register` are wrapped with an `express-rate-limit` instance: 10 requests per 15-minute window per IP, using `express`'s `trust proxy` setting already in `app.js` to resolve real client IPs.
- When the rate limit is hit, the server responds with HTTP 429 and JSON body `{ "error": "Too many attempts, please try again later." }` (regardless of `Accept` header).
- A second `express-rate-limit` instance is applied globally to all routes: 300 requests per 1-minute window per IP. This global limiter responds with HTTP 429 and the same JSON body.
- Both rate-limit instances use `standardHeaders: true` and `legacyHeaders: false` so clients receive `RateLimit-*` headers (RFC 6585) and not `X-RateLimit-*`.
- Rate-limit state is stored in memory (the default in-memory store) — no Redis dependency for this feature.
- All new middleware is registered in `src/app.js`; no new file is required unless the developer chooses to extract rate-limit configuration into `src/rateLimits.js`.
- `npm test` passes with no new failures after the change.

Edge cases:
- A request from an IP that has made exactly 10 `POST /login` attempts in the current 15-minute window receives 429 on the 11th attempt; a `GET /login` from the same IP is not counted toward the auth-route limiter.
- The global limiter does not block the `/uploads/:filename` static-file route (already public) before `requireAuth` runs — the limiter is applied before `requireAuth` in `app.js`.
- `POST /login` called with a correct password on the 10th attempt within the window succeeds with HTTP 302; the counter is not reset by a successful login.
- If `HSTS` header would be sent over plain HTTP in local dev (NODE_ENV=development), this is acceptable — helmet sends it regardless of scheme; the developer must not disable it.

> CSRF is already handled by `csrfMiddleware` in `src/middleware.js` — do not re-implement or replace it.
> SQL injection is already prevented by parameterised `pg` queries throughout — no change needed.
> `express-rate-limit` v8 is already in `package.json` and requires no new `npm install`.

**IQ-2 — Fail CI on high-severity dependency vulnerabilities**
As a developer, I can see the CI build fail when `npm audit` reports a vulnerability at severity `high` or `critical` in either the app or worker dependencies — so I am forced to address it before merging, and I have an escape hatch to document exceptions when no upstream fix exists yet.

- The `test` job in `.github/workflows/deploy-site.yml` contains an `Audit` step that runs `npm audit --audit-level=high` from the repository root (covering `package.json`).
- The `test` job in `.github/workflows/deploy-site.yml` contains a second `Audit worker dependencies` step that runs `npm audit --audit-level=high` from the `worker/` directory (covering `worker/package.json`), after a `npm ci` step in the same directory.
- Both audit steps already exist in `deploy-site.yml` (root) and `deploy-worker.yml` (worker). The scope of this story is: confirm both pipelines run `--audit-level=high` (not `critical`) and add the exceptions mechanism described below.
- When `npm audit` exits non-zero because a vulnerability has no upstream fix, the maintainer can add the advisory ID to `.npm-audit-exceptions` at the repository root (one numeric advisory ID per line, comment lines starting with `#`).
- The `Audit` step in `deploy-site.yml` is replaced with a two-line shell snippet: `npm audit --audit-level=high --json | node scripts/audit-check.js` where `scripts/audit-check.js` reads `.npm-audit-exceptions`, filters out exempted advisory IDs, and exits non-zero if any remaining `high` or `critical` advisories exist.
- The same `scripts/audit-check.js` script is used in the worker audit step, invoked as `npm audit --audit-level=high --json | node ../../scripts/audit-check.js` from the `worker/` directory.
- `scripts/audit-check.js` prints a human-readable summary: one line per non-exempted advisory showing advisory ID, package name, severity, and a link to the advisory URL.
- When every `high`/`critical` advisory is listed in `.npm-audit-exceptions`, the step exits 0 and prints "All high/critical advisories are exempted."
- `.npm-audit-exceptions` is committed to the repository and is initially empty (or contains only a comment header).
- `npm test` (the Jest suite) is not affected by this change.

Edge cases:
- A `moderate`-severity advisory does NOT fail the build (the `--audit-level=high` flag controls this, not the script).
- An advisory ID listed in `.npm-audit-exceptions` that no longer appears in `npm audit` output is silently ignored (the exemptions file may contain stale entries).
- If `.npm-audit-exceptions` does not exist, `scripts/audit-check.js` treats it as empty (no exemptions) and fails if any `high`/`critical` advisories are present.
- If `npm audit` exits with a network error (JSON output is malformed), `scripts/audit-check.js` exits non-zero with message "audit-check: failed to parse npm audit output".

> Both workflow files already run `npm audit --audit-level=high` as bare steps. This story replaces those bare steps with the `audit-check.js` pipeline. The audit level stays at `high` — do not change it to `critical`.

**IQ-3 — Linter**
As a developer, I add ESLint (or equivalent) to the project with a consistent rule set, so code style is enforced automatically and obvious errors are caught before review.

**IQ-4 — Enforce test coverage threshold in CI**
As a developer, I can see the CI build fail when test coverage drops below the defined minimum thresholds — so coverage cannot silently regress when new code is added without tests.

- The `test` job in `.github/workflows/deploy-site.yml` replaces the `run: npm test` step with `run: npm run test:coverage`.
- `npm run test:coverage` already runs `jest --coverage --forceExit` as defined in `package.json`; no script change is needed.
- The `coverageThreshold` block already present in the `jest` section of `package.json` defines the enforced floors: `statements: 90`, `branches: 75`, `functions: 65`, `lines: 90`. These values are the thresholds for this story — do not change them.
- When any threshold is breached, Jest exits non-zero, the CI step fails, and the PR cannot be merged (branch protection rule "Require status checks to pass" must include the `test` job — document this requirement in `.github/workflows/deploy-site.yml` as a comment).
- The coverage report is uploaded as a GitHub Actions artifact named `coverage-report` using `actions/upload-artifact@v4`, sourced from the `coverage/` directory produced by Jest.
- The artifact is retained for 7 days (`retention-days: 7`).
- `deploy-worker.yml` is not changed — the worker has no Jest test suite and no `jest` config in `worker/package.json`.
- Running `npm run test:coverage` locally (outside CI) also enforces the thresholds; Jest prints a coverage summary table followed by "Jest: Global coverage threshold for X (Y%) not met: Z%" when a threshold is breached.

Edge cases:
- A new route file is added with 0 tests: the `statements` and `lines` metrics drop; if they fall below 90%, CI fails on the next push. The developer must add tests before the PR can merge.
- A developer runs `npm test` locally (without `--coverage`): thresholds are not enforced; this is expected — the story only requires enforcement in CI.
- All thresholds are met but one new uncovered branch is introduced: if `branches` stays at or above 75%, CI still passes. The threshold is a floor, not a ratchet.
- The `coverage/` directory is listed in `.gitignore` and must not be committed; the artifact upload step runs after `npm run test:coverage` regardless of whether the threshold check passed (use `if: always()` on the upload step so partial coverage data is available for diagnosis even on a failing run).

> The worker (`worker/`) has no Jest config and no test suite. Coverage enforcement for the worker is out of scope for this story.
> The `coverageThreshold` values are already committed in `package.json` — this story is exclusively about wiring `npm run test:coverage` (instead of `npm test`) into the `deploy-site.yml` CI job and uploading the artifact.

**IQ-6 — Fix misleading audit success message in `audit-check.js`**
As a developer reading CI output, I can tell at a glance whether the audit step passed because no vulnerabilities exist or because all findings were manually exempted — so I never mistake a clean tree for an exempted one.

- When `npm audit` reports zero `high`/`critical` advisories, `audit-check.js` exits 0 and prints "No high/critical advisories found."
- When `npm audit` reports one or more advisories but every one is listed in `.npm-audit-exceptions`, `audit-check.js` exits 0 and prints "All high/critical advisories are exempted." (current message, now used only for this case).
- When `npm audit` reports advisories and at least one is not exempted, the existing non-zero exit and per-advisory summary output is unchanged.
- A unit test (or the test in IQ-9 if implemented together) covers all three code paths.

*Technical note:* The condition to distinguish "zero findings" from "all exempted" is already available in the advisory array after JSON parsing — check `advisories.length === 0` before iterating. Change is limited to `scripts/audit-check.js`.

**IQ-8 — Cache worker `npm ci` in CI to speed up the audit step**
As a developer, I want the "Audit worker dependencies" step in `deploy-site.yml` to benefit from `setup-node`'s dependency cache — so the `npm ci` in `worker/` does not re-download the full dependency tree on every run.

- The `actions/setup-node` step in the `test` job of `deploy-site.yml` sets `cache-dependency-path` to cover both `package-lock.json` (root) and `worker/package-lock.json`.
- After the change, a CI run where neither lock file has changed completes the `npm ci` in `worker/` from cache rather than hitting the npm registry.
- The root `npm ci` step is unaffected — it continues to restore from the same cache key as before.
- No other workflow files require changes.

*Technical note:* The `setup-node` action accepts `cache-dependency-path` as a multiline string or a glob (e.g. `"**/package-lock.json"`). Either form is acceptable. Verify the correct syntax in the actions/setup-node v4 documentation.

**IQ-9 — Unit-test `audit-check.js` advisory parsing logic**
As a developer, I want a Jest test file (or standalone test runner) covering the advisory parsing logic in `scripts/audit-check.js` — so regressions in exception matching, NaN handling, or severity filtering are caught before CI.

- A test file (e.g. `scripts/audit-check.test.js` or `__tests__/audit-check.test.js`) feeds synthetic `npm audit --json` payloads directly to the parsing logic.
- Tests cover: zero advisories (clean tree), one `high` advisory not in exceptions (should exit non-zero), one `high` advisory in exceptions (should exit zero), one `critical` + one `moderate` advisory with neither exempted (only `critical` fails), a malformed/empty JSON input (should exit non-zero with the parse-error message), and an `.npm-audit-exceptions` file that does not exist (treated as empty).
- `scripts/audit-check.js` exports its parsing and decision functions (or accepts an injectable stdin/file reader) to make the above testable without spawning a child process.
- Jest config includes `scripts/` in the coverage collection path (currently excluded), or the tests are run standalone outside Jest — either approach is acceptable as long as they run in CI.
- `npm test` (or the dedicated test command) passes for all new test cases.

*Technical note:* `audit-check.js` currently reads from `process.stdin` and calls `process.exit()` directly, which makes unit testing hard. Refactor to extract a `processAuditReport(json, exceptions)` pure function that returns `{ exitCode, message }` without side effects. The thin `main()` wrapper keeps the stdin/exit wiring.

**[DONE] IQ-5 — VPS hardening** ✓
As a sysadmin, I apply VPS-level security measures (SSH key-only auth, firewall rules, automatic security updates, fail2ban or equivalent) so the server is not trivially compromised.

**[DONE] S3-1 — Photos stored in Object Storage**
As an editor uploading a photo, the file is stored in OVH Object Storage (S3-compatible bucket) rather than on the server's local disk — so storage capacity is decoupled from the server, and photos are not lost if the server is replaced.

**[DONE] S3-2 — Transparent experience for viewers**
As a viewer, browsing, downloading, and viewing photos works exactly as before — the migration to S3 storage is invisible to me.

**[DONE] S3-3 — Photo deletion removes S3 object**
As an editor or admin deleting a photo, the file is removed from the S3 bucket at the same time as the database record — so no orphaned objects accumulate in storage.

**[DONE] Q-1 — Upload returns immediately**
As an editor uploading a photo, the upload response is instant. People identification runs in the background on a dedicated worker — so I am never blocked waiting for the AI to finish.

**[DONE] Q-2 — Real-time identification notification**
As an editor, after uploading a photo I see an "Identification in progress…" badge on it. When the worker finishes, the suggested people tags appear on the photo in real time without reloading the page.

**[DONE] Q-3 — Identification resilience**
As an editor, if the worker is offline when I upload, the identification job is held in the queue and runs automatically when the worker comes back online — no photo is silently skipped.

**[DONE] IV4-1 — Two-instance private architecture**
As a developer, the site runs on two OVH Public Cloud instances connected over a private vRack network: Instance-1 runs the Express app and PostgreSQL; Instance-2 runs the Node.js worker and Ollama. Redis is exposed only on the private network. Inter-instance HTTP calls are authenticated with a shared secret.

**[DONE] IV4-2 — Local development with MinIO and Redis**
As a developer, running `docker compose up` locally starts a MinIO container (S3-compatible) and a Redis container alongside the app and worker — so the full async flow can be tested without any cloud account.

**[DONE] IV4-3 — Worker instance on-demand lifecycle**
As a developer, Instance-2 starts automatically when a job enters the queue and shuts down (shelved, not billed) after a configurable period of inactivity — so compute cost is proportional to actual usage.

**[DONE] INF-1 — Instance-1 right-sizing**
As an admin, Instance-1 is resized from b3-8 to b2-7 (2 vCPU, 7 GB RAM), cutting the monthly compute bill — with no user-visible change and a tested DB migration procedure to preserve all data across the Terraform-driven recreation.

**[DONE] INF-2 — Persist sessions in PostgreSQL**
As a logged-in user, I want my session to survive Instance-1 restarts and deployments so that I am not silently logged out mid-browse.

*Acceptance criteria:* (1) After `docker compose restart app`, an authenticated user stays logged in — no redirect to `/login`. (2) After a push-to-main deploy, sessions survive. (3) A `session` table (`sid`, `sess`, `expire`) exists in PostgreSQL after the migration runs. (4) On a fresh DB, the table is created automatically before the app accepts its first request. (5) App fails fast with a clear error if the DB is unreachable at startup. (6) Cookie behavior unchanged: `httpOnly: true`, `secure: true`, `sameSite: lax`. (7) Stale sessions are pruned automatically (`pruneSessionInterval: 3600`). (8) `npm test` passes with no new failures.

*Technical notes:* Install `connect-pg-simple`; configure in `src/session.js` using the existing `db` pool. Add `migrations/v10.sql` with `CREATE TABLE IF NOT EXISTS "session"` DDL. Update `init-db.sql`. Add `INSTANCE1_ID` to `.env.example` and `instance1_id` output to `infra/outputs.tf` (prerequisite for INF-3).

*Blocks INF-3.*

**[DONE] INF-3 — Nightly shelve/unshelve of Instance-1 via GitHub Actions**
As an admin, I want Instance-1 shelved automatically at 23:00 CET and unshelved at 06:00 CET every day so that OVH compute costs are reduced during overnight hours (~€10/month saved).

*Acceptance criteria:* (1) `.github/workflows/shelve-instance1.yml` has two scheduled jobs: `shelve` at 22:00 UTC and `unshelve` at 05:00 UTC, plus `workflow_dispatch` on both. (2) Each job calls the OVH API (`POST /cloud/project/{PROJECT_ID}/instance/{INSTANCE1_ID}/shelve|unshelve`) using the HMAC-SHA1 scheme from `src/instance-lifecycle.js`, implemented in shell with `curl` + `openssl dgst -sha1`. (3) Non-2xx OVH response → job fails and prints the error body. (4) If Instance-1 is already shelved/active when the corresponding job runs → log "skipping" and exit 0. (5) `deploy-site.yml` documents the "deploy fails while shelved" failure mode and recovery procedure. (6) DST trade-off documented in workflow comments (fixed UTC times; shelve is at midnight CEST in summer).

*Technical notes:* Credentials from GitHub secrets: `OVH_APP_KEY`, `OVH_APP_SECRET`, `OVH_CONSUMER_KEY`, `OVH_PROJECT_ID`, `INSTANCE1_ID`. Use `GET /instance/{ID}` + `jq` to check current status before acting (idempotency). OVH token scoped to Instance-1 shelve/unshelve only. Update `infra/README.md` with new secret, required token rights, and DST note.

*Requires INF-2 merged first.*
