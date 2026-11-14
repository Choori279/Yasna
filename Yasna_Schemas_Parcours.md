# Schémas du parcours Yasna

**Version 1.1 – Novembre 2026** — schémas du parcours en 8 phases décrit dans `Yasna_Document_Projet_v1.3.md` (section 3).

**Légende des lieux :**
- 🖥️ **PC utilisateur** : navigateur de l'agent administratif (valideur MOA / valideur technique)
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
        PROXY["Reverse proxy (Caddy/nginx)<br/>TLS + headers de sécurité + OIDC"]
        API["API FastAPI<br/>auth, rôles (demandeur, valideur MOA,<br/>valideur technique, admin), validation des entrées"]
        ORCH["Orchestrateur (machine à états)<br/>déroulé des 8 phases, refus hors séquence,<br/>arrêt d'urgence, workflow de double validation"]
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

    SCRIPT["Scripts SQL téléchargés<br/>exécutés manuellement hors Yasna<br/>après double validation MOA + technique"]

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

L'ordre des phases est imposé par le **code** (machine à états), pas par le prompt : chaque phase a un état d'entrée requis et l'API refuse toute action hors séquence. La génération de l'UPDATE exige un SELECT **validé et journalisé**, référencé par son **identifiant** et son **hash**, portant sur **exactement le même périmètre**.

```mermaid
stateDiagram-v2
    [*] --> Cadrage
    Cadrage --> ContexteValide : synthèse validée explicitement
    ContexteValide --> Connecte : projet initialisé
    Connecte --> Lie : schéma + stats agrégées + objets SQL extraits
    Lie --> Suggestions : liens règles ↔ BDD établis
    Suggestions --> Besoin : besoin exprimé (ou issu d'une suggestion)
    Besoin --> SelectValide : SELECT généré, contrôlé (sqlglot + EXPLAIN), exécuté borné, validé et journalisé (id + hash)
    SelectValide --> ScriptsGeneres : demande explicite UPDATE + rollback (même périmètre que le SELECT)
    ScriptsGeneres --> ScriptsValides : double validation MOA (métier) + technique (MOE/DSI) et revue de script
    ScriptsValides --> Telecharges : téléchargement des scripts
    Telecharges --> [*]
```

---

## 3. Diagramme de séquence — phases 1 à 5 (cadrage → première analyse)

```mermaid
sequenceDiagram
    autonumber
    participant U as Utilisateur (PC)
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
    U->>UI: Valide explicitement la synthèse du contexte
    UI->>API: Création du projet
    API->>RAG: Contexte figé
    API->>AUD: Journalisation (création projet, accès)

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

## 4. Diagramme de séquence — phases 6 à 8 (besoin → agents → scripts validés)

```mermaid
sequenceDiagram
    autonumber
    participant U as Utilisateur (PC)
    participant VMOA as Valideur MOA (métier)
    participant VTEC as Valideur technique (MOE/DSI)
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
    U->>UI: Exprime le besoin (ex. NULL vers 0 sur les montants)
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

    Note over U,AUD: Phase 8 — UPDATE + rollback sur demande explicite
    U->>UI: Demande explicitement l'UPDATE + rollback
    UI->>ORCH: Demande tracée (machine à états : exige le SELECT validé, même périmètre)
    ORCH->>A1: Les 4 agents retravaillent
    ORCH->>A2: Reconstruction en mode modification
    A2->>SQLGEN: Script UPDATE + estimation d'impact
    SQLGEN->>SQLGEN: Triggers classés réversibles / non réversibles + rollback testable (même transaction) + contrôle de dérive
    SQLGEN-->>A4: Scripts + impacts + effets de bord
    A4-->>UI: Revue globale des scripts
    VMOA->>UI: Validation MOA (métier) — horodatée, nominative
    VTEC->>UI: Validation technique (MOE/DSI) — horodatée, nominative (personne distincte)
    UI->>AUD: Double validation journalisée
    U->>UI: Téléchargement des scripts (correction + rollback)
    Note over U,AUD: Exécution manuelle hors Yasna — jamais automatique
```

---

## 5. Flowchart du parcours — phases et points de décision

```mermaid
flowchart TD
    P1["Phase 1 : Cadrage<br/>upload docs projet + chat IA"] --> D1{"Contexte validé<br/>explicitement par<br/>l'utilisateur ?"}
    D1 -- non --> P1
    D1 -- oui --> P2["Phase 2 : Projet initialisé<br/>base de connaissances figée + journalisation"]
    P2 --> P3["Phase 3 : Connexion BDD<br/>lecture seule — schéma, stats agrégées, triggers"]
    P3 --> P4["Phase 4 : Lien contexte métier ↔ BDD<br/>(tables, colonnes, triggers, contraintes)"]
    P4 --> P5["Phase 5 : 1ère analyse<br/>suggestions de manques uniquement<br/>(transformables en besoin en un clic)"]
    P5 --> P6["Phase 6 : Spécification du besoin<br/>ex. NULL → 0 dans la table des montants"]
    P6 --> P7["Phase 7 : Pipeline agents<br/>SELECT contrôlé (sqlglot + EXPLAIN) puis exécuté borné<br/>→ SELECT validé et journalisé (id + hash)"]
    P7 --> P8["Résultats SELECT + revue globale<br/>présentés à l'utilisateur"]
    P8 --> D2{"L'utilisateur demande<br/>l'UPDATE + rollback ?"}
    D2 -- non --> F1["Fin sans modification<br/>résultats archivés dans le journal d'audit"]
    D2 -- oui --> P9["Agents retravaillent :<br/>script UPDATE + rollback testable<br/>triggers classés réversibles / non réversibles<br/>contrôle de dérive + estimation d'impact"]
    P9 --> D3{"Double validation ?<br/>MOA (métier) ET technique (MOE/DSI)<br/>par deux personnes distinctes<br/>+ revue de script (checklist)"}
    D3 -- non --> P9
    D3 -- oui --> F2["Scripts téléchargés<br/>exécution manuelle hors Yasna<br/>JAMAIS automatique"]
```

---

## 6. Tableau récapitulatif — qui fait quoi, où, avec quelles données

| Acteur | Rôle dans le parcours | Lieu | Données manipulées |
|--------|----------------------|------|-------------------|
| **Utilisateur** (agent administratif) | Upload des documents, chat de cadrage, validation du contexte, expression du besoin, téléchargement des scripts | 🖥️ PC (navigateur) | Documents projet, besoins, validations |
| **Valideur MOA (métier)** | Validation métier des scripts (double validation) | 🖥️ PC (navigateur) | Scripts, impacts, validations (personne distincte du valideur technique) |
| **Valideur technique (MOE/DSI)** | Validation technique des scripts (double validation) + revue de script | 🖥️ PC (navigateur) | Scripts, impacts, validations (personne distincte du valideur MOA) |
| **Administrateur** | Arrêt d'urgence (coupe les appels LLM et la connexion BDD, journalisé) | 🖥️ PC (navigateur) | Actions d'administration |
| **Reverse proxy** | TLS, headers de sécurité (CSP…), authentification OIDC devant l'UI et l'API | 🐳 Serveur Yasna | Requêtes HTTP |
| **UI Streamlit** | Chat, visualisations (suggestions, résultats, scripts), formulaires de validation | 🐳 Serveur Yasna (conteneur UI) | Données d'affichage uniquement |
| **API FastAPI** | Point d'entrée unique, auth + rôles (demandeur, valideur MOA, valideur technique, administrateur), validation stricte des entrées, refus des actions hors séquence | 🐳 Serveur Yasna | Requêtes, métadonnées |
| **Orchestrateur (machine à états)** | Déroulé des 8 phases imposé par le code, workflow de double validation, arrêt d'urgence, journalisation | 🐳 Serveur Yasna | États du projet, identifiant + hash du SELECT validé |
| **Base de connaissances (RAG)** | Contexte métier figé + règles de gestion, interrogée par les agents | 🐳 Serveur Yasna | Documents projet vectorisés (non personnels) |
| **Agent 1** | Récupère la base de connaissances du projet | 🐳 Serveur Yasna | Règles de gestion + contexte |
| **Agent 2** | Construit le SELECT puis l'UPDATE à partir du schéma et des objets SQL ; lit la BDD via les contrôles déterministes | 🐳 Serveur Yasna → 🗄️ BDD | Schéma, objets SQL, statistiques agrégées (lignes brutes jamais envoyées au LLM ; pseudonymisation obligatoire si exemples) |
| **Agent 3** | Agrège règles de gestion + statistiques des résultats du SELECT pour confirmation | 🐳 Serveur Yasna | Règles de gestion + statistiques agrégées (jamais de lignes brutes) |
| **Agent 4** | Revue globale, communication des résultats/scripts à l'utilisateur | 🐳 Serveur Yasna | Rapport de revue (statistiques agrégées, scripts) |
| **IA (LLM)** | Compréhension du contexte, chat, génération, revue | 🧠/☁️ API externe configurable par défaut (fournisseur souverain ; SecNumCloud requis en production pour données sensibles) ou local optionnel | Prompts/réponses : **schéma, objets SQL et statistiques agrégées uniquement** ; lignes pseudonymisées si exemples nécessaires ; jamais de lignes brutes |
| **Contrôle SQL (déterministe)** | sqlglot (1 instruction, SELECT, tables/colonnes autorisées, LIMIT) + EXPLAIN (seuil de coût) + refus journalisé avec motif | 🐳 Serveur Yasna | Requêtes générées, motifs de refus |
| **Générateur SQL** | Scripts UPDATE + rollback, triggers impactés classés réversibles / non réversibles, contrôle de dérive, estimation d'impact | 🐳 Serveur Yasna | Scripts (jamais exécutés par Yasna) |
| **PostgreSQL (SI de l'administration)** | Source des données | 🗄️ Hors réseau Yasna | Accès **lecture seule** (rôle à privilèges minimaux, GRANT SELECT limités au périmètre, statement_timeout) |
| **Journal d'audit** | Traçabilité CNIL/ANSSI : accès, validations, scripts générés, refus — **append-only, entrées chaînées par hash** | 🐳 Serveur Yasna | Logs d'audit (sans données sensibles en clair) |

---

## 7. Points de sécurité visibles sur les schémas

- La BDD n'est jamais modifiée par Yasna : connexion **lecture seule** (rôle PostgreSQL dédié, `GRANT SELECT` limités au périmètre, `default_transaction_read_only`, `statement_timeout`), requêtes SELECT **contrôlées de façon déterministe** (sqlglot : une seule instruction, SELECT uniquement, tables/colonnes autorisées, LIMIT imposé ; EXPLAIN sous seuil de coût) puis **bornées** (LIMIT/timeout), et les scripts UPDATE/rollback sont **téléchargés puis exécutés manuellement hors Yasna**, après **double validation MOA + technique**.
- L'ordre des phases est imposé par une **machine à états** (diagramme 2) : l'API refuse toute action hors séquence ; l'UPDATE exige un SELECT validé et journalisé (identifiant + hash, même périmètre).
- **Minimisation des données envoyées au LLM** : schéma, objets SQL et statistiques agrégées uniquement ; jamais de lignes brutes ; **pseudonymisation obligatoire** si des exemples sont nécessaires ; en production, fournisseur **qualifié SecNumCloud** requis pour les données sensibles (sinon envoi bloqué par le code, drapeau `LLM_PROVIDER_SECNUMCLOUD`).
- L'IA est une **couche fournisseur interchangeable** : **API externe configurable par défaut** (fournisseur souverain), **mode local optionnel** ; clés jamais en dur (variables d'environnement `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_PROVIDER_SECNUMCLOUD`).
- **Arrêt d'urgence** : un administrateur peut couper immédiatement les appels LLM et la connexion BDD (journalisé).
- **Journal d'audit append-only, chaîné par hash** : accès, validations, scripts générés, refus — sans données sensibles en clair dans les logs.
- **Exposition sécurisée** : reverse proxy (TLS, headers de sécurité) + authentification **OIDC** devant l'UI et l'API ; rôles gérés côté API.
- Le **chat de cadrage** n'accepte que des documents projet non personnels (circulaires, SFD, STD, DEX…) : aucune donnée de bénéficiaires ; tout contenu des documents et de la BDD est traité comme **non fiable** (aucune instruction issue de ces contenus n'est suivie).
- Conteneurs **non-root, capabilities droppées, réseau isolé** ; scripts générés avec **triggers impactés classés réversibles / non réversibles**, **contrôle de dérive** et **rollback testable** (transaction + sauvegarde préalable dans la même transaction).

---

*Fin des schémas – Version 1.1*
