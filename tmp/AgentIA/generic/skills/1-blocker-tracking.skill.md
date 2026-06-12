# Skill: Blocker Tracking

**Used by**: Planner, Product Owner, Tech Lead, Project Manager  
**Purpose**: Track and escalate blockers systematically across any project  
**File**: generic/skills/1-blocker-tracking.skill.md

---

## Overview

This skill ensures:
- ✅ Blockers identified early in the development lifecycle
- ✅ Lifecycle tracked consistently (OPEN → IN_PROGRESS → RESOLVED → CLOSED)
- ✅ Clear escalation paths for all blocker types
- ✅ No surprises late in sprints or project phases
- ✅ Works for any project type (web, mobile, API, infrastructure)

---

## Blocker Format

Use this exact format for EVERY blocker:

```
🔴 BLOCKER: [PROJECT-CODE]-N — [Short descriptive title]
  Category: Tech | Product | Design | QA | DevOps | External | Dependency
  Severity: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
  Impact: [What is blocked? Which features/tasks?]
  Owner: [Who is responsible for resolving? @username or role]
  Status: 🔴 OPEN → 🟡 IN_PROGRESS → 🟢 RESOLVED → ✅ CLOSED
  Resolve by: [Date or milestone]
  Notes: [Any context, workarounds, or additional information]
  Related: [Links to issues, PRs, or documentation]
```

---

## Blocker Lifecycle

### 1. OPEN
- Blockers identified and needs triage
- Assign owner immediately
- Clarify impact on project timeline
- Set realistic resolve-by date
- Add initial notes with context

### 2. IN_PROGRESS
- Owner has started working on it
- Update daily with progress
- Add notes on what's been tried
- Escalate if stuck for >24 hours
- Adjust resolve-by date if needed

### 3. RESOLVED
- Fix has been implemented
- Needs verification by reporter or QA
- Test the fix in appropriate environment
- Verify it actually resolves the blocker
- Get sign-off from relevant parties

### 4. CLOSED
- Verification complete
- Blocked tasks can now proceed
- Document resolution in notes
- Archive if no longer relevant

---

## Category Definitions

### Tech Blocker
**Examples**: Infrastructure issues, code dependencies, technical debt
- Assign to: Tech Lead, Developer, or DevOps
- Timeline: ASAP (can block entire sprint)
- **Subcategories**: Architecture, Database, API, Security

### Product Blocker  
**Examples**: Feature dependencies, unclear requirements, scope changes
- Assign to: Product Owner or Product Manager
- Timeline: Before development starts
- **Subcategories**: Requirements, Prioritization, Roadmap

### Design Blocker
**Examples**: UI/UX decisions pending, design system gaps, accessibility concerns
- Assign to: Designer or UX Lead
- Timeline: Before UI development begins
- **Subcategories**: Visual, Interaction, Accessibility

### QA Blocker
**Examples**: Test environment unavailable, test data missing, unclear acceptance criteria
- Assign to: QA Lead or QA Agent
- Timeline: Before QA testing phase
- **Subcategories**: Environment, Testability, Coverage

### DevOps Blocker
**Examples**: Deployment issues, CI/CD failures, infrastructure constraints
- Assign to: DevOps Engineer or Infrastructure Team
- Timeline: Depends on criticality
- **Subcategories**: Deployment, Monitoring, Scaling, Security

### External Blocker
**Examples**: Third-party service issues, vendor dependencies, API limitations
- Assign to: Relevant team or vendor contact
- Timeline: Depends on external service SLA
- **Subcategories**: Third-party API, Vendor, Open Source, Compliance

### Dependency Blocker
**Examples**: Waiting on other teams, cross-project dependencies, resource constraints
- Assign to: Project Manager or dependency owner
- Timeline: Negotiate with dependency owner
- **Subcategories**: Team, Resource, Timeline

---

## Severity Guidelines

### 🔴 Critical
- **Definition**: Blocks entire project/sprint, affects production, or causes data loss
- **Response time**: Immediate (within hours)
- **Examples**: Production outage, security vulnerability, data corruption
- **Escalation**: Notify all stakeholders immediately

### 🟠 High  
- **Definition**: Blocks major feature, affects multiple team members, or has significant timeline impact
- **Response time**: Within 24 hours
- **Examples**: Feature deadline at risk, multiple developers blocked, integration failure
- **Escalation**: Notify team leads and project manager

### 🟡 Medium
- **Definition**: Blocks a single task or feature, workarounds available
- **Response time**: Within 3-5 business days
- **Examples**: Missing feature for non-critical path, minor environment issue
- **Escalation**: Notify relevant team members

### 🟢 Low
- **Definition**: Nice-to-have, cosmetic, or minor improvement
- **Response time**: Next sprint or as resources allow
- **Examples**: Documentation updates, minor UI tweaks, performance optimization
- **Escalation**: Track in backlog

---

## Blocker Dashboard

Maintain a blocker dashboard for visibility. Update it daily.

```
📊 BLOCKER DASHBOARD — [Project Name] — [Date]

🔴 CRITICAL (Must fix immediately):
  - [List any critical blockers with owner and resolve-by date]

🟠 HIGH (Fix this sprint/iteration):
  - [List all high severity blockers]

🟡 MEDIUM (Fix soon):
  - [List all medium severity blockers]

🟢 LOW (Backlog):
  - [List all low severity blockers]

✅ RESOLVED (Needs verification):
  - [List blockers that need verification]

📋 CLOSED (Done):
  - [Archived for reference, keep last 30 days]

📈 Metrics:
  - Total blockers: [N]
  - Average resolution time: [X days]
  - Blockers resolved this week: [N]
```

---

## Usage Workflows

### When Planning a Task
- [ ] Check blocker dashboard for project
- [ ] Are there blockers affecting this task?
- [ ] Have all blockers reached RESOLVED or CLOSED?
- [ ] If not, task cannot start until blockers are resolved
- [ ] If blocked, add dependency to task description

### When a Blocker is Reported
- [ ] Create blocker using format above
- [ ] Assign to responsible person/role
- [ ] Set appropriate severity based on impact
- [ ] Set resolve-by date (negotiate with owner if needed)
- [ ] Add to blocker dashboard
- [ ] Notify relevant stakeholders
- [ ] Update status daily until resolved

### When a Blocker is Resolved
- [ ] Mark as RESOLVED
- [ ] Verify the fix actually works
- [ ] Get sign-off from reporter or affected parties
- [ ] Mark as CLOSED when verification complete
- [ ] Unblock dependent tasks
- [ ] Update project timeline if needed

### Weekly Blocker Review
- [ ] Review all OPEN and IN_PROGRESS blockers
- [ ] Check if any have exceeded resolve-by date
- [ ] Escalate overdue blockers to management
- [ ] Update dashboard with current status
- [ ] Identify patterns (recurring blockers?)
- [ ] Report metrics to team

---

## Escalation Matrix

| Situation | Severity | Escalation Path | Timeframe |
|-----------|----------|-----------------|-----------|
| Production outage | 🔴 Critical | Notify all stakeholders, on-call engineer | Immediate |
| Security vulnerability | 🔴 Critical | Security team, Tech Lead, Product Owner | < 1 hour |
| Feature deadline at risk | 🟠 High | Project Manager, Tech Lead | < 24 hours |
| Multiple developers blocked | 🟠 High | Team Lead, Scrum Master | < 24 hours |
| Integration failure | 🟠 High | Tech Lead, DevOps | < 24 hours |
| Single developer blocked | 🟡 Medium | Team Lead | < 48 hours |
| Minor environment issue | 🟡 Medium | DevOps | < 3 days |
| Documentation gap | 🟢 Low | Tech Writer, Developer | Next sprint |

---

## Best Practices

1. **Be specific**: Clearly describe what's blocked and why
2. **Assign ownership**: Every blocker needs an owner
3. **Set realistic dates**: Negotiate resolve-by dates with owners
4. **Communicate early**: Report blockers as soon as identified
5. **Track everything**: Even small blockers should be tracked
6. **Review regularly**: Daily standups should include blocker review
7. **Document resolutions**: Learn from past blockers to prevent repeats
8. **Use templates**: Stick to the format for consistency

---

## Templates for Common Scenarios

### Template: Technical Blocker
```
🔴 BLOCKER: [PROJECT]-TECH-N — [Specific technical issue]
  Category: Tech
  Severity: 🟠 High
  Impact: Blocks [feature/task] development
  Owner: @developer or Tech Lead
  Status: 🔴 OPEN
  Resolve by: [Date]
  Notes: 
    - Issue: [Detailed description]
    - Error: [Error message or logs]
    - Reproduction: [Steps to reproduce]
    - Workaround: [If any]
  Related: [Links to code, issues, or docs]
```

### Template: External Dependency Blocker
```
🟡 BLOCKER: [PROJECT]-EXT-N — [Third-party service issue]
  Category: External
  Severity: 🟡 Medium
  Impact: Blocks [feature] which depends on [service]
  Owner: [Vendor contact or team]
  Status: 🔴 OPEN
  Resolve by: [Negotiated date]
  Notes:
    - Service: [Name and version]
    - Issue: [Description of external issue]
    - Contact: [Vendor contact info]
    - Ticket: [Vendor ticket number]
    - Workaround: [Temporary solution if any]
  Related: [API docs, contract, or agreement]
```

### Template: Clarification Needed Blocker
```
🟡 BLOCKER: [PROJECT]-CLAR-N — [Unclear requirement or specification]
  Category: Product
  Severity: 🟠 High
  Impact: Cannot proceed with [feature/task] without clarification
  Owner: @product-owner
  Status: 🔴 OPEN
  Resolve by: [Date]
  Notes:
    - Question: [Specific question that needs answering]
    - Options considered: [List possible approaches]
    - Recommended: [Preferred approach if any]
    - Impact of delay: [What happens if not resolved soon]
  Related: [Story, epic, or requirement document]
```

---

## Integration with Project Management

### Jira/Linear/Trello Integration
- Create a Blocker issue type
- Use labels: `blocker`, `critical`, `high`, `medium`, `low`
- Add custom fields: Category, Resolve-by, Impact
- Link blockers to blocked tasks

### GitHub/GitLab Integration
- Use project boards with Blocker column
- Label issues as `blocker` with severity emoji
- Create a blocker tracking issue that lists all current blockers
- Use GitHub Issues templates for consistent blocker reporting

### Standup Integration
- Always include: "What blockers do I have?"
- Track: Blocker ID, Severity, Owner, ETA
- Escalate: Any blocker not resolved within SLA

---

**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Applies to**: All projects
