# Connect a compatible AI assistant locally

Commonweal exposes the same saved-study operations used by its browser UI and CLI through an MCP server over standard input/output. A compatible AI host launches this local process and supplies its own model. The bridge needs no API key, paid inference, hosted service or running web preview. It does not browse for evidence or perform autonomous research.

The implementation uses the official `@modelcontextprotocol/server` **2.1.0** package, with `zod` **4.6.5** for advertised input shapes. The official `@modelcontextprotocol/client` **2.1.0** is a development dependency for actual protocol tests. Exact dependency versions and transitive integrity hashes are in `package-lock.json`. This follows the SDK's [v2 server and client packages](https://ts.sdk.modelcontextprotocol.io/v2/) and [stdio transport](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html).

## Launch configuration

From the repository, install the locked dependencies once:

```sh
npm ci --ignore-scripts
```

Use Node 22 or 24 for a new installation. The implementation remains compatible with the repository's Node 20.11 minimum.

In a host that supports local MCP stdio servers, configure these **values using that host's own documented interface**:

| Setting | Value |
| --- | --- |
| Name | `commonweal` |
| Executable | The absolute path to your Node executable |
| Arguments | One argument: the absolute path to `commonweal/src/mcp.mjs` |
| Transport | stdio |
| Optional environment | `COMMONWEAL_DATA_DIR` set to the absolute path of a dedicated local study directory |

For example, the command the host launches is:

```sh
/absolute/path/to/node /absolute/path/to/commonweal/src/mcp.mjs
```

Paths above are placeholders. Supply the actual paths on your machine; do not paste the placeholders unchanged. The host launches the process, so a manually started process waiting on stdin is not a connection. Avoid launching through ordinary `npm run mcp`: npm's banner can contaminate the JSON-RPC stdout channel. The direct Node command emits only protocol messages to stdout; protocol diagnostics go to stderr.

No client settings are installed or changed by this project. Tested protocol compatibility is narrower than universal host compatibility. Hosts differ in setup, approval controls, context limits and support for local stdio servers. Commonweal's ordinary UI and CLI remain available.

Without `COMMONWEAL_DATA_DIR`, storage is the ignored `.commonweal/studies` directory in this checkout, independent of the host's working directory. Set the **same** directory for the web server and MCP process to work on the same studies. The directory must have real directory components, not symlink aliases. Do not point it at an unrelated folder or a public hosting directory. Local filesystem permissions protect access; this is not a multi-user authorization system.

## Tools and write behavior

All tool results are JSON encoded in MCP text content. Tool failures set `isError: true`; domain failures include an error code and message. Model, evidence, study and bundle validators are shared with the UI/CLI. Tool input schemas describe the interface; they do not establish factual accuracy.

| Tool | Effect |
| --- | --- |
| `inspect_workspace` | Read guidance, illustrative example records and separate reported benchmarks. |
| `list_studies`, `read_study` | Inspect local studies and revisions. |
| `create_study` | Create a blank study, or explicitly copy the example with `example: true`. |
| `save_study` | Save the complete working study at `expected_revision`; old runs and lineage must remain intact. |
| `replace_evidence` | Replace the complete working evidence set. Include all records to retain. Old runs keep their own source snapshots. |
| `put_scenario` | Add or replace one working scenario by identifier. |
| `run_scenario` | Calculate and persist an immutable annual screening run. An identical run already present is reused. |
| `compare_runs` | Read and verify two runs in the study; report alternative minus baseline. |
| `adapt_study` | Create a new study with parent lineage and local-review requirements. |
| `export_study` | Return the portable bundle as data; no caller-selected filesystem write. |
| `import_study` | Validate a bundle, then create a new local study. Existing studies are not replaced. |

Read-only and write annotations are hints for the host. The storage validators, revision checks and bounded identifiers enforce behavior. Commonweal does not implement its own interactive approval dialog inside MCP; configure the host's approval controls for explicit writes. A current revision must be supplied for changes to existing studies. On a conflict, read again and review the differences instead of blindly retrying.

There are no shell, arbitrary-file, URL-fetch, source-execution or paid-model tools. Paths are launcher configuration only. Imported claims, notes and source text remain data; instructions embedded in them must not be followed by the connected assistant. Study contents leave the local process only through the connected host, whose own model and data-handling settings apply. Choose study information accordingly.

## First community to second community

1. Ask the assistant to inspect the workspace and list your studies. Create a blank study with `metadata` containing `title`, `location`, `question` and `notes` (the last two may be empty). Use the browser forms if you prefer to enter the first evidence and scenario yourself.
2. Read the saved study. Add source records with claim status, publication/access dates, location, period, units, method and limitations. `replace_evidence` receives the **whole working set**. URLs are references, not fetched or archived documents. Review labels are contributor claims.
3. Add an illustrative scenario using `put_scenario`. `inspect_workspace` returns complete example record shapes. Preserve required units and references; distinguish sourced values from invented assumptions. Supply all required numeric inputs and leave unknown environmental quantities as `null` with basis `unknown`.
4. Run it, change an assumption, run again and compare the two saved run identifiers. Old results keep the evidence and inputs used at calculation time even if drafts change afterward.
5. Adapt the study to a second community with new metadata and a meaningful `rationale`. The tool records the parent study/revision/digest, source scenario, source inputs and evidence. It resets inherited input bases to illustrative/unknown, removes active evidence associations and identifies every inherited input as requiring local review. Source evidence and prior results retain their original context; they are not measurements for the new place.
6. Gather local evidence, edit the adapted assumptions, and inspect the parent context before drawing a conclusion. Export the study for a portable backup or handoff. Import creates a separate study with import lineage, while preserving scenario/evidence/run contents. Use the browser's export download to save the returned bundle without asking the assistant for file access.

A digest can reveal mismatched content; it is not a signature, proof of truth or independent scientific review. Run verification recomputes the installed model. A bundle contains data and model identifiers, not archived source code, runtime, documents behind URLs or every ancestor study's complete contents. Keep the relevant code version and ancestor exports separately when long-term reproducibility requires them. See [the study workspace guide](study-workspace.md) for backups and recovery.

All model limits carry through these tools: annual illustrative screening, no hourly dispatch, batteries, winter reliability, connection feasibility, financing or complete lifecycle accounting. Operating value includes avoided bills and is not necessarily cash available to distribute. Unknown environmental impacts remain unknown. Adapting a study is not national extrapolation, local validation or a claim of free household power.

## Verification

```sh
npm run test:mcp
```

The tests launch the real process with the official SDK client and isolated temporary storage. They exercise both the client's default legacy initialization and auto-negotiated `2026-07-28` protocol. Checks cover tool discovery and annotations, blank creation, evidence and scenario edits, revision conflicts, saved runs and comparisons, adaptation lineage, export/import, restart persistence, tampered runs even after rehashing, unsupported bundles and path-like identifiers. Initialization and failed creation do not write studies; protocol parsing catches stdout contamination. No live AI account is used in these checks.

Study bundles are limited to 8 MiB; the stdio transport allows 10 MiB for a request envelope. Results are emitted once as JSON text, without a duplicate structured representation. JSON string escaping can still expand the wire response, especially for bundles containing many quotes or backslashes. Our test client allows 20 MiB responses; a host with the SDK default 10 MiB buffer or a smaller context limit may need a larger buffer or the UI download/CLI for large bundles. These tests establish protocol and local-service behavior, not successful operation in every AI product. The SDK's [client guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html) describes the client lifecycle used by the tests.
