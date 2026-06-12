# Skill: Git Safety

**Used by**: Developer, DevOps, Planner, All agents  
**Purpose**: Prevent accidental commits to main, ensure clean git workflow  
**File**: SKILL-LIBRARY/3-git-safety.skill.md

---

## Overview

This skill ensures:
- ✅ Never commit directly to `main`
- ✅ All changes through feature branches
- ✅ PR required before merging
- ✅ Clear commit messages
- ✅ No accidental pushes to wrong branch

---

## Setup (One-Time, Per Developer)

### 1. Trust Your Repository

```bash
git config --global safe.directory /absolute/path/to/sitephoto
```

### 2. Protect Main Branch (Local Hook)

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  echo "❌ ERROR: Cannot commit directly to main!"
  echo "✅ Use feature branches instead:"
  echo "  git checkout -b feature/CODE-description"
  exit 1
fi
exit 0
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

### 3. Protect Main on GitHub

Settings → Branches → Add rule for `main`:
- ✅ Require pull request reviews
- ✅ Require status checks to pass
- ✅ Require branches up to date

---

## Git Workflow (Safe)

### Create Feature

```bash
git checkout main
git pull origin main
git checkout -b feature/US-A5-photo-upload
# ... make changes ...
git add .
git commit -m "feat: add upload button"
git push origin feature/US-A5-photo-upload
# Create PR on GitHub
```

### Branch Naming

```
feature/CODE-description   (new feature)
bugfix/short-description   (bug fix)
hotfix/urgent-fix          (emergency)
docs/what-changed          (docs only)
refactor/what-improved     (refactor)
```

### Commit Messages

```
feat: add photo upload button
fix: correct timezone conversion
docs: update API documentation
refactor: simplify blocker tracking
test: add edge case tests
```

### Safety Checklist

```
Before committing:
- [ ] On feature branch (not main)?
- [ ] Changes intentional?
- [ ] Commit message clear?

Before pushing:
- [ ] Pushing to feature branch (not main)?
- [ ] PR required before merging?
```

---

## Common Mistakes & Fixes

### Committed to main by accident

```bash
# Create feature branch (saves your work)
git branch feature/my-feature

# Reset main
git checkout main
git reset --hard origin/main

# Switch to feature
git checkout feature/my-feature
git push origin feature/my-feature
```

### Pushed to main by accident

```bash
# IMMEDIATE: Tell team, revert ASAP
git revert HEAD
git push origin main

# Extract changes to feature branch
git checkout -b feature/recover
git cherry-pick [commit-sha]
git push origin feature/recover
```

---

## Commands Reference

```bash
git branch                           # List branches
git checkout -b feature/NAME         # Create feature
git diff                            # See changes
git add .                           # Stage all
git commit -m "type: message"       # Commit
git push origin feature/NAME        # Push feature
git checkout main                   # Switch to main
git pull origin main                # Get latest
```

---

## Result

✅ **Local Protection**: Can't commit to main  
✅ **Remote Protection**: Can't push to main directly  
✅ **Workflow**: Feature → PR → Review → Merge  
✅ **Safety**: Multiple layers of protection

Professional, safe git workflow! 🎉

