# Référentiel sécurité ANSSI pour coder une application

Nov 11, 2026 · @Kevin

Règles de sécurité que l'agent IA de développement applique en codant l'application, tirées des guides ANSSI « Les Essentiels » et « Les Fondamentaux ». Chaque règle donne une action concrète, un moyen de la vérifier et sa source.

## 0. Mode d'emploi pour l'agent IA

Ce document est une référence normative : l'agent l'applique à tout code qu'il écrit ou modifie. Hypothèse de départ : une application web avec API, base de données relationnelle et éventuellement un client mobile ; les sections sans objet sont ignorées.

**Format d'une règle** : `ID` · niveau · action concrète · vérification · source.

- **DOIT** : obligatoire. Aucune exception sans validation humaine explicite.
- **DEVRAIT** : attendu par défaut. Un écart est justifié par écrit dans la PR.
- **Source** : code du guide ANSSI (table en fin de document). La mention **Complément** signale un choix d'implémentation courant (OWASP, état de l'art) qui concrétise une règle ANSSI sans figurer tel quel dans les guides.

**Comportement attendu de l'agent**

1. Ne jamais contourner une règle pour faire passer un test, simplifier le code ou livrer plus vite ; signaler le blocage à la place.
2. Si une demande contredit une règle DOIT, ne pas l'exécuter telle quelle : proposer la version conforme et expliquer l'écart.
3. Citer les ID concernés dans les messages de commit et les descriptions de PR (ex. `AUTHZ-05`).
4. Dérouler la checklist de la section 14 avant de déclarer une tâche terminée.

**Mise en place** : exporter ce doc en Markdown, le placer à la racine du dépôt (ex. `docs/SECURITY_RULES.md`) et le référencer dans le fichier d'instructions de l'agent (ex. `CLAUDE.md`, `AGENTS.md`).

## 1. Autorisation et contrôle d'accès

L'absence de contrôle d'autorisation côté serveur (IDOR) est le premier risque applicatif du Top 10 OWASP 2025 : chaque accès à une ressource se vérifie.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| AUTHZ-01 | DOIT | À chaque requête, vérifier côté serveur que l'utilisateur courant a le droit sur la ressource ou l'action ciblée. Être authentifié ne suffit jamais. | Test : appeler l'endpoint avec l'ID d'une ressource d'un autre utilisateur → 403 ou 404. | IDOR |
| AUTHZ-02 | DOIT | Centraliser l'autorisation dans un seul mécanisme du framework (middleware, policies, guards) ; pas de contrôle ad hoc dispersé dans les contrôleurs. | Revue : tout handler passe par une policy. | IDOR |
| AUTHZ-03 | DOIT | Refus par défaut : une route sans règle d'autorisation explicite renvoie 403. | Test qui énumère les routes et échoue si l'une n'a pas de policy. | IA-AG, VMW |
| AUTHZ-04 | DOIT | Couvrir les trois variantes : objet (BOLA, filtrer chaque requête par propriétaire ou tenant, ex. `WHERE owner_id = :current_user`), fonction (BFLA, routes admin vérifiant le rôle), propriété (BOPLA, liste blanche des champs lisibles et modifiables, pas d'affectation de masse). | Un test par variante sur chaque ressource. | IDOR + Complément |
| AUTHZ-05 | DOIT | Pour chaque endpoint, écrire un test non passant (utilisateur B refusé sur les ressources de A) en plus du test passant. | La CI échoue si un endpoint n'a pas son test non passant. | IDOR |
| AUTHZ-06 | DOIT | Ne jamais se fier à un contrôle côté client : masquer un bouton ou un champ n'est pas une autorisation. | Test API direct, sans l'interface. | IDOR |
| AUTHZ-07 | DOIT | Moindre privilège : rôles applicatifs définis, chacun limité au strict nécessaire ; pas de compte « super-admin » utilisé au quotidien. | Matrice rôles × permissions versionnée dans le dépôt. | DEP, BDD |
| AUTHZ-08 | DEVRAIT | Exposer des identifiants non séquentiels (UUID) pour freiner l'énumération. Ne remplace pas AUTHZ-01. | Aucun ID auto-incrémenté dans les URL publiques. | Complément |

## 2. Authentification, sessions et comptes

Les comptes à privilèges passent en MFA, et aucun compte par défaut ne survit en production.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| AUTHN-01 | DOIT | MFA obligatoire pour tous les comptes administrateurs de l'application (TOTP ou WebAuthn). | Test : connexion admin sans second facteur refusée. | CMS, BDD, FUITES + Complément |
| AUTHN-02 | DOIT | Aucun compte ni mot de passe par défaut actif en production ; désactiver l'admin créé à l'installation. | Script de déploiement vérifiant l'absence de comptes par défaut. | CMS |
| AUTHN-03 | DOIT | Limiter les tentatives de connexion (ex. délai croissant ou blocage temporaire après 5 échecs par compte et par IP). | Test : 6e tentative ralentie ou bloquée. | CMS + Complément |
| AUTHN-04 | DOIT | Messages d'erreur neutres (« identifiants invalides ») qui ne révèlent pas si le compte existe, y compris sur la réinitialisation de mot de passe. | Test : même réponse et même délai pour un compte existant ou non. | CMS |
| AUTHN-05 | DOIT | Hacher les mots de passe avec une fonction lente et salée (Argon2id, à défaut scrypt ou bcrypt) ; jamais de chiffrement réversible ni de hash rapide (MD5, SHA-1, SHA-256 seul). | Revue du module d'authentification. | CMS + Complément |
| AUTHN-06 | DOIT | Politique de mot de passe définie et appliquée côté serveur (ex. 12 caractères minimum, refus des mots de passe connus comme compromis). | Tests unitaires de la validation. | CMS + Complément |
| AUTHN-07 | DOIT | Cookie de session `__Host-` avec `Secure; HttpOnly; SameSite=Lax` (ou `Strict`) ; régénérer l'ID de session à la connexion ; expiration gérée côté serveur. | Test d'intégration sur les en-têtes `Set-Cookie`. | CMS + Complément |
| AUTHN-08 | DEVRAIT | Expiration de session après inactivité et déconnexion explicite qui invalide la session côté serveur. | Test : session inutilisable après logout. | FUITES |
| AUTHN-09 | DOIT | Comptes distincts pour les humains et pour les applications ; comptes de service à droits minimaux. | Inventaire des comptes techniques. | BDD, WIN |
| AUTHN-10 | DOIT | Pas de cumul de rôles : un administrateur utilise un compte admin dédié, distinct de son compte utilisateur. | Revue du modèle de rôles. | FUITES |

## 3. Données sensibles, chiffrement et fuites

Chaque donnée a un niveau de sensibilité connu, et l'application ne stocke, n'expose et n'exporte que le nécessaire.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| DATA-01 | DOIT | Classer chaque donnée du modèle en non sensible, sensible ou très sensible selon l'impact d'une compromission, et l'annoter dans le schéma (commentaire de colonne ou annotation du modèle). | Toute nouvelle colonne porte sa classification. | SENSIBLES |
| DATA-02 | DOIT | Ne collecter que les champs nécessaires ; coder la purge ou l'archivage sécurisé des données obsolètes (tâche planifiée). | Chaque table a une durée de conservation et un job de purge. | FUITES |
| DATA-03 | DOIT | Chiffrer en transit partout (client↔API, API↔BDD, entre services) et au repos pour les données sensibles. | Aucune connexion en clair dans la config ; test TLS sur la BDD. | BDD, FUITES, DEP |
| DATA-04 | DOIT | Encadrer les exports massifs : pagination obligatoire avec taille maximale, quotas d'export, journalisation et alerte au-delà d'un seuil. | Test : une requête sans limite renvoie au plus la taille maximale. | FUITES, MIGR |
| DATA-05 | DOIT | Aucune donnée de production dans les environnements de dev ou de test ; jeux de données synthétiques ou anonymisés. | Les seeds et fixtures ne contiennent que des données fictives. | BDD |
| DATA-06 | DOIT | Réponses API construites via des DTO explicites, jamais l'entité ORM complète (pas de hash de mot de passe ni de champ interne). | Tests de sérialisation sur chaque ressource. | Complément |
| DATA-07 | DOIT | Protection des données dès la conception et par défaut : les réglages les plus restrictifs sont ceux par défaut. | Revue des valeurs par défaut des paramètres de partage et de visibilité. | FUITES |
| DATA-08 | DEVRAIT | Relever le niveau de sensibilité quand des données s'agrègent (une table qui concentre beaucoup de données sensibles devient très sensible). | Revue de la classification à chaque évolution du modèle. | SENSIBLES |
| DATA-09 | DEVRAIT | Filtres de confidentialité et verrouillage automatique côté poste relèvent de la politique interne ; côté app, masquer par défaut les données sensibles à l'écran (ex. numéros partiellement masqués). | Revue UI. | FUITES + Complément |

## 4. Base de données

Toutes les requêtes sont paramétrées et l'application se connecte avec un compte aux droits minimaux.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| BDD-01 | DOIT | Requêtes préparées ou paramétrées (ORM ou placeholders) pour toute requête ; jamais de concaténation de chaînes avec une entrée utilisateur. | SAST + recherche de requêtes construites par concaténation. | BDD |
| BDD-02 | DOIT | Compte applicatif distinct du compte d'administration, limité aux opérations nécessaires (pas de DDL, pas de superutilisateur) ; compte dédié aux migrations. | Script d'init BDD versionné listant les `GRANT`. | BDD + Complément |
| BDD-03 | DOIT | Désactiver les fonctions qui lisent, écrivent ou exécutent des fichiers du système (ex. `COPY … PROGRAM`, `LOAD_FILE`, `xp_cmdshell`). | Revue de la configuration du SGBD. | BDD + Complément |
| BDD-04 | DOIT | Typage strict des colonnes et contraintes (`NOT NULL`, clés étrangères, `CHECK`). | Revue des migrations. | BDD |
| BDD-05 | DOIT | Connexion BDD chiffrée (TLS) et authentifiée ; la BDD n'est jamais exposée sur Internet. | Test de connexion sans TLS refusé ; port BDD absent des règles publiques. | BDD, ARCHI |
| BDD-06 | DEVRAIT | Restreindre l'accès aux données par vues ou par sécurité au niveau des lignes (RLS) pour les données multi-tenant. | Test : un tenant ne lit aucune ligne d'un autre. | BDD + Complément |
| BDD-07 | DEVRAIT | Séparer les bases par niveau de sensibilité des données. | Cartographie des bases. | BDD |
| BDD-08 | DOIT | SGBD à jour depuis les dépôts officiels ; journaliser les accès administrateurs ; superviser CPU, RAM et stockage. | Alertes de supervision configurées. | BDD |

## 5. Exposition web : HTTPS, en-têtes, entrées, DDoS

Tout passe en HTTPS avec des en-têtes de sécurité stricts, et seules les routes nécessaires sont publiques.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| WEB-01 | DOIT | HTTPS uniquement (redirection HTTP→HTTPS), TLS 1.2 minimum, 1.3 de préférence, configuration conforme au guide TLS de l'ANSSI. | Scan de configuration TLS (ex. Mozilla Observatory, testssl.sh). | CMS, VMW |
| WEB-02 | DOIT | En-tête HSTS : `Strict-Transport-Security: max-age=63072000; includeSubDomains`. | Test d'intégration sur les en-têtes de réponse. | CMS + Complément |
| WEB-03 | DOIT | CSP restrictive, ex. `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` ; pas de `unsafe-inline` sans nonce. | Test sur les en-têtes ; aucune violation CSP en recette. | CMS + Complément |
| WEB-04 | DEVRAIT | En-têtes complémentaires : `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. | Test sur les en-têtes. | Complément |
| WEB-05 | DOIT | Limitation de débit par IP et par compte sur toutes les routes, plus stricte sur connexion, export et recherche. | Test : dépassement du seuil → 429. | DDOS, IDOR |
| WEB-06 | DOIT | N'exposer à Internet que les routes nécessaires ; interface et API d'administration non publiques (réseau d'administration ou VPN). | Inventaire des routes publiques revu à chaque release. | DDOS, CMS, ARCHI |
| WEB-07 | DOIT | Valider toute entrée côté serveur (schéma, type, longueur, format) et encoder les sorties selon leur contexte (HTML, URL, JS). | Validation par schéma sur chaque endpoint ; tests d'injection en DAST. | Complément |
| WEB-08 | DOIT | Requêtes sortantes (récupération d'URL, webhooks, import distant) limitées à une liste d'autorisation de destinations. | Test : URL interne ou non autorisée refusée. | CMS + Complément |
| WEB-09 | DOIT | Réduire au strict minimum les plugins, extensions et modules tiers ; uniquement des composants activement maintenus. | Inventaire des extensions. | CMS |
| WEB-10 | DEVRAIT | Prévoir protection anti-DDoS ou CDN en frontal, pare-feu applicatif en aval, et une administration possible pendant une attaque (accès admin séparé). | Procédure DDoS documentée et testée. | DDOS |

## 6. Gestion des secrets

Aucun secret n'apparaît dans le code, l'historique Git ou les journaux.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| SECRET-01 | DOIT | Aucun secret (mot de passe, clé d'API, jeton, clé privée) en dur dans le code, les fichiers de configuration versionnés, les journaux ou les messages d'erreur. | Scan de secrets à chaque commit. | DEVSECOPS |
| SECRET-02 | DOIT | Lire les secrets depuis un gestionnaire de secrets (coffre, secret manager du cloud) ou des variables injectées au déploiement ; un gestionnaire distinct par environnement (hors prod / prod). | Revue de la config de déploiement. | DEVSECOPS |
| SECRET-03 | DOIT | Scanner le dépôt en CI (ex. gitleaks, trufflehog) et bloquer le merge si un secret est détecté ; tout secret exposé est révoqué puis remplacé, pas seulement supprimé du code. | Étape CI bloquante. | DEVSECOPS + Complément |
| SECRET-04 | DOIT | Jetons générés à la demande, à durée de vie courte et à portée minimale. | Revue des durées de validité configurées. | DEVSECOPS, IA-AG |
| SECRET-05 | DOIT | Fournir un `.env.example` sans valeur réelle ; `.env` et fichiers de clés dans `.gitignore`. | Présence vérifiée en CI. | Complément |

## 7. Dépendances et logiciels libres

Chaque dépendance est justifiée, évaluée, verrouillée et scannée.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| DEP-01 | DOIT | Minimiser les dépendances ; justifier toute nouvelle dépendance dans la PR. | Section « dépendances ajoutées » dans le modèle de PR. | DEVSECOPS |
| DEP-02 | DOIT | Avant d'ajouter une bibliothèque open source, vérifier : version publiée dans les 12 derniers mois, mainteneurs identifiés, contact ou politique de sécurité (`SECURITY.md`), délai de correction des failles critiques, absence de CVE connues, documentation et configuration sûre par défaut. | Critères notés dans la PR. | LOGLIBRE + Complément |
| DEP-03 | DOIT | Verrouiller les versions (lockfile versionné) et générer un SBOM (CycloneDX ou SPDX) à chaque build. | SBOM publié comme artefact de build. | LOGLIBRE, POSTE |
| DEP-04 | DOIT | Scanner les vulnérabilités des dépendances en CI (ex. OSV-Scanner, `npm audit`, `pip-audit`, Dependabot) ; corriger avant déploiement. | Étape CI bloquante sur les vulnérabilités critiques. | DEVSECOPS + Complément |
| DEP-05 | DEVRAIT | Préférer des langages et bibliothèques à gestion mémoire sûre et typage fort ; en C ou en Rust, appliquer les règles de programmation de l'ANSSI. | Revue d'architecture. | LOGLIBRE |

## 8. CI/CD et DevSecOps

La chaîne CI/CD de production est traitée comme un outil d'administration : tests de sécurité automatiques, artefacts signés, accès restreints.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| CI-01 | DOIT | Analyse statique (SAST) à chaque PR ; analyse dynamique (DAST) sur l'environnement de qualification après déploiement. | Étapes présentes et bloquantes dans le pipeline. | IDOR, DEVSECOPS |
| CI-02 | DOIT | Tests de sécurité automatisés : non-régression, étanchéité entre profils utilisateurs (AUTHZ-05), conformité de l'IaC. | Couverture suivie en CI. | DEVSECOPS |
| CI-03 | DOIT | Revue de code par un pair avec la checklist de la section 14, dont le contrôle d'accès. | Branche protégée : 1 approbation minimum. | IDOR |
| CI-04 | DOIT | Signer commits et tags de version ; signer les artefacts et vérifier la signature avant tout déploiement. | Le déploiement refuse un artefact non signé. | DEVSECOPS |
| CI-05 | DOIT | MFA sur l'accès aux dépôts et à la plateforme CI/CD. | Paramètre d'organisation imposant la MFA. | DEVSECOPS |
| CI-06 | DOIT | CI/CD de dev et de prod séparées et non exposées directement sur Internet ; déploiement prod avec moindre privilège, jetons générés à la demande, journalisé et supervisé. | Revue des permissions du pipeline prod. | DEVSECOPS |
| CI-07 | DEVRAIT | Runners éphémères, réinstanciés régulièrement, sans données persistantes. | Configuration des runners. | DEVSECOPS |
| CI-08 | DEVRAIT | Tests d'intrusion ou bug bounty périodiques. | Planning annuel. | IDOR |

## 9. Journalisation et détection

L'application journalise ses événements de sécurité dans un format exploitable, sans donnée sensible, dans des journaux qu'elle ne peut pas altérer.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| LOG-01 | DOIT | Journaliser : connexions réussies et échouées, déconnexions, changements de rôles ou de droits, actions d'administration, accès refusés (403), exports, changements de configuration. | Test : chaque événement produit une entrée de journal. | CMS, BDD, POSTE |
| LOG-02 | DOIT | Format structuré (JSON) avec horodatage UTC issu d'une source de temps synchronisée, ID utilisateur, IP, ID de requête ; envoi vers une plateforme centralisée. | Revue de la configuration du logger. | DEP, POSTE + Complément |
| LOG-03 | DOIT | Jamais de mot de passe, jeton, secret ni donnée sensible en clair dans les journaux (masquage automatique des champs sensibles). | Test : un login ne journalise pas le mot de passe. | DEVSECOPS, IA-AG, POSTE |
| LOG-04 | DOIT | Journaux protégés en intégrité : l'application écrit en ajout seul et ne peut ni modifier ni supprimer ses journaux. | Permissions du stockage de journaux. | FUITES, IA-AG, POSTE |
| LOG-05 | DOIT | Règle de détection d'énumération : alerte quand un compte ou une IP dépasse un seuil de requêtes sur un endpoint ou parcourt des identifiants séquentiels ; blocage automatique possible. Seuil calé sur le trafic normal et revu régulièrement. | Test de charge déclenchant l'alerte. | IDOR |
| LOG-06 | DEVRAIT | Après une attaque DDoS, réexaminer les autres alertes de la période : le bruit peut masquer une attaque plus discrète. | Étape dans la procédure d'incident. | DDOS |

## 10. Architecture, administration et déploiement

Les environnements sont séparés, les composants cloisonnés par exposition, et l'administration ne passe jamais par l'interface publique.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| ARCH-01 | DOIT | Séparer dev, test et prod : comptes, secrets, bases et réseaux distincts. | Aucune ressource partagée entre environnements dans l'IaC. | IA-AG, DEVSECOPS |
| ARCH-02 | DOIT | Cloisonner les composants par sensibilité et exposition (front exposé, API, BDD en réseau privé) ; n'autoriser entre eux que les flux nécessaires. | Matrice des flux versionnée ; règles réseau en refus par défaut. | ARCHI, DEP |
| ARCH-03 | DEVRAIT | Faire circuler les flux de la zone de plus haute confiance vers la zone de moindre confiance (le back-office pousse vers le front, pas l'inverse). | Revue de la matrice des flux. | ARCHI |
| ARCH-04 | DOIT | Interface d'administration séparée de l'interface utilisateur (domaine ou port distinct), accessible seulement depuis un réseau d'administration. | Test : l'admin est injoignable depuis Internet. | ARCHI, CMS |
| ARCH-05 | DOIT | Conteneurs et runtime durcis : utilisateur non-root, image minimale, aucun privilège supplémentaire, système de fichiers en lecture seule quand c'est possible ; OS hôte durci. | Scan d'image et revue du Dockerfile. | CMS, DEVSECOPS + Complément |
| ARCH-06 | DOIT | Tenir à jour un dossier d'architecture technique : contexte et données, identités et droits, administration, cloisonnement, chiffrement, filtrage, MCS, accès distants, interconnexions, sauvegardes, supervision. | Mis à jour à chaque évolution d'architecture. | ARCHI, DEVSECOPS |
| ARCH-07 | DOIT | Appliquer au plus vite les correctifs de sécurité (OS, runtime, images de base) ; reconstruire régulièrement les images. | Âge maximal des images de base suivi. | DEP, VIRT |
| ARCH-08 | DEVRAIT | En cas de migration de plateforme ou de données : chiffrer les transferts, aucun changement impactant pendant la bascule, audit après migration, puis décommissionnement des anciens comptes, données et infrastructures. | Plan de migration revu par la sécurité. | MIGR |

## 11. Sauvegarde et résilience

Une sauvegarde ne compte que si elle est hors d'atteinte d'un attaquant et si sa restauration est testée.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| RES-01 | DOIT | Sauvegardes automatisées de la base et des fichiers utilisateurs, chiffrées, avec au moins une copie hors ligne ou immuable. | Politique de sauvegarde versionnée. | SAUV, DEP |
| RES-02 | DOIT | Sauvegarder aussi de quoi reconstruire : IaC, scripts de déploiement, configuration, versions des composants. | Reconstruction d'un environnement depuis le dépôt seul. | SAUV, VIRT |
| RES-03 | DOIT | Tester la restauration régulièrement et de façon automatisée (ex. restauration hebdomadaire dans un environnement isolé, avec contrôle d'intégrité). | Job de restauration avec rapport. | SAUV + Complément |
| RES-04 | DOIT | Identifiants de sauvegarde indépendants des comptes applicatifs et de l'annuaire de production ; l'application ne peut ni modifier ni supprimer les sauvegardes. | Revue des permissions. | SAUV |
| RES-05 | DOIT | Après un incident, restaurer depuis des sources de confiance (images officielles, artefacts signés) et contrôler la conformité : une sauvegarde peut contenir la compromission. | Procédure de reprise documentée. | SAUV |
| RES-06 | DEVRAIT | Coder un mode dégradé : passage en lecture seule et désactivation des fonctions non critiques par feature flag. | Exercice de bascule. | DDOS, DEP |

## 12. Cryptographie et certificats

L'agent n'implémente jamais de cryptographie lui-même et ne désactive jamais une vérification de certificat.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| CRY-01 | DOIT | Utiliser uniquement des bibliothèques cryptographiques reconnues et maintenues ; aucun algorithme maison. | Revue de code. | Complément |
| CRY-02 | DOIT | Clés asymétriques : RSA 3072 bits ou ECDSA P-256 minimum pour les certificats d'entité finale ; RSA 4096 ou P-384 pour une autorité racine. | Revue des paramètres de génération. | IGC |
| CRY-03 | DOIT | Vérifier la chaîne complète (signature, révocation, validité) sur toute connexion TLS sortante ; ne jamais désactiver la vérification (`verify=False`, `rejectUnauthorized: false`, `InsecureSkipVerify`). | Recherche de ces options dans le code ; SAST. | IGC + Complément |
| CRY-04 | DOIT | Une bi-clé par usage ; nouvelle bi-clé à chaque renouvellement de certificat. | Procédure de renouvellement. | IGC |
| CRY-05 | DOIT | Jetons, identifiants de session et clés générés par le générateur d'aléa cryptographique du système (CSPRNG), jamais par un aléa standard. | SAST. | IGC + Complément |
| CRY-06 | DEVRAIT | Automatiser l'émission et le renouvellement des certificats via ACME, en sécurisant le client ACME (droits minimaux, clés protégées). | Renouvellement automatique testé. | IGC, ACME |
| CRY-07 | DEVRAIT | Agilité cryptographique : algorithmes configurables, en vue de la migration post-quantique. | Algorithmes non codés en dur. | IGC |

## 13. Fonctions IA et agents embarqués dans l'app

Si l'application intègre un LLM ou un agent, ses actions passent par des contrôles déterministes qu'il ne peut ni contourner ni modifier.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| IA-01 | DOIT | Traiter entrées, sorties et mémoires du modèle comme non fiables : valider et filtrer avant d'exécuter, d'afficher ou de stocker. | Tests d'injection de prompt. | IA-AG |
| IA-02 | DOIT | Chaque outil appelable par l'agent passe par un contrôle d'autorisation déterministe hors du modèle, en refus par défaut, avec les droits de l'utilisateur courant. | Test : une action hors droits est refusée même si le modèle la demande. | IA-AG |
| IA-03 | DOIT | Classer les actions de l'agent en trois catégories : autonome, validation humaine obligatoire, interdite. Validation humaine pour les actions critiques, l'accès aux données sensibles, les changements de droits et les déploiements ; l'écran de validation montre l'action exacte et n'exécute que celle-ci. | Liste des actions versionnée avec leur catégorie. | IA-AG |
| IA-04 | DOIT | Aucun secret dans le prompt, le contexte, la mémoire ou les journaux ; l'agent reçoit des jetons courts à portée minimale via un coffre ou un proxy. | Revue du code d'orchestration. | IA-AG |
| IA-05 | DOIT | Mémoires séparées par client (tenant) et par environnement. | Test : aucune donnée d'un tenant dans le contexte d'un autre. | IA-AG |
| IA-06 | DOIT | Limiter les appels consécutifs entre agents ou outils, alerter sur les taux anormaux, prévoir un arrêt d'urgence qui révoque les accès. | Test du kill switch. | IA-AG |
| IA-07 | DOIT | Journaliser la chaîne complète requête → autorisation → action → résultat, hors de portée de l'agent. | Revue des journaux. | IA-AG |
| IA-08 | DOIT | Considérer toute donnée envoyée à un modèle hébergé comme accessible au fournisseur ; pas de données très sensibles sans validation explicite. | Classification DATA-01 vérifiée avant envoi. | IA-AG |
| IA-09 | DEVRAIT | Versionner les prompts système et les composants, tester le comportement avant chaque déploiement, prévoir un retour arrière. | Tests de non-régression en CI. | IA-AG |

## 14. Checklist de revue avant merge

L'agent déroule cette liste avant de déclarer une tâche terminée et signale tout point non conforme dans la PR.

1. Chaque nouvel endpoint a une policy d'autorisation et un test non passant (AUTHZ-01, AUTHZ-05).
2. Aucune requête SQL construite par concaténation (BDD-01).
3. Aucun secret dans le diff ; scan de secrets vert (SECRET-01, SECRET-03).
4. Nouvelles dépendances justifiées ; scan de vulnérabilités vert ; SBOM régénéré (DEP-01 à DEP-04).
5. Réponses API par DTO explicites, sans champ sensible (DATA-06).
6. Nouvelles données classées et dotées d'une durée de conservation (DATA-01, DATA-02).
7. Événements de sécurité journalisés, sans donnée sensible (LOG-01, LOG-03).
8. Entrées validées côté serveur ; limitation de débit sur les nouvelles routes (WEB-05, WEB-07).
9. En-têtes HTTP et cookies conformes (WEB-02, WEB-03, AUTHN-07).
10. Aucune vérification TLS désactivée, aucun aléa non cryptographique pour un secret (CRY-03, CRY-05).
11. SAST vert ; commits et tags signés (CI-01, CI-04).
12. Fonctions IA : actions classées et contrôlées hors du modèle (IA-02, IA-03).

## 15. Hors périmètre du code

Ces sujets des guides relèvent de l'équipe infra, de l'exploitation ou de la gouvernance ; l'agent ne les implémente pas mais peut les signaler s'ils bloquent une règle ci-dessus.

- **Gouvernance** : analyse de risque EBIOS RM, PCA/PRA, plan de gestion de crise, exercices (DEP).
- **Annuaire et cœur de confiance** : identification du Tier 0, tiering AD, audits BloodHound / PingCastle (CDC).
- **Serveurs Windows** : durcissement initial, LAPS, BitLocker, Credential Guard (WIN).
- **Virtualisation et VMware** : cluster d'administration dédié, durcissement ESXi, micro-segmentation NSX (VIRT, VMW).
- **IGC interne** : hiérarchie d'autorités, HSM, politique de certification (IGC).
- **Postes et terminaux** : Wi-Fi d'entreprise, hygiène des téléphones mobiles, postes multi-environnements (WIFI, MOBILE, POSTE).
- **Infrastructure de sauvegarde** : isolement d'urgence, indépendance vis-à-vis de l'AD (SAUV).
- **Protection anti-DDoS réseau** : contrat avec l'hébergeur, le FAI ou un prestataire spécialisé (DDOS).

## 16. Sources

Guides ANSSI des collections Essentiels et Fondamentaux, [catalogue MesServicesCyber](https://messervices.cyber.gouv.fr/catalogue#guides?collections=essentiels,fondamentaux). Les Fondamentaux Zero Trust, ACME et Sauvegarde n'ont été lus que par leur page de présentation.

| Code | Guide | Version |
| --- | --- | --- |
| IA-AG | [Sécuriser un système IA agentique](https://messervices.cyber.gouv.fr/documents-guides/anssi_back_to_basics_agentic_ia_1.0.pdf) (version anglaise) | v1.0 – 10/2026 |
| IDOR | [Se protéger des failles de type IDOR](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_IDOR_1.0.pdf) | v1.0 – 10/2026 |
| WIFI | [Sécurisation des réseaux Wi-Fi](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_wifi_1.0.pdf) | v1.0 – 08/2026 |
| CDC | [Cœur de confiance](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiel_coeur_de_confiance_1.0.pdf) | v1.0 – 07/2026 |
| DEP | [Défense en profondeur – méthodologie](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_defense_profondeur_methodologie_1.0.pdf) et [mise en œuvre](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_defense_profondeur_mise_en_oeuvre_1.0.pdf) | v1.0 – 07/2026 |
| MIGR | [Sécuriser une migration numérique](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_migration_1.0.pdf) | v1.0 – 01/2026 |
| WIN | [Sécurisation initiale d'un serveur Windows membre](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_serveur_Windows_membre_AD_DS_v1.0.pdf) | v1.0 – 10/2025 |
| ARCHI | [Architecture sécurisée de SI](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_architecture_securisee_v1.0.pdf) | v1.0 – 08/2025 |
| IGC | [Infrastructure de gestion de clés](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_igc_1.0.pdf) | v1.0 – 08/2025 |
| ZT | [Modèle Zero Trust](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_zero_trust_1.0.pdf) | v1.0 – 06/2025 |
| LOGLIBRE | [Sélection d'un logiciel libre](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_selection_logiciel_libre_1.0.pdf) | v1.0 – 05/2025 |
| MOBILE | [Hygiène numérique des téléphones mobiles](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_hygiene_telephones_mobiles_1.1.pdf) | v1.1 – 12/2025 |
| SENSIBLES | [Données et traitements sensibles](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_donn%C3%A9es_traitements_sensibles_1.0.pdf) | v1.0 – 03/2025 |
| BDD | [Bases de données relationnelles](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_bdd_relationnelles_1.0.pdf) | v1.0 – 12/2024 |
| FUITES | [Se protéger des fuites de données](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_fuites_donn%C3%A9es_1.0.pdf) | v1.0 – 01/2025 |
| DDOS | [Dénis de service distribués](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_denis-de-service-distribues_v2.0.pdf) | v2.0 – 04/2024 |
| DEVSECOPS | [DevSecOps](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_devsecops_v1.0.pdf) | v1.0 – 02/2024 |
| VIRT | [Virtualisation](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_virtualisation_v1.0.pdf) | v1.0 – 02/2024 |
| CMS | [Mise en œuvre sécurisée d'un CMS](<https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_mise-en-oeuvre-securisee-cms_v1.1%20(1).pdf>) | v1.1 – 12/2023 |
| SAUV | [Sauvegarde des SI](https://messervices.cyber.gouv.fr/documents-guides/anssi_essentiels_sauvegarde-si_v1.1.pdf) | v1.1 – 12/2023 |
| POSTE | [Poste de travail multi-environnements](https://messervices.cyber.gouv.fr/documents-guides/anssi-fondamentaux-securisation-poste-multi-environnements-v1-0.pdf) | v1.0 – 01/2026 |
| VMW | [Sécurisation d'une infrastructure VMware](https://messervices.cyber.gouv.fr/documents-guides/anssi-fondamentaux-securisation_infrastructure_vmware_v1-0.pdf) | v1.0 |
| ACME | [Automatisation des certificats avec ACME](https://messervices.cyber.gouv.fr/guides/automatisation-de-la-gestion-des-certificats-avec-acme) | v1.1 – 01/2025 |
