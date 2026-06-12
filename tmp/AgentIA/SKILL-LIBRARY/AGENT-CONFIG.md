# Agent-Skill Mapping

Central mapping of which agents use which skills.

## 📊 Skill Usage Matrix

| Agent | Blocker Tracking | Definition of Done | Git Safety | Acceptance Scorer |
|-------|------------------|-------------------|------------|-------------------|
| **Product Owner** | ✅ | - | ✅ | ✅ |
| **Planner** | ✅ | ✅ | ✅ | - |
| **Developer** | - | ✅ | ✅ | - |
| **QA Agent** | - | ✅ | ✅ | ✅ |
| **DevOps** | - | ✅ | ✅ | - |
| **Tech Lead** | - | ✅ | ✅ | - |
| **Security Agent** | - | - | ✅ | - |
| **Documentation Agent** | - | - | ✅ | - |

---

## 🔗 Detailed Usage

### Product Owner
**Skills Used**:
1. **Blocker Tracking** (1-blocker-tracking.skill.md)
   - Identify blockers when writing stories
   - Use format 🔴 BLOCKER: [CODE-N]

2. **Git Safety** (3-git-safety.skill.md)
   - Review PRs before merge
   - Ensure feature branches used

3. **Acceptance Criteria Scorer** (4-acceptance-criteria-scorer.skill.md)
   - Score criteria before finalizing stories
   - Target score >= 7

---

### Planner
**Skills Used**:
1. **Blocker Tracking** (1-blocker-tracking.skill.md)
   - Track blocker lifecycle
   - Maintain blocker dashboard
   - Escalate appropriately

2. **Definition of Done** (2-definition-of-done.skill.md)
   - Verify tasks meet DoD before starting
   - Check all boxes before moving to next phase

3. **Git Safety** (3-git-safety.skill.md)
   - Verify PRs ready before merge
   - Ensure review process followed

---

### Developer
**Skills Used**:
1. **Definition of Done** (2-definition-of-done.skill.md)
   - Verify 100% before submitting PR
   - Code quality, testing, documentation

2. **Git Safety** (3-git-safety.skill.md)
   - Create feature branches (never commit to main)
   - Follow branch naming convention
   - Create PRs with clear descriptions

---

### QA Agent
**Skills Used**:
1. **Definition of Done** (2-definition-of-done.skill.md)
   - Verify test coverage >= 80%
   - Check all testing items

2. **Git Safety** (3-git-safety.skill.md)
   - Review git workflow in PRs
   - Verify feature branches used

3. **Acceptance Criteria Scorer** (4-acceptance-criteria-scorer.skill.md)
   - Score criteria testability
   - Request revisions if score < 7

---

### DevOps
**Skills Used**:
1. **Definition of Done** (2-definition-of-done.skill.md)
   - Infrastructure DoD items
   - Rollback plan, monitoring, security

2. **Git Safety** (3-git-safety.skill.md)
   - Infra changes via feature branches
   - Never commit to main

---

### Tech Lead
**Skills Used**:
1. **Definition of Done** (2-definition-of-done.skill.md)
   - Code quality checklist
   - Architecture, security, performance

2. **Git Safety** (3-git-safety.skill.md)
   - Review git workflow in PRs
   - Approve before merge

---

### Security Agent
**Skills Used**:
1. **Git Safety** (3-git-safety.skill.md)
   - Verify git workflow secure
   - No secrets in commits

---

### Documentation Agent
**Skills Used**:
1. **Git Safety** (3-git-safety.skill.md)
   - Doc changes via feature branches
   - Proper PR workflow

---

## 🔄 How to Update

### Change a Skill

1. Edit skill file in SKILL-LIBRARY/
   ```bash
   nano SKILL-LIBRARY/1-blocker-tracking.skill.md
   ```

2. Update version/date in skill file

3. All agents using it automatically get update ✅
   (No need to update agents separately!)

### Add a New Skill

1. Create skill file: `SKILL-LIBRARY/N-skill-name.skill.md`

2. Add to this file (AGENT-CONFIG.md)
   - Add row to matrix
   - Add detailed section

3. Update SKILL-LIBRARY/README.md
   - Add skill to list
   - Describe purpose

4. Agents can now reference it in their prompts

### Add New Agent

1. Add row to matrix above

2. Assign skills this agent uses

3. Agent references skills in their prompt:
   ```markdown
   ## Skills This Agent Uses
   
   1. **Skill Name** (SKILL-LIBRARY/N-skill-name.skill.md)
   ```

---

## 📋 Agent Prompt Template

When referencing skills in agent prompts:

```markdown
## Skills This Agent Uses

This agent uses these skills from SKILL-LIBRARY/:

1. **Skill Name** (SKILL-LIBRARY/1-skill-name.skill.md)
   - When to use
   - What it covers

2. **Another Skill** (SKILL-LIBRARY/2-another-skill.skill.md)
   - When to use
   - What it covers

For detailed implementation, see skill files.
```

---

## ✨ Benefits

✅ **Single Source of Truth**: AGENT-CONFIG.md = complete overview  
✅ **No Duplication**: Skills defined once  
✅ **Easy Maintenance**: Update skill = automatic propagation  
✅ **Clear Ownership**: See which agents use what  
✅ **Scalable**: Add agents/skills easily  

---

## 📞 Quick Reference

**Question**: Which agents use Git Safety?  
**Answer**: All 8 agents (see Git Safety row in matrix)

**Question**: Does Developer use Acceptance Criteria Scorer?  
**Answer**: No (only PO and QA, see matrix)

**Question**: What skills does Planner use?  
**Answer**: 3 skills (Blocker Tracking, Definition of Done, Git Safety)

---

**Last Updated**: 2026-05-30  
**Total Agents**: 8  
**Total Skills**: 4  
**Total Relationships**: 18 agent-skill pairs

