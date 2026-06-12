# Skill: Blocker Tracking

**Used by**: Planner, Product Owner  
**Purpose**: Track and escalate blockers systematically  
**File**: SKILL-LIBRARY/1-blocker-tracking.skill.md

---

## Overview

This skill ensures:
- ✅ Blockers identified early
- ✅ Lifecycle tracked (OPEN → RESOLVED → CLOSED)
- ✅ Clear escalation paths
- ✅ No surprises late in sprint

---

## Blocker Format

Use this exact format for EVERY blocker:

```
🔴 BLOCKER: [CODE-N] — [Title]
  Category: Tech | Product | QA | External
  Severity: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
  Impact: [What is blocked by this?]
  Owner: [Who is responsible for resolving?]
  Status: 🔴 OPEN → 🟡 IN_PROGRESS → 🟢 RESOLVED → ✅ CLOSED
  Resolve by: [Date or milestone]
  Notes: [Any context]
```

---

## Blocker Lifecycle

### 1. OPEN
- Identified, needs triage
- Assign owner
- Clarify impact
- Set resolve-by date

### 2. IN_PROGRESS
- Someone is working on it
- Update daily
- Add notes on progress
- Escalate if stuck

### 3. RESOLVED
- Fixed, needs verification
- Test the fix
- Verify it actually resolves blocker
- Get sign-off from owner

### 4. CLOSED
- Can proceed
- Tasks that were blocked can start
- Document resolution

---

## Escalation Rules

**Tech Blocker** (infrastructure, code, DB):
- Assign to: Tech Lead or DevOps
- Timeline: ASAP (can block entire sprint)

**Product Blocker** (feature dependency, priority conflict):
- Assign to: PO
- Timeline: Before development starts

**QA Blocker** (test environment, test data):
- Assign to: QA Agent
- Timeline: Before QA testing

**External Blocker** (Nextcloud, S3, third-party):
- Assign to: Relevant team
- Timeline: Depends on external service

---

## Dashboard

Maintain blocker dashboard:

```
📊 BLOCKER DASHBOARD

🔴 CRITICAL (Must fix now):
  [List any]

🟠 HIGH (Fix this sprint):
  [List all]

🟡 MEDIUM (Fix soon):
  [List all]

🟢 LOW (Nice to fix):
  [List all]

✅ RESOLVED (Needs verification):
  [List all]

📋 CLOSED (Done):
  [Archived, reference only]
```

---

## Usage

**When planning a task:**
- [ ] Check blocker dashboard
- [ ] Are there blockers affecting this task?
- [ ] Have all blockers reached RESOLVED?
- [ ] If not, task cannot start

**When a blocker is reported:**
- [ ] Create blocker using format above
- [ ] Assign to responsible person
- [ ] Set resolve-by date
- [ ] Update status daily

**When a blocker is resolved:**
- [ ] Mark as RESOLVED
- [ ] Verify it actually works
- [ ] Mark as CLOSED
- [ ] Unblock dependent tasks

