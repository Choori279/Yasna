#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""Collect supply-chain risk signals for a project's direct dependencies.

Emits a JSON artifact; `render.py` turns it into a report. Direct dependencies only, by
design — the scope is what keeps an audit sizeable. Dependency source is never fetched or
read; every signal comes from a registry, an advisory database, or repository metadata.

Two rules the code is arranged to enforce rather than remember:

- **Unavailable data is not evidence of risk.** Every criterion resolves to
  assessed-clean, assessed-flagged, or unassessable-with-reason.
- **An absent measurement is not a clean verdict.** An empty answer from a vulnerability
  database means "no advisories" only for a package known to exist.

Usage:
    uv run collect.py <project-path> [--json out.json] [--cache DIR] [--offline]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import tomllib
from datetime import UTC, datetime
from pathlib import Path

import sources
from model import (
    CRITERIA,
    TIER_SCORECARD,
    Dependency,
    ReconciliationError,
    Signal,
    to_json,
)

# Two years without a push is "stale". A one-year threshold flagged jinja2 and
# itsdangerous at 14 months — maintained-but-finished libraries whose flags teach a
# reader to skim past the criterion — while the packages that motivated it (stream-throttle
# at 11 years, dev-null at 9, escape-html at 4) clear two years easily. Reported with the
# actual date so a reader who draws the line elsewhere can.
STALE_DAYS = 730

# An absolute floor, not a rank. The original skill defined low popularity relative to the
# target's other dependencies, which is uncomputable across ecosystems: npm gives weekly
# downloads, PyPI returns -1, Go has no concept at all.
LOW_DOWNLOADS_PER_WEEK = 1000

REPO_CRITERIA = ("archived", "staleness", "security_policy")

# Shared by every criterion of every dependency that resolves o
utside its public
# registry, so the report can group them into one bullet per criterion. The specific
# source is the signal's value, and each dependency also gets its own Method note.
NON_REGISTRY_REASON = (
    "the dependency resolves from outside its public registry, so registry-keyed data "
    "does not apply to it (the source is named in Method and caveats)"
)


# ------------------------------------------------------------------ npm manifests


def _npm_locked_versions(project: Path) -> dict[str, str]:
    """Resolved direct-dependency versions from an npm lockfile, if one exists."""
    for name in ("package-lock.json", "npm-shrinkwrap.json"):
        path = project / name
        if not path.exists():
            continue
        data = _read_json(path)
        out: dict[str, str] = {}
        for key, entry in (data.get("packages") or {}).items():
            if key.startswith("node_modules/") and entry.get("version"):
                out[key.removeprefix("node_modules/")] = entry["version"]
        for pkg, entry in (data.get("dependencies") or {}).items():
            if isinstance(entry, dict) and entry.get("version") and pkg not in out:
                out[pkg] = entry["version"]
        if out:
            return out
    return {}


# One lockfile-resolved package: (ecosystem, name, version, dev-only or None).
LockedPackage = tuple[str, str, str, bool | None]
# A lockfile entry whose registry existence cannot be attested, with the reason.
Unverifiable = dict


def _npm_all_locked(
    project: Path,
) -> tuple[list[LockedPackage], list[Unverifiable], str | None, str | None]:
    """Every package the npm lockfile resolves, split by registry attestation.

    Returns (attested packages, unverifiable entries, lockfile name or None, note or
    None). Attested means the entry carries an integrity hash for a registry tarball —
    the datum that lets an empty advisory answer read as clean. Git, file, and
    private-registry entries go in the unverifiabl
e list instead: OSV data is keyed by
    public-registry name, so querying it for a package that resolves elsewhere either
    proves nothing (absence) or attributes another package's advisories to it.

    Only v2+ lockfiles carry the flat `packages` table; a v1-only lockfile yields a
    note rather than a silent zero that would read as "no transitive packages".
    """
    for lockname in ("package-lock.json", "npm-shrinkwrap.json"):
        path = project / lockname
        if not path.exists():
            continue
        packages = _read_json(path).get("packages")
        if not isinstance(packages, dict):
            return (
                [],
                [],
                None,
                f"{lockname} predates npm 7's flat package table, so the transitive tree "
                f"was not read from it.",
            )
        out: list[LockedPackage] = []
        unverifiable: list[Unverifiable] = []
        for key, entry in packages.items():
            if "node_modules/" not in key or entry.get("link") or not entry.get("version"):
                continue
            name = entry.get("name") or key.rsplit("node_modules/", 1)[1]
            resolved = str(entry.get("resolved") or "")
            if entry.get("integrity") and resolved.startswith("https://registry.npmjs.org/"):
                out.append(("npm", name, entry["version"], bool(entry.get("dev"))))
            else:
                unverifiable.append(
                    {
                        "ecosystem": "npm",
                        "name": name,
                        "version": entry["version"],
                        "reason": (
                            f"resolves from {resolved or 'an undeclared source'}, not the "
                            f"npm registry, so registry-keyed advisory data does not "
                            f"apply to it"
                        )
                        if not resolved.startswith("https://registry.npmjs.org/")
                  
      else "lockfile entry carries no integrity hash",
                    }
                )
        return out, unverifiable, lockname, None
    return [], [], None, None


_EXACT_SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-+]+)?$")
_ALIAS = re.compile(r"^npm:(?P<name>@?[^@]+(?:/[^@]+)?)@")
# Specs that are not a registry version range. The dependency key is then a local or
# remote artifact rather than a package name that can be looked up.
_NON_REGISTRY = ("file:", "link:", "workspace:", "portal:", "git+", "git:", "http://", "https://")


def _npm_spec_kind(spec: str) -> str:
    """Classify an npm dependency spec: `registry`, `alias`, or a non-registry source."""
    spec = (spec or "").strip()
    if spec.startswith("npm:"):
        return "alias"
    for prefix in _NON_REGISTRY:
        if spec.startswith(prefix):
            return "non-registry"
    # `owner/repo` with no version operator is GitHub shorthand, not a registry range.
    if "/" in spec and not any(ch in spec for ch in "^~<>= .*") and spec.count("/") == 1:
        return "non-registry"
    return "registry"


def _exact_npm_pin(spec: str) -> str | None:
    """Return an exact version only for a genuine pin.

    `1.x`, `1.2.x` and `2` are ranges. Accepting them as pins fed the range string to OSV
    as if it were a version and suppressed resolution of the real release.
    """
    spec = (spec or "").strip()
    return spec if _EXACT_SEMVER.match(spec) else None


def parse_npm(project: Path) -> tuple[list[Dependency], list[str]]:
    """Direct npm dependencies from package.json, with the resolved version where known.

    Returns:
        The dependencies, and notes for anything that could not be treated as a registry
        package. `optionalDependencies` are installed by default and so are included;
        `peerDependencies` are the consumer's responsibility and are noted, not audited.
    """
    manifest = project / "package.json"
    if not manifest.exists():
        return
 [], []
    data = _read_json(manifest)
    locked = _npm_locked_versions(project)
    deps: list[Dependency] = []
    notes: list[str] = []
    fields = (("dependencies", False), ("devDependencies", True), ("optionalDependencies", False))
    for field_name, is_dev in fields:
        table = data.get(field_name) or {}
        if not isinstance(table, dict):
            raise SystemExit(f"error: {manifest}: '{field_name}' is not a table of name -> spec")
        for name, spec in table.items():
            dep, note = _npm_dependency(name, str(spec), is_dev, locked)
            if dep:
                deps.append(dep)
            if note:
                notes.append(note)
    peers = data.get("peerDependencies") or {}
    if peers:
        count = "1 peerDependency was" if len(peers) == 1 else f"{len(peers)} peerDependencies were"
        notes.append(
            f"{count} not audited: they are supplied by the consuming project rather than "
            f"installed by this one."
        )
    return deps, notes


def _npm_dependency(
    name: str, spec: str, is_dev: bool, locked: dict[str, str]
) -> tuple[Dependency | None, str | None]:
    kind = _npm_spec_kind(spec)
    declared = name
    if kind == "alias":
        match = _ALIAS.match(spec)
        target = match.group("name") if match else None
        if not target:
            return None, f"`{name}` uses an npm alias this parser could not read ({spec})."
        note = f"`{name}` is an alias for `{target}`; the audit follows the target."
        name = target
        kind = "registry"
    else:
        note = None
    if kind == "non-registry":
        reason = f"resolves from {spec}, not the npm registry"
        return (
            Dependency(ecosystem="npm", name=name, dev=is_dev, non_registry_reason=reason),
            f"`{name}` {reason}, so no registry or advisory data applies to it.",
        )
    # The lockfile keys the declared name (node_modules/<declared>), so an alias must
    # be looked 
up under it, not under the rewritten target.
    version, source = locked.get(declared), "lockfile"
    if not version:
        version, source = _exact_npm_pin(spec), "manifest-pin"
    if not version:
        source = "unresolved"
    return Dependency(
        ecosystem="npm", name=name, version=version, version_source=source, dev=is_dev
    ), note


# ----------------------------------------------------------------- PyPI manifests

_REQ_SPLIT = re.compile(r"[<>=!~\[;@]")
# A permissive PEP 440 shape: enough to reject line-continuation and inline-option
# debris ("2.19.0 \\", "2.19.0 --hash") that would otherwise be sent to OSV as a
# version and printed in the report as a version-matched claim.
#
# The optional `v` is load-bearing: PEP 440 permits it, pip accepts `django==v3.2.0`,
# and requiring a leading digit turned that legal pin into an unresolved version, so
# advisories were matched against the latest release and 62 real ones read as clean. The
# prefix is stripped rather than kept, because the canonical form is what OSV, the
# report, and any hand-check should agree on.
_VALID_VERSION = re.compile(r"^v?[0-9][0-9A-Za-z.+!_-]*$")
_PEP503 = re.compile(r"[-_.]+")
_VALID_NAME = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$")


def normalize_pypi_name(name: str) -> str:
    """PEP 503 normalisation: lowercase, runs of -_. collapsed to one hyphen."""
    return _PEP503.sub("-", name).lower()


def _strip_marker(line: str) -> str:
    """Drop a PEP 508 environment marker.

    Markers contain `==`, so leaving one in place made `psutil; sys_platform == 'win32'`
    resolve to the version `'win32'` — fabricated, then sent to OSV and reported as fact.
    """
    return line.split(";", 1)[0].strip()


# `name [extras] @ url` — PEP 508's direct-reference form. `@` is also a name
# terminator in _REQ_SPLIT, so without this check the URL is silently discarded and a
# git or file fork is looked up on PyPI under the public package's name.
_DIRECT_REF = re.c
ompile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\s*(?:\[[^\]]*\]\s*)?@\s*(\S+)")


def _direct_reference_url(line: str) -> str | None:
    """The URL of a PEP 508 direct reference, if this requirement uses one."""
    spec = _strip_marker(line.split("#", 1)[0].strip())
    match = _DIRECT_REF.match(spec)
    return match.group(1) if match else None


def _requirement_name(line: str) -> str | None:
    """Extract a distribution name, or None when the line declares no requirement."""
    line = line.split("#", 1)[0].strip()
    if not line or line.startswith("-"):
        return None
    candidate = _REQ_SPLIT.split(_strip_marker(line), 1)[0].strip()
    return candidate or None


# Extra and requirements-file names that conventionally hold development dependencies.
# `coverage` and `pytest` arriving from a `test` extra are not production dependencies, and
# saying they ship in the built artifact is a claim the manifest does not support.
# Matched as whole tokens, not substrings: substring matching classified the runtime
# extras `docker` ("doc") and `tracing` ("ci") as build-time only, which understates
# blast radius — the unsafe direction for this report.
_DEV_GROUP_TOKENS = frozenset(
    "test tests testing dev development doc docs lint linting type types typing "
    "typecheck check checks bench benchmark benchmarks ci".split()
)
_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


def _is_dev_group(name: str) -> bool:
    return any(token in _DEV_GROUP_TOKENS for token in _TOKEN_SPLIT.split(name.lower()))


def _pypi_specs(project: Path) -> tuple[dict[str, tuple[str, bool]], list[str]]:
    """Gather name -> (raw spec, is_dev) for every direct Python requirement."""
    specs: dict[str, tuple[str, bool]] = {}
    notes: list[str] = []
    pyproject = project / "pyproject.toml"
    if pyproject.exists():
        data = _read_toml(pyproject)
        groups = [((data.get("project") or {}).get("dependencies") or [], False)]
        for extra, items in (
            (data.get("project")
 or {}).get("optional-dependencies") or {}
        ).items():
            groups.append((items, _is_dev_group(extra)))
        for group in (data.get("dependency-groups") or {}).values():
            # PEP 735 groups exist for development dependencies by definition.
            groups.append(([g for g in group if isinstance(g, str)], True))
        poetry = ((data.get("tool") or {}).get("poetry") or {}).get("dependencies") or {}
        if poetry:
            notes.append(
                f"{len(poetry)} Poetry dependencies in the tool.poetry.dependencies "
                f"table were not parsed; only PEP 621 and PEP 735 tables are read."
            )
        for group, is_dev in groups:
            _absorb_specs(group, specs, notes, is_dev)
    for candidate in sorted(project.glob("requirements*.txt")):
        lines = _read_text(candidate).splitlines()
        includes = [ln for ln in lines if ln.strip().startswith(("-r", "--requirement"))]
        if includes:
            notes.append(
                f"{candidate.name} includes {len(includes)} other requirements file(s) that "
                f"were not followed, so its dependency list may be incomplete."
            )
        _absorb_specs(lines, specs, notes, _is_dev_group(candidate.stem))
    return specs, notes


def _absorb_specs(
    raw_lines: list[str], specs: dict[str, tuple[str, bool]], notes: list[str], is_dev: bool
) -> None:
    for raw in raw_lines:
        if not isinstance(raw, str):
            continue
        name = _requirement_name(raw)
        if not name:
            continue
        if not _VALID_NAME.match(name):
            notes.append(f"skipped an unparseable requirement: {raw.strip()!r}")
            continue
        canonical = normalize_pypi_name(name)
        existing = specs.get(canonical)
        if existing is None or (existing[1] and not is_dev):
            specs[canonical] = (raw, is_dev)


# What terminates the value of a `==` pin. Deliberately not `_REQ_SPLIT`, which als
o
# splits on `!` for the `!=` operator and would truncate a PEP 440 epoch — `1!2.0`
# became the version `1`, a wrong pin reported as version-matched.
_VERSION_END = re.compile(r"[\s,;]")


def _pypi_version(raw: str, locked: dict[str, str], canonical: str) -> tuple[str | None, str]:
    if canonical in locked:
        return locked[canonical], "lockfile"
    spec = _strip_marker(raw)
    if "==" in spec:
        candidate = _VERSION_END.split(spec.split("==", 1)[1].strip().strip(","), 1)[0].strip()
        # `1.0.*` is a range, not a pin, and pip-compile hash lines leave debris
        # (`2.19.0 \\`) that must not be reported as a version.
        if candidate and "*" not in candidate and _VALID_VERSION.match(candidate):
            return candidate.removeprefix("v"), "manifest-pin"
    return None, "unresolved"


def _uv_lock_versions(project: Path) -> dict[str, str]:
    lock = project / "uv.lock"
    if not lock.exists():
        return {}
    data = _read_toml(lock)
    return {
        normalize_pypi_name(pkg["name"]): pkg["version"]
        for pkg in data.get("package") or []
        if pkg.get("name") and pkg.get("version")
    }


def _uv_non_registry_sources(project: Path) -> dict[str, str]:
    """Canonical name -> source kind for uv.lock entries that do not resolve from PyPI.

    A direct dependency in this map must not be looked up on PyPI by name: the lock
    says the project installs it from git, a directory, or a local path, so a
    same-named public package's advisories and metadata do not apply to it.
    """
    lock = project / "uv.lock"
    if not lock.exists():
        return {}
    out: dict[str, str] = {}
    for pkg in _read_toml(lock).get("package") or []:
        source = pkg.get("source") or {}
        if not pkg.get("name") or source.get("registry"):
            continue
        if source.get("editable") or source.get("virtual"):
            continue
        out[normalize_pypi_name(pkg["name"])] = next(iter(source), "unknown")
    
return out


def _uv_all_locked(
    project: Path,
) -> tuple[list[LockedPackage], list[Unverifiable], str | None, str | None]:
    """Every package uv.lock resolves, split by registry attestation.

    The lock includes the audited project itself as an editable or virtual source; that
    entry is the subject, not a dependency. Git, directory, and path sources are
    unverifiable against PyPI — a vendored fork at `../vendor/flask` must not inherit
    PyPI flask's advisories, since vendoring a patched fork is a common way to fix
    exactly those. uv.lock does not mark which packages are development-only per entry,
    so the dev marker is None throughout.
    """
    lock = project / "uv.lock"
    if not lock.exists():
        return [], [], None, None
    out: list[LockedPackage] = []
    unverifiable: list[Unverifiable] = []
    for pkg in _read_toml(lock).get("package") or []:
        source = pkg.get("source") or {}
        if not pkg.get("name") or not pkg.get("version"):
            continue
        if source.get("editable") or source.get("virtual"):
            continue
        name = normalize_pypi_name(pkg["name"])
        if source.get("registry"):
            out.append(("PyPI", name, pkg["version"], None))
        else:
            kind = next(iter(source), "unknown")
            unverifiable.append(
                {
                    "ecosystem": "PyPI",
                    "name": name,
                    "version": pkg["version"],
                    "reason": (
                        f"resolves from a {kind} source, not PyPI, so PyPI-keyed "
                        f"advisory data does not apply to it"
                    ),
                }
            )
    return out, unverifiable, "uv.lock", None


def parse_pypi(project: Path) -> tuple[list[Dependency], list[str]]:
    """Direct Python dependencies from pyproject.toml and/or requirements files."""
    specs, notes = _pypi_specs(project)
    if not specs:
        return [], notes
    lo
cked = _uv_lock_versions(project)
    non_registry = _uv_non_registry_sources(project)
    deps = []
    for canonical, (raw, is_dev) in specs.items():
        version, source = _pypi_version(raw, locked, canonical)
        reason = None
        url = _direct_reference_url(raw)
        if url:
            reason = f"resolves from {url}, not PyPI"
        elif canonical in non_registry:
            reason = f"resolves from a {non_registry[canonical]} source, not PyPI"
        if reason:
            notes.append(f"`{canonical}` {reason}, so no registry or advisory data applies to it.")
        deps.append(
            Dependency(
                ecosystem="PyPI",
                name=canonical,
                version=version,
                version_source=source,
                dev=is_dev,
                non_registry_reason=reason,
            )
        )
    return deps, notes


# ------------------------------------------------------------------- Go manifests

_GOMOD_REQUIRE = re.compile(r"^\s*(?:require\s+)?([\w.\-]+(?:\.[\w.\-]+)*/[^\s]+)\s+(v[^\s]+)")
_GOMOD_BLOCK_OPEN = re.compile(r"^(require|replace|exclude|retract)\s*\($")
_GOMOD_OTHER = ("replace ", "exclude ", "retract ")


def _gomod_line_kind(line: str, block: str | None) -> tuple[str | None, str]:
    """Classify one go.mod line, tracking which block it sits in.

    Returns:
        The block in effect after this line, and one of `require`, `indirect`,
        `directive`, or `ignore`. Block context is what separates a requirement from a
        `replace` entry, since both read as `module version`.
    """
    stripped = line.strip()
    opener = _GOMOD_BLOCK_OPEN.match(stripped)
    if opener:
        return opener.group(1), "ignore"
    if stripped == ")":
        return None, "ignore"
    if block in {"replace", "exclude", "retract"} or stripped.startswith(_GOMOD_OTHER):
        return block, "directive"
    if block not in {"require", None}:
        return block, "ignore"
    if not _GOMOD_REQUIR
E.match(line):
        return block, "ignore"
    if block is None and not stripped.startswith("require "):
        return block, "ignore"
    if "// indirect" in line:
        return block, "indirect"
    return block, "require"


def _go_dependency(line: str) -> Dependency:
    module, version = _GOMOD_REQUIRE.match(line).groups()
    return Dependency(
        ecosystem="Go",
        name=module,
        # OSV wants Go versions without the `v` prefix.
        version=version.removeprefix("v"),
        # go.mod records a *minimum*; module-version selection can pick higher.
        version_source="go-mod-minimum",
        # go.mod has no dev section; asserting either way would invent a distinction.
        dev=None,
    )


def parse_go(project: Path) -> tuple[list[Dependency], list[str]]:
    """Direct Go modules from go.mod.

    Block context matters: every block-form directive line looks like `module version`, so
    a parser without it reads `replace (...)` entries as requirements. That reports the
    module the project replaced *away from*, at the abandoned version, while never
    assessing the replacement actually built — and reports `exclude` entries as used.
    """
    gomod = project / "go.mod"
    if not gomod.exists():
        return [], []
    deps: list[Dependency] = []
    notes: list[str] = []
    block: str | None = None
    replaced = 0
    for line in _read_text(gomod).splitlines():
        block, kind = _gomod_line_kind(line, block)
        if kind == "directive":
            replaced += 1
        elif kind == "require":
            deps.append(_go_dependency(line))
    if replaced:
        notes.append(
            f"{replaced} replace/exclude/retract directives in go.mod were not treated as "
            f"dependencies; where a module is replaced, the replacement was not audited."
        )
    return deps, notes


_GO_DIRECTIVE = re.compile(r"^go\s+(\d+)\.(\d+)", re.MULTILINE)


def _go_indirect(
    project: Path,
) -> tuple[list[LockedPa
ckage], list[Unverifiable], str | None, str | None]:
    """Indirect modules from go.mod, which is complete only for go 1.17 and later.

    Modules declaring an older go directive list an arbitrary subset of their indirect
    requirements, so reading them would report "the transitive tree was checked" about a
    tree that was mostly absent. go.mod carries no dev marker; None throughout.

    go.mod attests nothing about existence — the split into attested and unverifiable
    happens in `sweep_transitive`, which asks the Go module proxy about each entry.
    """
    gomod = project / "go.mod"
    if not gomod.exists():
        return [], [], None, None
    text = _read_text(gomod)
    match = _GO_DIRECTIVE.search(text)
    if not match or (int(match.group(1)), int(match.group(2))) < (1, 17):
        return (
            [],
            [],
            None,
            "go.mod declares a go directive older than 1.17 (or none), so its indirect "
            "module list is incomplete and the transitive tree was not read from it.",
        )
    out: list[LockedPackage] = []
    block: str | None = None
    for line in text.splitlines():
        block, kind = _gomod_line_kind(line, block)
        if kind == "indirect":
            module, version = _GOMOD_REQUIRE.match(line).groups()
            out.append(("Go", module, version.removeprefix("v"), None))
    return out, [], "go.mod", None


PARSERS = (parse_npm, parse_pypi, parse_go)


def _read_text(path: Path) -> str:
    """Read a plain-text manifest as UTF-8, refusing anything that will not decode.

    The JSON and TOML readers below already turn an undecodable file into a refusal.
    Without this, `requirements*.txt` and `go.mod` did not: `main()` catches only
    `ReconciliationError`, so a `UnicodeDecodeError` escaped as a traceback. That is not
    hypothetical on the platform this exists to support — PowerShell 5.1 redirection
    writes UTF-16LE with a BOM, so any requirements file generated with `>` on
 a stock
    Windows box begins with two bytes that are invalid UTF-8.

    Args:
        path: The file to read.

    Returns:
        The decoded text.

    Raises:
        SystemExit: The file is not UTF-8, or could not be read.
    """
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit(
            f"error: {path} is not UTF-8, so its contents cannot be read: {exc}. "
            f"A file produced by PowerShell redirection is UTF-16 — re-save it as "
            f"UTF-8, or regenerate it through `Out-File -Encoding utf8`."
        ) from exc
    except OSError as exc:
        raise SystemExit(f"error: cannot read {path}: {exc}") from exc


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"), strict=False)
        if not isinstance(data, dict):
            raise SystemExit(
                f"error: {path} holds a JSON {type(data).__name__}, not the object this "
                f"manifest format requires"
            )
        return data
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON: {exc}") from exc
    # UnicodeDecodeError is a ValueError, not a JSONDecodeError, so the two clauses
    # around this one do not catch it and it used to escape as a traceback. JSON is
    # UTF-8 by RFC 8259, so a manifest that is not decodable is malformed input and
    # earns the same refusal as invalid syntax.
    except UnicodeDecodeError as exc:
        raise SystemExit(f"error: {path} is not UTF-8, which JSON requires: {exc}") from exc
    except OSError as exc:
        raise SystemExit(f"error: cannot read {path}: {exc}") from exc


def _read_toml(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid TOML: {exc}") from exc
    except UnicodeDecodeError as exc:
        r
aise SystemExit(f"error: {path} is not UTF-8, which TOML requires: {exc}") from exc
    except OSError as exc:
        raise SystemExit(f"error: cannot read {path}: {exc}") from exc


def discover(project: Path) -> tuple[list[Dependency], list[str]]:
    """Parse every manifest, dropping the weaker of any duplicate."""
    found: list[Dependency] = []
    notes: list[str] = []
    for parser in PARSERS:
        deps, parser_notes = parser(project)
        found.extend(deps)
        notes.extend(parser_notes)
    seen: dict[str, Dependency] = {}
    for dep in found:
        existing = seen.get(dep.key)
        if existing is None or (existing.dev is True and dep.dev is not True):
            seen[dep.key] = dep
    return list(seen.values()), notes


# ---------------------------------------------------------------------- signalling


def _reason(exc: Exception, source: str) -> str:
    """A human-facing reason. The raw URL stays in the artifact, not in the report."""
    text = str(exc)
    if isinstance(exc, sources.NotFound):
        return f"not published in {source}"
    if "rate limited" in text:
        return f"{source} rate-limited this audit"
    if "offline" in text:
        return f"{source} was not in the local cache and this run was offline"
    return f"{source} did not answer"


def _advisory_signal(dep: Dependency, found: dict[str, list[str]]) -> Signal:
    """Advisories, refusing to read an empty answer as safety for an unknown package."""
    if dep.key not in found:
        return Signal.unassessable("OSV did not answer for this package")
    ids = found[dep.key]
    if not ids:
        if dep.exists is not True:
            return Signal.unassessable(
                "OSV recorded no advisories, but this package was not confirmed to exist "
                "in its registry, and an empty answer cannot distinguish 'no advisories' "
                "from 'unknown package'"
            )
        return Signal.clean("no advisories recorded", [])
   
 count = f"{len(ids)} advisory" if len(ids) == 1 else f"{len(ids)} advisories"
    verb = "affects" if len(ids) == 1 else "affect"
    described = {
        "lockfile": f"{count} {verb} the installed {dep.version}",
        "manifest-pin": f"{count} {verb} the pinned {dep.version}",
        "go-mod-minimum": (
            f"{count} {verb} {dep.version}, go.mod's minimum — module-version selection "
            f"may build a higher version"
        ),
        "latest-release": (
            f"{count} {verb} {dep.version}, the current latest release; the manifest gives "
            f"a range, so the version this project installs was not resolved"
        ),
    }
    return Signal.flagged(
        described.get(
            dep.version_source,
            f"{count} recorded for the package; no version resolved, so this is historical "
            f"rather than a statement about what is installed",
        ),
        ids,
    )


def human_days(days: int) -> str:
    """A duration at the precision a reader can use.

    "no push in 3,884 days" is four significant figures on a decade, and reads as scanner
    output rather than as a judgement. The exact date travels alongside for anyone who
    wants it.
    """
    if days < 60:
        return f"{days} days"
    if days < 730:
        return f"{round(days / 30.4)} months"
    return f"{days / 365.25:.0f} years"


def _staleness_signal(pushed: str | None) -> Signal:
    if not pushed:
        return Signal.unassessable("repository reports no last-push date")
    try:
        when = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
    except ValueError:
        return Signal.unassessable(f"could not read the last-push date ({pushed!r})")
    if when.tzinfo is None:
        return Signal.unassessable(f"last-push date has no timezone ({pushed!r})")
    days = (datetime.now(UTC) - when).days
    if days < 0:
        return Signal.clean("pushed today (repository clock is ahead)", pushed)
    if days > STALE_DAYS:
     
   return Signal.flagged(f"no push in {human_days(days)} (last {pushed[:10]})", pushed)
    return Signal.clean(f"pushed {human_days(days)} ago", pushed)


def _concentration_signal(meta: dict) -> Signal:
    """Who can actually ship code into this package.

    Branches on provenance because CI publishing moves the trust boundary off the registry
    ACL and onto repository merge rights, which GitHub does not expose to third parties
    (`/collaborators` returns 403). "1 maintainer, low risk" for a CI-published package
    would be confidently wrong.
    """
    if meta["provenance"]:
        return Signal.unassessable(
            "publishes from CI with provenance, so the effective publisher set is whoever "
            "can merge to the r

... [Content truncated]