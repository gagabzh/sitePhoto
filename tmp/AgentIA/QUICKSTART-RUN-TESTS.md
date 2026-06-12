# 🚀 Lancer les Tests du QA Agent - Quickstart (5 minutes)

## Le Problème
Vous avez le fichier `qa-agent.test.ts` mais quand vous lancez `npm test`, ça lance tous les tests de votre projet.

## La Solution
Suivez ces 4 étapes simples.

---

## ✅ Étape 1: Préparer le Dossier (1 min)

```bash
# Créer un dossier pour les tests des agents
mkdir -p tests/agents

# Copier le fichier de test
cp qa-agent.test.ts tests/agents/
```

**Vérifier** :
```bash
ls tests/agents/qa-agent.test.ts
# Devrait afficher: tests/agents/qa-agent.test.ts
```

---

## ✅ Étape 2: Configurer les Scripts npm (2 min)

**Ouvrir** `package.json` à la racine de votre projet.

**Trouver** la section `"scripts"` :
```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "vitest run"  // <- Vous devez voir quelque chose comme ça
  }
}
```

**Ajouter** ces deux lignes **dans** `"scripts"` :
```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "vitest run",
    "test:qa": "vitest run tests/agents/qa-agent.test.ts",
    "test:qa:watch": "vitest watch tests/agents/qa-agent.test.ts"
  }
}
```

**Sauvegarder** le fichier.

---

## ✅ Étape 3: Vérifier que Vitest Est Installé (1 min)

```bash
# Vérifier
npm list vitest

# Si absent (produit une erreur), installer:
npm install --save-dev vitest
```

---

## ✅ Étape 4: Lancer les Tests (1 min)

```bash
# Lancer SEULEMENT les tests du QA Agent
npm run test:qa
```

**Résultat attendu** :
```
✓ tests/agents/qa-agent.test.ts (40)

Test Files  1 passed (1)
Tests  40 passed (40)
Duration  234ms
```

Si vous voyez ça = **✅ Succès !**

---

## 🎯 Commandes Désormais Disponibles

```bash
# Lancer seulement le QA Agent
npm run test:qa

# Lancer le QA Agent en mode watch (relance à chaque changement)
npm run test:qa:watch

# Lancer tous les autres tests (SANS QA Agent)
npm test

# Lancer TOUS les tests (app + QA Agent)
npm run test:qa && npm test
```

---

## ⚡ Ça N'a Pas Marché ? Troubleshooting

### Erreur: "npm ERR! Missing script: test:qa"

→ Vous n'avez pas bien ajouté le script à `package.json`
→ Vérifiez que vous avez une virgule après la ligne précédente
→ Exemple correct:
```json
"test": "vitest run",
"test:qa": "vitest run tests/agents/qa-agent.test.ts"
```

### Erreur: "Cannot find module: vitest"

→ Vitest n'est pas installé
→ Lancez: `npm install --save-dev vitest`

### Erreur: "ENOENT: no such file or directory, open 'tests/agents/qa-agent.test.ts'"

→ Le fichier n'est pas au bon endroit
→ Vérifiez: `ls tests/agents/qa-agent.test.ts`
→ Si absent, lancez: `cp qa-agent.test.ts tests/agents/`

### Les tests du QA Agent s'exécutent mais aussi mes autres tests

→ Utilisez plutôt:
```bash
npx vitest run tests/agents/qa-agent.test.ts
```
au lieu de `npm run test:qa`

---

## 📊 C'est Quoi 40 Tests ?

Les 40 tests du QA Agent vérifient:

```
✓ Test Plan Creation (3 tests)
  ✓ Crée un plan de test valide
  ✓ Rejette si critères d'acceptation manquants
  ✓ Initialise le plan correctement

✓ Regression Testing Strategy (4 tests)
  ✓ Identifie les régions affectées par les changements auth
  ✓ Identifie les régions affectées par les changements API
  ✓ Identifie les régions affectées par les changements DB
  ✓ Supprime les doublons

✓ Acceptance Criteria Validation (3 tests)
  ✓ Valide tous les critères comme réussis
  ✓ Rapporte les critères non atteints
  ✓ Suit le statut de chaque critère

✓ Bug Reporting & Triage (4 tests)
  ✓ Crée un rapport de bug avec la bonne structure
  ✓ Assigne la priorité correcte selon la sévérité
  ✓ Suit tous les bugs trouvés
  ✓ Efface les bugs entre les exécutions

✓ Escalation Decision Making (5 tests)
  ✓ Escalade quand les critères manquent
  ✓ Escalade quand il n'y a pas assez de tests
  ✓ Escalade les changements sensibles à la sécurité
  ✓ N'escalade pas pour les features standards

✓ End-to-End QA Workflow (2 tests)
  ✓ Gère le workflow complet
  ✓ Fournit un statut clair pour l'équipe
```

**Si tous les tests passent (40/40)** = L'agent QA fonctionne correctement ✅

---

## 🎉 Prochaines Étapes

Maintenant que les tests passent:

1. **Lisez** le guide d'intégration (`qa-agent-integration-guide.md`)
2. **Testez** l'agent sur 1-2 vraies PRs
3. **Validez** avec le plan de test humain (6 scénarios, 2-3h)
4. **Déployez** dans votre workflow

---

## ✨ Tips Pro

### Créer un Alias Rapide

```bash
# Ajouter à ~/.bashrc ou ~/.zshrc
alias test-qa="npm run test:qa"

# Puis lancez simplement
test-qa
```

### Lancer avec Rapport HTML

```bash
npm run test:qa -- --reporter=html
# Ouvre un rapport HTML dans le navigateur
```

### Lancer Un Test Spécifique

```bash
npm run test:qa -- -t "should create a test plan"
```

### Lancer en Mode Debug

```bash
npm run test:qa -- --reporter=verbose
```

---

## 📞 Questions Fréquentes

**Q: Ça va lancer les tests de mon app aussi ?**
A: Non, seulement `tests/agents/qa-agent.test.ts`. Les autres restent intacts.

**Q: Ça va modifier mes fichiers ?**
A: Non. Ça seulement copie et exécute. Aucune modification.

**Q: Combien de temps ça prend ?**
A: ~30 secondes pour les 40 tests.

**Q: Comment faire passer CI/CD ?**
A: Ajoutez à votre pipeline:
```bash
npm run test:qa
```
Ça doit passer avant merge.

---

## ✅ Checklist Finale

- [ ] Dossier `tests/agents/` créé
- [ ] Fichier `qa-agent.test.ts` copié dedans
- [ ] `package.json` a les scripts `test:qa` et `test:qa:watch`
- [ ] `npm run test:qa` affiche 40 tests réussis
- [ ] Les autres tests continuent de fonctionner normalement

**Si tout est coché = Prêt à avancer ! 🚀**

