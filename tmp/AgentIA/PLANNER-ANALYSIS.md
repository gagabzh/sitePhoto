# Analyse du Planner Agent + Recommandations

## 📊 Vue d'Ensemble Actuelle

Votre agent Planner est **très bon** : bien structuré, clair sur les responsabilités, avec des task breakdowns précis.

**Points Forts** ⭐:
- Responsabilités bien définies (plan, sequence, estimate, track)
- Task breakdown précis (INF-1, FE-1, NC-1, AI-1)
- Effort estimation honest (S/M/L/XL scale)
- PR scope rules clairs
- Vue d'ensemble des dépendances

**Points À Améliorer** ⚠️ (Pour intégration QA + PO):
1. **Pas de validation avant planning** — Planner reçoit une story, mais ne vérifie pas qu'elle est QA-ready
2. **Pas de coordination avec PO** — Comment traiter les stories ambigues ou incomplètes ?
3. **Pas de feedback de QA au planning** — Si QA trouve un risque, comment ça remonte ?
4. **Pas de liaison directe QA-Dev** — Comment communiquer la stratégie de test au developer ?
5. **Pas de traçabilité des blockers** — Blockers identifiés mais pas de suivi après
6. **Pas de métriques de qualité** — Pas de mesure de la testabilité ou de la complétude

---

## 🔄 Interaction Idéale: PO → Planner → Dev + QA

### Flux Actuel (Problématique)

```
PO écrit story
    ↓
Planner break into tasks
    ↓
Developer code
    ↓
QA teste (découvre problèmes trop tard!)
```

### Flux Amélioré (Proposé)

```
PO écrit story (avec acceptance criteria + blockers)
    ↓
Planner: "Est-ce QA-ready?"
    ├─ Non → Retour à PO avec questions
    └─ Oui → Continue
    ↓
Planner break into tasks + identify risks
    ↓
Planner: "QA Agent, quels sont les risques de test?"
    ├─ QA feedback: "Attention edge case X, besoin env Y"
    └─ Planner ajuste planning
    ↓
Planner assigne tasks à Developer avec test strategy
    ↓
Developer code (sait exactement quoi tester)
    ↓
QA teste (pas de surprises, test strategy était ready)
```

---

## ✅ Les 6 Améliorations Recommandées

### 1. **Story Validation Gate**

**Avant**: Planner reçoit story, assume qu'elle est complète
**Après**: Planner vérifie que story est QA-ready

```markdown
## Story Validation Checklist

Avant de planifier une story, Planner demande:

- [ ] PO a répondu à Acceptance Criteria Framework?
  - [ ] Testable (pas vague)
  - [ ] Edge cases couverts
  - [ ] Error states définis
  - [ ] Performance scopée
  - [ ] Accessibility considérée
  - [ ] Sécurité/accès explicite

- [ ] QA a sign-off que story est testable?

- [ ] Blockers ont été identifiés?
  - [ ] Tech blockers escaladés?
  - [ ] Product blockers résolus?
  - [ ] QA blockers documentés?

Si TOUTES les cases ne sont pas cochées:
→ Return story to PO: "Needs: [list]"
→ Ne pas planifier tant que non prêt
```

### 2. **QA Coordination at Planning Time**

**Avant**: Planner planifie, QA teste après
**Après**: Planner demande QA pendant planning

```markdown
## QA Coordination Step

Après avoir broken story into tasks, Planner demande au QA Agent:

"For this task breakdown [list tasks], what are:
1. The riskiest areas to test?
2. Which edge cases are hard to trigger?
3. What environment setup do you need?
4. What's the minimum viable test coverage?
5. Are there any gotchas I should warn the developer about?"

QA Agent répond avec:
- Risk areas and why
- Specific test data needed
- Environment setup required
- Suggested test sequence
- Gotchas ("Watch for: X can fail silently if Y")

Planner incorporates cette feedback dans task description.
```

### 3. **Test Strategy Per Task**

**Avant**: "Test required" (vague)
**Après**: "Test this specific thing with this approach"

```markdown
## Test Strategy Template

Each task now includes a Test Strategy section:

**Task**: FE-1.2 — GET /api/me/stats endpoint
**Effort**: M
**What to build**:
  - Route: GET /api/me/stats
  - Returns: {photos, albums, travels, totalSize}
  - Only viewer/editor/admin can call (role-based)

**Test Strategy** (what QA will validate):
  - Happy path: Logged-in user gets stats (verify counts accurate)
  - Edge case: User with 0 photos → returns 0 not error
  - Edge case: User with 10k photos → performance acceptable (< 100ms)
  - Access control: Viewer can't access other user's stats
  - Error: Unauthenticated request → 401 Unauthorized

**Test Data Needed**:
  - User with photos (existing test data)
  - Empty user account (create before test)
  - User with 10k photos (load test data)

**Acceptance**: PR passes QA approval criteria:
  - All 5 test scenarios PASS
  - Performance < 100ms
  - No security gaps
```

### 4. **Risk Tracking & Escalation**

**Avant**: Blockers identified in task list, but no tracking
**Après**: Blocker lifecycle tracked

```markdown
## Blocker Tracking

When Planner identifies a blocker, track it:

**Blocker Status Format**:

🔴 BLOCKER: [Code-Blocker-N]
  Description: [What's blocked]
  Type: [Tech/Product/QA]
  Severity: [Critical/High/Medium]
  Status: OPEN
  Owner: [Who resolves]
  Resolve by: [Date/Condition]
  Impact: [Which tasks are blocked]
  Last updated: [Date]

**Status Lifecycle**:
1. OPEN → Team decides
2. IN_PROGRESS → Owner working on it
3. RESOLVED → Unblocks work
4. CLOSED → Task proceeds

**Example**:

🟡 BLOCKER: AI-1-BIO
  Description: Biometric data storage in S3 — privacy concerns
  Type: Tech + Security
  Severity: High
  Status: IN_PROGRESS
  Owner: Tech Lead Reviewer
  Resolve by: Sprint 3 (privacy audit scheduled)
  Impact: AI-1.3, AI-1.4, AI-1.5 (all face tagging tasks)
  Last: 2024-01-15 — Tech Lead scheduled privacy review
```

### 5. **Dependency Visualization & Sequencing**

**Avant**: Dependency diagram in markdown (static)
**Après**: Dynamic dependency tracking with risk assessment

```markdown
## Enhanced Dependency Tracking

Include for each task:

**Dependencies**:
- Task A must complete before this task (why?)
- If blocked by Blocker X (list blockers)
- Database migration required? (which number)
- API endpoint dependency? (which endpoint)
- External service dependency? (Nextcloud, S3, etc.)

**Blocking**:
- This task blocks which other tasks?
- If delayed by N days, which tasks are impacted?

**Critical Path**:
- Is this on the critical path to ship?
- If delayed, does it slip the whole release?

**Example**:

Task FE-1.5 (Inline editing)
Dependencies:
  - FE-1.2 must be done first (needs stats endpoints)
  - FE-1.4 must be done first (needs HTML template)
  - Blocker: Session table migration (FE-1.1) must pass
Blocking:
  - FE-1.6 depends on this (avatar upload after profile edit)
Critical path:
  - YES — without this, account page is read-only
  - Delay impact: +1 day impacts FE-1.6 and beyond
```

### 6. **QA Readiness Metrics**

**Avant**: Pas de mesure de testabilité
**Après**: Explicite "how testable is this?"

```markdown
## Testability Assessment Per Task

When assigning task to developer, include testability score:

**Testability Factors** (1-5 scale):
  [ ] Acceptance criteria clarity (1=vague, 5=crystal clear)
  [ ] Edge case coverage (1=missing, 5=all covered)
  [ ] Test data availability (1=hard to get, 5=ready)
  [ ] Environment setup (1=complex, 5=simple)
  [ ] Dependency management (1=unclear, 5=no dependencies)

**Total Testability Score**: X/25

**Interpretation**:
- 20-25: Ready to develop & test immediately
- 15-19: Minor gaps, ask clarifications before starting
- 10-14: Significant gaps, revisit with QA before starting
- < 10: NOT READY — block until improved

**Example**:

Task FE-1.4 (Account page template)
  Criteria clarity: 5 (design handoff provided)
  Edge case coverage: 3 (some states missing: mobile, dark mode)
  Test data: 5 (user accounts exist)
  Env setup: 4 (just needs dev env)
  Dependencies: 5 (no blocking dependencies)
  → Total: 22/25 — READY (minor gaps in edge cases)
  → Action: Developer should test mobile + dark mode explicitly

**Recommendation for Planner**:
- Score < 20? Ask PO/QA to clarify before assigning
- Score 20-22? Assign but flag the gaps
- Score 23+? Assign and developer can proceed independently
```

---

## 🎯 Responsabilités Révisées du Planner

### Avant

```
Planner:
1. Break V5 tracks into tasks
2. Sequence tasks
3. Estimate effort
4. Identify blockers
5. When asked "what next?", recommend single highest-value task
6. Review progress (git log + memory)
```

### Après (Amélioré)

```
Planner:
1. VALIDATE story is QA-ready before planning
   ├─ Check PO has filled Acceptance Criteria Framework
   ├─ Check QA has signed off testability
   ├─ Check blockers are documented

2. Break V5 tracks into tasks
   ├─ For each task, define Test Strategy
   ├─ Identify Testability Score
   ├─ Map dependencies precisely

3. Sequence tasks (with risk assessment)
   ├─ Account for technical dependencies
   ├─ Account for blockers
   ├─ Account for test environment setup
   ├─ Account for QA feedback on high-risk areas

4. Estimate effort (honest, not optimistic)
   ├─ Include estimation buffer for unknowns
   ├─ Flag if estimation is uncertain (and why)

5. Identify blockers and escalate
   ├─ Create blocker lifecycle tracking
   ├─ Keep blockers updated as they progress
   ├─ Re-sequence if blocker unblocks faster

6. Coordinate with QA at planning time
   ├─ Ask QA Agent: "What are risks here?"
   ├─ Ask QA Agent: "What test data/env do you need?"
   ├─ Incorporate feedback into task description

7. When asked "what next?"
   ├─ Check: Is recommended task unblocked?
   ├─ Check: Is test strategy ready?
   ├─ Check: Does developer have all context?
   ├─ Recommend single highest-value unblocked task

8. Review progress
   ├─ Read git log
   ├─ Check blocker status updates
   ├─ Report: What's done, what's blocked, risks identified
   ├─ Update testability assessments as you learn
```

---

## 📝 Interaction Matrix: Planner ↔ PO ↔ QA ↔ Developer

| Scenario | Planner Action | Who Gets Involved |
|----------|--|--|
| **New story arrives** | Validate story is complete | PO (if gaps) |
| **Story has vague criteria** | Ask PO for clarification | PO, QA |
| **Story has unclear edge cases** | Ask QA what's risky | QA |
| **Story has identified blockers** | Escalate to right owner | PO/Tech Lead/DevOps |
| **Ready to break into tasks** | Coordinate with QA | QA (test strategy feedback) |
| **Ready to assign to dev** | Include test strategy in task | Developer, QA |
| **Developer asks clarification** | Answer or escalate to PO | Developer, PO |
| **QA finds blocker during testing** | Update blocker status | QA, Planner |
| **Blocker gets resolved** | Re-sequence affected tasks | Developer, other agents |
| **Asking "what's next?"** | Recommend unblocked highest-value task | Developer |

---

## 🚀 Implementation Plan

### Week 1: Add Story Validation
- Add Story Validation Checklist
- Planner validates stories before breaking into tasks
- Return stories to PO if incomplete

### Week 2: Add QA Coordination
- Add QA Coordination Step at planning time
- Planner asks QA Agent about risks
- Incorporate feedback into task descriptions

### Week 3: Add Test Strategy Per Task
- Update all task descriptions to include Test Strategy section
- Add Testability Score assessment
- Flag risky tasks for developer attention

### Week 4: Add Blocker Tracking
- Create blocker lifecycle format
- Track blocker status updates
- Update task sequencing based on blocker resolution

---

## Summary: Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Story Validation** | Assumed complete | Validated before planning |
| **QA Coordination** | None | Asks QA at planning time |
| **Test Strategy** | "Test required" | Specific test approach per task |
| **Testability Score** | Not measured | 1-25 scale assessment |
| **Blocker Tracking** | Listed once | Lifecycle tracking (OPEN→RESOLVED→CLOSED) |
| **Risk Visibility** | Planning only | Ongoing throughout execution |
| **Developer Context** | Task description | Task + test strategy + risks + testability score |

---

## Files to Update

1. **planner-improved.md** — Complete revised agent (provided)
2. **Planner Integration Guide** — How to use with QA + PO (provided)
3. **Project Memory** — Add blocker tracking section (you'll create)

---

## Next Steps

1. Read `planner-improved.md` (complete revised agent)
2. Choose implementation approach:
   - **Option A**: Replace entire agent (ready to use)
   - **Option B**: Integrate gradually (week by week)
   - **Option C**: Start with just Story Validation + QA Coordination
3. Test with next story that arrives
4. Gather feedback from team
5. Iterate

