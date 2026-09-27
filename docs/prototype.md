# Local evidence and scenario prototype

This prototype exercises Commonweal’s research loop: inspect sources, import evidence, adapt explicit assumptions, calculate a reproducible result, compare alternatives and export the work. Community solar is the first bounded case within the wider [mission](mission.md). AI tools can use the same structured operations as people; the prototype itself makes no AI inference calls.

The reported Ōtaki figures and the illustrative solar scenarios are separate. Published annual totals support limited arithmetic reconstruction. They do not supply a validated local engineering model, financial appraisal or guarantee of household benefits.

## Run locally

Use **Node.js 20.11 or later** and its bundled npm. There are no runtime or development package dependencies, so no package installation is required. From the repository root:

```sh
node --version
npm test
npm start
```

Open <http://127.0.0.1:4317>. Stop the server with Ctrl-C. To choose another port:

```sh
PORT=4318 npm start
```

The server binds to `127.0.0.1`. It accepts `localhost` or `127.0.0.1` Host headers and rejects browser origins other than its own. This is a local workbench, without shared accounts or a production hosting configuration.

In the web interface:

1. Inspect evidence, reported annual totals, source links and quality notes.
2. Select an illustrative scenario, or import one from JSON. Use adaptation and the input fields to change assumptions.
3. Import an evidence array when needed. Import replaces the working evidence set; it does not change evidence retained in earlier runs.
4. Run the scenario, then change an assumption and run again. Compare two saved runs in the current page session.
5. Export the scenario, evidence, complete run, comparison or session JSON before leaving the page.

Editing a numerical input in the interface changes its basis to `illustrative_assumption` and clears its earlier evidence links; blank environmental inputs become `unknown`. To supply a supported or derived input with evidence references, edit the scenario JSON and import it. Scenario import loads an editor; complete validation happens when the scenario runs.

“Saved” runs live in page memory. There is no database, server-side save, browser storage or automatic session recovery. Reloading the page discards unsaved work. Session export is a portable record, not an implemented full-session restore operation. Downloads and the visible export panel provide copies of the JSON.

## Structured CLI workflow

The CLI writes JSON to standard output, reports errors to standard error and exits unsuccessfully for invalid requests. Use `node src/cli.mjs` directly when redirecting JSON; npm’s command banners are not part of the JSON format.

These commands run from the repository root. They create only local, ignored files in `scratch/prototype`:

```sh
mkdir -p scratch/prototype
node src/cli.mjs operations > scratch/prototype/operations.json
node src/cli.mjs examples > scratch/prototype/examples.json
node src/cli.mjs validate-evidence data/evidence/otaki.json
```

The example scenario file is an **array**. A run accepts one scenario object. Extract the no-project baseline and the 30 kWp illustrative option:

```sh
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
const scenarios = JSON.parse(await readFile('data/scenarios/illustrative.json', 'utf8'));
for (const [filename, id] of [['baseline', 'no-project'], ['option', 'small-project']]) {
  const scenario = scenarios.find(item => item.id === id);
  if (!scenario) throw new Error('Missing example scenario: ' + id);
  await writeFile('scratch/prototype/' + filename + '.json', JSON.stringify(scenario, null, 2) + '\n');
}
JS
node src/cli.mjs run scratch/prototype/baseline.json --evidence data/evidence/otaki.json > scratch/prototype/baseline-run.json
node src/cli.mjs run scratch/prototype/option.json --evidence data/evidence/otaki.json > scratch/prototype/option-run.json
node src/cli.mjs verify scratch/prototype/option-run.json
node src/cli.mjs compare scratch/prototype/baseline-run.json scratch/prototype/option-run.json > scratch/prototype/comparison.json
```

Edit `scratch/prototype/option.json` to try a different assumption, then rerun it and compare the exported results. The evidence argument is optional when no inputs reference evidence, but supplying the working evidence set retains it in the run. Example numbers are software demonstration assumptions, not Ōtaki observations, quotations or forecasts.

`validate-evidence` and `--evidence` accept an evidence **array**. The web interface’s evidence export wraps that array in `{ "evidence": [...] }`; extract `.evidence` before passing that export to these CLI commands. A complete run already embeds its evidence, so `verify` needs only the run file.

## Local HTTP operations

`GET /api/operations` describes the supported boundary. External compatible tools may call it locally or invoke the CLI without paying Commonweal per request. An external AI service may impose its own access requirements and charges.

| Operation | Request | Result |
| --- | --- | --- |
| Health | `GET /api/health` | Status and installed model identity |
| Describe operations | `GET /api/operations` | Versioned operation descriptions |
| Read examples | `GET /api/examples` | Illustrative scenarios, evidence and separate reported benchmarks |
| Import/check evidence | `POST /api/validate-evidence`, `{ "evidence": [...] }` | Validated records and verification warnings |
| Run | `POST /api/run`, `{ "scenario": {...}, "evidence": [...] }` | Complete reproducible run |
| Compare | `POST /api/compare`, `{ "runs": [baselineRun, alternativeRun] }` | Verified alternative-minus-baseline differences |
| Verify | `POST /api/verify`, `{ "run": {...} }` | `{ "valid": true, "run_id": "..." }` on success |

For example, with the server running:

```sh
curl --fail http://127.0.0.1:4317/api/health
node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
const scenario = JSON.parse(await readFile('scratch/prototype/option.json', 'utf8'));
const evidence = JSON.parse(await readFile('data/evidence/otaki.json', 'utf8'));
const response = await fetch('http://127.0.0.1:4317/api/run', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenario, evidence })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(JSON.stringify(result, null, 2));
JS
```

POST requests require `Content-Type: application/json` and are limited to **1 MiB**. Each CLI input file is also limited to 1 MiB; the browser file picker uses a slightly smaller 1,000,000-byte limit. Validation rejects JSON nesting beyond 40 levels and unsupported prototype-related keys. Evidence sets contain at most 200 records. These bounds keep the local prototype small; they are not a service availability guarantee.

Operations neither fetch evidence URLs nor persist contributions. Evidence validation checks structure, dates, units/context fields, declared rights and references; it does not establish truth, permissions or independent review. There is no AI API integration, autonomous research agent, hosted inference, API key requirement or WebMCP adapter. A future browser adapter can build on this boundary without making experimental browser support mandatory.

## Records and repeatability

| Record or model | Current identifier |
| --- | --- |
| Scenario | `commonweal.scenario.v1` |
| Evidence | `commonweal.evidence.v1` |
| Run | `commonweal.run.v1` |
| Comparison | `commonweal.comparison.v1` |
| Reported benchmarks | `commonweal.benchmarks.v1` |
| Operation descriptions | `commonweal.operations.v1` |
| UI session export | `commonweal.session.v1` |
| Model identity | `annual-solar-screen` |
| Model version | `commonweal.annual-solar.v1` |

A scenario has an `id`, `title`, `location`, integer `price_year` from 1900 to 2200, `status: "illustrative"`, string arrays `assumptions` and `unknowns`, and the inputs below. Each input is `{ "value": ..., "unit": "...", "basis": "...", "evidence_ids": [...] }`. Bases are `illustrative_assumption`, `source_reported`, `derived` and `unknown`. Source-reported and derived inputs require at least one evidence reference, and every reference must occur in the run’s evidence set. The whole scenario remains illustrative even if particular inputs cite evidence.

Evidence records retain an identifier and version, title and claim, classification and declared review status, source title/URL/publisher/locator/dates, context location/period/units/method, limitations and reuse-rights information. The [committed evidence records](../data/evidence/otaki.json) provide complete examples. Review labels are declarations to inspect, not badges conferred by schema validation. Two versions with the same evidence identifier cannot occur in one run.

A run contains the **full scenario and evidence snapshots**, model identity/version, numerical results and limitations. Its `run_id` is `run-` followed by the SHA-256 of that body, serialized with recursively sorted object keys. Array order is retained. The ID changes if any retained content changes; whitespace and object-key order do not affect it. Runs exclude automatic timestamps and randomness, so the same inputs and installed model produce the same run.

`verify` rebuilds the run with the currently installed model and compares its complete canonical contents. It detects changed inputs, results or provenance, but is not a signature, source-authenticity check or scientific validation. Keep the repository commit and runtime version alongside exported work when archiving it: a run records the model version, not a complete executable/runtime snapshot. Historical runs require the corresponding code version if model behavior changes.

Comparison first verifies both runs and requires matching NZD price years. It returns `deltas` for model metrics, `allocation_deltas` for proposed benefit shares and `environment_deltas` for environmental fields, always **alternative minus baseline**. An environmental difference is `null` if either side is unknown. These differences do not make unlike sites, system boundaries or financial assumptions comparable automatically. A comparison retains run IDs and titles; retain both complete runs for independent reproduction.

## Inputs and equations

All known numerical values must be finite and nonnegative. Fractions lie from 0 to 1; allocation shares must sum to 1 within `1e-9`. Unknown input names are rejected. Only the environmental fields accept `null`; a null value must have basis `unknown`, and an unknown basis requires a null value. Unknown is never silently converted to zero. Core calculations are unrounded; presentation may round displayed values. Arithmetic overflow is rejected.

| Input | Required unit | Meaning |
| --- | --- | --- |
| `capacity_kwp` | `kWp` | Installed capacity |
| `annual_yield_kwh_per_kwp` | `kWh/kWp/year` | Annual generation per unit capacity |
| `annual_demand_kwh` | `kWh/year` | Demand within the stated site boundary |
| `onsite_use_fraction` | `fraction` | Assumed fraction of generation used on site, before the annual demand cap |
| `capital_cost_nzd` | `NZD` | Up-front cost, reported separately |
| `annual_operating_cost_nzd` | `NZD/year` | Annual operating cost |
| `import_price_nzd_per_kwh` | `NZD/kWh` | Value assigned to avoided imports |
| `export_price_nzd_per_kwh` | `NZD/kWh` | Value assigned to exported generation |
| `renter_share` | `fraction` | Proposed renter allocation |
| `other_household_share` | `fraction` | Proposed other-household allocation |
| `community_share` | `fraction` | Proposed community-purpose allocation |
| `displaced_grid_kgco2e_per_kwh` | `kgCO2e/kWh` | Nullable factor for the onsite displacement proxy |
| `embodied_kgco2e` | `kgCO2e` | Nullable embodied-emissions stock within a stated boundary |
| `annual_compute_kwh` | `kWh/year` | Nullable annual compute electricity |
| `annual_compute_kgco2e` | `kgCO2e/year` | Nullable annual compute emissions |
| `annual_water_litres` | `L/year` | Nullable annual water use within a stated boundary |

Energy quantities below are annual kWh:

```text
generation = capacity × annual yield
onsite     = min(generation × onsite-use fraction, annual demand)
export     = generation − onsite
import     = annual demand − onsite
```

Consequently `generation = onsite + export` and `demand = onsite + import`, subject to floating-point precision. This balance assumes that generation remaining after onsite use can be exported: it does not establish available network capacity, actual timing or permission to connect.

Operating values are annual NZD in the scenario’s stated price year:

```text
avoided import cost = onsite × import price
export receipts     = export × export price
operating surplus   = avoided import cost + export receipts − operating cost
allocatable value   = max(operating surplus, 0)
funding gap         = max(−operating surplus, 0)
each allocation     = allocatable value × its proposed share
```

**Capital cost stays separate.** It is not deducted from annual operating surplus. There is no capital recovery, financing, debt service, discount rate, replacement, degradation, inflation, fixed-tariff or tax model. Avoided bills are economic value, not automatically distributable cash. Renter and community allocations are proposed shares requiring ownership and transfer arrangements, not observed benefits or promised payments. Deficits produce a funding gap rather than negative benefit allocations.

The sole calculated environmental quantity is:

```text
gross operational proxy = onsite × displaced-grid factor
```

It has units `kgCO2e/year` and is null if the factor is unknown, including for a zero-generation scenario. Export displacement is excluded. This is an illustrative gross onsite proxy, not net climate benefit or proof of marginal grid displacement. Embodied emissions, annual compute electricity/emissions and water are reported separately as supplied, retaining nulls. The engine does not infer compute emissions from electricity or subtract a lifetime stock from an annual flow. It does not measure its own compute footprint; lifecycle boundaries, materials, ecosystems and other unmeasured effects need further evidence.

## Reported annual reconstruction

The [benchmark input](../data/benchmarks/otaki-annual.json) retains each reported period, generation total, nullable onsite-use total, evidence reference and verbatim quality note. `summarizeBenchmarks` in [the benchmark module](../src/benchmarks.mjs) checks evidence references and the arithmetic bounds, then derives:

```text
onsite share = reported onsite solar use / reported generation
residual     = reported generation − reported onsite solar use
```

Both derived values remain null if onsite use is unknown. The 2020–21 start is preserved as `2020-09` because its exact day is not asserted; partial periods are not annualised. The 2024–25 quality note identifies estimated production during a meter malfunction. A residual is **not measured export**. The reported totals do not validate the separate illustrative scenarios, supply raw interval measurements or establish household benefits.

## Review boundary

Tests verify deterministic computation, energy and allocation balances, edge cases, provenance/reference handling, reported-total arithmetic and local structured operations. Passing tests establishes software behavior within those contracts, not a validated real-world model.

Before a practical community decision, obtain and review local generation and demand profiles, site/network constraints, ownership and renter access, funding and full lifecycle costs, maintenance and replacement, environmental boundaries and actual outcome measurements. There is no battery dispatch, seasonal or winter reliability model, grid-feasibility assessment, optimiser or validated national scaling model here. Enlarging one project, adapting it to another community and examining many projects together require different evidence and models. Independent practitioner and community review remains future work.
