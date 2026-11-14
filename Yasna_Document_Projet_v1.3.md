# Document Projet – Yasna

**Outil d'Analyse et de Nettoyage Intelligent de Bases de Données pour les Administrations Publiques**

**Version 1.3 – Novembre 2026**  
*(Base de travail produit – reprise du développement)*

## Objectif du document

Présentation claire et complète du projet Yasna à destination des contributeurs, des partenaires techniques et des administrations. Ce document sert de référence pour le développement du produit (plus seulement du prototype) et peut être utilisé comme instructions de projet pour une IA de développement.

## Sommaire

1. Postulat de départ  
2. Problématique détectée  
3. Solution apportée : Yasna  
4. Solutions existantes  
5. Opportunités et maturité du marché  
6. Principes de sécurité et conformité  
7. Chemin vers la production  
8. Stack technique et architecture  
9. Roadmap produit et PoC  

## 1. Postulat de départ

Les grandes administrations et organismes publics (caisses de sécurité sociale, ministères, opérateurs de l'État) gèrent quotidiennement des volumes massifs de dossiers : aides sociales (RSA, allocations), prestations, état civil, subventions, inscriptions scolaires…  

**Cible** : Yasna vise en priorité les **grandes administrations et organismes publics** disposant d'**applications développées en interne** et d'**équipes techniques**. Les **collectivités ne sont pas visées en priorité** : elles utilisent surtout des **progiciels d'éditeurs** dont elles ne maîtrisent pas le schéma, et une modification directe en base peut faire **perdre le support de l'éditeur**.  

Elles s'appuient sur des systèmes d'information souvent anciens (15 à 30 ans). Ces bases legacy contiennent des volumes importants de données, mais de qualité souvent médiocre : doublons, champs vides, incohérences, formats hétérogènes.  

Ces données sont pourtant critiques pour les décisions opérationnelles et pour toute modernisation future (y compris le déploiement d'IA). Sans données propres et fiables, l'IA souveraine ne peut pas être déployée de manière utile et fiable.

## 2. Problématique détectée

Aujourd'hui, les administrations n'ont que deux options principales pour nettoyer leurs bases, et aucune n'est pleinement satisfaisante :

- **Scripts de purge « maison »** : précis et adaptés aux règles métier, mais très longs à développer (3 à 9 mois), dépendants d'experts rares, et difficiles à maintenir.
- **Outils standards du marché** (IBM InfoSphere QualityStage, Informatica, etc.) : puissants sur le volume, mais chers, complexes, peu capables de comprendre automatiquement le contexte métier, et souvent non souverains.

Conséquence : les données restent sales, la modernisation des SI est freinée, et l'IA ne peut pas être déployée de manière fiable.

## 3. Solution apportée : Yasna

Yasna est un outil intelligent, simple et pensé pour le secteur public. Il combine de l'IA (API externe configurable par défaut, fournisseur souverain ; mode local optionnel) avec un contrôle humain obligatoire aux étapes critiques. Chaque phase du parcours a une **action attendue claire** de la part de l'utilisateur.

### Le parcours Yasna (8 phases)

1. **Cadrage par la documentation projet**  
   Chargement des documents du projet (circulaires, SFD, STD, DEX, dictionnaire de données…). L'IA produit une première analyse de compréhension du contexte métier, puis un **chat de cadrage** (questions-réponses avec l'IA) permet à l'utilisateur de préciser le contexte si besoin au départ.

2. **Initialisation du projet**  
   L'utilisateur **valide explicitement** la synthèse du contexte métier produite par l'IA, puis le projet Yasna est initialisé à partir de cette base : contexte métier figé, paramètres du projet, journalisation des accès.

3. **Connexion à la base (lecture seule)**  
   Connexion en lecture seule (rôle PostgreSQL à privilèges minimaux, `GRANT SELECT` limités au périmètre du projet) pour extraire le schéma, des **statistiques agrégées** (comptages, taux de NULL, distributions, formats détectés) et si possible les objets SQL associés (triggers, procédures stockées, vues, contraintes).

4. **Lien entre contexte métier et base de données**  
   Association entre les règles de gestion et les éléments de la BDD (tables, colonnes, triggers, contraintes…), au-delà du seul schéma.

5. **Première analyse : potentiels manques (suggestions uniquement)**  
   L'analyse fait ressortir les manques et incohérences potentielles (doublons, données manquantes, incohérences, formats incorrects, valeurs aberrantes), chacune expliquée par la règle de gestion concernée. **Aucune action proposée à ce stade** : chaque suggestion peut être transformée en besoin en un clic.

6. **Spécification du besoin utilisateur**  
   L'utilisateur (rôle **Opérationnel**) exprime — ou reprend une suggestion pour exprimer — son besoin de nettoyage (ex. : « normaliser le format des numéros de téléphone »).

   **Note** : remplacer NULL par 0 sur un montant transforme « inconnu » en « aucun droit » : seule la MOA peut trancher.

7. **Traitement multi-agents (analyse en SELECT)**  
   - **Agent 1** : récupération de la base de connaissances du projet (règles de gestion + contexte).  
   - **Agent 2** : lecture de la BDD (requêtes SELECT bornées : LIMIT / échantillonnage, timeout) pour construire la requête en SELECT et produire des **statistiques agrégées** sur les lignes correspondantes.  
   - **Agent 3** : agrégation des règles de gestion et des **statistiques agrégées** (jamais de lignes brutes) pour confirmation.  
   - **Agent 4** : revue globale et communication des résultats à l'utilisateur.

8. **Revue décisionnelle puis génération des scripts (UPDATE + rollback)**  
   Après la phase 7 : SELECT OK sur l'échantillon → **proposition transmise au(x) Décideur(s)** → revue (cf. section 6, « Rôles et circuit de validation ») → **validée** (génération du script UPDATE + rollback) ou **refusée avec motif** (retour à l'Opérationnel). Le **dossier de revue** comprend : besoin, SELECT validé et journalisé (identifiant + hash, **exactement le même périmètre**), **COUNT total des lignes concernées**, extrait d'échantillon, modification envisagée en langage clair, **triggers concernés**. Proposition **validée** : le code réutilise **la clause WHERE du SELECT validé** (sqlglot) — le LLM ne génère que la **partie SET**, vérification par le code — et produit le **script SQL de modification** (explications, estimation des lignes impactées, **liste des triggers impactés / effets de bord** classés **réversibles par le rollback** / **non réversibles**) ainsi que le **script de rollback testable** (transaction + sauvegarde préalable : table de backup créée **dans la même transaction** que l'UPDATE). Chaque script UPDATE embarque un **contrôle de dérive des données** (recomptage des lignes ciblées en tête de script ; annulation de la transaction si le nombre diffère au-delà d'une tolérance paramétrable par projet). Chaque script porte un **en-tête** (valideurs, horodatage, hash du SELECT validé, mention « Exécution hors Yasna, sous la responsabilité de l'exécutant ») ; **Yasna s'arrête à la génération du script**.

**Validation humaine obligatoire** à chaque étape de proposition ou d'action, selon un **circuit de validation paramétrable par projet** qui reproduit le **processus de validation réel de l'organisation** (cf. section 6) : revue des propositions par le ou les **Décideur(s)**, journalisation automatique des validations. **Aucun script de modification n'est jamais exécuté automatiquement par Yasna.**  

**Souveraineté** : **API externe configurable par défaut** (fournisseur souverain), mode local optionnel. Le fournisseur LLM est interchangeable sans modification de code (couche fournisseur, configuration par variables d'environnement). En production, tout envoi de données sensibles vers le LLM exige un fournisseur **qualifié SecNumCloud** sur le service d'IA utilisé (sinon l'envoi est bloqué par le code).

**Valeur ajoutée :**
- Parcours guidé avec une action et un attendu clairs à chaque phase (cadrage, validation du contexte, analyse, spécification, revue décisionnelle).
- Réduction forte des délais (de plusieurs mois à quelques semaines).
- Allègement de la charge des experts techniques et métier.
- Préparation réelle des données pour une IA utile.
- Outil léger et abordable, conçu pour les grandes administrations et organismes publics.

## 4. Solutions existantes

- Scripts maison : précis mais trop lents et dépendants d'experts.
- Outils professionnels (IBM, Informatica, Ataccama…) : puissants mais lourds, chers et peu « métier-first ».
- Outils open-source (OpenRefine, Great Expectations, Soda…) : gratuits mais sans compréhension métier automatique ni génération de scripts + rollback.
- Outils IA récents : rapides sur des cas simples, insuffisants sur des bases legacy complexes.

Aucune solution actuelle ne propose le combo complet de Yasna (compréhension métier + normalisation + scripts sécurisés + souveraineté configurable) de façon légère et pensée pour le secteur public.

## 5. Opportunité et maturité du marché

Le marché mondial des outils de Data Quality (nettoyage et amélioration de la qualité des données) reste en croissance.

`À COMPLÉTER : sources` — tailles de marché (montants, années) et taux de croissance (CAGR) à référencer explicitement (cabinet, année, périmètre retenu). Aucun chiffre n'est avancé sans source vérifiée.

En Europe, et particulièrement en France, la demande est soutenue dans le secteur public (modernisation des SI, exigences RGPD/AI Act, besoin de données fiables pour l'IA).

**Maturité du marché :**
- Le nettoyage « classique » (règles manuelles, dédoublonnage, standardisation) est mature.
- L'« Augmented Data Quality » (utilisation de l'IA pour détecter, expliquer et proposer des corrections en tenant compte du contexte métier) est en évolution active.

`À COMPLÉTER : sources` pour la segmentation de marché (Gartner, IDC, etc. — publications, années).

**Opportunités pour Yasna :**
- Répondre à un besoin réel et durable des administrations.
- Se différencier par une approche « métier-first » (compréhension des règles de gestion) + souveraineté configurable (fournisseur qualifié SecNumCloud pour les données sensibles) + génération de scripts sécurisés.
- Cibler les grandes administrations et organismes publics (applications développées en interne, équipes techniques en place).

## 6. Principes de sécurité et conformité

Yasna doit respecter les exigences du secteur public français :

- **CNIL** : Privacy by Design, minimisation des données, journalisation des accès, possibilité d'export/suppression, documentation des traitements (Guide RGPD du développeur + recommandations IA).
- **ANSSI** : DevSecOps, moindre privilège, analyse statique et dynamique, gestion sécurisée des secrets, recommandations pour les systèmes d'IA (autorisations **indépendantes du modèle**, validation humaine pour les opérations critiques, arrêt d'urgence).
- **DINUM** : souveraineté, interopérabilité, logiciel libre encouragé.

### Rôles et circuit de validation

**Trois rôles** :

| Rôle | Profil réel | Droits |
|---|---|---|
| **Opérationnel** | Chargé de qualité des données, MOE applicative, analyste de données (pas un agent d'instruction) | Phases 1 à 7 : cadrage, analyse, SELECT sur petit échantillon. Ne peut pas générer d'UPDATE. |
| **Décideur** | MOA propriétaire des données (responsable métier de l'application) ; éventuellement un responsable technique selon l'organisation | Valide le contexte métier figé (phase 2), revoit les propositions, les valide ou les refuse, déclenche la génération de l'UPDATE. |
| **Administrateur** | Équipe technique / exploitation de l'administration | Comptes et rôles, connexion BDD, paramétrage du circuit de validation, arrêt d'urgence. MFA obligatoire. N'est pas utilisé au quotidien. |

**Parcours après la phase 7** : SELECT OK sur l'échantillon → proposition transmise au(x) Décideur(s) → revue → **validée** (génération du script UPDATE + rollback) ou **refusée avec motif** (retour à l'Opérationnel).

**Circuit de validation paramétrable par projet** : le circuit **reproduit le processus de validation réel de l'organisation**. Il est recueilli lors du cadrage avec la MOA et la DSI, puis paramétré par l'Administrateur à l'initialisation du projet (phase 2) :
- nombre de validations distinctes requises (1 ou 2) ;
- rôle ou profil exigé pour chaque validation (ex. MOA seule, ou MOA + responsable technique) ;
- auto-validation (un Décideur valide sa propre proposition) : autorisée ou interdite.

**Valeurs par défaut** : 1 validation par un Décideur, auto-validation **interdite**. Toute modification du circuit est réservée à l'Administrateur et journalisée.

**Dossier de revue** : besoin, SELECT, COUNT total des lignes concernées, extrait d'échantillon, modification envisagée en langage clair, triggers concernés.

**UPDATE lié au SELECT validé** : le code réutilise la clause WHERE du SELECT validé (sqlglot), le LLM ne génère que la partie SET. Vérification par le code.

**Responsabilité** : Yasna s'arrête à la génération du script. L'en-tête du script indique les valideurs, l'horodatage, le hash du SELECT validé et la mention **« Exécution hors Yasna, sous la responsabilité de l'exécutant »**. Aucune validation après génération du script.

### Données envoyées au LLM (minimisation)

- Par défaut, le LLM ne reçoit **que** le schéma, les objets SQL et des **statistiques agrégées** (comptages, taux de NULL, distributions, formats détectés), **jamais de lignes brutes**.
- Si des exemples de lignes sont nécessaires : **pseudonymisation obligatoire** avant envoi (colonnes identifiantes masquées ou remplacées).
- En production, si des données sensibles doivent être envoyées au LLM : le fournisseur configuré doit être **qualifié SecNumCloud** (sur le service d'IA utilisé, pas seulement l'infrastructure) ; à défaut, **l'envoi est bloqué par le code** (drapeau `LLM_PROVIDER_SECNUMCLOUD`). La minimisation reste obligatoire même chez un fournisseur qualifié.
- L'échantillon extrait n'est pas persisté sur le serveur Yasna au-delà de la session d'analyse (ou alors chiffré, avec une durée de conservation définie : `À COMPLÉTER : durée de conservation de l'échantillon`).

### Contenus non fiables (anti-injection)

**Tout contenu issu des documents uploadés et de la BDD (valeurs de colonnes, commentaires, etc.) est traité comme une donnée non fiable** : balisage clair dans les prompts (séparation stricte instructions / données), aucune instruction issue de ces contenus n'est suivie. Les contrôles déterministes (validation des requêtes, machine à états) restent la vraie barrière, pas le prompt.

### Contrôle déterministe des requêtes SQL

Conformément au principe ANSSI « autorisations indépendantes du modèle », chaque requête générée par le LLM est validée par le **code**, pas par le prompt :

- Rôle PostgreSQL avec des `GRANT SELECT` limités à la table et aux colonnes du périmètre du projet.
- Paramètres côté rôle : `default_transaction_read_only = on` et `statement_timeout` défini.
- Analyse syntaxique avec `sqlglot` avant exécution : **une seule instruction**, uniquement `SELECT`, uniquement des tables/colonnes autorisées, `LIMIT` imposé, pas de fonctions système.
- `EXPLAIN` préalable : refus si le coût estimé dépasse un seuil configurable.
- Toute requête refusée est **journalisée avec le motif du refus**.

### Arrêt d'urgence

Un **arrêt d'urgence** (action d'un administrateur) coupe immédiatement les appels LLM et la connexion BDD ; l'événement est journalisé (exigence du référentiel ANSSI pour l'IA agentique).

### Intégrité du journal d'audit

Le journal d'audit est en **ajout seul (append-only)**, avec entrées **chaînées par hash** pour empêcher toute modification après coup. Durée de conservation : `À COMPLÉTER`.

### Authentification et exposition de l'UI

Streamlit n'offre pas d'authentification robuste et gère mal les headers de sécurité : un **reverse proxy** (Caddy ou nginx) est placé devant l'UI et l'API, chargé du **TLS** et des **headers de sécurité** (CSP, etc.), avec une authentification **OIDC** (ProConnect envisageable pour les agents publics, sinon l'annuaire de l'administration). Les rôles (**opérationnel, décideur, administrateur**) sont gérés côté API.

### Bases de données supportées

**PoC : PostgreSQL uniquement.** Les SI legacy des administrations tournent souvent sur Oracle, DB2 ou SQL Server : l'architecture prévoit une **interface d'adaptateur** par SGBD (extraction du schéma et des triggers, dialecte sqlglot) pour les versions suivantes. **Feuille de route** : l'adaptateur pour un **SGBD legacy (DB2 / Oracle) est la priorité n° 1 après le PoC** — SGBD prioritaire : `À COMPLÉTER`. Tout code spécifique à PostgreSQL reste dans `db_adapters/postgresql`, jamais ailleurs.

### Modèle cible

`À COMPLÉTER : modèle cible du PoC` (via l'API Mistral) et sa fenêtre de contexte. Le mode local est **optionnel** : les considérations matérielles (GPU, RAM) sont traitées dans la section « Déploiement local (optionnel) » ci-dessous.

**Déploiement local (optionnel)** — pour un fonctionnement 100 % local, prévoir le matériel dédié (GPU, RAM) adapté au modèle retenu et à sa fenêtre de contexte ; `À COMPLÉTER : configuration matérielle de référence`.

### RGPD et sous-traitance (API externe)

L'administration reste **responsable du traitement** ; le fournisseur LLM est **sous-traitant** (article 28 du RGPD) : contrat de sous-traitance, localisation des données, non-réutilisation des prompts pour l'entraînement, durée de conservation des logs du fournisseur : `À COMPLÉTER`. La responsabilité est **partagée, elle n'est pas transférée** au fournisseur.

Pour les administrations de l'État, leurs opérateurs (article 31 de la loi SREN n° 2024-449 et son décret d'application d'avril 2026) et, selon l'évolution du texte en cours, les collectivités de plus de 30 000 habitants : un fournisseur **qualifié SecNumCloud** est requis pour les données sensibles. Vérifier que la qualification porte bien sur le **service d'IA utilisé**, pas seulement sur l'infrastructure.

### Cadre réglementaire

- `À COMPLÉTER : qualification AI Act` — analyse écrite de la qualification de Yasna (l'outil ne décide pas de l'éligibilité des personnes, mais modifie des données qui servent à l'attribuer).
- `À COMPLÉTER : AIPD` — l'analyse d'impact RGPD (AIPD) relève de l'administration responsable du traitement ; Yasna fournit les éléments nécessaires (traitements effectués, données manipulées, mesures de sécurité).

### Autres exigences

- Validation humaine obligatoire avant toute génération de script de modification de données (circuit de validation paramétrable par projet — cf. section 6, dossier de revue, journalisation).
- **API externe configurable par défaut + mode local optionnel** (couche fournisseur interchangeable, cf. section 8).
- Conteneurisation sécurisée (non-root, capabilities droppées, réseau isolé).
- Pas de secrets en dur, validation stricte des entrées, headers de sécurité (via reverse proxy).
- **Chat de cadrage** : seuls des documents projet non personnels (circulaires, SFD, STD, DEX…) y sont chargés ; ces documents transitent vers le fournisseur du LLM configuré. Aucune donnée personnelle (bénéficiaires…) ne doit y être saisie.
- **Connexion BDD** : rôle PostgreSQL strictement lecture seule à l'analyse ; requêtes SELECT bornées (LIMIT / échantillonnage, timeout) et contrôlées de façon déterministe (cf. ci-dessus).
- **Effets de bord SQL** : tout script de modification généré doit lister les triggers/contraintes impactés, classés en **réversibles par le rollback** / **non réversibles** (avec description de l'effet) ; un effet non réversible est signalé explicitement dans le dossier de revue. Le rollback doit être testable (transaction + sauvegarde préalable dans la même transaction que l'UPDATE). La table de backup contient des données personnelles : durée de conservation et suppression à prévoir (`À COMPLÉTER`).

## 7. Chemin vers la production

Le passage à la production suit quatre étapes : **PoC sur données fictives → copie de recette → pré-production → production**.

### Prérequis avant toute connexion à une base contenant des données réelles

- **Homologation de sécurité (RGS)** de l'administration ;
- accord du **DPO** ;
- **AIPD** réalisée par l'administration ;
- déploiement de Yasna **dans le réseau de l'administration** ;
- **flux sortant** vers le fournisseur LLM **qualifié SecNumCloud** documenté et autorisé.

### Kit d'homologation fourni par Yasna

- **Schéma d'architecture** ;
- **cartographie des flux de données** (ce qui part vers le LLM, ce qui reste) ;
- **mesures de sécurité appliquées** (renvoi au référentiel ANSSI du dépôt) ;
- **matrice des rôles et du circuit de validation** ;
- **éléments pour l'AIPD**.

Ce kit figure parmi les **livrables de la feuille de route** (cf. section 9).

## 8. Stack technique et architecture

- **Backend** : Python 3.12+ + FastAPI  
- **Interface** : Streamlit derrière un **reverse proxy** (Caddy ou nginx : TLS, headers de sécurité)  
- **Authentification** : **OIDC** (ex. ProConnect pour les agents publics, sinon annuaire de l'administration) ; rôles gérés côté API  
- **Base de données** : PostgreSQL (PoC) ; interface d'adaptateur par SGBD (Oracle, DB2, SQL Server…) prévue pour les versions suivantes  
- **ORM** : SQLAlchemy 2.0  
- **IA** : **couche fournisseur LLM interchangeable**, configurée uniquement par variables d'environnement (`LLM_BASE_URL`, `LLM_API_KEY` en `SecretStr`, `LLM_MODEL`, `LLM_PROVIDER_SECNUMCLOUD=true/false`), via une API compatible OpenAI. Passer de l'API Mistral à une offre SecNumCloud ou à un modèle local (Ollama) ne doit demander **aucune modification de code**.  
- **Contrôle SQL** : `sqlglot` (analyse syntaxique) + `EXPLAIN` (seuil de coût) avant toute exécution  
- **Conteneurisation** : Docker + Docker Compose sécurisé (non-root, capabilities droppées)  
- **Tests** : pytest + bandit + Trivy  

**Architecture**  
Respect d'une séparation claire des responsabilités (approche type MVC / Clean Architecture) :
- **Modèle** : logique métier, accès aux données, règles de gestion, génération des scripts SQL, détection d'anomalies, adaptateurs SGBD.
- **Vue** : interface Streamlit (simple, orientée agents administratifs), servie derrière le reverse proxy.
- **Contrôleur / Services** : orchestration des phases Yasna, appels à l'IA (couche fournisseur interchangeable), pipeline multi-agents, gestion des validations humaines, journalisation.

**Orchestrateur = machine à états.** Le déroulé des 8 phases est imposé par le **code**, pas par le prompt :
- Chaque phase a un **état d'entrée requis** ; l'API refuse toute action hors séquence.
- La génération de l'UPDATE exige une **proposition validée par le circuit décisionnel**, portant sur un SELECT **validé et journalisé**, référencé par son **identifiant** et son **hash**. Le script UPDATE porte sur **exactement le même périmètre** que ce SELECT (clause WHERE réutilisée, vérification par le code).
- Un **arrêt d'urgence** (administrateur) coupe les appels LLM et la connexion BDD, et est journalisé ; l'état **ArretUrgence** est accessible depuis **tous** les états de la machine à états (cf. document Schémas).
- Le journal d'audit est **append-only, chaîné par hash**.

Structure modulaire recommandée : `core` / `rag` / `analysis` / `sql_generator` / `agents` / `llm` (couche fournisseur) / `db_adapters` / `api` / `ui`.

## 9. Roadmap produit et PoC

**Objectif du PoC**  
Démontrer la valeur de Yasna sur un périmètre réaliste et maîtrisable : **une table métier prioritaire** (exemple : table des bénéficiaires d'aides sociales), en déroulant le **parcours complet** : cadrage par la documentation projet + chat IA, initialisation du projet (avec validation du contexte figé par le Décideur et paramétrage du circuit de validation par l'Administrateur), connexion lecture seule, lien contexte métier ↔ BDD (y compris objets SQL), première analyse en suggestions, spécification du besoin, pipeline multi-agents (SELECT), puis proposition transmise au(x) Décideur(s), revue et génération des scripts UPDATE + rollback sur validation.  

Pour le PoC, le pipeline multi-agents est **simplifié** (cf. spécification détaillée du PoC) ; le pipeline 4 agents complet reste la **cible post-PoC**.  

Le PoC utilise une **API externe (Mistral), autorisée uniquement parce que les données du PoC sont fictives** (jeu de test + CDC PARINDIE).  

La cartographie métier↔technique dédiée et la proposition de schéma optimisé (3NF) sont **reportées après le PoC**.  

Voir le document dédié « PoC Yasna – Spécification détaillée » pour le détail des phases.  

**Suite après le PoC**  
Stabilisation ; adaptateur pour un SGBD legacy (DB2 / Oracle) en priorité n° 1 (SGBD prioritaire : `À COMPLÉTER`) ; extension à d'autres tables et à d'autres SGBD (adaptateurs), pipeline multi-agents complet (4 agents), cartographie dédiée et refonte de schéma (3NF), renforcement de la sécurité/conformité, packaging Docker, amélioration du RAG et de l'audit trail, **kit d'homologation** (cf. section 7).  

---

*Fin du document – Version 1.3 (base de travail)*
