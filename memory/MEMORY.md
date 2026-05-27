# Memory index

- [V2 implementation plan](project_v2_plan.md) — all phases complete ✅
- [V3 implementation plan](project_v3_plan.md) — 4 phases: MA schema → ALB+RA → DS-11/12/13 → AI-1/2
- [V4 implementation plan](project_v4_plan.md) — OVH bi-instance, S3, BullMQ, socket.io — Express/JS (not NestJS) ✅
- [V5 implementation plan](project_v5_plan.md) — 4 tracks: INF-1 downsize, NC-1 Nextcloud import, AI-1 learning, FE-1 user page
- [Jest mock reset](feedback_jest_mocks.md) — use resetAllMocks not clearAllMocks; prevents stale mockResolvedValueOnce bleed
- [Promise.all mock ordering](feedback_promise_all_mock_order.md) — db.query mock queue must follow Promise.all execution order; always comment the order
- [Branch discipline](feedback_branch_discipline.md) — always work on a feature branch, never commit directly to main
