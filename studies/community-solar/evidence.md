# Ōtaki evidence account

Status: public-source reconstruction, accessed 28 September 2026. These are source reports and arithmetic checks, not independently audited meter readings or project accounts. No named organisation is a Commonweal partner or endorser.

## What has been reconstructed

The [project owner](https://www.energiseotaki.nz/power-up-otaki) describes solar supplying the wastewater treatment plant and Ōtaki College, exporting excess electricity and directing proceeds to community initiatives. It reports peak capacities of 107 kWp and 23 kWp. These are separate sites; a combined funding figure must not be assigned wholly to the wastewater array.

The machine-readable [evidence register](../../data/evidence/otaki.json) contains nine records with claims, classification, version, source, dates, locator, context, limits and rights. `source_checked` means the cited public account was inspected. It does not assert independent validation, community approval or engineering review. The register links to source material; it does not relicense publications under Apache-2.0.

The [benchmark input](../../data/benchmarks/otaki-annual.json) records three reported periods for the wastewater site. The CLI `examples` operation and UI show these independently of the invented model scenarios.

| Reported period | Generation (kWh) | Onsite solar use (kWh) | Derived onsite share | Derived residual (kWh) | Quality boundary |
| --- | ---: | ---: | ---: | ---: | --- |
| September 2020–June 2021 | 80,246 | Unknown | Unknown | Unknown | Partial period; exact onsite-use boundary unresolved; not annualised |
| July 2023–June 2024 | 142,193.71 | 98,841.52 | 69.51% | 43,352.19 | Report says a previous calculation error was corrected |
| July 2024–June 2025 | 138,252.58 | 95,886.20 | 69.36% | 42,366.38 | April and May 2025 production estimated after a meter malfunction |

Sources: Kāpiti Coast District Council [2020/21 annual-report summary, printed p. 7](https://www.kapiticoast.govt.nz/media/2a3kl3qj/annual-report-2020-21-summary.pdf), [2023/24 emissions inventory, pp. 12–13](https://www.kapiticoast.govt.nz/media/jgqe3vkb/toit%C5%AB-carbon-reduce-ghg-emissions-inventory-report-2023-24.pdf), and [2024/25 emissions inventory, p. 13](https://www.kapiticoast.govt.nz/media/oc3a3gzf/toit%C5%AB-carbon-reduce-ghg-emissions-inventory-report-2024_25.pdf).

The onsite share is reported onsite use divided by reported generation. The residual is their difference. **Residual is not measured export**: source definitions, losses and meter boundaries must be reconciled. The partial year is not comparable to a full year. Rounded statements about the plant's electricity coverage cannot establish a demand profile. No interval series or independent calibration/evaluation dataset has been reconstructed.

## Claims that must remain distinct

- **Forecast versus realised income.** The contractor's [May 2020 announcement](https://infratec.co.nz/news/infratec-to-deliver-ground-breaking-community-energy-project/) describes a NZ$407,000 grant for the combined project and forecasts NZ$25,000–30,000 annual income. The [Ara Ake participant case study](https://www.araake.co.nz/project/community-energy-how-to-guide) reports a different forecast: at least NZ$23,000 annual revenue and roughly 18-year simple payback. Neither establishes realised net cash, current costs or transferable investment returns. Do not average these accounts or insert them as current quotes.
- **Commissioning versus opening.** KCDC reports September 2020 commissioning at the wastewater site. Ara Ake's account describes October 2020 for the two sites and also refers to operation in 2021. Infratec records a [30 September 2020 opening](https://infratec.co.nz/projects/community-solar-farm-otaki/). Record the discrepancy; an opening event is not automatically the technical commissioning date.
- **Community fund versus household provision.** The owner identifies [2024 grant recipients](https://www.energiseotaki.nz/post/whakahiko-fund-2024), but this does not establish award amounts or universal household benefits. Its [current Whakahiko Fund page](https://www.energiseotaki.nz/whakahiko-fund) says the fund is on hold in 2026 and retains an older 2025 note. The reason and financial implications have not been established. A pause is not evidence of project insolvency.

## Inputs still needed for a practical adaptation

| Missing information | Why it matters |
| --- | --- |
| Permissioned generation, load and import/export intervals with meter boundaries | Match generation and demand; reconcile reported residuals and estimated months |
| Site-specific capacity, commissioning and asset records | Resolve documentary discrepancies and separate the two sites |
| Contracts, tariffs, connection approvals and export constraints | Establish who earns or avoids what, network feasibility and curtailment |
| Final capital costs, GST treatment, grants, maintenance and replacement | Reconstruct project cash flows without treating forecasts as accounts |
| Fund receipts, distributions, governance and pause explanation | Trace actual benefits and operating status without inferring from publicity |
| Beneficiary and ownership/transfer arrangements, including renters | Establish how benefits reach people rather than assuming asset ownership implies access |
| Materials, embodied impacts, water, land, ecosystems and compute measurements | Assess lifecycle effects without replacing missing measurements with zero |

The illustrative annual model does not resolve these gaps. It assumes an onsite fraction, keeps capital separate and reports hypothetical shares of positive operating value. Avoided bills are not necessarily distributable cash. It does not establish winter reliability, network feasibility, investment returns or net climate benefit.

## Reuse and next research step

Use existing methods before building a broader simulator. [EECA's commercial-scale solar study](https://www.eeca.govt.nz/assets/EECA-Resources/Research-papers-guides/Commercial-scale-solar-in-New-Zealand.pdf) illustrates time-matched demand/generation and discounted cash-flow analysis. Its historical prices and assumptions are not current local quotes; rights in referenced underlying datasets require separate checks.

The [published New Zealand community-energy modelling research](https://pmc.ncbi.nlm.nih.gov/articles/PMC12054559/) is a useful related-work reference. Its CC BY-NC-ND terms must not be treated as permission to adapt its model or supplementary content into this Apache-licensed repository. No such material has been copied here.

A useful next step is a permissioned data reconciliation with the asset owner and a willing second community, reviewed by practitioners and affected participants. The [prospective pilot](../../docs/pilot-plan.md) describes scope and acceptance criteria; willingness, access, funding and paid demand remain unconfirmed.
