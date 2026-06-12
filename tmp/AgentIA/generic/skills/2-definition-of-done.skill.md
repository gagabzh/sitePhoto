# Skill: Definition of Done

**Used by**: Developer, QA, DevOps, Tech Lead, Product Owner  
**Purpose**: Verify work meets consistent quality standards before moving to next phase  
**File**: generic/skills/2-definition-of-done.skill.md

---

## Overview

Definition of Done (DoD) ensures:
- ✅ Consistent quality standards across all projects
- ✅ No surprises when work moves to the next phase
- ✅ Less rework and technical debt
- ✅ Clear expectations for all team members
- ✅ Works for any project type (backend, frontend, full-stack, infrastructure, mobile)

---

## Core Principles

1. **If it's not in DoD, it's not done** - Don't move forward with incomplete work
2. **Quality is non-negotiable** - All DoD items must be satisfied
3. **DoD is a team agreement** - Everyone agrees on what "done" means
4. **DoD evolves** - Update as project needs change
5. **DoD prevents technical debt** - Fix it now, not later

---

## Generic Definition of Done

This is the base DoD that applies to ALL work, regardless of type. Specialized DoD sections below add requirements for specific work types.

### Universal DoD (Required for All Work)

- [ ] **Code is complete** - Feature/fix implements all acceptance criteria
- [ ] **Code follows conventions** - Matches project coding standards and patterns
- [ ] **No compiler warnings** - Clean compilation/build
- [ ] **No console warnings** - No warnings in browser console or logs
- [ ] **No lint errors** - ESLint/TSLint/Pylint/etc. all pass
- [ ] **All existing tests pass** - No regressions introduced
- [ ] **Code is reviewed** - At least one other team member has reviewed
- [ ] **All review feedback addressed** - All comments resolved or acknowledged
- [ ] **Commit messages are clear** - Each commit has descriptive message
- [ ] **Documentation updated** - README, API docs, or inline comments as needed

---

## Specialized DoD by Work Type

### Backend/API Development DoD

**Use when**: Working on server-side code, API endpoints, database changes

- [ ] **Code Quality**
  - [ ] Follows established patterns (middleware, error handling, etc.)
  - [ ] No hardcoded values (uses config/env vars or constants)
  - [ ] No sensitive data in code (secrets, API keys, credentials)
  - [ ] Variable/function names are clear and meaningful
  - [ ] Comments explain non-obvious logic (why, not what)
  - [ ] No dead code or commented-out code blocks

- [ ] **Testing**
  - [ ] Unit tests written for all new/changed functions
  - [ ] Unit tests pass (all green)
  - [ ] Code coverage >= 80% for new code
  - [ ] Edge cases tested (empty, 1, max, invalid, null)
  - [ ] Error states tested (400, 401, 403, 404, 500, timeout)
  - [ ] Tests verify actual behavior (not just run without errors)

- [ ] **Security**
  - [ ] All SQL queries use parameterized placeholders (never string interpolation)
  - [ ] All user input is validated before use
  - [ ] Authentication/authorization checks in place where needed
  - [ ] No sensitive data logged or exposed in error messages
  - [ ] Rate limiting considered for public endpoints

- [ ] **API Design**
  - [ ] RESTful conventions followed (HTTP methods, status codes)
  - [ ] Consistent naming with existing endpoints
  - [ ] Proper error responses (structure, status codes)
  - [ ] API documentation updated (OpenAPI/Swagger, etc.)
  - [ ] Versioning considered if breaking changes

- [ ] **Database** (if schema changes)
  - [ ] Migration file created and tested
  - [ ] Migration is idempotent (IF EXISTS, IF NOT EXISTS)
  - [ ] Migration doesn't modify existing migrations
  - [ ] Rollback procedure documented
  - [ ] Data migration tested if needed

- [ ] **Performance**
  - [ ] No N+1 query problems
  - [ ] Database queries optimized (indexes, select only needed columns)
  - [ ] Caching strategy is reasonable
  - [ ] API response times acceptable (< 500ms typical)

---

### Frontend Development DoD

**Use when**: Working on UI components, pages, or client-side logic

- [ ] **Code Quality**
  - [ ] Follows component architecture (atomic design, feature folders, etc.)
  - [ ] No hardcoded styles (uses design system/CSS variables)
  - [ ] No hardcoded text (uses i18n/translation system if applicable)
  - [ ] Component props are typed (TypeScript/PropTypes)
  - [ ] No unused imports or variables

- [ ] **Accessibility**
  - [ ] HTML semantics correct (proper tags, ARIA labels)
  - [ ] Keyboard navigation works for all interactive elements
  - [ ] Focus indicators visible for keyboard users
  - [ ] Color contrast meets WCAG standards (4.5:1 minimum)
  - [ ] Alt text for all images
  - [ ] Form labels and instructions are clear

- [ ] **Responsive Design**
  - [ ] Works on desktop (tested at 1920px, 1366px)
  - [ ] Works on tablet (tested at 768px)
  - [ ] Works on mobile (tested at 375px)
  - [ ] Touch targets minimum 48x48px on mobile
  - [ ] No horizontal scrolling on mobile

- [ ] **Testing**
  - [ ] Component tests written (rendering, interactions)
  - [ ] Integration tests for complex flows
  - [ ] Edge cases tested (empty states, loading states, error states)
  - [ ] Cross-browser tested (Chrome, Firefox, Safari if applicable)

- [ ] **Security**
  - [ ] All user-generated content is escaped/sanitized
  - [ ] No XSS vulnerabilities (HTML injection)
  - [ ] CSRF tokens used for forms if applicable
  - [ ] Sensitive data not exposed in client-side code

- [ ] **Performance**
  - [ ] No unnecessary re-renders
  - [ ] Bundle size reasonable (no huge dependencies)
  - [ ] Images optimized (proper formats, sizes)
  - [ ] Lazy loading for non-critical resources
  - [ ] Critical CSS inlined for faster paint

---

### Database Development DoD

**Use when**: Working on database schema, migrations, or queries

- [ ] **Schema Design**
  - [ ] Table/column names are clear and consistent
  - [ ] Appropriate data types used (not all VARCHAR)
  - [ ] Constraints in place (NOT NULL, UNIQUE, CHECK)
  - [ ] Indexes created for query performance
  - [ ] Foreign keys defined where appropriate

- [ ] **Migrations**
  - [ ] Migration file follows naming convention (YYYYMMDD_description.sql)
  - [ ] Migration is idempotent (can run multiple times safely)
  - [ ] Migration includes both up and down scripts
  - [ ] Migration tested on staging environment
  - [ ] Migration doesn't modify existing migrations

- [ ] **Data Integrity**
  - [ ] Data migration preserves all existing data
  - [ ] Rollback procedure documented and tested
  - [ ] Backup created before running in production
  - [ ] Data validation in place

- [ ] **Query Performance**
  - [ ] Queries use appropriate indexes
  - [ ] No SELECT * (only needed columns)
  - [ ] Complex queries optimized (joins, subqueries)
  - [ ] Query performance tested with realistic data volumes

---

### Infrastructure/DevOps DoD

**Use when**: Working on infrastructure, deployment, or DevOps changes

- [ ] **Planning**
  - [ ] Changes documented (what, why, impact)
  - [ ] Rollback plan created and tested
  - [ ] Risk assessment completed
  - [ ] Maintenance window scheduled if needed

- [ ] **Implementation**
  - [ ] Infrastructure as code (Terraform, CloudFormation, etc.)
  - [ ] No hardcoded credentials (use secrets management)
  - [ ] Configuration management in place
  - [ ] Changes tested in staging first

- [ ] **Monitoring**
  - [ ] Monitoring configured for new resources
  - [ ] Alerts set up for critical failures
  - [ ] Dashboards updated for visibility
  - [ ] Logs are aggregated and searchable

- [ ] **Security**
  - [ ] Security review passed
  - [ ] Network security groups/firewalls configured correctly
  - [ ] No unnecessary ports open
  - [ ] Encryption in place (at rest and in transit)
  - [ ] IAM roles follow principle of least privilege

- [ ] **Scalability**
  - [ ] Scaling implications documented
  - [ ] Auto-scaling configured if applicable
  - [ ] Performance baseline established
  - [ ] Load testing completed if applicable

---

### Mobile Development DoD

**Use when**: Working on iOS or Android applications

- [ ] **Code Quality**
  - [ ] Follows platform conventions (iOS HIG, Material Design)
  - [ ] No memory leaks (proper resource cleanup)
  - [ ] App lifecycle handled correctly
  - [ ] Error handling in place for all async operations

- [ ] **UI/UX**
  - [ ] Follows design system/brand guidelines
  - [ ] Works in both light and dark modes
  - [ ] Orientation changes handled (portrait/landscape)
  - [ ] Safe area insets respected

- [ ] **Testing**
  - [ ] Unit tests for business logic
  - [ ] UI tests for critical flows
  - [ ] Tested on multiple devices and OS versions
  - [ ] Edge cases tested (offline, slow network, etc.)

- [ ] **Performance**
  - [ ] App startup time < 2 seconds
  - [ ] Memory usage reasonable
  - [ ] Battery impact minimized
  - [ ] Network requests optimized

- [ ] **Platform-Specific**
  - [ ] App Store/Play Store guidelines followed
  - [ ] All required permissions declared and used
  - [ ] Privacy policy accessible
  - [ ] App icons and screenshots provided

---

### Data Science/ML DoD

**Use when**: Working on data pipelines, machine learning models, or analytics

- [ ] **Data Quality**
  - [ ] Data sources documented
  - [ ] Data validation in place
  - [ ] Missing data handled appropriately
  - [ ] Data lineage tracked

- [ ] **Model Development**
  - [ ] Training data representative and unbiased
  - [ ] Model performance metrics documented
  - [ ] Model tested on held-out validation set
  - [ ] Edge cases tested

- [ ] **Reproducibility**
  - [ ] Experiment tracking in place (MLflow, Weights & Biases, etc.)
  - [ ] Random seeds set for reproducibility
  - [ ] Environment specified (Python version, package versions)

- [ ] **Deployment**
  - [ ] Model versioned
  - [ ] API endpoint documented
  - [ ] Monitoring for model drift in place
  - [ ] Retraining pipeline established

---

## PR Submission DoD

**Use when**: Submitting any pull request

- [ ] **PR Metadata**
  - [ ] PR title is descriptive (includes Jira ticket or feature name)
  - [ ] PR description explains what changed
  - [ ] PR description includes why the change was made
  - [ ] PR description includes testing strategy

- [ ] **Scope**
  - [ ] PR contains single logical change
  - [ ] No unrelated files changed
  - [ ] If DB schema changed, migration file included
  - [ ] If new feature, all necessary files included

- [ ] **Testing**
  - [ ] Test coverage percentage stated
  - [ ] All tests pass (attach CI output if available)
  - [ ] New tests added for new code
  - [ ] Manual testing completed if applicable

- [ ] **Documentation**
  - [ ] Commit messages are clear and descriptive
  - [ ] Non-obvious code has comments
  - [ ] README updated if new feature or configuration
  - [ ] API documentation updated if endpoints changed

- [ ] **Visuals**
  - [ ] Screenshots provided for UI changes
  - [ ] Screen recordings for complex interactions
  - [ ] Before/after comparisons if applicable

- [ ] **Dependencies**
  - [ ] No new dependencies without approval
  - [ ] Dependency licenses compatible
  - [ ] Security vulnerabilities checked (npm audit, dependabot)

---

## How to Use This Skill

### For Developers

**Before submitting a PR:**
1. Identify work type (backend, frontend, database, etc.)
2. Check Universal DoD - all items must be complete
3. Check Specialized DoD for your work type - all applicable items must be complete
4. If ANY item is incomplete → Fix it before submitting
5. If ALL items complete → ✅ Ready to submit PR

**During Development:**
- Refer to DoD early and often
- Check items as you complete them
- Don't leave DoD items until the end

### For Reviewers (Tech Lead, QA, etc.)

**When reviewing a PR:**
1. Check Universal DoD items
2. Check Specialized DoD for the work type
3. Verify all checkboxes are complete
4. If ANY item incomplete → Request changes before approval
5. If ALL items complete → Can proceed with approval (if quality passes)

### For Project Leads

**At Sprint Planning:**
- Remind team of DoD standards
- Ensure DoD is appropriate for upcoming work
- Update DoD if project needs change

**At Retrospectives:**
- Review DoD compliance
- Identify items that were frequently missed
- Consider updating DoD based on lessons learned

---

## DoD Customization Guide

### Adding Project-Specific Requirements

1. **Fork this skill** - Create a project-specific version
2. **Add sections** - Include project-specific DoD items
3. **Remove irrelevant items** - If a section doesn't apply to your project
4. **Adjust thresholds** - Change coverage percentages, performance targets, etc.

### Example: Adding Company-Specific Security Requirements

```markdown
### Company Security DoD

- [ ] All code scanned with Snyk/Checkmarx
- [ ] No high/critical vulnerabilities
- [ ] Security review completed for production changes
- [ ] Secrets scanning passed (TruffleHog, GitLeaks)
- [ ] Compliance checklist completed (GDPR, HIPAA, etc.)
```

### Example: Adjusting for Startup Speed

```markdown
### MVP DoD (Minimum Viable Product Mode)

Note: For MVP development, we prioritize speed over perfection.

- [ ] Core functionality works
- [ ] No critical bugs
- [ ] Basic tests in place (happy path)
- [ ] Documentation for complex parts only
- [ ] Can be refactored later (technical debt tracked)
```

---

## Quick Checklists

### Pre-Commit Checklist (Universal)
- [ ] Code compiles/builds
- [ ] No lint errors
- [ ] All existing tests pass
- [ ] Commit message describes changes

### Pre-PR Checklist
- [ ] All acceptance criteria met
- [ ] DoD items complete
- [ ] Code reviewed (self-review first)
- [ ] Tests written and passing
- [ ] Documentation updated

### Code Review Checklist
- [ ] Follows coding conventions
- [ ] No hardcoded secrets
- [ ] Error handling in place
- [ ] Performance acceptable
- [ ] Tests cover edge cases

---

## Tips for Success

1. **Start early** - Don't wait until the end to check DoD items
2. **Automate what you can** - Use linters, CI checks, pre-commit hooks
3. **Pair program** - Two sets of eyes catch more DoD items
4. **Review DoD regularly** - Update as project evolves
5. **Train new team members** - Ensure everyone knows the DoD
6. **Celebrate compliance** - Recognize team members who consistently meet DoD

---

## Troubleshooting

**Problem**: DoD items are consistently missed  
**Solution**: Add automation (CI checks, Git hooks) to enforce DoD

**Problem**: DoD takes too long to complete  
**Solution**: Review if all DoD items are truly necessary, consider MVP mode

**Problem**: Team doesn't agree on DoD items  
**Solution**: Hold a team workshop to align on DoD standards

**Problem**: DoD varies between projects  
**Solution**: Create project-specific DoD forks with common base

---

**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Applies to**: All projects
