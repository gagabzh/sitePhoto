# QA Agent - Human Test Plan

## 📋 Overview

This document describes how to **manually test and validate** the QA Agent before putting it into production workflows. Each test scenario simulates a real PR review situation.

**Duration**: 2-3 hours total (30-45 minutes per scenario)
**Prerequisites**: 
- QA Agent system prompt loaded
- Access to sample PRs or test data
- A way to track results (this document, spreadsheet, etc.)

---

## 🎯 Test Objectives

By the end of these tests, you should be confident that the QA Agent:
- [ ] Creates clear, actionable test plans
- [ ] Identifies edge cases and regression risks
- [ ] Validates acceptance criteria systematically
- [ ] Reports bugs with sufficient detail
- [ ] Escalates appropriately (not over/under escalating)
- [ ] Communicates findings in plain language
- [ ] Handles ambiguous PRs without blocking (escalates instead)

---

## 📊 Test Scenarios

### Scenario 1: Well-Defined Feature PR

**Objective**: Verify QA Agent can execute standard flow with clear requirements

**Setup**:
```
PR Title: "Add password strength meter to signup form"

PR Description:
- Add visual feedback showing password strength (weak/medium/strong)
- Calculate strength based on length, character variety, common patterns
- Update validation to require "medium" or higher
- Tests included: unit tests for strength algorithm

Acceptance Criteria:
1. Password field shows strength indicator
2. Strength updates in real-time as user types
3. Weak passwords are rejected
4. Visual matches design system
5. Works on mobile

Changed Files:
- src/components/PasswordInput.tsx
- src/utils/passwordValidation.ts
- tests/passwordValidation.test.ts
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   I have a new PR (above). Please:
   1. Create a test plan
   2. Identify regression areas
   3. Tell me what questions you have for the developer
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Test plan has happy path | Agent describes: user enters password → meter updates → validation works | [ ] / [ ] |
   | Test plan has edge cases | Agent mentions: empty password, very long password, special chars, unicode | [ ] / [ ] |
   | Regression areas identified | Agent asks about: other form fields, mobile behavior, accessibility | [ ] / [ ] |
   | Acceptance criteria reviewed | Agent explicitly checks all 5 criteria | [ ] / [ ] |
   | No unnecessary escalation | Agent doesn't escalate for this standard feature | [ ] / [ ] |
   | Questions are clear | If agent asks clarifications, they're specific (not vague) | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 1 Results:
   - Test plan quality: [GOOD / ACCEPTABLE / NEEDS IMPROVEMENT]
   - Regression coverage: [GOOD / ACCEPTABLE / NEEDS IMPROVEMENT]
   - Overall: [PASS / FAIL]
   - Notes: [Any surprises or issues]
   ```

---

### Scenario 2: PR with Missing Acceptance Criteria

**Objective**: Verify QA Agent escalates instead of guessing requirements

**Setup**:
```
PR Title: "Refactor user dashboard"

PR Description:
- Cleaned up dashboard code
- Better component organization
- Performance improvements expected

Acceptance Criteria:
(none provided)

Changed Files:
- src/pages/Dashboard.tsx
- src/components/DashboardCard.tsx
- src/hooks/useDashboard.ts
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   I have a new PR (above) - it's missing acceptance criteria.
   How should I handle this?
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Escalation flagged | Agent says this blocks QA and needs escalation | [ ] / [ ] |
   | Escalates to correct role | Agent suggests escalating to **Planner**, not developer | [ ] / [ ] |
   | Specific clarifications requested | Agent lists what info is needed (user stories, test cases, performance targets) | [ ] / [ ] |
   | Doesn't guess acceptance criteria | Agent doesn't make up criteria or test blindly | [ ] / [ ] |
   | Clear next steps | Agent says something like "Get clarification → create test plan → proceed" | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 2 Results:
   - Escalation decision: [CORRECT / INCORRECT]
   - Clarity of explanation: [GOOD / ACCEPTABLE / NEEDS IMPROVEMENT]
   - Overall: [PASS / FAIL]
   ```

---

### Scenario 3: PR with Security-Sensitive Changes

**Objective**: Verify QA Agent escalates security concerns appropriately

**Setup**:
```
PR Title: "Add OAuth2 integration"

PR Description:
- Implement OAuth2 login for Google and GitHub
- Tokens stored in secure httpOnly cookies
- CSRF protection added
- Redirect URI validation implemented

Acceptance Criteria:
1. Users can login with Google
2. Users can login with GitHub
3. Email is extracted and saved
4. Session persists across page reload
5. Logout clears session

Changed Files:
- src/auth/oauth.ts
- src/api/auth/callback.ts
- src/middleware/authMiddleware.ts
- tests/oauth.test.ts (limited coverage)
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   I have a new PR involving OAuth2 and authentication.
   What are your concerns and recommendations?
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Security flagged | Agent identifies this is security-sensitive | [ ] / [ ] |
   | Escalates to Tech Lead | Agent says Tech Lead Reviewer must review | [ ] / [ ] |
   | Specific security tests | Agent suggests: CSRF tests, token expiry, XSS prevention, redirect validation | [ ] / [ ] |
   | Test coverage questioned | Agent notes limited test coverage (only 1-2 files mentioned) | [ ] / [ ] |
   | Doesn't over-escalate to PO | Agent doesn't escalate acceptance criteria (those are clear) | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 3 Results:
   - Security concern identified: [YES / NO]
   - Appropriate escalation: [CORRECT / INCORRECT]
   - Test recommendations: [THOROUGH / ADEQUATE / MISSING]
   - Overall: [PASS / FAIL]
   ```

---

### Scenario 4: PR with Multiple Failures in Testing

**Objective**: Verify QA Agent creates clear bug reports and blocks appropriately

**Setup**:
```
PR Title: "Implement user profile editing"

PR Description:
- Users can edit name, email, bio
- Changes saved immediately without confirmation
- Uses optimistic UI updates
- Includes validation

Acceptance Criteria:
1. User can edit name
2. User can edit email
3. Changes persist after page reload
4. Validation prevents invalid input

Test Execution (Simulated):
- Edit name: ✓ WORKS
- Edit email: ✗ FAILS (endpoint returns 500)
- Edit bio: ✓ WORKS
- Reload page: ✗ FAILS (changes don't persist)
- Invalid email: ✓ BLOCKED (validation works)
- Very long name (500 chars): ✗ CRASHES (memory issue?)
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   I tested this PR and found these results (above).
   Please create a comprehensive status report:
   1. Which acceptance criteria are met?
   2. What bugs should be logged?
   3. Can this merge, or does it need fixes?
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Criteria status clear | Agent says 1/4 acceptance criteria clearly met, others blocked | [ ] / [ ] |
   | Bug reports detailed | Agent creates reports with: title, reproduction steps, severity | [ ] / [ ] |
   | Severity accurate | Agent marks email endpoint failure as **blocker** (core feature broken) | [ ] / [ ] |
   | Memory issue flagged | Agent marks 500-char crash as **blocker** (potential production risk) | [ ] / [ ] |
   | Clear merge decision | Agent says "DO NOT MERGE" with reasons listed | [ ] / [ ] |
   | Recommendations provided | Agent suggests: fix endpoint, fix persistence, add input limits | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 4 Results:
   - Criteria status tracking: [ACCURATE / INCOMPLETE]
   - Bug report quality: [THOROUGH / ADEQUATE / VAGUE]
   - Merge decision: [CORRECT / INCORRECT]
   - Overall: [PASS / FAIL]
   ```

---

### Scenario 5: Regression Testing After Merge

**Objective**: Verify QA Agent creates a focused regression plan for post-merge validation

**Setup**:
```
PR that just merged:
Title: "Refactor API request library"

What changed:
- Centralized HTTP client for all API calls
- New retry logic with exponential backoff
- Added request/response logging

Scope:
- Changed: src/api/client.ts, src/api/helpers.ts
- All other API calls updated to use new client

Test request:
"This refactor touches all API calls. What's your regression testing strategy?"
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   This PR just merged (above). Create a focused regression test plan.
   I have 30 minutes to test before deployment.
   What are the critical areas to verify?
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Prioritized scope | Agent identifies critical paths, not all endpoints | [ ] / [ ] |
   | Risk-aware | Agent focuses on: auth API, payment API, user data reads/writes | [ ] / [ ] |
   | Time-aware | Agent gives plan that fits 30 minutes (not 2 hours) | [ ] / [ ] |
   | Specific steps | Agent says "test login → test fetch user → test update profile" not "test all APIs" | [ ] / [ ] |
   | Retry logic tested | Agent suggests testing network failure scenarios (since retry was added) | [ ] / [ ] |
   | Logging noted | Agent says logging should be verified (new feature, could have side effects) | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 5 Results:
   - Regression plan quality: [GOOD / ACCEPTABLE / NEEDS IMPROVEMENT]
   - Prioritization: [GOOD / ACCEPTABLE / NEEDS IMPROVEMENT]
   - Practicality (time/scope): [REALISTIC / OPTIMISTIC]
   - Overall: [PASS / FAIL]
   ```

---

### Scenario 6: Ambiguous Acceptance Criteria

**Objective**: Verify QA Agent asks clarifying questions instead of making assumptions

**Setup**:
```
PR Title: "Improve page performance"

PR Description:
- Optimized database queries
- Added caching layer
- Reduced bundle size

Acceptance Criteria:
1. Page loads faster
2. Performance is good
3. User experience is better

Changed Files:
- src/db/queries.ts (query optimization)
- src/cache/redis.ts (new caching)
- webpack.config.js (bundle optimization)
```

**Test Steps**:

1. **Prompt the QA Agent**:
   ```
   I have this PR with performance improvements.
   How can I test if it meets the acceptance criteria?
   ```

2. **Evaluate the response**:

   | Expectation | Check | Pass/Fail |
   |---|---|---|
   | Criteria questioned | Agent says criteria is too vague | [ ] / [ ] |
   | Specific questions asked | Agent asks: "What's the target load time? Is this page-specific or site-wide? What metrics matter?" | [ ] / [ ] |
   | Doesn't assume | Agent doesn't invent success criteria (e.g., doesn't say "must load in < 2s") | [ ] / [ ] |
   | Measurable suggestions | Agent suggests: use Chrome DevTools, measure Lighthouse score, compare before/after | [ ] / [ ] |
   | Clear escalation | Agent says "Get clarification from Planner/PO before testing" | [ ] / [ ] |

3. **Document results**:
   ```
   Scenario 6 Results:
   - Vagueness identified: [YES / NO]
   - Question quality: [GOOD / ADEQUATE / VAGUE]
   - Appropriate escalation: [CORRECT / INCORRECT]
   - Overall: [PASS / FAIL]
   ```

---

## 📈 Scoring & Pass Criteria

### Per-Scenario Scoring

Each scenario has multiple checkboxes. Count:
- **Pass**: 5/6 or more checks passing
- **Acceptable**: 4/6 checks passing
- **Fail**: 3 or fewer checks passing

### Overall Pass/Fail

| Passing Scenarios | Overall Result |
|---|---|
| 6/6 | ✅ **READY FOR PRODUCTION** |
| 5/6 | ⚠️ **READY WITH CAVEATS** (Address the 1 failing scenario) |
| 4/6 | 🟡 **NEEDS IMPROVEMENT** (Retrain or refine agent; fix 2 scenarios) |
| < 4/6 | ❌ **NOT READY** (Major issues; revisit system prompt) |

---

## 🐛 Common Issues to Watch For

**Issue**: Agent creates test plans that are too generic
- **Fix**: Update system prompt with more specific examples
- **Look for**: "Click button → verify works" vs detailed steps with edge cases

**Issue**: Agent escalates too often
- **Fix**: Clarify decision authority in system prompt (QA can make decisions about testing, not architecture)
- **Look for**: Agent escalating normal features to PO when only Planner or Tech Lead is needed

**Issue**: Agent misses security concerns
- **Fix**: Add security checklist to system prompt
- **Look for**: Auth/payment/data changes being treated as normal features

**Issue**: Agent's bug reports lack detail
- **Fix**: Show examples in system prompt with good vs bad bug reports
- **Look for**: Reproduction steps, expected vs actual behavior, severity/priority

**Issue**: Agent doesn't reference acceptance criteria
- **Fix**: Update system prompt to require explicit acceptance criteria validation
- **Look for**: Agent checking each criterion individually, not just skimming

---

## 📝 Test Execution Checklist

- [ ] Read this entire plan before starting
- [ ] Set up test environment (access to agent, sample data)
- [ ] Start with Scenario 1 (easiest, builds understanding)
- [ ] Complete all 6 scenarios in order
- [ ] Fill out checklist for each scenario while testing (not after)
- [ ] If a scenario fails, note the specific issues before moving on
- [ ] After all scenarios, review overall score
- [ ] If overall score < 5/6, address failing scenarios and re-test
- [ ] Document final results in summary (below)

---

## 📊 Test Results Summary

**Tester**: _________________
**Date**: _________________
**Time spent**: _________________

### Scenario Results

| Scenario | Status | Notes |
|---|---|---|
| 1: Well-defined feature | [ ] PASS [ ] FAIL | |
| 2: Missing criteria | [ ] PASS [ ] FAIL | |
| 3: Security changes | [ ] PASS [ ] FAIL | |
| 4: Multiple failures | [ ] PASS [ ] FAIL | |
| 5: Regression testing | [ ] PASS [ ] FAIL | |
| 6: Ambiguous criteria | [ ] PASS [ ] FAIL | |

### Overall Score

**Passing**: ___ / 6
**Result**: [ ] READY [ ] READY WITH CAVEATS [ ] NEEDS IMPROVEMENT [ ] NOT READY

### Issues Found

(List any patterns or specific problems)

1. 
2. 
3. 

### Recommendations

(What should be improved before production use)

1. 
2. 
3. 

### Sign-Off

**Can this QA Agent be deployed?**
[ ] YES — Ready for team workflows
[ ] YES, BUT — Ready with conditions (list above)
[ ] NO — Needs significant improvements

**Approved by**: _________________
**Date**: _________________

---

## 🔄 Follow-Up Actions

**If READY**:
- [ ] Add QA Agent to standard code review workflow
- [ ] Integrate with your PR comment system
- [ ] Set SLA for QA turnaround (e.g., within 2 hours)
- [ ] Monitor first 2 weeks for issues

**If READY WITH CAVEATS**:
- [ ] Fix identified issues
- [ ] Re-test 1-2 failing scenarios
- [ ] Document workarounds if any
- [ ] Schedule follow-up review in 1 week

**If NEEDS IMPROVEMENT**:
- [ ] Update system prompt based on issues
- [ ] Re-test all 6 scenarios
- [ ] If still failing, escalate to stakeholders

---

## 📚 Additional Resources

- **System Prompt**: `qa-agent-system-prompt.md`
- **Unit Tests**: `qa-agent.test.ts` (for technical validation)
- **Integration Guide**: Coming next (how to hook up to GitHub/workflow)

