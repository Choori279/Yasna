# Yasna

Outil d'analyse et de nettoyage intelligent de bases de données pour les **grandes administrations et organismes publics** disposant d'applications développées en interne et d'équipes techniques (caisses de sécurité sociale, ministères, opérateurs de l'État — cas d'usage : aides sociales).

## Documentation

- [Document Projet v1.3](Yasna_Document_Projet_v1.3.md) — vision, parcours en 8 phases, sécurité/conformité (CNIL/ANSSI/DINUM), stack, roadmap
- [Spécification détaillée du PoC v1.2](Yasna_PoC_Specification_Detaillee.md) — périmètre, phases, critères de succès chiffrés
- [Schémas du parcours v1.1](Yasna_Schemas_Parcours.md) — acteurs, lieux (PC / serveur / IA / BDD), flux et machine à états en diagrammes Mermaid
- [Références techniques & base saine v1.1](Yasna_References_Techniques.md) — guidances ANSSI / OWASP / CNIL à suivre pendant le développement + checklist de démarrage

## Principes clés

- **API externe configurable par défaut** (fournisseur souverain), mode local **optionnel** : couche fournisseur LLM interchangeable via variables d'environnement (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CADRAGE`, `LLM_MODEL_SQL`, `LLM_MODEL_EMBEDDING`, `LLM_PROVIDER_SECNUMCLOUD`), aucune modification de code pour changer de fournisseur ; jamais de clés en dur ; un **modèle par tâche** (PoC : Mistral Large 4 par défaut)
- Le LLM ne reçoit **que** le schéma, les objets SQL et des **statistiques agrégées** — jamais de lignes brutes ; pseudonymisation obligatoire si des exemples de lignes sont nécessaires
- Connexion BDD **lecture seule** avec contrôles **déterministes** (GRANT limités, `sqlglot`, `EXPLAIN`, `LIMIT`, `statement_timeout`) ; aucun script de modification exécuté automatiquement
- **Circuit de validation paramétrable par projet**, reproduisant le processus de validation réel de l'organisation (par défaut : 1 validation par un Décideur, auto-validation interdite) ; le LLM ne génère que la partie SET, la clause WHERE du SELECT validé est réutilisée par le code ; les scripts sont générés après validation, jamais exécutés par Yasna, avec **rollback systématique**
- Conformité CNIL / RGPD / ANSSI : minimisation des données, journal d'audit en ajout seul (append-only, chaîné par hash), **arrêt d'urgence**, conteneurs non-root sécurisés
- Exposition sécurisée : **reverse proxy nginx** (TLS, headers de sécurité) devant l'UI et l'API + authentification **OIDC générique** (aucun fournisseur codé en dur ; PoC : Keycloak en conteneur ; production : fournisseur d'identité de l'administration ou ProConnect)

## Licence

**EUPL-1.2** (Licence publique de l'Union européenne, version 1.2) — voir le fichier [LICENSE](LICENSE) ; texte officiel en français publié sur interoperable-europe.ec.europa.eu.
