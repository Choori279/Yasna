#!/usr/bin/env node
// Exercises workflows/audit.js without spawning a single agent.
//
// The workflow runtime hands a script a set of globals (agent, parallel,
// pipeline, phase, log, args, budget) and wraps the body in an async function --
// which is why the script can use a top-level `return`. We reproduce that here:
// strip the `export`, wrap, and inject stubs. That makes every branch that
// matters testable offline: argument parsing, cross-category dedup, per-file
// grouping, corpus isolation, and each of the abort statuses.
//
// Usage:
//   node harness.js <path-to-audit.js>                run the scenarios
//   node harness.js <path-to-audit.js> --self-test    prove the scenarios bite
//
// --self-test mutates the workflow in memory and asserts the scenarios FAIL for
// each mutation. Without it these tests could silently stop checking anything
// and still report success -- the failure mode this repo cares most about.

"use strict";

const fs = require("fs");

const workflowPath = process.argv[2];
const selfTest = process.argv.includes("--self-test");

if (!workflowPath) {
  console.error("usage: node harness.js <path-to-audit.js> [--self-test]");
  process.exit(2);
}

const path = require("path");

const SOURCE = fs.readFileSync(workflowPath, "utf8");

// --------------------------------------------------------------------------
// Runtime stubs
// --------------------------------------------------------------------------

function compile(src) {
  const body = src.replace(/^export const meta/m, "const meta");
  return new Function(
    "agent",
    "parallel",
    "pipeline",
    "phase",
    "log",
    "args",
    "budget",
    `return (async () => {\n${body}\n})()`,
  );
}

// parallel() never rejects: a failing thunk resolves to null, matching the
// documented contract that callers .filter(Boolean).
const parallel = async (thunks) =>
  Promise.all(
    thunks.map((t) =>
      Promise.resolve()
        .then(t)
        .catch(() => null),
    ),

  );

function runWorkflow(src, { args, recon, sweeps, verdicts, report = "# Report" }) {
  const logs = [];
  const prompts = {};

  const agent = async (prompt, opts = {}) => {
    const label = opts.label || "?";
    prompts[label] = prompt;
    if (label === "recon") return recon;
    if (label.startsWith("sweep:")) {
      const id = label.slice("sweep:".length);
      // `in`, not `??`: a fixture of null is a sweep that returned nothing and an Error
      // is one that died, both distinct from a category the fixture left unmentioned.
      if (!(id in sweeps))
        return { corpus_read: true, patterns_loaded: true, files_scanned: 0, seed_patterns_run: [], derived_patterns: ["d"], candidates: [] };
      if (sweeps[id] instanceof Error) throw sweeps[id];
      return sweeps[id];
    }
    if (label.startsWith("verify:")) return verdicts(label.slice("verify:".length));
    if (label === "report") return report;
    throw new Error(`unexpected agent label: ${label}`);
  };

  const run = (source, childArgs) =>
    compile(source)(
      agent,
      parallel,
      parallel,
      () => {},
      (m) => logs.push(m),
      childArgs,
      { total: null, spent: () => 0, remaining: () => Infinity },
    );


  return run(src, args).then((result) => ({ result, logs, prompts }));
}

// The source as the running scenario should see it: mutated when self-testing, so a
// source-inspecting assertion is not blind to --self-test.
function currentSource(src) {
  return currentMutation ? currentMutation(src) : src;
}

// Set while a mutated run is in flight, so an assertion that reads the source sees
// the mutation rather than the file on disk.
let currentMutation = null;

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

// Fixtures derive category ids from CATEGORIES and seeds from references/<id>.json
// rather than hardcoding either, so editing a 
category cannot quietly make them
// vacuous. The driver below fails if this parses nothing.
// Seeds live in references/<id>.json now. Read them from there so the "derived
// nothing" scenario stays honest when they are edited.
function seedsFor(id) {
  const f = path.join(path.dirname(path.dirname(path.resolve(workflowPath))), "references", `${id}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8")).seeds || null;
}

const CATEGORY_IDS = [
  ...SOURCE.matchAll(/^ {2}\{ id: "([a-z-]+)", title: "[^"]+" \},$/gm),
].map((m) => m[1]);

const PLUGIN_ROOT = "/p/insecure-defaults";

// What /insecure-defaults:audit passes in.
const ENTRY = () => ({ scope: "src/", pluginRoot: PLUGIN_ROOT });

// What the recon AGENT returns: target profile only. It no longer locates anything.
const RECON_OK = {
  scope_exists: true,
  languages: ["python"],
  frameworks: [{ name: "django", settings_paths: ["src/settings.py"] }],
  config_locations: ["src/config.py"],
  config_accessors: [
    { idiom: "get_setting('X','d')", where: "src/conf.py:12", supplies_default: true },
  ],
  deploy_manifests: ["Dockerfile"],
  exclude_paths: ["tests/"],
};

// Two categories flag the SAME line, so dedup must collapse them into one
// candidate carrying both category tags.
const SWEEPS_OVERLAP = {
  "fallback-secrets": {
    corpus_read: true,
    files_scanned: 40,
    patterns_loaded: true,
    seed_patterns_run: ["seed-a"],
    derived_patterns: ["derived-django-secret"],
    candidates: [
      {
        file: "src/a.py",
        line: 10,
        snippet: "S = env.get('K','d')",
        why_suspicious: "default feeds jwt.encode",
      },
      {
        file: "src/b.py",
        line: 3,
        snippet: "T = env.get('T','t')",
        why_suspicious: "unclear sink",
      },
    ],
  },
  "default-credentials": {
    corpus_read: true,
    files_scanned: 40,
    patterns_loaded: true,
    seed_patterns_run: ["seed-b"],
    derived_patterns: ["derived-co
nn-string"],
    candidates: [
      {
        file: "src/a.py",
        line: 10,
        snippet: "S = env.get('K','d')",
        why_suspicious: "also reads as a credential literal",
      },
    ],
  },
};

// Refutes every SWEEPS_OVERLAP candidate, whichever category's batch is asking. For
// scenarios that need the run to reach the report: a verify phase that adjudicates
// nothing aborts, so `() => ({ verdicts: [] })` no longer gets there.
const ALL_REFUTED = () => ({
  verdicts: [
    { file: "src/a.py", line: 10, refuted: true, refuted_at_step: 4, rationale: "no sink" },
    { file: "src/b.py", line: 3, refuted: true, refuted_at_step: 4, rationale: "no sink" },
  ],
});

const allSweptClean = () =>
  Object.fromEntries(
    CATEGORY_IDS.map((id) => [
      id,
      { corpus_read: true, patterns_loaded: true, files_scanned: 12, seed_patterns_run: ["s"], derived_patterns: [`derived-${id}`], candidates: [] },
    ]),
  );

// --------------------------------------------------------------------------
// Scenarios. Each returns a list of [label, boolean, detail] assertions.
// --------------------------------------------------------------------------

const SCENARIOS = [
  {
    name: "happy path: dedup, grouping, corpus isolation",
    async run(src) {
      const { result, prompts } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: SWEEPS_OVERLAP,
        verdicts: (cat) =>
          cat === "fallback-secrets"
            ? {
                verdicts: [
                  { file: "src/a.py", line: 10, refuted: false, severity: "CRITICAL", rationale: "signs tokens" },
                  { file: "src/b.py", line: 3, refuted: true, refuted_at_step: 2, rationale: "fail-secure" },
                ],
              }
            : {
                verdicts: [
                  { file: "src/a.py", line: 10, refuted: true, refuted_at_step: 3, rationale: "not a credential" },
                ],
              },
      });
      co
nst verifyPrompt = prompts["verify:fallback-secrets"] || "";
      const sweepPrompt = prompts["sweep:weak-crypto"] || "";
      return [
        ["status is findings", result.status === "findings", result.status],
        ["scope recorded", result.coverage.scope === "src/", result.coverage.scope],
        ["3 raw candidates", result.coverage.raw_candidates === 3, result.coverage.raw_candidates],
        [
          "cross-category dup kept as 2 candidates",
          result.coverage.unique_candidates === 3,
          result.coverage.unique_candidates,
        ],
        [
          "one batch per category",
          result.coverage.batches_run === 2 && result.coverage.batches_verified === 2,
          `${result.coverage.batches_run}/${result.coverage.batches_verified}`,
        ],
        ["distinct files counted", result.coverage.files_with_candidates === 2, result.coverage.files_with_candidates],
        ["1 confirmed", result.findings.length === 1, result.findings.length],
        ["2 refuted", result.refuted.length === 2, result.refuted.length],
        ["nothing unadjudicated", result.coverage.unadjudicated.length === 0],
        [
          "batch gets exactly its own corpus",
          verifyPrompt.includes("fallback-secrets.md") &&
            !verifyPrompt.includes("default-credentials.md") &&
            !verifyPrompt.includes("weak-crypto.md"),
        ],
        [
          "batch spans several files in one agent",
          verifyPrompt.includes("src/a.py") && verifyPrompt.includes("src/b.py"),
        ],
        [
          "sweep gets only its own corpus",
          sweepPrompt.includes("weak-crypto.md") && !sweepPrompt.includes("fallback-secrets.md"),
        ],
        [
          // Asserting the exact key set, not the absence of named fields: the
          // allowlist is the invariant, and a field-by-field check goes stale every
          // time the recon schema changes.
          "sweep context carries exactly its allowlisted fields",
       
   (() => {
            const m = sweepPrompt.match(/<context>\n([\s\S]*?)\n<\/context>/);
            if (!m) return false;
            return (
              Object.keys(JSON.parse(m[1])).sort().join(",") ===
              "config_accessors,config_locations,deploy_manifests,exclude_paths,frameworks,languages"
            );
          })(),
          (sweepPrompt.match(/<context>\n([\s\S]*?)\n<\/context>/) || [])[1],
        ],
      ];
    },
  },
  {
    name: "phases are declared once and every agent is tagged",
    // Single script again, so meta.phases is the only declaration and it works as
    // intended. The four titles, the four phase() calls and every agent's opts.phase
    // must agree; a mismatch is what made the UI show two parallel sets when the
    // phases lived in sub-workflows.
    async run(rawSrc) {
      const src = currentSource(rawSrc);
      const titles = [...src.matchAll(/^ {6}title: "([A-Za-z]+)",$/gm)].map((m) => m[1]);
      const calls = [...src.matchAll(/^phase\("([A-Za-z]+)"\);$/gm)].map((m) => m[1]);
      const tags = [...src.matchAll(/phase: "([A-Za-z]+)"/g)].map((m) => m[1]);
      const agentCalls = (src.match(/agent\((?=\s*[`\n])/g) || []).length;

      return [
        ["four phases declared", titles.length === 4, titles.join(", ")],
        [
          "every declared phase is entered",
          titles.every((t) => calls.includes(t)) && calls.length === 4,
          "declared " + titles.join(",") + " / called " + calls.join(","),
        ],
        ["every agent is phase-tagged", tags.length === agentCalls, tags.length + "/" + agentCalls],
        [
          "every tag matches a declared title",
          tags.every((t) => titles.includes(t)),
          tags.filter((t) => !titles.includes(t)).join(", "),
        ],
        ["no sub-workflow calls remain", !/await workflow\(/.test(src), "await workflow() still present"],
      ];
    },
  },
  {
    name: "every agent pins a model, sonnet floor, opus for verification",
 
   // Without an explicit model an agent silently inherits the session model, so
    // a run's cost and quality would drift with whatever the caller happens to be
    // using. Sonnet is the floor; only Verify adjudicates, so only Verify is Opus.
    //
    // Pins live in the MODELS table and are referenced as `model: MODELS.<phase>`, so
    // this resolves through the table. meta.phases cannot read it (it has to be a
    // literal), which is a second source of truth, so their agreement is asserted too.
    async run(src) {
      const FLOOR_OK = new Set(["sonnet", "opus"]);
      const problems = [];
      const full = currentSource(src);

      const tableStart = full.indexOf("const MODELS = {");
      const table = Object.fromEntries(
        [...full.slice(tableStart, full.indexOf("};", tableStart)).matchAll(/(\w+): "([a-z0-9.-]+)"/g)].map(
          (m) => [m[1], m[2]],
        ),
      );
      if (Object.keys(table).length === 0) problems.push("MODELS table parsed as empty");

      // Body only: meta.phases carries four `model:` annotations for the progress UI,
      // and counting them made the total exceed the agent count, so a dropped pin
      // still cleared the threshold and went undetected.
      const body = full.slice(full.indexOf("\n};") + 3);
      // Real agent() call sites, not prose like "verify agent(s)".
      const agentCalls = (body.match(/agent\((?=\s*[`\n])/g) || []).length;
      const refs = [...body.matchAll(/model: MODELS\.(\w+)/g)].map((m) => m[1]);
      if (refs.length < agentCalls)
        problems.push(refs.length + "/" + agentCalls + " agents pin a model");
      for (const key of refs) {
        if (!(key in table)) problems.push("MODELS." + key + " is not in the table");
        else if (!FLOOR_OK.has(table[key]))
          problems.push(key + " is '" + table[key] + "', below the sonnet floor");
      }

      // Verify's pin, found by proximity to its phase tag.
      const verifyKeys = [
        ...body.matchAll(/phase
: "Verify",[\s\S]{0,400}?model: MODELS\.(\w+)/g),
      ].map((m) => m[1]);
      const verifyModels = verifyKeys.map((k) => table[k]);

      // meta.phases: title -> literal model, which must match the table.
      const declared = [
        ...full.slice(0, full.indexOf("\n};")).matchAll(/title: "(\w+)",[\s\S]{0,200}?model: "([a-z0-9.-]+)"/g),
      ].map((m) => [m[1].toLowerCase(), m[2]]);
      const drifted = declared.filter(([phase, model]) => table[phase] !== model);

      return [
        ["every agent pins a model at or above sonnet", problems.length === 0, problems.join("; ")],
        [
          "verification runs on opus",
          verifyModels.length > 0 && verifyModels.every((m) => m === "opus"),
          verifyModels.join(", ") || "none",
        ],
        [
          "meta.phases agrees with the MODELS table",
          declared.length === 4 && drifted.length === 0,
          declared.length + " declared; drifted: " + drifted.map((d) => d.join("=")).join(", "),
        ],
      ];
    },
  },
  {
    name: "scope handling (quote/string parsing now belongs to the command)",
    // The pipeline no longer parses slash-command text: the command resolves `$1`
    // and passes a clean path. All it owns is defaulting an absent scope to ".".
    async run(src) {
      const cases = [
        [{ ...ENTRY(), scope: "src/" }, "src/", "an explicit path"],
        [{ ...ENTRY(), scope: "  src/x  " }, "src/x", "surrounding whitespace trimmed"],
        [{ ...ENTRY(), scope: "" }, ".", "empty scope defaults to ."],
        [{ pluginRoot: PLUGIN_ROOT }, ".", "absent scope defaults to ."],
      ];
      const out = [];
      for (const [args, expected, label] of cases) {
        const { result } = await runWorkflow(src, {
          args,
          recon: RECON_OK,
          sweeps: SWEEPS_OVERLAP,
          verdicts: () => ({ verdicts: [] }),
        });
        // Must compare coverage.scope directly: a run that returns no coverage would
        // make this
 assertion vacuous, which is how a dropped default slipped past once.
        out.push([
          label,
          result.coverage?.scope === expected,
          "got " + JSON.stringify(result.coverage?.scope ?? result.status),
        ]);
      }
      return out;
    },
  },
  {
    name: "the named scope is never excluded, whatever it looks like",
    // A caller who points at `tests/` or `tests/conftest.py` wants it audited. Recon
    // is told to list test directories as non-production, so without an explicit
    // carve-out the sweep excludes its own target, finds nothing, and the run reports
    // a genuine negative. Both prompts have to carry the rule; a file/directory branch
    // did not, because it only ever waived exclusions for a named *file*.
    async run(src) {
      const { result, prompts } = await runWorkflow(src, {
        args: { ...ENTRY(), scope: "tests/" },
        recon: { ...RECON_OK, exclude_paths: ["tests/"] },
        sweeps: SWEEPS_OVERLAP,
        // Real refutations, not an empty set: an empty one is a verify failure now, and
        // this scenario is asserting the run reaches the end.
        verdicts: ALL_REFUTED,
      });
      const sweepPrompt = prompts["sweep:weak-crypto"] || "";
      const reconPrompt = prompts["recon"] || "";
      return [
        [
          "recon told not to exclude the scope",
          /Never exclude[\s\S]{0,60}itself or anything inside it/.test(reconPrompt),
        ],
        [
          "sweep told the named path is never out of scope",
          /named this path, so it is never out of scope/.test(sweepPrompt),
        ],
        [
          "no file-vs-directory branch left in the sweep prompt",
          !/is a \*\*single file\*\*|is a \*\*directory\*\*/.test(sweepPrompt),
        ],
        ["run still completed", result.status === "no-findings-confirmed", result.status],
      ];
    },
  },
  {
    name: "abort: scope does not exist",
    async run(src) {
      const { result, prompts } 
= await runWorkflow(src, {
        args: { ...ENTRY(), scope: "nope/" },
        recon: { ...RECON_OK, scope_exists: false },
        sweeps: SWEEPS_OVERLAP,
        verdicts: () => ({ verdicts: [] }),
      });
      return [
        ["status is scope-missing", result.status === "scope-missing", result.status],
        ["no sweep spawned", Object.keys(prompts).filter((k) => k.startsWith("sweep:")).length === 0],
      ];
    },
  },
  {
    name: "entry guard: refuses to run without the command's inputs",
    // The pipeline cannot resolve its own plugin directory, so absent inputs are a
    // hard stop with a pointer to the command. No fallback, no guessing.
    async run(src) {
      const cases = [
        [undefined, "missing-plugin-root", "nothing at all"],
        ["src/", "missing-plugin-root", "a bare string (slash-style arg)"],
        [{ scope: "src/" }, "missing-plugin-root", "scope but no pluginRoot"],
      ];
      const out = [];
      for (const [args, expected, label] of cases) {
        const { result, prompts } = await runWorkflow(src, {
          args,
          recon: RECON_OK,
          sweeps: SWEEPS_OVERLAP,
          verdicts: () => ({ verdicts: [] }),
        });
        out.push([
          "stops on " + label,
          result.status === expected,
          "got " + result.status,
        ]);
        out.push([
          "  ...spawning nothing",
          Object.keys(prompts).length === 0,
          Object.keys(prompts).join(", "),
        ]);
        out.push([
          "  ...and naming the command",
          /\/insecure-defaults:audit/.test(result.note || ""),
          result.note || "",
        ]);
      }
      return out;
    },
  },
  {
    name: "abort: a sweep could not read its corpus",
    // Readability is reported by the agent that opened the file, not inferred from a
    // listing passed in. One failure aborts: that sweep judged candidates without the
    // counter-examples, and nothing downstream would distinguish its
 output.
    async run(src) {
      const { result } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: {
          "weak-crypto": {
            corpus_read: false,
            files_scanned: 30,
            patterns_loaded: true,
            seed_patterns_run: ["s"],
            derived_patterns: ["derived"],
            candidates: [{ file: "src/a.py", line: 1, snippet: "md5(pw)", why_suspicious: "y" }],
          },
        },
        verdicts: () => ({ verdicts: [] }),
      });
      return [
        ["status is corpus-unreadable", result.status === "corpus-unreadable", result.status],
        [
          "names the affected category",
          (result.categories_affected || []).includes("weak-crypto"),
          JSON.stringify(result.categories_affected),
        ],
        ["says nothing was audited", /Nothing was audited/.test(result.note || "")],
      ];
    },
  },
  {
    name: "zero-item guard: sweeps scanned nothing",
    async run(src) {
      const { result } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: {},
        verdicts: () => ({ verdicts: [] }),
      });
      return [
        ["status is search-failed", result.status === "search-failed", result.status],
        ["note forbids reading it as clean", /NOT a clean audit/.test(result.note || "")],
      ];
    },
  },
  {
    name: "genuine negative: searched real files, matched nothing",
    async run(src) {
      const { result } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: allSweptClean(),
        verdicts: () => ({ verdicts: [] }),
      });
      return [
        ["status is no-candidates", result.status === "no-candidates", result.status],
        ["distinguished from search-failed", result.status !== "search-failed"],
      ];
    },
  },
  {
    name: "sweep that derived nothing for the stack is surfaced",
    async run(src) {
      const seeds = seedsFor("fal
lback-secrets");
      if (!seeds || seeds.length === 0) {
        return [["seeds parsed out of the workflow", false, "could not read seeds for fallback-secrets"]];
      }
      const { result, logs } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: {
          "fallback-secrets": {
            corpus_read: true,
    files_scanned: 40,
            patterns_loaded: true,
            seed_patterns_run: seeds,
            derived_patterns: [], // ran the seeds and derived nothing
            candidates: [
              { file: "src/a.py", line: 1, snippet: "x", why_suspicious: "y" },
            ],
          },
        },
        verdicts: () => ({ verdicts: [] }),
      });
      return [
        ["seeds parsed out of the workflow", true],
        [
          "recorded in coverage",
          (result.coverage.seed_only_sweeps || []).includes("fallback-secrets"),
          JSON.stringify(result.coverage.seed_only_sweeps),
        ],
        ["logged for the operator", logs.some((l) => l.includes("seed"))],
      ];
    },
  },
  {
    name: "non-fallback (unconditional) findings are in scope",
    // Over half of the documented target set -- weak crypto, public ACLs, world
    // -writable modes, traces in responses, seeded admin accounts -- involves no
    // configuration at all. The verifier's step 2 tests for a config fallback,
    // so it must say explicitly that a missing fallback is not exculpatory, or
    // it will refute those on a technicality.
    async run(src) {
      const { prompts } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: {
          "weak-crypto": {
            corpus_read: true,
            files_scanned: 20,
            patterns_loaded: true,
            seed_patterns_run: ["s"],
            derived_patterns: ["derived-hmac"],
            candidates: [
              {
                file: "src/auth/passwords.py",
                line: 8,
                
snippet: "return hashlib.md5(password.encode()).hexdigest()",
                why_suspicious: "md5 over a password, no config involved",
              },
            ],
          },
        },
        verdicts: () => ({ verdicts: [] }),
      });
      const verify = prompts["verify:weak-crypto"] || "";
      const sweep = prompts["sweep:weak-crypto"] || "";
      return [
        ["verifier names the unconditional branch", /[Uu]nconditional/.test(verify)],
        [
          "verifier told step 2 cannot refute it",
          /cannot refute an unconditional candidate/i.test(verify),
        ],
        [
          "verifier told a missing fallback is not exculpatory",
          /no configuration found|not refute an unconditional/i.test(verify),
        ],
        [
          "step 5 scoped to configurable candidates",
          /[Cc]onfigurable candidates only/.test(verify),
        ],
        [
          // `sometimes` and `unknown` used to be an undifferentiated middle: the enum
          // offered four values and the prompt only said what to do with two, so the
          // other two were reported and then ignored. Both must now direct severity.
          "the middle deployment_supplies_var values carry a severity instruction",
          (verify.match(/treat it as reachable/gi) || []).length >= 2,
          String((verify.match(/treat it as reachable/gi) || []).length) + " of 2",
        ],
        ["sweep told to file them anyway", /no configuration at all/i.test(sweep)],
      ];
    },
  },
  {
    name: "verify batching: by category, capped, directories kept whole",
    // Three properties over one set of fixtures, since they share all their
    // machinery:
    //   - a category wider than the cap is chunked. One agent for hundreds of
    //     candidates hits the tool-call limit partway and returns a partial verdict
    //     list, which reads as "the rest were fine".
    //   - a directory that fits stays whole. Its files share imports, a config
    //
     module and framework conventions, so splitting it makes two agents redo
    //     the same groundwork.
    //   - a directory over the cap is split on its own, not by dragging a
    //     neighbouring directory into the split.
    async run(src) {
      const mk = (dir, n, line) =>
        Array.from({ length: n }, (_, i) => ({
          file: `${dir}/f${String(i).padStart(2, "0")}.py`,
          line,
          snippet: "md5(pw)",
          why_suspicious: "y",
        }));

      const CASES = [
        {
          label: "40 candidates in one flat directory",
          candidates: mk("src", 40, 7),
          batches: 3, // 16 | 16 | 8
        },
        {
          label: "three directories of 6",
          candidates: [...mk("src/aaa", 6, 3), ...mk("src/bbb", 6, 3), ...mk("src/ccc", 6, 3)],
          batches: 2, // 12 | 6, where a blind sort-then-chunk would give 16 | 2
          wholeDirs: true,
          relatedHint: true,
        },
        {
          label: "a 20-candidate directory beside a 1-candidate one",
          candidates: [...mk("src/big", 20, 1), ...mk("src/zsmall", 1, 1)],
          batches: 3, // big splits 16 | 4; the small one is never dragged in
          neverTogether: ["src/big", "src/zsmall"],
        },
      ];

      const out = [];
      for (const c of CASES) {
        const { result, prompts } = await runWorkflow(src, {
          args: ENTRY(),
          recon: RECON_OK,
          sweeps: {
            "weak-crypto": {
              corpus_read: true,
              patterns_loaded: true,
              files_scanned: 60,
              seed_patterns_run: ["s"],
              derived_patterns: ["derived"],
              candidates: c.candidates,
            },
          },
          verdicts: () => ({ verdicts: [] }),
        });

        const labels = Object.keys(prompts).filter((k) => k.startsWith("verify:"));
        const sizes = labels.map((l) => (prompts[l].match(/"line":/g) || []).length);
        const dirsIn = (l) => [

          ...new Set([...prompts[l].matchAll(/"(.+)\/f[0-9]+\.py"/g)].map((m) => m[1])),
        ];

        out.push([
          `${c.label}: ${c.batches} batch(es)`,
          labels.length === c.batches && result.coverage.batches_run === c.batches,
          `${labels.length} agents, coverage says ${result.coverage.batches_run}`,
        ]);
        out.push([
          "  ...none over the 16-finding cap",
          sizes.every((n) => n > 0 && n <= 16),
          JSON.stringify(sizes),
        ]);
        out.push([
          "  ...every candidate in some batch",
          sizes.reduce((a, b) => a + b, 0) === c.candidates.length,
          `${sizes.reduce((a, b) => a + b, 0)} of ${c.candidates.length}`,
        ]);
        out.push([
          "  ...chunks are labelled apart",
          new Set(labels).size === labels.length &&
            labels.every((l) => /^verify:weak-crypto(-[0-9]+)?$/.test(l)),
          labels.join(", "),
        ]);

        if (c.wholeDirs) {
          const all = labels.flatMap(dirsIn);
          const split = [...new Set(all.filter((d) => all.indexOf(d) !== all.lastIndexOf(d)))];
          out.push(["  ...no directory split across batches", split.length === 0, split.join(", ")]);
        }
        if (c.relatedHint) {
          out.push([
            "  ...a single-directory batch is told its files are related",
            labels.some((l) => /all in one directory/.test(prompts[l])),
          ]);
        }
        if (c.neverTogether) {
          const mixed = labels.filter((l) => c.neverTogether.every((d) => prompts[l].includes(d)));
          out.push([
            `  ...${c.neverTogether.join(" and ")} never share an agent`,
            mixed.length === 0,
            mixed.join(", "),
          ]);
        }
      }
      return out;
    },
  },
  {
    name: "one category's verdict does not adjudicate another's candidate",
    // src/a.py:10 is flagged by BOTH categories, so it is two candidates. When
    // fallback-secrets ret
urns a verdict for it and default-credentials does not,
    // keying adjudication on file:line marks both as done and the second silently
    // disappears. It has to be keyed on category:file:line, like the candidates.
    async run(src) {
      const { result } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: SWEEPS_OVERLAP,
        verdicts: (cat) =>
          cat === "fallback-secrets"
            ? {
                verdicts: [
                  { file: "src/a.py", line: 10, refuted: false, severity: "HIGH", rationale: "signs tokens" },
                  { file: "src/b.py", line: 3, refuted: true, rationale: "no sink" },
                ],
              }
            : { verdicts: [] },
      });
      const gaps = result.coverage.unadjudicated || [];
      return [
        [
          "the silent category's candidate is reported unverified",
          gaps.includes("default-credentials:src/a.py:10"),
          JSON.stringify(gaps),
        ],
        [
          "the answered one is not also reported as a gap",
          !gaps.includes("fallback-secrets:src/a.py:10"),
          JSON.stringify(gaps),
        ],
        [
          "the confirmed finding carries the rule that raised it",
          (result.findings || []).every((f) => f.category === "fallback-secrets"),
          JSON.stringify((result.findings || []).map((f) => f.category)),
        ],
      ];
    },
  },
  {
    name: "a verifier dies mid-run",
    async run(src) {
      const { result } = await runWorkflow(src, {
        args: ENTRY(),
        recon: RECON_OK,
        sweeps: SWEEPS_OVERLAP,
        verdicts: (cat) => {
          if (cat === "fallback-secrets") throw new Error("agent died");
          return { verdicts: [{ file: "src/a.py", line: 10, refuted: true, rationale: "r" }] };
        },
      });
      return [
        // Not `typeof status === "string"`: that cannot tell a completed run from the
        // verify-failed abort, which only a
 *total* verify failure should reach.
        [
          "run still completes",
          result.status === "no-findings-confirmed" || result.status === "findings",
          result.status,
        ],
        [
          "batch shortfall visible in coverage",
          result.coverage.batches_verified < result.coverage.batches_run,
          `${result.coverage.batches_verified} of ${result.coverage.batches_run}`,
        ],
        [
          "the dead batch's candidates are unadjudicated, not lost",
          (result.coverage.unadjudicated || []).some((u) => u.startsWith("fallback-secrets:")),
          JSON.stringify(result.coverage.unadjudicated),
        ],
      ];
    },
  },
  {
    name: "a category that searched nothing is not repo

... [Content truncated]