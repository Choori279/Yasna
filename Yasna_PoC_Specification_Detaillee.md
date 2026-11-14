# PoC Yasna – Spécification détaillée

**Version 1.2 – Novembre 2026**

## Objectif du PoC

Démontrer concrètement la valeur de Yasna sur un **périmètre réduit et réaliste**, en déroulant le **parcours complet** de bout en bout :

- Focus sur **une seule table métier prioritaire** (exemple : table des bénéficiaires d'aides sociales).
- **Cadrage par la documentation projet** (circulaires, SFD, STD, DEX… — le CDC fictif **PARINDIE** peut servir de documentation d'entrée) + chat IA pour figer le contexte, puis initialisation du projet.
- Connexion **lecture seule** + lien contexte métier ↔ BDD (y compris triggers/objets SQL si présents).
- Première analyse en **suggestions** (potentiels manques), puis **spécification du besoin** par l'utilisateur.
- **Pipeline simplifié** (cf. phase 7) : analyse en SELECT avec contrôles déterministes, revue des résultats.
- Sur **demande explicite** de l'utilisateur : génération des scripts **UPDATE + rollback**, avec **double validation (MOA + technique)** et revue de script.

L'objectif n'est **pas** de nettoyer une base complète, mais de prouver le combo « compréhension métier + analyse technique + propositions sécurisées », avec une **action et un attendu clairs à chaque phase**.

**Stratégie IA du PoC** : **API externe configurable par défaut** (fournisseur souverain). Le PoC utilise l'API Mistral standard, **autorisée uniquement parce que les données du PoC sont fictives** (jeu de test + CDC PARINDIE). La couche fournisseur LLM est interchangeable sans modification de code (`LLM_BASE_URL`, `LLM_API_KEY` en `SecretStr`, `LLM_MODEL`, `LLM_PROVIDER_SECNUMCLOUD`) : en production, tout envoi de données sensibles exige un fournisseur **qualifié SecNumCloud** (sur le service d'IA utilisé), sinon l'envoi est bloqué par le code. Le mode local (Ollama) reste **optionnel**.

**Règle de minimisation (données envoyées au LLM)** : par défaut, le LLM ne reçoit que le schéma, les objets SQL et des **statistiques agrégées** (comptages, taux de N
ULL, distributions, formats détectés), **jamais de lignes brutes**. Si des exemples de lignes sont nécessaires : **pseudonymisation obligatoire** avant envoi (colonnes identifiantes masquées ou remplacées). L'échantillon extrait n'est pas persisté au-delà de la session d'analyse (`À COMPLÉTER : durée de conservation si chiffré`).

## Périmètre du PoC

| Élément | Inclus | Non inclus (pour plus tard) |
|---------|--------|------------------------------|
| Table cible | 1 table métier (PostgreSQL **uniquement** pour le PoC) | Multi-tables / schéma complet ; autres SGBD (Oracle, DB2, SQL Server — interface d'adaptateur prévue) |
| Documentation projet | Circulaires, SFD, STD, DEX… (CDC fictif **PARINDIE** possible) + chat de cadrage IA + validation explicite du contexte figé | Base documentaire complète |
| Base de connaissances | Règles de gestion du projet figées à l'initialisation | RAG avancé / fine-tuning |
| Connexion BDD | Lecture seule (rôle à privilèges minimaux, `GRANT SELECT` limités) + schéma, statistiques agrégées, triggers/objets SQL si présents ; SELECT bornés (LIMIT, timeout) et **contrôles déterministes** (sqlglot + EXPLAIN) | Écriture directe par l'outil |
| Analyse | Suggestions de manques (transformables en besoin) + pipeline simplifié (SELECT) | Cartographie métier↔technique dédiée |
| Modifications | UPDATE + rollback générés **sur demande explicite**, jamais exécutés automatiquement ; triggers impactés classés réversibles / non réversibles ; contrôle de dérive embarqué ; rollback testable | Exécution automatique ; refonte de schéma (3NF) |
| Gouvernance | **Double validation MOA (métier) + technique (MOE/DSI)** par deux personnes distinctes + revue de script structurée + journalisation | Homologation complète |
| Interface | Streamlit derrière **reverse proxy** (TLS, headers de sécurité) + authentification **OIDC** | Interface avancée |
| IA | **API externe configurable par défaut** (Mistral, données fictives uniquement) ; mode local optionnel | 
Fine-tuning |
| Déploiement | Docker Compose basique | Production hardened |

## Phases détaillées du PoC

*Les phases reprennent exactement les 8 phases du Document Projet (mêmes numéros, mêmes noms).*

### Phase 1 – Cadrage par la documentation projet
- Charger la documentation projet (circulaires, SFD, STD, DEX…) ; le **CDC fictif PARINDIE** peut servir de documentation d'entrée.
- **Chat de cadrage avec l'IA** : première synthèse de compréhension du contexte, puis questions-réponses pour préciser le contexte si besoin.
- Sélectionner la table métier (ex. `beneficiaires`) et définir les champs principaux à analyser, cohérents avec les règles de gestion du CDC PARINDIE.

**Livrable** : synthèse du contexte métier.

**Garde-fous** : chat limité aux documents projet non personnels ; tout contenu des documents est traité comme **non fiable** (balisage instructions/données dans les prompts).

### Phase 2 – Initialisation du projet
- **Validation explicite par l'utilisateur** de la synthèse du contexte, puis initialisation du projet (base de connaissances figée, paramètres, journalisation append-only).
- Préparer le **jeu de données de test « legacy »** avec des anomalies **injectées et connues à l'avance** : liste de référence documentée (type d'anomalie, nombre de lignes, règle de gestion concernée), cohérente avec les règles de gestion du CDC PARINDIE (et ses incohérences volontaires).

**Livrable** : projet initialisé + base de connaissances + jeu de données de test avec anomalies injectées + liste de référence.

### Phase 3 – Connexion à la base (lecture seule)
- Connexion en **lecture seule** (rôle PostgreSQL à privilèges minimaux, `GRANT SELECT` limités au périmètre, `default_transaction_read_only = on`, `statement_timeout`).
- Extraction du schéma de la table, de **statistiques agrégées** (comptages, taux de NULL, distributions, formats détectés) et d'un échantillon configurable (pseudonymisé si envoyé au LLM).
- Extraction des objets SQL associés si disponible
s (triggers, procédures stockées, vues, contraintes).
- Aucune écriture possible à ce stade.

**Livrable** : schéma + statistiques agrégées + objets SQL extraits.

### Phase 4 – Lien entre contexte métier et base de données
- Associer les règles de gestion aux éléments de la BDD (tables, colonnes, triggers, contraintes).
- Mettre en évidence les éléments sans règle associée ou avec règles contradictoires.

**Livrable** : liens règles de gestion ↔ éléments BDD.

### Phase 5 – Première analyse : potentiels manques (suggestions uniquement)
- Faire ressortir les potentiels manques : doublons, données manquantes, incohérences, formats incorrects, valeurs aberrantes — en s'appuyant sur les statistiques agrégées (pas de lignes brutes envoyées au LLM).
- Chaque suggestion est expliquée par la règle de gestion concernée et **transformable en besoin en un clic**.
- **Suggestions uniquement** : aucune proposition d'action, aucune modification.

**Livrable** : liste structurée de suggestions avec explications.

### Phase 6 – Spécification du besoin utilisateur
- L'utilisateur exprime son besoin via l'interface (ex. : « passer les valeurs NULL à 0 dans la table des montants »), ou à partir d'une suggestion de la phase 5.

**Livrable** : besoin formalisé.

### Phase 7 – Traitement multi-agents (analyse en SELECT)

**Pipeline simplifié du PoC** (l'Agent 1 est une simple recherche dans la base de connaissances, sans LLM ; les Agents 3 et 4 se recoupent) :

1. **Récupération des règles de gestion** (code — recherche RAG dans la base de connaissances).
2. **Génération du SELECT** (LLM, à partir du schéma, des objets SQL et des statistiques agrégées).
3. **Contrôle de la requête** (code — cf. contrôles déterministes : sqlglot + EXPLAIN ; requête refusée = journalisée avec motif).
4. **Exécution bornée** (code — LIMIT, timeout, rôle lecture seule).
5. **Explication et revue des résultats au regard des règles** (LLM — statistiques agrégées uniquement, lignes pseudonymisées si nécessaire
s).

*Le pipeline 4 agents complet (Agents 1 à 4 du Document Projet) reste la **cible post-PoC**.*

**Livrable** : requête SELECT validée et journalisée (identifiant + hash) + statistiques + explications + revue.

### Phase 8 – Génération des scripts sur demande explicite (UPDATE + rollback)
- L'utilisateur demande explicitement la requête en mode UPDATE ; l'orchestrateur (machine à états) exige un **SELECT validé et journalisé**, référencé par son identifiant et son hash, avec **exactement le même périmètre**.
- Génération de :
  - le **script SQL de modification** : commentaires explicatifs, estimation des lignes impactées, **liste des triggers impactés / effets de bord classés en « réversibles par le rollback » / « non réversibles »** (avec description de l'effet ; un effet non réversible est signalé explicitement dans la revue de script) ;
  - le **script de rollback testable** (transaction + sauvegarde préalable : table de backup **créée dans la même transaction** que l'UPDATE).
- Chaque script UPDATE embarque un **contrôle de dérive des données** : recomptage des lignes ciblées en tête de script, **annulation de la transaction** si le nombre diffère de l'estimation validée au-delà d'une tolérance configurable.
- La table de backup contient des données personnelles : durée de conservation et suppression à prévoir (`À COMPLÉTER`).
- **Double validation obligatoire** : validation **MOA (métier)** **et** validation **technique (MOE/DSI)**, par **deux personnes distinctes** (la personne qui exprime le besoin ne peut pas valider seule) + **revue de script structurée** (checklist), chaque validation étant horodatée, nominative et journalisée.
- Jamais d'exécution automatique.

**Livrable** : scripts UPDATE + rollback + résumé des impacts + trace de double validation.

## Livraison du PoC

*(Hors parcours en 8 phases.)*

- Documenter les choix techniques principaux.
- Lister les points de conformité respectés : lecture seule, SELECT bornés et contrôlés de façon déterm
iniste (sqlglot, EXPLAIN), double validation humaine obligatoire (MOA + technique) et revue de script, minimisation des données envoyées au LLM, couche fournisseur interchangeable, pas de secrets en dur, chat de cadrage limité aux documents projet, rollback testable, contrôle de dérive, journalisation.
- Préparer une démo claire et reproductible du PoC.
- Rédiger un court retour d'expérience (ce qui a bien fonctionné / points d'amélioration).

**Livrable** : documentation du PoC + scénario de démo.

## Jeux de tests

### Jeu de données « legacy » avec anomalies injectées
Base fictive cohérente avec le CDC PARINDIE, contenant des anomalies **connues à l'avance** et documentées dans une **liste de référence** (type d'anomalie, nombre de lignes, règle de gestion concernée) : doublons, champs vides, incohérences, formats incorrects, valeurs aberrantes.

### Jeu de tests de sécurité
Besoins piégés qui doivent **tous être bloqués** :
- injection de prompt (via le chat et via des valeurs de colonnes / documents),
- demande de colonnes hors périmètre,
- `DROP` / `UPDATE` déguisés en SELECT.

## Critères de succès du PoC

- [ ] Une table métier est parcourue de bout en bout via les 8 phases (cadrage → projet → connexion → lien → suggestions → besoin → SELECT validé → scripts).
- [ ] Le chat de cadrage permet de figer un contexte métier à partir de la documentation projet, avec validation explicite de l'utilisateur.
- [ ] Les liens entre règles de gestion et éléments BDD (dont triggers si présents) sont établis.
- [ ] La première analyse produit des suggestions de manques expliquées, transformables en besoin (aucune action).
- [ ] Le pipeline simplifié produit une requête SELECT bornée, **validée par les contrôles déterministes** (sqlglot + EXPLAIN), avec résultats confirmés et revue au regard des règles.
- [ ] **Taux de détection des anomalies injectées** : `À COMPLÉTER` (ex. ≥ 80 %) par rapport à la liste de référence.
- [ ] **0 requête hors périmètre exécutée** (table, col
onnes, types d'instruction).
- [ ] **100 % des requêtes malveillantes du jeu de tests de sécurité rejetées** par le contrôle sqlglot (chaque refus journalisé avec son motif).
- [ ] Sur demande explicite, les scripts UPDATE + rollback (testable) sont générés, avec estimation d'impact, triggers impactés classés réversibles / non réversibles, et **contrôle de dérive embarqué** ; **100 % des scripts** comportent le contrôle de dérive et un rollback testable.
- [ ] **Double validation MOA (métier) + technique (MOE/DSI)** obligatoire, par deux personnes distinctes, journalisée ; aucun script exécuté automatiquement.
- [ ] L'outil fonctionne via l'**API externe configurée (Mistral)** — autorisée uniquement car données fictives — et la couche fournisseur est interchangeable sans modification de code (mode local optionnel).
- [ ] Une démo est possible en moins de 15-20 minutes.

## Suite après le PoC

- Extension à d'autres tables et à d'autres SGBD (interface d'adaptateur : Oracle, DB2, SQL Server).
- Pipeline multi-agents complet (4 agents) tel que décrit au Document Projet.
- Cartographie métier↔technique dédiée et proposition de schéma optimisé (3NF) — reportées post-PoC.
- Amélioration du RAG métier (chunking pour les fenêtres de contexte).
- Renforcement de la sécurité (homologation, audit trail, conteneurisation plus stricte, OIDC en production).
- Packaging Docker plus abouti.
- Tests automatisés (fonctionnels + sécurité).

---

*Fin de la spécification PoC – Version 1.2*
