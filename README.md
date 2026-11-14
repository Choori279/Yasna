# Yasna

Outil d'analyse et de nettoyage intelligent de bases de données pour les administrations publiques (cas d'usage prioritaire : aides sociales).

## Documentation

- [Document Projet v1.3](Yasna_Document_Projet_v1.3.md) — vision, parcours en 8 phases, sécurité/conformité (CNIL/ANSSI/DINUM), stack, roadmap
- [Spécification détaillée du PoC v1.2](Yasna_PoC_Specification_Detaillee.md) — périmètre, phases, critères de succès chiffrés
- [Schémas du parcours v1.1](Yasna_Schemas_Parcours.md) — acteurs, lieux (PC / serveur / IA / BDD), flux et machine à états en diagrammes Mermaid
- [Références techniques & base saine v1.1](Yasna_References_Techniques.md) — guidances ANSSI / OWASP / CNIL à suivre pendant le développement + checklist de démarrage

## Principes clés

- **API externe configurable par défaut** (fournisseur souverain), mode local **optionnel** : couche fournisseur LLM interchangeable via variables d'environnement (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_PROVIDER_SECNUMCLOUD`), aucune modification de code pour changer de fournisseur ; jamais de clés en dur
- Le LLM ne reçoit **que** le schéma, les objets SQL et des **statistiques agrégées** — jamais de lignes brutes ; pseudonymisation obligatoire si des exemples de lignes sont nécessaires
- Connexion BDD **lecture seule** avec contrôles **déterministes** (GRANT limités, `sqlglot`, `EXPLAIN`, `LIMIT`, `statement_timeout`) ; aucun script de modification exécuté automatiquement
- **Double validation obligatoire** avant toute modification : validation MOA (métier) **et** validation technique (MOE/DSI), par deux personnes distinctes, avec **rollback systématique**
- Conformité CNIL / RGPD / ANSSI : minimisation des données, journal d'audit en ajout seul (append-only, chaîné par hash), **arrêt d'urgence**, conteneurs non-root sécurisés
- Exposition sécurisée : **reverse proxy** (TLS, headers de sécurité) devant l'UI et l'API + authentification **OIDC** (ex. ProConnect)

## Licence

`À COMPLÉTER : choix de la licence` (logiciel libre encouragé par la DINUM — décision à prendre par le porteur de projet).
