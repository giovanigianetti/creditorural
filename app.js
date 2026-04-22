
const DATA = window.DASHBOARD_DATA;
const BRAZIL_NAME = "Brasil";
const TOPONAME = "states";
const TOPO_URL = "br-states-topo.json";

const DIMENSION_META = {
  total: { title: "Total", key: "total" },
  nomeIf: { title: "Instituição financeira", key: "nomeIf", filterId: "ifFilter" },
  programa: { title: "Programa", key: "programa", filterId: "programFilter" },
  subprograma: { title: "Subprograma", key: "subprograma", filterId: "subprogramFilter" },
  finalidade: { title: "Finalidade", key: "finalidade", filterId: "finalidadeFilter" },
  atividade: { title: "Atividade", key: "atividade", filterId: "atividadeFilter" },
};

const COLORS = {
  reference: "#0b5cab",
  benchmark: "#2a9d8f",
  brasil: "#8e44ad",
  grid: "#d8e1ee",
  muted: "#5b6b87",
  highlight: "#d94841",
};

const state = {
  metric: "valor",
  countMode: "contratos",
  dimension: "programa",
  benchmark: "ambos",
  mapMetric: "valor",
  territoryLevel: "uf",
  selectedTerritory: DATA.meta.defaultUf,
  selectedLabel: null,
};

const controls = {};
let summaryTable = null;
let rawTable = null;
let topojsonData = null;
let geojsonUF = null;
const ufToRegion = new Map();
const ufNameToSigla = new Map();

function $(id){ return document.getElementById(id); }
function normalizeText(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function formatBRL(v){
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL", maximumFractionDigits:2}).format(v);
}
function formatInt(v){
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", {maximumFractionDigits:0}).format(v);
}
function formatPct(v, digits=1){
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {minimumFractionDigits:digits, maximumFractionDigits:digits}).format(v)}%`;
}
function formatPP(v){
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}).format(v)} p.p.`;
}
function pct(num, den){
  if (!den || !Number.isFinite(num) || !Number.isFinite(den)) return 0;
  return (num / den) * 100;
}
function safeRel(a,b){
  if (!b || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return ((a / b) - 1) * 100;
}
function showLoading(flag){
  $("loadingOverlay").classList.toggle("hidden", !flag);
}
function slugify(s){
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function currentMetricLabel(){
  return state.metric === "valor" ? "Valor de crédito" : "Contratos";
}
function getValueAtMetricRow(i, metric = state.metric){
  return metric === "valor" ? Number(DATA.cols.valor[i] || 0) : Number(DATA.cols.contratos[i] || 0);
}
function getDimValue(dim, code){
  return DATA.dims[dim]?.[code] ?? "";
}
function getSelectedMultiValues(selectId, allValues){
  const values = controls[selectId]?.getValue(true) || [];
  if (!values || values.length === 0 || values.length === allValues.length) return null;
  return new Set(Array.isArray(values) ? values : [values]);
}
function setAllSelected(selectId, values){
  controls[selectId].removeActiveItems();
  controls[selectId].setChoiceByValue(values);
}
function getAllLabelValues(){
  return state.dimension === "total" ? ["Total"] : DATA.dims[state.dimension];
}
function getLabelNameByRow(i){
  return state.dimension === "total" ? "Total" : DATA.dims[state.dimension][DATA.cols[state.dimension][i]];
}
function getLabelNameByCode(code){
  return state.dimension === "total" ? "Total" : DATA.dims[state.dimension][code];
}
function getTerritoryOptions(level){
  if (level === "uf") return DATA.dims.uf;
  if (level === "regiao") return DATA.dims.regiao;
  return [BRAZIL_NAME];
}
function getTerritoryFilterLabel(level){
  return level === "uf" ? "UF de referência" : level === "regiao" ? "Macrorregião de referência" : "Unidade de referência";
}
function getParentRegionByUf(uf){
  return ufToRegion.get(uf) || null;
}
function getParentBenchmarkName(){
  if (state.territoryLevel === "uf") return getParentRegionByUf(state.selectedTerritory);
  return null;
}
function createNativeMultiSelectAdapter(select){
  return {
    destroy(){},
    getValue(raw){
      const values = [...select.options].filter(opt => opt.selected).map(opt => opt.value);
      return raw ? values : values.map(value => ({ value }));
    },
    removeActiveItems(){
      [...select.options].forEach(opt => { opt.selected = false; });
    },
    setChoiceByValue(values){
      const selected = new Set(Array.isArray(values) ? values : [values]);
      [...select.options].forEach(opt => { opt.selected = selected.has(opt.value); });
    }
  };
}
function buildOptions(selectId, values, selectedValues, placeholder){
  const select = $(selectId);
  select.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (selectedValues && selectedValues.includes(v)) opt.selected = true;
    select.appendChild(opt);
  });
  if (controls[selectId] && controls[selectId].destroy) controls[selectId].destroy();
  if (window.Choices) {
    controls[selectId] = new Choices(select, {
      removeItemButton: true,
      shouldSort: false,
      placeholder: !!placeholder,
      placeholderValue: placeholder || "",
      searchResultLimit: 50,
      renderChoiceLimit: 500,
      itemSelectText: "",
    });
  } else {
    if (placeholder) select.setAttribute("title", placeholder);
    controls[selectId] = createNativeMultiSelectAdapter(select);
  }
}
function buildSingleSelect(selectId, values, selectedValue){
  const select = $(selectId);
  select.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (v === selectedValue) opt.selected = true;
    select.appendChild(opt);
  });
}
function initMappings(){
  for (let i = 0; i < DATA.cols.uf.length; i++) {
    const uf = DATA.dims.uf[DATA.cols.uf[i]];
    const reg = DATA.dims.regiao[DATA.cols.regiao[i]];
    const sigla = DATA.cols.ufSigla[i];
    if (!ufToRegion.has(uf)) ufToRegion.set(uf, reg);
    if (sigla && !ufNameToSigla.has(normalizeText(uf))) ufNameToSigla.set(normalizeText(uf), sigla);
  }
}
function resolveTopoObject(topoData){
  if (!topoData || !topoData.objects) return null;
  if (topoData.objects[TOPONAME]) return topoData.objects[TOPONAME];
  if (topoData.objects.estados) return topoData.objects.estados;
  const values = Object.values(topoData.objects);
  return values.length ? values[0] : null;
}
function enrichGeojsonFeatures(geojson){
  if (!geojson || !Array.isArray(geojson.features)) return geojson;
  geojson.features.forEach(feature => {
    const props = feature.properties || (feature.properties = {});
    const rawName = props.nome || props.name || props.NOME_UF || props.uf || "";
    const sigla = props.sigla || props.SIGLA_UF || ufNameToSigla.get(normalizeText(rawName)) || "";
    if (sigla) props.sigla = sigla;
  });
  return geojson;
}
function initDom(){
  buildOptions("listaMmaFilter", DATA.dims.listaMma, DATA.dims.listaMma, "Selecione o(s) recorte(s) Lista MMA");
  buildOptions("yearFilter", DATA.dims.ano, DATA.dims.ano, "Selecione o(s) ano(s)");
  buildOptions("ifFilter", DATA.dims.nomeIf, DATA.dims.nomeIf, "Todas as instituições");
  buildOptions("programFilter", DATA.dims.programa, DATA.dims.programa, "Todos os programas");
  buildOptions("subprogramFilter", DATA.dims.subprograma, DATA.dims.subprograma, "Todos os subprogramas");
  buildOptions("finalidadeFilter", DATA.dims.finalidade, DATA.dims.finalidade, "Todas as finalidades");
  buildOptions("atividadeFilter", DATA.dims.atividade, DATA.dims.atividade, "Todas as atividades");
  buildSingleSelect("territoryFilter", getTerritoryOptions(state.territoryLevel), state.selectedTerritory);
  $("territoryFilterLabel").textContent = getTerritoryFilterLabel(state.territoryLevel);
  $("territoryLevelSelector").value = state.territoryLevel;
  $("metricSelector").value = state.metric;
  $("countModeSelector").value = "contratos";
  $("dimensionSelector").value = state.dimension;
  $("benchmarkSelector").value = state.benchmark;
  $("mapMetricSelector").value = state.mapMetric;
  buildLabelFocusOptions();
  updateBenchmarkControl();
  bindEvents();
  initTables();
}
function buildLabelFocusOptions(){
  const labels = getAllLabelValues();
  const select = $("highlightLabelSelector");
  select.innerHTML = "";
  labels.forEach(label => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    if ((state.selectedLabel == null && label === labels[0]) || label === state.selectedLabel) opt.selected = true;
    select.appendChild(opt);
  });
  if (state.selectedLabel == null || !labels.includes(state.selectedLabel)) state.selectedLabel = labels[0] || null;
}
function bindEvents(){
  ["listaMmaFilter","yearFilter","ifFilter","programFilter","subprogramFilter","finalidadeFilter","atividadeFilter"].forEach(id => {
    $(id).addEventListener("change", refreshDashboard);
  });
  $("territoryLevelSelector").addEventListener("change", () => {
    state.territoryLevel = $("territoryLevelSelector").value;
    const options = getTerritoryOptions(state.territoryLevel);
    if (!options.includes(state.selectedTerritory)) state.selectedTerritory = options[0];
    buildSingleSelect("territoryFilter", options, state.selectedTerritory);
    $("territoryFilterLabel").textContent = getTerritoryFilterLabel(state.territoryLevel);
    updateBenchmarkControl();
    refreshDashboard();
  });
  $("territoryFilter").addEventListener("change", () => {
    state.selectedTerritory = $("territoryFilter").value;
    refreshDashboard();
  });
  $("metricSelector").addEventListener("change", () => { state.metric = $("metricSelector").value; refreshDashboard(); });
  $("dimensionSelector").addEventListener("change", () => {
    state.dimension = $("dimensionSelector").value;
    buildLabelFocusOptions();
    refreshDashboard();
  });
  $("benchmarkSelector").addEventListener("change", () => { state.benchmark = $("benchmarkSelector").value; refreshDashboard(); });
  $("mapMetricSelector").addEventListener("change", () => { state.mapMetric = $("mapMetricSelector").value; refreshDashboard(); });
  $("highlightLabelSelector").addEventListener("change", () => { state.selectedLabel = $("highlightLabelSelector").value; refreshDashboard(); });

  $("selectAllListaMma").addEventListener("click", (e) => { e.preventDefault(); setAllSelected("listaMmaFilter", DATA.dims.listaMma); refreshDashboard(); });
  $("clearListaMma").addEventListener("click", (e) => { e.preventDefault(); controls.listaMmaFilter.removeActiveItems(); refreshDashboard(); });
  $("selectAllYears").addEventListener("click", (e) => { e.preventDefault(); setAllSelected("yearFilter", DATA.dims.ano); refreshDashboard(); });
  $("clearYears").addEventListener("click", (e) => { e.preventDefault(); controls.yearFilter.removeActiveItems(); refreshDashboard(); });

  $("clearAllFilters").addEventListener("click", (e) => {
    e.preventDefault();
    setAllSelected("listaMmaFilter", DATA.dims.listaMma);
    setAllSelected("yearFilter", DATA.dims.ano);
    setAllSelected("ifFilter", DATA.dims.nomeIf);
    setAllSelected("programFilter", DATA.dims.programa);
    setAllSelected("subprogramFilter", DATA.dims.subprograma);
    setAllSelected("finalidadeFilter", DATA.dims.finalidade);
    setAllSelected("atividadeFilter", DATA.dims.atividade);
    state.metric = "valor";
    state.dimension = "programa";
    state.benchmark = "ambos";
    state.mapMetric = "valor";
    state.territoryLevel = "uf";
    state.selectedTerritory = DATA.meta.defaultUf;
    $("territoryLevelSelector").value = state.territoryLevel;
    buildSingleSelect("territoryFilter", getTerritoryOptions(state.territoryLevel), state.selectedTerritory);
    $("territoryFilterLabel").textContent = getTerritoryFilterLabel(state.territoryLevel);
    $("metricSelector").value = state.metric;
    $("dimensionSelector").value = state.dimension;
    $("benchmarkSelector").value = state.benchmark;
    $("mapMetricSelector").value = state.mapMetric;
    buildLabelFocusOptions();
    updateBenchmarkControl();
    refreshDashboard();
  });

  $("exportFilteredData").addEventListener("click", exportFilteredData);
  $("exportSummaryCsv").addEventListener("click", () => summaryTable.download("csv", `tabela_analitica_${slugify(state.selectedTerritory)}.csv`));
  $("exportSummaryXlsx").addEventListener("click", () => summaryTable.download("xlsx", `tabela_analitica_${slugify(state.selectedTerritory)}.xlsx`, {sheetName: "Tabela Analítica"}));
}
function updateBenchmarkControl(){
  const el = $("benchmarkSelector");
  if (state.territoryLevel === "uf") {
    el.disabled = false;
    if (!["ambos","regiao","brasil"].includes(state.benchmark)) state.benchmark = "ambos";
  } else {
    el.disabled = true;
    state.benchmark = "brasil";
    el.value = "brasil";
  }
}
function createHtmlTableAdapter(containerId){
  const container = $(containerId.replace("#", ""));
  const adapter = {
    columns: [],
    data: [],
    setColumns(columns){
      this.columns = columns || [];
      this.render();
    },
    setData(data){
      this.data = data || [];
      this.render();
    },
    render(){
      const cols = this.columns || [];
      const rows = this.data || [];
      if (!cols.length) {
        container.innerHTML = '<div class="chart-fallback">Sem dados para exibir.</div>';
        return;
      }
      const head = `<thead><tr>${cols.map(col => `<th>${col.title || ''}</th>`).join('')}</tr></thead>`;
      const bodyRows = rows.length ? rows.map(row => `<tr>${cols.map(col => {
        const value = row[col.field];
        let rendered = value ?? '';
        if (typeof col.formatter === 'function') {
          rendered = col.formatter({ getValue: () => value });
        }
        return `<td>${rendered ?? ''}</td>`;
      }).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}">Sem dados para exibir.</td></tr>`;
      container.innerHTML = `<div class="table-fallback-wrap"><table class="table-fallback">${head}<tbody>${bodyRows}</tbody></table></div>`;
    },
    download(type, filename){
      const cols = this.columns || [];
      const rows = this.data || [];
      const header = cols.map(col => `"${String(col.title || '').replace(/"/g, '""')}"`).join(',');
      const body = rows.map(row => cols.map(col => `"${String(row[col.field] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const csv = [header, body].filter(Boolean).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };
  return adapter;
}
function initTables(){
  if (window.Tabulator) {
    summaryTable = new Tabulator("#summaryTable", {
      layout: "fitColumns",
      height: 560,
      data: [],
      columns: [],
      placeholder: "Sem dados para exibir.",
    });
    rawTable = new Tabulator("#rawTable", {
      layout: "fitDataStretch",
      height: 560,
      data: [],
      columns: [],
      placeholder: "Sem dados para exibir.",
    });
  } else {
    summaryTable = createHtmlTableAdapter("summaryTable");
    rawTable = createHtmlTableAdapter("rawTable");
  }
}
function getFilterSets(){
  return {
    listaMma: getSelectedMultiValues("listaMmaFilter", DATA.dims.listaMma),
    ano: getSelectedMultiValues("yearFilter", DATA.dims.ano),
    nomeIf: getSelectedMultiValues("ifFilter", DATA.dims.nomeIf),
    programa: getSelectedMultiValues("programFilter", DATA.dims.programa),
    subprograma: getSelectedMultiValues("subprogramFilter", DATA.dims.subprograma),
    finalidade: getSelectedMultiValues("finalidadeFilter", DATA.dims.finalidade),
    atividade: getSelectedMultiValues("atividadeFilter", DATA.dims.atividade),
  };
}
function getReferencePredicate(){
  if (state.territoryLevel === "uf") return i => DATA.dims.uf[DATA.cols.uf[i]] === state.selectedTerritory;
  if (state.territoryLevel === "regiao") return i => DATA.dims.regiao[DATA.cols.regiao[i]] === state.selectedTerritory;
  return () => true;
}
function getParentPredicate(){
  if (state.territoryLevel === "uf") {
    const parent = getParentRegionByUf(state.selectedTerritory);
    return parent ? (i => DATA.dims.regiao[DATA.cols.regiao[i]] === parent) : null;
  }
  return null;
}
function passesFilterSet(set, value){
  return !set || set.has(value);
}
function getBaseFilteredIndices(){
  const sets = getFilterSets();
  const out = [];
  const n = DATA.cols.uf.length;
  for (let i = 0; i < n; i++) {
    if (!passesFilterSet(sets.listaMma, DATA.dims.listaMma[DATA.cols.listaMma[i]])) continue;
    if (!passesFilterSet(sets.ano, DATA.dims.ano[DATA.cols.ano[i]])) continue;
    if (!passesFilterSet(sets.nomeIf, DATA.dims.nomeIf[DATA.cols.nomeIf[i]])) continue;
    if (!passesFilterSet(sets.programa, DATA.dims.programa[DATA.cols.programa[i]])) continue;
    if (!passesFilterSet(sets.subprograma, DATA.dims.subprograma[DATA.cols.subprograma[i]])) continue;
    if (!passesFilterSet(sets.finalidade, DATA.dims.finalidade[DATA.cols.finalidade[i]])) continue;
    if (!passesFilterSet(sets.atividade, DATA.dims.atividade[DATA.cols.atividade[i]])) continue;
    out.push(i);
  }
  return out;
}
function aggregateBy(indices, keyFn, metric = state.metric){
  const map = new Map();
  for (const i of indices) {
    const key = keyFn(i);
    const curr = map.get(key) || 0;
    map.set(key, curr + getValueAtMetricRow(i, metric));
  }
  return map;
}
function sumMetric(indices, metric = state.metric){
  let total = 0;
  for (const i of indices) total += getValueAtMetricRow(i, metric);
  return total;
}
function intersectByPredicate(indices, predicate){
  if (!predicate) return [];
  const out = [];
  for (const i of indices) if (predicate(i)) out.push(i);
  return out;
}
function buildContext(baseIndices){
  const referencePredicate = getReferencePredicate();
  const parentPredicate = getParentPredicate();
  const referenceIndices = intersectByPredicate(baseIndices, referencePredicate);
  const parentIndices = intersectByPredicate(baseIndices, parentPredicate);
  const brasilIndices = baseIndices;
  const referenceName = state.selectedTerritory;
  const referenceLevelLabel = state.territoryLevel === "uf" ? "UF" : state.territoryLevel === "regiao" ? "Macrorregião" : "Brasil";
  const parentName = state.territoryLevel === "uf" ? getParentRegionByUf(state.selectedTerritory) : null;

  const totalReferenceValue = sumMetric(referenceIndices, "valor");
  const totalReferenceContracts = sumMetric(referenceIndices, "contratos");
  const totalBrasilValue = sumMetric(brasilIndices, "valor");
  const totalBrasilContracts = sumMetric(brasilIndices, "contratos");
  const totalParentValue = sumMetric(parentIndices, "valor");
  const totalParentContracts = sumMetric(parentIndices, "contratos");

  return {
    baseIndices,
    referenceIndices,
    parentIndices,
    brasilIndices,
    referenceName,
    referenceLevelLabel,
    parentName,
    referencePredicate,
    parentPredicate,
    totals: {
      reference: { valor: totalReferenceValue, contratos: totalReferenceContracts },
      parent: { valor: totalParentValue, contratos: totalParentContracts },
      brasil: { valor: totalBrasilValue, contratos: totalBrasilContracts },
    }
  };
}
function toSortedRows(map){
  return [...map.entries()].map(([label, value]) => ({label, value})).sort((a,b) => b.value - a.value);
}
function getTopLabelsForHeatmap(ctx, limit = 15){
  if (state.dimension === "total") return ["Total"];
  const baseAgg = aggregateBy(ctx.brasilIndices, i => getLabelNameByRow(i), state.metric);
  return toSortedRows(baseAgg).slice(0, limit).map(d => d.label);
}
function buildSummaryRows(ctx){
  const refAgg = aggregateBy(ctx.referenceIndices, i => getLabelNameByRow(i), state.metric);
  const refAggValue = aggregateBy(ctx.referenceIndices, i => getLabelNameByRow(i), "valor");
  const refAggContracts = aggregateBy(ctx.referenceIndices, i => getLabelNameByRow(i), "contratos");
  const parentAgg = aggregateBy(ctx.parentIndices, i => getLabelNameByRow(i), state.metric);
  const brasilAgg = aggregateBy(ctx.brasilIndices, i => getLabelNameByRow(i), state.metric);
  const labels = Array.from(new Set([...refAgg.keys(), ...parentAgg.keys(), ...brasilAgg.keys()]));
  const rows = labels.map(label => {
    const ref = refAgg.get(label) || 0;
    const reg = parentAgg.get(label) || 0;
    const bra = brasilAgg.get(label) || 0;
    const refShare = pct(ref, ctx.totals.reference[state.metric]);
    const regShare = pct(reg, ctx.totals.parent[state.metric]);
    const braShare = pct(bra, ctx.totals.brasil[state.metric]);
    return {
      label,
      valor_credito: refAggValue.get(label) || 0,
      contratos: refAggContracts.get(label) || 0,
      metrica_referencia: ref,
      share_referencia: refShare,
      benchmark: reg,
      share_benchmark: regShare,
      brasil: bra,
      share_brasil: braShare,
      diff_benchmark_pp: ctx.parentName ? (refShare - regShare) : null,
      diff_brasil_pp: refShare - braShare,
      rel_benchmark_pct: ctx.parentName ? safeRel(refShare, regShare) : null,
      rel_brasil_pct: safeRel(refShare, braShare),
    };
  }).sort((a,b) => b.metrica_referencia - a.metrica_referencia);
  return rows;
}
function buildKpis(ctx, summaryRows){
  const currentMetric = state.metric;
  const kpis = [
    {
      label: `${currentMetric === "valor" ? "Valor total" : "Contratos"} • ${ctx.referenceName}`,
      value: currentMetric === "valor" ? formatBRL(ctx.totals.reference.valor) : formatInt(ctx.totals.reference.contratos),
      foot: `${formatInt(ctx.referenceIndices.length)} linhas agregadas filtradas`
    },
    {
      label: "Participação no Brasil",
      value: formatPct(pct(ctx.totals.reference[currentMetric], ctx.totals.brasil[currentMetric])),
      foot: currentMetric === "valor"
        ? `${formatBRL(ctx.totals.reference.valor)} de ${formatBRL(ctx.totals.brasil.valor)}`
        : `${formatInt(ctx.totals.reference.contratos)} de ${formatInt(ctx.totals.brasil.contratos)}`
    },
    {
      label: ctx.parentName ? `Participação em ${ctx.parentName}` : "Participação no benchmark",
      value: ctx.parentName ? formatPct(pct(ctx.totals.reference[currentMetric], ctx.totals.parent[currentMetric])) : "—",
      foot: ctx.parentName ? "Apenas para referência em nível UF" : "Benchmark regional não se aplica"
    },
    {
      label: "Categorias ativas",
      value: formatInt(summaryRows.length),
      foot: `Dimensão: ${DIMENSION_META[state.dimension].title}`
    },
    {
      label: "Filtro Lista MMA",
      value: formatInt((controls.listaMmaFilter.getValue(true) || []).length),
      foot: "Combinações ativas do recorte global"
    },
    {
      label: "Cobertura temporal",
      value: `${(controls.yearFilter.getValue(true) || []).length} ano(s)`,
      foot: DATA.meta.hasMonthly ? "Com filtro mensal ativo" : "Sem abertura mensal na base"
    },
  ];
  $("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-foot">${k.foot}</div>
    </div>
  `).join("");
}
function updateHeader(ctx){
  $("headerTitle").textContent = `${ctx.referenceName} • ${DIMENSION_META[state.dimension].title}`;
  const years = controls.yearFilter.getValue(true) || [];
  const lista = controls.listaMmaFilter.getValue(true) || [];
  $("headerSubtitle").textContent = `${ctx.referenceLevelLabel} de referência • ${years.length} ano(s) selecionado(s) • ${lista.length} recorte(s) Lista MMA • métrica principal: ${currentMetricLabel().toLowerCase()}.`;
}
function renderMap(ctx){
  if (!geojsonUF || !Array.isArray(geojsonUF.features) || !geojsonUF.features.length) {
    $("mapChart").innerHTML = `<div class="chart-fallback">Não foi possível carregar a camada cartográfica das UFs. Os demais painéis continuam funcionais.</div>`;
    return;
  }
  const aggValue = aggregateBy(ctx.brasilIndices, i => DATA.cols.ufSigla[i], "valor");
  const aggContracts = aggregateBy(ctx.brasilIndices, i => DATA.cols.ufSigla[i], "contratos");
  const locations = [];
  const z = [];
  const text = [];
  const labelMap = new Map();
  for (let i = 0; i < DATA.cols.uf.length; i++) {
    labelMap.set(DATA.cols.ufSigla[i], DATA.dims.uf[DATA.cols.uf[i]]);
  }
  [...labelMap.entries()].sort((a,b) => a[1].localeCompare(b[1], "pt-BR")).forEach(([sigla, ufName]) => {
    if (!sigla) return;
    const value = aggValue.get(sigla) || 0;
    const contracts = aggContracts.get(sigla) || 0;
    let metricValue = value;
    if (state.mapMetric === "contratos") metricValue = contracts;
    if (state.mapMetric === "participacao_brasil_valor") metricValue = pct(value, ctx.totals.brasil.valor);
    if (state.mapMetric === "participacao_brasil_contratos") metricValue = pct(contracts, ctx.totals.brasil.contratos);
    locations.push(sigla);
    z.push(metricValue);
    text.push(`${ufName}<br>Valor: ${formatBRL(value)}<br>Contratos: ${formatInt(contracts)}`);
  });

  const hovertemplate = state.mapMetric.includes("participacao")
    ? "%{text}<br>Métrica do mapa: %{z:.2f}%<extra></extra>"
    : state.mapMetric === "valor"
      ? "%{text}<br>Métrica do mapa: %{z:$,.2f}<extra></extra>"
      : "%{text}<br>Métrica do mapa: %{z:,.0f}<extra></extra>";

  const trace = {
    type: "choropleth",
    geojson: geojsonUF,
    locations,
    z,
    featureidkey: "properties.sigla",
    colorscale: "Blues",
    marker: {line: {color: "#ffffff", width: 0.8}},
    hovertemplate,
    text,
    colorbar: {title: state.mapMetric.includes("participacao") ? "%" : state.mapMetric === "valor" ? "R$" : "Contratos"}
  };
  const layout = {
    margin: {l:0,r:0,t:10,b:0},
    geo: {
      scope: "south america",
      fitbounds: "locations",
      showcountries: false,
      showcoastlines: false,
      showframe: false,
      bgcolor: "rgba(0,0,0,0)"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
  };
  Plotly.newPlot("mapChart", [trace], layout, {displayModeBar:false, responsive:true});
  const mapEl = $("mapChart");
  mapEl.on("plotly_click", ev => {
    const sigla = ev.points?.[0]?.location;
    if (!sigla || state.territoryLevel !== "uf") return;
    const idx = DATA.cols.ufSigla.findIndex(s => s === sigla);
    if (idx >= 0) {
      state.selectedTerritory = DATA.dims.uf[DATA.cols.uf[idx]];
      buildSingleSelect("territoryFilter", getTerritoryOptions(state.territoryLevel), state.selectedTerritory);
      refreshDashboard();
    }
  });
}
function renderRanking(ctx){
  const agg = aggregateBy(ctx.brasilIndices, i => DATA.dims.uf[DATA.cols.uf[i]], state.metric);
  const rows = toSortedRows(agg).slice(0, 27).reverse();
  Plotly.newPlot("rankingChart", [{
    type: "bar",
    orientation: "h",
    x: rows.map(d => d.value),
    y: rows.map(d => d.label),
    marker: {color: rows.map(d => d.label === state.selectedTerritory ? COLORS.highlight : COLORS.reference)},
    hovertemplate: "%{y}<br>%{x}<extra></extra>",
  }], {
    margin:{l:130,r:20,t:10,b:40},
    xaxis:{gridcolor:COLORS.grid},
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
  }, {displayModeBar:false, responsive:true});
}
function renderComposition(ctx, summaryRows){
  const rows = summaryRows.slice(0, 15);
  const traces = [{
    type: "bar",
    name: ctx.referenceName,
    x: rows.map(r => r.label),
    y: rows.map(r => r.share_referencia),
    marker: {color: COLORS.reference},
  }];
  if (ctx.parentName && ["ambos","regiao"].includes(state.benchmark)) {
    traces.push({
      type: "bar",
      name: ctx.parentName,
      x: rows.map(r => r.label),
      y: rows.map(r => r.share_benchmark),
      marker: {color: COLORS.benchmark},
    });
  }
  if (state.benchmark !== "regiao") {
    traces.push({
      type: "bar",
      name: BRAZIL_NAME,
      x: rows.map(r => r.label),
      y: rows.map(r => r.share_brasil),
      marker: {color: COLORS.brasil},
    });
  }
  Plotly.newPlot("compositionChart", traces, {
    barmode: "group",
    margin:{l:60,r:20,t:10,b:170},
    yaxis:{title:"Share interno (%)", gridcolor:COLORS.grid},
    xaxis:{tickangle:-35},
    legend:{orientation:"h", y:1.12},
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
  }, {displayModeBar:false, responsive:true});
}
function renderRepresentativity(ctx, summaryRows){
  const rows = summaryRows.slice(0, 15);
  const traces = [];
  if (ctx.parentName) {
    traces.push({
      type: "bar",
      name: `Dentro de ${ctx.parentName}`,
      x: rows.map(r => r.label),
      y: rows.map(r => pct(r.metrica_referencia, r.benchmark)),
      marker: {color: COLORS.benchmark},
    });
  }
  traces.push({
    type: "bar",
    name: "Dentro do Brasil",
    x: rows.map(r => r.label),
    y: rows.map(r => pct(r.metrica_referencia, r.brasil)),
    marker: {color: COLORS.brasil},
  });
  Plotly.newPlot("representativityChart", traces, {
    barmode: "group",
    margin:{l:60,r:20,t:10,b:170},
    yaxis:{title:"Participação do território (%)", gridcolor:COLORS.grid},
    xaxis:{tickangle:-35},
    legend:{orientation:"h", y:1.12},
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
  }, {displayModeBar:false, responsive:true});
}
function renderHeatmap(ctx){
  const labels = getTopLabelsForHeatmap(ctx, 15);
  const ufs = DATA.dims.uf;
  const z = ufs.map(uf => {
    const ufIndices = ctx.brasilIndices.filter(i => DATA.dims.uf[DATA.cols.uf[i]] === uf);
    const totalUf = sumMetric(ufIndices, state.metric);
    const agg = aggregateBy(ufIndices, i => getLabelNameByRow(i), state.metric);
    return labels.map(label => pct(agg.get(label) || 0, totalUf));
  });
  Plotly.newPlot("heatmapChart", [{
    type: "heatmap",
    x: labels,
    y: ufs,
    z,
    colorscale: "Blues",
    hovertemplate: "%{y}<br>%{x}<br>%{z:.2f}%<extra></extra>",
  }], {
    margin:{l:120,r:20,t:10,b:150},
    xaxis:{tickangle:-35},
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
  }, {displayModeBar:false, responsive:true});
}
function renderLabelRanking(ctx){
  const target = state.selectedLabel || getAllLabelValues()[0];
  const agg = new Map();
  for (const i of ctx.brasilIndices) {
    const uf = DATA.dims.uf[DATA.cols.uf[i]];
    const label = getLabelNameByRow(i);
    if (label !== target) continue;
    agg.set(uf, (agg.get(uf) || 0) + getValueAtMetricRow(i, state.metric));
  }
  const rows = toSortedRows(agg).slice(0, 27).reverse();
  Plotly.newPlot("labelRankingChart", [{
    type:"bar",
    orientation:"h",
    x: rows.map(d => d.value),
    y: rows.map(d => d.label),
    marker: {color: rows.map(d => d.label === state.selectedTerritory ? COLORS.highlight : COLORS.reference)},
    hovertemplate: "%{y}<br>%{x}<extra></extra>",
  }], {
    margin:{l:130,r:20,t:10,b:40},
    xaxis:{gridcolor:COLORS.grid},
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
  }, {displayModeBar:false, responsive:true});
}
function updateSummaryTable(summaryRows, ctx){
  const data = summaryRows.map(r => ({
    label: r.label,
    valor_credito: r.valor_credito,
    contratos: r.contratos,
    metrica_referencia: r.metrica_referencia,
    share_referencia: r.share_referencia,
    benchmark: r.benchmark,
    share_benchmark: r.share_benchmark,
    brasil: r.brasil,
    share_brasil: r.share_brasil,
    diff_benchmark_pp: r.diff_benchmark_pp,
    diff_brasil_pp: r.diff_brasil_pp,
    rel_benchmark_pct: r.rel_benchmark_pct,
    rel_brasil_pct: r.rel_brasil_pct,
  }));
  summaryTable.setColumns([
    {title: DIMENSION_META[state.dimension].title, field: "label", minWidth: 240},
    {title: "Valor (R$)", field: "valor_credito", hozAlign:"right", formatter: c => formatBRL(c.getValue())},
    {title: "Contratos", field: "contratos", hozAlign:"right", formatter: c => formatInt(c.getValue())},
    {title: `${ctx.referenceName} (${currentMetricLabel()})`, field: "metrica_referencia", hozAlign:"right", formatter: c => state.metric === "valor" ? formatBRL(c.getValue()) : formatInt(c.getValue())},
    {title: `${ctx.referenceName} share`, field: "share_referencia", hozAlign:"right", formatter: c => formatPct(c.getValue())},
    {title: ctx.parentName || "Benchmark", field: "benchmark", hozAlign:"right", formatter: c => state.metric === "valor" ? formatBRL(c.getValue()) : formatInt(c.getValue())},
    {title: "Benchmark share", field: "share_benchmark", hozAlign:"right", formatter: c => formatPct(c.getValue())},
    {title: "Brasil", field: "brasil", hozAlign:"right", formatter: c => state.metric === "valor" ? formatBRL(c.getValue()) : formatInt(c.getValue())},
    {title: "Brasil share", field: "share_brasil", hozAlign:"right", formatter: c => formatPct(c.getValue())},
    {title: "Dif. benchmark (p.p.)", field: "diff_benchmark_pp", hozAlign:"right", formatter: c => formatPP(c.getValue())},
    {title: "Dif. Brasil (p.p.)", field: "diff_brasil_pp", hozAlign:"right", formatter: c => formatPP(c.getValue())},
  ]);
  summaryTable.setData(data);
}
function reconstructRow(i){
  return {
    uf: DATA.dims.uf[DATA.cols.uf[i]],
    regiao: DATA.dims.regiao[DATA.cols.regiao[i]],
    ano: DATA.dims.ano[DATA.cols.ano[i]],
    nome_if: DATA.dims.nomeIf[DATA.cols.nomeIf[i]],
    nome_programa: DATA.dims.programa[DATA.cols.programa[i]],
    nome_subprograma: DATA.dims.subprograma[DATA.cols.subprograma[i]],
    finalidade: DATA.dims.finalidade[DATA.cols.finalidade[i]],
    atividade: DATA.dims.atividade[DATA.cols.atividade[i]],
    modalidade: DATA.dims.modalidade[DATA.cols.modalidade[i]],
    produto: DATA.dims.produto[DATA.cols.produto[i]],
    lista_mma: DATA.dims.listaMma[DATA.cols.listaMma[i]],
    contratos: DATA.cols.contratos[i],
    vl_parc_credito: DATA.cols.valor[i],
  };
}
function updateRawTable(ctx){
  const rows = ctx.referenceIndices.slice(0, 500).map(reconstructRow);
  rawTable.setColumns([
    {title:"UF", field:"uf", width:80},
    {title:"Macrorregião", field:"regiao", width:130},
    {title:"Ano", field:"ano", width:80},
    {title:"Lista MMA", field:"lista_mma", width:180},
    {title:"Instituição financeira", field:"nome_if", width:220},
    {title:"Programa", field:"nome_programa", width:220},
    {title:"Subprograma", field:"nome_subprograma", width:240},
    {title:"Finalidade", field:"finalidade", width:120},
    {title:"Atividade", field:"atividade", width:120},
    {title:"Modalidade", field:"modalidade", width:220},
    {title:"Produto", field:"produto", width:180},
    {title:"Contratos", field:"contratos", hozAlign:"right", formatter: c => formatInt(c.getValue())},
    {title:"Valor (R$)", field:"vl_parc_credito", hozAlign:"right", formatter: c => formatBRL(c.getValue())},
  ]);
  rawTable.setData(rows);
}
function renderValidation(ctx){
  const cards = [
    {
      title: "Estrutura da base",
      text: `Base agregada por UF. ${formatInt(DATA.validation.inputRows)} linhas lidas; ${formatInt(DATA.validation.keptRows)} linhas válidas mantidas para análise territorial.`
    },
    {
      title: "Filtros globais",
      text: `O filtro inicial por Lista MMA afeta mapa, rankings, heatmap, KPIs, tabelas e exportações. A base atual possui ${DATA.validation.filters.listaMmaValues.length} classes de Lista MMA e ${DATA.validation.filters.years.length} anos.`
    },
    {
      title: "Compatibilidade temporal",
      text: DATA.validation.hasMonthlyBreakdown
        ? "A base possui abertura mensal."
        : "A base atual não possui abertura mensal. O filtro de meses foi substituído por fallback elegante e o recorte anual permanece funcional."
    },
    {
      title: "Controle desabilitado",
      text: "O modo de contratantes únicos foi desabilitado porque a nova base agregada não preserva granularidade operacional nem identificador seguro para reconstrução de unicidade."
    },
    {
      title: "Linhas excluídas",
      text: `Foram excluídas ${formatInt(DATA.validation.excludedRows)} linhas sem UF/macrorregião válidas para não quebrar a lógica territorial do dashboard.`
    },
    {
      title: "Recorte atual",
      text: `${ctx.referenceName} • ${currentMetricLabel()} • ${DIMENSION_META[state.dimension].title} • ${formatInt(ctx.referenceIndices.length)} linhas agregadas na prévia da unidade de referência.`
    }
  ];
  $("validationBox").innerHTML = cards.map(card => `
    <div class="validation-item">
      <h4>${card.title}</h4>
      <p>${card.text}</p>
    </div>
  `).join("");
}
function exportFilteredData(){
  const baseIndices = getBaseFilteredIndices();
  const referencePredicate = getReferencePredicate();
  const rows = baseIndices.filter(referencePredicate).map(reconstructRow);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados Filtrados");
  XLSX.writeFile(wb, `dados_filtrados_${slugify(state.selectedTerritory)}.xlsx`);
}
async function loadTopo(){
  try {
    const resp = await fetch(TOPO_URL);
    topojsonData = await resp.json();
    const topoObject = resolveTopoObject(topojsonData);
    if (!topoObject) throw new Error("Estrutura topojson sem objeto de estados identificável.");
    geojsonUF = enrichGeojsonFeatures(topojson.feature(topojsonData, topoObject));
  } catch (err) {
    console.error("Falha ao carregar o mapa das UFs:", err);
    topojsonData = null;
    geojsonUF = null;
  }
}
async function refreshDashboard(){
  showLoading(true);
  try {
    updateBenchmarkControl();
    const baseIndices = getBaseFilteredIndices();
    const territoryOptions = getTerritoryOptions(state.territoryLevel);
    if (!territoryOptions.includes(state.selectedTerritory)) {
      state.selectedTerritory = territoryOptions[0];
      buildSingleSelect("territoryFilter", territoryOptions, state.selectedTerritory);
    }
    const ctx = buildContext(baseIndices);
    const summaryRows = buildSummaryRows(ctx);
    updateHeader(ctx);
    buildKpis(ctx, summaryRows);
    renderMap(ctx);
    renderRanking(ctx);
    renderComposition(ctx, summaryRows);
    renderRepresentativity(ctx, summaryRows);
    renderHeatmap(ctx);
    renderLabelRanking(ctx);
    updateSummaryTable(summaryRows, ctx);
    updateRawTable(ctx);
    renderValidation(ctx);
  } catch (err) {
    console.error(err);
    $("validationBox").innerHTML = `<div class="validation-item"><h4>Erro de atualização</h4><p>${String(err && err.message || err)}</p></div>`;
  } finally {
    showLoading(false);
  }
}
async function boot(){
  try {
    initMappings();
    await loadTopo();
    initDom();
    await refreshDashboard();
  } catch (err) {
    console.error("Falha na inicialização do dashboard:", err);
    const box = $("validationBox");
    if (box) {
      box.innerHTML = `<div class="validation-item"><h4>Erro de inicialização</h4><p>${String(err && err.message || err)}</p></div>`;
    }
  }
}
boot();
