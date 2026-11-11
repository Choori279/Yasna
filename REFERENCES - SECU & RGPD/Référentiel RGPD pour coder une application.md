# Référentiel RGPD pour coder une application

Nov 11, 2026 · @Kevin

Règles de protection des données personnelles que l'agent IA de développement applique en codant l'application, tirées des guides et recommandations de la CNIL. Il complète le Référentiel DEV (sécurité ANSSI) : même format de règle, action concrète, vérification et source.

## 0. Mode d'emploi pour l'agent IA

Ce document s'applique dès que l'application manipule une donnée personnelle, c'est-à-dire toute information qui se rapporte à une personne identifiée ou identifiable (nom, e-mail, identifiant, adresse IP, géolocalisation, photo, etc.).

**Format et niveaux** : identiques au Référentiel DEV. `ID` · DOIT / DEVRAIT · action concrète · vérification · source. La mention **Complément** signale une concrétisation technique qui ne figure pas telle quelle dans les sources CNIL lues.

**Ce que l'agent ne décide pas seul** : la finalité d'un traitement, sa base légale, les durées de conservation et le choix d'un sous-traitant sont des décisions du responsable de traitement (ou de son DPO). L'agent ne les invente jamais.

1. S'il manque une de ces décisions, l'agent code le mécanisme (champ, purge paramétrable, écran de consentement) et marque la valeur `TODO(RGPD): à valider par le DPO`, puis le signale dans la PR.
2. Ne jamais ajouter de collecte, de traceur ou de SDK tiers qui n'a pas été demandé explicitement.
3. Citer les ID concernés dans les commits et les PR (ex. `MIN-02`, `DROIT-03`).
4. Dérouler la checklist de la section 12 avant de déclarer une tâche terminée.

**Articulation avec le Référentiel DEV** : la sécurité technique (autorisation, chiffrement, secrets, CI/CD) y est détaillée ; la section 7 ici ne reprend que les exigences propres à la CNIL et renvoie aux règles DEV correspondantes.

**Mise en place** : exporter ce doc en Markdown, le placer dans le dépôt (ex. `docs/RGPD_RULES.md`) à côté de `docs/SECURITY_RULES.md` et référencer les deux dans le fichier d'instructions de l'agent.

## 1. Cadrage : finalités, bases légales, registre, AIPD

Chaque traitement de données personnelles a une finalité et une seule base légale par finalité, documentées dans le dépôt avant d'être codées.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| CAD-01 | DOIT | Tenir dans le dépôt un inventaire des données personnelles (ex. `docs/data-inventory.yml`) : pour chaque donnée, finalité, base légale, caractère obligatoire ou facultatif, destinataires, durée de conservation, sensibilité. | Toute PR qui ajoute un champ personnel met à jour l'inventaire. | DEV-01, DEV-07, SEC-01 |
| CAD-02 | DOIT | Une seule base légale par finalité (contrat, consentement, intérêt légitime, obligation légale, mission d'intérêt public, intérêts vitaux) ; un même traitement peut avoir plusieurs finalités, chacune avec sa base. | Revue de l'inventaire. | DEV-15 |
| CAD-03 | DOIT | Coder les droits ouverts selon la base légale : le consentement ouvre le retrait ; le contrat ouvre la portabilité mais pas l'opposition ; l'intérêt légitime ouvre l'opposition mais pas la portabilité ; l'obligation légale n'ouvre ni portabilité ni opposition. | Matrice base légale × droits implémentée et testée (section 5). | DEV-15 |
| CAD-04 | DOIT | Données sensibles (santé, opinions, orientation sexuelle, biométrie, etc.) : ne pas les collecter si l'on peut s'en passer ; sinon exiger une exception de l'article 9 validée et le signaler. | Aucun champ sensible sans validation tracée. | DEV-07, DEV-15 |
| CAD-05 | DOIT | Maintenir un schéma des flux de données (qui envoie quoi à qui, y compris sous-traitants) mis à jour à chaque évolution. | Schéma versionné dans le dépôt. | SEC-01, DEV-02 |
| CAD-06 | DEVRAIT | Signaler au DPO toute fonctionnalité susceptible d'exiger une analyse d'impact (AIPD) : profilage, surveillance, données sensibles à grande échelle, géolocalisation, croisement de fichiers. | Mention dans la PR. | SEC-20 |

## 2. Minimisation et conception des formulaires

L'application ne collecte que les données adéquates, pertinentes et nécessaires à la finalité, et au niveau de précision strictement utile.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| MIN-01 | DOIT | Avant d'ajouter un champ, justifier dans la PR son utilité pour une finalité de l'inventaire (CAD-01) ; sinon ne pas le créer. | Section « données collectées » dans le modèle de PR. | DEV-07 |
| MIN-02 | DOIT | Réduire la précision à la source : formats de saisie contraints (listes déroulantes, année seule si l'année suffit, tranches plutôt que valeurs exactes). | Revue du schéma et des formulaires. | DEV-07, SEC-11 |
| MIN-03 | DOIT | Éviter les zones de texte libre ; si elles sont indispensables, afficher un avertissement contre la saisie de données sensibles ou excessives et limiter leur longueur. | Revue UI. | SEC-11 + Complément |
| MIN-04 | DOIT | Distinguer visuellement champs obligatoires et facultatifs ; un champ facultatif ne bloque jamais la soumission. | Tests de formulaire. | DEV-12 |
| MIN-05 | DOIT | Fonctionnalités de confort (géolocalisation, contacts, appareil photo) : désactivées par défaut, activables par l'utilisateur, avec une alternative (ex. saisie manuelle d'adresse) ; données conservées seulement le temps de la fonctionnalité. | Test : l'application fonctionne sans la permission. | DEV-07, SEC-23 |
| MIN-06 | DOIT | Paramètres par défaut les plus protecteurs (profil non public, partage désactivé, communications marketing décochées). | Tests sur les valeurs par défaut. | SEC-11 |
| MIN-07 | DEVRAIT | Pseudonymiser dès que l'identité directe n'est pas nécessaire (identifiant interne plutôt que nom/e-mail dans les traitements secondaires, statistiques). Une donnée pseudonymisée reste une donnée personnelle. | Revue d'architecture. | DEV-07 |

## 3. Information des personnes et consentement

L'information est donnée au moment de la collecte, en langage simple, et un consentement n'est valable que s'il résulte d'un acte positif, éclairé et retirable aussi facilement qu'il a été donné.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| INFO-01 | DOIT | Afficher une mention d'information au point de collecte (formulaire, inscription) avec un premier niveau court et un lien vers la politique complète. | Chaque formulaire collectant des données porte sa mention. | DEV-12 |
| INFO-02 | DOIT | La politique de confidentialité contient : identité et contact du responsable, finalités, bases légales (et intérêts poursuivis si intérêt légitime), caractère obligatoire ou facultatif, destinataires, durées, droits et moyen de les exercer, contact du DPO, droit de réclamation auprès de la CNIL, transferts hors UE le cas échéant. | Checklist de contenu en recette. | DEV-12 |
| INFO-03 | DOIT | Séparer l'information vie privée des CGU ; la rendre accessible depuis toutes les pages et dans le compte utilisateur. | Lien présent dans le pied de page et le compte. | DEV-12 |
| INFO-04 | DOIT | Informer à nouveau en cas de changement substantiel (nouvelle finalité, nouveaux destinataires) ; versionner la politique. | Historique des versions stocké. | DEV-12 |
| CONS-01 | DOIT | Consentement par acte positif : cases décochées par défaut, aucun consentement déduit du silence, de la poursuite de la navigation ou de la fermeture d'une fenêtre. | Test : fermer la fenêtre vaut refus. | COOK |
| CONS-02 | DOIT | Un consentement par finalité ; « tout accepter » seulement si les finalités sont présentées avant. | Revue UI. | COOK |
| CONS-03 | DOIT | Stocker la preuve : identifiant, finalités acceptées ou refusées, version du texte présenté, horodatage, canal. | Table `consents` avec ces colonnes. | DEV-15 + Complément |
| CONS-04 | DOIT | Retrait du consentement aussi simple que son recueil, accessible à tout moment ; le retrait stoppe immédiatement le traitement concerné. | Test de bout en bout du retrait. | COOK, DEV-15 |
| CONS-05 | DOIT | Aucune interface trompeuse : boutons d'acceptation et de refus de même taille, même couleur, même niveau. | Revue UI. | COOK |

## 4. Cookies, traceurs et mesure d'audience

Aucun traceur non exempté n'est déposé ni lu avant consentement, et refuser est aussi simple qu'accepter. « Traceur » couvre les cookies, le `localStorage`, `IndexedDB`, les pixels, les identifiants publicitaires et le fingerprinting.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| TRK-01 | DOIT | Inventorier tous les traceurs (propres et tiers) avec finalité, émetteur et durée de vie ; tenir à jour une liste des responsables accessible depuis le bandeau. | Audit du navigateur (onglet Stockage/Réseau) à chaque release. | COOK, DEV-16 |
| TRK-02 | DOIT | Bloquer techniquement tout script et traceur non exempté tant que l'utilisateur n'a pas accepté la finalité correspondante (chargement conditionnel, pas seulement masqué). | Test : au premier chargement, aucun cookie ni requête tierce non exemptée. | COOK |
| TRK-03 | DOIT | Bandeau avec « Tout accepter » et « Tout refuser » au même niveau et sur le même format, plus un accès au paramétrage par finalité. | Revue UI. | COOK |
| TRK-04 | DOIT | Mémoriser le choix (acceptation comme refus) pour ne pas solliciter à nouveau ; durée recommandée : 6 mois. | Test : pas de nouveau bandeau avant l'expiration. | COOK |
| TRK-05 | DOIT | Lien permanent (pied de page) pour modifier ou retirer le consentement ; le retrait supprime les traceurs concernés. | Test du retrait. | COOK |
| TRK-06 | DOIT | Traceurs exemptés limités à : mémorisation du choix cookies, authentification et sécurité de l'authentification, panier, personnalisation d'interface attendue (langue), équilibrage de charge, limitation de contenu gratuit, certaines mesures d'audience. Tout autre traceur passe par le consentement. | Classement de chaque traceur dans l'inventaire TRK-01. | COOK |
| TRK-07 | DEVRAIT | Mesure d'audience sans consentement uniquement avec un outil configuré selon les conditions d'exemption de la CNIL (finalité limitée à la mesure, pas de recoupement, durées limitées ; repères publiés par la CNIL : 13 mois pour le traceur, 25 mois pour les données). | Configuration de l'outil revue par le DPO. | COOK + Complément |
| TRK-08 | DOIT | Outils tiers qui collectent des données (ex. certains CAPTCHA, SDK publicitaires) soumis au consentement s'ils ne sont pas strictement nécessaires. | Inventaire des SDK (section 8). | DEV-09 |

## 5. Droits des personnes : fonctions à coder

Chaque droit ouvert par la base légale (CAD-03) a un point d'entrée simple, authentifié et tracé ; l'implémenter dans l'application n'est pas obligatoire mais réduit fortement la charge de traitement.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| DROIT-01 | DOIT | Indiquer où et comment exercer ses droits (formulaire ou adresse dédiée) dans la mention d'information, la politique et le compte. | Lien présent aux trois endroits. | DEV-13 |
| DROIT-02 | DOIT | Accès : écran ou export listant toutes les données détenues sur la personne ; archive téléchargeable si le volume est important. | Test : l'export couvre toutes les tables de l'inventaire CAD-01. | DEV-13 |
| DROIT-03 | DOIT | Portabilité (si ouverte) : export dans un format structuré lisible par machine (JSON, CSV ou XML). | Test du format de sortie. | DEV-13 |
| DROIT-04 | DOIT | Rectification : modification directe des données dans le compte. | Test d'édition. | DEV-13 |
| DROIT-05 | DOIT | Effacement : fonction supprimant toutes les données de la personne, notifiant automatiquement les sous-traitants, et empêchant leur réapparition depuis les sauvegardes (effacement ou liste d'exclusion à la restauration). | Test : après effacement, aucune ligne liée à l'utilisateur ; restauration testée. | DEV-13 |
| DROIT-06 | DOIT | Opposition (si ouverte) : fonction d'opposition par finalité qui arrête la collecte et le traitement concernés. | Test par finalité. | DEV-13 |
| DROIT-07 | DOIT | Limitation : statut « gelé » posable par un administrateur rendant les données de la personne non lisibles et non modifiables par les traitements. | Test : données gelées exclues des traitements. | DEV-13 |
| DROIT-08 | DOIT | Authentifier la personne avant toute opération sur ses droits et journaliser chaque demande et action. | Journal des demandes consultable. | DEV-13 |
| DROIT-09 | DOIT | Suivi de la demande : accusé de réception, statut, réponse dans le délai légal d'un mois, historique conservé et téléchargeable. | Tableau de bord des demandes avec date d'échéance. | DEV-13 + Complément |

## 6. Durées de conservation et purge

Aucune donnée n'est conservée indéfiniment : chaque catégorie suit trois phases (base active, archivage intermédiaire, suppression ou anonymisation) et la purge est automatique.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| RET-01 | DOIT | Associer une durée de conservation à chaque catégorie de données et aux journaux, paramétrable (pas codée en dur) ; valeur fixée par le responsable de traitement (sinon `TODO(RGPD)`). | Chaque entrée de l'inventaire a une durée. | DEV-07, DEV-14 |
| RET-02 | DOIT | Horodater chaque enregistrement (création, dernière activité) pour pouvoir calculer son expiration. | Colonnes présentes sur chaque table personnelle. | DEV-07 |
| RET-03 | DOIT | Purge automatique planifiée (job, cron ou ordonnanceur de BDD) qui supprime ou anonymise les données expirées. | Test : une donnée expirée disparaît au passage du job. | DEV-07 |
| RET-04 | DOIT | Réutiliser pour la purge le même code que l'effacement à la demande (DROIT-05) pour un comportement homogène. | Revue de code. | DEV-14 |
| RET-05 | DOIT | L'archivage intermédiaire n'est pas un simple drapeau « archivé » en base active : stockage séparé, accès réservé à un rôle dédié et tracé. | Test : un utilisateur courant ne lit pas les archives. | DEV-14 |
| RET-06 | DOIT | Journaliser chaque purge (catégorie, volume, date) comme preuve d'effacement, sans y recopier les données supprimées. | Journal de purge consultable. | DEV-07 |
| RET-07 | DEVRAIT | Repères CNIL à proposer au DPO : journaux 6 mois à 1 an ; prospect sans réponse 3 ans ; paie 5 ans ; dossier médical 20 ans. | Valeurs validées dans l'inventaire. | DEV-14, SEC-16 |

## 7. Sécurité des données personnelles (exigences CNIL)

Le guide de sécurité de la CNIL est son référentiel de contrôle : ces règles complètent ou précisent le Référentiel DEV. En cas d'écart, la valeur la plus stricte s'applique.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| PSEC-01 | DOIT | Mots de passe : stocker seulement une empreinte salée (bcrypt, scrypt, Argon2 ou PBKDF2) ; entropie minimale de 80 bits par défaut (ex. 12 caractères avec majuscules, minuscules, chiffres et spéciaux, ou 14 caractères sans spécial obligatoire) ; 50 bits (ex. 8 caractères de 3 types) seulement si l'accès est restreint (temporisation, CAPTCHA ou blocage après 10 échecs). Précise AUTHN-05 et AUTHN-06. | Tests unitaires de la politique. | SEC-04, SEC-21 |
| PSEC-02 | DOIT | Ne pas imposer de renouvellement périodique aux simples utilisateurs (mais oui aux administrateurs) ; forcer le changement d'un mot de passe attribué à la première connexion ; ne pas bloquer le collage ni l'autocomplétion (gestionnaires de mots de passe). | Tests de parcours. | SEC-04 |
| PSEC-03 | DOIT | MFA pour l'accès aux données sensibles, l'administration et les accès distants. Un code envoyé par e-mail en plus du mot de passe n'est pas considéré comme un vrai second facteur. | Revue du mécanisme d'authentification. | SEC-04 |
| PSEC-04 | DOIT | Aucune donnée personnelle ni secret dans les URL (identifiants, jetons, e-mails en paramètre GET). | Recherche dans les routes et les journaux d'accès. | SEC-10 |
| PSEC-05 | DOIT | Traces applicatives : journaliser création, consultation, partage, modification et suppression de données personnelles avec auteur, date, heure, nature de l'opération et référence (pas la copie) de la donnée ; conservation glissante de 6 mois à 1 an ; jamais de mot de passe ni d'empreinte ; aucun usage détourné (ex. comptage du temps de travail). | Test : une consultation produit une trace conforme. | SEC-16, DEV-08 |
| PSEC-06 | DEVRAIT | Montrer à l'utilisateur ses dernières connexions (ex. les 3 dernières) pour l'associer à la détection d'abus. | Écran présent dans le compte. | SEC-16 |
| PSEC-07 | DOIT | Cryptographie autorisée : SHA-2 ou SHA-3 ; AES (128, 192 ou 256 bits) en GCM, CCM ou EAX, ou ChaCha20-Poly1305 ; RSA-OAEP ; RSA-PSS ou ECDSA. Interdits : DES, 3DES, MD5, SHA-1, algorithme maison. | SAST + recherche des algorithmes interdits. | SEC-21 |
| PSEC-08 | DOIT | TLS 1.3 de préférence, 1.2 sinon, obligatoire sur l'authentification et toute page affichant ou transmettant des données personnelles ; cookies `HttpOnly` et `Secure` ; réponses neutres à la création de compte et à la réinitialisation. | Scan TLS ; tests des en-têtes. | SEC-09, SEC-10 |
| PSEC-09 | DOIT | Habilitations : identifiant unique par personne, pas de compte partagé, profils limités aux données nécessaires, retrait des droits au départ ou changement de poste, revue au moins annuelle. | Export des rôles pour la revue. | SEC-05, DEV-08 |
| PSEC-10 | DOIT | API : séparer les appels courants des appels d'administration (authentification renforcée), ne partager que les données nécessaires, journaliser les échanges, documenter les formats, retirer les anciennes versions non sûres, clés d'API en coffre, tester contre l'OWASP API Top 10, fournir un bac à sable avec données fictives. | Revue de l'API avant mise en production. | SEC-25 |
| PSEC-11 | DOIT | Mobile : permissions minimales avec alternative, communications en TLS, secrets dans le Keystore matériel (Android) ou la Secure Enclave (Apple), données exclues des sauvegardes automatiques de l'OS ou chiffrées sans y inclure la clé, sécurité qui ne repose pas sur l'intégrité du terminal, traitement local privilégié, blocage serveur des versions non sûres, OWASP MAS niveaux L1 et L2. | Checklist OWASP MAS. | SEC-23 |
| PSEC-12 | DOIT | Cloud : chiffrer au repos et en transit (le chiffrement géré par le fournisseur ne protège pas du fournisseur), aucun identifiant en dur, permissions de stockage vérifiées (pas de bucket public), sauvegardes hors du datacenter principal. | Scan de configuration cloud. | SEC-22 |
| PSEC-13 | DOIT | Transferts de fichiers : SFTP ou HTTPS, fichiers sensibles chiffrés, secret envoyé par un canal distinct, suppression automatique des fichiers déposés après une durée limitée. | Revue des flux d'export. | SEC-13 |
| PSEC-14 | DOIT | Sauvegardes : règle 3-2-1 (3 copies, 2 supports, 1 hors ligne), une copie sur un site distinct, chiffrées, restauration testée. Complète RES-01 à RES-03. | Rapport de test de restauration. | SEC-17 |

## 8. Sous-traitants, SDK, hébergement et transferts hors UE

Tout tiers qui reçoit ou collecte des données personnelles via l'application est identifié, encadré par contrat et déclaré aux personnes.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| TIERS-01 | DOIT | N'intégrer aucun SDK, bibliothèque ou service tiers qui collecte des données sans l'avoir audité : quelles données partent, vers qui, pour quoi. Ajouter le résultat à l'inventaire CAD-01. | Audit réseau de l'application (requêtes sortantes) à chaque ajout. | DEV-09 |
| TIERS-02 | DOIT | Pour chaque tiers qui traite des données : information des personnes, consentement si la collecte n'est pas strictement nécessaire, contrat de sous-traitance (article 28) signalé au DPO, transferts hors UE encadrés. | Registre des tiers à jour. | DEV-09, SEC-14 |
| TIERS-03 | DOIT | Lire la documentation des SDK et modifier leur configuration par défaut ; n'activer que les fonctionnalités utilisées. | Fichier de configuration du SDK versionné et commenté. | DEV-09 |
| TIERS-04 | DOIT | Vérifier les noms des paquets (typosquattage) et surveiller les changements de mainteneur ou de domaine des dépendances. | Revue des ajouts de dépendances. | DEV-09 |
| TIERS-05 | DOIT | Hébergement : localisation des données connue et documentée ; pas de service cloud sans garantie de localisation ni encadrement des transferts hors UE. | Région d'hébergement fixée dans l'IaC. | SEC-14, SEC-22 |
| TIERS-06 | DOIT | Données de santé : hébergeur certifié HDS obligatoire. Données particulièrement sensibles : envisager un hébergeur qualifié SecNumCloud. | Certification vérifiée avant choix. | SEC-14, SEC-22 |
| TIERS-07 | DOIT | Prévoir dans le code la restitution et la suppression des données chez le sous-traitant en fin de contrat (export complet, appel de suppression). | Procédure testée. | SEC-14 |

## 9. Environnement de développement et données de test

Le développement et les tests se font sur des données fictives ou anonymisées, dans des environnements séparés de la production.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| TEST-01 | DOIT | Utiliser des jeux de données fictifs (générateurs de données synthétiques) ou anonymisés en dev et en test ; jamais de copie de la base de production. | Seeds et fixtures revus. | SEC-11 |
| TEST-02 | DOIT | Si un test sur données réelles est indispensable, le faire en pré-production sécurisée au même niveau que la production, après tous les autres tests. | Validation tracée. | SEC-11 |
| TEST-03 | DOIT | Aucun secret dans le dépôt de code ; changer les secrets au passage en production. Voir SECRET-01 à SECRET-03 du Référentiel DEV. | Scan de secrets. | SEC-11 |
| TEST-04 | DOIT | Tests complets avant chaque mise à disposition : unitaires, intégration, fonctionnels, sécurité ; non-régression ou revue de code avant mise en production. | Pipeline CI. | SEC-11 |
| TEST-05 | DOIT | Inclure des tests RGPD : export d'accès complet, effacement effectif, purge, refus des cookies sans traceur déposé, consentement retirable. | Suite de tests dédiée. | DEV-13, COOK + Complément |
| TEST-06 | DEVRAIT | Signer le code exécutable distribué pour garantir son intégrité. | Signature vérifiée à l'installation. | SEC-11 |

## 10. Violations de données : détection et notification

Une violation (destruction, perte, altération, divulgation ou accès non autorisé) présentant un risque doit être notifiée à la CNIL sous 72 heures ; l'application doit fournir de quoi la détecter et l'évaluer vite.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| VIOL-01 | DOIT | Alertes automatiques sur les traces (PSEC-05) : accès massifs, exports inhabituels, échecs d'authentification en rafale, accès hors périmètre. | Règles d'alerte testées. | SEC-16, SEC-19 |
| VIOL-02 | DOIT | Pouvoir répondre rapidement à « quelles données de quelles personnes ont été touchées, depuis quand » : requêtes prêtes sur les journaux et l'inventaire. | Exercice de simulation. | SEC-19 + Complément |
| VIOL-03 | DOIT | Prévoir l'information des personnes en cas de risque élevé (gabarit d'e-mail, envoi en masse ciblé, conseils : changer de mot de passe, etc.). | Gabarit versionné. | DEV-12, SEC-19 |
| VIOL-04 | DOIT | Tenir un registre interne des violations (date, nature, données et personnes concernées, mesures prises), y compris celles non notifiées. | Table ou document du registre. | SEC-19 |
| VIOL-05 | DOIT | Fonction d'invalidation en masse des sessions et jetons et de réinitialisation forcée des mots de passe. | Test de la fonction. | Complément |

La notification elle-même (évaluation du risque, envoi à la CNIL, initiale sous 72 h puis complémentaire) relève du responsable de traitement et du DPO, pas de l'agent.

## 11. IA et données personnelles

Si l'application entraîne, ajuste ou interroge un modèle d'IA avec des données personnelles, ces règles s'ajoutent à la section 13 du Référentiel DEV.

| ID | Niveau | Action concrète | Vérification | Source |
| --- | --- | --- | --- | --- |
| IAP-01 | DOIT | N'entraîner ou n'ajuster un modèle que sur des données de source connue et fiable, dont la qualité et les annotations ont été vérifiées (contre l'empoisonnement et les biais). | Fiche de provenance des jeux de données. | SEC-24 |
| IAP-02 | DOIT | Éviter les copies de bases de données pour l'IA ; données fictives ou synthétiques pour les tests, l'intégration et certains audits. | Revue des pipelines de données. | SEC-24 |
| IAP-03 | DOIT | Avant de déployer ou partager un modèle, vérifier que ses sorties ne contiennent ni données personnelles ni contenus problématiques ; filtrer les sorties. | Tests de sortie avant release. | SEC-24 |
| IAP-04 | DOIT | Modèle exposé en service : vérifier la légitimité des utilisateurs et limiter le débit (contre l'inversion de modèle et le déni de service). | Authentification et quotas sur l'endpoint. | SEC-24 |
| IAP-05 | DOIT | Documenter données et modèles utilisés, performances, biais, limites d'usage ; surveiller la dérive des données en production. | Documentation versionnée ; métriques de dérive. | SEC-24 |
| IAP-06 | DEVRAIT | Accompagner les résultats d'éléments d'interprétation (score de confiance) pour permettre de repérer une erreur. | Revue UI. | SEC-24 |
| IAP-07 | DOIT | Minimiser les données envoyées au modèle (prompts, contexte) et ne pas transmettre de données personnelles à un modèle hébergé par un tiers sans base légale, information et encadrement du sous-traitant (TIERS-02). | Revue du code d'orchestration. | SEC-24, DEV-09 + Complément |

## 12. Checklist RGPD avant merge

L'agent déroule cette liste en complément de la checklist du Référentiel DEV et signale tout point non conforme ou toute valeur `TODO(RGPD)` dans la PR.

1. Toute nouvelle donnée personnelle est justifiée et inscrite dans l'inventaire avec finalité, base légale et durée (CAD-01, MIN-01).
2. Les formulaires limitent la précision, distinguent obligatoire et facultatif, et portent une mention d'information (MIN-02, MIN-04, INFO-01).
3. Les paramètres par défaut sont les plus protecteurs (MIN-06).
4. Aucun traceur ni script tiers non exempté n'est chargé avant consentement ; refuser est aussi simple qu'accepter (TRK-02, TRK-03).
5. Tout consentement est tracé et retirable (CONS-03, CONS-04).
6. Les nouvelles données sont couvertes par l'export d'accès, l'effacement et la purge automatique (DROIT-02, DROIT-05, RET-03).
7. Les traces applicatives sont produites, sans mot de passe ni donnée sensible (PSEC-05).
8. Aucune donnée personnelle dans les URL ; aucun algorithme cryptographique interdit (PSEC-04, PSEC-07).
9. Tout nouveau SDK ou service tiers est audité et inscrit au registre des tiers (TIERS-01, TIERS-02).
10. Les tests utilisent des données fictives et la suite de tests RGPD passe (TEST-01, TEST-05).

## 13. Sources

Ce référentiel ne remplace pas l'avis du DPO ni une analyse juridique. La fiche du guide développeur sur la mesure d'audience n'a pas pu être relue : les repères de la règle TRK-07 sont à confirmer sur le site de la CNIL.

| Code | Source | Version |
| --- | --- | --- |
| DEV-n | [Guide RGPD de l'équipe de développement](https://github.com/LINCnil/Guide-RGPD-du-developpeur), fiche n (fiches 07, 08, 09, 12, 13, 14, 15 lues en détail ; liste complète dans l'[annonce CNIL](https://cnil.fr/fr/la-cnil-publie-une-nouvelle-version-de-son-guide-rgpd-pour-lequipe-de-developpement)) | v2, déc. 2021, mis à jour sur GitHub |
| SEC-n | [Guide pratique RGPD – Sécurité des données personnelles](https://www.cnil.fr/sites/default/files/2026-05/cnil_guide_securite_personnelle.pdf), fiche n (25 fiches) | édition 2024, mise à jour 2026 |
| COOK | [Cookies et traceurs : comment mettre mon site web en conformité ?](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite) | page CNIL, oct. 2020 |
