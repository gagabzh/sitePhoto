# Analyse du Website Developer Agent + Recommandations

## 📊 Vue d'Ensemble Actuelle

Votre agent Developer est **excellent** : très précis sur la stack, patterns clairs, conventions bien documentées.

**Points Forts** ⭐:
- Stack bien défini et non-négociable (Node.js, Express, PostgreSQL, BullMQ, S3, Ollama)
- Code patterns explicites (wrapAsync, parameterized queries, esc() for HTML)
- Testing strategy clair (jest, mocks, Promise.all ordering)
- Security rules explicites (SQL injection, CSRF, roles enforcement)
- Design system bien documenté (CSS variables, typography, components)
- Git workflow clair (branch strategy, PR-based)

**Points À Améliorer** ⚠️ (Pour intégration avec QA + PO + Planner):
1. **Pas de validation de task avant de coder** — Developer reçoit task, assume qu'elle est prête
2. **Pas de test strategy reference** — Developer doit inférer ce qu'il faut tester
3. **Pas de clarity sur what "done" means** — Definition of Done manquante
4. **Pas de gotchas/risks from Planner** — Developer ne sait pas ce que Planner a identifié
5. **Pas de communication de blockers** — Si dev découvre un problème, où l'escalader ?
6. **Pas de acceptance criteria clarity flow** — Si criteria est ambigüe, pas de process
7. **Pas de PR submission guidelines** — Comment présenter une PR pour QA ?

---

## 🔄 Workflow Actuel (Problématique)

```
Planner assigns task
    ↓
Developer code (assume tout est clair)
    ↓
Developer push PR
    ↓
QA teste (découvre que criteria était vague!)
    ↓
QA asks pour clarification
    ↓
Developer waste time
```

---

## ✅ Workflow Amélioré (Proposé)

```
Planner assigns task (inclut: acceptance criteria + test strategy + gotchas + blockers)
    ↓
Developer: "Is this task clear enough to start?"
    ├─ NO: Ask Planner/PO for clarification
    └─ YES: Start coding
    ↓
Developer code (suivant test strategy + patterns)
    ↓
Developer: Self-check against Definition of Done
    ├─ NO: Fix issues
    └─ YES: Ready for PR
    ↓
Developer open PR (avec lien à task, test strategy, what was tested)
    ↓
QA teste (utilisant test strategy fournie)
    ↓
QA: Approval ou feedback (pas de surprises!)
```

---

## 🎯 Les 6 Améliorations Recommandées

### 1. **Task Understanding Checklist**

Avant de coder, Developer doit vérifier que tout est clair:

```markdown
## Task Understanding Checklist

When you receive a task, verify:

- [ ] Acceptance Criteria clear? (Not vague like "works correctly")
- [ ] Test Strategy defined? (Know what tests to write)
- [ ] Test Data provided? (Know how to test edge cases)
- [ ] Dependencies clear? (Know what tasks must be done first)
- [ ] Blockers identified? (Know what could prevent this)
- [ ] Gotchas documented? (Know the pitfalls)
- [ ] Files to touch defined? (Know scope)
- [ ] Performance targets set? (If relevant)
- [ ] Security implications clear? (Know access control needs)
- [ ] Design references provided? (For UI tasks)

If ANY box is unchecked → Ask Planner for clarification before coding.

**Where to find this info**:
- Task description (from Planner) — should have all above
- Acceptance Criteria section — from PO story
- Test Strategy section — from Planner + QA feedback
- Notes for Developer section — from Planner (gotchas, warnings)
```

### 2. **Definition of Done (DoD)**

Every PR must meet these criteria before submitting:

```markdown
## Definition of Done

A task is complete when:

### Code Quality
- [ ] Follows codebase patterns (wrapAsync, parameterized queries, esc())
- [ ] No TypeScript, ESM, or decorators (CommonJS only)
- [ ] No hardcoded values (use env vars, constants)
- [ ] Security rules followed (parameterized SQL, esc() for HTML, role checks)
- [ ] No console.log() left in code (use proper logging if needed)

### Testing
- [ ] All acceptance criteria have test cases
- [ ] Edge cases from Test Strategy are tested
- [ ] Happy path works
- [ ] Error states tested (400, 401, 403, 404, 500)
- [ ] Security tests (unauthorized access blocked)
- [ ] jest.resetAllMocks() used correctly (not clearAllMocks)
- [ ] Promise.all mocks ordered correctly (with comments)
- [ ] > 80% code coverage for new functions

### Database
- [ ] Migration file created (migrations/vN.sql) if schema changed
- [ ] Migration includes IF EXISTS / IF NOT EXISTS guards
- [ ] Migration is idempotent (safe to re-run)
- [ ] No modification of existing migrations
- [ ] Parameterized SQL queries used everywhere

### Frontend (if applicable)
- [ ] HTML uses esc() for user data
- [ ] Design system colors/fonts used (no hardcoded colors)
- [ ] No emoji (use approved unicode set only)
- [ ] Responsive design tested (desktop + mobile)
- [ ] CSRF token sent for non-multipart POST/PATCH/DELETE

### Documentation
- [ ] Clear commit messages (what, why, not how)
- [ ] Code comments for non-obvious logic
- [ ] README updated if new feature or env vars

### PR Submission
- [ ] Linked to task/story code (e.g., FE-1.2)
- [ ] Test strategy summary in PR description
- [ ] What was tested (list test scenarios)
- [ ] Screenshots or video (for UI changes)
- [ ] Blockers cleared (none remaining)

If ANY checkbox is unchecked → Fix before submitting PR.
```

### 3. **Test Strategy Reference in Code**

Developer should know exactly what to test:

```markdown
## Understanding Test Strategy (From Planner + QA)

When you receive a task, the Test Strategy section tells you:

### Happy Path Tests
"Happy path: User gets own stats (verify counts match DB)"
→ Developer writes test: `it('returns correct stats for authenticated user')`

### Edge Case Tests
"Edge case 1: 0 photos → {photos: 0} not error"
→ Developer writes test: `it('returns empty stats for user with no photos')`

### Error State Tests
"Error: Unauthenticated request → 401 Unauthorized"
→ Developer writes test: `it('returns 401 for unauthenticated request')`

### Security Tests
"Security: Viewer can't access other user's stats → 403 Forbidden"
→ Developer writes test: `it('returns 403 when viewer accesses other user stats')`

### Performance Tests (if applicable)
"Performance: < 100ms load time"
→ Developer tests: measure response time, ensure < 100ms

## How to Structure Tests

For each test scenario, write:
```js
describe('GET /api/me/stats', () => {
  beforeEach(() => jest.resetAllMocks());  // Always use resetAllMocks!

  it('returns correct stats for authenticated user', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, photos: 5 }] })  // SELECT stats
      .mockResolvedValueOnce({ rows: [{ size: 10000 }] });  // SELECT total_size
    
    const res = await request(app)
      .get('/api/me/stats')
      .set('Authorization', 'Bearer token');
    
    expect(res.status).toBe(200);
    expect(res.body.photos).toBe(5);
  });

  // ... more tests for edge cases, errors, security
});
```
```

### 4. **Gotchas & Risks Awareness**

Developer receives warnings from Planner:

```markdown
## Gotchas & Risks (From Planner Notes)

Before coding, read the "Notes for Developer" section in your task:

Example from FE-1.2:
"- Query stats in parallel (use Promise.all) for performance
 - Verify role-based filtering is correct (test with viewer vs editor vs admin)
 - Watch for: N+1 query problems if counting photos naively
 - Security: Double-check that viewer token can't access admin stats"

This means:
- Use Promise.all instead of sequential queries
- Write tests for viewer/editor/admin roles
- Don't write: SELECT * FROM photos WHERE user_id = X; SELECT count(*) ... (N+1)
- Do write: SELECT count(*) FROM photos WHERE user_id = X; (single query)
- Security test: verify role-based access control

If a gotcha applies → Write a specific test to avoid it.
If a gotcha is unclear → Ask Planner for clarification.
```

### 5. **Acceptance Criteria Clarity Process**

If criteria is ambiguous, escalate before coding:

```markdown
## Unclear Acceptance Criteria? Escalate.

If you receive a task and the Acceptance Criteria is unclear:

Example of UNCLEAR criteria:
"Returns stats for authenticated user"
→ Which roles? What data exactly? Edge cases? Performance?

Action:
1. Don't code yet
2. Document what's unclear (be specific)
3. Ask Planner or PO: "What does 'returns stats' mean exactly?"
4. Wait for clarification
5. Then code

Example of CLEAR criteria:
"Returns {photos: count, albums: count, travels: count, totalSize: bytes}
- Only viewer/editor/admin can call (not anonymous)
- User can only see their own stats
- Load time < 100ms"
→ Now it's clear, you can code.

Always err on the side of asking for clarification.
It's faster than coding against ambiguous criteria.
```

### 6. **PR Submission Checklist**

When opening PR, include context for QA:

```markdown
## PR Submission Checklist

Before pushing, ensure your PR includes:

### PR Description Content
- [ ] Task code (e.g., FE-1.2)
- [ ] Story title (what feature is this)
- [ ] Link to acceptance criteria (if available)
- [ ] Test Strategy summary (what was tested)
- [ ] What was tested (list specific test scenarios)
- [ ] Any blockers encountered (if any)
- [ ] Screenshots (for UI changes)

### Example PR Description
```
## Task: FE-1.2 — GET /api/me/stats endpoint

**Story**: Account page stats endpoint

**Acceptance Criteria Met**:
- ✅ Returns stats for authenticated user
- ✅ Only viewer/editor/admin can call
- ✅ User can only see their own stats
- ✅ Load time < 100ms
- ✅ Unauthenticated returns 401

**Test Strategy Executed**:
- Happy path: Returns correct counts (verified against fixtures)
- Edge case 1: Empty user (0 photos) returns zeros
- Edge case 2: 10k photos load in < 100ms
- Error state: Unauthenticated returns 401
- Security: Viewer can't see other user's stats (403)

**Tests Added**:
- src/__tests__/routes/api/me.stats.test.js (5 test cases)

**Coverage**: 
- Route: 100%
- Queries: 85%

**Gotchas Addressed**:
- Used Promise.all for parallel queries (performance)
- Verified role-based filtering with specific tests
- Confirmed no N+1 queries in query logs

**Screenshots**: N/A (API endpoint)

**Blockers**: None encountered
```

This helps QA understand:
- What you tested
- Which scenarios are covered
- What to focus on during review
```

---

## 📝 Communication Channels

### When Something is Unclear

**Developer** → **Planner**: "Task criteria is ambiguous. What does X mean?"
**Planner** → **PO**: If Planner can't clarify
**Developer** waits for clarification before coding

### When You Find a Blocker

**Developer** → **Planner**: "I found a blocker: [description]"
**Planner** escalates if needed and updates blocker tracking

### When You Need Design Reference

**Developer** → **Planner**: "Design reference missing for [feature]"
**Planner** → **PO**: "Get design reference for [feature]"

### When Test Strategy Seems Off

**Developer** → **Planner**: "Test strategy might miss [edge case]"
**Planner** → **QA Agent**: "Developer found potential gap, can we adjust?"

---

## 🚀 Integration Points

### From Planner (Task Assignment)

Task includes:
- Acceptance Criteria (what to build)
- Test Strategy (what to test)
- Test Data Needed (how to test edge cases)
- Dependencies (what's blocking)
- Blockers (known issues)
- Notes for Developer (gotchas, warnings)
- Testability Score (how ready is this)

**Developer uses all of this before coding.**

### From QA (Test Validation)

When QA reviews your PR:
- QA follows test strategy you followed
- QA validates each test scenario
- QA reports: "All tests passed" or "Gap in coverage: [area]"

**Developer responds to QA feedback.**

### From Planner (Progress)

After PR merges:
- **Developer** reports to Planner: "Task complete, all tests passed"
- **Planner** updates progress tracking
- **Planner** unblocks dependent tasks

---

## Summary: Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Task clarity** | Assume clear | Validate with checklist before coding |
| **Test strategy** | Infer from criteria | Reference Test Strategy section |
| **What to test** | Guess | Follow specific test scenarios |
| **Definition of Done** | Implicit | Explicit 10-item checklist |
| **Unclear criteria** | Code anyway | Escalate to Planner before coding |
| **PR submission** | Basic description | Include test summary + blockers + what was tested |
| **Risk awareness** | None | Read "Notes for Developer" gotchas |
| **Communication** | No clear channel | Clear escalation path (Dev → Planner → PO) |

---

## Files to Update/Create

1. **website-dev-improved.md** — Complete revised agent (provided)
2. **developer-workflow.md** — Day-to-day workflow guide (provided)
3. **task-understanding-template.md** — Checklist to print/bookmark (provided)

---

## Next Steps

1. Read `website-dev-improved.md` (complete revised agent)
2. Choose approach:
   - **Option A**: Replace entire agent (ready to use)
   - **Option B**: Add just DoD + Task Checklist (minimal change)
   - **Option C**: Integrate gradually (week by week)
3. Test with next task
4. Gather feedback from team
5. Iterate

