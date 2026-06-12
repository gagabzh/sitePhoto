# QA Agent Integration Guide

## 🚀 How to Use the QA Agent in Your Workflows

This guide explains **how to actually invoke and work with** the QA Agent in your daily development process.

---

## 📋 Quick Reference: When to Ask QA Agent

### Ask QA Agent When:
- [ ] A new PR is opened (before Tech Lead reviews)
- [ ] Testing requirements are unclear
- [ ] A regression area needs to be identified
- [ ] You want a structured bug report
- [ ] You need to decide if something is testable
- [ ] A feature affects multiple systems (regression risk)
- [ ] You're unsure what edge cases to test

### Don't Ask QA Agent For:
- ✗ Code review (that's Tech Lead Reviewer)
- ✗ Architecture decisions (that's Tech Lead)
- ✗ Priority/timeline decisions (that's Planner)
- ✗ Deployment approval (that's DevOps)

---

## 🔄 Integration Pattern 1: PR Comment Review

**When**: Immediately after PR is opened
**Who**: Developer or Planner
**Duration**: 10-15 minutes

### Step 1: Provide Context

```
@qa-agent I have a new feature PR. Here's what I need:

PR: #234 - Add dark mode toggle
Acceptance Criteria:
1. Toggle appears in top navigation
2. Theme persists after page reload
3. All colors are accessible (WCAG AA)
4. Mobile layout unaffected

Changed Files:
- src/components/ThemeToggle.tsx
- src/theme/darkMode.ts
- src/styles/theme.css

Can you create a test plan and identify any risky areas?
```

### Step 2: Review QA Response

QA Agent will respond with:
1. **Test plan outline** (happy path, edge cases, regression areas)
2. **Questions for developer** (missing info, clarifications needed)
3. **Risk assessment** (areas needing extra attention)
4. **Suggested next steps**

### Step 3: Developer Responds (if needed)

```
@qa-agent Thanks! A few clarifications:
- Tests are in src/theme/__tests__/darkMode.test.ts (100% coverage)
- Mobile tested on iOS Safari and Chrome Android
- No database changes, all client-side
- Follows existing theme system architecture

What specific test scenarios should I run manually?
```

### Step 4: QA Creates Detailed Test Plan

QA Agent provides:
```
## Detailed Test Plan: Add Dark Mode Toggle

### Happy Path
1. Load page → toggle visible in nav
2. Click toggle → theme changes to dark
3. Reload page → theme persists (check localStorage)
4. Switch back to light → verify all components
5. Test on: Desktop (Chrome, Firefox), Mobile (iOS, Android)

### Edge Cases
1. Very long navigation (toggle doesn't push content off-screen)
2. Dark mode + user prefers light (browser setting)
3. No localStorage available (private mode)
4. Rapid clicking toggle (state management solid)
5. CSS variable not defined (fallback to default)

### Regression Areas
- Login flow (color contrast maintained)
- Form inputs (accessibility maintained)
- Navigation (no layout shift)
- Images (not inverted inappropriately)
- Third-party embedded content

### Acceptance Criteria Status
✓ Ready to test
```

### Step 5: Tech Lead Reviews in Parallel

While QA is testing, Tech Lead Reviewer independently reviews code. Both report when ready:

```
@qa-agent Test plan execution starting...
```

(QA executes tests, documents results)

```
@qa-agent Test Results: ✅ ALL PASS
- Happy path: 5/5 scenarios passed
- Edge cases: All handled gracefully
- Regression areas: No issues detected
- Ready to merge (pending Tech Lead approval)
```

Then Tech Lead comments:

```
@techlead Code review complete. Looks good!
- Architecture sound
- Tests comprehensive
- Accessibility considerations made
Ready to approve once QA signs off.
```

---

## 🔄 Integration Pattern 2: Emergency Bug Fix

**When**: Production bug reported
**Who**: Planner or DevOps (urgent notification)
**Duration**: 15-30 minutes total

### Step 1: Notify QA of Bug

```
@qa-agent URGENT: Production bug in user auth
- Symptoms: Some users can't login (500 error on token endpoint)
- Estimated impact: 15% of user base
- Status: Developer investigating

Can you prepare a testing strategy while dev works on fix?
```

### Step 2: QA Prepares Testing Plan

```
QA Response: Understand. For auth issues I'll test:

Critical (must pass):
1. Standard login flow (email + password)
2. OAuth login (Google, GitHub if applicable)
3. Session persistence
4. Logout clears session
5. Password reset flow

Quick regression check:
6. API endpoints accept existing tokens
7. Multiple concurrent sessions work
8. Token refresh works

I'm ready to test as soon as you have a fix. Send me the branch.
```

### Step 3: Developer Creates Fix & Notifies QA

```
@qa-agent Fix ready on branch `hotfix/auth-500`

Changes:
- Updated token validation logic in middleware
- Fixed query on user lookup

Tests:
- Unit tests added for token validation
- Manual testing needed on full flow

Branch ready for QA testing.
```

### Step 4: QA Tests Fast-Track

```
QA Tests (simplified, focus on critical path):
1. Login with email/password ✓ PASS
2. Token generated correctly ✓ PASS
3. Session persists ✓ PASS
4. Logout works ✓ PASS
5. Regression tests (quick sample) ✓ PASS

Status: 🟢 SAFE TO DEPLOY
Bug appears fixed. No regressions detected.

Ready for DevOps to deploy to production.
```

### Step 5: Post-Deploy Verification

```
@qa-agent Post-deploy verification in production

Testing in prod:
- Error rate returned to normal ✓
- Sample user login successful ✓
- No new errors in logs ✓

Final Status: 🟢 VERIFIED
Fix is working in production. Normal monitoring continues.
```

---

## 🔄 Integration Pattern 3: Feature Merge & Regression Check

**When**: Feature is approved and merged to main
**Who**: QA (automatic or on notification)
**Duration**: 20-30 minutes

### Step 1: Pre-Merge Notification

```
@qa-agent This PR is about to merge:
PR #245 - "Add user preferences caching"

Regression areas I'm concerned about:
- User profile loading (now uses cache)
- Settings updates (cache invalidation)
- Multi-tab behavior (cache sync across tabs)

Can you create a focused regression plan for after merge?
```

### Step 2: QA Creates Regression Plan

```
QA Response: Got it. Post-merge regression plan:

Quick regression (10 min):
1. Load user profile → cache used correctly
2. Update setting in one tab → reflected in other tabs
3. Clear cache → fresh data loaded

Medium regression (10 min):
4. Profile changes in account settings
5. Preferences change takes effect immediately
6. No stale data shown

Extended checks (5 min):
7. Performance metrics (cache is actually faster)
8. Memory usage (cache doesn't grow unbounded)

Total: 25 minutes. Will run immediately after merge.
Status will be posted in #deployments channel.
```

### Step 3: Feature Merges

```
(Main branch updated with new feature)
```

### Step 4: QA Executes Regression

```
@qa-agent Post-merge regression testing started...
(Testing in progress...)

Regression Check Results: ✅ PASS
- All quick checks: PASS
- Medium checks: PASS
- Performance: 23% faster than before ✓
- Memory: Stable, no leaks ✓

Status: Clear for deployment to staging/production
```

---

## 🎯 Integration Pattern 4: Major Release Validation

**When**: Multiple features merged, ready for release
**Who**: Planner + QA + Tech Lead
**Duration**: 2-4 hours

### Step 1: QA Receives Release Scope

```
@qa-agent We're preparing to release v2.5 next week.
Here are the features going in:

- #234: Dark mode
- #245: User caching
- #256: New dashboard widgets
- #267: Payment processing

Can you create a comprehensive test plan that covers:
1. Individual feature testing (already done)
2. Cross-feature interactions
3. Critical regression paths
4. Performance with all changes together
```

### Step 2: QA Creates Comprehensive Test Plan

```
QA Response: Comprehensive test plan created.

## Release v2.5 Test Plan

### Feature Integration Tests
- Dark mode + dashboard widgets (ensure widgets render in dark)
- Caching + payment (ensure sensitive data isn't cached)
- All features on same page (layout, performance)

### Critical Regression Paths (all versions)
1. User signup → login → profile edit → settings
2. Browse products → add to cart → checkout → payment
3. Admin functions → user management → reporting

### Performance Baseline
- Page load time before/after
- API response times
- Memory usage with all features

### Accessibility Full Check
- Dark mode contrast (WCAG AA)
- Widget keyboard navigation
- Payment form screen reader compatibility

## Estimate: 3-4 hours

Sections:
1. Individual feature verification (1 hour)
2. Integration & regression (1.5 hours)
3. Performance & accessibility (1-1.5 hours)
4. Final sign-off (0.5 hour)

Ready to execute testing schedule?
```

### Step 3: QA Executes Comprehensive Plan

(Results documented throughout)

### Step 4: QA Sign-Off

```
@qa-agent Release v2.5 Test Results: ✅ READY TO RELEASE

Test Coverage:
- Individual features: All pass
- Integration: No conflicts detected
- Regressions: No new issues
- Performance: 5% improvement overall
- Accessibility: WCAG AA maintained

Recommendation: Safe to deploy v2.5 to production

Outstanding issues (non-blocking):
- Dashboard slightly slower with dark mode (acceptable, < 200ms)
- Mobile: One widget needs responsive adjustment (low priority)

Ready for release announcement.
```

---

## 📞 Asking QA Agent Questions

### Template for Direct Questions

Use this format when you need specific guidance:

```
@qa-agent I need help deciding:

Situation: [What's happening]
Context: [Why it matters]
Question: [What you're asking]
Options: [If applicable]

Can you recommend a testing approach / escalation path / decision?
```

### Examples

**Example 1: Is This Testable?**
```
@qa-agent Question: Can we test real-time notifications without actual Slack/email integration?

Context: PR #300 adds real-time notifications. Acceptance criteria requires testing
that notifications are sent. But we don't want to send real notifications during tests.

Can we mock the services for acceptance testing?
```

**Example 2: What Regression Risk?**
```
@qa-agent Question: Database migration - what regression areas should I focus on?

Context: PR #310 migrates user.email to user.email_encrypted. All reads/writes
updated to handle encryption/decryption.

Top 5 regression risks? What do I test first?
```

**Example 3: Escalation Recommendation**
```
@qa-agent Question: This PR is giving me unclear vibes. Should it block merge?

Context: 
- Feature: Add export to CSV
- Acceptance criteria: "Users can export data"
- Test coverage: Unit tests exist, no e2e tests
- Complexity: Medium (touches 3 endpoints)

Is this ready to merge or needs more?
```

---

## 🔐 QA Agent Access & Permissions

### What QA Agent CAN Do

- [ ] Read all code (full repository access)
- [ ] Comment on PRs with findings
- [ ] Create issues/bugs in your tracker
- [ ] Access test environments (staging, dev)
- [ ] Review logs post-deployment

### What QA Agent CANNOT Do

- [ ] Approve code merges (Tech Lead only)
- [ ] Deploy to production (DevOps only)
- [ ] Change priorities (Planner only)
- [ ] Make architectural decisions (Tech Lead only)

### Access Setup (Technical)

If your QA Agent is an actual bot/service:

```bash
# Add QA bot to repository
gh repo add-member <repo> qa-agent --permission pull

# Give QA bot read-only GitHub token
# (if using GitHub API)
export QA_GITHUB_TOKEN=ghp_xxxx...

# Configure access to test environments
# (depends on your setup: Docker, Heroku, AWS, etc.)
```

---

## ⏰ QA Agent SLA (Service Level Agreement)

**Recommendation**: Define expected response times

| Request Type | Target Response | Max Wait |
|---|---|---|
| PR review (new PR) | 2 hours | 4 hours |
| Regression check (post-merge) | 1 hour | 2 hours |
| Hot-fix validation (production) | 15 minutes | 30 minutes |
| General question | 1 hour | 2 hours |
| Complex feature (multiple PRs) | 4 hours | 1 day |

---

## 📝 Documenting QA Results

### Standard QA Report Format

Use this structure when logging QA results:

```
## QA Report: [PR Title] #[number]

### Test Execution Summary
- **Date**: [Date tested]
- **Tester**: QA Agent
- **Environment**: [Staging/Local/Production]
- **Duration**: [Time spent]

### Acceptance Criteria Validation
✓ Criterion 1: [Description] — Evidence: [Test step/screenshot]
✓ Criterion 2: [Description] — Evidence: [Test step/screenshot]
✗ Criterion 3: [Description] — Blocked by: [Bug #XYZ]

### Test Results
- **Happy Path**: 5/5 pass
- **Edge Cases**: 4/5 pass (1 edge case blocked)
- **Regression Areas**: All pass

### Bugs Found
- #123: [Title] — Severity: [Blocker/High/Medium/Low]
- #124: [Title] — Severity: [Blocker/High/Medium/Low]

### Overall Status
[ ] ✅ READY TO MERGE
[ ] ⚠️  CONDITIONAL (bugs logged, can merge if accepted)
[ ] ❌ BLOCKED (critical issues prevent merge)

### Next Steps
- [Action 1] — Owner: [Person]
- [Action 2] — Owner: [Person]
```

---

## 🔄 Feedback Loop: Making QA Better

### Weekly QA Retrospective

Once per week, ask QA Agent for feedback:

```
@qa-agent Weekly retrospective: How are we doing?

Questions:
1. What went well this week (what were the clearest PRs)?
2. What was frustrating (what made testing hard)?
3. What could developers do better (what would help you)?
4. What could we improve as a team?

Your feedback helps us improve our process.
```

### Monthly Process Review

Once per month, review QA effectiveness:

```
Metrics to track:
- Bugs found by QA (before prod) vs caught in production
- Average QA turnaround time
- How many PRs blocked by QA (should be rare)
- Acceptance criteria clarity (% that need escalation)

Goal: Fewer bugs in prod, faster QA turnaround, clearer requirements
```

---

## 🚨 Troubleshooting: When QA Agent Gets Stuck

### Issue: Agent Creates Test Plan but Won't Commit

**Problem**: Agent keeps saying "test plan ready" but never actually tests

**Solution**:
```
@qa-agent I notice you're creating plans but not executing them.
When a test plan is created, please actually run the tests
(simulated or in our test environment) and report concrete results.

Example of what I want to see:
"Scenario 1: User edits name → Result: ✓ PASS (field updates immediately)"
Not:
"Scenario 1: User edits name → Status: Ready to test"

Can you clarify what's blocking actual test execution?
```

### Issue: Agent Over-Escalates (Everything Goes to Planner)

**Problem**: QA Agent escalates 80% of PRs as "unclear requirements"

**Solution**:
```
@qa-agent I notice you're escalating a lot of PRs.
Let me clarify: You don't need 100% clarity to start testing.
Examples where you can proceed WITHOUT escalation:

"Add button to page" — Test it: Does button appear? Can you click it? Does it do what PR says?

"Fix login bug" — Test it: Does the bug still exist? If fixed, is login working?

You only escalate if acceptance criteria is COMPLETELY missing or truly impossible to test.

Can we adjust your threshold for escalation?
```

### Issue: Agent's Bug Reports Are Vague

**Problem**: Bug reports say "Button didn't work" without detail

**Solution**:
```
@qa-agent Your bug reports need more detail.
Every bug should include:

1. Exact reproduction steps (1, 2, 3, not "try button")
2. Expected result (what should happen)
3. Actual result (what did happen)
4. Severity (blocker/high/medium/low)

Example of good bug report:
"Bug: Profile update fails silently
Steps: 1. Go to /profile → 2. Change name → 3. Click Save
Expected: Confirmation message, name updated
Actual: No message, name reverted on reload
Severity: BLOCKER (user thinks change was saved)"

Can you adopt this format for all bug reports?
```

---

## 📚 Next Steps

1. **Immediate** (this week):
   - [ ] Share this guide with your team
   - [ ] Set up how QA Agent will be invoked (comment trigger? Slack command?)
   - [ ] Test one PR using the patterns above

2. **Short term** (next 2 weeks):
   - [ ] Run through all 6 test scenarios (from human test plan)
   - [ ] Adjust system prompt based on findings
   - [ ] Define your team's QA SLA

3. **Ongoing**:
   - [ ] Monitor QA effectiveness (bugs caught, turnaround time)
   - [ ] Give QA Agent feedback when expectations aren't met
   - [ ] Iterate on system prompt and workflow

---

## ❓ Quick FAQ

**Q: Can QA Agent merge PRs?**
A: No. QA can recommend merge, but Tech Lead Reviewer must actually approve.

**Q: What if QA Agent and Tech Lead Reviewer disagree?**
A: You (the human) are the tiebreaker. Discuss with both, make final call.

**Q: Do I need a QA Agent if I have good test coverage?**
A: Yes. Code tests != functionality tests. QA validates acceptance criteria and regressions.

**Q: Can QA Agent deploy?**
A: No. QA validates readiness, DevOps handles deployment.

**Q: What's the difference between QA and Tech Lead Reviewer?**
A: Tech Lead checks code quality, architecture, security. QA checks if feature works as intended.

