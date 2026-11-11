# Skills Yasna

Récupérés depuis GitHub le 11/11/2026 (dernière version de la branche par défaut).

## Installation

Copier le dossier `.claude/` à la racine du projet Yasna. Claude Code détecte automatiquement les skills dans `.claude/skills/`.

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

Chez Trail of Bits, `insecure-defaults` n'est plus un skill mais un **plugin** (commande `/audit` + workflow). Il ne fonctionne pas posé dans `.claude/skills/`. Le dossier `plugins/insecure-defaults/` est fourni pour référence ; pour l'utiliser, l'installer via Claude Code :

```
/plugin marketplace add trailofbits/skills
/plugin install insecure-defaults
```

## Ajustements

- Les deux skills addyosmani pointaient vers des checklists partagées à la racine du repo (`../../references/`). Elles ont été copiées dans le dossier `references/` de chaque skill et les chemins corrigés.
- Certains skills obra/superpowers mentionnent d'autres skills du même pack (ex. test-driven-development) qui ne sont pas inclus ici.

## Licences

Voir `licenses/`.
