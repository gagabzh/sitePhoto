# Skill: Acceptance Criteria Quality Scorer

**Used by**: Product Owner, QA Agent  
**Purpose**: Evaluate if criteria are testable (0-10 score)  
**File**: SKILL-LIBRARY/4-acceptance-criteria-scorer.skill.md

---

## Overview

This skill ensures:
- ✅ Acceptance criteria are testable
- ✅ No subjective language
- ✅ Edge cases identified
- ✅ QA knows exactly what to test

---

## Scoring Rubric

### Specificity (0-3 points)

- 3: Action is specific ("click upload button", "enter email", "drag photo")
- 2: Action is somewhat specific ("upload a photo")
- 1: Action is vague ("manage photos", "handle uploads")
- 0: Action is completely vague ("implement photo handling")

### No Vague Language (0-2 points)

- 2: No subjective words (feels, looks, smooth, fast, elegant)
- 1: Mostly concrete, maybe one subjective term
- 0: Lots of subjective language

### Edge Cases Covered (0-3 points)

- 3: At least 3 edge cases listed (empty, 1, max, invalid, boundary)
- 2: 2 edge cases covered
- 1: 1 edge case mentioned
- 0: No edge cases

### Error States Clear (0-2 points)

- 2: All error states defined (network, timeout, permission, invalid)
- 1: Some error states mentioned
- 0: No error handling mentioned

---

## Total Score

- **9-10**: Ready to develop immediately (no revisions)
- **7-8**: Good, minor gaps (can start, may revise quickly)
- **5-6**: Testable but has gaps (needs revision before testing)
- **3-4**: Major gaps (rewrite needed)
- **0-2**: Not testable (start from scratch)

---

## Example: Good Criteria (Score: 9/10)

```
Story: US-A5 — Paginate album photos

As a viewer, I can scroll through album photos one page at a time

Acceptance Criteria:
- Each page shows 20 photos
- Clicking Next loads next 20 photos
- Previous button disabled on page 1
- Next button disabled on last page
- Empty album shows "No photos" message
- Each page loads < 500ms; show loading spinner if slower
- Mobile: Tab targets 48×48px minimum
- User sees only photos from albums shared with them

Edge Cases:
- Album with 0 photos → "No photos" message
- Album with 1 photo → No Next button
- Album with 20 photos → Exactly 1 page
- Album with 21 photos → 2 pages, second has 1 photo
- Album with 1000 photos → Performance acceptable

Errors:
- Network timeout → "Couldn't load photos. Retry?" button
- Permission denied → "You don't have access" message
- Invalid album ID → "Album not found" message
```

Score breakdown:
- Specificity: 3/3 ✅
- Language: 2/2 ✅
- Edge cases: 3/3 ✅
- Errors: 1/2 (could be more detailed)
**Total: 9/10 - Ready to develop!**

---

## Example: Poor Criteria (Score: 4/10)

```
Story: US-A5 — Better album browsing

As a user, I can browse photos efficiently

Acceptance Criteria:
- Album browsing feels smooth
- Photos load quickly
- Looks good on mobile
```

Score breakdown:
- Specificity: 0/3 (vague: "browse", "feel smooth", "quickly")
- Language: 0/2 (subjective: "feels smooth", "quickly", "looks good")
- Edge cases: 0/3 (no edge cases mentioned)
- Errors: 1/2 (no error handling)
**Total: 1/10 - Needs complete rewrite!**

---

## How to Use

### When Reviewing Criteria

1. Score each dimension
2. Calculate total (0-10)
3. If >= 7: Testable, approved
4. If < 7: Request revisions

### Example Feedback

```
Criteria Score: 6/10

Breakdown:
- Specificity: 2/3 (action could be more specific)
- No vague language: 2/2 ✅
- Edge cases: 1/3 (missing empty album, max size)
- Error states: 1/2 (missing timeout scenario)

Feedback:
Add edge cases for empty album and max size limit.
Define timeout error handling.
Then resubmit.
```

### When Writing Criteria

- Use specific actions (click, enter, drag, not "manage")
- Avoid subjective words (fast, smooth, elegant)
- List at least 3 edge cases (empty, 1, max)
- Define error states (what happens if network fails?)
- Aim for score >= 7

---

## Tips

- **Be specific**: "Click upload button" not "upload photos"
- **Avoid subjectivity**: "< 500ms load time" not "fast"
- **Identify edges**: What happens at boundaries? (empty, 1, max)
- **Define errors**: What if network fails? Permission denied?
- **Test-friendly**: Can QA validate this objectively?

---

## Checklist Before Finalizing

- [ ] Action is specific, not vague
- [ ] No subjective language (feels, looks, smooth, fast)
- [ ] At least 3 edge cases identified
- [ ] Error states defined
- [ ] Score >= 7
- [ ] QA can test this objectively

If all checked ✅, criteria are ready!

