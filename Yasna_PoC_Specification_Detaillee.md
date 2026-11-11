# PoC Yasna – Spécification détaillée

**Version 1.0 – Novembre 2026**

## Objectif du PoC

Démontrer concrètement la valeur de Yasna sur un **périmètre réduit et réaliste** :

- Focus sur **une seule table métier prioritaire** (exemple : table des bénéficiaires d’aides sociales).
- Mise en évidence claire des **anomalies** et des **dépendances avec les règles de gestion**.
- Génération de scripts SQL de correction + rollback.
- Validation humaine obligatoire via une interface simple.

L’objectif n’est **pas** de nettoyer une base complète, mais de prouver le combo « compréhension métier + analyse technique + propositions sécurisées ».

## Périmètre du PoC

| Élément | Inclus | Non inclus (pour plus tard) |
|---------|--------|-----------------------------|
| Table cible | 1 table métier | Multi-tables / schéma complet |
| Règles de gestion | Règles liées à la table | Base documentaire complète |
| Interface | Streamlit simple | Interface avancée |
| IA | Local ou API configurable | Fine-tuning |
| Sécurité | Base (lecture seule, validation humaine, pas de secrets en dur) | Homologation complète |
| Déploiement | Docker Compose basique | Production hardened |

## Étapes détaillées du PoC

### Étape 1 – Choix du cas d’usage et de la table cible
- Sélectionner une table métier (ex. `beneficiaires` ou équivalent).
- Définir les champs principaux à analyser.
- Créer ou préparer un jeu de données de test « legacy pourrie » réaliste (doublons, champs vides, incohérences, formats incorrects).
- Documenter brièvement le contexte métier de cette table.

**Livrable** : Description de la table + jeu de données de test.

### Étape 2 – Chargement du contexte métier
- Identifier les règles de gestion applicables à la table (extraits de circulaires, guides internes, règles formalisées).
- Mettre en place un mécanisme simple de chargement de ces règles (fichiers Markdown/PDF ou base vectorielle légère).
- Permettre à l’IA de les consulter pour analyser les données.

**Livrable** : Corpus de règles de gestion chargé et interrogeable.

### Étape 3 – Connexion sécurisée et extraction
- Connexion en **lecture seule** à la base (ou à la table).
- Extraction automatique du schéma de la table.
- Extraction d’un échantillon de données (configurable).
- Aucune écriture possible à ce stade.

**Livrable** : Schéma extrait + échantillon de données.

### Étape 4 – Cartographie métier ↔ technique
- Pour chaque champ important de la table, identifier les règles de gestion qui s’y appliquent.
- Afficher clairement les liens (ex. : « Champ `date_naissance` → Règle : date cohérente et âge minimum pour l’aide »).
- Mettre en évidence les champs sans règle associée ou avec règles contradictoires.

**Livrable** : Cartographie visuelle ou structurée des dépendances.

### Étape 5 – Analyse et détection d’anomalies
- Détecter automatiquement les problèmes sur la table :
  - Doublons
  - Données manquantes
  - Incohérences par rapport aux règles de gestion
  - Formats incorrects
  - Valeurs aberrantes
- Classer les anomalies par criticité (optionnel mais recommandé).
- Expliquer chaque anomalie en lien avec la règle de gestion concernée.

**Livrable** : Liste structurée des anomalies détectées avec explications.

### Étape 6 – Propositions de correction
- Générer des propositions de nettoyage ciblées sur les anomalies détectées.
- Produire :
  - Un **script SQL de correction** (avec commentaires explicatifs).
  - Un **script de rollback** correspondant.
- Estimer le nombre de lignes impactées.
- Ne jamais exécuter automatiquement les scripts.

**Livrable** : Scripts SQL (correction + rollback) + résumé des impacts.

### Étape 7 – Interface de validation humaine
- Interface Streamlit simple permettant de :
  - Visualiser les anomalies et leurs liens avec les règles de gestion.
  - Consulter les propositions de correction.
  - Valider ou rejeter les propositions.
  - Télécharger les scripts SQL.
- Aucune modification de données sans validation explicite.

**Livrable** : Interface fonctionnelle de validation.

### Étape 8 – Documentation et démonstration
- Documenter les choix techniques principaux.
- Lister les points de conformité respectés (lecture seule, validation humaine, configurabilité des API, pas de secrets en dur).
- Préparer une démo claire et reproductible du PoC.
- Rédiger un court retour d’expérience (ce qui a bien fonctionné / points d’amélioration).

**Livrable** : Documentation du PoC + scénario de démo.

## Critères de succès du PoC

- [ ] Une table métier est analysée de bout en bout.
- [ ] Les liens entre champs techniques et règles de gestion sont visibles.
- [ ] Des anomalies sont détectées et expliquées.
- [ ] Des scripts SQL (correction + rollback) sont générés.
- [ ] Une validation humaine est obligatoire avant toute action.
- [ ] L’outil peut fonctionner en mode local.
- [ ] Les API externes sont configurables (activables/désactivables).
- [ ] Une démo est possible en moins de 15-20 minutes.

## Suite après le PoC

- Extension à d’autres tables.
- Amélioration du RAG métier.
- Renforcement de la sécurité (journalisation, audit trail, conteneurisation plus stricte).
- Packaging Docker plus abouti.
- Tests automatisés (fonctionnels + sécurité).

---

*Fin de la spécification PoC – Version 1.0*
