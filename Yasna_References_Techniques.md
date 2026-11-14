# Références techniques & base saine – Yasna

**Version 1.1 – Novembre 2026**

Objectif : liste des références officielles à avoir en visibilité pendant le développement, + checklist « base saine » à valider dès le **premier commit de code**. Toute dépendance ajoutée doit être justifiée et épinglée (pas de dépendances non auditées).

---

## 1. Références officielles

### 1.1 ANSSI – IA (prioritaires pour Yasna, pipeline multi-agents + LLM)

- [**Les Essentiels – Sécuriser un système IA agentique** (ANSSI, oct. 2026, 7 principes)](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_ia_agentique_1.0.pdf) : autorisations **indépendantes du modèle**, **validation humaine** pour les opérations critiques, **arrêt d'urgence**, analyse de risques écrite (données + outils accessibles aux agents), vérification des **séquences d'actions** (pas seulement les permissions individuelles), responsable humain désigné, exigences inscrites au cahier des charges.
- [**ANSSI-PA-102 – Recommandations de sécurité pour un système d'IA générative** (29/04/2024)](https://messervices.cyber.gouv.fr/guides/recommandations-de-securite-pour-un-systeme-dia-generative) ([PDF FR](https://messervices.cyber.gouv.fr/documents-guides/Recommandations_de_s%C3%A9curit%C3%A9_pour_un_syst%C3%A8me_d_IA_g%C3%A9n%C3%A9rative.pdf)) : supply-chain des modèles/bibliothèques, prompt injection, fuite de données via le contexte RAG, IA tierces.
- [Alerte CERT-FR CERTFR-2026-ACT-016 – risques des produits d'automatisation par IA agentique](https://cert.cyber.gouv.fr/actualite/CERTFR-2026-ACT-016/) : injections de prompt, détournements de messages, exécution non autorisée de commandes (MCP = « USB des LLM »).
- [Page ANSSI – Intelligence artificielle](https://cyber.gouv.fr/enjeux-technologiques/intelligence-artificielle/) (RIA / AI Act, ressources).

### 1.2 ANSSI – conteneurs & système

- [Fiche ANSSI-FT-082 – Recommandations de sécurité relatives au déploiement de conteneurs Docker](https://messervices.cyber.gouv.fr/documents-guides/docker_fiche_technique.pdf) : utilisateur non-root, cloisonnement, journalisation exportée, réseau.
- Recommandations de sécurité relatives à un système GNU/Linux (ssi.gouv.fr) : moindre privilège, durcissement hôte.

### 1.3 OWASP

- [OWASP API Security Top 10 – édition 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) (BOLA/IDOR, auth, mass assignment, SSRF… — cœur de cible pour notre API FastAPI).
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) (LLM01 prompt injection, LLM05 sorties non contrôlées, LLM06 agentivité excessive…) + [OWASP Top 10 for Agentic Applications (déc. 2025)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/).
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html).
- OWASP ASVS (niveau de vérification des exigences de sécurité applicative).

### 1.4 CNIL / RGPD / conformité

- [Guide RGPD du développeur – CNIL (open source, GPLv3)](https://github.com/LINCnil/Guide-RGPD-du-developpeur) ([version web](https://lincnil.github.io/Guide-RGPD-du-developpeur/)) : 18 fiches avec exemples de code (minimisation, journalisation, gestion des demandes d'accès/rectification/suppression, tests de sécurité/fuzzing).
- [Guide pratique RGPD – Sécurité des données personnelles (CNIL, 2024)](https://www.cnil.fr/sites/default/files/2024-03/cnil_guide_securite_personnelle_2024.pdf).
- Article 28 du RGPD (sous-traitance) : le fournisseur LLM est sous-traitant de l'administration responsable du traitement (contrat, localisation, non-réutilisation des prompts, durée de conservation des logs du fournisseur : `À COMPLÉTER`).

### 1.5 Stack Python / FastAPI / structure

- [Documentation officielle FastAPI](https://fastapi.tiangolo.com/) (Security, CORS, middlewares, `pydantic-settings`, dépendance injection).
- [fastapi-best-practices](https://github.com/zhanymkanov/fastapi-best-practices) : conventions projet (config, validation Pydantic, SQL-first…).
- [fastapi-clean-architecture-ddd-template (MIT)](https://github.com/BrunoTanabe/fastapi-clean-architecture-ddd-template) : **inspiration de structure uniquement** (layers domain/application/infrastructure/presentation) — ne pas copier sa dette (dépendances inutiles).

---

## 2. Checklist « base saine » — à valider dès le 1er commit de code

- [ ] Arborescence : `core` / `rag` / `analysis` / `sql_generator` / `agents` / `llm` (couche fournisseur) / `db_adapters` / `api` / `ui` (+ `tests/`)
- [ ] Config via `pydantic-settings` : rien en dur, `.env` dans `.gitignore`, secrets en `SecretStr`, valeurs par défaut sûres. Couche fournisseur LLM interchangeable via `LLM_BASE_URL`, `LLM_API_KEY` (`SecretStr`), `LLM_MODEL`, `LLM_PROVIDER_SECNUMCLOUD=true/false` (API compatible OpenAI) : **API externe configurable par défaut (fournisseur souverain), mode local optionnel** ; changement de fournisseur sans modification de code ; **envoi de données non agrégées bloqué par le code si le fournisseur n'est pas qualifié SecNumCloud**
- [ ] Minimisation LLM : le LLM ne reçoit que schéma, objets SQL et **statistiques agrégées** ; jamais de lignes brutes ; **pseudonymisation obligatoire** si exemples nécessaires ; échantillon non persisté au-delà de la session d'analyse (`À COMPLÉTER : durée de conservation si chiffré`)
- [ ] Contrôle SQL déterministe : chaque requête générée passée par `sqlglot` (une seule instruction, SELECT uniquement, tables/colonnes du périmètre uniquement, `LIMIT` imposé, pas de fonctions système) + `EXPLAIN` préalable (refus si coût estimé > seuil configurable) ; toute requête refusée **journalisée avec son motif**
- [ ] Orchestration en **machine à états** : chaque phase a un état d'entrée requis ; l'API refuse toute action hors séquence ; la proposition exige un SELECT validé et journalisé (identifiant + hash, même périmètre) ; la génération de l'UPDATE exige une proposition **validée par le circuit décisionnel** ; l'UPDATE réutilise la clause WHERE du SELECT validé (le LLM ne génère que la partie SET)
- [ ] **Arrêt d'urgence** (administrateur) : coupe les appels LLM et la connexion BDD, journalisé
- [ ] Middlewares sécurité API : headers (`X-Content-Type-Options`, `Content-Security-Policy`, `frame-ancestors`…), CORS en allowlist stricte, rate limiting, validation stricte des entrées (Pydantic, `extra="forbid"`) ; **reverse proxy (Caddy/nginx) devant l'UI et l'API (TLS + headers de sécurité) + authentification OIDC** ; rôles (opérationnel, décideur, administrateur) gérés côté API
- [ ] Dockerfile **non-root**, image minimale (distroless/slim), `USER` dédié ; compose : `cap_drop: ALL`, `read_only: true`, `no-new-privileges`, `security_opt`, réseau interne isolé, **aucun secret dans l'image** (BuildKit `--mount=type=secret` pour le build)
- [ ] `.gitignore` : `.env`, secrets, clés, `__pycache__`, exports de données
- [ ] CI `.github/workflows/ci.yml` **dès le 1er commit** : `pytest` + `bandit -r` + `trivy` (scan image + dépendances) + build Docker ; branche `main` protégée, revue obligatoire
- [ ] Dépendances épinglées (versions fixées) et justifiées dans la PR
- [ ] Journalisation/audit : accès, revues et validations du circuit décisionnel, scripts générés, refus de requêtes — journal **append-only, entrées chaînées par hash** ; durée de conservation : `À COMPLÉTER` ; **sans données sensibles en clair** dans les logs
- [ ] Connexion BDD : rôle PostgreSQL **lecture seule** dédié (`GRANT SELECT` limités au périmètre, `default_transaction_read_only`, `statement_timeout`), requêtes SELECT bornées (LIMIT/timeout) et contrôlées (sqlglot + EXPLAIN), jamais d'exécution automatique de scripts de modification
- [ ] PoC : PostgreSQL uniquement ; interface d'adaptateur par SGBD (Oracle, DB2, SQL Server) prévue pour les versions suivantes — **adaptateur SGBD legacy (DB2 / Oracle) en priorité n° 1 après le PoC** (SGBD prioritaire : `À COMPLÉTER`)
- [ ] **Code spécifique à PostgreSQL confiné dans `db_adapters/postgresql`, jamais ailleurs** : les autres modules passent exclusivement par l'interface d'adaptateur (extraction schéma/triggers, dialecte sqlglot)
- [ ] Circuit de validation paramétrable par projet : reproduit le processus de validation réel de l'organisation (nombre de validations distinctes — 1 ou 2 ; rôle ou profil exigé pour chaque validation ; auto-validation autorisée ou interdite) ; valeurs par défaut : 1 validation par un Décideur, auto-validation **interdite** ; paramétrage par l'Administrateur à l'initialisation du projet, toute modification réservée à l'Administrateur et journalisée ; chaque validation horodatée, nominative et journalisée

---

## 3. Mapping risques Yasna → référence → mesure concrète

| Risque Yasna | Référence | Mesure dans Yasna |
|---|---|---|
| Prompt injection via le chat de cadrage ou les documents uploadés | ANSSI Essentiels IA agentique, OWASP LLM01, CERTFR-2026-ACT-016 | Chat = saisie libre traitée comme **non fiable** : jamais d'exécution auto, contexte figé validé par l'humain, agents sans capacité d'agir seuls sur la BDD |
| Prompt injection via le contenu de la BDD ou des documents (valeurs de colonnes, commentaires) | OWASP LLM01, CERTFR-2026-ACT-016 | Tout contenu issu des documents et de la BDD est traité comme **donnée non fiable** : balisage instructions/données dans les prompts, aucune instruction issue de ces contenus suivie ; les contrôles déterministes (sqlglot, machine à états) restent la vraie barrière |
| Fuite de données via le RAG / contexte envoyé au LLM externe | ANSSI-PA-102, CNIL, art. 28 RGPD | LLM ne reçoit que schéma, objets SQL et **statistiques agrégées** (jamais de lignes brutes) ; **pseudonymisation obligatoire** si exemples ; chat limité aux documents projet **non personnels** ; fournisseur interchangeable (mode local optionnel) ; **SecNumCloud requis en production pour les données sensibles** (envoi bloqué par le code sinon) |
| Fournisseur LLM non qualifié utilisé avec des données sensibles | loi SREN n° 2024-449 (art. 31) + décret d'application, ANSSI SecNumCloud | Drapeau `LLM_PROVIDER_SECNUMCLOUD` **vérifié par le code** avant tout envoi de données non agrégées ; qualification portant sur le **service d'IA utilisé**, pas seulement l'infrastructure |
| Agent qui exécute une action destructive (UPDATE massif) | ANSSI Essentiels (validation humaine, arrêt d'urgence, séquences d'actions) | UPDATE + rollback générés après validation du dossier de revue par le ou les Décideur(s) (circuit paramétrable), jamais exécutés par Yasna ; clause WHERE du SELECT validé réutilisée par le code (le LLM ne génère que la partie SET) ; rollback testable ; triggers impactés classés réversibles / non réversibles |
| SQL généré par le LLM exécuté sur la base de production (lecture hors périmètre, requête coûteuse, écriture déguisée) | ANSSI Essentiels (autorisations indépendantes du modèle), OWASP LLM05 (sorties non contrôlées) | Contrôles **déterministes** : `GRANT SELECT` limités au périmètre, `default_transaction_read_only`, `statement_timeout`, analyse `sqlglot` (1 instruction, SELECT, tables/colonnes autorisées, LIMIT, pas de fonctions système), `EXPLAIN` sous seuil ; tout refus journalisé avec son motif |
| Séquence d'actions licites individuellement mais dangereuse combinée (ex. UPDATE sans SELECT validé ou sans proposition validée) | ANSSI Essentiels (vérifier la séquence) | Orchestrateur = **machine à états** (refus hors séquence) ; UPDATE exige une proposition **validée par le circuit décisionnel** portant sur un SELECT **validé et journalisé** (identifiant + hash, même périmètre) |
| Script exécuté alors que les données ont changé depuis l'analyse (dérive) | Bonnes pratiques (contrôle de cohérence préalable) | Contrôle de dérive embarqué en tête de chaque script UPDATE : recomptage des lignes ciblées, **annulation de la transaction** si divergence au-delà d'une tolérance configurable ; sauvegarde dans la **même transaction** que l'UPDATE |
| Journal d'audit modifié après coup (validations contestables) | CNIL (intégrité des logs), ANSSI (traçabilité) | Journal **append-only, entrées chaînées par hash** ; durée de conservation : `À COMPLÉTER` |
| Exposition de l'UI/API (Streamlit sans auth robuste, pas de CSP) | OWASP API Top 10 2023, OWASP Docker Cheat Sheet | **Reverse proxy (Caddy/nginx)** : TLS + headers de sécurité ; authentification **OIDC** ; rôles gérés côté API ; validation du dossier de revue par le ou les Décideur(s) avant toute génération de scripts |
| Exposition de l'API (BOLA, auth cassée, CORS ouvert) | OWASP API Top 10 2023 | Auth forte, autorisation par objet, CORS allowlist, rate limiting, Pydantic strict |
| Conteneur compromis (root, capabilities) | ANSSI FT-082, OWASP Docker Cheat Sheet | non-root, `cap_drop: ALL`, `read_only`, `no-new-privileges`, réseau isolé, trivy en CI |
| Fuite de secrets (clés API, DSN BDD) | CNIL guide sécurité 2024, ANSSI | variables d'environnement uniquement, `SecretStr`, `.env` gitignoré, bandit + scan de secrets en CI, jamais de secret dans l'image Docker |
| Non-conformité RGPD (journalisation, droits des personnes, sous-traitance LLM) | CNIL Guide RGPD du développeur, art. 28 RGPD | journal d'audit des accès, minimisation, export/suppression possibles, documentation des traitements ; administration **responsable du traitement**, fournisseur LLM **sous-traitant** (contrat, localisation, non-réutilisation des prompts, conservation des logs : `À COMPLÉTER`) |

---

## 4. Règles de contribution liées

- Toute PR doit passer la CI (tests + bandit + trivy + build) avant merge.
- Aucun secret en dur (vérifié par bandit / scan de secrets en CI).
- Chaque nouvelle dépendance : justification écrite dans la description de la PR + version épinglée.
- Pas de données personnelles dans les tests, les logs, les fixtures (CNIL : minimisation).

---

*Fin des références – Version 1.1*
