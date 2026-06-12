# Skill: Definition of Done

**Used by**: Developer, QA, DevOps, Tech Lead  
**Purpose**: Verify work meets quality standards before moving forward  
**File**: SKILL-LIBRARY/2-definition-of-done.skill.md

---

## Overview

Definition of Done ensures:
- ✅ Consistent quality standards
- ✅ No surprises in next phase
- ✅ Less rework and technical debt
- ✅ Clear expectations

---

## Code Quality DoD

- [ ] Code follows established patterns (wrapAsync, parameterized queries)
- [ ] No hardcoded values (uses env vars or constants)
- [ ] No console.log() left in production code
- [ ] Variable/function names are clear and meaningful
- [ ] Comments explain non-obvious logic (not what, but why)

---

## Testing DoD

- [ ] Unit tests written (all new functions tested)
- [ ] Tests passing (npm run test)
- [ ] Coverage >= 80% for new code (npm run coverage)
- [ ] Edge cases tested (empty, 1, max, invalid)
- [ ] Error states tested (400, 401, 403, 404, 500)

---

## Database DoD (If schema changes)

- [ ] Migration file created (migrations/vN.sql)
- [ ] Migration is idempotent (IF EXISTS, IF NOT EXISTS)
- [ ] Never modifies existing migrations
- [ ] Rollback procedure documented

---

## Frontend DoD (If UI changes)

- [ ] HTML uses esc() for all user data
- [ ] CSS uses design system colors (not hardcoded hex)
- [ ] Responsive design tested (desktop + mobile)
- [ ] Keyboard navigation works
- [ ] No emoji beyond approved set: ★ ✎ ◎ ↻ ✓ ✗ ↑ ⤓ ⊘ #

---

## Documentation DoD

- [ ] Commit messages are clear and descriptive
- [ ] Non-obvious code has comments
- [ ] README updated (if new feature or env vars)
- [ ] API documentation updated (if endpoint changed)

---

## PR Submission DoD

- [ ] PR title is descriptive (CODE-N + feature name)
- [ ] PR description includes what changed
- [ ] PR description includes test strategy
- [ ] Test coverage percentage is stated
- [ ] Screenshots provided (for UI changes)
- [ ] No merge conflicts

---

## Infrastructure DoD (For DevOps)

- [ ] Infrastructure documented (what changed, why)
- [ ] Rollback plan created and tested
- [ ] Monitoring configured
- [ ] Security review passed
- [ ] Scaling implications documented
- [ ] Performance baseline established

---

## How to Use

**Before moving to next phase:**
- [ ] Verify 100% of DoD checklist
- [ ] If ANY item unchecked: FIX IT
- [ ] If ALL items checked: ✅ READY

**For Code:**
1. Verify code quality items
2. Verify testing items
3. Verify documentation items
4. Submit PR

**For Infrastructure:**
1. Verify planning is done
2. Verify implementation tested
3. Verify rollback documented
4. Ready to deploy

---

## Key Principle

**If it's not in DoD, it's not done.**

Don't move forward with incomplete work. Fix it now, not later.

