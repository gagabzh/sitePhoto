// package.json - Scripts à Ajouter
// 
// Copiez les scripts ci-dessous dans votre "scripts" existant
// NE REMPLACEZ PAS le fichier package.json entier
// 
// Format JSON exemple:
// {
//   "name": "your-project",
//   "version": "1.0.0",
//   "scripts": {
//     ...vos scripts existants...
//     ...ajoutez ceux-ci...
//   }
// }

{
  "scripts": {
    // ==================================================================
    // Tests QA Agent
    // ==================================================================
    
    // Lancer uniquement les tests du QA Agent
    "test:qa": "vitest run tests/agents/qa-agent.test.ts",
    
    // Mode watch pour le développement (relance à chaque changement)
    "test:qa:watch": "vitest watch tests/agents/qa-agent.test.ts",
    
    // QA Agent avec rapport détaillé
    "test:qa:verbose": "vitest run tests/agents/qa-agent.test.ts --reporter=verbose",
    
    // QA Agent avec couverture de code
    "test:qa:coverage": "vitest run tests/agents/qa-agent.test.ts --coverage",
    
    // ==================================================================
    // Tests App (sans QA Agent)
    // ==================================================================
    
    // Lancer tous les tests SAUF QA Agent
    "test:app": "vitest run --exclude 'tests/agents/**'",
    
    // Tous les tests app en watch mode
    "test:app:watch": "vitest watch --exclude 'tests/agents/**'",
    
    // ==================================================================
    // Tests Tous (App + QA Agent)
    // ==================================================================
    
    // Lancer tous les tests (app + QA Agent)
    "test": "vitest run",
    
    // Tous les tests en watch mode
    "test:watch": "vitest watch",
    
    // Tous les tests avec couverture
    "test:coverage": "vitest run --coverage",
    
    // ==================================================================
    // CI/CD (Intégration Continue)
    // ==================================================================
    
    // Pour CI: Lancer d'abord QA Agent, puis app
    "test:ci": "npm run test:qa && npm run test:app",
    
    // Pour CI: Tous les tests avec rapport JSON
    "test:ci:json": "vitest run --reporter=json > test-results.json"
  }
}

// ==================================================================
// Comment Utiliser
// ==================================================================

/*
1. COPIER LES SCRIPTS
   - Ouvrez votre package.json
   - Allez à la section "scripts"
   - Copiez les scripts ci-dessus qui vous intéressent
   - Sauvegardez

2. CRÉER LE DOSSIER TESTS
   $ mkdir -p tests/agents

3. COPIER LE FICHIER DE TEST
   $ cp qa-agent.test.ts tests/agents/

4. LANCER LES TESTS

   # Seulement QA Agent
   $ npm run test:qa

   # Seulement app (sans QA)
   $ npm run test:app

   # App + QA Agent
   $ npm test

   # QA Agent en mode watch (dev)
   $ npm run test:qa:watch

   # Avec couverture de code
   $ npm run test:coverage

   # Pour CI/CD
   $ npm run test:ci

5. VÉRIFIER LES RÉSULTATS
   Devriez voir:
   
   ✓ tests/agents/qa-agent.test.ts (40)
     ✓ QA Agent - Core Responsibilities
       ✓ Test Plan Creation (3)
       ✓ Regression Testing Strategy (4)
       ✓ Acceptance Criteria Validation (3)
       ✓ Bug Reporting & Triage (4)
       ✓ Escalation Decision Making (5)
       ✓ End-to-End QA Workflow (2)
   
   Test Files  1 passed (1)
   Tests  40 passed (40)
*/

// ==================================================================
// Détails des Scripts
// ==================================================================

/*
test:qa
- Lance seulement les tests du QA Agent
- Prend ~30 secondes
- Utile pour vérifier que l'agent fonctionne

test:qa:watch
- Lance les tests du QA Agent
- Relance automatiquement à chaque changement
- Appuyez sur 'q' pour quitter
- Parfait pour le développement

test:qa:coverage
- Lance les tests du QA Agent
- Montre la couverture de code (% de code testé)
- Génère un rapport HTML

test:app
- Lance seulement vos tests app
- Exclut les tests du QA Agent
- Utile pour ne pas polluer vos résultats

test
- Lance TOUS les tests (app + QA Agent)
- C'est le script par défaut de npm

test:watch
- Tous les tests en mode watch
- Parfait pour le développement

test:ci
- Pour les pipelines CI/CD
- Lance d'abord QA Agent, puis app
- Échoue si l'un ou l'autre échoue

test:ci:json
- Pour CI/CD
- Exporte les résultats en JSON
- Utile pour parser les résultats dans un pipeline
*/

// ==================================================================
// Configuration Alternative (Si vous avez des dossiers différents)
// ==================================================================

/*
Si vos tests sont structurés différemment:

test:qa: "vitest run src/agents/qa-agent.test.ts"
test:qa: "vitest run __tests__/qa-agent.test.ts"
test:qa: "vitest run qa-agent.test.ts"

Ajustez le chemin selon votre structure.
*/
