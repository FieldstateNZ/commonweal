# Commonweal

**Public-interest AI for shared wellbeing, environmental recovery, and community solutions that scale.**

Commonweal starts in Aotearoa New Zealand with a long-term purpose: make a **comfortable life independent of paid employment**, with unconditional access to nutritious food, housing, energy, healthcare, connectivity, transport and participation.

People remain free to trade, own businesses, earn, create and work for fulfilment. Leisure is a legitimate choice. Access to essentials should not depend on employment, property ownership, a means test or proving that someone deserves support.

**AI is central to this mission.** Commonweal is a research, design, simulation and delivery initiative that directs AI's reasoning, research, coding and optimisation capabilities toward human wellbeing, clean energy and environmental recovery. Engineering sustainable AI is part of the work.

## Where we are

**A bounded working prototype.** This repository contains a local community-solar workbench, an evidence register, source-reported annual benchmarks, and a deterministic annual screening model with a browser interface, CLI and JSON API. It is an early research tool, not a validated New Zealand energy model or an operational guarantee of essential provision. AI and simulation do not establish that the proposed transition is economically or physically feasible; evidence and practical results must do that.

The ambition is national benefit, with useful replication elsewhere. The work begins with bounded questions that people can test and act on.

## Run the prototype

Requires Node.js 20.11 or newer. There are no package dependencies, API keys or paid inference calls.

```sh
npm test
npm start
```

Open [the local workbench](http://127.0.0.1:4317). Inspect the source records, run the no-solar example, choose a smaller or larger illustrative project, then compare and export the results. Use **Copy & adapt** to change a local assumption. Data lives in browser memory until exported; reloading clears the session.

The example costs, generation assumptions and benefit shares are invented and visibly labelled. Reported Ōtaki totals are a separate arithmetic reconstruction, with uncertainty retained; they do not calibrate those examples. Annual operating value includes avoided bills, which are not necessarily cash available for distribution. Capital and unknown lifecycle impacts remain separate.

See the [prototype guide](docs/prototype.md) for equations, schemas, reproducible CLI commands and API operations. A compatible AI tool can use these local operations; an autonomous research agent and WebMCP adapter are future work.

## How the wider initiative should work

1. People and their compatible AI tools research a question and contribute sourced findings.
2. A durable shared engine retains evidence, uncertainty, assumptions and revision history.
3. Contributors create or adapt project models, simulate alternatives and make trade-offs visible.
4. Communities and relevant experts review candidate designs before practical pilots.
5. Pilots publish measured outcomes, costs, failures and lessons.
6. Other communities adapt the work to their circumstances and contribute improvements.

AI-produced claims enter as contributions to check, not automatically verified evidence. Repeatable calculations and simulation complement AI reasoning. People retain authority over goals, commitments and real-world decisions.

## Start with one useful study

The first study begins a public reconstruction of documented community solar, using [Energise Ōtaki's Power Up Ōtaki](https://www.energiseotaki.nz/power-up-otaki) as a reference, followed by AI-assisted adaptation for another community.

The reference project supplies local facilities and directs proceeds toward community initiatives. It does **not** demonstrate that every household receives free electricity. The current reconstruction is limited to public claims and annual reported energy; no partnership or endorsement is implied.

Read the [community-solar study brief](studies/community-solar/README.md) for the question, missing inputs and review gates.

## Read and contribute

| Document | Purpose |
| --- | --- |
| [Prototype guide](docs/prototype.md) | Run, reproduce, inspect and understand the limits of the working software |
| [Ōtaki evidence and gaps](studies/community-solar/evidence.md) | Source-reported results, forecasts, discrepancies and unavailable inputs |
| [Prospective pilot](docs/pilot-plan.md) | A bounded paid research offer, acceptance criteria and unconfirmed funding routes |
| [Mission and principles](docs/mission.md) | Comfortable living, freedom, stewardship and environmental obligations |
| [Design brief](docs/design-brief.md) | Evidence, reproducible runs, human and AI participation, and scaling |
| [Roadmap](ROADMAP.md) | Stages with concrete outputs and conditions for progressing |
| [Contribution guide](CONTRIBUTING.md) | How to submit evidence, cases, models and corrections |
| [Project case template](templates/project-case.md) | Describe a need, design, delivery constraints and observed results |
| [Evidence record template](templates/evidence-record.md) | Preserve provenance and distinguish evidence from interpretation |
| [Scenario run template](templates/scenario-run.md) | Record assumptions, versions, uncertainty and reproducibility |

Core knowledge and access should remain open. Transparent organisational commissions, stewardship, support and sponsorship may fund maintenance and contributors; funding must not purchase a preferred conclusion. There are no claimed sponsors or revenue commitments.

Affordability includes existing compatible AI access, efficient local and reusable calculations, shared or sponsored access for people without paid AI, and visible compute budgets. Public participation should not require an AI subscription.

## Licence

Newly authored repository content is licensed under [Apache-2.0](LICENSE). Referenced publications, datasets, software and names retain their own rights and terms; linking to them does not relicense them or imply endorsement.
