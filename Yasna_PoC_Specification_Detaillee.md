# PoC Yasna – Spécification détaillée

**Version 1.2 – Novembre 2026**

## Objectif du PoC

Démontrer concrètement la valeur de Yasna sur un **périmètre réduit et réaliste**, en déroulant le **parcours complet** de bout en bout :

- Focus sur **une seule table métier prioritaire** (exemple : table des bénéficiaires d'aides sociales).
- **Cadrage par la documentation projet** (circulaires, SFD, STD, DEX… — le CDC fictif **PARINDIE** peut servir de documentation d'entrée) + chat IA pour figer le contexte, puis initialisation du projet.
- Connexion **lecture seule** + lien contexte métier ↔ BDD (y compris triggers/objets SQL si présents).
- Première analyse en **suggestions** (potentiels manques), puis **spécification du besoin** par l'utilisateur.
- **Pipeline simplifié** (cf. phase 7) : analyse en SELECT avec contrôles déterministes, revue des résultats.
- Après un SELECT OK : **dossier de revue** transmis au ou aux **Décideur(s)** (circuit de validation paramétrable par projet) ; proposition **validée** → génération des scripts **UPDATE + rollback**, **refusée avec motif** → retour à l'Opérationnel. L'Opérationnel ne peut pas générer d'UPDATE.

L'objectif n'est **pas** de nettoyer une base complète, mais de prouver le combo « compréhension métier + analyse technique + propositions sécurisées », avec une **action et un attendu clairs à chaque phase**.

**Stratégie IA du PoC** : **API externe configurable par défaut** (fournisseur souverain). Le PoC utilise l'API Mistral standard, **autorisée uniquement parce que les données du PoC sont fictives** (jeu de test + CDC PARINDIE). La couche fournisseur LLM est interchangeable sans modification de code (`LLM_BASE_URL`, `LLM_API_KEY` en `SecretStr`, `LLM_MODEL_CADRAGE`, `LLM_MODEL_SQL`, `LLM_MODEL_EMBEDDING`, `LLM_PROVIDER_SECNUMCLOUD`) : **un modèle par tâche** ; **PoC : Mistral Large 4 par défaut**. En production, tout envoi de données sensibles exige un fournisseur **qualifié SecNumCloud** (sur le service d'IA utilisé), sinon l'envoi est bloqué par le code. Le mode local (Ollama) reste **optionnel**.

**Règle de minimisation (données envoyées au LLM)** : par défaut, le LLM ne reçoit que le schéma, les objets SQL et des **statistiques agrégées** (comptages, taux de NULL, distributions, formats détectés), **jamais de lignes brutes**. Si des exemples de lignes sont nécessaires : **pseudonymisation obligatoire** avant envoi (colonnes identifiantes masquées ou remplacées). L'échantillon extrait : **aucune persistance** après la session d'analyse.

## Périmètre du PoC

| Élément | Inclus | Non inclus (pour plus tard) |
|---------|--------|------------------------------|
| Table cible | 1 table métier (PostgreSQL **uniquement** pour le PoC) | Multi-tables / schéma complet ; autres SGBD (Oracle, DB2, SQL Server — interface d'adaptateur prévue) |
| Documentation projet | Circulaires, SFD, STD, DEX… (CDC fictif **PARINDIE** possible) + chat de cadrage IA + validation explicite du contexte figé | Base documentaire complète |
| Base de connaissances | Règles de gestion du projet figées à l'initialisation | RAG avancé / fine-tuning |
| Connexion BDD | Lecture seule (rôle à privilèges minimaux, `GRANT SELECT` limités) + schéma, statistiques agrégées, triggers/objets SQL si présents ; SELECT bornés (LIMIT, timeout) et **contrôles déterministes** (sqlglot + EXPLAIN) | Écriture directe par l'outil |
| Analyse | Suggestions de manques (transformables en besoin) + pipeline simplifié (SELECT) | Cartographie métier↔technique dédiée |
| Modifications | UPDATE + rollback générés **après validation du dossier de revue** par le ou les Décideur(s), jamais exécutés automatiquement ; l'UPDATE réutilise la clause WHERE du SELECT validé (SET seulement généré par le LLM) ; triggers impactés classés réversibles / non réversibles ; contrôle de dérive embarqué ; rollback testable | Exécution automatique ; refonte de schéma (3NF) |
| Gouvernance | **Circuit de validation paramétrable par projet** (défaut : 1 validation par un Décideur, auto-validation interdite) + dossier de revue + journalisation | Homologation complète |
| Interface | Streamlit derrière **reverse proxy nginx** (TLS, headers de sécurité) + authentification **OIDC générique** (PoC : Keycloak en conteneur) | Interface avancée |
| IA | **API externe configurable par défaut** (Mistral, données fictives uniquement) ; mode local optionnel | Fine-tuning |
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
- **Validation du contexte métier figé par le Décideur** (propriétaire des données), puis initialisation du projet : base de connaissances figée, paramètres, **paramétrage du circuit de validation par l'Administrateur** (nombre de validations distinctes requises — 1 ou 2 ; rôle ou profil exigé pour chaque validation ; auto-validation autorisée ou interdite — selon le processus de validation réel de l'organisation, recueilli lors du cadrage avec la MOA et la DSI), journalisation append-only.
- Préparer le **jeu de données de test « legacy »** avec des anomalies **injectées et connues à l'avance** : liste de référence documentée (type d'anomalie, nombre de lignes, règle de gestion concernée), cohérente avec les règles de gestion du CDC PARINDIE (et ses incohérences volontaires).

**Livrable** : projet initialisé + base de connaissances + jeu de données de test avec anomalies injectées + liste de référence.

### Phase 3 – Connexion à la base (lecture seule)
- Connexion en **lecture seule** (rôle PostgreSQL à privilèges minimaux, `GRANT SELECT` limités au périmètre, `default_transaction_read_only = on`, `statement_timeout`).
- Extraction du schéma de la table, de **statistiques agrégées** (comptages, taux de NULL, distributions, formats détectés) et d'un échantillon, utilisé uniquement pour l'affichage aux utilisateurs (jamais envoyé au LLM sans pseudonymisation).
- Extraction des objets SQL associés si disponibles (triggers, procédures stockées, vues, contraintes).
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
- L'utilisateur (rôle **Opérationnel**) exprime son besoin via l'interface (ex. : « normaliser le format des numéros de téléphone »), ou à partir d'une suggestion de la phase 5.

**Note** : remplacer NULL par 0 sur un montant transforme « inconnu » en « aucun droit » : seule la MOA peut trancher.

**Livrable** : besoin formalisé.

### Phase 7 – Traitement multi-agents (analyse en SELECT)

**Pipeline simplifié confirmé** (5 étapes, **2 appels LLM** : génération du SELECT et explication/revue) : l'Agent 1 est une simple recherche dans la base de connaissances, sans LLM ; les Agents 3 et 4 se recoupent :

1. **Récupération des règles de gestion** (code — recherche RAG dans la base de connaissances).
2. **Génération du SELECT** (LLM, à partir du schéma, des objets SQL et des statistiques agrégées).
3. **Contrôle de la requête** (code — cf. contrôles déterministes : sqlglot + EXPLAIN ; requête refusée = journalisée avec motif).
4. **Exécution bornée** (code — LIMIT, timeout, rôle lecture seule).
5. **Explication et revue des résultats au regard des règles** (LLM — statistiques agrégées uniquement, lignes pseudonymisées si nécessaires).

*Le pipeline 4 agents complet (Agents 1 à 4 du Document Projet) reste la **cible post-PoC**.*

**Banc de comparaison pour la génération SQL** : la génération SQL est comparée entre **Mistral Large 4** (défaut), **Medium 3.5** et **Codestral**, sur le jeu de données à anomalies injectées (taux de détection et taux de fausses alertes — cf. critères de succès).

**Livrable** : requête SELECT validée et journalisée (identifiant + hash) + statistiques + explications + revue.

### Phase 8 – Revue décisionnelle puis génération des scripts (UPDATE + rollback)

Après la phase 7 : SELECT OK sur l'échantillon → **proposition transmise au(x) Décideur(s)** → revue → **validée** (génération du script UPDATE + rollback) ou **refusée avec motif** (retour à l'Opérationnel).

- L'orchestrateur (machine à états) constitue le **dossier de revue** : besoin, SELECT validé et journalisé (identifiant + hash, **exactement le même périmètre**), **COUNT total des lignes concernées**, extrait d'échantillon, modification envisagée en langage clair, **triggers concernés**.
- Le dossier est revu par le ou les **Décideur(s)** conformément au **circuit de validation paramétrable par projet** (recueilli lors du cadrage avec la MOA et la DSI, paramétré par l'Administrateur à l'initialisation du projet — phase 2) : nombre de validations distinctes requises (1 ou 2), rôle ou profil exigé pour chaque validation, auto-validation autorisée ou interdite. **Valeurs par défaut : 1 validation par un Décideur, auto-validation interdite.** Toute modification du circuit est réservée à l'Administrateur et journalisée.
- Proposition **validée** → génération de :
  - le **script SQL de modification** : le code réutilise **la clause WHERE du SELECT validé** (analyse sqlglot) — le LLM ne génère que la **partie SET**, et le vérifie par le code (même périmètre) ; commentaires explicatifs, **liste des triggers impactés / effets de bord classés en « réversibles par le rollback » / « non réversibles »** (avec description de l'effet ; un effet non réversible est signalé explicitement dans le dossier de revue) ;
  - le **script de rollback testable** (transaction + sauvegarde préalable : table de backup **créée dans la même transaction** que l'UPDATE).
- Chaque script UPDATE embarque un **contrôle de dérive des données** : recomptage des lignes ciblées en tête de script, **annulation de la transaction** si le nombre diffère au-delà d'une tolérance **paramétrable par projet, par défaut 0** — tout écart de comptage annule la transaction.
- Chaque script porte un **en-tête** indiquant les valideurs, l'horodatage, le **hash du SELECT validé** et la mention **« Exécution hors Yasna, sous la responsabilité de l'exécutant »**. Yasna s'arrête à la **génération du script** : aucune validation après génération.
- La table de backup contient des données personnelles : durée de conservation et suppression à prévoir (`TODO(RGPD) : à valider par le DPO`).
- Proposition **refusée avec motif** → retour à l'Opérationnel (retour au besoin, phase 6).
- **Dossier de changement** : Yasna produit un dossier prêt à déposer dans le processus de changement de l'administration, pas seulement un script :
  - les scripts **UPDATE + rollback** (avec l'en-tête défini ci-dessus) ;
  - la **fiche de changement** : besoin, périmètre, COUNT des lignes, triggers et effets de bord, **procédure d'exécution**, **procédure de retour arrière**, **tests à passer en recette avant mise en production**.
- L'exécution reste **hors Yasna**, par l'exploitation de l'administration, selon son **propre processus de changement**.
- Jamais d'exécution automatique.

**Livrable** : dossier de changement (scripts UPDATE + rollback avec en-tête + fiche de changement) + résumé des impacts + trace des validations du dossier de revue.

## Livraison du PoC

*(Hors parcours en 8 phases.)*

- Documenter les choix techniques principaux.
- Lister les points de conformité respectés : lecture seule, SELECT bornés et contrôlés de façon déterministe (sqlglot, EXPLAIN), circuit de validation paramétrable par projet (décisions du ou des Décideurs), minimisation des données envoyées au LLM, couche fournisseur interchangeable, pas de secrets en dur, chat de cadrage limité aux documents projet, rollback testable, contrôle de dérive, journalisation.
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

- [ ] Une table métier est parcourue de bout en bout via les 8 phases (cadrage → projet → connexion → lien → suggestions → besoin → SELECT validé → revue décisionnelle → scripts).
- [ ] Le chat de cadrage permet de figer un contexte métier à partir de la documentation projet, avec validation explicite de l'utilisateur.
- [ ] Les liens entre règles de gestion et éléments BDD (dont triggers si présents) sont établis.
- [ ] La première analyse produit des suggestions de manques expliquées, transformables en besoin (aucune action).
- [ ] Le pipeline simplifié produit une requête SELECT bornée, **validée par les contrôles déterministes** (sqlglot + EXPLAIN), avec résultats confirmés et revue au regard des règles.
- [ ] **Taux de détection des anomalies injectées** (anomalies injectées trouvées / anomalies injectées) : **≥ 80 %** par rapport à la liste de référence.
- [ ] **Taux de fausses alertes** : `À COMPLÉTER`.
- [ ] Temps entre l'expression du besoin et le script validé, comparé à la méthode actuelle (`À COMPLÉTER : référence`).
- [ ] **0 requête hors périmètre exécutée** (table, colonnes, types d'instruction).
- [ ] **100 % des requêtes malveillantes du jeu de tests de sécurité rejetées** par le contrôle sqlglot (chaque refus journalisé avec son motif).
- [ ] Après validation du dossier de revue par le circuit paramétré, les scripts UPDATE + rollback (testable) sont générés, avec estimation d'impact, triggers impactés classés réversibles / non réversibles, et **contrôle de dérive embarqué** ; **100 % des scripts** comportent le contrôle de dérive, un rollback testable et un **en-tête** (valideurs, horodatage, hash du SELECT validé, mention « Exécution hors Yasna, sous la responsabilité de l'exécutant »).
- [ ] **Circuit de validation paramétrable** appliqué (par défaut : 1 validation par un Décideur, auto-validation interdite), chaque validation horodatée, nominative et journalisée ; l'Opérationnel ne peut pas générer d'UPDATE ; aucun script exécuté automatiquement.
- [ ] **100 % des UPDATE générés réutilisent strictement la clause WHERE du SELECT validé** (le LLM ne génère que la partie SET — vérification par le code).
- [ ] Le **dossier de changement** est prêt à déposer dans le processus de l'administration : scripts UPDATE + rollback avec en-tête + fiche de changement (procédure d'exécution, procédure de retour arrière, tests à passer en recette avant mise en production).
- [ ] L'outil fonctionne via l'**API externe configurée (Mistral)** — autorisée uniquement car données fictives — et la couche fournisseur est interchangeable sans modification de code (mode local optionnel).
- [ ] Une démo est possible en moins de 15-20 minutes.

## Suite après le PoC

- **Priorité n° 1 après le PoC** : adaptateur pour un **SGBD legacy (DB2 / Oracle)** — SGBD prioritaire : `À COMPLÉTER` ; puis extension à d'autres tables et à d'autres SGBD (interface d'adaptateur : Oracle, DB2, SQL Server).
- Pipeline multi-agents complet (4 agents) tel que décrit au Document Projet.
- Cartographie métier↔technique dédiée et proposition de schéma optimisé (3NF) — reportées post-PoC.
- Amélioration du RAG métier (chunking pour les fenêtres de contexte).
- Renforcement de la sécurité (homologation, audit trail, conteneurisation plus stricte, OIDC générique en production : IdP de l'administration ou ProConnect).
- Packaging Docker plus abouti.
- Tests automatisés (fonctionnels + sécurité).

---

*Fin de la spécification PoC – Version 1.2*
