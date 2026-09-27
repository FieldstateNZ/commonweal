const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const state = { scenarios: [], evidence: [], scenario: null, runs: [], selectedRun: null, comparison: null, benchmarks: null, exportText: '', exportName: 'commonweal.json' };
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
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(describeError(payload, `Request failed (${response.status}).`));
  return payload;
}
async function action(button, operation) {
  clearError();
  button.disabled = true;
  try { await operation(); } catch (error) { showError(error); } finally { button.disabled = false; }
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
    card.append(metadata);
    const extra = [];
    if (record.context?.method) extra.push(`Method: ${record.context.method}`);
    if (record.context?.location) extra.push(`Location: ${record.context.location}`);
    if (source.published_at) extra.push(`Published: ${source.published_at}`);
    if (source.locator) extra.push(`Source location: ${source.locator}`);
    if (record.rights) extra.push(`Reuse: ${readable(record.rights.status)}. ${record.rights.note ?? ''}`);
    extra.push(...(Array.isArray(record.limitations) ? record.limitations : []));
    if (extra.length) { const details = element('details'); details.append(element('summary', '', 'Provenance & limitations')); const list = element('ul'); appendList(list, extra, 'No further notes.'); details.append(list); card.append(details); }
    container.append(card);
  }
}

function renderBenchmarks() {
  const target = $('benchmarks');
  const benchmark = state.benchmarks;
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
function renderScenario() {
  const scenario = state.scenario;
  if (!scenario) return;
  $('scenario-name').value = scenario.title ?? '';
  $('scenario-location').value = scenario.location ?? '';
  $('scenario-year').value = scenario.price_year ?? '';
  const container = $('scenario-fields');
  container.replaceChildren();
  for (const group of groups) {
    const fieldset = element('fieldset', 'input-group');
    fieldset.append(element('legend', '', group.title), element('p', 'group-description', group.description));
    const grid = element('div', `input-grid${group.optional ? ' optional-grid' : ''}`);
    for (const [key, title, unit, min, max, step, help] of group.fields) {
      const field = element('div', 'field');
      const label = element('label', '', title); label.htmlFor = `input-${key}`;
      const wrapper = element('div', 'input-wrapper');
      const input = element('input'); input.id = `input-${key}`; input.name = key; input.type = 'number'; input.min = String(min); input.step = 'any'; input.required = !group.optional;
      if (max !== null) input.max = String(max);
      input.value = rawValue(inputRecord(scenario, key)) ?? '';
      if (group.optional) input.placeholder = 'Unknown';
      input.setAttribute('aria-describedby', `help-${key} provenance-${key}`);
      input.addEventListener('input', () => { $(`provenance-${key}`).textContent = input.value === '' && group.optional ? 'Unknown · no value supplied' : 'Illustrative assumption · edited locally, previous evidence links cleared'; });
      wrapper.append(input, element('span', 'unit', unit));
      const helpText = element('p', 'field-help', help); helpText.id = `help-${key}`;
      const provenance = element('p', 'provenance', provenanceText(inputRecord(scenario, key), group.optional)); provenance.id = `provenance-${key}`;
      field.append(label, wrapper, helpText, provenance); grid.append(field);
    }
    fieldset.append(grid); container.append(fieldset);
  }
  appendList($('assumptions'), scenario.assumptions, 'No explicit scenario assumptions supplied. Check model boundaries before relying on results.');
  appendList($('unknowns'), scenario.unknowns, 'No unknowns recorded; this does not establish that none exist.');
}
function gatherScenario() {
  if (!state.scenario) throw new Error('Load a scenario first.');
  const scenario = clone(state.scenario);
  scenario.title = $('scenario-name').value.trim();
  scenario.location = $('scenario-location').value.trim();
  scenario.price_year = Number($('scenario-year').value);
  scenario.status = 'illustrative';
  scenario.inputs ??= {};
  for (const group of groups) for (const [key, , unit] of group.fields) {
    const raw = $(`input-${key}`).value;
    const value = raw === '' ? null : Number(raw);
    const original = inputRecord(state.scenario, key);
    const oldValue = rawValue(original) ?? null;
    if (value !== oldValue || original === undefined || original === null) {
      const oldUnit = original && typeof original === 'object' ? original.unit : null;
      const canonicalUnit = { annual_yield_kwh_per_kwp: 'kWh/kWp/year', annual_demand_kwh: 'kWh/year', onsite_use_fraction: 'fraction', renter_share: 'fraction', other_household_share: 'fraction', community_share: 'fraction', displaced_grid_kgco2e_per_kwh: 'kgCO2e/kWh', embodied_kgco2e: 'kgCO2e', annual_compute_kgco2e: 'kgCO2e/year' }[key] || unit;
      scenario.inputs[key] = { value, unit: oldUnit || canonicalUnit, basis: value === null ? 'unknown' : 'illustrative_assumption', evidence_ids: [] };
    }
  }
  return scenario;
}
function selectScenario(index) {
  if (!state.scenarios[index]) return;
  state.scenario = clone(state.scenarios[index]);
  renderScenario();
  setNotice(`Loaded “${state.scenario.title}”. Example inputs are illustrative; inspect their provenance before running.`);
}
function exportJson(data, name) {
  state.exportText = JSON.stringify(data, null, 2) + '\n';
  state.exportName = name;
  $('export-json').value = state.exportText;
  $('export-panel').hidden = false;
  $('export-panel').open = true;
  downloadExport();
  setNotice(`Export prepared: ${name}. A copy is also available in the JSON export panel below.`);
}
function downloadExport() {
  const url = URL.createObjectURL(new Blob([state.exportText], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = state.exportName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderRunSelects() {
  const entries = state.runs.map((run, index) => [index, `${index + 1}. ${run.scenario?.title ?? 'Untitled run'} · ${run.run_id.slice(0, 12)}`]);
  fillSelect($('run-select'), entries, state.selectedRun);
  fillSelect($('baseline-select'), entries, Math.max(0, state.runs.length - 2));
  fillSelect($('comparison-select'), entries, state.runs.length - 1);
  $('run-count').textContent = `${state.runs.length} saved run${state.runs.length === 1 ? '' : 's'}`;
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
  if (baseline === comparison) throw new Error('Choose two different saved runs to compare.');
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
      if (file.size > 1_000_000) throw new Error('Please use a JSON file smaller than 1 MB for this local prototype.');
      $(textId).value = await file.text();
      setNotice(`Loaded ${file.name} into the editor. Review it, then use the import button to apply it.`);
    } catch (error) { showError(error); }
  });
}

$('scenario-select').addEventListener('change', () => { clearError(); selectScenario(Number($('scenario-select').value)); });
$('adapt-scenario').addEventListener('click', () => action($('adapt-scenario'), async () => {
  state.scenario = gatherScenario();
  state.scenario.title = `${state.scenario.title} — adaptation`;
  if (state.scenario.id) state.scenario.id = `${state.scenario.id}-adapted`;
  renderScenario(); $('scenario-name').focus();
  setNotice('Created an editable adaptation in this session. Replace local assumptions and scope before interpreting its results.');
}));
$('scenario-form').addEventListener('submit', (event) => {
  event.preventDefault();
  action($('run-scenario'), async () => {
    const scenario = gatherScenario();
    const run = await api('/api/run', { scenario, evidence: state.evidence });
    state.scenario = clone(scenario);
    state.runs.push(run); state.selectedRun = state.runs.length - 1;
    renderScenario(); renderRunSelects(); renderRun();
    $('comparison-output').replaceChildren(); state.comparison = null;
    setNotice(`Saved reproducible run ${run.run_id.slice(0, 12)}. Change an assumption and run again to compare.`);
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
$('run-select').addEventListener('change', () => { state.selectedRun = Number($('run-select').value); renderRun(); });
$('compare-runs').addEventListener('click', () => action($('compare-runs'), compareRuns));
for (const id of ['baseline-select', 'comparison-select']) $(id).addEventListener('change', () => { state.comparison = null; $('comparison-output').replaceChildren(); });
$('import-evidence').addEventListener('click', () => action($('import-evidence'), async () => {
  const imported = parseJson($('evidence-json').value, 'Evidence');
  const evidence = Array.isArray(imported) ? imported : imported.evidence;
  if (!Array.isArray(evidence)) throw new Error('Provide an evidence array or an object with an evidence array.');
  const validated = await api('/api/validate-evidence', { evidence });
  if (!Array.isArray(validated.evidence)) throw new Error('The server did not return a validated evidence array.');
  state.evidence = validated.evidence; state.benchmarks = null; renderEvidence(); renderBenchmarks();
  $('evidence-warnings').textContent = (validated.warnings ?? []).map((warning) => typeof warning === 'string' ? warning : JSON.stringify(warning)).join('\n');
  setNotice(`Replaced the working evidence set with ${state.evidence.length} validated records. Existing runs retain their original evidence. Bundled reported totals are hidden after replacement; reload to restore the examples.`);
}));
$('import-scenario').addEventListener('click', () => action($('import-scenario'), async () => {
  const imported = parseJson($('scenario-json').value, 'Scenario');
  const scenario = imported.scenario ?? imported;
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario) || !scenario.inputs || typeof scenario.inputs !== 'object') throw new Error('Provide a scenario object containing an inputs object.');
  state.scenario = clone(scenario); renderScenario();
  $('scenario-select').selectedIndex = -1;
  setNotice('Imported scenario loaded into the editor. The server will validate its inputs and evidence references when you run it.');
}));
$('export-evidence').addEventListener('click', () => exportJson({ evidence: state.evidence }, 'commonweal-evidence.json'));
$('export-scenario').addEventListener('click', () => action($('export-scenario'), async () => { const scenario = gatherScenario(); $('scenario-json').value = JSON.stringify(scenario, null, 2); exportJson(scenario, 'commonweal-scenario.json'); }));
$('export-run').addEventListener('click', () => { const run = state.runs[state.selectedRun]; if (run) exportJson(run, `commonweal-run-${run.run_id.slice(0, 12)}.json`); });
$('export-session').addEventListener('click', () => action($('export-session'), async () => exportJson({ schema_version: 'commonweal.session.v1', scenario: gatherScenario(), evidence: state.evidence, reported_benchmarks: state.benchmarks, runs: state.runs, comparison: state.comparison, note: 'Local research session. Illustrative annual screening; not observed project outcomes.' }, 'commonweal-session.json')));
$('download-export').addEventListener('click', downloadExport);
$('copy-export').addEventListener('click', () => action($('copy-export'), async () => {
  try { await navigator.clipboard.writeText(state.exportText); setNotice('Export JSON copied to clipboard.'); }
  catch { $('export-json').focus(); $('export-json').select(); setNotice('JSON selected. Use your browser’s copy command to copy it.'); }
}));
attachFileReader('evidence-file', 'evidence-json'); attachFileReader('scenario-file', 'scenario-json');

async function start() {
  try {
    const examples = await api('/api/examples');
    state.scenarios = examples.scenarios ?? [];
    state.evidence = examples.evidence ?? [];
    if (!state.scenarios.length) throw new Error('No example scenarios were returned. Check the local server and example data.');
    fillSelect($('scenario-select'), state.scenarios.map((scenario, index) => [index, scenario.title ?? `Scenario ${index + 1}`]), 0);
    selectScenario(0); renderEvidence(); state.benchmarks = examples.benchmarks ?? null; renderBenchmarks();
  } catch (error) { showError(error); setNotice('The workbench could not load. Start the Commonweal local server and reload this page.'); }
}
await start();
