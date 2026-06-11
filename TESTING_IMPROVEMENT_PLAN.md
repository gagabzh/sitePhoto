# Test Improvement Plan

## Problem Statement
GitHub workflows regularly fail due to test failures, even though tests pass locally.

## Root Causes Identified

### 1. Node Version Mismatch
- **Local**: Node v18.19.1
- **GitHub Actions**: Node v20 (specified in `.github/workflows/deploy-site.yml` line 38)
- **Impact**: Dependencies may behave differently between Node versions

### 2. Missing Test Timeout Configuration
- No global jest timeout set
- Some async operations may take longer in CI environment
- Network calls, file I/O can be slower on GitHub Actions

### 3. No Test Retry Mechanism
- Flaky tests (network, timing, race conditions) fail intermittently
- No retry configuration in jest

### 4. Environment Variable Dependencies
- Tests may rely on environment variables not set in CI
- No validation that required env vars are present

### 5. Coverage Thresholds Too Strict
- Current thresholds: statements 90%, branches 75%, functions 65%, lines 90%
- Some files have lower coverage (e.g., `storage.js` at 54.9%)
- But overall coverage is 93.56% so this might not be the issue

### 6. Potential Resource Leaks
- Database connections not properly closed
- File handles not released
- Event listeners not removed

### 7. Test Ordering Issues
- Tests may depend on global state
- No explicit test isolation in some cases

---

## Improvement Actions

### Phase 1: Immediate Fixes (High Priority)

#### 1.1 Align Node Version
- **Action**: Update local development to use Node 20, or update workflow to use Node 18
- **Rationale**: Ensure consistent behavior between local and CI
- **File**: `.github/workflows/deploy-site.yml`, `.github/workflows/deploy-worker.yml`

#### 1.2 Add Test Timeout Configuration
- **Action**: Set global jest timeout to 10 seconds (default is 5s)
- **Rationale**: CI environments can be slower
- **File**: `package.json` (jest config)

#### 1.3 Add Test Timeout for CI
- **Action**: Increase global jest timeout to 10 seconds
- **Rationale**: CI environments can be slower
- **File**: `package.json` (jest config)

#### 1.4 Add Environment Variable Validation
- **Action**: Create test setup file that validates required env vars
- **Rationale**: Fail fast with clear error if env vars missing
- **File**: `src/__tests__/setup.js`

#### 1.5 Fix Resource Leaks
- **Action**: Ensure all tests properly clean up resources
- **Rationale**: Prevent memory leaks and test pollution
- **Files**: All test files with async operations

### Phase 2: Medium Priority

#### 2.1 Add Test Categories/Tags
- **Action**: Categorize tests (unit, integration, e2e, slow)
- **Rationale**: Run different test suites in different workflows
- **Files**: All test files

#### 2.2 Add Test Performance Monitoring
- **Action**: Track slow tests and optimize them
- **Rationale**: Identify and fix slow tests
- **File**: `package.json` (jest config with --detectOpenHandles)

#### 2.3 Improve Test Error Messages
- **Action**: Add more context to test assertions
- **Rationale**: Make failures easier to debug
- **Files**: All test files

#### 2.4 Add Test Coverage for Error Paths
- **Action**: Add tests for error handling and edge cases
- **Rationale**: Improve coverage and catch bugs
- **Files**: All route test files

### Phase 3: Long-term Improvements

#### 3.1 Add Integration Test Suite
- **Action**: Create separate integration tests
- **Rationale**: Better separation of concerns
- **Files**: New test files

#### 3.2 Add Test Documentation
- **Action**: Document test structure and conventions
- **Rationale**: Onboard new developers faster
- **File**: `docs/testing.md`

#### 3.3 Add Test Parallelization
- **Action**: Configure jest to run tests in parallel
- **Rationale**: Faster CI runs
- **File**: `package.json` (jest config)

---

## Implementation Details

### 1. Jest Configuration Updates

Add to `package.json`:
```json
{
  "jest": {
    "testTimeout": 10000,
    "maxConcurrency": 2,
    "detectOpenHandles": true,
    "retryTimes": 1,
    "retryAfter": 100
  }
}
```

### 2. Test Setup File

Create `src/__tests__/setup.js`:
```javascript
// Validate required environment variables
const requiredVars = ['SESSION_SECRET', 'DATABASE_URL'];

beforeAll(() => {
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      console.warn(`WARNING: ${varName} env var is not set — using insecure default.`);
    }
  });
});

// Global test timeout
jest.setTimeout(10000);

// Mock console.error to fail tests on unexpected errors
const originalError = console.error;
console.error = (...args) => {
  originalError(...args);
  // Don't fail on expected warnings
  if (!args[0]?.includes('WARNING:') && !args[0]?.includes('sharp failed:')) {
    // This will appear in test output but not fail the test
  }
};

// Ensure clean exit
afterAll(async () => {
  // Close any open connections
});
```

### 3. Workflow Updates

Update `.github/workflows/deploy-site.yml`:
```yaml
- name: Test
  run: npm run test:coverage
  env:
    NODE_ENV: test
    # Add any required env vars here
```

### 4. Test File Improvements

For each test file, add:
- Proper beforeEach/afterEach cleanup
- Clear test descriptions
- Test isolation (mock external dependencies)
- Error handling in tests

---

## QA Testing Checklist

### Before Merging PR

- [ ] All tests pass locally (`npm test`)
- [ ] Coverage thresholds met (`npm run test:coverage`)
- [ ] Lint passes (`npm run lint`)
- [ ] No skipped tests without justification
- [ ] Test descriptions are clear and specific
- [ ] Tests are isolated (no shared state)
- [ ] Mocks are properly reset between tests
- [ ] Error cases are tested
- [ ] Edge cases are tested
- [ ] Performance: no single test takes > 5 seconds

### Before Deploying to Production

- [ ] Tests pass in CI workflow
- [ ] Coverage report uploaded and reviewed
- [ ] No new warnings in test output
- [ ] Regression tests pass (existing features still work)

### When Tests Fail in CI

1. **Check the failure**: Is it consistent or intermittent?
2. **Reproduce locally**: Can you reproduce the failure?
3. **Check environment**: Node version, OS, env vars
4. **Check timing**: Does increasing timeout help?
5. **Check dependencies**: Are all npm packages installed?
6. **Check logs**: Are there any warnings or errors before the failure?

### Common Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Test times out | Slow operation | Increase timeout, optimize test |
| Test passes locally, fails in CI | Environment difference | Check Node version, env vars |
| Test fails intermittently | Race condition | Add retries, fix test order |
| Memory error | Memory leak | Check for open handles, add cleanup |
| Flaky network test | External dependency | Mock properly, add retries |

---

## Success Metrics

- [ ] 95% of workflow runs pass on first try
- [ ] All tests pass in < 2 minutes
- [ ] No flaky tests (same test fails < 1% of runs)
- [ ] 100% of PRs include test updates for new features
- [ ] Code coverage maintains or improves

---

## References

- [Jest Configuration](https://jestjs.io/docs/configuration)
- [GitHub Actions for Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
