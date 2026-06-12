# Agent-Skill Mapping System

**Central configuration for which agents use which skills**  
**File**: generic/skills/AGENT-SKILL-MAPPING.md

---

## Overview

This file provides a **generic, customizable framework** for mapping agents to skills. Unlike the original project-specific version, this is designed to be:

- ✅ **Project-agnostic** - Works for any project type
- ✅ **Customizable** - Add/remove agents and skills as needed
- ✅ **Scalable** - Grows with your team and project complexity
- ✅ **Modular** - Skills can be reused across agents
- ✅ **Well-documented** - Clear usage instructions

---

## Skill Library

All skills are located in `generic/skills/` directory:

| Skill # | Skill Name | File | Purpose |
|---------|------------|------|---------|
| 1 | Blocker Tracking | `1-blocker-tracking.skill.md` | Track and escalate blockers systematically |
| 2 | Definition of Done | `2-definition-of-done.skill.md` | Verify work meets quality standards |
| 3 | Git Safety | `3-git-safety.skill.md` | Prevent git workflow mistakes |
| 4 | Acceptance Criteria Scorer | `4-acceptance-criteria-scorer.skill.md` | Evaluate acceptance criteria quality |

**Total Available Skills**: 4

---

## Default Agent-Skill Matrix

This is a **recommended starting configuration** for a typical software development team. Customize based on your specific needs.

| Agent Role | Blocker Tracking | Definition of Done | Git Safety | Acceptance Criteria Scorer | Total Skills |
|------------|------------------|-------------------|------------|----------------------------|---------------|
| **Product Owner** | ✅ | - | ✅ | ✅ | 3 |
| **Product Manager** | ✅ | - | ✅ | ✅ | 3 |
| **Business Analyst** | ✅ | - | - | ✅ | 2 |
| **Planner / Scrum Master** | ✅ | ✅ | ✅ | - | 3 |
| **Project Manager** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Developer** | - | ✅ | ✅ | - | 2 |
| **Frontend Developer** | - | ✅ | ✅ | - | 2 |
| **Backend Developer** | - | ✅ | ✅ | - | 2 |
| **Full-Stack Developer** | - | ✅ | ✅ | - | 2 |
| **Mobile Developer** | - | ✅ | ✅ | - | 2 |
| **QA Agent / Tester** | - | ✅ | ✅ | ✅ | 3 |
| **QA Lead** | ✅ | ✅ | ✅ | ✅ | 4 |
| **DevOps Engineer** | - | ✅ | ✅ | - | 2 |
| **DevOps Lead** | ✅ | ✅ | ✅ | - | 3 |
| **Tech Lead / Architect** | - | ✅ | ✅ | - | 2 |
| **Senior Tech Lead** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Security Engineer** | - | ✅ | ✅ | - | 2 |
| **Security Lead** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Documentation Specialist** | - | ✅ | ✅ | - | 2 |
| **UX/UI Designer** | - | ✅ | ✅ | - | 2 |
| **Data Scientist** | - | ✅ | ✅ | - | 2 |
| **Data Engineer** | - | ✅ | ✅ | - | 2 |

**Total Agent Roles**: 22

---

## Detailed Agent Configurations

### Product Owner
**Primary Focus**: Feature definition, prioritization, acceptance criteria

**Recommended Skills:**
1. **Blocker Tracking** (`1-blocker-tracking.skill.md`)
   - Identify blockers when writing user stories
   - Use 🔴 BLOCKER: format for clarity
   - Escalate blockers to appropriate teams

2. **Git Safety** (`3-git-safety.skill.md`)
   - Review PRs before merge
   - Ensure feature branches are used
   - Verify commit messages are descriptive

3. **Acceptance Criteria Scorer** (`4-acceptance-criteria-scorer.skill.md`)
   - Score criteria before finalizing stories
   - Target score: >= 7 (good to excellent)
   - Iterate with QA on criteria clarity

**When to Use Each Skill:**
- Blocker Tracking: During sprint planning, story refinement
- Git Safety: During PR review process
- Acceptance Criteria Scorer: When writing or reviewing user stories

---

### Planner / Scrum Master
**Primary Focus**: Sprint planning, task breakdown, dependency management

**Recommended Skills:**
1. **Blocker Tracking** (`1-blocker-tracking.skill.md`)
   - Maintain blocker dashboard
   - Track blocker lifecycle (OPEN → IN_PROGRESS → RESOLVED → CLOSED)
   - Escalate blockers appropriately

2. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Verify tasks meet DoD before moving to next phase
   - Check all DoD boxes before sprint planning

3. **Git Safety** (`3-git-safety.skill.md`)
   - Verify PRs are ready before merge
   - Ensure review process is followed
   - Check branch naming conventions

**When to Use Each Skill:**
- Blocker Tracking: Daily standups, sprint planning
- Definition of Done: Sprint planning, task breakdown
- Git Safety: Sprint review, before merging PRs

---

### Developer (All Types)
**Primary Focus**: Code implementation, testing, PR submission

**Recommended Skills:**
1. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Verify 100% before submitting PR
   - Check code quality, testing, and documentation items
   - For specialized work (frontend, backend, etc.), use relevant DoD section

2. **Git Safety** (`3-git-safety.skill.md`)
   - Create feature branches (never commit to main)
   - Follow branch naming convention
   - Write clear commit messages
   - Create PRs with clear descriptions

**When to Use Each Skill:**
- Definition of Done: Before committing, before creating PR
- Git Safety: Before every commit, push, and PR creation

---

### QA Agent / Tester
**Primary Focus**: Test planning, execution, bug reporting

**Recommended Skills:**
1. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Verify test coverage >= 80%
   - Check all testing items in DoD
   - Validate test data and environment setup

2. **Git Safety** (`3-git-safety.skill.md`)
   - Review git workflow in PRs
   - Verify feature branches used
   - Check PR descriptions for test information

3. **Acceptance Criteria Scorer** (`4-acceptance-criteria-scorer.skill.md`)
   - Score criteria testability before testing
   - Request revisions if score < 7
   - Use criteria as basis for test plans

**When to Use Each Skill:**
- Definition of Done: When reviewing PRs, creating test plans
- Git Safety: During PR review
- Acceptance Criteria Scorer: Before starting test planning

---

### DevOps Engineer
**Primary Focus**: Infrastructure, deployment, CI/CD

**Recommended Skills:**
1. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Infrastructure DoD items (rollback plans, monitoring, security)
   - DevOps-specific DoD section

2. **Git Safety** (`3-git-safety.skill.md`)
   - Infra changes via feature branches
   - Never commit to main
   - Follow git workflow for infrastructure code

**When to Use Each Skill:**
- Definition of Done: Before deploying, before merging infra changes
- Git Safety: Before committing infrastructure code

---

### Tech Lead / Architect
**Primary Focus**: Code review, architecture decisions, quality assurance

**Recommended Skills:**
1. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Code quality checklist
   - Architecture and security review items
   - Documentation requirements

2. **Git Safety** (`3-git-safety.skill.md`)
   - Review git workflow in PRs
   - Approve before merge
   - Verify branch protection rules

**When to Use Each Skill:**
- Definition of Done: During code review
- Git Safety: During PR review process

---

### Security Engineer
**Primary Focus**: Security review, vulnerability assessment

**Recommended Skills:**
1. **Definition of Done** (`2-definition-of-done.skill.md`)
   - Security-specific DoD items
   - Input validation, authentication, data protection

2. **Git Safety** (`3-git-safety.skill.md`)
   - Verify git workflow is secure
   - No secrets in commits
   - Branch protection rules followed

**When to Use Each Skill:**
- Definition of Done: During security review
- Git Safety: During PR security assessment

---

## Customization Guide

### Adding a New Skill

1. **Create the skill file**
   ```bash
   # Create new skill file with numbering
   touch generic/skills/5-new-skill.skill.md
   ```

2. **Add skill metadata**
   ```markdown
   # Skill: [Skill Name]
   
   **Used by**: [Agent roles that use this skill]
   **Purpose**: [Brief description of purpose]
   **File**: generic/skills/5-new-skill.skill.md
   
   ---
   
   ## Overview
   
   [Detailed description]
   ```

3. **Update this mapping file**
   - Add row to the skill library table
   - Add column to agent-skill matrix
   - Add skill to relevant agent configurations

4. **Update agent prompts**
   - Add skill reference to each agent that uses it
   - Example:
     ```markdown
     ## Skills This Agent Uses
     
     1. **New Skill** (generic/skills/5-new-skill.skill.md)
        - When to use
        - What it covers
     ```

---

### Adding a New Agent Role

1. **Create the agent template** (see agent templates directory)

2. **Add to this mapping file**
   - Add row to agent-skill matrix
   - Add detailed agent configuration section
   - Assign appropriate skills

3. **Test the agent**
   - Verify skills are accessible
   - Validate agent behavior

---

### Customizing for Your Project

#### Step 1: Identify Your Team Roles

List your actual team roles (some may be combined):
- [ ] Product Owner
- [ ] Product Manager
- [ ] Developer (Frontend/Backend/Full-Stack)
- [ ] QA Engineer
- [ ] DevOps Engineer
- [ ] Tech Lead
- [ ] Designer
- [ ] Other: _______________

#### Step 2: Select Skills for Each Role

For each role, select which skills are relevant:

```markdown
# My Project - Agent-Skill Configuration

## Team Members and Their Skills

### John Doe - Tech Lead
- [x] Definition of Done
- [x] Git Safety
- [ ] Blocker Tracking (if also does planning)
- [ ] Acceptance Criteria Scorer

### Jane Smith - QA Engineer  
- [x] Definition of Done
- [x] Git Safety
- [x] Acceptance Criteria Scorer
- [ ] Blocker Tracking

### Bob Johnson - Developer
- [x] Definition of Done
- [x] Git Safety
- [ ] Blocker Tracking
- [ ] Acceptance Criteria Scorer
```

#### Step 3: Create Project-Specific Configuration

Create a `config/` file for your project:

```yaml
# generic/config/my-project-config.yaml
project_name: "My Awesome Project"
team_size: 8
methodology: "Scrum"

agents:
  - name: "Tech Lead"
    role: "tech-lead"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
    color: "gold"
    
  - name: "QA Agent"
    role: "qa"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
      - "4-acceptance-criteria-scorer"
    color: "green"

  - name: "Developer"
    role: "developer"
    skills:
      - "2-definition-of-done"
      - "3-git-safety"
    color: "blue"

skills:
  required:
    - "2-definition-of-done"
    - "3-git-safety"
  optional:
    - "1-blocker-tracking"
    - "4-acceptance-criteria-scorer"
```

---

## Configuration Templates

### Minimal Team (1-3 People)

**Agents:**
- Developer + QA (combined)
- Product Owner (part-time)

**Skills:**
- All agents: Definition of Done, Git Safety
- Product Owner: + Acceptance Criteria Scorer
- Developer: Focus on core implementation

### Small Team (4-10 People)

**Agents:**
- Product Owner
- Tech Lead
- 2-3 Developers
- 1 QA Engineer
- 1 DevOps (part-time)

**Skills:**
- Product Owner: Blocker Tracking, Git Safety, Acceptance Criteria Scorer
- Tech Lead: Definition of Done, Git Safety
- Developers: Definition of Done, Git Safety
- QA: Definition of Done, Git Safety, Acceptance Criteria Scorer
- DevOps: Definition of Done, Git Safety

### Medium Team (11-25 People)

**Agents:**
- Product Owner
- Product Manager
- Tech Lead
- Architect
- Frontend Developers
- Backend Developers
- QA Lead + QA Engineers
- DevOps Engineer
- Security Engineer

**Skills:**
- All agents: Git Safety
- Product roles: Blocker Tracking, Acceptance Criteria Scorer
- All developers: Definition of Done
- QA: + Acceptance Criteria Scorer
- Tech Lead/Architect: Definition of Done (advanced)
- DevOps/Security: Definition of Done (specialized)

### Large Team (26+ People)

**Agents:**
- Multiple Product Owners (by product area)
- Product Manager
- Multiple Tech Leads (by domain)
- Architects
- Frontend/Backend/Mobile Developers
- QA Team (Lead + Engineers)
- DevOps Team
- Security Team

**Skills:**
- All agents: Git Safety, Definition of Done
- Product roles: + Blocker Tracking, Acceptance Criteria Scorer
- QA: + Acceptance Criteria Scorer (advanced)
- Tech Leads: Definition of Done (architectural focus)
- Specialists: Domain-specific skills as needed

---

## Best Practices

### 1. Start Small
- Begin with 2-3 essential skills (Definition of Done, Git Safety)
- Add skills as your team matures
- Don't overload agents with too many skills initially

### 2. Train Your Team
- Hold a workshop to explain skills
- Provide examples of good vs bad usage
- Assign skill "champions" for each skill

### 3. Iterate and Improve
- Review skill usage at retrospectives
- Update skills based on feedback
- Remove skills that aren't adding value

### 4. Automate Where Possible
- Use Git hooks for Git Safety
- Use CI checks for Definition of Done items
- Use templates for Acceptance Criteria

### 5. Document Customizations
- Keep a changelog of skill modifications
- Document project-specific adaptations
- Share learnings across teams

---

## Troubleshooting

**Problem**: Agents aren't using their skills  
**Solution**: 
- Verify skills are listed in agent configuration
- Check that skill files are accessible
- Provide training on skill usage
- Add reminders in agent prompts

**Problem**: Skills are conflicting or overlapping  
**Solution**:
- Review skill definitions for duplication
- Clarify which skill to use when
- Merge overlapping skills if appropriate

**Problem**: Some agents need more/fewer skills  
**Solution**:
- Customize agent configuration for each role
- Consider creating specialized agent variants
- Re-evaluate skill assignments regularly

**Problem**: Skills are too generic/not specific enough  
**Solution**:
- Create project-specific versions of skills
- Add project-specific sections to skills
- Use skill customization guide

---

## Quick Reference

### Most Common Skill Combinations

| Role | Essential Skills | Optional Skills |
|------|------------------|-----------------|
| **Product Owner** | Acceptance Criteria Scorer, Git Safety | Blocker Tracking |
| **Developer** | Definition of Done, Git Safety | - |
| **QA** | Definition of Done, Git Safety, Acceptance Criteria Scorer | Blocker Tracking |
| **Tech Lead** | Definition of Done, Git Safety | Blocker Tracking |
| **DevOps** | Definition of Done, Git Safety | Blocker Tracking |

### Skill Usage by Phase

| Project Phase | Recommended Skills |
|---------------|---------------------|
| **Planning** | Blocker Tracking, Acceptance Criteria Scorer |
| **Development** | Definition of Done, Git Safety |
| **Review** | Definition of Done, Git Safety, Acceptance Criteria Scorer |
| **Testing** | Definition of Done, Acceptance Criteria Scorer |
| **Deployment** | Definition of Done, Git Safety |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-04 | Initial generic mapping created |

---

**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Total Skills**: 4  
**Total Agent Roles**: 22  
**Configuration**: Generic (customizable for any project)
