# Commit Rules for sitephoto

## HARD RULE: NEVER COMMIT DIRECTLY TO MAIN

**THIS IS A NON-NEGOTIABLE, ABSOLUTE RULE**

### The Rule
NEVER, EVER, UNDER ANY CIRCUMSTANCES commit directly to the `main` branch.

### Why
- The main branch is protected on GitHub
- All changes must go through PR review
- Direct commits to main bypass QA and peer review
- This ensures code quality and prevents breaking production

### Correct Workflow
1. **ALWAYS** create a feature branch first:
   ```bash
   git checkout -b feat/<name>
   # or for fixes:
   git checkout -b fix/<name>
   # or for docs:
   git checkout -b docs/<name>
   ```
2. Make all changes on that branch
3. Commit on that branch
4. Push the feature branch:
   ```bash
   git push origin feat/<name>
   ```
5. Create a PR from the feature branch to main:
   ```bash
   gh pr create --base main --head feat/<name>
   ```
6. Wait for review and approval

### Git Hook
A pre-commit hook has been installed in `.git/hooks/pre-commit` that will **BLOCK** any attempt to commit directly to main with an error message.

### No Exceptions
- Not for "small fixes"
- Not for "emergencies"
- Not for "just this once"
- Not for any reason whatsoever

### If You Violate This Rule
1. Immediately revert the commit from main
2. Reapply changes to a feature branch
3. Create a PR properly
4. This is unacceptable

### Remember
You were explicitly told in the project instructions:
> "Never commit or push directly to main. Always: 1. git checkout -b feat/<name>"

**THIS RULE IS ABSOLUTE AND NON-NEGOTIABLE.**
