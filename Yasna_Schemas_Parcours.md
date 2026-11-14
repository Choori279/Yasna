# Schémas du parcours Yasna

**Version 1.1 – Novembre 2026** — schémas du parcours en 8 phases décrit dans `Yasna_Document_Projet_v1.3.md` (section 3).

**Légende des lieux :**
- 🖥️ **PC utilisateur** : navigateur de l'utilisateur (rôles **opérationnel / décideur / administrateur**)
- 🐳 **Serveur Yasna** : conteneurs Docker (réseau isolé, non-root, capabilities droppées) derrière un **reverse proxy** (TLS, headers de sécurité)
- 🧠 **IA** : **API externe configurable par défaut** (fournisseur souverain, couche fournisseur interchangeable, variables d'environnement) ; **mode local optionnel** (Ollama)
- 🗄️ **BDD de l'administration** : PostgreSQL du SI, accessible **uniquement en lecture seule** (hors réseau Yasna)

---

## 1. Vue d'ensemble — acteurs, composants et lieux

```mermaid
flowchart LR
    subgraph PC["🖥️ PC de l'agent administratif (navigateur)"]
        UI["Interface Streamlit<br/>chat de cadrage, visualisations,<br/>validations, téléchargement des scripts"]
    end

    DOCS["Documents projet<br/>circulaires, SFD, STD, DEX…"]

    subgraph YASNA["🐳 Serveur Yasna (Docker, réseau isolé, non-root)"]
        PROXY["Reverse proxy (nginx)<br/>TLS + headers de sécurité + OIDC générique"]
        API["API FastAPI<br/>auth, rôles (opérationnel, décideur,<br/>administrateur), validation des entrées"]
        ORCH["Orchestrateur (machine à états)<br/>déroulé des 8 phases, refus hors séquence,<br/>arrêt d'urgence, circuit de validation paramétrable"]
        RAG["Base de connaissances du projet<br/>RAG : contexte figé + règles de gestion"]
        AGENTS["Agents IA<br/>A1 connaissances · A2 SELECT BDD<br/>A3 confirmation RG + résultats · A4 revue globale"]
        SQLCTRL["Contrôle SQL déterministe<br/>sqlglot + EXPLAIN + GRANT périmètre"]
        SQLGEN["Générateur SQL<br/>UPDATE + rollback, contrôle de dérive,<br/>triggers impactés classés réversibles / non réversibles"]
        AUDIT["Journal d'audit (append-only, chaîné par hash)<br/>accès, validations, scripts générés, refus"]
    end

    subgraph IAEXT["🧠/☁️ IA — couche fournisseur interchangeable"]
        LLMEXT["LLM via API externe configurable par défaut<br/>(fournisseur souverain, ex. Mistral)<br/>ou modèle local optionnel (Ollama)"]
    end

    subgraph BDD["🗄️ SI de l'administration (hors réseau Yasna)"]
        DB["PostgreSQL<br/>rôle lecture seule, GRANT SELECT limités<br/>schéma + stats agrégées + triggers"]
    end

    SCRIPT["Dossier de changement téléchargé<br/>scripts UPDATE + rollback + fiche de changement<br/>exécuté manuellement hors Yasna<br/>après validation du dossier de revue<br/>par le ou les Décideur(s)"]

    DOCS --> UI
    UI <--> PROXY <--> API
    API <--> ORCH
    ORCH <--> RAG
    ORCH <--> AGENTS
    AGENTS --> SQLCTRL
    SQLCTRL --> DB
    ORCH <--> SQLGEN
    ORCH --> AUDIT
    AGENTS <--> LLMEXT
    SQLGEN --> SCRIPT
    SCRIPT -. "jamais d'exécution automatique par Yasna" .-> DB
```

---

## 2. Machine à états de l'orchestrateur

L'ordre des phases est imposé par le **code** (machine à états), pas par le prompt : chaque phase a un état d'entrée requis et l'API refuse toute action hors séquence. La revue exige un SELECT **validé et journalisé**, référencé par son **identifiant** et son **hash**, portant sur **exactement le même périmètre** ; la génération de l'UPDATE n'est déclenchée que par une **proposition validée** par le circuit décisionnel.

```mermaid
stateDiagram-v2
    state "ContexteValidé" as ContexteValide
    state "Connecté" as Connecte
    state "Lié" as Lie
    state "Validé" as Valide
    state "ScriptsGénérés" as ScriptsGeneres
    state "ArretUrgence" as ArretUrgence

    [*] --> Cadrage
    Cadrage --> ContexteValide : synthèse du contexte validée par le Décideur
    ContexteValide --> Connecte : projet initialisé (circuit de validation paramétré par l'Administrateur)
    Connecte --> Lie : schéma + stats agrégées + objets SQL extraits
    Lie --> Suggestions : liens règles ↔ BDD établis
    Suggestions --> Besoin : besoin exprimé par l'Opérationnel (ou issu d'une suggestion)
    Besoin --> SelectOK : SELECT généré, contrôlé (sqlglot + EXPLAIN), exécuté borné, validé et journalisé (id + hash)
    SelectOK --> [*] : fin sans modification
    SelectOK --> EnRevue : dossier de revue transmis au(x) Décideur(s)
    EnRevue --> Besoin : refusée avec motif (retour à l'Opérationnel)
    EnRevue --> Valide : proposition validée (génération déclenchée)
    Valide --> ScriptsGeneres : UPDATE + rollback générés (WHERE du SELECT validé réutilisé, SET par le LLM, en-tête des scripts)
    ScriptsGeneres --> [*]

    Cadrage --> ArretUrgence : arrêt d'urgence (administrateur)
    ContexteValide --> ArretUrgence : arrêt d'urgence (administrateur)
    Connecte --> ArretUrgence : arrêt d'urgence (administrateur)
    Lie --> ArretUrgence : arrêt d'urgence (administrateur)
    Suggestions --> ArretUrgence : arrêt d'urgence (administrateur)
    Besoin --> ArretUrgence : arrêt d'urgence (administrateur)
    SelectOK --> ArretUrgence : arrêt d'urgence (administrateur)
    EnRevue --> ArretUrgence : arrêt d'urgence (administrateur)
    Valide --> ArretUrgence : arrêt d'urgence (administrateur)
    ScriptsGeneres --> ArretUrgence : arrêt d'urgence (administrateur)
```

---

## 3. Diagramme de séquence — phases 1 à 5 (cadrage → première analyse)

```mermaid
sequenceDiagram
    autonumber
    participant U as Opérationnel (utilisateur)
    participant D as Décideur (MOA)
    participant A as Administrateur
    participant UI as UI Streamlit
    participant API as API FastAPI
    participant ORCH as Orchestrateur (machine à états)
    participant RAG as Base de connaissances (RAG)
    participant LLM as IA (API externe par défaut, local optionnel)
    participant DB as PostgreSQL (lecture seule)
    participant AUD as Journal d'audit

    Note over U,AUD: Phase 1 — Cadrage par la documentation projet
    U->>UI: Upload documents (circulaires, SFD, STD, DEX)
    UI->>API: Documents + ouverture du chat de cadrage
    API->>LLM: 1ère analyse de compréhension du contexte
    LLM-->>API: Synthèse du contexte métier
    API->>RAG: Stockage de la base de connaissances
    U->>UI: Chat de cadrage (précisions si besoin)
    UI->>API: Réponses de l'utilisateur
    API->>LLM: Affinage du contexte
    LLM-->>UI: Synthèse mise à jour

    Note over U,AUD: Phase 2 — Initialisation du projet
    D->>UI: Valide le contexte métier figé (Décideur)
    UI->>API: Création du projet
    A->>API: Paramétrage du circuit de validation (1 ou 2 validations, rôles exigés, auto-validation)
    API->>RAG: Contexte figé
    API->>AUD: Journalisation (création projet, circuit, accès)

    Note over U,AUD: Phase 3 — Connexion BDD (lecture seule)
    API->>DB: Connexion read-only, extraction schéma + stats agrégées + triggers
    DB-->>API: Schéma, statistiques agrégées, objets SQL

    Note over U,AUD: Phase 4 — Lien contexte métier ↔ BDD
    ORCH->>RAG: Règles de gestion
    ORCH->>DB: Lecture schéma et objets SQL
    ORCH-->>UI: Liens règles ↔ tables, colonnes, triggers

    Note over U,AUD: Phase 5 — Première analyse (suggestions uniquement)
    API->>LLM: Analyse des potentiels manques (schéma + stats agrégées, pas de lignes brutes)
    LLM-->>UI: Suggestions expliquées par les règles (aucune action)
    API->>AUD: Journalisation des suggestions
```

---

## 4. Diagramme de séquence — phases 6 à 8 (besoin → agents → revue décisionnelle → scripts générés)

```mermaid
sequenceDiagram
    autonumber
    participant U as Opérationnel (utilisateur)
    participant D as Décideur (MOA)
    participant UI as UI Streamlit
    participant ORCH as Orchestrateur (machine à états)
    participant A1 as Agent 1 (connaissances)
    participant A2 as Agent 2 (BDD / SELECT)
    participant A3 as Agent 3 (confirmation)
    participant A4 as Agent 4 (revue globale)
    participant RAG as Base de connaissances
    participant SQLC as Contrôle SQL (sqlglot + EXPLAIN)
    participant SQLGEN as Générateur SQL
    participant DB as PostgreSQL (lecture seule)
    participant AUD as Journal d'audit

    Note over U,AUD: Phase 6 — Spécification du besoin utilisateur
    U->>UI: Exprime le besoin (ex. normaliser le format des numéros de téléphone)
    UI->>ORCH: Besoin formalisé

    Note over U,AUD: Phase 7 — Pipeline multi-agents (analyse en SELECT)
    ORCH->>A1: Démarrage du pipeline
    A1->>RAG: Récupération règles de gestion + contexte
    RAG-->>A1: Base de connaissances du projet
    ORCH->>A2: Analyse du besoin côté BDD
    A2->>SQLC: SELECT généré (LLM : schéma + stats agrégées)
    SQLC->>SQLC: sqlglot : 1 instruction, SELECT, tables/colonnes autorisées, LIMIT, EXPLAIN < seuil
    SQLC-->>A2: Requête validée (ou refusée + motif journalisé)
    A2->>DB: SELECT borné (LIMIT, timeout)
    DB-->>A2: Statistiques agrégées (lignes pseudonymisées si exemples nécessaires)
    A2-->>A3: Requête SELECT validée + statistiques
    A3-->>A4: Confirmation (agrégation RG + statistiques, pas de lignes brutes)
    A4-->>UI: Revue globale + résultats présentés à l'utilisateur
    ORCH->>AUD: Journalisation du SELECT validé (identifiant + hash)

    Note over U,AUD: Phase 8 — Revue décisionnelle puis génération UPDATE + rollback
    ORCH-->>UI: Dossier de revue (besoin, SELECT, COUNT total, échantillon, modification en langage clair, triggers)
    UI->>D: Proposition transmise au(x) Décideur(s) (circuit paramétré en phase 2)
    D->>UI: Revue du dossier de revue
    UI->>AUD: Journalisation de la revue
    alt Proposition validée
        D->>UI: Validation (horodatée, nominative, journalisée)
        UI->>ORCH: Validation enregistrée — génération déclenchée
        ORCH->>A1: Les 4 agents retravaillent
        ORCH->>A2: Reconstruction en mode modification
        A2->>SQLGEN: Script UPDATE (WHERE du SELECT validé réutilisé par le code, SET généré par le LLM) + estimation d'impact
        SQLGEN->>SQLGEN: Vérification même périmètre + triggers classés réversibles / non réversibles + rollback testable (même transaction) + contrôle de dérive
        SQLGEN-->>A4: Scripts + impacts + effets de bord
        A4-->>UI: Scripts accompagnés du résumé des impacts
        Note over U,AUD: En-tête des scripts : valideurs, horodatage, hash du SELECT validé, « Exécution hors Yasna, sous la responsabilité de l'exécutant »
        U->>UI: Téléchargement des scripts (UPDATE + rollback)
        Note over U,AUD: Exécution manuelle hors Yasna, sous la responsabilité de l'exécutant — jamais automatique
    else Proposition refusée avec motif
        D->>UI: Refus avec motif (journalisé)
        UI-->>U: Retour à l'Opérationnel (retour au besoin, phase 6)
    end
```

---

## 5. Flowchart du parcours — phases et points de décision

```mermaid
flowchart TD
    P1["Phase 1 : Cadrage<br/>upload docs projet + chat IA"] --> D1{"Contexte métier<br/>validé par le<br/>Décideur ?"}
    D1 -- non --> P1
    D1 -- oui --> P2["Phase 2 : Projet initialisé<br/>base de connaissances figée + journalisation<br/>circuit de validation paramétré par l'Administrateur<br/>(validations 1 ou 2, rôles exigés, auto-validation)"]
    P2 --> P3["Phase 3 : Connexion BDD<br/>lecture seule — schéma, stats agrégées, triggers"]
    P3 --> P4["Phase 4 : Lien contexte métier ↔ BDD<br/>(tables, colonnes, triggers, contraintes)"]
    P4 --> P5["Phase 5 : 1ère analyse<br/>suggestions de manques uniquement<br/>(transformables en besoin en un clic)"]
    P5 --> P6["Phase 6 : Spécification du besoin par l'Opérationnel<br/>ex. normaliser le format des numéros de téléphone"]
    P6 --> P7["Phase 7 : Pipeline agents<br/>SELECT contrôlé (sqlglot + EXPLAIN) puis exécuté borné<br/>→ SELECT validé et journalisé (id + hash)"]
    P7 --> P8["Résultats SELECT + revue globale<br/>dossier de revue constitué (COUNT total des lignes,<br/>extrait d'échantillon, modification en langage clair, triggers)"]
    P8 --> D2{"Passage en revue<br/>décisionnelle ?"}
    D2 -- non --> F1["Fin sans modification<br/>résultats archivés dans le journal d'audit"]
    D2 -- oui --> D3{"Révues décisionnelles<br/>selon le circuit paramétré<br/>(défaut : 1 Décideur,<br/>auto-validation interdite) ?"}
    D3 -- "refusée avec motif" --> P6
    D3 -- validée --> P9["Génération : WHERE du SELECT validé réutilisé (sqlglot),<br/>SET généré par le LLM, vérification par le code<br/>triggers classés réversibles / non réversibles<br/>rollback testable + contrôle de dérive + en-tête des scripts"]
    P9 --> F2["Dossier de changement téléchargé<br/>(scripts UPDATE + rollback + fiche de changement)<br/>exécution manuelle hors Yasna<br/>sous la responsabilité de l'exécutant<br/>JAMAIS automatique"]
```

---

## 6. Tableau récapitulatif — qui fait quoi, où, avec quelles données

| Acteur | Rôle dans le parcours | Lieu | Données manipulées |
|--------|----------------------|------|-------------------|
| **Opérationnel** (utilisateur, ex. chargé de qualité des données, MOE applicative, analyste de données) | Upload des documents, chat de cadrage, expression du besoin, lancement de l'analyse (phases 1 à 7) ; ne peut pas générer d'UPDATE | 🖥️ PC (navigateur) | Documents projet, besoins, résultats d'analyse |
| **Décideur** (MOA propriétaire des données ; éventuellement un responsable technique selon l'organisation) | Valide le contexte métier figé (phase 2), revoit les propositions (dossier de revue), les valide ou les refuse avec motif, déclenche la génération de l'UPDATE | 🖥️ PC (navigateur) | Dossier de revue, validations (défaut : 1 validation, auto-validation interdite) |
| **Administrateur** (équipe technique / exploitation) | Comptes et rôles, connexion BDD, paramétrage du circuit de validation, arrêt d'urgence ; MFA obligatoire ; pas d'usage quotidien | 🖥️ PC (navigateur) | Paramètres du circuit, actions d'administration |
| **Reverse proxy** | TLS, headers de sécurité (CSP…), authentification **OIDC générique** devant l'UI et l'API | 🐳 Serveur Yasna | Requêtes HTTP |
| **UI Streamlit** | Chat, visualisations (suggestions, résultats, scripts), formulaires de validation | 🐳 Serveur Yasna (conteneur UI) | Données d'affichage uniquement |
| **API FastAPI** | Point d'entrée unique, auth + rôles (opérationnel, décideur, administrateur), validation stricte des entrées, refus des actions hors séquence | 🐳 Serveur Yasna | Requêtes, métadonnées |
| **Orchestrateur (machine à états)** | Déroulé des 8 phases imposé par le code, circuit de validation paramétrable, arrêt d'urgence, journalisation | 🐳 Serveur Yasna | États du projet, identifiant + hash du SELECT validé |
| **Base de connaissances (RAG)** | Contexte métier figé + règles de gestion, interrogée par les agents | 🐳 Serveur Yasna | Documents projet vectorisés (non personnels) |
| **Agent 1** | Récupère la base de connaissances du projet | 🐳 Serveur Yasna | Règles de gestion + contexte |
| **Agent 2** | Construit le SELECT puis l'UPDATE à partir du schéma et des objets SQL ; lit la BDD via les contrôles déterministes | 🐳 Serveur Yasna → 🗄️ BDD | Schéma, objets SQL, statistiques agrégées (lignes brutes jamais envoyées au LLM ; pseudonymisation obligatoire si exemples) |
| **Agent 3** | Agrège règles de gestion + statistiques des résultats du SELECT pour confirmation | 🐳 Serveur Yasna | Règles de gestion + statistiques agrégées (jamais de lignes brutes) |
| **Agent 4** | Revue globale, communication des résultats/scripts à l'utilisateur | 🐳 Serveur Yasna | Rapport de revue (statistiques agrégées, scripts) |
| **IA (LLM)** | Compréhension du contexte, chat, génération, revue | 🧠/☁️ API externe configurable par défaut (fournisseur souverain ; SecNumCloud requis en production pour données sensibles) ou local optionnel | Prompts/réponses : **schéma, objets SQL et statistiques agrégées uniquement** ; lignes pseudonymisées si exemples nécessaires ; jamais de lignes brutes |
| **Contrôle SQL (déterministe)** | sqlglot (1 instruction, SELECT, tables/colonnes autorisées, LIMIT) + EXPLAIN (seuil de coût) + refus journalisé avec motif | 🐳 Serveur Yasna | Requêtes générées, motifs de refus |
| **Générateur SQL** | Scripts UPDATE + rollback, clause WHERE du SELECT validé réutilisée (sqlglot) + SET généré par le LLM, triggers impactés classés réversibles / non réversibles, contrôle de dérive, estimation d'impact, en-tête des scripts | 🐳 Serveur Yasna | Scripts (jamais exécutés par Yasna) |
| **PostgreSQL (SI de l'administration)** | Source des données | 🗄️ Hors réseau Yasna | Accès **lecture seule** (rôle à privilèges minimaux, GRANT SELECT limités au périmètre, statement_timeout) |
| **Journal d'audit** | Traçabilité CNIL/ANSSI : accès, validations, scripts générés, refus — **append-only, entrées chaînées par hash** | 🐳 Serveur Yasna | Logs d'audit (sans données sensibles en clair) |

---

## 7. Points de sécurité visibles sur les schémas

- La BDD n'est jamais modifiée par Yasna : connexion **lecture seule** (rôle PostgreSQL dédié, `GRANT SELECT` limités au périmètre, `default_transaction_read_only`, `statement_timeout`), requêtes SELECT **contrôlées de façon déterministe** (sqlglot : une seule instruction, SELECT uniquement, tables/colonnes autorisées, LIMIT imposé ; EXPLAIN sous seuil de coût) puis **bornées** (LIMIT/timeout), et les scripts UPDATE/rollback sont **téléchargés puis exécutés manuellement hors Yasna**, après **validation du dossier de revue par le ou les Décideur(s)** (circuit de validation paramétrable par projet).
- L'ordre des phases est imposé par une **machine à états** (diagramme 2) : l'API refuse toute action hors séquence ; l'UPDATE exige un SELECT validé et journalisé (identifiant + hash, même périmètre).
- **Minimisation des données envoyées au LLM** : schéma, objets SQL et statistiques agrégées uniquement ; jamais de lignes brutes ; **pseudonymisation obligatoire** si des exemples sont nécessaires ; en production, fournisseur **qualifié SecNumCloud** requis pour les données sensibles (sinon envoi bloqué par le code, drapeau `LLM_PROVIDER_SECNUMCLOUD`).
- L'IA est une **couche fournisseur interchangeable** : **API externe configurable par défaut** (fournisseur souverain), **mode local optionnel** ; clés jamais en dur (variables d'environnement `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CADRAGE`, `LLM_MODEL_SQL`, `LLM_MODEL_EMBEDDING`, `LLM_PROVIDER_SECNUMCLOUD`).
- **Arrêt d'urgence** : un administrateur peut couper immédiatement les appels LLM et la connexion BDD (journalisé).
- **Journal d'audit append-only, chaîné par hash** : accès, validations, scripts générés, refus — sans données sensibles en clair dans les logs.
- **Exposition sécurisée** : reverse proxy nginx (TLS, headers de sécurité) + authentification **OIDC générique** (aucun fournisseur codé en dur ; PoC : Keycloak en conteneur) devant l'UI et l'API ; rôles gérés côté API.
- Le **chat de cadrage** n'accepte que des documents projet non personnels (circulaires, SFD, STD, DEX…) : aucune donnée de bénéficiaires ; tout contenu des documents et de la BDD est traité comme **non fiable** (aucune instruction issue de ces contenus n'est suivie).
- Conteneurs **non-root, capabilities droppées, réseau isolé** ; scripts générés avec **triggers impactés classés réversibles / non réversibles**, **contrôle de dérive** et **rollback testable** (transaction + sauvegarde préalable dans la même transaction).

---

*Fin des schémas – Version 1.1*
