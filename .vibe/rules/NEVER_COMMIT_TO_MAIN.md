# HARD RULE: NEVER COMMIT DIRECTLY TO MAIN

**THIS IS A NON-NEGOTIABLE, ABSOLUTE RULE**

## The Rule
NEVER, EVER, UNDER ANY CIRCUMSTANCES commit directly to the `main` branch.

This applies to ALL agents, ALL contexts, ALL situations.

## Why
- The main branch is protected on GitHub
- All changes must go through PR review
- Direct commits to main bypass QA and peer review
- This ensures code quality and prevents breaking production
- YOU WERE EXPLICITLY TOLD THIS MULTIPLE TIMES

## What Must Happen Instead
1. **ALWAYS** create a feature branch first: `git checkout -b feat/<name>` or `fix/<name>` or `docs/<name>`
2. Make all changes on that branch
3. Commit on that branch
4. Push the feature branch: `git push origin feat/<name>`
5. Create a PR from the feature branch to main
6. Wait for review and approval

## Git Hook
A pre-commit hook script is provided in `scripts/git-hooks/pre-commit` that will:
- Detect if you're on the main branch
- BLOCK the commit with an error message
- Show the correct workflow

**To install the hook for this repository, run:**
```bash
ln -sf ../../scripts/git-hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## If You Ever Think About Committing to Main
STOP IMMEDIATELY. DO NOT DO IT. Create a branch first.

## No Exceptions - EVER
- Not for "small fixes"
- Not for "emergencies"
- Not for "just this once"
- Not because "it's faster"
- Not because "I'll create a PR after"
- Not for ANY reason whatsoever

## Consequences
- Code will be rejected
- Will need to revert and redo work
- Loses trust
- May cause production issues
- YOU HAVE BEEN WARNED

## Remember
You were explicitly told in the project instructions:
> "Never commit or push directly to main. Always: 1. git checkout -b feat/<name>"

This is repeated in the Git workflow section:
> "Never commit or push directly to main."

**THIS RULE IS ABSOLUTE, NON-NEGOTIABLE, AND MUST NEVER BE VIOLATED.**

## For All Agents
This rule applies to:
- website-dev agent
- Planner agent
- QA agent
- All other agents
- All subagents
- All contexts
- All future interactions

IF YOU ARE READING THIS, YOU MUST OBEY THIS RULE.
