# PoC Yasna – Spécification détaillée

**Version 1.1 – Novembre 2026**

## Objectif du PoC

Démontrer concrètement la valeur de Yasna sur un **périmètre réduit et réaliste**, en déroulant le **parcours complet** de bout en bout :

- Focus sur **une seule table métier prioritaire** (exemple : table des bénéficiaires d'aides sociales).
- **Cadrage par la documentation projet** (circulaires, SFD, STD, DEX…) + chat IA pour figer le contexte, puis initialisation du projet.
- Connexion **lecture seule** + lien contexte métier ↔ BDD (y compris triggers/objets SQL si présents).
- Première analyse en **suggestions** (potentiels manques), puis **spécification du besoin** par l'utilisateur.
- **Pipeline multi-agents (4 agents)** : analyse en SELECT, revue globale.
- Sur **demande explicite** de l'utilisateur : génération des scripts **UPDATE + rollback**, avec validation MOA/MOE et revue de script.

L'objectif n'est **pas** de nettoyer une base complète, mais de prouver le combo « compréhension métier + analyse technique + propositions sécurisées », avec une **action et un attendu clairs à chaque phase**.

## Périmètre du PoC

| Élément | Inclus | Non inclus (pour plus tard) |
|---------|--------|------------------------------|
| Table cible | 1 table métier | Multi-tables / schéma complet |
| Documentation projet | Circulaires, SFD, STD, DEX… + chat de cadrage IA + validation explicite du contexte figé | Base documentaire complète |
| Base de connaissances | Règles de gestion du projet figées à l'initialisation | RAG avancé / fine-tuning |
| Connexion BDD | Lecture seule (rôle à privilèges minimaux) + schéma, échantillon, triggers/objets SQL si présents ; SELECT bornés (LIMIT, timeout) | Écriture directe par l'outil |
| Analyse | Suggestions de manques (transformables en besoin) + pipeline 4 agents (SELECT) | Cartographie métier↔technique dédiée |
| Modifications | UPDATE + rollback générés **sur demande explicite**, jamais exécutés automatiquement ; triggers impactés listés ; rollback testable | Exécution automatique ; refonte de schéma (3NF) |
| Gouvernance | Validation MOA/MOE au niveau projet + revue de script structurée + journalisation | Homologation complète |
| Interface | Streamlit simple | Interface avancée |
| IA | Local ou API configurable | Fine-tuning |
| Déploiement | Docker Compose basique | Production hardened |

## Étapes détaillées du PoC

### Étape 1 – Cadrage et initialisation du projet
- Sélectionner une table métier (ex. `beneficiaires`) et définir les champs principaux à analyser.
- Préparer un jeu de données de test « legacy pourrie » réaliste (doublons, champs vides, incohérences, formats incorrects).
- Charger la documentation projet (circulaires, SFD, STD, DEX…).
- **Chat de cadrage avec l'IA** : première synthèse de compréhension du contexte, puis questions-réponses pour préciser le contexte si besoin.
- **Validation explicite par l'utilisateur** de la synthèse du contexte, puis initialisation du projet (base de connaissances figée, paramètres, journalisation).

**Livrable** : projet initialisé + base de connaissances + jeu de données de test.

**Garde-fous** : chat limité aux documents projet non personnels ; mode local par défaut, API externes désactivables.

### Étape 2 – Connexion sécurisée et extraction
- Connexion en **lecture seule** (rôle PostgreSQL à privilèges minimaux).
- Extraction du schéma de la table et d'un échantillon configurable.
- Extraction des objets SQL associés si disponibles (triggers, procédures stockées, vues, contraintes).
- Aucune écriture possible à ce stade.

**Livrable** : schéma + échantillon + objets SQL extraits.

### Étape 3 – Lien contexte métier ↔ BDD
- Associer les règles de gestion aux éléments de la BDD (tables, colonnes, triggers, contraintes).
- Mettre en évidence les éléments sans règle associée ou avec règles contradictoires.

**Livrable** : liens règles de gestion ↔ éléments BDD.

### Étape 4 – Première analyse : suggestions de manques
- Faire ressortir les potentiels manques : doublons, données manquantes, incohérences, formats incorrects, valeurs aberrantes.
- Chaque suggestion est expliquée par la règle de gestion concernée et **transformable en besoin en un clic**.
- **Suggestions uniquement** : aucune proposition d'action, aucune modification.

**Livrable** : liste structurée de suggestions avec explications.

### Étape 5 – Spécification du besoin utilisateur
- L'utilisateur exprime son besoin via l'interface (ex. : « passer les valeurs NULL à 0 dans la table des montants »), ou à partir d'une suggestion de l'étape 4.

**Livrable** : besoin formalisé.

### Étape 6 – Pipeline multi-agents (analyse en SELECT)
- **Agent 1** : récupère la base de connaissances du projet (règles de gestion + contexte).
- **Agent 2** : lit la BDD (SELECT bornés : LIMIT / échantillonnage, timeout), identifie les lignes concernées, construit la requête en SELECT.
- **Agent 3** : agrège règles de gestion + résultats du SELECT pour confirmation.
- **Agent 4** : revue globale, communication des résultats à l'utilisateur.

**Livrable** : requête SELECT + résultats + explications + revue globale (traçabilité de chaque agent journalisée).

### Étape 7 – Génération UPDATE + rollback sur demande explicite
- L'utilisateur demande explicitement la requête en mode UPDATE.
- Les 4 agents retravaillent pour produire :
  - le **script SQL de modification** (commentaires explicatifs, estimation des lignes impactées, **liste des triggers impactés / effets de bord**) ;
  - le **script de rollback testable** (transaction + sauvegarde préalable : table de backup ou export ciblé).
- **Validation MOA/MOE au niveau du projet + revue de script structurée** (checklist) dans l'interface, avec journalisation.
- Jamais d'exécution automatique.

**Livrable** : scripts UPDATE + rollback + résumé des impacts + trace de validation.

### Étape 8 – Documentation et démonstration
- Documenter les choix techniques principaux.
- Lister les points de conformité respectés : lecture seule, SELECT bornés, validation humaine obligatoire (MOA/MOE + revue de script), configurabilité des API, pas de secrets en dur, chat de cadrage limité aux documents projet, rollback testable, journalisation.
- Préparer une démo claire et reproductible du PoC.
- Rédiger un court retour d'expérience (ce qui a bien fonctionné / points d'amélioration).

**Livrable** : documentation du PoC + scénario de démo.

## Critères de succès du PoC

- [ ] Une table métier est parcourue de bout en bout (cadrage → projet → connexion → lien → suggestions → besoin → agents → scripts).
- [ ] Le chat de cadrage permet de figer un contexte métier à partir de la documentation projet, avec validation explicite de l'utilisateur.
- [ ] Les liens entre règles de gestion et éléments BDD (dont triggers si présents) sont établis.
- [ ] La première analyse produit des suggestions de manques expliquées, transformables en besoin (aucune action).
- [ ] Le pipeline des 4 agents produit une requête SELECT bornée avec résultats confirmés et revue globale.
- [ ] Sur demande explicite, les scripts UPDATE + rollback (testable) sont générés, avec estimation d'impact et triggers impactés listés.
- [ ] Validation MOA/MOE + revue de script obligatoires et journalisées ; aucun script exécuté automatiquement.
- [ ] L'outil fonctionne en mode local.
- [ ] Les API externes sont configurables (activables/désactivables).
- [ ] Une démo est possible en moins de 15-20 minutes.

## Suite après le PoC

- Extension à d'autres tables.
- Cartographie métier↔technique dédiée et proposition de schéma optimisé (3NF) — reportées post-PoC.
- Amélioration du RAG métier (chunking pour les fenêtres de contexte des modèles locaux).
- Renforcement de la sécurité (journalisation, audit trail, conteneurisation plus stricte).
- Packaging Docker plus abouti.
- Tests automatisés (fonctionnels + sécurité).

---

*Fin de la spécification PoC – Version 1.1*
