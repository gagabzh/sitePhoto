# Refactoring Plan - Global Code Review

## 📊 Overview

**Date**: 2026-06-17  
**Branch**: `refactor/cleanup`  
**Objective**: Improve code maintainability, reduce duplication, and establish clean architecture patterns

---

## 🎯 Executive Summary

The codebase has grown organically with **64 source files** and **~115K lines of code**. While functional, it suffers from:
- **Large files** (some >2000 lines mixing concerns)
- **Code duplication** (repeated patterns across routes)
- **Tight coupling** (routes handle validation, business logic, and rendering)
- **Inconsistent patterns** (error handling, access control)

This plan addresses these issues through **phased refactoring** while maintaining backward compatibility.

---

## 📈 Codebase Statistics

### File Size Analysis
| File | Lines | Issue |
|------|-------|-------|
| `src/routes/account.js` | 1,449 | Mixes routes, logic, and views |
| `src/routes/photosViews.js` | 3,769 | HTML generation + business logic |
| `src/routes/api.js` | 2,211 | API endpoints + logic |
| `src/routes/albums.js` | 2,052 | Routes + validation + rendering |
| `src/routes/nextcloudImport.js` | 2,211 | Import logic + rendering + errors |
| `src/components.js` | 1,728 | HTML component functions |

### Duplication Metrics
- **"Access denied" responses**: 37 occurrences
- **"Access denied" checks**: 84 occurrences of `canModify()`
- **Error status responses**: 107 occurrences of `if (!... return res.status(...)`
- **Inconsistent error formats**: Mix of `.send()`, `.json()`, different message formats

---

## 🚩 Identified Issues

### 1. File Organization Issues
- **Problem**: Oversized files (>500 lines) mixing multiple concerns
- **Impact**: Hard to maintain, test, and navigate
- **Files affected**: account.js, photosViews.js, api.js, albums.js, nextcloudImport.js, components.js

### 2. Duplicated Code Patterns

#### A. Repeated Access Control
```javascript
// Found 37+ times:
if (!canModify(req.session, album)) return res.status(403).send('Access denied');
if (!canModify(req.session, photo)) return res.status(403).send('Access denied');
if (!canModify(req.session, travel)) return res.status(403).send('Access denied');
```

#### B. Repeated Error Responses
```javascript
// Found 107 times with variations:
return res.status(404).send('Album not found');
return res.status(404).json({ error: 'Album not found' });
return res.status(403).send('Access denied');
return res.status(403).json({ error: 'Access denied' });
```

#### C. Duplicate HTML Generation
- `photoThumb()` logic appears in multiple places
- Selection bar, scripts duplicated across view files
- Similar rendering patterns repeated

### 3. Code Quality Issues

#### A. Mixed Concerns
Files combine:
- Route handling
- Business logic
- HTML template generation
- Database queries
- Error handling

#### B. Inconsistent Error Handling
- Mix of JSON and HTML responses
- Different error message formats
- Inconsistent status codes for similar errors

#### C. Large Functions (from ESLint warnings)
- `account.js` line 147: 414 lines
- `account.js` line 961: 163 lines
- `internal.test.js` line 231: 201 lines
- `internal.test.js` line 674: 204 lines
- `components.js` line 69: 203 lines
- `page.js` line 13: 218 lines

### 4. Architecture Issues
- **No separation of concerns**: Routes handle too much
- **No service layer**: Database queries directly in route files
- **Tight coupling**: Routes directly import and use `db`
- **No centralized error handling**: Each route has its own try-catch

---

## ✨ Suggested Improvements

### 1. Directory Structure Restructuring
```
src/
├── controllers/        # Business logic handlers
├── services/          # Service layer
├── repositories/      # Database operations (already exists)
├── views/             # HTML generation
├── middleware/        # Enhanced middleware
├── utils/             # Shared utilities
├── validations/       # Validation schemas
└── routes/            # Clean route definitions
```

### 2. Error Handling Standardization
**Create**: `utils/errors.js`
```javascript
const errors = {
  notFound: (res, entity) => res.status(404).json({ error: `${entity} not found` }),
  accessDenied: (res) => res.status(403).json({ error: 'Access denied' }),
  validation: (res, msg) => res.status(422).json({ error: msg }),
  serverError: (res, err) => res.status(500).json({ error: 'Internal server error' })
};
module.exports = errors;
```

### 3. Access Control Middleware
**Create**: `middleware/access.js`
```javascript
function requireCanModify(entityGetter) {
  return async (req, res, next) => {
    const entity = await entityGetter(req);
    if (!entity) return errors.notFound(res, 'Entity');
    if (!canModify(req.session, entity)) return errors.accessDenied(res);
    req.entity = entity;
    next();
  };
}
```

### 4. Validation Middleware
**Create**: `middleware/validation.js`
```javascript
const Joi = require('joi');

function validate(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) return res.status(422).json({ error: error.details[0].message });
    next();
  };
}
```

---

## 🎯 Refactoring Plan

### Phase 1: Infrastructure & Standards (Week 1-2)
**Goal**: Set up foundation for clean code

| Task | ID | Priority | Estimated Hours | Description |
|------|-----|----------|-----------------|-------------|
| Create directory structure | RF-1 | High | 1 | Create controllers/, services/, views/, validations/ |
| Extract error helpers | RF-8 | High | 2 | Create utils/errors.js, replace all error responses |
| Create base controller | - | High | 2 | Base class with common methods |
| Create access control middleware | RF-9 | High | 3 | requireCanModify, requireOwner, etc. |
| Create validation middleware | RF-3 | Medium | 3 | Joi-based validation |

**Deliverables**: 
- New directory structure in place
- Error handling standardized
- Access control via middleware
- Validation schemas defined

---

### Phase 2: Extract Common Patterns (Week 2-3)
**Goal**: Reduce duplication

| Task | ID | Priority | Estimated Hours | Description |
|------|-----|----------|-----------------|-------------|
| Extract error helpers | RF-8 | High | 2 | Already in Phase 1 |
| Create access control middleware | RF-9 | High | 3 | Already in Phase 1 |
| Create validation middleware | RF-3 | Medium | 3 | Already in Phase 1 |
| Extract view components | RF-6 | Medium | 4 | Move from components.js to views/ |
| Create service layer base | RF-7 | Medium | 4 | Base service class |

**Deliverables**:
- 50% reduction in duplicated access control code
- Consistent error handling across codebase
- Reusable validation schemas
- Extracted view components

---

### Phase 3: Split Large Files (Week 3-4)
**Goal**: Improve maintainability

| Task | ID | Priority | Estimated Hours | Description |
|------|-----|----------|-----------------|-------------|
| Split account.js | RF-4 | High | 8 | → routes/account.js, controllers/account.js, views/account/ |
| Split photosViews.js | RF-5 | High | 10 | → views/photos/list.js, detail.js, edit.js, upload.js |
| Split albums.js | RF-10 | Medium | 6 | → routes/albums.js, controllers/albums.js |
| Split nextcloudImport.js | - | Medium | 5 | → routes/nextcloudImport.js, services/nextcloudImport.js |

**Deliverables**:
- All files under 500 lines
- Clear separation of concerns
- Easier to test and maintain

---

### Phase 4: Service Layer (Week 4-5)
**Goal**: Decouple business logic from routes

| Task | ID | Priority | Estimated Hours | Description |
|------|-----|----------|-----------------|-------------|
| Create service layer | RF-7 | High | 6 | PhotoService, AlbumService, UserService |
| Move business logic to services | - | High | 10 | Extract from routes to services |
| Create repository pattern | - | Medium | 4 | Formalize database layer |

**Deliverables**:
- Routes only handle HTTP concerns
- Business logic in service layer
- Database operations in repositories

---

### Phase 5: Testing & Quality (Week 5-6)
**Goal**: Ensure refactoring doesn't break functionality

| Task | ID | Priority | Estimated Hours | Description |
|------|-----|----------|-----------------|-------------|
| Add integration tests | - | Medium | 8 | Test critical paths after refactoring |
| Verify workflows | - | High | 2 | Ensure CI/CD still passes |
| Update documentation | - | Low | 4 | Update README, docs |

**Deliverables**:
- All tests passing
- All workflows passing
- Updated documentation

---

## ⚡ Quick Wins (Immediate Impact)

### 1. Extract Error Helpers (1-2 hours)
- Create `utils/errors.js`
- Replace all inline error responses
- Standardize error formats

### 2. Extract Access Control Middleware (2-3 hours)
- Create `middleware/access.js`
- Replace repetitive `canModify()` checks
- Reduce ~84 lines of duplicated code

### 3. Create Validation Schemas (3-4 hours)
- Use Joi for request validation
- Remove inline validation from routes
- Improve error messages

### 4. Split components.js (2-3 hours)
- Move each function to `views/components/`
- Import where needed
- Improve maintainability

---

## 📈 Expected Benefits

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Average file size | ~600 lines | ~200 lines | 66% reduction |
| Code duplication | High | Low | Significant |
| Maintainability | Difficult | Easy | Major |
| Testability | Hard | Easy | Major |
| Onboarding time | Long | Short | Significant |
| Bug detection | Slow | Fast | Improved |
| Lines of code | ~115K | ~115K | Same (but better organized) |

---

## 🎯 Recommended First Steps

**Start with Phase 1 - Infrastructure (Total: ~10 hours)**:

1. ✅ **Create directory structure** (1 hour)
   - `mkdir -p controllers services views validations`

2. ✅ **Extract error helpers** (2 hours)
   - Create `utils/errors.js`
   - Replace error responses in 2-3 files as proof of concept

3. ✅ **Create base middleware** (3 hours)
   - `middleware/access.js`
   - `middleware/validation.js`

4. ✅ **Split one large file** (4 hours)
   - Pick `albums.js` (2052 lines) as first candidate
   - Split into routes + controller + service

**Proof of concept complete, then scale to remaining files.**

---

## 📋 Related Stories in STATUS.md

| ID | Title | Status |
|-----|-------|--------|
| RF-1 | Create refactoring directory structure | Backlog |
| RF-2 | Extract error handling utilities and middleware | Backlog |
| RF-3 | Extract common validation schemas and middleware | Backlog |
| RF-4 | Split account.js into routes, controllers, and views | Backlog |
| RF-5 | Split photosViews.js into separate view components | Backlog |
| RF-6 | Extract view components from components.js | Backlog |
| RF-7 | Create service layer for business logic | Backlog |
| RF-8 | Standardize error response formats across all routes | Backlog |
| RF-9 | Create access control middleware (requireCanModify) | Backlog |
| RF-10 | Split albums.js into routes, controllers, repositories | Backlog |

---

## 🔗 References

- [Joi Validation Library](https://joi.dev/)
- [Express Middleware Patterns](https://expressjs.com/en/guide/using-middleware.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Document created**: 2026-06-17  
**Last updated**: 2026-06-17  
**Author**: Mistral Vibe (Code Review Analysis)