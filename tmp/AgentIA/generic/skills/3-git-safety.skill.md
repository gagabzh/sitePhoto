# Skill: Git Safety

**Used by**: Developer, DevOps, Planner, Tech Lead, All agents  
**Purpose**: Prevent accidental commits to main/trunk, ensure clean git workflow, maintain repository integrity  
**File**: generic/skills/3-git-safety.skill.md

---

## Overview

This skill ensures:
- ✅ Never commit directly to protected branches (main, master, develop, production)
- ✅ All changes flow through feature branches
- ✅ PR/MR required before merging to protected branches
- ✅ Clear, descriptive commit messages
- ✅ No accidental pushes to wrong branches
- ✅ Works with any Git workflow (GitHub Flow, Git Flow, Trunk-Based Development)
- ✅ Compatible with any Git hosting service (GitHub, GitLab, Bitbucket, etc.)

---

## Git Workflow Fundamentals

### Protected Branches

These branches should NEVER receive direct commits:
- `main` / `master` - Production-ready code
- `develop` / `dev` - Integration branch (if used)
- `production` / `prod` - Live production code
- `release/*` - Release branches
- `hotfix/*` - Emergency fixes (use dedicated workflow)

**Rule**: If a branch deploys to an environment, it should be protected.

### Branch Protection Levels

| Level | Branch | Can Commit Directly | Can Push Directly | Requires PR | Requires Review | Requires CI Pass |
|-------|--------|---------------------|-------------------|-------------|------------------|------------------|
| High | main, production | ❌ NO | ❌ NO | ✅ YES | ✅ YES (2+) | ✅ YES |
| Medium | develop, staging | ❌ NO | ❌ NO | ✅ YES | ✅ YES (1+) | ✅ YES |
| Low | feature/* | ✅ YES | ✅ YES | ❌ NO | ❌ NO | ❌ NO |

---

## Setup: Protecting Your Repository

### Step 1: Local Git Configuration (Per Developer)

**Prevent accidental commits to main:**

Create `.git/hooks/pre-commit` (or use a client-side hook):

```bash
#!/bin/sh
# Pre-commit hook to prevent direct commits to protected branches

PROTECTED_BRANCHES="main|master|develop|dev|production|prod"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if echo "$BRANCH" | grep -qE "^($PROTECTED_BRANCHES)$"; then
  echo ""
  echo "❌ ERROR: Cannot commit directly to '$BRANCH'!"
  echo ""
  echo "✅ Use a feature branch instead:"
  echo "  git checkout -b feature/[your-feature-name]"
  echo "  git add ."
  echo "  git commit -m 'feat: your commit message'"
  echo "  git push origin feature/[your-feature-name]"
  echo ""
  echo "Then create a Pull Request/Merge Request."
  echo ""
  exit 1
fi

exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

**Prevent accidental pushes to main:**

Create `.git/hooks/pre-push`:

```bash
#!/bin/sh
# Pre-push hook to prevent direct pushes to protected branches

PROTECTED_BRANCHES="main|master|develop|dev|production|prod"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if echo "$BRANCH" | grep -qE "^($PROTECTED_BRANCHES)$"; then
  echo ""
  echo "❌ ERROR: Cannot push directly to '$BRANCH'!"
  echo ""
  echo "✅ Use a feature branch instead:"
  echo "  git checkout -b feature/[your-feature-name]"
  echo "  git push origin feature/[your-feature-name]"
  echo ""
  echo "Then create a Pull Request/Merge Request."
  echo ""
  exit 1
fi

exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-push
```

### Step 2: Server-Side Protection (GitHub/GitLab/Bitbucket)

#### GitHub Branch Protection Rules

1. Go to: Repository → Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`, `master`, `production`
3. Enable:
   - [x] Require pull request reviews before merging
   - [x] Require status checks to pass before merging
   - [x] Require branches to be up to date before merging
   - [x] Require linear history
   - [x] Require signed commits (optional, for security)
   - [x] Include administrators (optional, for strict enforcement)
   - [x] Restrict who can push to matching branches

#### GitLab Protected Branches

1. Go to: Repository → Settings → Repository → Protected Branches
2. Select branch: main, master, production
3. Allowed to merge: Maintainers/Developers
4. Allowed to push: No one (or Maintainers only)
5. Enable: Merge requests must be approved

#### Bitbucket Branch Restrictions

1. Go to: Repository → Settings → Branch permissions
2. Add restriction for main/master
3. Restrict writes to specific users/groups
4. Enable: Require pull requests to merge
5. Enable: Require approvals

---

## Standard Git Workflows

### Workflow 1: GitHub Flow (Recommended for Most Teams)

```
main (protected)
  │
  └─► feature/[name] (create from main)
        │
        ├─► commit changes
        ├─► push to origin
        └─► Create Pull Request
              │
              ├─► Code review
              ├─► CI passes
              ├─► Approvals (minimum 1-2)
              └─► Merge to main
                    │
                    └─► Delete feature branch
```

**Commands:**
```bash
# Start new feature
git checkout main
git pull origin main
git checkout -b feature/US-123-feature-name

# Make changes, commit
git add .
git commit -m "feat: implement feature"

# Push and create PR
git push origin feature/US-123-feature-name
# Then create PR on GitHub/GitLab

# After PR merged
git checkout main
git pull origin main
git branch -d feature/US-123-feature-name
git push origin --delete feature/US-123-feature-name
```

### Workflow 2: Git Flow (For Release-Focused Teams)

```
main (protected, production)
  │
  └─► develop (protected, integration)
        │
        ├─► feature/[name] (from develop)
        │       │
        │       └─► PR to develop
        │
        ├─► release/[version] (from develop)
        │       │
        │       └─► PR to main (production)
        │
        └─► hotfix/[description] (from main)
                │
                └─► PR to main AND develop
```

**Commands:**
```bash
# Start feature
git checkout develop
git pull origin develop
git checkout -b feature/US-123-feature-name

# After feature complete
git checkout develop
git pull origin develop
git merge --no-ff feature/US-123-feature-name
git push origin develop

# Create release
git checkout -b release/v1.0.0 develop
# Test, fix bugs, update version
# Merge to main
git checkout main
git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main --tags
git checkout develop
git merge --no-ff release/v1.0.0
git push origin develop
```

### Workflow 3: Trunk-Based Development (For CI/CD Teams)

```
main (protected)
  │
  ├─► feature/[name]-short-lived (hours/days)
  │
  ├─► release/[version] (optional)
  │
  └─► hotfix/[description] (rare)
```

**Rules:**
- Feature branches are very short-lived (hours to days)
- Small, frequent commits to main
- Feature flags for incomplete features
- All commits build successfully

---

## Branch Naming Conventions

### Standard Naming Patterns

| Type | Pattern | Example | When to Use |
|------|---------|---------|-------------|
| Feature | `feature/[code]-description` | `feature/US-123-user-auth` | New features |
| Bug Fix | `bugfix/[code]-description` | `bugfix/BG-456-login-error` | Bug fixes |
| Hot Fix | `hotfix/[description]` | `hotfix/security-vulnerability` | Emergency production fixes |
| Release | `release/[version]` | `release/v2.1.0` | Preparing a release |
| Documentation | `docs/[description]` | `docs/api-update` | Documentation only |
| Refactor | `refactor/[description]` | `refactor/auth-middlewares` | Code refactoring |
| Test | `test/[description]` | `test/load-testing` | Testing only |
| Chore | `chore/[description]` | `chore/dependency-update` | Maintenance tasks |

### Project-Specific Patterns

Customize based on your ticketing system:

```
# Jira: PROJECT-KEY-number
git checkout -b feature/PROJ-123-user-registration

# GitHub Issues: #number
git checkout -b feature/#456-user-registration

# Linear: TEAM-number
git checkout -b feature/ENG-123-user-registration

# Short descriptive (no ticket system)
git checkout -b feature/user-registration
```

---

## Commit Message Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): add login endpoint` |
| `fix` | Bug fix | `fix(api): handle null values` |
| `docs` | Documentation | `docs(readme): update installation` |
| `style` | Code style (formatting) | `style: fix indentation` |
| `refactor` | Code refactoring | `refactor(user): extract service` |
| `perf` | Performance improvement | `perf(query): optimize user lookup` |
| `test` | Adding tests | `test(auth): add login tests` |
| `chore` | Maintenance | `chore: update dependencies` |
| `revert` | Revert commit | `revert: Revert "feat: add feature"` |
| `WIP` | Work in progress | `WIP: implementing user auth` |
| `security` | Security fix | `security: fix SQL injection` |

### Scope
- Optional, specifies the part of code affected
- Can be a module, component, or file
- Examples: `(auth)`, `(api)`, `(frontend)`, `(database)`

### Subject
- Use imperative mood ("Add feature" not "Added feature")
- Capitalize first letter
- No period at the end
- 50 characters or less (for readability in git log)

### Body
- Explain what was changed and why
- Reference ticket numbers or acceptance criteria
- 72 characters per line (wrapped)

### Footer
- Reference related issues (Closes #123)
- Breaking changes (BREAKING CHANGE: description)
- Co-authored-by for multiple authors

### Examples

```bash
# Good commit messages
feat(auth): add login endpoint

Implements US-123: Users can log in with email/password
- POST /api/auth/login route
- JWT token generation
- Password hashing with bcrypt

Closes #123

fix(api): handle null values in user profile

Prevents 500 error when user has no profile
- Add null checks in UserService.getProfile()
- Return default values for missing fields

fixes #456

refactor(user): extract UserService class

Improves separation of concerns
- Move user logic from routes to service
- Add unit tests for UserService
- Update all route files to use service

BREAKING CHANGE: User routes now use UserService methods
```

```bash
# Bad commit messages (avoid)
fixed bug
added feature
WIP: stuff
changes
update
```

---

## Safety Checklists

### Before Committing

- [ ] On a feature branch (not main/master/develop)?
- [ ] Changes are intentional (no accidental changes)?
- [ ] Commit message follows guidelines?
- [ ] All tests pass locally?
- [ ] Linter passes?
- [ ] No sensitive data (secrets, passwords) in commit?
- [ ] No merge conflicts?

### Before Pushing

- [ ] Pushing to feature branch (not main/master)?
- [ ] All commits follow message guidelines?
- [ ] PR/MR will be created (not merging directly)?
- [ ] Code builds successfully?
- [ ] CI will pass? (or skip CI if configured)

### Before Merging a PR

- [ ] PR title is descriptive?
- [ ] PR description explains changes?
- [ ] All CI checks pass?
- [ ] Required approvals obtained?
- [ ] All review comments addressed?
- [ ] No merge conflicts?
- [ ] Branch can be safely deleted?

---

## Common Mistakes & Fixes

### Mistake 1: Committed to main by accident

**Prevention**: Use pre-commit hooks (setup above)

**Fix**:
```bash
# If you committed to main but haven't pushed:

# Create feature branch (saves your work)
git branch feature/my-feature

# Reset main to origin
git checkout main
git reset --hard origin/main

# Switch to feature branch
git checkout feature/my-feature

# Continue working
git add .
git commit -m "feat: my feature"
git push origin feature/my-feature
```

### Mistake 2: Pushed to main by accident

**Prevention**: Use pre-push hooks (setup above)

**Fix**:
```bash
# IMMEDIATE ACTIONS:
# 1. Tell your team immediately
# 2. Revert the commit on main

# Revert the bad commit
git checkout main
git revert HEAD
git push origin main

# Extract your changes to a feature branch
git checkout -b feature/recover-bad-commit
git cherry-pick [commit-sha-of-bad-commit]
git push origin feature/recover-bad-commit

# Now create a PR from feature/recover-bad-commit to main
```

### Mistake 3: Force pushed and broke history

**Prevention**: Never force push to shared branches

**Fix**:
```bash
# If you force pushed to a feature branch:
# 1. Tell your team immediately
# 2. Revert to the last good state

git reflog
# Find the commit before your force push
git reset --hard [good-commit-sha]
git push origin feature/[branch-name] --force

# If you force pushed to main:
# DO NOT TRY TO FIX YOURSELF - get help from team lead
```

### Mistake 4: Sensitive data in git history

**Prevention**: Use .gitignore, pre-commit hooks to scan for secrets

**Fix**:
```bash
# Use git-filter-repo to remove sensitive data from history
# Install git-filter-repo:
pip install git-filter-repo

# Remove a file from history
git filter-repo --path path/to/secrets.txt --invert-paths

# Remove a string from history
git filter-repo --replace-text <(echo "my-secret-key==>")

# Force push (only if you're sure)
git push origin --force --all
git push origin --force --tags

# Tell all team members to reclone the repository
```

---

## Git Commands Reference

### Basic Commands

```bash
# Clone repository
git clone <repository-url>

# Check current branch
git branch

# Check current status
git status

# View commit history
git log --oneline --graph

# View changes
git diff
git diff --cached

# Stage changes
git add <file>
git add .

# Commit changes
git commit -m "message"
git commit -am "message"  # Add and commit tracked files

# Push changes
git push origin <branch>

# Pull changes
git pull origin <branch>

# Switch branches
git checkout <branch>
git switch <branch>

# Create new branch
git checkout -b <new-branch>
git switch -c <new-branch>
```

### Branch Management

```bash
# List all branches
git branch -a

# Delete local branch
git branch -d <branch>

# Delete remote branch
git push origin --delete <branch>

# Rename branch
git branch -m <old-name> <new-name>
git push origin --delete <old-name>
git push origin -u <new-name>

# Merge branches
git merge <branch>
git merge --no-ff <branch>  # No fast-forward (keeps history)
```

### Advanced Commands

```bash
# Rebase branch (rewrite history)
git rebase <branch>
git rebase -i HEAD~5  # Interactive rebase last 5 commits

# Cherry pick commit
git cherry-pick <commit-sha>

# Reset (careful!)
git reset --soft HEAD~1  # Undo last commit, keep changes staged
git reset --hard HEAD~1  # Undo last commit, discard changes

# Stash changes
git stash
git stash pop

# View remote branches
git remote show origin

# Prune deleted branches
git fetch --prune
```

---

## Git Configuration Tips

### Global Configuration

```bash
# Set your identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Enable color
git config --global color.ui true

# Set default branch name (for new repos)
git config --global init.defaultBranch main

# Set default editor
git config --global core.editor "code --wait"  # VS Code
git config --global core.editor "nano"

# Auto-crlf for Windows (if needed)
git config --global core.autocrlf true
```

### Repository Configuration

```bash
# Set safe directory (if you see safe.directory warning)
git config --global safe.directory "*"

# Or for specific directory
git config --global safe.directory /path/to/your/repo

# Enable pre-commit hooks
git config --local hooks.pre-commit.enabled true

# Set upstream branch
git branch --set-upstream-to=origin/<branch> <branch>
```

---

## Best Practices

### Do's

✅ **Do** use feature branches for all changes  
✅ **Do** create descriptive branch names  
✅ **Do** write clear, atomic commit messages  
✅ **Do** pull latest changes before starting work  
✅ **Do** protect main/master branches  
✅ **Do** use pull requests for code review  
✅ **Do** delete feature branches after merging  
✅ **Do** use .gitignore to exclude files  
✅ **Do** scan for secrets before committing  
✅ **Do** backup your work with frequent commits  

### Don'ts

❌ **Don't** commit directly to main/master  
❌ **Don't** push to main/master directly  
❌ **Don't** use force push on shared branches  
❌ **Don't** commit sensitive data (secrets, passwords)  
❌ **Don't** make huge commits (keep them atomic)  
❌ **Don't** merge broken code  
❌ **Don't** ignore .gitignore  
❌ **Don't** commit generated files (node_modules, build/, etc.)  
❌ **Don't** commit IDE-specific files  
❌ **Don't** work on outdated branches  

---

## Integration with CI/CD

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop, feature/** ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run lint
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test
  - deploy

test:
  stage: test
  image: node:20
  script:
    - npm install
    - npm test
    - npm run lint
  only:
    - main
    - develop
    - merge_requests
```

### Branch Protection in CI

```yaml
# Only run deployment jobs from main branch
ploy:
  stage: deploy
  script:
    - npm run deploy
  only:
    - main
```

---

## Troubleshooting

**Problem**: "Updates were rejected because the tip of your current branch is behind"  
**Solution**: Pull latest changes and rebase or merge
```bash
git pull --rebase origin main
# Or
git pull origin main
git merge main
```

**Problem**: "Please make sure you have the correct access rights"  
**Solution**: You don't have permission to push to this branch. Use a feature branch.

**Problem**: Pre-commit hook failing  
**Solution**: Fix the issue or temporarily bypass (not recommended):
```bash
git commit --no-verify -m "message"
```

**Problem**: Merge conflicts  
**Solution**: Resolve conflicts manually, then commit:
```bash
git status  # See which files have conflicts
git add <resolved-file>
git commit -m "Resolve merge conflicts"
```

---

**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Applies to**: All projects using Git
