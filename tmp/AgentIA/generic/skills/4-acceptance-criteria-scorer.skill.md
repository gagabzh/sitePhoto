# Skill: Acceptance Criteria Quality Scorer

**Used by**: Product Owner, QA Agent, Business Analyst, Product Manager  
**Purpose**: Evaluate if acceptance criteria are testable, clear, and complete (0-10 scoring system)  
**File**: generic/skills/4-acceptance-criteria-scorer.skill.md

---

## Overview

This skill ensures:
- ✅ Acceptance criteria are testable and objective
- ✅ No subjective or vague language
- ✅ Edge cases are identified and covered
- ✅ QA knows exactly what to test
- ✅ Developers understand exactly what to build
- ✅ Works for any project type (web, mobile, API, data, infrastructure)
- ✅ Adaptable to any methodology (Agile, Scrum, Kanban, Waterfall)

---

## Why This Matters

### Good Acceptance Criteria
- **Clear**: Everyone understands what's expected
- **Testable**: QA can verify objectively (pass/fail)
- **Complete**: Covers all scenarios (happy path + edge cases + errors)
- **Actionable**: Developers know exactly what to implement
- **Unambiguous**: No room for interpretation

### Bad Acceptance Criteria
- **Vague**: "Improve performance" - How much? How measured?
- **Subjective**: "Looks good" - Who decides? What's the standard?
- **Incomplete**: Only covers happy path, misses errors
- **Technical**: Written for developers, not understandable by business
- **Over-specified**: Includes implementation details, not just outcomes

---

## Scoring Rubric (0-10 Scale)

Score each dimension, then sum for total (0-10).

### Dimension 1: Specificity (0-3 points)

**Measures**: How specific and actionable are the criteria?

- **3 points**: Action is very specific with clear, executable steps
  - "User clicks 'Submit' button and form validates all fields"
  - "API returns 200 status with JSON response containing user data"
  - "System sends email within 5 seconds of registration"
  
- **2 points**: Action is somewhat specific but could be clearer
  - "Form validation works"
  - "API returns user data"
  - "Email is sent after registration"
  
- **1 point**: Action is vague and lacks detail
  - "Handle form submission"
  - "Implement user registration"
  - "Send notifications"
  
- **0 points**: Action is completely vague or missing
  - "Improve user experience"
  - "Handle user data"
  - "Make it work"

### Dimension 2: No Vague Language (0-2 points)

**Measures**: Are criteria written with objective, testable language?

- **2 points**: No subjective words, all criteria are objective and measurable
  - ✅ Uses: "within 2 seconds", "returns 200 status", "shows error message"
  - ✅ Avoids: feels, looks, seems, should, might, nice, good, better
  
- **1 point**: Mostly concrete, but has 1-2 subjective terms
  - ⚠️ Mostly good but has minor subjectivity
  
- **0 points**: Lots of subjective language
  - ❌ "Feels fast", "looks professional", "user-friendly", "smooth experience"

### Dimension 3: Edge Cases Covered (0-3 points)

**Measures**: Are boundary conditions and special cases identified?

- **3 points**: At least 3 edge cases listed and clearly defined
  - Empty input, single item, maximum values, invalid data, boundary conditions
  - Examples: empty list, 1 item, 1000 items, special characters, null values
  
- **2 points**: 2 edge cases covered
  
- **1 point**: 1 edge case mentioned
  
- **0 points**: No edge cases identified

### Dimension 4: Error States Clear (0-2 points)

**Measures**: Are error scenarios and handling defined?

- **2 points**: All relevant error states defined with specific handling
  - Network errors, timeout, permission denied, invalid input, not found, server errors
  - Clear error messages and user feedback specified
  
- **1 point**: Some error states mentioned but not comprehensive
  
- **0 points**: No error handling mentioned

---

## Total Score Interpretation

| Score Range | Quality Level | Recommendation | Action |
|-------------|---------------|----------------|--------|
| **9-10** | Excellent | Ready to develop immediately | ✅ APPROVE - No revisions needed |
| **7-8** | Good | Minor gaps | ✅ APPROVE - Can start, may need quick clarifications |
| **5-6** | Adequate | Has gaps, needs improvement | 🟡 REQUEST REVISIONS - Rewrite before development starts |
| **3-4** | Poor | Major gaps | 🔴 BLOCK - Rewrite needed before planning |
| **0-2** | Very Poor | Not testable | 🔴 BLOCK - Start from scratch |

---

## Examples with Scoring

### Example 1: Excellent Criteria (Score: 10/10)

```
Story: USER-123 — Paginate user list in admin panel

As an administrator, I can browse through users in a paginated list
so that I can manage large numbers of users efficiently.

Acceptance Criteria:
- Each page shows exactly 50 users
- Pagination controls appear at top and bottom of list
- Clicking "Next" loads the next page of users
- Clicking "Previous" loads the previous page of users
- Page 1 has "Previous" button disabled
- Last page has "Next" button disabled
- User can jump to any page by entering page number
- Page loads in < 1000ms (show loading spinner if slower)
- Empty result shows "No users found" message
- Total user count displayed: "Showing 1-50 of 250 users"

Edge Cases:
- Exactly 50 users → shows 1 page with all users
- 51 users → shows 2 pages (50 + 1)
- 0 users → shows empty state message
- 1000 users → performance acceptable (< 2s load time)
- Invalid page number → redirects to page 1 with error toast

Errors:
- Network timeout → "Couldn't load users. Retry?" button
- Permission denied → "You don't have access to this page"
- Server error → "Something went wrong. Please try again."
```

**Score breakdown:**
- Specificity: 3/3 ✅ (very specific, actionable)
- Language: 2/2 ✅ (no subjective terms)
- Edge cases: 3/3 ✅ (5 edge cases listed)
- Errors: 2/2 ✅ (all error states defined)
**Total: 10/10 - Ready to develop!**

---

### Example 2: Good Criteria (Score: 8/10)

```
Story: API-456 — User authentication endpoint

As a user, I can log in with email and password
so that I can access my account.

Acceptance Criteria:
- POST /api/auth/login accepts email and password
- Returns JWT token on success
- Returns 401 for invalid credentials
- Token expires after 24 hours
- Rate limited to 5 attempts per minute

Edge Cases:
- Empty email → returns 400
- Empty password → returns 400
- Very long email (255 chars) → handled gracefully

Errors:
- Network error → client-side error message
- Server error → 500 status
```

**Score breakdown:**
- Specificity: 3/3 ✅
- Language: 2/2 ✅
- Edge cases: 2/3 (only 3 edge cases, could use more)
- Errors: 1/2 (missing some error scenarios)
**Total: 8/10 - Good, minor improvements needed**

---

### Example 3: Poor Criteria (Score: 3/10)

```
Story: UI-789 — Improve user profile page

As a user, I can view and edit my profile
so that my information is up to date.

Acceptance Criteria:
- Profile page looks good
- Editing works smoothly
- Users can update their information
```

**Score breakdown:**
- Specificity: 0/3 (very vague: "looks good", "works smoothly")
- Language: 0/2 (subjective: "looks good", "smoothly")
- Edge cases: 0/3 (no edge cases mentioned)
- Errors: 0/2 (no error handling)
**Total: 0/10 - Needs complete rewrite!**

---

## How to Write Good Acceptance Criteria

### Use the GIVEN-WHEN-THEN Format

```
GIVEN [precondition/state]
WHEN [action/event]
THEN [expected outcome]
```

**Example:**
```
GIVEN user is logged in
WHEN user clicks "Delete Account" button
THEN system shows confirmation dialog with "Are you sure?" message

GIVEN user has entered invalid email format
WHEN user submits form
THEN system shows error message "Please enter a valid email address"

GIVEN database connection fails
WHEN user tries to load dashboard
THEN system shows error page with retry button
```

### Use Specific, Measurable Language

| ❌ Bad | ✅ Good |
|-------|--------|
| "Fast response time" | "Response time < 500ms" |
| "Looks good on mobile" | "Responsive design works on 375px viewport" |
| "Handle errors gracefully" | "Show user-friendly error message with retry option" |
| "Lots of users" | "Supports 10,000 concurrent users" |
| "User-friendly" | "Form has clear labels, help text, and validation messages" |

### Identify All Edge Cases

**Common edge cases to consider:**

- **Empty state**: What happens with no data?
- **Single item**: Does it work with just one item?
- **Maximum values**: What happens at boundaries?
- **Invalid input**: How are invalid values handled?
- **Null/undefined**: How are missing values handled?
- **Special characters**: Unicode, emoji, HTML entities
- **Long values**: Very long strings, large numbers
- **Concurrent actions**: Multiple users doing same thing
- **Network issues**: Slow connection, timeout, offline
- **Permissions**: Unauthorized access attempts

### Define All Error States

**Common error states:**

- **Client-side errors**: Form validation, invalid input
- **Network errors**: Timeout, connection refused, DNS failure
- **Server errors**: 500 Internal Server Error
- **Authentication errors**: 401 Unauthorized
- **Authorization errors**: 403 Forbidden
- **Not found errors**: 404 Resource Not Found
- **Rate limiting**: 429 Too Many Requests
- **Service unavailable**: 503 Service Unavailable

For each error, specify:
- HTTP status code (for APIs)
- Error message shown to user
- Any recovery options (retry button, contact support, etc.)

---

## How to Use This Skill

### When Writing Acceptance Criteria (Product Owner)

1. **Start with user story** - Write the "As a... I can... So that..." format
2. **List acceptance criteria** - Break down what "done" looks like
3. **Apply specificity check** - Can QA test this objectively?
4. **Add edge cases** - What could go wrong? What are the boundaries?
5. **Define error handling** - What happens when things fail?
6. **Score your criteria** - Use the rubric above
7. **Iterate until score >= 7** - Keep improving until testable

**Checklist Before Finalizing:**
- [ ] All actions are specific, not vague
- [ ] No subjective language (feels, looks, smooth, fast)
- [ ] At least 3 edge cases identified
- [ ] All error states defined
- [ ] Score >= 7
- [ ] QA can test this objectively

### When Reviewing Criteria (QA Agent)

1. **Read the user story** - Understand the context
2. **Review each criterion** - Check for specificity and testability
3. **Identify missing edge cases** - What scenarios aren't covered?
4. **Check for vague language** - Flag subjective terms
5. **Score each dimension** - Use the 0-3 or 0-2 scales
6. **Calculate total score** - Sum all dimensions (0-10)
7. **Provide feedback** - Be specific about what needs improvement

**Example Feedback:**

```
Criteria Score: 6/10

Breakdown:
- Specificity: 2/3 (action "handle user input" could be more specific)
- No vague language: 2/2 ✅
- Edge cases: 1/3 (missing empty input, max length, special characters)
- Error states: 1/2 (missing network error, server error)

Feedback:
Please improve the acceptance criteria:

1. Make "handle user input" more specific: "Validate email format and show error if invalid"
2. Add edge cases:
   - Empty email field
   - Email with special characters
   - Email longer than 255 characters
3. Add error states:
   - Network timeout: Show "Connection lost. Please check your internet."
   - Server error: Show "Something went wrong. Please try again."

Resubmit when complete.
```

### When Estimating Work (Developer/Planner)

- Criteria score < 5: High risk of rework, clarify before estimating
- Criteria score 5-6: Medium risk, may need clarifications during development
- Criteria score 7-8: Low risk, clear requirements
- Criteria score 9-10: Very clear, easy to estimate accurately

---

## Acceptance Criteria Template

Use this template for consistent, high-quality acceptance criteria:

```markdown
## User Story

**As a** [role]
**I can** [action]
**So that** [benefit/outcome]

## Acceptance Criteria

- [ ] [Specific, testable action with expected outcome]
- [ ] [Another specific action with expected outcome]
- [ ] [Another specific action with expected outcome]

## Edge Cases

- [ ] **Empty state**: [What happens with no data?]
- [ ] **Single item**: [What happens with one item?]
- [ ] **Maximum values**: [What happens at boundaries?]
- [ ] **Invalid input**: [How are invalid values handled?]
- [ ] **Special characters**: [How are special characters handled?]

## Error States

- [ ] **Client error**: [What happens with invalid input? Show what error message]
- [ ] **Network error**: [What happens with connection issues? Show what message]
- [ ] **Server error**: [What happens with 500 errors? Show what message]
- [ ] **Authentication error**: [What happens with 401? Show what message]
- [ ] **Authorization error**: [What happens with 403? Show what message]

## Performance Requirements

- [ ] [Response time requirement: e.g., "API responds in < 500ms"]
- [ ] [Load capacity: e.g., "Supports 1000 concurrent users"]
- [ ] [Resource limits: e.g., "File upload max 10MB"]

## Security Requirements

- [ ] [Access control: e.g., "Only admins can access this feature"]
- [ ] [Data protection: e.g., "User data encrypted at rest"]
- [ ] [Input validation: e.g., "All inputs sanitized to prevent XSS"]

## Notes

[Any additional context, assumptions, or dependencies]
```

---

## Real-World Examples by Domain

### Web Application Example (Score: 9/10)

```
Story: Check out with shopping cart

As a customer
I can complete the checkout process
So that I can purchase my selected items

Acceptance Criteria:
- User can see cart contents on checkout page
- User can enter shipping address in form
- Form validates all required fields (name, address, city, zip, country)
- User can select shipping method (Standard, Express)
- User can enter payment information
- User can review order summary before final submission
- Clicking "Place Order" processes payment and creates order
- User receives confirmation email within 5 minutes
- User is redirected to confirmation page with order details

Edge Cases:
- Empty cart → redirect to cart page with message "Your cart is empty"
- Invalid zip code format → show error "Please enter a valid zip code"
- Payment declines → show error with option to try another card
- Out of stock item in cart → show error, remove item, recalculate total
- User not logged in → redirect to login, then back to checkout

Errors:
- Network timeout during payment → show "Payment processing timed out. Please try again."
- Server error → show "Something went wrong. Your payment was not processed."
- Payment gateway error → show specific error from payment provider
```

### API Example (Score: 9/10)

```
Story: Create user via API

As a client application
I can create a new user via POST /api/users
So that users can register for the service

Acceptance Criteria:
- POST /api/users accepts JSON body with: email, password, name
- Validates email format (RFC 5322 compliant)
- Validates password strength (min 8 chars, 1 uppercase, 1 number)
- Validates name is 2-100 characters
- Returns 201 Created with user object on success
- Returns 400 Bad Request with validation errors on invalid input
- Returns 409 Conflict if email already exists
- Returns 401 Unauthorized if not authenticated (admin only endpoint)
- User data stored securely (password hashed with bcrypt)
- Response time < 1000ms

Edge Cases:
- Email already exists → 409 with "Email already registered"
- Password doesn't meet requirements → 400 with specific validation errors
- Name is exactly 2 characters → accepted
- Name is exactly 100 characters → accepted
- Name is 101 characters → 400 with "Name too long"
- Email with unicode characters → accepted if valid

Errors:
- Database connection fails → 503 Service Unavailable
- Rate limit exceeded → 429 Too Many Requests
- Invalid JSON → 400 Bad Request with "Invalid JSON"
- Authentication token expired → 401 Unauthorized
```

### Infrastructure Example (Score: 8/10)

```
Story: Deploy application to staging environment

As a DevOps engineer
I can deploy the latest version to staging
So that QA can test new features

Acceptance Criteria:
- Deployment completes within 10 minutes
- All services start successfully (health checks pass)
- Application responds to requests on staging URL
- Database migrations run automatically
- Rollback procedure is documented and tested
- Deployment logs are saved and accessible
- Monitoring dashboards show staging environment metrics

Edge Cases:
- Deployment fails → rollback automatically to previous version
- Database migration fails → deployment stops, error logged
- Service fails health check → retries 3 times before failing
- Staging environment already running → gracefully replaces old version

Errors:
- Infrastructure capacity exceeded → alert DevOps team
- Permission issues with cloud provider → deployment fails with clear error
- Network connectivity issues → retry with exponential backoff
```

---

## Tips for Success

### For Product Owners

1. **Think like a tester** - Ask "How would QA verify this?"
2. **Be specific** - Avoid vague terms, use concrete measurements
3. **Cover all scenarios** - Happy path, edge cases, errors
4. **Use examples** - Include sample inputs and expected outputs
5. **Iterate** - Refine criteria based on feedback
6. **Collaborate** - Work with QA and Developers to ensure clarity

### For QA Agents

1. **Score early** - Review criteria before development starts
2. **Provide specific feedback** - Don't just say "needs improvement"
3. **Suggest improvements** - Offer concrete examples of better criteria
4. **Validate testability** - Ensure you can write test cases from the criteria
5. **Flag gaps** - Point out missing edge cases or error states

### For Developers

1. **Clarify early** - Ask questions if criteria are unclear
2. **Use criteria as checklist** - Verify each criterion is implemented
3. **Test against criteria** - Write tests that validate each acceptance criterion
4. **Flag ambiguous criteria** - Don't assume, ask for clarification

---

## Troubleshooting

**Problem**: Criteria keep getting low scores  
**Solution**: Use the template and checklist, iterate with QA feedback

**Problem**: QA finds issues not in criteria  
**Solution**: Add missing edge cases and error states to criteria

**Problem**: Developers interpret criteria differently  
**Solution**: Make criteria more specific, add examples

**Problem**: Criteria are too technical for business stakeholders  
**Solution**: Add a business-friendly summary, keep technical details separate

**Problem**: Criteria take too long to write  
**Solution**: Use templates, start with bullet points, refine over time

---

## Customization Guide

### Project-Specific Adjustments

**For Startups (Fast-Moving):**
- Focus on happy path and critical errors
- Fewer edge cases for MVP
- Score threshold: 5-6 acceptable

**For Enterprise (High Quality):**
- All edge cases must be covered
- Detailed error handling
- Score threshold: 8-9 minimum

**For Regulated Industries (Finance, Healthcare):**
- Add compliance requirements
- Add audit logging requirements
- Add security requirements
- Score threshold: 9-10

**For APIs:**
- Focus on status codes, response formats
- Add rate limiting, authentication requirements
- Include OpenAPI/Swagger documentation

**For Mobile Apps:**
- Add device-specific edge cases
- Add offline scenarios
- Add platform-specific requirements

### Adding Domain-Specific Criteria

**E-commerce:**
- Payment processing edge cases
- Cart abandonment scenarios
- Inventory management edge cases

**Healthcare:**
- HIPAA compliance requirements
- Patient data privacy requirements
- Audit trail requirements

**Finance:**
- PCI DSS compliance
- Transaction validation
- Fraud detection edge cases

---

**Last Updated**: 2026-06-04  
**Version**: 1.0  
**Applies to**: All projects
