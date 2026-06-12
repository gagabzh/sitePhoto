# Comment Lancer les Tests du QA Agent

## 🎯 Le Problème
`npm run test` lance tous les tests de votre projet. Vous voulez lancer **seulement** les tests du QA Agent.

---

## ✅ Solutions (du plus simple au plus complexe)

### Solution 1: Lancer Directement avec Vitest (Plus Simple)

**Si vous utilisez Vitest** (ce que nous supposons) :

```bash
# Lancer seulement qa-agent.test.ts
npx vitest run qa-agent.test.ts

# Ou avec pattern matching
npx vitest run --include "**/qa-agent.test.ts"

# En mode watch (relance à chaque changement)
npx vitest watch qa-agent.test.ts
```

**Résultat attendu** :
```
✓ src/qa-agent.test.ts (40+ tests)
  ✓ QA Agent - Core Responsibilities
    ✓ Test Plan Creation (3 tests)
    ✓ Regression Testing Strategy (4 tests)
    ✓ Acceptance Criteria Validation (3 tests)
    ✓ Bug Reporting & Triage (4 tests)
    ✓ Escalation Decision Making (5 tests)
    ✓ End-to-End QA Workflow (2 tests)

Test Files  1 passed (1)
Tests  40 passed (40)
```

---

### Solution 2: Via npm scripts (Meilleure Pratique)

**Ajoutez cette ligne à votre `package.json`** :

```json
{
  "scripts": {
    "test": "vitest run",
    "test:qa-agent": "vitest run qa-agent.test.ts",
    "test:qa-agent:watch": "vitest watch qa-agent.test.ts",
    "test:exclude-qa": "vitest run --exclude '**/qa-agent.test.ts'",
    "test:all": "vitest run"
  }
}
```

**Puis lancez** :
```bash
# Lancer uniquement QA Agent
npm run test:qa-agent

# Lancer QA Agent en mode watch (dev)
npm run test:qa-agent:watch

# Lancer tous les autres tests (SANS QA Agent)
npm run test:exclude-qa

# Lancer tous les tests
npm run test:all
```

---

### Solution 3: Configuration Vitest (Pour Projets Complexes)

Si vous avez plusieurs suites de tests et que vous voulez mieux les organiser, créez **`vitest.config.ts`** à la racine :

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Par défaut: inclure tous les .test.ts
    include: ['**/*.test.ts'],
    
    // Mais vous pouvez créer des workspaces
    workspace: [
      {
        // Suite 1: Tests du QA Agent
        extends: true,
        test: {
          name: 'qa-agent',
          include: ['**/qa-agent.test.ts'],
          globals: true,
        },
      },
      {
        // Suite 2: Tests de votre application
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.test.ts', '!**/qa-agent.test.ts'],
          globals: true,
        },
      },
    ],
  },
});
```

**Puis lancez** :
```bash
# Seulement QA Agent
npx vitest run --run qa-agent

# Seulement app
npx vitest run --run app

# Tous
npx vitest run
```

---

### Solution 4: Fichier de Test Séparé (Isolation Totale)

Si vous voulez vraiment séparer, créez une structure comme ceci :

```
your-project/
├── src/
│   ├── components/
│   ├── utils/
│   └── app.test.ts          (vos tests app)
├── tests/
│   ├── qa-agent/
│   │   └── qa-agent.test.ts (tests QA Agent)
│   └── integration/
├── vitest.config.ts
└── package.json
```

**Dans `vitest.config.ts`** :
```typescript
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
```

**Lancez** :
```bash
# Tous les tests du QA Agent (dans tests/qa-agent/)
npx vitest run tests/qa-agent/

# Tous les tests app (dans src/)
npx vitest run src/

# Tous
npx vitest run
```

---

## 🎯 Mon Recommendation

### Pour la Plupart des Projets (Simple)

**Étape 1**: Placez `qa-agent.test.ts` dans votre dossier `tests/` ou `__tests__/` :

```bash
mkdir -p tests/agents
mv qa-agent.test.ts tests/agents/
```

**Étape 2**: Ajoutez au `package.json` :

```json
{
  "scripts": {
    "test": "vitest run src/ --exclude 'tests/'",
    "test:qa": "vitest run tests/agents/qa-agent.test.ts",
    "test:all": "vitest run"
  }
}
```

**Étape 3**: Utilisez :

```bash
# Tests normaux (app seulement)
npm test

# Tests QA Agent
npm run test:qa

# Tous les tests
npm run test:all
```

---

## 🔍 Vérifications

### Vérifier que Vitest est Installé

```bash
npm list vitest
```

Si absent :
```bash
npm install --save-dev vitest
```

### Vérifier la Version

```bash
npx vitest --version
```

Doit être 0.34+. Si plus ancien, mettez à jour :
```bash
npm update vitest
```

### Vérifier la Config

Vitest cherche automatiquement (dans cet ordre) :
1. `vitest.config.ts`
2. `vitest.config.js`
3. `vite.config.ts`
4. Configuration dans `package.json` sous `vitest:`

Si `vitest.config.ts` n'existe pas, Vitest utilise les defaults.

---

## ⚡ Commandes Rapides (Copier-Coller)

### Si vous n'avez rien configuré (quickstart)

```bash
# 1. Copier le fichier de test
cp qa-agent.test.ts tests/

# 2. Lancer directement
npx vitest run tests/qa-agent.test.ts

# Ou avec pattern
npx vitest run --include "**/qa-agent.test.ts"
```

### Si vous avez `vitest.config.ts`

```bash
npx vitest run qa-agent
# ou
npx vitest run --reporter=verbose qa-agent
```

### Si vous utilisez des workspaces

```bash
npx vitest run --project qa-agent
```

---

## 📊 Options Utiles

### Avec Rapport Détaillé

```bash
npx vitest run qa-agent.test.ts --reporter=verbose
```

### Avec Couverture de Code

```bash
npx vitest run qa-agent.test.ts --coverage
```

### Avec Output JSON (pour CI/CD)

```bash
npx vitest run qa-agent.test.ts --reporter=json > qa-results.json
```

### En Mode Watch (dev)

```bash
npx vitest watch qa-agent.test.ts
# Relance les tests à chaque changement
# Appuyez sur 'q' pour quitter
```

### Lancer un Test Spécifique

```bash
# Lancer seulement "Test Plan Creation"
npx vitest run qa-agent.test.ts -t "Test Plan Creation"

# Lancer tous les tests avec "should" dans le nom
npx vitest run qa-agent.test.ts -t "should"
```

---

## 🛠️ Troubleshooting

### Erreur: "Module not found: vitest"

```bash
npm install --save-dev vitest @vitest/ui
```

### Erreur: "Cannot find config file"

Créez `vitest.config.ts` à la racine :
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
  },
});
```

### Erreur: "Test file not found"

Vérifiez le chemin :
```bash
# Voir où le fichier est
find . -name "qa-agent.test.ts"

# Lancer avec chemin complet
npx vitest run ./tests/qa-agent.test.ts
```

### Tests trouvent d'autres tests

Utilisez `exclude` :
```bash
npx vitest run qa-agent.test.ts --exclude "src/**/*.test.ts"
```

---

## 📋 Setup Final Recommandé

### 1. Créez le dossier `tests/`

```bash
mkdir -p tests/agents
```

### 2. Copiez le fichier

```bash
cp qa-agent.test.ts tests/agents/
```

### 3. Mettez à jour `package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:qa": "vitest run tests/agents/qa-agent.test.ts",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 4. Mettez à jour `vitest.config.ts` (si existe)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
});
```

### 5. Lancez les tests

```bash
# QA Agent seulement
npm run test:qa

# Tous les tests
npm test

# En mode watch
npm run test:watch
```

---

## ✅ Vérification Finale

Après avoir lancé `npm run test:qa`, vous devriez voir :

```
✓ tests/agents/qa-agent.test.ts (40)
  ✓ QA Agent - Core Responsibilities (40)
    ✓ Test Plan Creation
      ✓ should create a test plan for a valid PR
      ✓ should throw error if acceptance criteria is missing
      ✓ should initialize test plan with empty scenarios
    ✓ Regression Testing Strategy
      ✓ should identify regression areas for auth changes
      ✓ should identify regression areas for API changes
      ✓ should identify regression areas for database changes
      ✓ should remove duplicate regression areas
    [... etc, 40 au total ...]

Test Files  1 passed (1)
Tests  40 passed (40)
Duration  234ms
```

Si vous voyez ça = ✅ Succès !

---

## 💡 Pro Tips

**Tip 1**: Créez un alias shell pour lancer rapidement

```bash
# Dans votre ~/.bashrc ou ~/.zshrc
alias test-qa="npx vitest run tests/agents/qa-agent.test.ts"

# Puis lancez simplement
test-qa
```

**Tip 2**: Intégrez à votre CI/CD

```yaml
# GitHub Actions exemple
- name: Test QA Agent
  run: npm run test:qa
  
- name: Test App
  run: npm test
```

**Tip 3**: Lancez avant commit (git hook)

```bash
# Installez husky
npm install husky --save-dev
npx husky install

# Créez un hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
npm run test:qa || exit 1
EOF

chmod +x .husky/pre-commit
```

---

## Questions Fréquentes

**Q: Mon vitest.config.ts change rien ?**
A: Redémarrez votre terminal ou IDE. Vitest cache la config.

**Q: Je veux lancer les 2 suites (app + QA) mais séparément ?**
A: Utiliser les workspaces (Solution 3 ci-dessus).

**Q: Comment déboguer un test qui échoue ?**
A: Ajoutez `--inspect-brk` :
```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs run tests/agents/qa-agent.test.ts
```

**Q: Je veux un rapport HTML des tests ?**
A: 
```bash
npm install --save-dev @vitest/ui
npx vitest --ui
```

---

## Tl;dr (Juste Donne-moi la Commande)

```bash
# Setup une seule fois
mkdir -p tests/agents
mv qa-agent.test.ts tests/agents/

# Puis chaque fois que vous voulez tester
npx vitest run tests/agents/qa-agent.test.ts

# Ou si vous avez configuré package.json (recommandé)
npm run test:qa
```

C'est tout ! 🚀

