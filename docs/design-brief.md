# Design brief

Status: wider design with an initial local prototype, 28 September 2026. The [prototype guide](prototype.md) describes the implemented annual model, evidence import, saved run records, comparison, CLI and API. Durable shared storage, review workflows, optimisation and pilot delivery remain proposed.

## The shared loop

Research → evidence review → project model → scenario comparison → reviewed pilot → measured outcomes → adaptation.

People and their AI tools contribute to a durable shared body of work. A project connects its need, evidence, designs, assumptions, model versions, decisions, delivery tasks and outcomes. Revisions retain provenance so another community can understand what changed and why.

Start with one useful case and the simplest suitable calculations. Existing spreadsheets or domain models may answer the question. A large simulation platform is not a prerequisite for learning from the first study.

## Evidence and model records

Every consequential claim should identify its source, source date, access date, method, location, population or system boundary, units, assumptions, uncertainty and reuse rights. Distinguish observation, reported information, estimate, model output, hypothesis and AI-generated interpretation.

Use stable record identifiers and version history. Contributions progress from proposed to reviewed, disputed or superseded with reasons and reviewer scope. “Reviewed” describes a recorded check, not universal truth. Missing information remains missing rather than becoming zero or a confident invented input.

A model states its purpose, equations or rules, dependencies, applicability, validation evidence and limits. Calibration data and independent evaluation data should be distinguished. Human expertise is necessary when deciding whether a model is appropriate for engineering, investment or policy.

## Reproducible scenarios and optimisation

The intended saved-run format should pin model and input versions, evidence references, assumptions, units, code and dependency versions, random seeds where relevant, execution settings and outputs. The initial prototype retains model identity/version, full scenario and evidence snapshots, results and a content hash; archive the repository commit and runtime separately, as described in the [prototype guide](prototype.md). Record enough instructions to repeat the work. AI model/provider identifiers, prompts or suitably redacted summaries, and relevant tool outputs document AI contributions without claiming deterministic AI responses.

Separate verification of calculations from validation against real observations. Compare a baseline and alternatives, explore sensitivity and uncertainty, and record failed or infeasible runs. Deterministic replay is valuable evidence of repeatability, not proof that the model describes society.

Optimisation must expose its objectives, constraints, distributional effects and trade-offs. Include physical capacity, essential workers, finance, maintenance and environmental limits. Show alternatives rather than quietly choosing social priorities through a single score. Expert and community review precedes practical reliance.

## Human and AI participation

An ordinary interface and structured engine actions should reach the same records and permissions:

| Proposed action | Result |
| --- | --- |
| Import evidence | A sourced contribution awaiting the appropriate review |
| Copy or adapt a project | A new local version retaining lineage and reuse conditions |
| Update assumptions | A reviewable revision with units, rationale and consequences |
| Run a scenario | A versioned run with its resource budget and reproducibility record |
| Compare scenarios | Visible differences in inputs, outcomes, uncertainty and coverage |
| Contribute outcomes | Observations linked to a pilot and its original expectations |

Keep these operations independently usable through APIs and appropriate connectors. The prototype implements a subset: evidence format checking, scenario editing, deterministic runs, comparison and export. Its [operation manifest](../src/records.mjs) describes available local endpoints. Shared permissions, a durable revision graph, resource metering and outcome contributions remain proposed.

WebMCP is a possible browser adapter. Its [draft specification](https://webmachinelearning.github.io/webmcp/) and [Chrome documentation](https://developer.chrome.com/docs/ai/webmcp) describe tools exposed by web applications to compatible agents; support is evolving. It is not inference, free compute or a guarantee that every AI subscription can connect. Engine operations must remain useful without this adapter.

Design for compatible existing AI access, small/local computations, cached or reusable results, and shared or sponsored access. Show anticipated and actual compute expenditure and resource use, with budgets before large runs. Do not require participants to disclose credentials or private AI conversations.

## Scaling is three different questions

1. **Enlarge a project at its current site:** what limits capacity, delivery and access?
2. **Replicate in another community:** which assumptions, institutions and physical conditions change?
3. **Assess many projects together:** what happens to networks, prices, labour, materials, funding and distribution?

For solar, include demand and weather, asset ownership, finance, storage and network capacity, workers and materials, access for renters, and changing export values. National effects cannot be inferred by multiplying one successful project's savings by population.

Keep household outcomes, project finances, wider public costs and environmental effects separate to avoid double counting. A community surplus and unconditional household provision are different outcomes.

## Sustainable AI and delivery

AI helps research evidence, write and check models, propose designs, explore alternatives and prepare delivery work. Record where it helped and where reviewers corrected it. Its energy, emissions, water and materials belong inside the assessment, with explicit gaps when measurement is unavailable.

Test efficient models, reusable calculations, appropriate local execution and flexible compute scheduling where practical. Add clean-energy capacity and environmental recovery to candidate designs. The [IEA's discussion of AI for energy optimisation](https://www.iea.org/reports/energy-and-ai/ai-for-energy-optimisation-and-innovation) is a research starting point, not validation of a Commonweal proposal.

Pilots need a responsible decision-maker, community agreement, relevant expert review, resourcing, measurement and conditions for stopping or revising work. Publishing a model does not authorise construction, spending or changes to services.

## Reuse without overbuilding

Potential reuse includes deterministic event histories and replay, evidence and decision artifacts, comparison interfaces, local workflows and later multi-organisation infrastructure. Existing software patterns must be reviewed for rights, fitness and actual maturity before adoption.

Simulation mechanics do not supply validated economic, environmental or social models. Integrate only what the first useful case requires. Selecting a full technology stack or combining an existing portfolio is not an initial milestone.
