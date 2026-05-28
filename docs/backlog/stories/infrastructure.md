# Infrastructure & Quality

**IQ-1 — Application security hardening**
As a developer, I audit and fix all injection vectors (SQL injection, XSS, path traversal, CSRF) and ensure no known CVEs exist in production dependencies, so the application is safe to expose on a public server.

**IQ-2 — Dependency CVE monitoring**
As a developer, I run an automated CVE check on every dependency (e.g. `npm audit`) in CI so that vulnerabilities are caught before they reach production.

**IQ-3 — Linter**
As a developer, I add ESLint (or equivalent) to the project with a consistent rule set, so code style is enforced automatically and obvious errors are caught before review.

**IQ-4 — Code quality metrics**
As a developer, I track test coverage (% of lines/branches exercised), code duplication (duplicated blocks), and function length (lines per function) so I can measure and improve maintainability over time.

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
