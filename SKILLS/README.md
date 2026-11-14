# Skills Yasna

Récupérés depuis GitHub le 11/11/2026 (dernière version de la branche par défaut).

## Emplacement

Les skills sont installés directement dans `.claude/skills/` à la racine du dépôt. Claude Code détecte automatiquement les skills dans `.claude/skills/` : **aucune étape de copie n'est nécessaire**.

`plugins/` (insecure-defaults) et `licenses/` ne sont pas des skills : ils sont rangés dans `.claude/vendor/` (respectivement `.claude/vendor/plugins/` et `.claude/vendor/licenses/`).

## Contenu

| Catégorie | Skill | Source |
|---|---|---|
| Sécurité | security-audit | cloudflare/security-audit-skill |
| Sécurité | security-and-hardening | addyosmani/agent-skills |
| Sécurité | differential-review | trailofbits/skills |
| Sécurité | supply-chain-risk-auditor | trailofbits/skills |
| Debug | systematic-debugging | obra/superpowers |
| Debug | debugging-and-error-recovery | addyosmani/agent-skills |
| Debug | diagnosing-bugs | mattpocock/skills |
| Architecture | improve-codebase-architecture | mattpocock/skills |
| Architecture | architecture-patterns (Clean, hexagonal, DDD) | wshobson/agents |
| Review | code-review-and-quality | addyosmani/agent-skills |
| Review | code-review | mattpocock/skills |
| Review | requesting-code-review | obra/superpowers |
| Review | receiving-code-review | obra/superpowers |

## Cas particulier : insecure-defaults

Chez Trail of Bits, `insecure-defaults` n'est plus un skill mais un **plugin** (commande `/audit` + workflow). Il ne fonctionne pas posé dans `.claude/skills/`. Le dossier est conservé pour référence dans `.claude/vendor/plugins/insecure-defaults/` ; pour l'utiliser, l'installer via Claude Code :

```
/plugin marketplace add trailofbits/skills
/plugin install insecure-defaults
```

## Ajustements

- Les deux skills addyosmani pointaient vers des checklists partagées à la racine du repo (`../../references/`). Elles ont été copiées dans le dossier `references/` de chaque skill et les chemins corrigés. Les dossiers de skill étant déplacés en bloc, les chemins relatifs internes restent valides.
- Certains skills obra/superpowers mentionnent d'autres skills du même pack (ex. test-driven-development) qui ne sont pas inclus ici.

## Licences

Voir `.claude/vendor/licenses/`.
