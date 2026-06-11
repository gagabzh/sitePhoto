# QA Checklist for SitePhoto

## Overview

This document provides comprehensive checklists for the QA Agent to ensure consistent, rigorous testing of all features, bug fixes, and changes before they are merged to the main branch.

---

## 📋 Pre-Merge QA Checklist

### For Every PR (Feature, Bug Fix, or Refactor)

#### 1. **Understand the Change**
- [ ] Read the PR description thoroughly
- [ ] Review the linked issue(s) if applicable
- [ ] Identify the acceptance criteria (AC)
- [ ] Note any specific testing requirements mentioned
- [ ] Understand what existing functionality might be affected

#### 2. **Acceptance Criteria Validation**
- [ ] All acceptance criteria from the issue are listed in the PR
- [ ] Each criterion is clear, testable, and unambiguous
- [ ] No criteria are missing or incomplete
- [ ] Criteria are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)

**If criteria are unclear:**
- Flag to Planner for clarification
- Block PR until criteria are clarified

#### 3. **Test Coverage Review**

##### Developer's Tests
- [ ] Ask Developer: "What tests did you add/modify for this change?"
- [ ] Verify unit tests exist for new logic
- [ ] Verify integration tests exist for new endpoints/routes
- [ ] Verify edge cases are tested
- [ ] Verify error handling is tested
- [ ] Check that existing tests still pass

##### Manual Testing
- [ ] Create a test plan (see Test Plan Template below)
- [ ] Identify happy path scenarios
- [ ] Identify edge cases and boundary conditions
- [ ] Identify potential regression areas
- [ ] Execute manual tests
- [ ] Document test results

#### 4. **Code Quality Check**

**Note:** Tech Lead Reviewer handles code quality, but QA should flag:
- [ ] Obvious security issues (hardcoded secrets, SQL injection, XSS)
- [ ] Missing error handling in critical paths
- [ ] Logic that violates acceptance criteria
- [ ] Hardcoded values that should be configurable

#### 5. **Environment Compatibility**
- [ ] Tests pass on local development environment
- [ ] Tests are configured to pass in GitHub Actions (Node 20)
- [ ] No environment-specific assumptions
- [ ] All required environment variables are documented

#### 6. **Regression Testing**
- [ ] Run tests for related features
- [ ] Test critical user flows (login, upload, view photos)
- [ ] Check API endpoints that might be affected
- [ ] Verify database migrations (if applicable)

#### 7. **Documentation**
- [ ] New/changed functionality is documented
- [ ] API changes are documented (if applicable)
- [ ] Configuration changes are documented (if applicable)
- [ ] Migration steps are documented (if applicable)

#### 8. **Final Approval**
- [ ] All acceptance criteria are met ✓
- [ ] All tests pass (unit, integration, manual) ✓
- [ ] No regressions introduced ✓
- [ ] Ready to report to Tech Lead Reviewer ✓

---

## 🎯 Test Plan Template

Use this template for creating test plans for features/bug fixes:

```markdown
# Test Plan: [Feature/Bug Name]

## Overview
- **PR**: #[number]
- **Issue**: #[number]
- **Tester**: [Your name]
- **Date**: [YYYY-MM-DD]
- **Environment**: [Local/Staging/Production-like]

## Acceptance Criteria
1. [ ] Criterion 1
2. [ ] Criterion 2
3. [ ] Criterion 3

## Test Scope
- **In Scope**: [What will be tested]
- **Out of Scope**: [What won't be tested, and why]
- **Dependencies**: [Other PRs or features this depends on]

## Test Setup
- [ ] Environment variables set
- [ ] Database seeded with test data
- [ ] External services mocked/stubbed
- [ ] Test user accounts created

## Happy Path Tests

### Scenario 1: [Primary use case]
- **Precondition**: [State before test]
- **Steps**:
  1. [Action 1]
  2. [Action 2]
  3. [Action 3]
- **Expected Result**: [What should happen]
- **Actual Result**: [What actually happened]
- **Status**: ✓ PASS / ✗ FAIL / ⚠ BLOCKED
- **Notes**: [Any observations]

### Scenario 2: [Another main flow]
- ...

## Edge Cases & Error Handling

### Edge Case 1: [Boundary condition]
- **Precondition**: [State]
- **Steps**: [Actions]
- **Expected Result**: [Graceful handling]
- **Actual Result**: [What happened]
- **Status**: ✓ PASS / ✗ FAIL / ⚠ BLOCKED

### Edge Case 2: [Error scenario]
- ...

## Regression Tests
- [ ] Feature A (related) still works
- [ ] Feature B (related) still works
- [ ] API endpoint X still responds correctly
- [ ] Database queries are performant

## Security Checks
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] Output encoding present
- [ ] Authentication/authorization checks in place
- [ ] Error messages don't leak sensitive information

## Performance Checks
- [ ] No significant performance degradation
- [ ] Database queries optimized
- [ ] No N+1 query issues
- [ ] File operations efficient

## Test Results Summary
- **Total Tests**: X
- **Passed**: X
- **Failed**: X
- **Blocked**: X
- **Overall Status**: ✓ READY / ✗ NEEDS WORK / ⚠ CONDITIONAL

## Bugs Found
- #[ID]: [Title] - [Severity: Blocker/High/Medium/Low]

## Recommendations
- [Any improvements or concerns]

## Sign-Off
- **QA Status**: ✓ APPROVED / ✗ REJECTED
- **Conditions**: [Any conditions for approval]
- **Date**: [YYYY-MM-DD]
- **QA Agent**: [Your name]
```

---

## 🐛 Bug Report Template

When you find a bug during testing:

```markdown
### Bug: [Short, descriptive title]

- **Found in**: Test plan step #[N] / Manual testing / Automated test
- **Severity**: Blocker / High / Medium / Low
- **Priority**: Blocks feature / Degrades UX / Cosmetic
- **Environment**: [Local/Staging/Production]

#### Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

#### Expected Behavior
[What should happen]

#### Actual Behavior
[What actually happens]

#### Evidence
- Screenshot: [Attach or describe]
- Log snippet: [Relevant logs]
- Test output: [Test failure message]

#### Related Code
- File: [file.js]
- Line: [line number]
- Function: [function name]

#### Suggested Fix
[If you have a suggestion]

#### Assigned To
@developer
```

---

## 🔍 Test Review Checklist

### For Route/API Tests
- [ ] All HTTP methods tested (GET, POST, PUT, DELETE, PATCH)
- [ ] All query parameters tested
- [ ] All request body fields tested
- [ ] Authentication/authorization tested
- [ ] Error responses tested (400, 401, 403, 404, 500)
- [ ] Input validation tested
- [ ] Edge cases tested (empty, null, invalid types)
- [ ] Rate limiting tested (if applicable)
- [ ] CORS headers tested (if applicable)

### For Database Tests
- [ ] CRUD operations tested
- [ ] Transactions tested
- [ ] Foreign key constraints tested
- [ ] Index usage verified
- [ ] Query performance tested
- [ ] Migrations tested (up and down)
- [ ] Rollback scenarios tested

### For UI Tests
- [ ] All user flows tested
- [ ] Form validation tested
- [ ] Error messages displayed correctly
- [ ] Loading states tested
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] Accessibility tested (keyboard navigation, screen readers)
- [ ] Browser compatibility tested

### For Async/Queue Tests
- [ ] Job enqueuing tested
- [ ] Job processing tested
- [ ] Job retry logic tested
- [ ] Job failure handling tested
- [ ] Queue monitoring tested
- [ ] Race conditions tested

---

## 📊 Test Metrics to Track

### Per Sprint
- [ ] % of PRs with tests passing on first review
- [ ] % of PRs requiring QA feedback
- [ ] Average time from PR creation to QA approval
- [ ] Number of bugs found in testing
- [ ] Number of bugs escaped to production

### Per Release
- [ ] Code coverage percentage
- [ ] Test suite execution time
- [ ] Flaky test rate (< 1% target)
- [ ] Regression test pass rate (100% target)

---

## 🚨 Common Issues to Watch For

### Test Anti-Patterns
- ❌ Tests that depend on global state
- ❌ Tests that don't clean up after themselves
- ❌ Tests that test implementation details (not behavior)
- ❌ Slow tests (> 5 seconds)
- ❌ Flaky tests (pass sometimes, fail sometimes)
- ❌ Tests with no assertions
- ❌ Tests that test multiple things at once

### Code Anti-Patterns (Flag for Tech Lead)
- ❌ Hardcoded secrets or credentials
- ❌ SQL injection vulnerabilities
- ❌ XSS vulnerabilities
- ❌ Missing input validation
- ❌ Missing error handling
- ❌ Inconsistent error responses
- ❌ Magic numbers/strings
- ❌ Duplicate code
- ❌ Dead code (unused functions, variables)

### Performance Anti-Patterns
- ❌ N+1 database queries
- ❌ Loading entire tables into memory
- ❌ Synchronous operations in async contexts
- ❌ Blocking the event loop
- ❌ Memory leaks (unclosed connections, event listeners)

---

## 📚 Resources

### Testing Tools
- **Jest**: JavaScript testing framework
- **Supertest**: HTTP assertions
- **Mocking**: `jest.mock()`, `jest.fn()`
- **Coverage**: `jest --coverage`

### Test Directories
- `src/__tests__/`: Main test directory
- `src/__tests__/routes/`: Route tests
- `src/__tests__/queue/`: Queue tests
- `src/__tests__/setup.js`: Global test setup

### Documentation
- [Jest Documentation](https://jestjs.io/docs)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Node.js Testing Guide](https://nodejs.org/en/docs/guides/testing-nodejs/)

---

## 🎓 Continuous Improvement

### After Each Sprint
1. Review bugs that escaped to production
2. Identify patterns in missed bugs
3. Update checklists to prevent recurrence
4. Share lessons learned with the team

### After Each Release
1. Review test coverage trends
2. Identify flaky tests and fix them
3. Optimize slow tests
4. Update test infrastructure as needed

### Quarterly
1. Review and update test strategy
2. Evaluate new testing tools/libraries
3. Conduct test coverage audit
4. Plan test improvements for next quarter

---

## 📞 Escalation Procedures

### When to Escalate
| Situation | Escalate To | Method |
|-----------|-------------|--------|
| Unclear acceptance criteria | Planner | PR comment / Slack |
| Code quality concerns | Tech Lead Reviewer | PR comment / Slack |
| Security vulnerabilities | Tech Lead + Security Team | PR comment + Security channel |
| Blocking dependencies | Planner | PR comment / Slack |
| Production issues | DevOps + On-call | Slack + PagerDuty |
| Test infrastructure issues | DevOps | Slack / GitHub Issue |

### Escalation Template
```
@[person/role]

**Issue**: [Brief description]

**Impact**: [High/Medium/Low - what's affected]

**Context**: [PR #, Feature, etc.]

**Details**: [Full description]

**Suggested Action**: [What you think should happen]

**Urgency**: [Immediate / Today / This week]
```

---

## ✅ Definition of Done (for QA)

A feature/bug fix is **Done** from a QA perspective when:

1. ✅ All acceptance criteria are met and verified
2. ✅ All tests pass (unit, integration, manual)
3. ✅ No regressions introduced
4. ✅ Test plan executed and documented
5. ✅ Bugs found are either fixed or documented as known issues
6. ✅ Code meets minimum quality standards (no obvious security issues)
7. ✅ Documentation is complete
8. ✅ Ready for Tech Lead Reviewer's code review

---

*This document is a living document. Update it as processes improve and new patterns emerge.*
