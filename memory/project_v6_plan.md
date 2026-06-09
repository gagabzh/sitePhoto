---
name: project-v6-plan
description: V6 implementation plan — Focus on user experience improvements and AI features
metadata:
  type: project
  created: 2026-06-08
  status: planning
---

# V6 — Plan

## Statut global : 🟡 Planification (2026-06-08)

---

## Backlog

| ID | User Story | Priority | Status | Notes |
|---|---|---|---|---|
| US-1 | Rework tagging people workflow | High | 📋 Backlog | Improve manual face tagging UX |
| US-2 | | Medium | | |
| US-3 | | Medium | | |

---

## User Stories

### US-1 — Rework tagging people workflow

**As a** user
**I want to** have a more intuitive way to tag people in photos
**So that** I can quickly identify and catalog people in my collection

#### Acceptance Criteria
- [ ] Simplified tagging interface (drag/drop or click to select)
- [ ] Clear visual feedback during tagging
- [ ] Ability to cancel/reset tagging easily
- [ ] Mobile-friendly tagging experience
- [ ] Tag suggestions based on previously tagged faces

#### Technical Notes
- Current implementation uses bounding box drawing with mouse events
- Needs better UX for touch devices
- Consider using face detection to auto-suggest bounding boxes

#### Tasks
- [ ] Redesign tagging UI/UX
- [ ] Implement face detection auto-suggest
- [ ] Add keyboard shortcuts for tagging
- [ ] Improve mobile support
- [ ] Add tagging tutorial/tooltips

---

## Tracks

| Track | Sujet | Complexité | Priorité |
|---|---|---|---|
| UX-1 | Tagging people rework | High | High |
| AI-1 | Face detection improvements | Medium | High |
| FE-1 | Mobile responsiveness | Medium | Medium |

---

## Version History

- **v4**: Initial infrastructure and AI features
- **v5**: Nextcloud integration, Instance-1 downsize, AI learning
- **v6**: User experience improvements, tagging workflow rework
