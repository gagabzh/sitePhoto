# Analyse du DevOps Agent + Recommandations

## 📊 Vue d'Ensemble Actuelle

Votre agent DevOps est **exceptionnellement bon** : très précis, documentation claire, patterns établis, edge cases documentés.

**Points Forts** ⭐:
- Stack clairement défini (OVH, Terraform, Docker Compose, GitHub Actions)
- Critical knowledge bien documenté (cloud-init, Redis, SSH, Terraform quirks)
- Common debugging commands listé
- Cloud-init pitfalls explicites
- OVH API authentication documented
- Instance lifecycle (shelve/unshelve) bien expliqué
- Git workflow strict (branch-based)
- Secrets management clear

**Points À Améliorer** ⚠️ (Pour intégration avec PO + Planner + Dev + QA):
1. **Pas de clarté sur "readiness" de task DevOps** — DevOps assument que task est prête
2. **Pas de coordination avec Planner** — DevOps ne savent pas quand les tâches sont bloquées
3. **Pas de communication des blockers** — Si DevOps découvre un blocker, où l'escalader?
4. **Pas de test strategy pour infra changes** — Comment valider une déploiement?
5. **Pas de Definition of Done pour DevOps** — "Done" implicite pour tâches infra
6. **Pas de séparation Dev vs Infra PRs** — Règles claires de ce qui va où
7. **Pas de process pour rollback** — Si déploiement fails, comment revenir?
8. **Pas de communication avec QA** — QA ne sait pas quand infra est prête pour test

---

## 🔄 Workflow Actuel (Problématique)

```
Dev push PR → GitHub Actions auto-deploy
    ↓
Infrastructure issue discovered during prod test
    ↓
DevOps scrambles to fix (no clear process)
    ↓
Timeline slips
```

---

## ✅ Workflow Amélioré (Proposé)

```
Planner identify infra task (INF-1, NC-1 setup, etc.)
    ↓
Planner + DevOps coordinate
    ├─ DevOps: "What's the test/validation plan?"
    ├─ DevOps: "Any dependencies blocking this?"
    └─ DevOps: "What's the rollback plan if fail?"
    ↓
DevOps create task with Definition of Done (infra specific)
    ↓
DevOps execute (follow DoD)
    ↓
DevOps validate (self-test + reporting)
    ↓
QA approves (infrastructure ready for app deployment)
    ↓
Dev deploy app (infrastructure stable underneath)
```

---

## 🎯 Les 7 Améliorations Recommandées

### 1. **Infrastructure Task Readiness Checklist**

Avant de toucher la production, DevOps doit vérifier:

```markdown
## Infrastructure Task Readiness

When you receive an infrastructure task, verify:

- [ ] Task description clear? (What change, why, expected outcome)
- [ ] Impact analyzed? (Which services affected, which users)
- [ ] Dependencies clear? (Other infra tasks must complete first)
- [ ] Rollback plan documented? (How to revert if fails)
- [ ] Testing strategy defined? (How to validate change)
- [ ] Blockers identified? (Known risks, prerequisites)
- [ ] Deployment window clear? (Maintenance window needed?)
- [ ] Monitoring plan? (How to detect issues after deploy)
- [ ] Scaling implications? (Will this affect capacity?)
- [ ] Security impact? (Firewall, SSH, encryption changes?)

If ANY box is unchecked → Ask Planner for clarification before proceeding.

This prevents:
- Unexpected production issues
- Missing rollback plans
- Uncoordinated deployments
```

### 2. **Definition of Done (Infra-Specific)**

DevOps equivalent of Dev DoD:

```markdown
## Infrastructure Definition of Done

An infrastructure change is complete when:

### Planning & Documentation
- [ ] Task has clear acceptance criteria
- [ ] Rollback plan documented (detailed steps)
- [ ] Impact analysis complete (services, users, capacity)
- [ ] Testing strategy defined (validation approach)
- [ ] Monitoring plan documented (health checks, alerts)

### Implementation
- [ ] Change applied to non-prod first (staging, dev)
- [ ] Self-tested on non-prod (works as expected)
- [ ] Terraform validated (`terraform plan` reviewed)
- [ ] Cloud-init validated (no syntax errors)
- [ ] No hardcoded secrets in code (only env vars)
- [ ] Documentation updated (infra/README.md, runbooks)

### Production Deployment
- [ ] Backup taken (DB snapshot, disk snapshot)
- [ ] Deployment window scheduled (or confirmed off-peak)
- [ ] Team notified (Slack, standup)
- [ ] Monitoring enabled (dashboards, alerts active)
- [ ] Applied with test (ping, health check, smoke test)

### Post-Deployment
- [ ] Health checks pass (app, DB, Redis)
- [ ] Logs clean (no errors, warnings expected?)
- [ ] Performance metrics normal (CPU, memory, disk)
- [ ] Users report no issues (spot check)
- [ ] Rollback tested (plan is actually executable)

### Documentation
- [ ] Runbook created (how to manage this going forward)
- [ ] Lessons learned documented (what went well, what didn't)
- [ ] Team trained (if new process)

If ANY checkbox is unchecked → Fix before marking complete.
```

### 3. **Coordination with Planner & Dev**

DevOps not in isolation:

```markdown
## Infrastructure Task Coordination

### When Planner assigns infra task:

1. DevOps reads task (checks readiness checklist)

2. If questions → Ask Planner:
   - "What's the failure mode if this breaks?"
   - "Can this be done off-peak?"
   - "Which services depend on this?"
   - "Rollback strategy clear?"

3. DevOps proposes:
   - Implementation approach
   - Timeline estimate (how long, what window)
   - Risk assessment (likelihood of issues)
   - Rollback plan (detailed steps)

4. Planner confirms or adjusts

### When Dev needs to deploy after infra change:

1. Dev checks with DevOps: "Infrastructure ready?"

2. DevOps validates:
   - All health checks pass
   - Monitoring is live
   - Rollback tested

3. DevOps approves: "Ready for app deployment"

4. Dev deploy app (knowing infra is stable)

### When infra issues discovered during dev testing:

1. Dev reports to Planner: "Infra blocker: [description]"

2. Planner escalates to DevOps

3. DevOps fixes + validates

4. Planner unblocks dependent tasks
```

### 4. **Rollback Plan Documentation**

Every change must have a rollback:

```markdown
## Rollback Plan Template

For every infrastructure change, document:

**Change**: [What changed]
**Reason**: [Why this change]
**Expected Outcome**: [What should improve]

**Rollback Plan**:
1. [Specific step 1] (e.g., "terraform apply" to previous state)
2. [Specific step 2] (e.g., "docker compose up" with old image)
3. [Validation step] (e.g., "health check X returns 200")

**Rollback Conditions**:
- If [symptom], then rollback
- Example: "If app container keeps restarting, rollback"

**Estimated Rollback Time**: [How long to execute]

**Testing**:
- [ ] Rollback plan tested on staging
- [ ] Actually executable (not theoretical)
- [ ] Team trained on procedure

Example (INF-1: Downsize Instance-1):

Change: Downsize Instance-1 from b3-8 to b3-4
Reason: Save €X/month
Expected Outcome: App runs on smaller instance

Rollback Plan:
1. pg_dump from current DB (already done as backup)
2. Delete current b3-4 instance in Terraform
3. Apply Terraform with instance1_flavor = "b3-8"
4. Restore DB from backup snapshot
5. Run health check: curl https://sitephoto.com/health

Rollback Conditions:
- If app CPU usage > 90% after 1 hour
- If API response time > 2s after 1 hour
- If memory usage > 90% after 1 hour

Estimated Rollback Time: 45 minutes

Testing:
- [x] Tested recovery from snapshot on staging
- [x] Terraform rollback plan validated
- [x] Team walked through steps
```

### 5. **Infrastructure Testing & Validation**

How to verify infra changes:

```markdown
## Infrastructure Validation Checklist

After deploying infrastructure change, verify:

### Service Health
- [ ] App container is running (docker compose ps)
- [ ] App logs show no errors (docker compose logs app | grep ERROR)
- [ ] HTTP health endpoint returns 200 (curl https://sitephoto.com/health)
- [ ] Database responds (docker compose exec db psql -c "SELECT 1")
- [ ] Redis responds (redis-cli ping)
- [ ] Worker is running (docker compose ps on Instance-2)

### Performance Baseline
- [ ] CPU usage < 80% (vmstat 1 5 | tail -1 | awk '{print 100-$15}'%)
- [ ] Memory usage < 80% (free -h | awk 'NR==2 {printf "%.0f%%\n", ($3/$2)*100}')
- [ ] Disk usage < 80% (df -h / | awk 'NR==2 {print $5}')
- [ ] Network stable (no packet loss, latency normal)

### Application Smoke Tests
- [ ] Login works (test account credentials)
- [ ] Photo upload works (upload small test photo)
- [ ] Photo display works (view uploaded photo)
- [ ] Search works (query returns results)

### Monitoring Active
- [ ] Dashboard showing metrics (CPU, memory, disk, network)
- [ ] Alerts configured (app down, CPU high, disk full)
- [ ] Log aggregation working (logs visible in service)

If ANY check fails → Investigate before declaring success.
```

### 6. **Blocker Communication & Tracking**

DevOps blockers escalate to Planner:

```markdown
## Infrastructure Blocker Format

When DevOps discovers a blocker, report to Planner:

**Blocker**: [Code-DevOps-N]
  Description: [What's blocked?]
  Type: [Hardware, Quota, API, Dependency]
  Severity: [Critical, High, Medium]
  Impact: [Which dev tasks are blocked?]
  Status: [OPEN, INVESTIGATING, WAITING, UNBLOCKED]
  Owner: [DevOps, OVH support, External]
  Resolve by: [Date or condition]
  Next steps: [What needs to happen]

Example:

Blocker: INF-1-QUOTA
  Description: Instance flavor b3-4 not available in GRA11 region
  Type: Quota
  Severity: Critical
  Impact: INF-1 task (Instance downsize) blocked
  Status: INVESTIGATING
  Owner: OVH Support
  Resolve by: Contact OVH support for quota increase
  Next steps: File support ticket, wait 24h for response
```

### 7. **Separation of Dev vs Infra PRs**

Clear boundary between code and infrastructure:

```markdown
## PR Type Separation

### DevOps PRs (infrastructure, CI/CD, configs)
- Terraform changes (terraform.tfvars NOT committed)
- Docker Compose changes (docker-compose.prod.yml)
- GitHub Actions changes (.github/workflows/)
- Infrastructure documentation (infra/README.md)
- Cloud-init scripts (embedded in Terraform)
- Secrets updates (only in GitHub secrets UI)

**These PRs**:
- Don't touch src/, worker/src/, public/
- Are reviewed by DevOps + Tech Lead
- May require production downtime (must be scheduled)
- Require rollback plan

### Developer PRs (application code)
- src/ changes
- worker/src/ changes (worker code)
- public/ changes (static files)
- Tests
- Database migrations (only migrations/vN.sql)

**These PRs**:
- Don't touch docker-compose, infra/, .github/workflows/
- Are reviewed by Dev + Tech Lead + QA
- Should NOT require infrastructure changes
- Auto-deploy via GitHub Actions (no downtime)

### Rule: Never mix in one PR
- ❌ Bad: Infrastructure change + app code change
- ✅ Good: Infrastructure PR + separate app PR

Reason: Easier to rollback, easier to debug, clear ownership.
```

---

## 📝 Communication Channels

### When Something is Unclear (DevOps)

**DevOps** → **Planner**: "Task clarity issue: [specific question]"
**Planner** → **PO**: If Planner can't answer

### When DevOps Finds a Blocker

**DevOps** → **Planner**: "Found blocker: [description]"
**Planner** escalates if needed (OVH support, etc.)

### When Dev Needs Infra Ready for Testing

**Dev** → **Planner**: "Ready for QA, is infra stable?"
**Planner** → **DevOps**: "Is infra ready?"
**DevOps** → **Planner**: "Infrastructure validated, ready"

### When Post-Deploy Issues Discovered

**QA/Dev** → **Planner**: "Issue found: [description]"
**Planner** → **DevOps**: "Blocker: [description]"
**DevOps** → Team: "Executing rollback: [steps]"

---

## 🔄 Integration Points

### From Planner (Task Assignment)

Infra task includes:
- Clear description (what change, why)
- Impact analysis (which services)
- Dependencies (what blocks this)
- Success criteria (what "done" means)
- Rollback plan (how to revert)

**DevOps uses all of this before starting.**

### To Planner (Progress)

After infra change:
- Status: Complete or Blocked
- Validation results: All checks passed
- Rollback tested: Yes
- Ready for: Dev deployment

**Planner unblocks dependent tasks.**

### With Dev (Coordination)

Before dev deploys app:
- Dev asks: "Infrastructure ready?"
- DevOps confirms: "Infrastructure validated"
- Dev deploys with confidence

---

## Summary: Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Task clarity** | Assume clear | Validate with checklist |
| **Rollback plan** | "Hope it works" | Documented + tested |
| **Testing** | Manual spot checks | Systematic validation |
| **Definition of Done** | Implicit | Explicit checklist |
| **Blocker communication** | Ad-hoc | Tracked, escalated |
| **Dev coordination** | "Just deploy" | "Infrastructure ready?" protocol |
| **PR scope** | Mixed (code + infra) | Separated (clear boundaries) |
| **Documentation** | Basic | Detailed (runbooks, lessons learned) |

---

## Files to Update/Create

1. **devops-improved.md** — Complete revised agent (provided)
2. **COMPLETE-AGENT-ECOSYSTEM.txt** — Updated with DevOps integrated (updated)
3. **Infrastructure Runbook Template** — For future use

---

## Next Steps

1. Read `devops-improved.md` (complete revised agent)
2. Choose approach:
   - **Option A**: Replace entire agent (ready to use)
   - **Option B**: Add just readiness checklist + rollback template (minimal)
   - **Option C**: Integrate gradually (week by week)
3. Test with next infra task
4. Gather feedback from team
5. Iterate

