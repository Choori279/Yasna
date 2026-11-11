# Schémas du parcours Yasna

**Version 1.0 – Novembre 2026** — schémas du parcours en 8 phases décrit dans `Yasna_Document_Projet_v1.2.md` (section 3).

**Légende des lieux :**
- 🖥️ **PC utilisateur** : navigateur de l'agent administratif (MOA/MOE)
- 🐳 **Serveur Yasna** : conteneurs Docker (réseau isolé, non-root, capabilities droppées)
- 🧠 **IA** : locale par défaut (Ollama, dans le réseau Docker) ou API externe (configurable, désactivable)
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
        API["API FastAPI<br/>auth, validation des entrées, headers de sécurité"]
        ORCH["Orchestrateur / Services<br/>déroulé des 8 phases, workflow MOA/MOE"]
        RAG["Base de connaissances du projet<br/>RAG : contexte figé + règles de gestion"]
        AGENTS["Agents IA<br/>A1 connaissances · A2 SELECT BDD<br/>A3 confirmation RG + résultats · A4 revue globale"]
        SQLGEN["Générateur SQL<br/>UPDATE + rollback, triggers impactés listés"]
        AUDIT["Journal d'audit<br/>accès, validations, scripts générés"]
        LLMLOC["Ollama / modèle local"]
    end

    subgraph IAEXT["☁️ API IA externe (optionnel, désactivable)"]
        LLMEXT["LLM / embeddings externes<br/>clés en variables d'environnement"]
    end

    subgraph BDD["🗄️ SI de l'administration (hors réseau Yasna)"]
        DB["PostgreSQL<br/>rôle lecture seule<br/>schéma + échantillon + triggers"]
    end

    SCRIPT["Scripts SQL téléchargés<br/>exécutés manuellement hors Yasna<br/>après validation MOA/MOE"]

    DOCS --> UI
    UI <--> API
    API <--> ORCH
    ORCH <--> RAG
    ORCH <--> AGENTS
    ORCH <--> SQLGEN
    ORCH --> AUDIT
    AGENTS <--> LLMLOC
    AGENTS -. "si activé par config" .-> LLMEXT
    AGENTS --> DB
    SQLGEN --> SCRIPT
    SCRIPT -. "jamais d'exécution automatique par Yasna" .-> DB
```

---

## 2. Diagramme de séquence — phases 1 à 5 (cadrage → première analyse)

```mermaid
sequenceDiagram
    autonumber
    participant U as Utilisateur (PC)
    participant UI as UI Streamlit
    participant API as API FastAPI
    participant ORCH as Orchestrateur
    participant RAG as Base de connaissances (RAG)
    participant LLM as IA (local ou API)
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
    API->>DB: Connexion read-only, extraction schéma + échantillon + triggers
    DB-->>API: Schéma, échantillon, objets SQL

    Note over U,AUD: Phase 4 — Lien contexte métier ↔ BDD
    ORCH->>RAG: Règles de gestion
    ORCH->>DB: Lecture schéma et objets SQL
    ORCH-->>UI: Liens règles ↔ tables, colonnes, triggers

    Note over U,AUD: Phase 5 — Première analyse (suggestions uniquement)
    API->>LLM: Analyse des potentiels manques
    LLM-->>UI: Suggestions expliquées par les règles (aucune action)
    API->>AUD: Journalisation des suggestions
```

---

## 3. Diagramme de séquence — phases 6 à 8 (besoin → agents → scripts validés)

```mermaid
sequenceDiagram
    autonumber
    participant U as Utilisateur (PC)
    participant UI as UI Streamlit
    participant ORCH as Orchestrateur
    participant A1 as Agent 1 (connaissances)
    participant A2 as Agent 2 (BDD / SELECT)
    participant A3 as Agent 3 (confirmation)
    participant A4 as Agent 4 (revue globale)
    participant RAG as Base de connaissances
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
    A2->>DB: SELECT borné (LIMIT, timeout)
    DB-->>A2: Lignes concernées
    A2-->>A3: Requête SELECT construite + résultats
    A3-->>A4: Confirmation (agrégation RG + résultats SELECT)
    A4-->>UI: Revue globale + résultats présentés à l'utilisateur
    ORCH->>AUD: Journalisation de chaque agent

    Note over U,AUD: Phase 8 — UPDATE + rollback sur demande explicite
    U->>UI: Demande explicitement l'UPDATE + rollback
    UI->>ORCH: Demande tracée
    ORCH->>A1: Les 4 agents retravaillent
    ORCH->>A2: Reconstruction en mode modification
    A2->>SQLGEN: Script UPDATE + estimation d'impact
    SQLGEN->>SQLGEN: Triggers impactés listés + rollback testable (transaction + sauvegarde)
    SQLGEN-->>A4: Scripts + impacts + effets de bord
    A4-->>UI: Revue globale des scripts
    U->>UI: Validation MOA/MOE + revue de script (checklist)
    UI->>AUD: Validation journalisée
    U->>UI: Téléchargement des scripts (correction + rollback)
    Note over U,AUD: Exécution manuelle hors Yasna — jamais automatique
```

---

## 4. Flowchart du parcours — phases et points de décision

```mermaid
flowchart TD
    P1["Phase 1 : Cadrage<br/>upload docs projet + chat IA"] --> D1{"Contexte validé<br/>explicitement par<br/>l'utilisateur ?"}
    D1 -- non --> P1
    D1 -- oui --> P2["Phase 2 : Projet initialisé<br/>base de connaissances figée + journalisation"]
    P2 --> P3["Phase 3 : Connexion BDD<br/>lecture seule — schéma, échantillon, triggers"]
    P3 --> P4["Phase 4 : Lien contexte métier ↔ BDD<br/>(tables, colonnes, triggers, contraintes)"]
    P4 --> P5["Phase 5 : 1ère analyse<br/>suggestions de manques uniquement<br/>(transformables en besoin en un clic)"]
    P5 --> P6["Phase 6 : Spécification du besoin<br/>ex. NULL → 0 dans la table des montants"]
    P6 --> P7["Phase 7 : Pipeline 4 agents<br/>A1 connaissances → A2 SELECT borné → A3 confirmation → A4 revue"]
    P7 --> P8["Résultats SELECT + revue globale<br/>présentés à l'utilisateur"]
    P8 --> D2{"L'utilisateur demande<br/>l'UPDATE + rollback ?"}
    D2 -- non --> F1["Fin sans modification<br/>résultats archivés dans le journal d'audit"]
    D2 -- oui --> P9["Les 4 agents retravaillent :<br/>script UPDATE + rollback testable<br/>triggers impactés listés + estimation d'impact"]
    P9 --> D3{"Validation MOA/MOE<br/>+ revue de script (checklist) ?"}
    D3 -- non --> P9
    D3 -- oui --> F2["Scripts téléchargés<br/>exécution manuelle hors Yasna<br/>JAMAIS automatique"]
```

---

## 5. Tableau récapitulatif — qui fait quoi, où, avec quelles données

| Acteur | Rôle dans le parcours | Lieu | Données manipulées |
|--------|----------------------|------|-------------------|
| **Utilisateur** (agent administratif, MOA/MOE) | Upload des documents, chat de cadrage, validation du contexte, expression du besoin, validation MOA/MOE + revue de script, téléchargement des scripts | 🖥️ PC (navigateur) | Documents projet, besoins, validations |
| **UI Streamlit** | Chat, visualisations (suggestions, résultats, scripts), formulaires de validation | 🐳 Serveur Yasna (conteneur UI) | Données d'affichage uniquement |
| **API FastAPI** | Point d'entrée unique, auth, validation stricte des entrées, headers de sécurité, orchestration | 🐳 Serveur Yasna | Requêtes, métadonnées |
| **Orchestrateur / Services** | Déroulé des 8 phases, workflow MOA/MOE, appels IA, journalisation | 🐳 Serveur Yasna | États du projet |
| **Base de connaissances (RAG)** | Contexte métier figé + règles de gestion, interrogée par les agents | 🐳 Serveur Yasna | Documents projet vectorisés (non personnels) |
| **Agent 1** | Récupère la base de connaissances du projet | 🐳 Serveur Yasna | Règles de gestion + contexte |
| **Agent 2** | Lit la BDD (SELECT bornés), trouve les lignes, construit le SELECT puis l'UPDATE | 🐳 Serveur Yasna → 🗄️ BDD | Schéma, échantillon, lignes concernées |
| **Agent 3** | Agrège règles de gestion + résultats SELECT pour confirmation | 🐳 Serveur Yasna | Résultats intermédiaires |
| **Agent 4** | Revue globale, communication des résultats/scripts à l'utilisateur | 🐳 Serveur Yasna | Rapport de revue |
| **IA (LLM)** | Compréhension du contexte, chat, génération, revue | 🧠 Local (Ollama) par défaut, ou ☁️ API externe désactivable | Prompts/réponses (aucune donnée personnelle) |
| **Générateur SQL** | Scripts UPDATE + rollback, triggers impactés, estimation d'impact | 🐳 Serveur Yasna | Scripts (jamais exécutés par Yasna) |
| **PostgreSQL (SI de l'administration)** | Source des données | 🗄️ Hors réseau Yasna | Accès **lecture seule** (rôle à privilèges minimaux) |
| **Journal d'audit** | Traçabilité CNIL/ANSSI : accès, validations, scripts générés | 🐳 Serveur Yasna | Logs d'audit (sans données sensibles en clair) |

---

## 6. Points de sécurité visibles sur les schémas

- La BDD n'est jamais modifiée par Yasna : connexion **lecture seule** (rôle PostgreSQL dédié), SELECT **bornés** (LIMIT/timeout), et les scripts UPDATE/rollback sont **téléchargés puis exécutés manuellement hors Yasna**, après validation MOA/MOE.
- L'**API IA externe est optionnelle et désactivable** (pointillés sur le schéma 1) : mode local (Ollama) par défaut, clés jamais en dur (variables d'environnement).
- Le **chat de cadrage** n'accepte que des documents projet non personnels (circulaires, SFD, STD, DEX…) : aucune donnée de bénéficiaires.
- Toute action est **journalisée** (journal d'audit) : accès, validations, scripts générés — sans données sensibles en clair dans les logs.
- Conteneurs **non-root, capabilities droppées, réseau isolé** ; scripts générés avec **triggers impactés listés** et **rollback testable** (transaction + sauvegarde préalable).

---

*Fin des schémas – Version 1.0*
