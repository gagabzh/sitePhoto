# DEBUGGING BRANCH: No Shelving for Instance-2

## Created
Branch `debugging-no-shelving` was created from `fixing-worker` on 2026-06-08.

## Changes Made
All shelving functionality for Instance-2 has been **DEACTIVATED**:

### 1. Runtime Shelving (src/instance-lifecycle.js)
- Modified `shelveInstance()` function to be a no-op
- The function now logs a message and returns immediately instead of making OVH API calls
- This prevents automatic shelving after `INSTANCE2_IDLE_MINUTES` of inactivity

### 2. Deploy-Time Shelving (.github/workflows/deploy-worker.yml)
- Changed the "Shelve Instance-2 after deploy" step condition from `if: always()` to `if: false`
- This prevents the workflow from shelving Instance-2 after deployment

## IMPORTANT REMINDER

**⚠️ BEFORE MERGING THIS BRANCH TO MAIN, YOU MUST REACTIVATE SHELVING!**

### To Reactivate Shelving:

#### Option 1: Revert the changes
```bash
git revert d5f6c79
```

#### Option 2: Manually undo the changes
1. In `src/instance-lifecycle.js`: Restore the `shelveInstance()` function to its original state
2. In `.github/workflows/deploy-worker.yml`: Change `if: false` back to `if: always()`

#### Option 3: Merge with conflicts and resolve
When merging to main, ensure the shelving code is reinstated.

## Why This Was Done
This branch was created for debugging purposes to keep Instance-2 active at all times, avoiding the overhead of unshelving during development and testing.

## Cost Warning
Keeping Instance-2 unshelved 24/7 will incur full compute costs. Remember to reactivate shelving before merging to production!
