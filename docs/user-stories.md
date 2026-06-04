# User Stories

This document contains all user stories for SitePhoto, organized by feature domain. Stories follow the format:

```
**CODE-N — Short imperative title**
As a [role], I can [concrete action], [optional: when/where context], so [the value it delivers].
```

Roles: `logged-in user`, `viewer`, `editor`, `admin`

---

## Design System

**DS-1 — Avatar dropdown navigation**
As a logged-in user, I can access my profile and account settings from an avatar dropdown menu, so I can quickly navigate to user-specific features.

**DS-2 — Family Wall photo list**
As a logged-in user, I can browse photos in a masonry layout (Family Wall), so I can efficiently view many photos at once.

**DS-3 — Photo Books album list**
As a logged-in user, I can view my albums displayed as photo book covers, so I can easily find and recognize my albums.

**DS-4 — Inside an Album**
As a logged-in user, I can browse photos within an album with thumbnails and metadata, so I can view and manage album contents.

**DS-5 — Access Vault**
As a logged-in user, I can access the access control interface (Access Vault), so I can manage who can view my shared content.

**DS-6 — Map First**
As a logged-in user, I can view a map-first interface for location-based browsing, so I can explore photos by where they were taken.

**DS-7 — Timeline Story**
As a logged-in user, I can view photos in a timeline format, so I can browse my photos chronologically.

**DS-8 — The Ledger**
As a logged-in user, I can view a ledger-style list of recent activity, so I can track what's been happening in my account.

**DS-9 — Responsive mobile layout**
As a logged-in user, I can use the application on mobile devices with an optimized layout, so I can access my photos anywhere.

**DS-10 — Tag page design**
As a logged-in user, I can view a dedicated tag management page with a clean design, so I can organize my photos by tags.

**DS-11 — Travel pages redesign**
As a logged-in user, I can view travel pages with redesigned layout and interactions, so I can better explore travel-related content.

**DS-12 — Tag combinator redesign**
As a logged-in user, I can use the advanced tag filter combinator with improved interactions, so I can create complex tag queries.

**DS-13 — Photo selection redesign**
As a logged-in user, I can select photos with a redesigned interaction model, so I can manage multiple photos efficiently.

---

## User Management

**US-1 — View user list**
As an admin, I can view the list of all registered users, so I can manage the user base.

**US-2 — Create a user**
As an admin, I can create a new user account, so I can add family members to the site.

**US-3 — Edit a user**
As an admin, I can edit an existing user's details, so I can update user information or change roles.

**US-4 — Delete a user**
As an admin, I can delete a user account, so I can remove users who no longer need access.

**US-5 — Reset a user's password**
As an admin, I can reset a user's password, so I can help users who have forgotten their credentials.

**US-6 — Change my own password**
As a logged-in user, I can change my own password, so I can maintain my account security.

---

## Account Page

**ACC-1 — Role-aware identity card**
As a logged-in user, I can see a role-aware identity card on my account page, so I can see my role and permissions at a glance.

**ACC-2 — Inline profile editing**
As a logged-in user, I can edit my profile information inline, so I can update my details without navigating away.

**ACC-3 — Avatar upload and removal**
As a logged-in user, I can upload or remove my avatar image, so I can personalize my account.

**ACC-4 — Session management**
As a logged-in user, I can see the list of my active sessions and revoke any of them, so I can sign out of forgotten devices.

- Each session row shows: browser/device name, last-seen date, and a "sign out" button
- "Sign out all other devices" revokes everything except the current session
- Revoking the current session redirects to /login
- Sessions are stored in the DB (not in-memory) so the list survives server restarts

**ACC-5 — Danger zone**
As a logged-in user, I can access a danger zone with sensitive actions, so I can perform account-level operations with appropriate warnings.

---

## Account Page — Design System

**DS-ACC-1 — Implement two-column layout and card shell**
As a logged-in user, I can see my account page with a two-column layout and card-based design, so the information is well-organized and visually appealing.

**DS-ACC-2 — Header block: 130px avatar, greeting, and 5-KPI stats strip**
As a logged-in user, I can see a header block with my avatar, greeting message, and key stats, so I have immediate visibility into my account activity.

**DS-ACC-3 — Permission strip with role-aware can/can't pills**
As a logged-in user, I can see a permission strip showing what I can and cannot do based on my role, so my capabilities are clear.

**DS-ACC-4 — Role-specific left column cards**
As a logged-in user, I can see role-specific cards in the left column of my account page, so the interface adapts to my permissions.

**DS-ACC-5 — Role-specific right column cards**
As a logged-in user, I can see role-specific cards in the right column of my account page, so I have access to all relevant features for my role.

**DS-ACC-6 — Design token alignment and missing CSS**
As a logged-in user, I can see a visually consistent account page that uses the design system tokens, so the experience is cohesive.

---

## Photos

**US-P1 — Upload a photo**
As an editor, I can upload a photo, so I can add images to my collection.

**US-P2 — Tag a photo**
As an editor, I can add tags to a photo, so I can categorize and find my photos later.

**US-P3 — Edit a photo**
As an editor, I can edit photo metadata, so I can update information after upload.

**US-P4 — Delete a photo**
As an editor, I can delete a photo, so I can remove photos I no longer want.

**IMP-1 — Date taken from EXIF**
As an editor, I can have the date taken extracted from EXIF metadata automatically when uploading, so my photos have accurate timestamps without manual entry.

**IMP-2 — Batch upload**
As an editor, I can upload multiple photos at once, so I can add many photos efficiently.

**IMP-3 — Back buttons at the top of pages**
As a logged-in user, I can see back buttons at the top of pages, so I can navigate back easily.

**IMP-4 — Select all**
As an editor, I can select all photos on a page, so I can perform bulk operations efficiently.

**LB-1 — Lightbox / fullscreen viewer in album**
As a logged-in user, I can view photos in a lightbox/fullscreen viewer within albums, so I can see photos at full size with keyboard navigation.

- Vanilla JS lightbox implementation
- Keyboard navigation (prev/next)
- Source: src/routes/albums.js + albumsViews.js

---

## Albums

**US-A1 — Create an album**
As an editor, I can create a new album, so I can organize my photos into collections.

**US-A2 — Add / remove photos from an album**
As an editor, I can add or remove photos from an album, so I can manage album contents flexibly.

**US-A3 — Edit / delete an album**
As an editor, I can edit or delete an album, so I can maintain my album organization.

**IMP-5 — One album per photo**
As an editor, I can ensure each photo can belong to only one album at a time, so the data model is simple and predictable.

**MA-1 — A photo can belong to multiple albums**
As an editor, I can add a photo to multiple albums, so I can organize the same photo in different collections without duplication.

- Uses album_photos join table
- Source: src/repositories/albums.js + routes/photos.js

**MA-2 — Photo detail shows album memberships**
As a logged-in user, I can see which albums a photo belongs to on the photo detail page, so I can understand the photo's organization.

- Source: src/repositories/albums.js + routes/photos.js

**MA-3 — Manage album memberships from the photo edit form**
As an editor, I can manage which albums a photo belongs to from the photo edit form, so I can update album memberships in one place.

- Transactional checklist reconciliation
- Source: src/repositories/albums.js + routes/photos.js

**ALB-1 — Click-to-edit in album, explicit lightbox button**
As an editor, I can click on album thumbnails to edit them directly, with a separate explicit lightbox button, so I have both quick edit and full-view options.

- Editor thumbnail links to edit
- lb-btn lightbox icon
- Source: src/routes/albumsViews.js

**ALB-2 — Context-aware back button on photo detail and edit pages**
As a logged-in user, I can use a back button that returns me to the appropriate previous page, so navigation is intuitive.

- backLabel(from) helper
- from propagated through cancel/delete
- Source: src/routes/photosViews.js

**RA-1 — Create a snapshot album from a tag recipe**
As an editor, I can create a snapshot album from a tag recipe, so I can materialize a saved search as an album.

- POST /albums/from-recipe
- Transactional bulk insert
- Source: src/routes/albums.js

---

## Access Control

**US-AC1 — Grant viewer access to an album**
As an editor, I can grant a viewer access to one of my albums, so they can view the photos in that album.

**US-AC2 — Revoke viewer access**
As an editor, I can revoke a viewer's access to my album, so they can no longer view it.

---

## Browsing

**US-V1 — Browse albums**
As a logged-in user, I can browse through albums, so I can find and view my photos.

**US-V2 — View album content**
As a logged-in user, I can view the content of an album I have access to, so I can see the photos and information.

**US-V3 — Browse by tag**
As a logged-in user, I can browse photos filtered by tag, so I can find photos with specific tags.

**US-V4 — Access denied**
As a logged-in user, I can see an access denied page when I try to view content I don't have permission for, so I understand I can't view that content.

---

## Tags

**TG-1 — Multi-tag filter**
As a logged-in user, I can filter photos using AND/ANY/NOT logic on multiple tags, so I can create complex searches.

- Tag combinator with AND/ANY/NOT logic
- Source: src/routes/tags/combinator.js

**TG-2 — Tag autocomplete**
As a logged-in user, I can get tag suggestions as I type, so I can quickly find and apply tags.

- Route: /tags/autocomplete
- Source: src/routes/tags/index.js

---

## Map & GPS

**US-GPS1 — Add GPS coordinates to a photo**
As an editor, I can add GPS coordinates to a photo, so I can track where it was taken.

**US-GPS2 — View a photo's location**
As a logged-in user, I can view a photo's location on a map, so I can see where it was taken.

**US-GPS3 — Browse photos on a map**
As a logged-in user, I can browse all my photos on a map, so I can explore my collection geographically.

**US-GPS4 — Filter map by album or tag**
As a logged-in user, I can filter the map view by album or tag, so I can focus on specific subsets of my photos.

**MAP-1 — Search by location and radius**
As a logged-in user, I can search for photos within a specific radius of a location, so I can find photos taken near a particular place.

- Zone search with Haversine filter
- Source: src/routes/map.js + mapViews.js

---

## Timeline

**US-TL1 — View photos in a timeline**
As a logged-in user, I can view my photos arranged in a timeline, so I can see them chronologically.

**US-TL2 — Filter timeline by album or tag**
As a logged-in user, I can filter the timeline view by album or tag, so I can focus on specific subsets of my photos over time.

**US-TL3 — Photo date**
As a logged-in user, I can see the date each photo was taken, so I can understand when it was captured.

**TL-4 — Filter by date range**
As a logged-in user, I can filter photos by a date range in the timeline, so I can focus on a specific time period.

**TL-5 — Drill into a group from "+X more"**
As a logged-in user, I can click on "+X more" in the timeline to drill into a group of photos, so I can see all photos in that time period.

- Links to /timeline?from=&to=
- Source: timelineViews.js

**TL-6 — Choose grouping interval**
As a logged-in user, I can choose how photos are grouped in the timeline (year/month/day), so I can view my photos at the appropriate granularity.

- ?group=year|month|day selector
- Source: timeline.js + timelineViews.js

---

## Travel

**TR-1 — Create a travel**
As an editor, I can create a travel record with a name and description, so I can organize trips and journeys.

- POST /travels
- Source: src/routes/travels.js

**TR-2 — Link content to a travel**
As an editor, I can link photos and albums to a travel, so I can associate content with specific trips.

- POST /travels/:slug/api/links
- Source: src/routes/travels.js

**TR-3 — View a travel**
As a logged-in user, I can view a travel's details including its map and journal views, so I can experience the trip chronologically and geographically.

- GET /travels/:slug (map + journal views)
- Source: src/routes/travels.js

**TR-4 — Share a travel**
As an editor, I can share a travel with other users, so they can view the travel content.

- POST /travels/:slug/api/share
- Source: src/routes/travels.js

**TR-5 — Edit / delete a travel**
As an editor, I can edit or delete a travel, so I can manage my travel records.

- POST /travels/:slug/edit + /delete
- Source: src/routes/travels.js

---

## Nextcloud

**US-NC1 — Link a photo to Nextcloud**
As an editor, I can link a photo to its original in Nextcloud, so I can maintain a connection to the source file.

- Database: v1.sql
- UI: edit form

**US-NC2 — Download original from photo page**
As a logged-in user, I can download the original file from Nextcloud via the photo page, so I can access the high-resolution version.

- Database: v1.sql
- UI: photo detail

**US-NC3 — Manage Nextcloud link**
As an editor, I can manage the Nextcloud link for a photo, so I can update or remove the connection.

- Database: v1.sql
- UI: edit form

**US-NC4 — Import a Nextcloud shared folder**
As an editor, I can import all photos from a Nextcloud shared folder, so I can bulk add photos from Nextcloud.

- PR: #93
- Async import via BullMQ
- Real-time progress feedback

**US-NC5 — Import progress feedback**
As an editor, I can see real-time progress during Nextcloud folder import, so I know the status of my import.

- PR: #93
- Socket.io notifications

---

## Local AI

**AI-1 — Duplicate photo detection**
As an admin, I can detect duplicate photos automatically, so I can avoid storing the same photo multiple times.

- Source: admin-ai.js

**AI-2 — People identification and tagging**
As a logged-in user, I can have the system automatically identify and tag people in photos, so I don't have to manually tag everyone.

- Worker: worker.js

**AI-3 — Manual person tagging**
As a logged-in user, I can manually tag a person in a photo by drawing a bounding box, so I can identify people the AI might miss.

- POST /photos/:id/tag-person
- Uses sharp to extract crop
- Stores crop in S3 (faces/)
- Stores in person_faces table (v15)
- Source: src/routes/photos.js
- PR: #101

**AI-4 — AI learns from manual tags**
As a logged-in user, I can have the AI improve its recognition over time based on my manual tags, so it gets better at identifying people.

- GET /internal/known-faces/:userId
- Worker few-shot injection
- Source: src/routes/internal.js + worker/src/worker.js
- PR: #101

---

## Infrastructure

**IQ-1 — Application security hardening**
As a developer, I audit and fix all injection vectors (SQL injection, XSS, path traversal, CSRF) and ensure no known CVEs exist in production dependencies, so the application is safe to expose on a public server.

- PR: #102
- Helmet with explicit HSTS/frameguard/noSniff/referrerPolicy/CSP + Permissions-Policy header
- authLimiter (10 req/15 min) on /login + /register
- globalLimiter (300 req/min) on all non-static routes
- Source: src/app.js

**IQ-2 — Dependency CVE monitoring**
As a developer, I run an automated CVE check on every dependency in CI, so vulnerabilities are caught before they reach production.

- PR: #102
- scripts/audit-check.js reads npm audit --json
- Applies .npm-audit-exceptions exemptions
- Exits 1 on unexempted high/critical
- Wired in CI for both app and worker
- Source: .github/workflows/deploy-site.yml

**IQ-3 — Linter**
As a developer, I add ESLint to the project with a consistent rule set, so code style is enforced automatically and obvious errors are caught before review.

- package.json

**IQ-4 — Code quality metrics**
As a developer, I track test coverage (% of lines/branches exercised), code duplication (duplicated blocks), and function length (lines per function) so I can measure and improve maintainability over time.

- PR: #102
- npm run test:coverage in CI
- coverageThreshold in package.json (90% statements/lines, 75% branches, 65% functions)
- Coverage artifact uploaded on every run
- Source: .github/workflows/deploy-site.yml

**IQ-5 — VPS hardening**
As a sysadmin, I apply VPS-level security measures (SSH key-only auth, firewall rules, automatic security updates, fail2ban or equivalent), so the server is not trivially compromised.

- Status: Done

**IQ-6 — Fix misleading audit success message in audit-check.js**
As a developer reading CI output, I can tell at a glance whether the audit step passed because no vulnerabilities exist or because all findings were manually exempted, so I never mistake a clean tree for an exempted one.

- PR: #102 (feat/iq-6-to-11)
- processAuditReport distinguishes zero-findings from all-exempted
- No high/critical advisories found vs All high/critical advisories are exempted
- Source: scripts/audit-check.js

**IQ-7 — Add skipSuccessfulRequests: true to authLimiter**
As a legitimate user, I can log in successfully from multiple devices or manage sessions without triggering the brute-force lockout, because the auth rate limiter only counts failed login attempts, not successful ones.

- PR: #102 (feat/iq-6-to-11)
- authLimiter in src/app.js configured with skipSuccessfulRequests: true
- Source: src/app.js

**IQ-8 — Cache worker npm ci in CI to speed up the audit step**
As a developer, I want the Audit worker dependencies step in deploy-site.yml to benefit from setup-node's dependency cache, so the npm ci in worker/ does not re-download the full dependency tree on every run.

- PR: #102 (feat/iq-6-to-11)
- cache-dependency-path covers both package-lock.json (root) and worker/package-lock.json
- Source: .github/workflows/deploy-site.yml

**IQ-9 — Unit-test audit-check.js advisory parsing logic**
As a developer, I want a Jest test file covering the advisory parsing logic in scripts/audit-check.js, so regressions in exception matching, NaN handling, or severity filtering are caught before CI.

- PR: #102 (feat/iq-6-to-11)
- 7 describe blocks covering clean/unexempted/exempted/mixed/severity/null-exceptions/transitive cases
- processAuditReport exported as pure function returning { exitCode, lines }
- Source: src/__tests__/audit-check.test.js

**IQ-10 — Add dedicated rate limiter to the /uploads/:filename route**
As a developer, I want a recorded decision on whether the public photo-serving route requires rate-limiting or authentication, so the current absence of a rate limit is intentional and visible in code, not an oversight.

- PR: #102 (feat/iq-6-to-11)
- uploadLimiter: 200 req/min per IP
- Applied before globalLimiter in app.js
- Rationale comment: S3 keys are UUIDs so not enumerable, but a known key can be replayed without bound
- Source: src/app.js

**IQ-11 — Document Referrer-Policy override as deliberate decision**
As a developer reading src/app.js, I can see why Referrer-Policy is set to strict-origin-when-cross-origin instead of Helmet 8's default no-referrer, so no future reviewer removes it thinking it is accidental.

- PR: #102 (feat/iq-6-to-11)
- 5-line comment in Helmet block explains cross-origin navigations to map tile providers require Origin forwarding
- Source: src/app.js

---

## Infrastructure & Storage

**S3-1 — Photos stored in Object Storage**
As an editor uploading a photo, the file is stored in OVH Object Storage (S3-compatible bucket) rather than on the server's local disk, so storage capacity is decoupled from the server, and photos are not lost if the server is replaced.

**S3-2 — Transparent experience for viewers**
As a viewer, browsing, downloading, and viewing photos works exactly as before, the migration to S3 storage is invisible to me.

**S3-3 — Photo deletion removes S3 object**
As an editor or admin deleting a photo, the file is removed from the S3 bucket at the same time as the database record, so no orphaned objects accumulate in storage.

---

## Queue & Async Processing

**Q-1 — Upload returns immediately**
As an editor uploading a photo, the upload response is instant. People identification runs in the background on a dedicated worker, so I am never blocked waiting for the AI to finish.

**Q-2 — Real-time identification notification**
As an editor, after uploading a photo I see an Identification in progress... badge on it. When the worker finishes, the suggested people tags appear on the photo in real time without reloading the page.

**Q-3 — Identification resilience**
As an editor, if the worker is offline when I upload, the identification job is held in the queue and runs automatically when the worker comes back online, no photo is silently skipped.

---

## Instance Architecture

**IV4-1 — Two-instance private architecture**
As a developer, the site runs on two OVH Public Cloud instances connected over a private vRack network: Instance-1 runs the Express app and PostgreSQL; Instance-2 runs the Node.js worker and Ollama. Redis is exposed only on the private network. Inter-instance HTTP calls are authenticated with a shared secret.

**IV4-2 — Local development with MinIO and Redis**
As a developer, running docker compose up locally starts a MinIO container (S3-compatible) and a Redis container alongside the app and worker, so the full async flow can be tested without any cloud account.

**IV4-3 — Worker instance on-demand lifecycle**
As a developer, Instance-2 starts automatically when a job enters the queue and shuts down (shelved, not billed) after a configurable period of inactivity, so compute cost is proportional to actual usage.

---

## Instance Management

**INF-1 — Instance-1 right-sizing**
As an admin, Instance-1 is resized from b3-8 to b2-7 (2 vCPU, 7 GB RAM), cutting the monthly compute bill, with no user-visible change and a tested DB migration procedure to preserve all data across the Terraform-driven recreation.

- PR: #73

**INF-2 — Persist sessions in PostgreSQL**
As a logged-in user, I want my session to survive Instance-1 restarts and deployments so that I am not silently logged out mid-browse.

- PR: #76
- Acceptance criteria:
  1. After docker compose restart app, authenticated user stays logged in
  2. After push-to-main deploy, sessions survive
  3. session table (sid, sess, expire) exists in PostgreSQL
  4. On fresh DB, table created automatically before first request
  5. App fails fast with clear error if DB unreachable at startup
  6. Cookie behavior unchanged: httpOnly: true, secure: true, sameSite: lax
  7. Stale sessions pruned automatically (pruneSessionInterval: 3600)
  8. npm test passes with no new failures

**INF-3 — Nightly shelve/unshelve of Instance-1 via GitHub Actions**
As an admin, I want Instance-1 shelved automatically at 23:00 CET and unshelved at 06:00 CET every day so that OVH compute costs are reduced during overnight hours (~€10/month saved).

- PR: #79
- Acceptance criteria:
  1. .github/workflows/shelve-instance1.yml has scheduled jobs at 22:00 UTC (shelve) and 05:00 UTC (unshelve)
  2. Each job calls OVH API with HMAC-SHA1 scheme
  3. Non-2xx OVH response → job fails and prints error
  4. If already shelved/active → log skipping and exit 0
  5. deploy-site.yml documents deploy fails while shelved failure mode
  6. DST trade-off documented (fixed UTC times)

---

## Hardening

**HRD-1 — Normalise cancel-button unicode character**
As a developer, I want the cancel button in inline profile editing to use the project-standard unicode character so that the UI is visually consistent.

- PR: #84
- Changed from ✕ (U+2715) to ✗ (U+2717) to match project convention

**HRD-2 — Improve PATCH /account name validation error message**
As a logged-in user, when I submit a name that is too long, I receive a clear error message explaining the constraint, so I know exactly what to fix.

- PR: #84
- Message: Name must be 1–100 characters

**HRD-3 — Fix boolean coercion for notif_enabled in PATCH /account**
As a developer, I want the server to reject a string false for notif_enabled rather than silently coercing it to true, so client-side bugs surface immediately rather than corrupting user preferences.

- PR: #84
- Explicit type check: typeof notif_enabled !== 'boolean'

**HRD-4 — Apply esc() to data-current attribute for notif_enabled**
As a developer, I want data-current=${profile.notif_enabled} in page.js to pass through esc() like every other interpolated value, so the escaping pattern is consistent and future values cannot accidentally break it.

- PR: #84
- Consistent escaping convention

**HRD-5 — Add test for sharp failure path on corrupt image input**
As a developer, I want a test that exercises the catch block on sharp(...).toBuffer() in POST /account/avatar, so the error response for a corrupt image is verified and the branch cannot silently regress.

- PR: #84
- Mocks sharp to throw error
- Asserts 500 response with Image processing failed

**HRD-6 — Remove S3 key from POST /account/avatar JSON response**
As a developer, I want the avatar upload response to omit the raw S3 key, so internal storage details are not unnecessarily disclosed to the client.

- PR: #84
- Removed key field from response
- Client only needs avatarUrl

**HRD-7 — Rate-limit PATCH /account to prevent email enumeration**
As a developer, I want PATCH /account to be rate-limited so that an authenticated user cannot rapidly enumerate registered email addresses via the 409 conflict response.

- PR: #84
- Rate limit of ~10 requests per minute per user

**HRD-8 — Extract session TTL to a shared constant**
As a developer, I want the 7-day session TTL defined in a single shared constant so that changing the cookie maxAge automatically keeps the last seen calculation in sync.

- PR: #92
- SESSION_MAX_AGE_MS exported from src/session.js or src/constants.js

**HRD-9 — Add CSRF 403 tests for session revoke endpoints**
As a developer, I want account.test.js to assert that DELETE /account/sessions and DELETE /account/sessions/:sid return 403 when the X-CSRF-Token header is absent, so removing the CSRF middleware from app.js cannot go undetected.

- PR: #92
- Two test cases: bulk and individual session revoke
- CSRF middleware wired in makeApp

**HRD-10 — Unit-test parseUserAgent and relativeTime helpers**
As a developer, I want direct unit tests for the parseUserAgent and relativeTime private helpers in account.js so that missing branches are caught before integration.

- PR: #92
- Exports helpers or moves to src/utils/session-helpers.js
- Tests cover: Edge/Windows, Mobile Safari/iPhone, Firefox/Linux, truncation fallback, null/invalid input, singular/plural forms

**HRD-11 — Add 500 error path test for individual session revoke**
As a developer, I want DELETE /account/sessions/:sid to have a returns 500 when db.query rejects test, matching the equivalent test that already exists for the bulk revoke endpoint.

- PR: #92
- Consistent error-path coverage

**HRD-12 — Mock express-rate-limit in account.test.js**
As a developer, I want express-rate-limit mocked in account.test.js so that sessionRevokeLimiter's in-memory store cannot cause spurious 429 responses as the test suite grows.

- PR: #92
- jest.mock('express-rate-limit', () => () => (req, res, next) => next())
- Matches pattern used by avatar tests

---

## Status Reference

For the most up-to-date implementation status, see [docs/backlog/STATUS.md](docs/backlog/STATUS.md).

All stories in this document are currently implemented and marked as Done in STATUS.md.

---

## Version History

- **V5**: Account page, Nextcloud import, AI learning from manual tags, Instance-1 right-sizing
- **V4**: Core features (photos, albums, tags, users, map, timeline, travels)
- **Earlier**: Foundation and infrastructure

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.
