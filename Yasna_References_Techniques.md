# Références techniques & base saine – Yasna

**Version 1.0 – Novembre 2026**

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

### 1.5 Stack Python / FastAPI / structure

- [Documentation officielle FastAPI](https://fastapi.tiangolo.com/) (Security, CORS, middlewares, `pydantic-settings`, dépendance injection).
- [fastapi-best-practices](https://github.com/zhanymkanov/fastapi-best-practices) : conventions projet (config, validation Pydantic, SQL-first…).
- [fastapi-clean-architecture-ddd-template (MIT)](https://github.com/BrunoTanabe/fastapi-clean-architecture-ddd-template) : **inspiration de structure uniquement** (layers domain/application/infrastructure/presentation) — ne pas copier sa dette (dépendances inutiles).

---

## 2. Checklist « base saine » — à valider dès le 1er commit de code

- [ ] Arborescence : `core` / `rag` / `analysis` / `sql_generator` / `agents` / `api` / `ui` (+ `tests/`)
- [ ] Config via `pydantic-settings` : rien en dur, `.env` dans `.gitignore`, secrets en `SecretStr`, valeurs par défaut sûres (mode local IA par défaut, API externes **désactivées** par défaut)
- [ ] Middlewares sécurité API : headers (`X-Content-Type-Options`, `Content-Security-Policy`, `frame-ancestors`…), CORS en allowlist stricte, rate limiting, validation stricte des entrées (Pydantic, `extra="forbid"`)
- [ ] Dockerfile **non-root**, image minimale (distroless/slim), `USER` dédié ; compose : `cap_drop: ALL`, `read_only: true`, `no-new-privileges`, `security_opt`, réseau interne isolé, **aucun secret dans l'image** (BuildKit `--mount=type=secret` pour le build)
- [ ] `.gitignore` : `.env`, secrets, clés, `__pycache__`, exports de données
- [ ] CI `.github/workflows/ci.yml` **dès le 1er commit** : `pytest` + `bandit -r` + `trivy` (scan image + dépendances) + build Docker ; branche `main` protégée, revue obligatoire
- [ ] Dépendances épinglées (versions fixées) et justifiées dans la PR
- [ ] Journalisation/audit : accès, validations MOA/MOE, scripts générés — **sans données sensibles en clair** dans les logs
- [ ] Connexion BDD : rôle PostgreSQL **lecture seule** dédié, requêtes SELECT bornées (LIMIT/timeout), jamais d'exécution automatique de scripts de modification

---

## 3. Mapping risques Yasna → référence → mesure concrète

| Risque Yasna | Référence | Mesure dans Yasna |
|---|---|---|
| Prompt injection via le chat de cadrage ou les documents uploadés | ANSSI Essentiels IA agentique, OWASP LLM01, CERTFR-2026-ACT-016 | Chat = saisie libre traitée comme **non fiable** : jamais d'exécution auto, contexte figé validé par l'humain, agents sans capacité d'agir seuls sur la BDD |
| Fuite de données via le RAG / contexte envoyé au LLM externe | ANSSI-PA-102, CNIL | Mode local par défaut ; API externe désactivable ; chat limité aux documents projet **non personnels** ; aucune donnée de bénéficiaires dans les prompts |
| Agent qui exécute une action destructive (UPDATE massif) | ANSSI Essentiels (validation humaine, arrêt d'urgence, séquences d'actions) | UPDATE + rollback générés **sur demande explicite**, jamais exécutés par Yasna ; validation MOA/MOE + revue de script ; rollback testable ; triggers impactés listés |
| Séquence d'actions licites individuellement mais dangereuse combinée | ANSSI Essentiels (vérifier la séquence) | Revue globale par l'Agent 4 + revue de script humaine avant tout téléchargement/exécution |
| Exposition de l'API (BOLA, auth cassée, CORS ouvert) | OWASP API Top 10 2023 | Auth forte, autorisation par objet, CORS allowlist, rate limiting, Pydantic strict |
| Conteneur compromis (root, capabilities) | ANSSI FT-082, OWASP Docker Cheat Sheet | non-root, `cap_drop: ALL`, `read_only`, `no-new-privileges`, réseau isolé, trivy en CI |
| Fuite de secrets (clés API, DSN BDD) | CNIL guide sécurité 2024, ANSSI | variables d'environnement uniquement, `SecretStr`, `.env` gitignoré, bandit + scan de secrets en CI, jamais de secret dans l'image Docker |
| Non-conformité RGPD (journalisation, droits des personnes) | CNIL Guide RGPD du développeur | journal d'audit des accès, minimisation, export/suppression possibles, documentation des traitements |

---

## 4. Règles de contribution liées

- Toute PR doit passer la CI (tests + bandit + trivy + build) avant merge.
- Aucun secret en dur (vérifié par bandit / scan de secrets en CI).
- Chaque nouvelle dépendance : justification écrite dans la description de la PR + version épinglée.
- Pas de données personnelles dans les tests, les logs, les fixtures (CNIL : minimisation).

---

*Fin des références – Version 1.0*
