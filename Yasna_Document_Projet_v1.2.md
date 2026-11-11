# Document Projet – Yasna

**Outil d'Analyse et de Nettoyage Intelligent de Bases de Données pour les Administrations Publiques**

**Version 1.2 – Novembre 2026**  
*(Base de travail produit – prototype terminé)*

## Objectif du document

Présentation claire et complète du projet Yasna à destination des contributeurs, des partenaires techniques et des administrations. Ce document sert de référence pour le développement du produit (plus seulement du prototype) et peut être utilisé comme instructions de projet pour une IA de développement.

## Sommaire

1. Postulat de départ  
2. Problématique détectée  
3. Solution apportée : Yasna  
4. Solutions existantes  
5. Opportunités et maturité du marché  
6. Principes de sécurité et conformité  
7. Stack technique et architecture  
8. Roadmap produit et PoC  

## 1. Postulat de départ

Les administrations publiques (mairies, départements, préfectures, etc.) gèrent quotidiennement des milliers de dossiers : aides sociales (RSA, allocations), état civil, subventions, inscriptions scolaires…  

Elles s'appuient sur des systèmes d'information souvent anciens (15 à 30 ans). Ces bases legacy contiennent des volumes importants de données, mais de qualité souvent médiocre : doublons, champs vides, incohérences, formats hétérogènes.  

Ces données sont pourtant critiques pour les décisions opérationnelles et pour toute modernisation future (y compris le déploiement d'IA). Sans données propres et fiables, l'IA souveraine ne peut pas être déployée de manière utile et fiable.

## 2. Problématique détectée

Aujourd'hui, les administrations n'ont que deux options principales pour nettoyer leurs bases, et aucune n'est pleinement satisfaisante :

- **Scripts de purge « maison »** : précis et adaptés aux règles métier, mais très longs à développer (3 à 9 mois), dépendants d'experts rares, et difficiles à maintenir.
- **Outils standards du marché** (IBM InfoSphere QualityStage, Informatica, etc.) : puissants sur le volume, mais chers, complexes, peu capables de comprendre automatiquement le contexte métier, et souvent non souverains.

Conséquence : les données restent sales, la modernisation des SI est freinée, et l'IA ne peut pas être déployée de manière fiable.

## 3. Solution apportée : Yasna

Yasna est un outil intelligent, simple et pensé pour le secteur public. Il combine de l'IA (locale ou via API configurable) avec un contrôle humain obligatoire aux étapes critiques. Chaque phase du parcours a une **action attendue claire** de la part de l'utilisateur.

### Le parcours Yasna (8 phases)

1. **Cadrage par la documentation projet**  
   Chargement des documents du projet (circulaires, SFD, STD, DEX, dictionnaire de données…). L'IA produit une première analyse de compréhension du contexte métier, puis un **chat de cadrage** (questions-réponses avec l'IA) permet à l'utilisateur de préciser le contexte si besoin au départ.

2. **Initialisation du projet**  
   L'utilisateur **valide explicitement** la synthèse du contexte métier produite par l'IA, puis le projet Yasna est initialisé à partir de cette base : contexte métier figé, paramètres du projet, journalisation des accès.

3. **Connexion à la base (lecture seule)**  
   Connexion en lecture seule (rôle PostgreSQL à privilèges minimaux) pour extraire le schéma, un échantillon configurable des données, et si possible les objets SQL associés (triggers, procédures stockées, vues, contraintes).

4. **Lien entre contexte métier et base de données**  
   Association entre les règles de gestion et les éléments de la BDD (tables, colonnes, triggers, contraintes…), au-delà du seul schéma.

5. **Première analyse : potentiels manques (suggestions uniquement)**  
   L'analyse fait ressortir les manques et incohérences potentielles (doublons, données manquantes, incohérences, formats incorrects, valeurs aberrantes), chacune expliquée par la règle de gestion concernée. **Aucune action proposée à ce stade** : chaque suggestion peut être transformée en besoin en un clic.

6. **Spécification du besoin utilisateur**  
   L'utilisateur exprime — ou reprend une suggestion pour exprimer — son besoin de nettoyage (ex. : « passer les valeurs NULL à 0 dans la table des montants »).

7. **Traitement multi-agents (analyse en SELECT)**  
   - **Agent 1** : récupération de la base de connaissances du projet (règles de gestion + contexte).  
   - **Agent 2** : lecture de la BDD (requêtes SELECT bornées : LIMIT / échantillonnage, timeout) pour trouver les lignes correspondantes + construction de la requête en SELECT.  
   - **Agent 3** : agrégation des règles de gestion et des résultats du SELECT pour confirmation.  
   - **Agent 4** : revue globale et communication des résultats à l'utilisateur.

8. **Génération des scripts sur demande explicite (UPDATE + rollback)**  
   L'utilisateur demande spécifiquement la requête en mode UPDATE : les 4 agents retravaillent pour produire le **script SQL de modification** (avec explications, estimation des lignes impactées et **liste des triggers impactés / effets de bord**) ainsi que le **script de rollback testable** (transaction + sauvegarde préalable : table de backup ou export ciblé). **Validation MOA/MOE au niveau du projet et revue de script obligatoires** avant toute exécution.

**Validation humaine obligatoire** à chaque étape de proposition ou d'action. Elle est conçue pour rester rapide et traçable : validation par lot, revue de script structurée (checklist), workflow MOA/MOE au niveau du projet, journalisation automatique des validations. **Aucun script de modification n'est jamais exécuté automatiquement par Yasna.**  

**Souveraineté** : fonctionnement local par défaut. Les API externes (LLM, embeddings…) sont possibles mais entièrement configurables (activation/désactivation + clés via variables d'environnement). Le risque est reporté sur l'infrastructure du client.  

**Valeur ajoutée :**
- Parcours guidé avec une action et un attendu clairs à chaque phase (cadrage, validation du contexte, analyse, spécification, revue, validation MOA/MOE).
- Réduction forte des délais (de plusieurs mois à quelques semaines).
- Allègement de la charge des experts techniques et métier.
- Préparation réelle des données pour une IA utile.
- Outil léger, abordable et adapté aux collectivités.

## 4. Solutions existantes

- Scripts maison : précis mais trop lents et dépendants d'experts.
- Outils professionnels (IBM, Informatica, Ataccama…) : puissants mais lourds, chers et peu « métier-first ».
- Outils open-source (OpenRefine, Great Expectations, Soda…) : gratuits mais sans compréhension métier automatique ni génération de scripts + rollback.
- Outils IA récents : rapides sur des cas simples, insuffisants sur des bases legacy complexes.

Aucune solution actuelle ne propose le combo complet de Yasna (compréhension métier + normalisation + scripts sécurisés + souveraineté configurable) de façon légère et pensée pour le secteur public.

## 5. Opportunités et maturité du marché

Le marché mondial des outils de Data Quality (nettoyage et amélioration de la qualité des données) reste en croissance.

Les estimations varient selon les cabinets et le périmètre retenu (outils purs vs solutions de gestion de la qualité des données), mais on se situe généralement autour de **2,8 à 4 milliards de dollars en 2025-2026**, avec des taux de croissance annuels (CAGR) souvent compris entre **13 et 17 %** vers 2030-2034.

En Europe, et particulièrement en France, la demande est soutenue dans le secteur public (modernisation des SI, exigences RGPD/AI Act, besoin de données fiables pour l'IA).

**Maturité du marché :**
- Le nettoyage « classique » (règles manuelles, dédoublonnage, standardisation) est mature.
- L'« Augmented Data Quality » (utilisation de l'IA pour détecter, expliquer et proposer des corrections en tenant compte du contexte métier) est toujours en évolution active. Gartner continue de publier un Magic Quadrant spécifique sur ce segment.

**Opportunités pour Yasna :**
- Répondre à un besoin réel et durable des administrations.
- Se différencier par une approche « métier-first » (compréhension des règles de gestion) + souveraineté configurable + génération de scripts sécurisés.
- Rester léger et adapté aux collectivités.

## 6. Principes de sécurité et conformité

Yasna doit respecter les exigences du secteur public français :

- **CNIL** : Privacy by Design, minimisation des données, journalisation des accès, possibilité d'export/suppression, documentation des traitements (Guide RGPD du développeur + recommandations IA).
- **ANSSI** : DevSecOps, moindre privilège, analyse statique et dynamique, gestion sécurisée des secrets, recommandations pour les systèmes d'IA.
- **DINUM** : souveraineté, interopérabilité, logiciel libre encouragé.
- Validation humaine obligatoire avant toute modification de données (validation par lot, revue de script structurée, workflow MOA/MOE, journalisation).
- Mode local par défaut + API externes entièrement configurables.
- Conteneurisation sécurisée (non-root, capabilities droppées, réseau isolé).
- Pas de secrets en dur, validation stricte des entrées, headers de sécurité.
- **Chat de cadrage** : seuls des documents projet non personnels (circulaires, SFD, STD, DEX…) y sont chargés ; en mode API externe, ces documents transitent vers le fournisseur du modèle (désactivable via configuration). Aucune donnée personnelle (bénéficiaires…) ne doit y être saisie.
- **Connexion BDD** : rôle PostgreSQL strictement lecture seule à l'analyse ; requêtes SELECT bornées (LIMIT / échantillonnage, timeout).
- **Effets de bord SQL** : tout script de modification généré doit lister les triggers/contraintes impactés ; le rollback doit être testable (transaction + sauvegarde préalable).

## 7. Stack technique et architecture

- **Backend** : Python 3.12+ + FastAPI  
- **Interface** : Streamlit  
- **Base de données** : PostgreSQL  
- **ORM** : SQLAlchemy 2.0  
- **IA** : support local (Ollama/Mistral) + API externes entièrement configurables  
- **Conteneurisation** : Docker + Docker Compose sécurisé (non-root, capabilities droppées)  
- **Tests** : pytest + bandit + Trivy  

**Architecture**  
Respect d'une séparation claire des responsabilités (approche type MVC / Clean Architecture) :
- **Modèle** : logique métier, accès aux données, règles de gestion, génération des scripts SQL, détection d'anomalies.
- **Vue** : interface Streamlit (simple, orientée agents administratifs).
- **Contrôleur / Services** : orchestration des phases Yasna, appels à l'IA (local ou API), pipeline multi-agents, gestion des validations humaines, journalisation.

Structure modulaire recommandée : `core` / `rag` / `analysis` / `sql_generator` / `agents` / `api` / `ui`.

## 8. Roadmap produit et PoC

**Objectif du PoC**  
Démontrer la valeur de Yasna sur un périmètre réaliste et maîtrisable : **une table métier prioritaire** (exemple : table des bénéficiaires d'aides sociales), en déroulant le **parcours complet** : cadrage par la documentation projet + chat IA, initialisation du projet (avec validation explicite du contexte), connexion lecture seule, lien contexte métier ↔ BDD (y compris objets SQL), première analyse en suggestions, spécification du besoin, pipeline multi-agents (SELECT), puis génération de scripts UPDATE + rollback sur demande explicite, avec validation MOA/MOE et revue de script.  

La cartographie métier↔technique dédiée et la proposition de schéma optimisé (3NF) sont **reportées après le PoC**.  

Voir le document dédié « PoC Yasna – Spécification détaillée » pour le détail des étapes.  

**Suite après le PoC**  
Stabilisation, extension à d'autres tables, cartographie dédiée et refonte de schéma (3NF), renforcement de la sécurité/conformité, packaging Docker, amélioration du RAG et de l'audit trail.  

---

*Fin du document – Version 1.2 (base de travail)*
