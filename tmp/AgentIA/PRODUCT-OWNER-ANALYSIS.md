# Analyse du Product Owner Agent + Recommandations

## 📋 Vue d'Ensemble Actuelle

Votre agent PO est **très bon** : bien structuré, précis, avec des règles claires de nommage et de format. C'est un fondement solide.

**Points Forts** ⭐:
- Format de story très précis (CODE-N, As a [role], action, so [value])
- Nommage cohérent et prévisible (DS-, US-P, ALB-, etc.)
- Structure de sections claire (Design System, User Management, Photos, etc.)
- Règles strictes pour rejeter les mauvaises stories
- Acceptance criteria bien définies

**Points À Améliorer** ⚠️:
1. **Pas de communication avec les autres agents** (PO → Planner, PO → Developer, etc.)
2. **Pas de validation avant story** (Avant d'écrire une story, vérifier avec QA ce qui est testable)
3. **Pas de framework d'acceptation criteria** unifié (chaîné avec QA)
4. **Pas de gestion des blockers** (Quand une story est bloquée, comment l'escalader ?)
5. **Pas de priorité/urgence** (Comment distinguer urgent vs important ?)

---

## 🔄 Interaction Avec le QA Agent

Le problème principal : **PO écrit des stories sans penser à la testabilité**.

### Exemple de Conflit Actuel

```
PO écrit:
"US-V5 — Browse photos in album
As a viewer, I can scroll through an album's photos, 
so I can see the collection."

QA teste et se pose:
- Que signifie "scroll" ? Pagination ou scroll infini ?
- Que se passe si l'album a 0 photos ?
- Que se passe si c'est 10 000 photos ?
- Comment ça se charge ? En parallèle ? Séquentiellement ?
- L'ordre est-il maintenu ?

Résultat: QA ne peut pas valider sans plus de détail.
PO dit: "C'est évident!" 
Developer est confus.
PR est rejetée.
```

### La Solution: Checklist de Testabilité

Chaque story doit passer une **checklist de testabilité AVANT** d'être finalisée.

---

## 🎯 Version Améliorée du Product Owner Agent

Voici les changements recommandés (avec justification) :

### 1. Ajouter une Section "Acceptance Criteria Framework"

```markdown
## Acceptance Criteria Style (Updated)

**REQUIS** for all stories:
- [ ] User action is testable (not "feels smooth")
- [ ] Edge cases are covered (0 items, 1 item, 1000 items)
- [ ] Error states are defined (network down, invalid input, permission denied)
- [ ] Performance is scoped (if relevant: max load time, max items shown)
- [ ] Accessibility is considered (keyboard nav, screen reader)
- [ ] Mobile behavior is defined (if different from desktop)

If any checkbox is unchecked, the story is incomplete. Revise or escalate.

### Example: Stories that PASS the checklist

**US-V5 — Browse photos in album (IMPROVED)**
As a viewer, I can scroll through an album's photos one page at a time, 
so I can see the collection without loading everything at once.

- Each page shows 20 photos, with Previous/Next buttons
- Clicking Next loads the next 20 photos, preserving scroll position
- If viewing the last page, Next button is disabled
- If album is empty, show "No photos in this album"
- Load time for each page < 500ms (or show spinner)
- On mobile, use swipe left/right OR buttons (keep both for accessibility)
- Keyboard nav: Tab through buttons, Enter to navigate

### Example: Stories that FAIL the checklist

❌ "Browse photos efficiently" — not testable, not specific
❌ "Smooth photo browsing" — vague ("smooth" is subjective)
❌ "Support 1M photos" — missing acceptance criteria for how
```

### 2. Ajouter une Section "Coordination with QA"

```markdown
## QA Coordination Checklist

Before finalizing a story, ask the QA Agent:

**For Complex Features** (multistep flows, state management, edge cases):
- QA Agent: "Can you test this? What edge cases should I cover?"
- PO: Revise story based on QA feedback
- QA Agent: Signs off story is testable

**For Ambiguous Criteria** (performance, "feels right", subjective UX):
- PO: "What would make this testable?"
- QA Agent: "You need: max load time, specific animation duration, pixel-perfect comparison"
- PO: Adds concrete criteria

**For Security/Privacy Stories** (auth, data access, sharing):
- PO: Stories clearly state who can do what and who cannot
- QA Agent: Verifies blockers are explicit
- Tech Lead Reviewer: Reviews security implication

**Workflow**:
1. PO writes draft story
2. PO asks QA: "Is this testable?"
3. QA provides feedback (often just clarity, not rejection)
4. PO revises story
5. QA approves: "Ready for development"
6. Story is finalized
```

### 3. Ajouter une Section "What QA Needs From PO"

```markdown
## What QA Agent Needs From Every Story

When writing a story, ensure you've answered these questions:
(These make QA's job much easier)

**Scope**:
- [ ] Who does this? (viewer/editor/admin)
- [ ] What exactly do they do? (Be specific: "click button" not "interact")
- [ ] When/where can they do this? (From album page? From photo view?)
- [ ] What's the value? (Why does this matter?)

**Constraints**:
- [ ] Data limit: How many items max? (10? 1000? Unlimited?)
- [ ] Performance: Does speed matter? (If yes, specify: < 100ms, < 2s, etc.)
- [ ] Access: Who can/cannot see this? (Public? Private to editor? Only owner?)
- [ ] Edge cases: What if data is missing/invalid/empty?

**Implementation Notes**:
- [ ] If there's a NOT obvious approach, explain the constraint
  (Example: "Must use API, not local compute, because [reason]")
- [ ] If this touches auth/data access, explicitly call out the security check
  (Example: "Viewer can only export their own albums, not others'")

**Example of a Well-Formed Story for QA**:

US-A8 — Export album as PDF

As an editor, I can export an album as a PDF file (all photos + captions),
so I can print it or share it offline.

> Implementation constraint: PDFs must be generated server-side (not in browser)
> because file sizes can exceed 100MB for large albums.

- PDF includes: all photos in album order, plus captions below each
- Max album size: 1000 photos (larger albums must be split)
- Max file size: 500MB (return error if exceeded)
- Naming: [album-name]-[date].pdf
- Download works on desktop and mobile
- If album has 0 photos, show "Cannot export empty album"
- Slow generation (> 10s) should show progress indicator
- User can only export albums they have edit access to (not view-only)

^ QA can test all of this. No ambiguity.
```

### 4. Ajouter une Section "Escalation & Blockers"

```markdown
## Blockers & Escalation

When writing a story, identify blockers UPFRONT:

**Tech Blockers** (feature can't be built without resolving first):
- [ ] Pending API change? → Escalate to Tech Lead
- [ ] DB schema migration needed? → Escalate to DevOps
- [ ] Third-party service not ready? → Escalate to DevOps
- [ ] Example: "US-NC6 blocked by Nextcloud v25 API (not available yet)"

**Product Blockers** (feature conflicts with another feature or priority):
- [ ] Conflicts with another feature? → Note in story, defer decision
- [ ] Depends on another story? → Link it (US-A4 must ship before US-A8)
- [ ] Priority conflict? → Escalate to team for decision
- [ ] Example: "US-GPS4 blocked by decision: map tiles provider (Google vs. Mapbox)"

**QA Blockers** (feature is hard to test, might need special setup):
- [ ] Requires external service (Nextcloud, S3, etc.)? → Note for QA environment
- [ ] Hard to trigger edge case? → Provide test data or reproduction steps
- [ ] Example: "AI-5 requires: manually labeled training set (100+ faces) for testing"

**Format in Story**:
```
**CODE-N — Title**
[Story text]

> Blocker: [Type] — [Description]
> → Escalate to [Team/Role]
> → Resolve by [Date/Condition]
```

**Example**:
```
**US-NC6 — Import entire Nextcloud folder**
As an editor, I can select a Nextcloud folder and import all photos inside recursively,
so I can quickly onboard years of family photos.

> Blocker: Tech — Requires Nextcloud v25+ API support for bulk operations
> → Escalate to DevOps (coordinate with Nextcloud upgrade)
> → Resolve by: Q2 2024 (when NC v25 is stable)

> QA Setup: Need test Nextcloud instance with 1000+ test photos
> → Handled by: QA Agent (mock Nextcloud or use staging instance)
```
```

---

## 📝 Version Modifiée Complète

Voici le **agent Product Owner amélioré**, prêt à travailler avec le QA Agent :
