const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const state = { study: null, dirty: false, conflict: false, busy: false, examples: null, scenarios: [], scenarioIndex: null, evidence: [], scenario: null, runs: [], selectedRun: null, comparison: null, benchmarks: null, evidenceEditId: null, evidenceFormDirty: false, exportText: '', exportName: 'commonweal.json' };
const number = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const groups = [
  { title: 'Generation & annual demand', description: 'Annual totals do not show whether solar and demand coincide. The on-site fraction is an explicit screening assumption.', fields: [
    ['capacity_kwp', 'Installed solar capacity', 'kWp', 0, null, '0.1', 'Nameplate DC capacity.'],
    ['annual_yield_kwh_per_kwp', 'Annual yield', 'kWh/kWp', 0, null, '1', 'Assumed annual generation per kWp.'],
    ['annual_demand_kwh', 'Annual site demand', 'kWh', 0, null, '1', 'Demand within this project’s boundary.'],
    ['onsite_use_fraction', 'On-site use fraction', '0–1', 0, 1, '0.01', 'Share of solar intended for on-site use; capped by annual demand.'],
  ] },
  { title: 'Costs & energy values', description: 'All amounts are NZD in the scenario’s price year. These are screening values, not quotations, financing terms or an investment appraisal.', fields: [
    ['capital_cost_nzd', 'Up-front capital cost', 'NZD', 0, null, '1', 'Shown separately from annual operating results.'],
    ['annual_operating_cost_nzd', 'Annual operating cost', 'NZD/year', 0, null, '1', 'Include the operating costs you intend to screen.'],
    ['import_price_nzd_per_kwh', 'Avoided import price', 'NZD/kWh', 0, null, '0.001', 'Value assigned to displaced on-site grid imports.'],
    ['export_price_nzd_per_kwh', 'Export price', 'NZD/kWh', 0, null, '0.001', 'Assumed value of electricity exported to the grid.'],
  ] },
  { title: 'Who might benefit?', description: 'Proposed shares must add to 1. They divide positive operating value hypothetically. Avoided bills are not necessarily distributable cash; actual renter benefits require ownership and transfer agreements.', fields: [
    ['renter_share', 'Renters', '0–1', 0, 1, '0.01', 'Proposed renter share of positive operating value.'],
    ['other_household_share', 'Other households', '0–1', 0, 1, '0.01', 'Proposed share of positive operating value for other households.'],
    ['community_share', 'Community purposes', '0–1', 0, 1, '0.01', 'Proposed share of positive operating value for community initiatives.'],
  ] },
  { title: 'Environmental & compute inputs', description: 'Optional: leave blank when unknown. A gross on-site displacement proxy is not a net lifecycle climate benefit. Export displacement is excluded.', optional: true, fields: [
    ['displaced_grid_kgco2e_per_kwh', 'Displaced grid factor', 'kgCO₂e/kWh', 0, null, '0.001', 'Assumed displacement factor for on-site use only.'],
    ['embodied_kgco2e', 'Embodied emissions', 'kgCO₂e', 0, null, '1', 'Project lifecycle boundary must be stated in assumptions.'],
    ['annual_compute_kwh', 'Annual compute electricity', 'kWh/year', 0, null, '0.1', 'Measured or estimated compute use within the stated boundary.'],
    ['annual_compute_kgco2e', 'Annual compute emissions', 'kgCO₂e/year', 0, null, '0.1', 'Separate input; not automatically inferred from electricity.'],
    ['annual_water_litres', 'Annual water use', 'L/year', 0, null, '1', 'Scope and method need to accompany any supplied figure.'],
  ] },
];
const metricInfo = {
  generation_kwh: ['Annual solar generation', 'kWh/year', 'Capacity × assumed annual yield.'],
  onsite_kwh: ['Solar used on site', 'kWh/year', 'Annual assumed use, capped by site demand.'],
  export_kwh: ['Solar exported', 'kWh/year', 'Generation remaining after on-site use.'],
  import_kwh: ['Remaining grid imports', 'kWh/year', 'Annual demand not met by assumed on-site solar.'],
  avoided_import_cost_nzd: ['Avoided import cost', 'NZD/year', 'Value assigned to on-site solar.'],
  export_receipts_nzd: ['Export receipts', 'NZD/year', 'Exports × assumed export price.'],
  annual_operating_cost_nzd: ['Annual operating cost', 'NZD/year', 'The supplied annual operating cost.'],
  annual_operating_surplus_nzd: ['Annual operating value (before capital)', 'NZD/year', 'Avoided bills + export receipts − operating costs; not necessarily distributable cash.'],
  capital_cost_nzd: ['Up-front capital cost', 'NZD', 'Not deducted from annual operating value.'],
  annual_funding_gap_nzd: ['Annual operating funding gap', 'NZD/year', 'Additional funding needed when operating costs exceed energy value.'],
};
const environmentInfo = {
  gross_operational_proxy_kgco2e: ['Gross on-site displacement proxy', 'kgCO₂e/year'],
  displaced_grid_kgco2e_per_kwh: ['Assumed displaced grid factor', 'kgCO₂e/kWh'],
  embodied_kgco2e: ['Embodied emissions', 'kgCO₂e'],
  annual_compute_kwh: ['Annual compute electricity', 'kWh/year'],
  annual_compute_kgco2e: ['Annual compute emissions', 'kgCO₂e/year'],
  annual_water_litres: ['Annual water use', 'L/year'],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function readable(value) { return String(value ?? 'unknown').replaceAll('_', ' '); }
function format(value, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Unknown';
  if (unit.startsWith('NZD')) return currency.format(Number(value));
  return number.format(Number(value)) + (unit ? ` ${unit}` : '');
}
function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function setNotice(message) { $('notice').textContent = message; }
function clearError() { $('error').hidden = true; $('error').textContent = ''; }
function showError(error) { $('error').textContent = error instanceof Error ? error.message : String(error); $('error').hidden = false; $('error').focus(); }
function describeError(payload, fallback) {
  const value = payload?.error || payload?.message || fallback;
  const message = typeof value === 'string' ? value : JSON.stringify(value);
  const details = payload?.details || payload?.issues;
  return details ? `${message}\n${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}` : message;
}
async function api(path, body, method = 'POST') {
  const response = await fetch(path, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(describeError(payload, `Request failed (${response.status}).`)); error.status = response.status; throw error; }
  return payload;
}
async function action(button, operation) {
  if (state.busy) return;
  clearError(); state.busy = true;
  const controls = [...document.querySelectorAll('button,input,textarea,select')].filter(control => !control.closest('dialog'));
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  try { await operation(); } catch (error) {
    if (error.status === 409) state.conflict = true;
    showError(error);
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    state.busy = false; renderSaveState(); renderScenarioControls();
  }
}
function appendList(target, values, fallback) {
  target.replaceChildren();
  const list = Array.isArray(values) && values.length ? values : [fallback];
  for (const value of list) target.append(element('li', '', typeof value === 'string' ? value : JSON.stringify(value)));
}
function fillSelect(select, items, selected) {
  select.replaceChildren();
  for (const [value, label] of items) { const option = element('option', '', label); option.value = value; select.append(option); }
  if (selected !== undefined) select.value = String(selected);
}
function renderEvidence() {
  $('evidence-count').textContent = `${state.evidence.length} record${state.evidence.length === 1 ? '' : 's'}`;
  const container = $('evidence-list');
  container.replaceChildren();
  if (!state.evidence.length) container.append(element('p', 'muted', 'No evidence records loaded. Imported assumptions remain assumptions until supported and reviewed.'));
  for (const record of state.evidence) {
    const card = element('article', 'evidence-card');
    const label = element('div', 'evidence-label');
    label.append(element('span', '', readable(record.classification ?? record.status)), element('span', '', readable(record.review_status ?? 'unreviewed')));
    card.append(label, element('h3', '', record.title ?? record.id), element('p', '', record.claim ?? 'No claim supplied.'));
    const source = record.source ?? {};
    const href = safeUrl(source.url);
    if (href) { const link = element('a', 'evidence-source', `${source.title || source.publisher || 'Read source'} ↗`); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
    else card.append(element('span', 'evidence-source muted', source.title || 'No valid public source link supplied'));
    const metadata = element('div', 'evidence-meta');
    metadata.append(element('span', '', `${record.id ?? 'Unidentified'} · v${record.version ?? '?'}`), element('span', '', `Accessed ${source.accessed_at ?? 'unknown'}`));
    if (record.context?.period) metadata.append(element('span', '', `Period: ${record.context.period}`));
    if (record.context?.units) metadata.append(element('span', '', `Units: ${record.context.units}`));
    card.append(metadata);
    const extra = [];
    if (record.context?.method) extra.push(`Method: ${record.context.method}`);
    if (record.context?.location) extra.push(`Location: ${record.context.location}`);
    if (source.published_at) extra.push(`Published: ${source.published_at}`);
    if (source.locator) extra.push(`Source location: ${source.locator}`);
    if (record.rights) extra.push(`Reuse: ${readable(record.rights.status)}. ${record.rights.note ?? ''}`);
    extra.push(...(Array.isArray(record.limitations) ? record.limitations : []));
    if (extra.length) { const details = element('details'); details.append(element('summary', '', 'Provenance & limitations')); const list = element('ul'); appendList(list, extra, 'No further notes.'); details.append(list); card.append(details); }
    const actions = element('div', 'evidence-actions');
    const edit = element('button', 'button secondary', 'Edit evidence'); edit.type = 'button'; edit.addEventListener('click', () => action(edit, async () => openEvidenceForm(record)));
    const remove = element('button', 'button quiet', 'Remove from working evidence'); remove.type = 'button'; remove.addEventListener('click', () => action(remove, () => removeEvidence(record.id)));
    actions.append(edit, remove); card.append(actions); container.append(card);
  }
}

function renderBenchmarks() {
  const target = $('benchmarks');
  const supplied = state.examples?.benchmarks;
  const matching = supplied?.records?.length && supplied.records.every(record => JSON.stringify(state.evidence.find(item => item.id === record.evidence_id)) === JSON.stringify(state.examples.evidence.find(item => item.id === record.evidence_id)));
  const benchmark = matching ? supplied : null;
  target.replaceChildren();
  if (!benchmark?.records?.length) { target.hidden = true; return; }
  target.hidden = false;
  target.append(element('h3', '', 'Reported Ōtaki annual totals'), element('p', 'muted', 'These source-reported figures are separate from the illustrative model. Residuals and on-site shares below are arithmetic derived from those figures, not a validated energy balance or model validation.'));
  const scroll = element('div', 'table-scroll');
  const table = element('table');
  const header = element('thead'); const row = element('tr');
  for (const name of ['Reported period', 'Generation', 'On-site use', 'Derived on-site share', 'Derived residual']) row.append(element('th', '', name));
  header.append(row); table.append(header);
  const body = element('tbody');
  for (const record of benchmark.records) {
    const tr = element('tr');
    const share = record.derived?.onsite_share;
    tr.append(element('td', '', `${record.period_start ?? '?'} to ${record.period_end ?? '?'}`), element('td', '', format(record.generation_kwh_reported, 'kWh')), element('td', '', format(record.onsite_solar_kwh_reported, 'kWh')), element('td', '', share === null || share === undefined ? 'Unknown' : `${number.format(share * 100)}%`), element('td', '', format(record.derived?.residual_kwh, 'kWh')));
    body.append(tr);
  }
  table.append(body); scroll.append(table); target.append(scroll);
  const notes = element('ul', 'context-list');
  const quality = benchmark.records.map(record => `${record.period_start ?? record.id}: ${record.quality_note ?? 'No quality note supplied.'} Source record: ${record.evidence_id ?? 'unknown'}.`);
  appendList(notes, [...quality, ...(benchmark.limitations ?? [])], 'No further notes.'); target.append(notes);
}

function inputRecord(scenario, key) { return scenario.inputs?.[key] ?? null; }
function rawValue(record) { return record && typeof record === 'object' ? record.value : record; }
function provenanceText(record, optional) {
  if (rawValue(record) === null || rawValue(record) === undefined) return optional ? 'Unknown · no value supplied' : 'Missing input';
  const basis = typeof record === 'object' ? record.basis : 'unclassified';
  const refs = typeof record === 'object' && Array.isArray(record.evidence_ids) ? record.evidence_ids : [];
  return `${readable(basis)}${refs.length ? ` · ${refs.join(', ')}` : ' · no evidence link'}`;
}
function renderScenarioControls() {
  const exists = Boolean(state.scenario);
  $('scenario-form').hidden = !exists;
  $('empty-scenarios').hidden = exists;
  for (const id of ['adapt-scenario', 'remove-scenario', 'export-scenario']) $(id).disabled = !exists || state.busy;
}
function renderScenarioOptions() {
  fillSelect($('scenario-select'), state.scenarios.map((scenario, index) => [index, scenario.title || `Scenario ${index + 1}`]), state.scenarioIndex);
  renderScenarioControls();
}
function renderScenario() {
  renderScenarioControls();
  const scenario = state.scenario;
  if (!scenario) return;
  $('scenario-name').value = scenario.title ?? '';
  $('scenario-location').value = scenario.location ?? '';
  $('scenario-year').value = scenario.price_year ?? '';
  const container = $('scenario-fields'); container.replaceChildren();
  for (const group of groups) {
    const fieldset = element('fieldset', 'input-group');
    fieldset.append(element('legend', '', group.title), element('p', 'group-description', group.description));
    const grid = element('div', `input-grid${group.optional ? ' optional-grid' : ''}`);
    for (const [key, title, unit, min, max, step, help] of group.fields) {
      const record = inputRecord(scenario, key);
      const field = element('div', 'field');
      const label = element('label', '', title); label.htmlFor = `input-${key}`;
      const wrapper = element('div', 'input-wrapper');
      const input = element('input'); input.id = `input-${key}`; input.name = key; input.type = 'number'; input.min = String(min); input.step = 'any'; input.required = !group.optional;
      if (max !== null) input.max = String(max);
      input.value = rawValue(record) ?? ''; if (group.optional) input.placeholder = 'Unknown';
      input.setAttribute('aria-describedby', `help-${key} provenance-${key}`);
      wrapper.append(input, element('span', 'unit', unit));
      const helpText = element('p', 'field-help', help); helpText.id = `help-${key}`;
      const provenance = element('p', 'provenance', provenanceText(record, group.optional)); provenance.id = `provenance-${key}`;
      const details = element('details', 'input-evidence'); details.append(element('summary', '', 'Evidence & basis'));
      const basisLabel = element('label', '', `${title}: input basis`); basisLabel.htmlFor = `basis-${key}`;
      const basis = element('select'); basis.id = `basis-${key}`;
      fillSelect(basis, [['illustrative_assumption', 'Illustrative assumption'], ['source_reported', 'Source reported'], ['derived', 'Derived from cited evidence'], ['unknown', 'Unknown (blank optional input)']], record?.basis ?? 'illustrative_assumption');
      const refsLabel = element('label', '', `${title}: supporting evidence`); refsLabel.htmlFor = `refs-${key}`;
      const refs = element('select'); refs.id = `refs-${key}`; refs.multiple = true;
      for (const evidence of state.evidence) { const option = element('option', '', evidence.title); option.value = evidence.id; option.selected = (record?.evidence_ids ?? []).includes(evidence.id); refs.append(option); }
      details.append(basisLabel, basis, refsLabel, refs, element('p', '', state.evidence.length ? 'Select relevant records (Command/Ctrl for several). A citation does not validate this number or its local applicability.' : 'Add an evidence record in the Evidence tab before linking it.'));
      input.addEventListener('input', () => { basis.value = input.value === '' && group.optional ? 'unknown' : 'illustrative_assumption'; for (const option of refs.options) option.selected = false; provenance.textContent = input.value === '' && group.optional ? 'Unknown · no value supplied' : 'Illustrative assumption · edited locally, previous evidence links cleared'; });
      const updateProvenance = () => { provenance.textContent = provenanceText({ value: input.value === '' ? null : Number(input.value), basis: basis.value, evidence_ids: [...refs.selectedOptions].map(option => option.value) }, group.optional); };
      basis.addEventListener('change', updateProvenance); refs.addEventListener('change', updateProvenance);
      field.append(label, wrapper, helpText, provenance, details); grid.append(field);
    }
    fieldset.append(grid); container.append(fieldset);
  }
  $('scenario-assumptions').value = (scenario.assumptions ?? []).join('\n');
  $('scenario-unknowns').value = (scenario.unknowns ?? []).join('\n');
  const lineage = scenario.adaptation ?? scenario.copied_from;
  const target = $('scenario-lineage'); target.replaceChildren(); target.hidden = !lineage;
  if (lineage) {
    target.append(element('h3', '', scenario.adaptation ? 'Adapted assumptions need local review' : 'Copied from a working draft'), element('p', '', `Source: ${lineage.source_title ?? lineage.scenario_id ?? 'prior scenario'} · ${lineage.source_location ?? 'source location not recorded'}. ${lineage.rationale ?? lineage.note ?? ''}`));
    if (scenario.adaptation) target.append(element('p', '', 'Changing a place name or adding a citation does not establish local validation. The saved source inputs, assumptions and unknowns remain in the scenario’s export.'));
    if (lineage.local_evidence_needed?.length) { const list = element('ul'); appendList(list, lineage.local_evidence_needed.map(key => groups.flatMap(group => group.fields).find(field => field[0] === key)?.[1] ?? readable(key)), ''); target.append(element('p', '', 'Inherited inputs to review against the new community:'), list); }
  }
}
function lines(value) { return value.split('\n').map(line => line.trim()).filter(Boolean); }
function canonicalUnit(key, displayUnit) { return { annual_yield_kwh_per_kwp: 'kWh/kWp/year', annual_demand_kwh: 'kWh/year', onsite_use_fraction: 'fraction', renter_share: 'fraction', other_household_share: 'fraction', community_share: 'fraction', displaced_grid_kgco2e_per_kwh: 'kgCO2e/kWh', embodied_kgco2e: 'kgCO2e', annual_compute_kgco2e: 'kgCO2e/year' }[key] || displayUnit; }
function gatherScenario() {
  if (!state.scenario) throw new Error('Create or select a scenario first.');
  const scenario = clone(state.scenario);
  scenario.title = $('scenario-name').value.trim(); scenario.location = $('scenario-location').value.trim(); scenario.price_year = Number($('scenario-year').value);
  scenario.status = 'illustrative'; scenario.assumptions = lines($('scenario-assumptions').value); scenario.unknowns = lines($('scenario-unknowns').value); scenario.inputs ??= {};
  for (const group of groups) for (const [key, , unit] of group.fields) {
    const raw = $(`input-${key}`).value; const value = raw === '' ? null : Number(raw);
    const original = inputRecord(state.scenario, key);
    scenario.inputs[key] = { ...(original ?? {}), value, unit: original?.unit ?? canonicalUnit(key, unit), basis: $(`basis-${key}`).value, evidence_ids: [...$(`refs-${key}`).selectedOptions].map(option => option.value) };
  }
  return scenario;
}
function syncScenario() {
  if (!state.scenario) return;
  state.scenario = gatherScenario(); state.scenarios[state.scenarioIndex] = clone(state.scenario);
}
function selectScenario(index) {
  if (!state.scenarios[index]) { state.scenario = null; state.scenarioIndex = null; renderScenario(); return; }
  state.scenarioIndex = index; state.scenario = clone(state.scenarios[index]); renderScenarioOptions(); renderScenario();
}
function exportJson(data, name) {
  // Keep portable files near the validated canonical size, including at the storage limit.
  state.exportText = JSON.stringify(data, null, data?.schema_version === 'commonweal.study-bundle.v1' ? undefined : 2) + '\n';
  state.exportName = name;
  $('export-json').value = state.exportText;
  $('export-panel').hidden = false;
  $('export-panel').open = true;
  downloadExport();
  setNotice(`Export prepared: ${name}. A copy is also available in the JSON export panel below.`);
}
function downloadExport() {
  const url = URL.createObjectURL(new Blob([state.exportText], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = state.exportName; link.hidden = true; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderRunSelects() {
  const entries = state.runs.map((run, index) => [index, `${index + 1}. ${run.scenario?.title ?? 'Untitled run'} · ${run.run_id.slice(0, 12)}`]);
  fillSelect($('run-select'), entries, state.selectedRun);
  fillSelect($('baseline-select'), entries, Math.max(0, state.runs.length - 2));
  fillSelect($('comparison-select'), entries, state.runs.length - 1);
  $('run-count').textContent = `${state.runs.length} completed run${state.runs.length === 1 ? '' : 's'}`;
  $('empty-results').hidden = state.runs.length > 0;
  $('run-workspace').hidden = state.runs.length === 0;
  $('comparison-workspace').hidden = state.runs.length < 2;
}
function renderRun() {
  const run = state.runs[state.selectedRun];
  if (!run) return;
  $('run-meta').textContent = `Run ${run.run_id} · ${run.model?.id ?? 'unknown model'} v${run.model?.version ?? '?'} · ${run.scenario?.location ?? ''} · NZD ${run.scenario?.price_year ?? 'unknown price year'}`;
  const metrics = run.results?.metrics ?? {};
  $('metrics').replaceChildren();
  const order = ['annual_operating_surplus_nzd', 'capital_cost_nzd', 'annual_funding_gap_nzd', 'generation_kwh', 'onsite_kwh', 'export_kwh', 'import_kwh', 'avoided_import_cost_nzd', 'export_receipts_nzd', 'annual_operating_cost_nzd'];
  for (const key of order) {
    if (!(key in metrics)) continue;
    const [title, unit, description] = metricInfo[key];
    const card = element('div', `metric${key === 'annual_operating_surplus_nzd' ? ' primary-metric' : ''}`);
    card.append(element('div', 'metric-label', title), element('div', 'metric-value', format(metrics[key], unit.startsWith('NZD') ? unit : '')), element('div', 'metric-description', `${unit} · ${description}`));
    $('metrics').append(card);
  }
  const allocations = run.results?.allocation ?? {};
  $('allocation').replaceChildren();
  const total = Object.values(allocations).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  for (const [key, label] of [['renters_nzd', 'Renters'], ['other_households_nzd', 'Other households'], ['community_nzd', 'Community purposes']]) {
    const row = element('div', 'allocation-row');
    const name = element('div', 'allocation-name', label);
    const bar = element('span', 'bar'); bar.style.width = `${total > 0 ? Math.max(0, Math.min(100, Number(allocations[key]) / total * 100)) : 0}%`; name.append(bar);
    row.append(name, element('strong', '', format(allocations[key], 'NZD/year'))); $('allocation').append(row);
  }
  $('environment').replaceChildren();
  const environment = run.results?.environment ?? {};
  for (const [key, value] of Object.entries(environment)) {
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) continue;
    const [label, unit] = environmentInfo[key] ?? [readable(key), key.endsWith('_kgco2e') ? 'kgCO₂e' : ''];
    const row = element('div', 'environment-row');
    const text = typeof value === 'string' || typeof value === 'boolean' ? String(value) : format(value, unit);
    row.append(element('span', '', label), element('strong', value === null ? 'unknown' : '', text)); $('environment').append(row);
  }
  if (!$('environment').childElementCount) $('environment').append(element('p', 'muted', 'Environmental impacts are unknown. No net climate result is established.'));
  const limitations = [...(run.results?.limitations ?? [])];
  if (Array.isArray(environment.limitations)) limitations.push(...environment.limitations);
  appendList($('run-limitations'), limitations, 'This annual model does not establish reliability, network feasibility, investment returns or net lifecycle climate benefit.');
}
async function compareRuns() {
  const baseline = state.runs[Number($('baseline-select').value)];
  const comparison = state.runs[Number($('comparison-select').value)];
  if (baseline === comparison) throw new Error('Choose two different completed runs to compare.');
  const result = await api('/api/compare', { runs: [baseline, comparison] });
  state.comparison = result;
  const container = $('comparison-output'); container.replaceChildren();
  const scroll = element('div', 'table-scroll');
  const table = element('table');
  const caption = element('caption', 'sr-only', `Comparison: ${comparison.scenario.title} minus ${baseline.scenario.title}`); table.append(caption);
  const header = element('thead'); const row = element('tr');
  for (const title of ['Annual / capital measure', 'Baseline', 'Comparison', 'Change']) row.append(element('th', '', title));
  header.append(row); table.append(header);
  const body = element('tbody');
  for (const [key, delta] of Object.entries(result.deltas ?? {})) {
    const [label, unit] = metricInfo[key] ?? [readable(key), key.endsWith('_nzd') ? 'NZD' : ''];
    const valuesA = baseline.results?.metrics ?? {};
    const valuesB = comparison.results?.metrics ?? {};
    const tr = element('tr');
    const difference = format(delta, unit);
    tr.append(element('td', '', label), element('td', '', format(valuesA[key], unit)), element('td', '', format(valuesB[key], unit)), element('td', '', Number(delta) > 0 ? `+${difference}` : difference));
    body.append(tr);
  }
  for (const [group, deltas, details] of [
    ['allocation', result.allocation_deltas, { renters_nzd: ['Proposed renter value', 'NZD/year'], other_households_nzd: ['Proposed other-household value', 'NZD/year'], community_nzd: ['Proposed community value', 'NZD/year'] }],
    ['environment', result.environment_deltas, environmentInfo],
  ]) {
    for (const [key, delta] of Object.entries(deltas ?? {})) {
      const [label, unit] = details[key] ?? [readable(key), ''];
      const tr = element('tr');
      const difference = format(delta, unit);
      tr.append(element('td', '', label), element('td', '', format(baseline.results?.[group]?.[key], unit)), element('td', '', format(comparison.results?.[group]?.[key], unit)), element('td', '', Number(delta) > 0 ? `+${difference}` : difference));
      body.append(tr);
    }
  }
  table.append(body); scroll.append(table); container.append(scroll);
  if (Array.isArray(result.limitations) && result.limitations.length) { const notes = element('ul', 'comparison-notes'); appendList(notes, result.limitations, ''); container.append(notes); }
  const changes = element('details', 'input-changes');
  changes.append(element('summary', '', 'Inspect changed input values'));
  const changedList = element('ul', 'context-list');
  const changedInputs = [];
  const baselineInputs = baseline.scenario.inputs ?? {};
  for (const [key, input] of Object.entries(comparison.scenario.inputs ?? {})) {
    const earlier = baselineInputs[key];
    if (JSON.stringify(earlier) !== JSON.stringify(input)) {
      const title = groups.flatMap(group => group.fields).find(field => field[0] === key)?.[1] ?? readable(key);
      changedInputs.push(`${title}: ${format(earlier?.value, earlier?.unit)} → ${format(input.value, input.unit)}. Basis: ${readable(earlier?.basis)} → ${readable(input.basis)}.`);
    }
  }
  appendList(changedList, changedInputs, 'No numeric input records changed. Compare the full exported records for evidence or metadata differences.');
  changes.append(changedList); container.append(changes);
  const exportButton = element('button', 'button quiet', 'Export comparison'); exportButton.type = 'button'; exportButton.addEventListener('click', () => exportJson(result, 'commonweal-comparison.json')); container.append(exportButton);
  setNotice('Comparison ready. Deltas are comparison minus baseline; examine assumptions before interpreting them.');
}
function parseJson(text, label) {
  try { return JSON.parse(text); } catch { throw new Error(`${label} must be valid JSON. Check commas, quotes and brackets.`); }
}
function attachFileReader(inputId, textId) {
  $(inputId).addEventListener('change', async () => {
    clearError();
    try {
      const file = $(inputId).files[0];
      if (!file) return;
      const isStudyBundle = inputId === 'study-bundle-file';
      const limit = isStudyBundle ? 9 * 1024 * 1024 : 1_000_000;
      if (file.size > limit) throw new Error(isStudyBundle ? 'Study bundle files may be at most 9 MiB (9,437,184 bytes). The server still validates an 8 MiB content limit.' : 'Evidence and scenario JSON files may be at most 1 MB (1,000,000 bytes).');
      $(textId).value = await file.text();
      setNotice(`Loaded ${file.name} into the editor. Review it, then use the import button to apply it.`);
    } catch (error) { showError(error); }
  });
}


function confirmChange(title, message, accept = 'Continue') {
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-accept').textContent = accept;
  const dialog = $('confirm-dialog');
  return new Promise(resolve => {
    function finish(result) { dialog.close(); $('confirm-accept').removeEventListener('click', yes); $('confirm-cancel').removeEventListener('click', no); dialog.removeEventListener('cancel', escape); resolve(result); }
    const yes = () => finish(true); const no = () => finish(false); const escape = event => { event.preventDefault(); finish(false); };
    $('confirm-accept').addEventListener('click', yes); $('confirm-cancel').addEventListener('click', no); dialog.addEventListener('cancel', escape); dialog.showModal(); $('confirm-cancel').focus();
  });
}
function markDirty() { state.dirty = true; renderSaveState(); }
function renderSaveState() {
  if (!state.study) return;
  const pending = state.evidenceFormDirty;
  const target = $('save-state'); target.className = `save-state${state.conflict ? ' conflict' : state.dirty || pending ? ' dirty' : ''}`;
  target.textContent = state.conflict
    ? `Save conflict: revision ${state.study.revision} has changed elsewhere. Your edits remain here. Export working recovery JSON below before discarding and reopening the current saved revision.`
    : pending ? 'Evidence form has unapplied edits. Add/update the record or cancel its edit, then save the study.'
    : state.dirty ? `Unsaved changes · based on revision ${state.study.revision}. Use Save study to keep all drafts, evidence and completed runs on this computer.`
    : `Saved locally · revision ${state.study.revision} · ${new Date(state.study.updated_at).toLocaleString('en-NZ')}. Reopen it from Studies after a reload or server restart.`;
  $('active-study-title').textContent = $('study-title').value || state.study.metadata.title;
  $('save-study').disabled = state.busy || (!state.dirty && !pending);
  $('discard-study').disabled = state.busy || (!state.dirty && !pending && !state.conflict);
}
function requireStudy() { if (!state.study) throw new Error('Create or open a study first.'); }
function requireClean(operation) {
  if (state.dirty || state.evidenceFormDirty || state.conflict) throw new Error(`Save this study, or choose “Discard unsaved changes”, before ${operation}. Your current edits have not been replaced.`);
}
function metadataFromForm(prefix = 'study') {
  return { title: $(`${prefix}-title`).value.trim(), location: $(`${prefix}-location`).value.trim(), question: $(`${prefix}-question`).value.trim(), notes: prefix === 'study' ? $('study-notes').value.trim() : '' };
}
function gatherStudy() { requireStudy(); syncScenario(); return { ...clone(state.study), metadata: metadataFromForm(), scenarios: clone(state.scenarios), evidence: clone(state.evidence), runs: clone(state.runs) }; }
function showTab(name, focus = false) {
  for (const tab of document.querySelectorAll('[data-tab]')) { const selected = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; $(tab.dataset.tab).hidden = !selected; if (selected && focus) tab.focus(); }
}
function showHome() { document.body.classList.remove('study-open'); $('study-home').hidden = false; $('study-workspace').hidden = true; $('export-panel').hidden = true; }
function renderSummary() {
  const target = $('study-summary'); target.replaceChildren();
  for (const label of [`${state.evidence.length} evidence record${state.evidence.length === 1 ? '' : 's'}`, `${state.scenarios.length} draft scenarios`, `${state.runs.length} completed runs`]) target.append(element('span', '', label));
}
function renderStudyLineage() {
  const target = $('study-lineage'); target.replaceChildren(); const lineage = state.study?.lineage ?? []; target.hidden = !lineage.length;
  if (!lineage.length) return;
  target.append(element('h3', '', 'Where this study came from'));
  for (const item of lineage) target.append(element('p', '', `${readable(item.kind)} from “${item.source_title}” (${item.source_location}), study ${item.source_study_id} revision ${item.source_revision}. ${item.rationale}`));
  target.append(element('p', '', 'Parent digests and available scenario source snapshots are preserved in exported records. They identify recorded content; they do not establish that evidence is true or that a project works locally.'));
}
function loadStudy(study) {
  state.study = clone(study); state.dirty = false; state.conflict = false; state.evidenceFormDirty = false; state.evidenceEditId = null;
  state.scenarios = clone(study.scenarios); state.evidence = clone(study.evidence); state.runs = clone(study.runs); state.selectedRun = state.runs.length ? state.runs.length - 1 : null; state.comparison = null;
  state.benchmarks = null;
  for (const key of ['title', 'location', 'question', 'notes']) $(`study-${key}`).value = study.metadata[key] ?? '';
  $('adapt-study-title').value = `${study.metadata.title} — local adaptation`; $('adapt-study-location').value = ''; $('adapt-study-question').value = study.metadata.question ?? ''; $('adapt-study-rationale').value = '';
  $('evidence-form').hidden = true; $('evidence-warnings').textContent = ''; $('comparison-output').replaceChildren(); $('export-panel').hidden = true;
  selectScenario(0); renderScenarioOptions(); renderEvidence(); renderBenchmarks(); renderRunSelects(); renderRun(); renderSummary(); renderStudyLineage(); renderSaveState();
  document.body.classList.add('study-open'); $('study-home').hidden = true; $('study-workspace').hidden = false; showTab('overview');
  setNotice(`Opened “${study.metadata.title}”. Edits become durable when you choose Save study.`);
}
async function refreshStudies() {
  const result = await api('/api/studies'); const target = $('study-list'); target.replaceChildren();
  const studies = result.studies ?? [];
  if (!studies.length) target.append(element('p', 'muted', 'No saved studies yet. Start blank, copy the example, or import a bundle below.'));
  for (const study of studies) {
    const card = element('article', 'study-card'); card.append(element('h3', '', study.metadata.title), element('p', '', study.metadata.location), element('p', '', `Revision ${study.revision} · saved ${new Date(study.updated_at).toLocaleString('en-NZ')}`));
    if (study.metadata.question) card.append(element('p', '', study.metadata.question));
    const button = element('button', 'button secondary', 'Open study'); button.type = 'button'; button.setAttribute('aria-label', `Open study: ${study.metadata.title}`); button.addEventListener('click', () => action(button, async () => { requireClean('opening another study'); const result = await api(`/api/studies/${encodeURIComponent(study.id)}`); loadStudy(result.study); })); card.append(button); target.append(card);
  }
  const problems = result.problems ?? result.errors ?? [];
  $('study-list-errors').textContent = problems.length ? `Some saved studies could not be read. They have not been replaced. See the recovery guide before changing their files. ${problems.map(problem => `${problem.id}: ${problem.error}`).join('; ')}` : '';
}
async function createStudy(example) {
  requireClean('creating a study'); const metadata = metadataFromForm('new-study');
  if (!metadata.title || !metadata.location) throw new Error('Give the study a name and community / location.');
  const result = await api('/api/studies', { metadata, ...(example ? { example: true } : { scenarios: [], evidence: [], runs: [] }) }); loadStudy(result.study);
  setNotice(example ? 'Example copied into a new local study. Ōtaki sources retain their original location; calculator inputs are illustrative and need local evidence.' : 'Blank study created and saved locally. Add evidence or create an illustrative scenario to begin.');
}
async function saveStudy() {
  if (state.evidenceFormDirty) throw new Error('Apply or cancel the evidence form before saving the study.');
  const study = gatherStudy(); const index = state.scenarioIndex;
  const result = await api(`/api/studies/${encodeURIComponent(study.id)}`, { study, expected_revision: state.study.revision }, 'PUT');
  state.study = clone(result.study); state.dirty = false; state.conflict = false;
  state.scenarios = clone(result.study.scenarios); state.evidence = clone(result.study.evidence); state.runs = clone(result.study.runs);
  selectScenario(index ?? 0); renderSummary(); renderSaveState(); setNotice(`Saved “${result.study.metadata.title}” locally at revision ${result.study.revision}. All draft scenarios, evidence and completed runs are included.`);
}
async function exportStudy() {
  requireStudy(); requireClean('exporting a saved study bundle');
  const result = await api(`/api/studies/${encodeURIComponent(state.study.id)}/export`);
  if (result.bundle?.study?.revision !== undefined && result.bundle.study.revision !== state.study.revision) throw new Error('This study changed elsewhere after you opened it. Reopen the latest saved revision before exporting.');
  exportJson(result.bundle, `commonweal-study-${state.study.id}.json`);
}
function assertEvidenceDependencies(evidence) {
  syncScenario(); const ids = new Set(evidence.map(record => record.id));
  for (const scenario of state.scenarios) for (const [key, input] of Object.entries(scenario.inputs ?? {})) for (const id of input.evidence_ids ?? []) if (!ids.has(id)) throw new Error(`Evidence “${id}” is still linked by draft “${scenario.title}” (${readable(key)}). Remove or replace that draft link first. Prior completed runs are preserved.`);
}
function openEvidenceForm(record = null) {
  if (state.evidenceFormDirty) throw new Error('Apply the current evidence form or cancel its edit before opening another record.');
  state.evidenceEditId = record?.id ?? null; state.evidenceFormDirty = false;
  const values = { 'title-input': record?.title ?? '', classification: record?.classification ?? 'source_reported_observation', claim: record?.claim ?? '', url: record?.source?.url ?? '', 'source-title': record?.source?.title ?? '', publisher: record?.source?.publisher ?? '', locator: record?.source?.locator ?? '', published: record?.source?.published_at ?? '', accessed: record?.source?.accessed_at ?? todayLocal(), location: record?.context?.location ?? state.study.metadata.location, period: record?.context?.period ?? '', units: record?.context?.units ?? '', method: record?.context?.method ?? '', limitations: (record?.limitations ?? []).join('\n'), rights: record?.rights?.status ?? 'link_only', 'rights-note': record?.rights?.note ?? 'Link and short attributed paraphrase only. Reuse rights for source data are not established.' };
  for (const [key, value] of Object.entries(values)) $(`evidence-${key}`).value = value;
  $('evidence-form-title').textContent = record ? 'Edit working evidence' : 'Add evidence'; $('save-evidence').textContent = record ? 'Update working evidence' : 'Add to working evidence'; $('evidence-form').hidden = false;
  $('evidence-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => $('evidence-title-input').focus(), 0); renderSaveState();
}
function gatherEvidence() {
  const value = key => $(`evidence-${key}`).value.trim();
  const prior = state.evidence.find(record => record.id === state.evidenceEditId);
  return { ...(prior ? clone(prior) : {}), schema_version: 'commonweal.evidence.v1', id: prior?.id ?? `evidence-${crypto.randomUUID()}`, version: new Date().toISOString(), title: value('title-input'), classification: value('classification'), review_status: 'unreviewed', claim: value('claim'), source: { ...(prior?.source ?? {}), title: value('source-title'), url: value('url'), publisher: value('publisher'), locator: value('locator'), published_at: value('published') || null, accessed_at: value('accessed') }, context: { ...(prior?.context ?? {}), location: value('location'), period: value('period'), units: value('units'), method: value('method') }, limitations: lines(value('limitations')), rights: { status: value('rights'), note: value('rights-note') } };
}
async function removeEvidence(id) {
  if (state.evidenceFormDirty) throw new Error('Apply or cancel the evidence form first.');
  const record = state.evidence.find(item => item.id === id); const next = state.evidence.filter(item => item.id !== id); assertEvidenceDependencies(next);
  if (!await confirmChange('Remove working evidence?', `Remove “${record.title}” from this study’s working evidence? Completed runs retain their original evidence snapshots. Save the study to make this removal durable.`, 'Remove working record')) return;
  state.evidence = next; if (state.evidenceEditId === id) $('evidence-form').hidden = true; state.benchmarks = null; renderEvidence(); renderBenchmarks(); renderScenario(); renderSummary(); markDirty(); setNotice('Working evidence removed. Completed runs are unchanged. Save the study to keep this change.');
}
function newScenario() {
  syncScenario(); const source = clone(state.examples.scenarios[0]);
  source.id = `scenario-${crypto.randomUUID()}`; source.title = `Illustrative scenario ${state.scenarios.length + 1}`; source.location = $('study-location').value.trim() || state.study.metadata.location;
  source.assumptions.unshift('Started with invented no-project defaults for editing. These are not measurements, quotations or verified local forecasts.');
  state.scenarios.push(source); selectScenario(state.scenarios.length - 1); renderSummary(); markDirty(); setNotice('New draft created with illustrative no-project defaults. Replace inputs, state assumptions and link local evidence before interpreting a run.');
}

for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => { clearError(); showTab(tab.dataset.tab); });
  tab.addEventListener('keydown', event => { const tabs = [...document.querySelectorAll('[data-tab]')]; const index = tabs.indexOf(tab); let next; if (event.key === 'ArrowRight') next = (index + 1) % tabs.length; if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1; if (next !== undefined) { event.preventDefault(); showTab(tabs[next].dataset.tab, true); } });
}
for (const key of ['title', 'location', 'question', 'notes']) $(`study-${key}`).addEventListener('input', markDirty);
$('create-study-form').addEventListener('submit', event => { event.preventDefault(); action($('create-blank-study'), () => createStudy(false)); });
$('copy-example-study').addEventListener('click', () => action($('copy-example-study'), () => createStudy(true)));
$('refresh-studies').addEventListener('click', () => action($('refresh-studies'), refreshStudies));
$('back-to-studies').addEventListener('click', () => action($('back-to-studies'), async () => { requireClean('returning to the study list'); await refreshStudies(); showHome(); setNotice('Choose a saved local study, start a new one, or import a portable bundle.'); }));
$('save-study').addEventListener('click', () => action($('save-study'), saveStudy));
$('discard-study').addEventListener('click', () => action($('discard-study'), async () => {
  if (!await confirmChange('Discard unsaved changes?', 'This discards local draft edits, unapplied evidence edits and runs made since the last save, then opens the latest saved revision. Export working recovery JSON first if you need to keep your edits.', 'Discard & reopen')) return;
  const result = await api(`/api/studies/${encodeURIComponent(state.study.id)}`); loadStudy(result.study); setNotice('Unsaved changes discarded. The latest saved study is open.');
}));
for (const id of ['export-study', 'review-export-study']) $(id).addEventListener('click', () => action($(id), exportStudy));
$('import-study').addEventListener('click', () => action($('import-study'), async () => { requireClean('importing a study'); const bundle = parseJson($('study-bundle-json').value, 'Study bundle'); const result = await api('/api/studies/import', { bundle }); loadStudy(result.study); setNotice('Bundle validated and imported as a new local study. Existing studies were not replaced. Content checks do not establish factual truth.'); }));
$('adapt-study-form').addEventListener('submit', event => { event.preventDefault(); action($('adapt-study'), async () => {
  requireClean('adapting to another community'); const metadata = metadataFromForm('adapt-study');
  const result = await api(`/api/studies/${encodeURIComponent(state.study.id)}/adapt`, { expected_revision: state.study.revision, metadata, rationale: $('adapt-study-rationale').value.trim() });
  loadStudy(result.study); setNotice('Adapted study created and saved with parent lineage. Inherited scenario inputs are illustrative and require local evidence; source observations remain in their original context.');
}); });
$('new-evidence').addEventListener('click', () => action($('new-evidence'), async () => openEvidenceForm()));
$('evidence-form').addEventListener('input', () => { state.evidenceFormDirty = true; renderSaveState(); });
$('evidence-form').addEventListener('submit', event => { event.preventDefault(); action($('save-evidence'), async () => {
  const record = gatherEvidence(); const next = state.evidence.filter(item => item.id !== record.id); next.push(record);
  const result = await api('/api/validate-evidence', { evidence: next }); state.evidence = result.evidence; state.evidenceFormDirty = false; state.evidenceEditId = null; $('evidence-form').hidden = true; syncScenario(); renderEvidence(); renderBenchmarks(); renderScenario(); renderSummary(); markDirty();
  setNotice('Evidence added to the working study as unreviewed. Completed runs retain their original snapshots. Save the study to keep this change.');
}); });
$('cancel-evidence').addEventListener('click', () => action($('cancel-evidence'), async () => { if (state.evidenceFormDirty && !await confirmChange('Cancel evidence edit?', 'Discard only the unapplied edits in this evidence form? The study’s current working evidence stays unchanged.', 'Cancel evidence edit')) return; state.evidenceFormDirty = false; state.evidenceEditId = null; $('evidence-form').hidden = true; renderSaveState(); }));
$('scenario-select').addEventListener('change', () => { clearError(); const index = Number($('scenario-select').value); syncScenario(); selectScenario(index); });
$('scenario-form').addEventListener('input', () => { syncScenario(); renderScenarioOptions(); markDirty(); });
$('scenario-form').addEventListener('change', () => { syncScenario(); markDirty(); });
$('new-scenario').addEventListener('click', () => action($('new-scenario'), async () => newScenario()));
$('adapt-scenario').addEventListener('click', () => action($('adapt-scenario'), async () => {
  syncScenario(); const source = clone(state.scenario); const duplicate = clone(source);
  duplicate.id = `scenario-${crypto.randomUUID()}`; duplicate.title = `${source.title} — copy`;
  duplicate.copied_from = { scenario_id: source.id, source_title: source.title, source_location: source.location, source_inputs: clone(source.inputs), source_price_year: source.price_year, source_evidence: clone(state.evidence), source_assumptions: clone(source.assumptions), source_unknowns: clone(source.unknowns), note: 'Copy of working draft; not local validation' };
  state.scenarios.push(duplicate); selectScenario(state.scenarios.length - 1); renderSummary(); markDirty(); setNotice('Draft duplicated with its source inputs and context recorded. For a new community, use “Adapt this study” in Overview after saving.');
}));
$('remove-scenario').addEventListener('click', () => action($('remove-scenario'), async () => { syncScenario(); if (!await confirmChange('Remove this draft scenario?', `Remove “${state.scenario.title}” from working drafts? Completed runs and their input snapshots remain. Save the study to keep the removal.`, 'Remove draft')) return; state.scenarios.splice(state.scenarioIndex, 1); selectScenario(0); renderScenarioOptions(); renderSummary(); markDirty(); setNotice('Draft removed. Completed runs remain available in Results.'); }));
$('scenario-form').addEventListener('submit', event => { event.preventDefault(); action($('run-scenario'), async () => {
  syncScenario(); const run = await api('/api/run', { scenario: state.scenario, evidence: state.evidence });
  const existing = state.runs.findIndex(item => item.run_id === run.run_id);
  if (existing === -1) { state.runs.push(run); state.selectedRun = state.runs.length - 1; markDirty(); } else state.selectedRun = existing;
  renderScenario(); renderRunSelects(); renderRun(); renderSummary(); $('comparison-output').replaceChildren(); state.comparison = null; showTab('results');
  setNotice(existing === -1 ? `Completed reproducible run ${run.run_id.slice(0, 12)}. Save the study to keep it after a reload.` : 'These exact inputs already have a completed run. Its original snapshot is shown.'); $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}); });
$('run-select').addEventListener('change', () => { state.selectedRun = Number($('run-select').value); renderRun(); });
$('compare-runs').addEventListener('click', () => action($('compare-runs'), compareRuns));
for (const id of ['baseline-select', 'comparison-select']) $(id).addEventListener('change', () => { state.comparison = null; $('comparison-output').replaceChildren(); });
$('import-evidence').addEventListener('click', () => action($('import-evidence'), async () => {
  if (state.evidenceFormDirty) throw new Error('Apply or cancel the evidence form first.');
  const imported = parseJson($('evidence-json').value, 'Evidence'); const evidence = Array.isArray(imported) ? imported : imported.evidence;
  if (!Array.isArray(evidence)) throw new Error('Provide an evidence array or an object with an evidence array.');
  const validated = await api('/api/validate-evidence', { evidence }); assertEvidenceDependencies(validated.evidence);
  if (!await confirmChange('Replace working evidence?', `Replace the working set with ${validated.evidence.length} validated records? Completed runs retain their original evidence. Save the study to keep the replacement.`, 'Replace working evidence')) return;
  state.evidence = validated.evidence; state.evidenceEditId = null; state.evidenceFormDirty = false; $('evidence-form').hidden = true; state.benchmarks = null; renderEvidence(); renderBenchmarks(); renderScenario(); renderSummary(); markDirty();
  $('evidence-warnings').textContent = (validated.warnings ?? []).map(warning => typeof warning === 'string' ? warning : JSON.stringify(warning)).join('\n'); setNotice('Working evidence replaced after validation. Prior runs retain their original records. Save the study to keep the change.');
}));
$('import-scenario').addEventListener('click', () => action($('import-scenario'), async () => {
  const imported = parseJson($('scenario-json').value, 'Scenario'); const scenario = imported.scenario ?? imported;
  if (state.scenarios.some(item => item.id === scenario.id)) throw new Error('A draft already uses that scenario ID. Change the imported ID, or duplicate the existing draft instead.');
  await api('/api/run', { scenario, evidence: state.evidence }); syncScenario(); state.scenarios.push(clone(scenario)); selectScenario(state.scenarios.length - 1); renderSummary(); markDirty(); setNotice('Scenario validated and added as a working draft. Save the study to keep it.');
}));
$('export-evidence').addEventListener('click', () => exportJson({ evidence: state.evidence }, 'commonweal-working-evidence.json'));
$('export-scenario').addEventListener('click', () => action($('export-scenario'), async () => { const scenario = gatherScenario(); $('scenario-json').value = JSON.stringify(scenario, null, 2); exportJson(scenario, 'commonweal-working-scenario.json'); }));
$('export-run').addEventListener('click', () => { const run = state.runs[state.selectedRun]; if (run) exportJson(run, `commonweal-run-${run.run_id.slice(0, 12)}.json`); });
$('export-recovery').addEventListener('click', () => action($('export-recovery'), async () => exportJson({ schema_version: 'commonweal.recovery.v1', note: 'Unvalidated working recovery snapshot; not a portable study bundle. Reconcile against the latest saved revision before making a new save.', study: gatherStudy(), unapplied_evidence_form: state.evidenceFormDirty ? gatherEvidence() : null }, `commonweal-recovery-${state.study.id}.json`)));
$('download-export').addEventListener('click', downloadExport);
$('copy-export').addEventListener('click', () => action($('copy-export'), async () => { try { await navigator.clipboard.writeText(state.exportText); setNotice('Export JSON copied to clipboard.'); } catch { $('export-json').focus(); $('export-json').select(); setNotice('JSON selected. Use your browser’s copy command to copy it.'); } }));
attachFileReader('evidence-file', 'evidence-json'); attachFileReader('scenario-file', 'scenario-json'); attachFileReader('study-bundle-file', 'study-bundle-json');
window.addEventListener('beforeunload', event => { if (state.dirty || state.evidenceFormDirty) { event.preventDefault(); event.returnValue = ''; } });

async function start() {
  try { state.examples = await api('/api/examples'); if (!state.examples.scenarios?.length) throw new Error('No example template was returned. Check the example data.'); await refreshStudies(); showHome(); setNotice('Create or open a study. No paid inference or AI subscription is needed to use this workbench.'); }
  catch (error) { showError(error); setNotice('The study workspace could not load. Start the Commonweal local server and reload this page.'); }
}
await start();
