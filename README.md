# Yasna

Outil souverain d'analyse et de nettoyage intelligent de bases de données pour les administrations publiques (cas d'usage prioritaire : aides sociales).

## Documentation

- [Document Projet v1.2](Yasna_Document_Projet_v1.2.md) — vision, parcours en 8 phases, sécurité/conformité (CNIL/ANSSI/DINUM), stack, roadmap
- [Spécification détaillée du PoC v1.1](Yasna_PoC_Specification_Detaillee.md) — périmètre, étapes, critères de succès
- [Schémas du parcours](Yasna_Schemas_Parcours.md) — acteurs, lieux (PC / serveur / IA / BDD) et flux en diagrammes Mermaid
- [Références techniques & base saine](Yasna_References_Techniques.md) — guidances ANSSI / OWASP / CNIL à suivre pendant le développement + checklist de démarrage

## Principes clés

- Mode **local par défaut** ; API externes (LLM, embeddings) optionnelles et entièrement configurables (variables d'environnement, jamais de clés en dur)
- Connexion BDD **lecture seule** ; aucun script de modification exécuté automatiquement
- **Validation humaine obligatoire** (MOA/MOE + revue de script) avant toute modification, avec **rollback systématique**
- Conformité CNIL / RGPD / ANSSI : minimisation des données, journalisation des accès, conteneurs non-root sécurisés
