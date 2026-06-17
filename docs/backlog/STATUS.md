# Backlog Status

One row per story. Update `Status` and `PR / Notes` when work begins or lands.

Status values: `Done` / `In Progress` / `Backlog` / `Deprecated`

| ID | Title                                                                     | Domain | Status  | PR / Notes |
| --- |---------------------------------------------------------------------------| --- |---------| --- |
| DS-1 | Avatar dropdown navigation                                                | Design System | Done    | design system implemented in early V5 work |
| DS-2 | Family Wall photo list                                                    | Design System | Done    | design system implemented in early V5 work |
| DS-3 | Photo Books album list                                                    | Design System | Done    | design system implemented in early V5 work |
| DS-4 | Inside an Album                                                           | Design System | Done    | design system implemented in early V5 work |
| DS-5 | Access Vault                                                              | Design System | Done    | design system implemented in early V5 work |
| DS-6 | Map First                                                                 | Design System | Done    | design system implemented in early V5 work |
| DS-7 | Timeline Story                                                            | Design System | Done    | design system implemented in early V5 work |
| DS-8 | The Ledger                                                                | Design System | Done    | design system implemented in early V5 work |
| DS-9 | Responsive mobile layout                                                  | Design System | Done    | design system implemented in early V5 work |
| DS-10 | Tag page design                                                           | Design System | Done    | design system implemented in early V5 work |
| DS-11 | Travel pages redesign + interactions                                      | Design System | Done    | design system implemented in early V5 work |
| DS-12 | Tag combinator redesign + interactions                                    | Design System | Done    | design system implemented in early V5 work |
| DS-13 | Photo selection redesign + interactions                                   | Design System | Done    | design system implemented in early V5 work |
| US-1 | View user list                                                            | User Management | Done    | user management implemented |
| US-2 | Create a user                                                             | User Management | Done    | user management implemented |
| US-3 | Edit a user                                                               | User Management | Done    | user management implemented |
| US-4 | Delete a user                                                             | User Management | Done    | user management implemented |
| US-5 | Reset a user's password (admin side)                                      | User Management | Done    | user management implemented |
| US-6 | Change my own password                                                    | User Management | Done    | user management implemented |
| ACC-1 | Role-aware identity card                                                  | Account | Done    | #78 |
| ACC-2 | Inline profile editing                                                    | Account | Done    | #81 |
| ACC-3 | Avatar upload and removal                                                 | Account | Done    | #81 |
| ACC-4 | Session management                                                        | Account | Done    | #82 |
| ACC-5 | Danger zone                                                               | Account | Done    | #80 |
| DS-ACC-1 | Implement two-column layout and card shell                                | Account | Done    | #89 |
| DS-ACC-2 | Header block: 130px avatar, greeting, and 5-KPI stats strip               | Account | Done    | #89 |
| DS-ACC-3 | Permission strip with role-aware can/can't pills                          | Account | Done    | #89 |
| DS-ACC-4 | Role-specific left column cards                                           | Account | Done    | #90 |
| DS-ACC-5 | Role-specific right column cards                                          | Account | Done    | #91 |
| DS-ACC-6 | Design token alignment and missing CSS                                    | Account | Done    | #88 |
| US-P1 | Upload a photo                                                            | Photos | Done    | — |
| US-P2 | Tag a photo                                                               | Photos | Done    | — |
| US-P3 | Edit a photo                                                              | Photos | Done    | — |
| US-P4 | Delete a photo                                                            | Photos | Done    | — |
| IMP-1 | Date taken from EXIF                                                      | Photos | Done    | — |
| IMP-2 | Batch upload                                                              | Photos | Done    | — |
| IMP-3 | Back buttons at the top of pages                                          | Photos | Done    | — |
| IMP-4 | Select all                                                                | Photos | Done    | — |
| IMP-5 | Consolidate tags and people display on photo detail                       | Photos | Done    | — |
| LB-1 | Lightbox / fullscreen viewer in album                                     | Photos | Done    | #97 — vanilla JS lightbox, keyboard nav, prev/next — src/routes/albums.js + albumsViews.js |
| US-A1 | Create an album                                                           | Albums | Done    | — |
| US-A2 | Add / remove photos from an album                                         | Albums | Done    | — |
| US-A3 | Edit / delete an album                                                    | Albums | Done    | — |
| MA-1 | A photo can belong to multiple albums                                     | Albums | Done    | #96 — album_photos join table, add/remove routes — src/repositories/albums.js + routes/photos.js |
| MA-2 | Photo detail shows album memberships                                      | Albums | Done    | #96 — album membership list on photo detail — src/repositories/albums.js + routes/photos.js |
| MA-3 | Manage album memberships from the photo edit form                         | Albums | Done    | #96 — transactional checklist reconciliation — src/repositories/albums.js + routes/photos.js |
| ALB-1 | Click-to-edit in album, explicit lightbox button                          | Albums | Done    | #98 — editor thumbnail → edit link, lb-btn lightbox icon — src/routes/albumsViews.js |
| ALB-2 | Context-aware back button on photo detail and edit pages                  | Albums | Done    | #98 — backLabel(from) helper, from propagated through cancel/delete — src/routes/photosViews.js |
| ALB-3 | Choose album cover photo                                                  | Albums | Done    | cover_photo_id column, POST /albums/:id/cover endpoint, UI with ★ button and gold badge — src/routes/albums.js + albumsViews.js + public/style.css |
| RA-1 | Create a snapshot album from a tag recipe                                 | Albums | Done    | #99 — POST /albums/from-recipe, transactional bulk insert — src/routes/albums.js |
| US-AC1 | Grant viewer access to an album                                           | Access Control | Done    | — |
| US-AC2 | Revoke viewer access                                                      | Access Control | Done    | — |
| US-V1 | Browse albums                                                             | Browsing | Done    | — |
| US-V2 | View album content                                                        | Browsing | Done    | — |
| US-V3 | Browse by tag                                                             | Browsing | Done    | — |
| US-V4 | Access denied                                                             | Browsing | Done    | — |
| TG-1 | Multi-tag filter                                                          | Tags | Done    | tag combinator (AND/ANY/NOT logic) — src/routes/tags/combinator.js |
| TG-2 | Tag autocomplete                                                          | Tags | Done    | /tags/autocomplete route — src/routes/tags/index.js |
| TG-3 | Clickable tags on photo detail                                            | Tags | Done    | Tags are already clickable links to /tags/{tagname} — src/routes/photosViews.js |
| US-GPS1 | Add GPS coordinates to a photo                                            | Map & GPS | Done    | — |
| US-GPS2 | View a photo's location                                                   | Map & GPS | Done    | — |
| US-GPS3 | Browse photos on a map                                                    | Map & GPS | Done    | — |
| US-GPS4 | Filter map by album or tag                                                | Map & GPS | Done    | — |
| US-GPS5 | Auto-add place tags from GPS coordinates                                  | Map & GPS | Backlog | — |
| MAP-1 | Search by location and radius                                             | Map & GPS | Done    | zone search with Haversine filter — src/routes/map.js + mapViews.js |
| US-TL1 | View photos in a timeline                                                 | Timeline | Done    | — |
| US-TL2 | Filter timeline by album or tag                                           | Timeline | Done    | — |
| US-TL3 | Photo date                                                                | Timeline | Done    | — |
| TL-4 | Filter by date range                                                      | Timeline | Done    | — |
| TL-5 | Drill into a group from "+X more"                                         | Timeline | Done    | "+X more" links to /timeline?from=&to= — timelineViews.js |
| TL-6 | Choose grouping interval                                                  | Timeline | Done    | ?group=year|month|day selector — timeline.js + timelineViews.js |
| TR-1 | Create a travel                                                           | Travel | Done    | POST /travels — src/routes/travels.js |
| TR-2 | Link content to a travel                                                  | Travel | Done    | POST /travels/:slug/api/links — src/routes/travels.js |
| TR-3 | View a travel                                                             | Travel | Done    | GET /travels/:slug (map + journal views) — src/routes/travels.js |
| TR-4 | Share a travel                                                            | Travel | Done    | POST /travels/:slug/api/share — src/routes/travels.js |
| TR-5 | Edit / delete a travel                                                    | Travel | Done    | POST /travels/:slug/edit + /delete — src/routes/travels.js |
| US-NC1 | Link a photo to Nextcloud                                                 | Nextcloud | Done    | v1.sql + edit form |
| US-NC2 | Download original from photo page                                         | Nextcloud | Done    | v1.sql + photo detail |
| US-NC3 | Manage Nextcloud link                                                     | Nextcloud | Done    | v1.sql + edit form |
| US-NC4 | Import a Nextcloud shared folder                                          | Nextcloud | Done    | #93 |
| US-NC5 | Import progress feedback                                                  | Nextcloud | Done    | #93 |
| US-NC6 | Faster Nextcloud import by downloading on Instance-1                      | Nextcloud | Done    | Sequential download+upload on Instance-1, enqueue AI jobs for Instance-2 — src/routes/nextcloudImport.js |
| US-NC7 | Link to Nextcloud folder from imported photos                             | Nextcloud | Done    | "Open in Nextcloud" button with folder URL transformation — src/routes/photosViews.js + uploadHelpers.js |
| US-NC8 | Differentiate Open in Nextcloud and Download original buttons            | Nextcloud | Done    | #124 — added nextcloudFileUrl() helper, download attribute on Download button |
| US-AI5 | Review and validate AI identification proposals                            | Local AI | Done    | Database migration v16, repository aiIdentification.js, routes aiIdentification.js, views aiIdentificationViews.js, worker updated |
| AI-1 | Duplicate photo detection                                                 | Local AI | Done    | admin-ai.js |
| AI-2 | People identification and tagging                                         | Local AI | Done    | worker.js |
| AI-3 | Manual person tagging                                                     | Local AI | Done    | #101 — POST /photos/:id/tag-person, sharp crop → S3 faces/, person_faces table (v15) — src/routes/photos.js |
| AI-4 | AI learns from manual tags                                                | Local AI | Done    | #101 — GET /internal/known-faces/:userId, worker few-shot injection — src/routes/internal.js + worker/src/worker.js |
| AI-5 | Unified people tagging with continuous learning                           | Local AI | review  | — |
| AI-6 | People tag autocomplete                                                   | Local AI | Done    | Implemented autocomplete for person name inputs using person_faces table |
| AI-7 | Identification queue dashboard                                            | Local AI | Done    | Implemented as part of US-AI5 (PR #130) |
| IQ-1 | Apply HTTP security headers and rate-limit auth routes                    | Infrastructure | Done    | #115 |
| IQ-2 | Fail CI on high-severity dependency vulnerabilities                       | Infrastructure | Done    | #115 |
| IQ-3 | Linter                                                                    | Infrastructure | Done    | package.json |
| IQ-4 | Code quality metrics                                                      | Infrastructure | Done    | package.json coverageThreshold 90/75/65/90 + scripts test pattern |
| IQ-5 | VPS hardening                                                             | Infrastructure | Done    | — |
| IQ-6 | Fix misleading audit success message in audit-check.js                    | Infrastructure | Done    | scripts/audit-check.js distinguishes zero findings vs all exempted |
| IQ-7 | Add skipSuccessfulRequests to authLimiter                                 | Hardening | Done    | src/app.js line 26 |
| IQ-8 | Cache worker npm ci in CI                                                 | Infrastructure | Done    | deploy-site.yml + deploy-worker.yml cache-dependency-path |
| IQ-9 | Unit-test audit-check.js advisory parsing logic                           | Infrastructure | Done    | scripts/audit-check.test.js comprehensive tests (340 lines) |
| IQ-10 | Document or address unmetered /uploads/:filename route                    | Hardening | Done    | src/app.js lines 71-72 comment explains intentional design |
| IQ-11 | Document Referrer-Policy override as deliberate decision                  | Hardening | Done    | src/app.js lines 56-58 comment explains choice |
| IQ-12 | Require passing workflows before merging PRs                              | Infrastructure | Done    | README.md branch protection documentation added |
| S3-1 | Photos stored in Object Storage                                           | Infrastructure | Done    | — |
| S3-2 | Transparent experience for viewers                                        | Infrastructure | Done    | — |
| S3-3 | Photo deletion removes S3 object                                          | Infrastructure | Done    | — |
| Q-1 | Upload returns immediately                                                | Infrastructure | Done    | — |
| Q-2 | Real-time identification notification                                     | Infrastructure | Done    | — |
| Q-3 | Identification resilience                                                 | Infrastructure | Done    | — |
| IV4-1 | Two-instance private architecture                                         | Infrastructure | Done    | — |
| IV4-2 | Local development with MinIO and Redis                                    | Infrastructure | Done    | — |
| IV4-3 | Worker instance on-demand lifecycle                                       | Infrastructure | Done    | — |
| INF-1 | Instance-1 right-sizing                                                   | Infrastructure | Done    | #73 |
| INF-2 | Persist sessions in PostgreSQL                                            | Infrastructure | Done    | #76 |
| INF-3 | Nightly shelve/unshclelve of Instance-1 via GitHub Actions                | Infrastructure | Done    | #79 |
| HRD-1 | Normalise cancel-button unicode character                                 | Hardening | Done    | #84 |
| HRD-2 | Improve PATCH /account name validation error message                      | Hardening | Done    | #84 |
| HRD-3 | Fix boolean coercion for notif_enabled in PATCH /account                  | Hardening | Done    | #84 |
| HRD-4 | Apply esc() to data-current attribute for notif_enabled                   | Hardening | Done    | #84 |
| HRD-5 | Add test for sharp failure path on corrupt image input                    | Hardening | Done    | #84 |
| HRD-6 | Remove S3 key from POST /account/avatar JSON response                     | Hardening | Done    | #84 |
| HRD-7 | Rate-limit PATCH /account to prevent email enumeration                    | Hardening | Done    | #84 |
| HRD-8 | Extract session TTL to a shared constant                                  | Hardening | Done    | #92 |
| HRD-9 | Add CSRF 403 tests for session revoke endpoints                           | Hardening | Done    | #92 |
| HRD-10 | Unit-test parseUserAgent and relativeTime helpers                         | Hardening | Done    | #92 |
| HRD-11 | Add 500 error path test for individual session revoke                     | Hardening | Done    | #92 |
| HRD-12 | Mock express-rate-limit in account.test.js                                | Hardening | Done    | #92 |
| BUG-1 | Tag autocompletion missing on Nextcloud import form                       | Bugs | Done    | PR #112 (fix/bug-1-tag-autocomplete-nextcloud-import) |
| BUG-2 | No debouncing on tag autocomplete input in Nextcloud import form          | Bugs | Done    | Fixed in main |
| BUG-3 | Extra leading space when inserting tag from autocomplete in Nextcloud import | Bugs | Done    | Fixed in main |
| BUG-4 | No loading state indicator for tag autocomplete in Nextcloud import       | Bugs | Done    | Fixed in main |
| BUG-5 | Duplicate tags can be added via autocomplete in Nextcloud import          | Bugs | Done    | Fixed in main |
| BUG-6 | Nextcloud import on Instance-1 doesn't work                               | Bugs | Done    | #119 — removed album_id from photos INSERT, use album_photos junction table |
| BUG-7 | Banner after Nextcloud import never disappears                           | Bugs | Done    | #119 — exposed socket as window._socket in socket-client.js |
| BUG-8 | Nextcloud import photos missing EXIF metadata                             | Bugs | Done    | #117 — added EXIF extraction in worker for Nextcloud imports |
| BUG-9 | Nextcloud buttons on photo detail page have identical behavior          | Bugs | Done    | #124 — differentiated folder vs file URLs, added download attribute |
| BUG-10 | Manual people tagging button disappears                                   | Bugs | Done    | #126 — restored Tag a person button removed during IMP-5 |
| INF-4 | Monitor Instance-1 performance during Nextcloud imports (post US-NC6)     | Infrastructure | Done | Performance logging with timing, memory usage, and slow file detection |
| Q-4 | Add rate limiting to /photos/nextcloud-import/confirm endpoint            | Infrastructure | Done | 10 requests per minute per user via confirmLimiter |
| IMP-6 | Consider parallel file downloads with concurrency limit for Nextcloud import | Performance | Done | AsyncQueue infrastructure with configurable NEXTCLOUD_IMPORT_CONCURRENCY (default 1 for sequential, set to N for parallel) |
| T-1 | Remove unused addNextcloudImportJob from producer.js                      | Cleanup | Done | Removed unused function and nextcloudImportQueue |
