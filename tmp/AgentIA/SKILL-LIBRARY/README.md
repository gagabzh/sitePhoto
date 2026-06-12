# Skill Library

Central repository of reusable skills used by all agents.

## 📚 Skills

### 1. Blocker Tracking
**File**: `1-blocker-tracking.skill.md`  
**Used by**: Planner, Product Owner  
**Purpose**: Track and escalate blockers systematically

**Format**: 🔴 BLOCKER: [CODE-N] — [Title]  
**Lifecycle**: OPEN → IN_PROGRESS → RESOLVED → CLOSED  
**Escalation**: Tech, Product, QA, External blockers

### 2. Definition of Done
**File**: `2-definition-of-done.skill.md`  
**Used by**: Developer, QA, DevOps, Tech Lead  
**Purpose**: Verify work meets quality standards before moving forward

**Coverage**: Code Quality, Testing, Database, Frontend, Documentation, PR, Infrastructure  
**Key Principle**: If it's not in DoD, it's not done

### 3. Git Safety
**File**: `3-git-safety.skill.md`  
**Used by**: Developer, DevOps, Planner, All agents  
**Purpose**: Prevent accidental commits to main, ensure clean git workflow

**Protection Levels**: Local hook, GitHub rules, Workflow process  
**Branch Naming**: feature/, bugfix/, hotfix/, docs/, refactor/  
**Workflow**: Feature → PR → Review → Merge

### 4. Acceptance Criteria Quality Scorer
**File**: `4-acceptance-criteria-scorer.skill.md`  
**Used by**: Product Owner, QA Agent  
**Purpose**: Evaluate if criteria are testable (0-10 score)

**Rubric**: Specificity, Language, Edge Cases, Error States  
**Scoring**: 9-10 Ready | 7-8 Good | 5-6 Needs work | 3-4 Major gaps | 0-2 Rewrite  
**Key**: Testable, specific, no vague language

---

## 🔗 How to Use Skills

### For Agents

Reference skills in your prompt:

```markdown
## Skills This Agent Uses

1. **Blocker Tracking** (SKILL-LIBRARY/1-blocker-tracking.skill.md)
2. **Definition of Done** (SKILL-LIBRARY/2-definition-of-done.skill.md)
3. **Git Safety** (SKILL-LIBRARY/3-git-safety.skill.md)

For implementation details, see skill files.
```

### For Teams

Use AGENT-CONFIG.md to see which agents use which skills.

### For Updates

- Edit skill file in SKILL-LIBRARY/
- All agents using it get the update automatically
- No duplication!

---

## ✨ Benefits

✅ **No Duplicates**: Skills defined once, used by all agents  
✅ **Easy Updates**: Change skill → update 1 file  
✅ **Consistency**: All agents use same standards  
✅ **Scalability**: Add agents, they use existing skills  
✅ **Documentation**: Centralized reference

---

## 📋 Adding New Skills

1. Create file: `N-skill-name.skill.md`
2. Document it in this README
3. Add to AGENT-CONFIG.md
4. Agents can now reference it

### Skill Template

```markdown
# Skill: [Name]

**Used by**: [Agents]  
**Purpose**: [What it does]  
**File**: SKILL-LIBRARY/N-skill-name.skill.md

---

## Overview

This skill ensures:
- ✅ [Benefit 1]
- ✅ [Benefit 2]

---

## [Section 1]

[Content]

---

## How to Use

[Usage instructions]
```

---

## 🎯 Current Skills: 4

- ✅ Blocker Tracking
- ✅ Definition of Done
- ✅ Git Safety
- ✅ Acceptance Criteria Scorer

## Planned Skills

- Risk Assessment (identify + assess risks)
- Testability Scorer (score how testable a feature is)

---

## 📞 Support

Questions about a skill?
1. Read the skill file
2. Check AGENT-CONFIG.md for which agents use it
3. See examples in the skill file

---

**Last Updated**: 2026-05-30  
**Skills**: 4  
**Agents Using**: All 8 agents

