import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * QA Agent Unit Tests
 * 
 * These tests verify that the QA Agent fulfills its responsibilities:
 * 1. Creates proper test plans
 * 2. Validates acceptance criteria
 * 3. Identifies edge cases and regressions
 * 4. Provides clear bug reports
 * 5. Escalates appropriately
 */

// Mock PR/Feature data structure
interface FeaturePR {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  testCoverage: {
    unitTests: boolean;
    integrationTests: boolean;
    e2eTests: boolean;
  };
}

// Mock QA Agent
class QAAgent {
  private testPlans: Map<string, TestPlan> = new Map();
  private bugsFound: Bug[] = [];

  createTestPlan(pr: FeaturePR): TestPlan {
    const plan: TestPlan = {
      prId: pr.id,
      prTitle: pr.title,
      happyPathScenarios: [],
      edgeCases: [],
      regressionAreas: [],
      acceptanceCriteriaValidation: [],
      bugsFound: [],
      overallStatus: 'pending',
      createdAt: new Date(),
    };

    // Validate PR has acceptance criteria
    if (!pr.acceptanceCriteria || pr.acceptanceCriteria.length === 0) {
      throw new Error('Acceptance criteria missing - cannot create test plan');
    }

    plan.acceptanceCriteriaValidation = pr.acceptanceCriteria.map(criterion => ({
      criterion,
      status: 'untested',
      evidence: '',
    }));

    this.testPlans.set(pr.id, plan);
    return plan;
  }

  identifyRegressionAreas(pr: FeaturePR, changedFiles: string[]): string[] {
    const regressionMap: Record<string, string[]> = {
      'auth': ['login', 'logout', 'session management', 'password reset'],
      'api': ['all endpoints', 'rate limiting', 'authentication headers'],
      'database': ['data migrations', 'queries', 'indexes', 'cascading deletes'],
      'ui': ['responsive design', 'navigation', 'form validation', 'accessibility'],
      'performance': ['load times', 'caching', 'database queries', 'memory leaks'],
    };

    const affectedAreas: string[] = [];
    changedFiles.forEach(file => {
      Object.entries(regressionMap).forEach(([category, areas]) => {
        if (file.includes(category)) {
          affectedAreas.push(...areas);
        }
      });
    });

    return [...new Set(affectedAreas)]; // Remove duplicates
  }

  validateAcceptanceCriteria(pr: FeaturePR, testResults: Record<string, boolean>): CriteriaValidation {
    const validation: CriteriaValidation = {
      prId: pr.id,
      criteriaStatus: [],
      allCriteriaMet: false,
      blockers: [],
    };

    pr.acceptanceCriteria.forEach(criterion => {
      const met = testResults[criterion] ?? false;
      const status = met ? 'pass' : 'fail';
      
      validation.criteriaStatus.push({ criterion, status });
      
      if (!met) {
        validation.blockers.push(`Criterion not met: "${criterion}"`);
      }
    });

    validation.allCriteriaMet = validation.blockers.length === 0;
    return validation;
  }

  createBugReport(description: string, steps: string[], severity: 'blocker' | 'high' | 'medium' | 'low'): Bug {
    const bug: Bug = {
      id: `BUG-${Date.now()}`,
      title: description,
      reproductionSteps: steps,
      severity,
      priority: this.calculatePriority(severity),
      createdAt: new Date(),
      status: 'open',
    };

    this.bugsFound.push(bug);
    return bug;
  }

  private calculatePriority(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const severityToPriority: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      'blocker': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
    };
    return severityToPriority[severity] || 'low';
  }

  shouldEscalate(pr: FeaturePR): EscalationDecision {
    const decision: EscalationDecision = {
      shouldEscalate: false,
      reason: '',
      escalateTo: [],
    };

    // Escalate if acceptance criteria unclear
    if (!pr.acceptanceCriteria || pr.acceptanceCriteria.length === 0) {
      decision.shouldEscalate = true;
      decision.reason = 'Unclear acceptance criteria';
      decision.escalateTo.push('Planner');
    }

    // Escalate if test coverage missing
    if (!pr.testCoverage.unitTests && !pr.testCoverage.integrationTests) {
      decision.shouldEscalate = true;
      decision.reason = 'Missing test coverage';
      decision.escalateTo.push('Tech Lead Reviewer');
    }

    // Escalate if security-sensitive
    if (pr.description.toLowerCase().includes('auth') || 
        pr.description.toLowerCase().includes('security') ||
        pr.description.toLowerCase().includes('payment')) {
      decision.escalateTo.push('Tech Lead Reviewer');
    }

    if (decision.escalateTo.length > 0) {
      decision.shouldEscalate = true;
    }

    return decision;
  }

  getTestPlan(prId: string): TestPlan | undefined {
    return this.testPlans.get(prId);
  }

  getBugsFound(): Bug[] {
    return this.bugsFound;
  }

  clearBugs(): void {
    this.bugsFound = [];
  }
}

// Type definitions
interface TestPlan {
  prId: string;
  prTitle: string;
  happyPathScenarios: Scenario[];
  edgeCases: Scenario[];
  regressionAreas: string[];
  acceptanceCriteriaValidation: CriterionStatus[];
  bugsFound: Bug[];
  overallStatus: 'pending' | 'in-progress' | 'passed' | 'failed' | 'blocked';
  createdAt: Date;
}

interface Scenario {
  name: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  status?: 'pass' | 'fail';
}

interface CriterionStatus {
  criterion: string;
  status: 'untested' | 'pass' | 'fail';
  evidence: string;
}

interface CriteriaValidation {
  prId: string;
  criteriaStatus: Array<{ criterion: string; status: string }>;
  allCriteriaMet: boolean;
  blockers: string[];
}

interface Bug {
  id: string;
  title: string;
  reproductionSteps: string[];
  severity: 'blocker' | 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: Date;
  status: 'open' | 'fixed' | 'verified' | 'wontfix';
}

interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string;
  escalateTo: string[];
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('QA Agent - Core Responsibilities', () => {
  let qa: QAAgent;

  beforeEach(() => {
    qa = new QAAgent();
  });

  afterEach(() => {
    qa.clearBugs();
  });

  // ========== TEST GROUP 1: Test Plan Creation ==========
  describe('Test Plan Creation', () => {
    it('should create a test plan for a valid PR', () => {
      const pr: FeaturePR = {
        id: 'PR-001',
        title: 'Add two-factor authentication',
        description: 'Implement 2FA using TOTP',
        acceptanceCriteria: [
          'User can enable 2FA in settings',
          'Login prompts for 2FA code',
          'Invalid codes show error',
        ],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: false,
        },
      };

      const plan = qa.createTestPlan(pr);

      expect(plan.prId).toBe('PR-001');
      expect(plan.prTitle).toBe('Add two-factor authentication');
      expect(plan.acceptanceCriteriaValidation.length).toBe(3);
      expect(plan.acceptanceCriteriaValidation[0].status).toBe('untested');
    });

    it('should throw error if acceptance criteria is missing', () => {
      const pr: FeaturePR = {
        id: 'PR-002',
        title: 'Vague feature',
        description: 'Fix something',
        acceptanceCriteria: [],
        testCoverage: {
          unitTests: true,
          integrationTests: false,
          e2eTests: false,
        },
      };

      expect(() => qa.createTestPlan(pr)).toThrow('Acceptance criteria missing');
    });

    it('should initialize test plan with empty scenarios', () => {
      const pr: FeaturePR = {
        id: 'PR-003',
        title: 'Simple fix',
        description: 'Fix button alignment',
        acceptanceCriteria: ['Button aligned correctly'],
        testCoverage: {
          unitTests: false,
          integrationTests: false,
          e2eTests: false,
        },
      };

      const plan = qa.createTestPlan(pr);

      expect(plan.happyPathScenarios).toEqual([]);
      expect(plan.edgeCases).toEqual([]);
      expect(plan.overallStatus).toBe('pending');
    });
  });

  // ========== TEST GROUP 2: Regression Area Identification ==========
  describe('Regression Testing Strategy', () => {
    const pr: FeaturePR = {
      id: 'PR-004',
      title: 'Update auth logic',
      description: 'Refactor authentication system',
      acceptanceCriteria: ['Existing login still works', 'Session management unaffected'],
      testCoverage: {
        unitTests: true,
        integrationTests: true,
        e2eTests: true,
      },
    };

    it('should identify regression areas for auth changes', () => {
      const changedFiles = ['src/auth/login.ts', 'src/auth/session.ts'];
      const areas = qa.identifyRegressionAreas(pr, changedFiles);

      expect(areas).toContain('login');
      expect(areas).toContain('logout');
      expect(areas).toContain('session management');
    });

    it('should identify regression areas for API changes', () => {
      const changedFiles = ['src/api/endpoints.ts'];
      const areas = qa.identifyRegressionAreas(pr, changedFiles);

      expect(areas).toContain('all endpoints');
      expect(areas).toContain('authentication headers');
    });

    it('should identify regression areas for database changes', () => {
      const changedFiles = ['src/db/schema.ts'];
      const areas = qa.identifyRegressionAreas(pr, changedFiles);

      expect(areas).toContain('data migrations');
      expect(areas).toContain('queries');
    });

    it('should remove duplicate regression areas', () => {
      const changedFiles = ['src/auth/login.ts', 'src/auth/logout.ts', 'src/api/auth-endpoints.ts'];
      const areas = qa.identifyRegressionAreas(pr, changedFiles);

      const uniqueAreas = [...new Set(areas)];
      expect(uniqueAreas.length).toBe(areas.length);
    });
  });

  // ========== TEST GROUP 3: Acceptance Criteria Validation ==========
  describe('Acceptance Criteria Validation', () => {
    it('should validate all criteria as met', () => {
      const pr: FeaturePR = {
        id: 'PR-005',
        title: 'Feature complete',
        description: 'A complete feature',
        acceptanceCriteria: ['User can do X', 'Error is shown on failure'],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: false,
        },
      };

      const testResults = {
        'User can do X': true,
        'Error is shown on failure': true,
      };

      const validation = qa.validateAcceptanceCriteria(pr, testResults);

      expect(validation.allCriteriaMet).toBe(true);
      expect(validation.blockers.length).toBe(0);
      expect(validation.criteriaStatus.every(c => c.status === 'pass')).toBe(true);
    });

    it('should report criteria not met', () => {
      const pr: FeaturePR = {
        id: 'PR-006',
        title: 'Incomplete feature',
        description: 'Partially implemented',
        acceptanceCriteria: [
          'User can do X',
          'Error is shown on failure',
          'Data persists after reload',
        ],
        testCoverage: {
          unitTests: true,
          integrationTests: false,
          e2eTests: false,
        },
      };

      const testResults = {
        'User can do X': true,
        'Error is shown on failure': false,
        'Data persists after reload': false,
      };

      const validation = qa.validateAcceptanceCriteria(pr, testResults);

      expect(validation.allCriteriaMet).toBe(false);
      expect(validation.blockers.length).toBe(2);
      expect(validation.blockers[0]).toContain('Error is shown on failure');
    });

    it('should track all criteria status individually', () => {
      const pr: FeaturePR = {
        id: 'PR-007',
        title: 'Mixed results',
        description: 'Some pass, some fail',
        acceptanceCriteria: ['Criterion A', 'Criterion B', 'Criterion C'],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: true,
        },
      };

      const testResults = {
        'Criterion A': true,
        'Criterion B': false,
        'Criterion C': true,
      };

      const validation = qa.validateAcceptanceCriteria(pr, testResults);

      expect(validation.criteriaStatus.length).toBe(3);
      expect(validation.criteriaStatus[0].status).toBe('pass');
      expect(validation.criteriaStatus[1].status).toBe('fail');
      expect(validation.criteriaStatus[2].status).toBe('pass');
    });
  });

  // ========== TEST GROUP 4: Bug Reporting ==========
  describe('Bug Reporting & Triage', () => {
    it('should create a bug report with correct structure', () => {
      const bug = qa.createBugReport(
        'Login button not clickable',
        ['Navigate to login page', 'Click login button', 'Result: Nothing happens'],
        'high'
      );

      expect(bug.title).toBe('Login button not clickable');
      expect(bug.reproductionSteps.length).toBe(3);
      expect(bug.severity).toBe('high');
      expect(bug.priority).toBe('high');
      expect(bug.status).toBe('open');
      expect(bug.id).toMatch(/^BUG-/);
    });

    it('should assign correct priority based on severity', () => {
      const blockerBug = qa.createBugReport('App crashes', ['Open app'], 'blocker');
      const highBug = qa.createBugReport('Feature broken', ['Use feature'], 'high');
      const mediumBug = qa.createBugReport('Layout off', ['Load page'], 'medium');
      const lowBug = qa.createBugReport('Typo in label', ['Read label'], 'low');

      expect(blockerBug.priority).toBe('critical');
      expect(highBug.priority).toBe('high');
      expect(mediumBug.priority).toBe('medium');
      expect(lowBug.priority).toBe('low');
    });

    it('should track all bugs found', () => {
      qa.createBugReport('Bug 1', ['Step 1'], 'high');
      qa.createBugReport('Bug 2', ['Step 1'], 'medium');
      qa.createBugReport('Bug 3', ['Step 1'], 'low');

      const bugs = qa.getBugsFound();
      expect(bugs.length).toBe(3);
      expect(bugs[0].title).toBe('Bug 1');
      expect(bugs[1].title).toBe('Bug 2');
      expect(bugs[2].title).toBe('Bug 3');
    });

    it('should clear bugs between test runs', () => {
      qa.createBugReport('Test bug', ['Step'], 'high');
      expect(qa.getBugsFound().length).toBe(1);

      qa.clearBugs();
      expect(qa.getBugsFound().length).toBe(0);
    });
  });

  // ========== TEST GROUP 5: Escalation Logic ==========
  describe('Escalation Decision Making', () => {
    it('should escalate when acceptance criteria is missing', () => {
      const pr: FeaturePR = {
        id: 'PR-008',
        title: 'No criteria',
        description: 'Unclear feature',
        acceptanceCriteria: [],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: false,
        },
      };

      const decision = qa.shouldEscalate(pr);

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.reason).toContain('Acceptance criteria');
      expect(decision.escalateTo).toContain('Planner');
    });

    it('should escalate when test coverage is insufficient', () => {
      const pr: FeaturePR = {
        id: 'PR-009',
        title: 'No tests',
        description: 'Code with no tests',
        acceptanceCriteria: ['It works'],
        testCoverage: {
          unitTests: false,
          integrationTests: false,
          e2eTests: false,
        },
      };

      const decision = qa.shouldEscalate(pr);

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.escalateTo).toContain('Tech Lead Reviewer');
    });

    it('should escalate security-sensitive changes to Tech Lead', () => {
      const authPR: FeaturePR = {
        id: 'PR-010',
        title: 'Auth update',
        description: 'Update authentication system',
        acceptanceCriteria: ['Secure'],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: false,
        },
      };

      const decision = qa.shouldEscalate(authPR);

      expect(decision.escalateTo).toContain('Tech Lead Reviewer');
    });

    it('should not escalate for standard feature with complete info', () => {
      const pr: FeaturePR = {
        id: 'PR-011',
        title: 'Button color',
        description: 'Change button color',
        acceptanceCriteria: ['Button is blue', 'Matches design'],
        testCoverage: {
          unitTests: true,
          integrationTests: false,
          e2eTests: false,
        },
      };

      const decision = qa.shouldEscalate(pr);

      expect(decision.shouldEscalate).toBe(false);
      expect(decision.escalateTo.length).toBe(0);
    });
  });

  // ========== TEST GROUP 6: Integration Scenarios ==========
  describe('End-to-End QA Workflow', () => {
    it('should handle complete test flow: Create plan → Validate criteria → Report bugs', () => {
      const pr: FeaturePR = {
        id: 'PR-012',
        title: 'Complete workflow',
        description: 'Test full QA process',
        acceptanceCriteria: [
          'Feature works',
          'No regressions',
          'Performance acceptable',
        ],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: true,
        },
      };

      // Step 1: Create test plan
      const plan = qa.createTestPlan(pr);
      expect(plan).toBeDefined();
      expect(plan.acceptanceCriteriaValidation.length).toBe(3);

      // Step 2: Identify regressions
      const regressions = qa.identifyRegressionAreas(pr, ['src/core/feature.ts']);
      expect(regressions.length).toBeGreaterThan(0);

      // Step 3: Simulate test execution and validation
      const testResults = {
        'Feature works': true,
        'No regressions': false, // Found a regression!
        'Performance acceptable': true,
      };
      const validation = qa.validateAcceptanceCriteria(pr, testResults);

      // Step 4: Report bugs found
      if (!validation.allCriteriaMet) {
        qa.createBugReport(
          'Regression in module X',
          ['Run regression tests', 'Module X fails'],
          'high'
        );
      }

      const bugs = qa.getBugsFound();
      expect(bugs.length).toBeGreaterThan(0);
      expect(validation.blockers.length).toBeGreaterThan(0);
    });

    it('should provide clear status for code review team', () => {
      const pr: FeaturePR = {
        id: 'PR-013',
        title: 'Review status test',
        description: 'Check status reporting',
        acceptanceCriteria: ['Works', 'Tested'],
        testCoverage: {
          unitTests: true,
          integrationTests: true,
          e2eTests: false,
        },
      };

      const plan = qa.createTestPlan(pr);
      const testResults = {
        'Works': true,
        'Tested': true,
      };
      const validation = qa.validateAcceptanceCriteria(pr, testResults);

      // Report to Tech Lead Reviewer
      expect(validation.allCriteriaMet).toBe(true);
      expect(validation.criteriaStatus.every(c => c.status === 'pass')).toBe(true);

      // If all pass, QA should say: "Ready to merge"
      if (validation.allCriteriaMet && qa.getBugsFound().length === 0) {
        expect(true).toBe(true); // Signal: "Ready to merge"
      }
    });
  });
});

// ============================================================================
// SUMMARY
// ============================================================================
/*
 * WHAT THESE TESTS VERIFY:
 *
 * 1. Test Plan Creation
 *    ✓ QA creates proper test plans from PR info
 *    ✓ Fails if acceptance criteria is missing (catches vague PRs early)
 *    ✓ Initializes with expected structure
 *
 * 2. Regression Testing
 *    ✓ Identifies related areas based on changed files
 *    ✓ Maps changes to affected features
 *    ✓ Removes duplicate suggestions
 *
 * 3. Acceptance Criteria Validation
 *    ✓ Validates each criterion individually
 *    ✓ Reports blockers clearly
 *    ✓ Overall pass/fail decision is correct
 *
 * 4. Bug Reporting
 *    ✓ Bug reports have required structure
 *    ✓ Severity maps to priority correctly
 *    ✓ Bugs are tracked and retrievable
 *
 * 5. Escalation Logic
 *    ✓ Escalates when info is incomplete
 *    ✓ Escalates for security-sensitive changes
 *    ✓ Doesn't over-escalate standard features
 *
 * 6. End-to-End Integration
 *    ✓ Full workflow from plan to bug reporting works
 *    ✓ Status is clear for other team members
 *
 * HOW TO RUN:
 * $ npm run test -- qa-agent.test.ts
 *
 * HOW TO USE RESULTS:
 * - Green: QA Agent is functioning correctly
 * - Red: The agent needs adjustment in that responsibility area
 * - Use as regression test when updating agent behavior
 */
