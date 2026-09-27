# Working on a local study

Commonweal now has a study home and ordinary editing forms. A study holds its question and place, current evidence, draft scenarios and completed runs. Use this workflow without writing JSON or connecting an AI service. Solar remains the first example inside the wider [mission](mission.md).

## Start your own work

Use a supported Node.js release, preferably Node 22 or 24. Install the locked dependencies once, then start the local app:

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open [Commonweal locally](http://127.0.0.1:4317).

1. From the study home, create a blank study with a name and place. Add its research question and working notes in Overview. Copying the example is a separate, explicit choice; it brings illustrative calculator inputs and separately sourced Ōtaki evidence.
2. In Evidence, add a record using the labelled fields. State the claim, its source, dates, units and context, limitations and whether the source reports an observation or forecast, or the record is an assumption. New or edited contributions need review; filling in a form does not verify their truth. Use scenario assumptions for ideas without a public source.
3. In Scenarios, create a draft and edit its title, location, price year, numeric assumptions and explanatory notes. The starting values are an illustrative template, not measurements. Associate relevant evidence with inputs and choose an appropriate basis. Keep unknown environmental inputs blank. Proposed benefit shares must sum to one.
4. Run a scenario, duplicate or edit a draft, then run an alternative. Results retain the exact inputs and evidence used. Compare those results and inspect changed assumptions, proposed sharing and unknown impacts.
5. Save the study explicitly. The save indicator distinguishes changes in the browser from a stored revision. Return to the study home, reopen it, and continue. Saved studies survive a page reload and server restart; unsaved editor changes do not.
6. Export a saved study bundle for backup or transfer. If your browser does not save the download, use the visible Copy JSON control and save that text as a `.json` file, or use the CLI export below. Importing a bundle validates it before creating a separate local study. It never replaces a study with the same name or identifier.

Draft evidence and scenarios can be removed through their forms. A current scenario must not reference missing evidence, so remove or replace those associations first. Previous results retain their own original snapshots even when a draft or working evidence record is removed. Completed results cannot be deleted or rewritten through a save.

Drafts must satisfy the model schema before a durable save. Finish missing required values or correct validation errors first. Overview also offers an explicit unvalidated `commonweal.recovery.v1` JSON export of current browser work, including incomplete drafts, for manual reconciliation. It is not a verified study bundle and cannot be fed directly to the bundle importer. The browser study-file picker allows 9 MiB for the file envelope; valid bundle content is still limited to 8 MiB.

If another browser or connected AI saves the same study, a stale save is rejected. Preserve your unsaved work if needed, reopen the latest study, review the changes and apply your edits explicitly. Commonweal does not silently merge competing edits.

## Adapt to a second community

Start from a saved first study and use its adaptation form. Name the second study and place, and explain why you are adapting it. This creates a new local study; the first remains unchanged.

Each adapted scenario retains the source study identifier, revision and content digest, original scenario context, input values, evidence, assumptions and uncertainty notes. Its transferred numeric values become illustrative assumptions and their active evidence links are cleared. Every inherited input is marked for local review. Original source evidence and original completed runs are retained with their original location and context.

Use that review list to ask concrete questions: what is this site's demand, what generation profile fits it, who owns the assets, what tariffs and connection conditions apply, and how would benefits reach renters? Replace inherited assumptions with appropriate local evidence when available. Editing a place name or attaching a reference does not establish that its figure is transferable or locally validated. A new run has its own exact snapshot; it does not turn the reference runs into second-community observations.

The app supports this local learning loop. It does not multiply a small project's success nationally, reconcile raw Ōtaki meter intervals, or invent measurements for the second community. Practitioner and community review remain necessary before practical reliance.

## Where work is saved

By default, studies live under `.commonweal/studies/` in this checkout. `.commonweal/` is ignored by Git. Do not force-add it, and review portable bundles before sharing them: studies can contain personal, confidential or otherwise restricted material entered by their contributors. A public code repository does not make local study contents public.

For an intentionally different local storage root, set `COMMONWEAL_DATA_DIR` in the launcher environment. Use the same absolute directory for the web app, CLI and MCP server when they should share studies. Paths are not accepted as study identifiers or MCP tool arguments. Storage rejects symlink components; on macOS use a resolved real path rather than aliases such as `/tmp`.

```sh
COMMONWEAL_DATA_DIR=/absolute/real/directory/studies node src/server.mjs
```

The setting is controlled by whoever launches the process. This is a local application under that person's filesystem permissions, not a multi-user authorization boundary, encrypted vault or service safe to expose on a network. The HTTP server remains bound to loopback with local Host and Origin checks. There is no cloud sync or authentication.

## Bundles, history and recovery

Each successful save creates a new `revision-00000001.json`, `revision-00000002.json`, and so on inside the study's generated directory. Each revision is a complete `commonweal.study-bundle.v1` record. Existing revision files are not overwritten. Saves use an exclusive per-study lock, a synced temporary file and atomic publication; revision preconditions prevent stale or simultaneous writers from silently winning.

A bundle contains the whole saved study and a canonical SHA-256 content digest. Imports validate the schema, bounded JSON, source records, input units and references, adaptation records and every completed run by recomputation. Unsupported versions, broken references, invalid values and altered results are rejected before publishing an imported study. Import gives the copy a new local identifier and records its source identifier/revision/digest.

**A digest detects a mismatch; it does not establish truth, ownership or authenticity.** Someone can edit assumptions and recompute a valid bundle. Neither bundles nor run identifiers archive the model's source code, dependencies or runtime. Retain the repository commit, lockfile and runtime information separately when archiving a study; historical runs need the appropriate model code for verification.

Keep portable exports in a separate backed-up location. The revision files on the same disk are useful recovery history, not an independent backup. A bundle export represents one complete saved revision, not every past draft revision. To preserve the whole edit history, stop writers and back up the complete storage directory as well.

If the latest revision is corrupt or the revision sequence has gaps, Commonweal reports the problem and does not silently open an older version. Preserve the affected directory before attempting recovery. A valid earlier revision file can be imported through the study home as a new copy, retaining the damaged original for diagnosis. Alternatively, restore a complete known-good directory backup while all writers are stopped. Do not manually rewrite a revision to hide a problem.

A leftover `.lock` can mean a writer is active or stopped during a save. Close all processes using that storage root, preserve a backup, and inspect whether the latest revision is complete before removing only the stale lock. Do not delete it while another process may still be writing. Incomplete `.pending-*` files are not treated as saved revisions. If an interrupted first save has no complete revision, restore/import a backup rather than claiming that empty directory was saved work.

Limits keep this first workspace small: 8 MiB per complete bundle, 200 working evidence records, 100 scenarios, 100 completed runs, 100 study-lineage entries and up to eight nested adaptation generations. Old runs each retain their evidence, so large studies can reach the size limit before the item limit. Validation refuses a save that exceeds these bounds and keeps the previous complete revision. Use a new bounded study and archive prior work; the app does not silently prune history.

## CLI and HTTP interoperability

The ordinary UI, CLI and [MCP tools](mcp.md) share `StudyWorkspace`, `StudyStore` and the same model validators. No paid model/API key or hosted service is required to run them. Connecting a compatible AI client is optional; client capability and any external model cost remain separate. No AI-client configuration is changed automatically.

The CLI prints JSON to stdout. Use `node` directly when capturing it, so npm banners do not enter JSON files. The following uses files you choose locally; the MCP bridge has no arbitrary file-reading or file-writing tool.

```sh
node src/cli.mjs studies
node src/cli.mjs study STUDY_ID
node src/cli.mjs study-export STUDY_ID > study-backup.json
node src/cli.mjs study-import study-backup.json
```

For explicit edits, `study-create REQUEST.json` accepts `{ "metadata": { "title": "...", "location": "...", "question": "", "notes": "" } }`, optionally with `example: true`. `study-save REQUEST.json` accepts the complete working `study` and its last-read `expected_revision`. `study-adapt STUDY_ID REQUEST.json` accepts the revision, new metadata and rationale. `study-evidence` replaces the working evidence set; `study-scenario` adds or updates a draft. `study-run STUDY_ID SCENARIO_ID EXPECTED_REVISION` computes and saves a result. `study-compare STUDY_ID BASELINE_RUN_ID ALTERNATIVE_RUN_ID` is read-only.

| HTTP operation | Body / result |
| --- | --- |
| `GET /api/studies` | Summaries and problems; no creation on an empty root |
| `POST /api/studies` | Create request → `{study}` |
| `GET /api/studies/:id` | `{study}` |
| `PUT /api/studies/:id` | `{study, expected_revision}` → saved `{study}` |
| `POST /api/studies/:id/adapt` | `{metadata, rationale, expected_revision}` → new `{study}` |
| `PUT /api/studies/:id/evidence` | `{evidence, expected_revision}` → saved `{study}` |
| `PUT /api/studies/:id/scenario` | `{scenario, expected_revision}` → saved `{study}` |
| `POST /api/studies/:id/run` | `{scenario_id, expected_revision}` → `{study, run}` |
| `POST /api/studies/:id/compare` | `{baseline_run_id, alternative_run_id}` → `{comparison}` |
| `GET /api/studies/:id/export` | `{bundle}` |
| `POST /api/studies/import` | `{bundle}` → new `{study}` |

Study HTTP requests allow an 8 MiB payload plus 64 KiB transport overhead, while canonical complete bundles themselves remain limited to 8 MiB. Standalone calculation endpoints retain their 1 MiB request limit. Study identifiers are generated UUID-based identifiers, not paths. Validation and conflict errors do not authorize silently retrying an overwrite.

All model limits remain in saved runs: annual screening only; no hourly dispatch, batteries, winter reliability, network feasibility, financing or integrated lifecycle assessment. Capital is separate; avoided bills are not necessarily cash available to distribute. Benefit shares are hypothetical and require real ownership and transfer arrangements. Unknown environmental impacts stay unknown. Source reports, forecasts and illustrative outputs remain distinct.
