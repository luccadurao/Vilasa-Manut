// ============================================================================
// VILASA CMMS V2 - MÓDULO 8: KPIS.JS (CONFIABILIDADE NBR 5462 & CUSTOS)
// ============================================================================

let filtroKpiDataInicio = '';
let filtroKpiDataFim = '';
let filtroKpiPrefixo = '';

function inicializarDatasPadraoKPI() {
  if (filtroKpiDataInicio && filtroKpiDataFim) return;
  const hoje = new Date();
  const trinta = new Date();
  trinta.setDate(hoje.getDate() - 30);
  filtroKpiDataInicio = trinta.toISOString().slice(0, 10);
  filtroKpiDataFim = hoje.toISOString().slice(0, 10);
}

function aplicarAtalhoPeriodoKPI(diasOuModo) {
  const hoje = new Date();
  let ini = new Date();
  if (diasOuModo === 'mes_atual') ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  else if (diasOuModo === 'ano_atual') ini = new Date(hoje.getFullYear(), 0, 1);
  else ini.setDate(hoje.getDate() - Number(diasOuModo));

  filtroKpiDataInicio = ini.toISOString().slice(0, 10);
  filtroKpiDataFim = hoje.toISOString().slice(0, 10);
  calcularKPIs();
}

function calcularHorasInterseccaoPeriodo(dtEntradaISO, dtSaidaISO, inicioJanela, fimJanela) {
  if (!dtEntradaISO) return 0;
  const entrada = new Date(dtEntradaISO);
  const saida = dtSaidaISO ? new Date(dtSaidaISO) : new Date();
  const iniEfetivo = entrada > inicioJanela ? entrada : inicioJanela;
  const fimEfetivo = saida < fimJanela ? saida : fimJanela;
  return fimEfetivo <= iniEfetivo ? 0 : (fimEfetivo - iniEfetivo) / 3600000;
}

async function calcularKPIs() {
  inicializarDatasPadraoKPI();

  const inpIni = document.getElementById('kpiInputDataInicio');
  const inpFim = document.getElementById('kpiInputDataFim');
  const inpPref = document.getElementById('kpiInputPrefixo');
  if (inpIni?.value) filtroKpiDataInicio = inpIni.value;
  if (inpFim?.value) filtroKpiDataFim = inpFim.value;
  if (inpPref) filtroKpiPrefixo = inpPref.value.trim().toUpperCase();

  const [resEq, resOS, resPrevExec, resPlanos, resPecas, resMovs] = await Promise.all([
    lerDadosComFallbackOffline('equipamentos', () => db.from('equipamentos').select('*').order('tag')),
    lerDadosComFallbackOffline('ordens_servico', () => db.from('ordens_servico').select('*').order('aberta_em', { ascending: false })),
    lerDadosComFallbackOffline('execucoes_preventiva', () => db.from('execucoes_preventiva').select('*')),
    lerDadosComFallbackOffline('planos_preventiva', () => db.from('planos_preventiva').select('*')),
    lerDadosComFallbackOffline('pecas_estoque', () => db.from('pecas_estoque').select('*')),
    lerDadosComFallbackOffline('movimentacoes_almoxarifado', () => db.from('movimentacoes_almoxarifado').select('*'))
  ]);

  let equipamentos = resEq.data || [];
  let ordensCorretivas = resOS.data || [];
  let execucoesPreventivas = resPrevExec.data || [];
  let planosPreventiva = resPlanos.data || [];
  let pecasEstoque = resPecas.data || [];
  let movsAlmox = resMovs.data || [];

  if (typeof filtrarListaPorObraAtiva === 'function') {
    equipamentos = filtrarListaPorObraAtiva(equipamentos);
    ordensCorretivas = filtrarListaPorObraAtiva(ordensCorretivas);
    pecasEstoque = filtrarListaPorObraAtiva(pecasEstoque);
    movsAlmox = filtrarListaPorObraAtiva(movsAlmox);
  }

  let frotaAtiva = equipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo');
  if (filtroKpiPrefixo) frotaAtiva = frotaAtiva.filter(e => bateComPrefixoEquipamento(e.tag || '', filtroKpiPrefixo));

  const idsFrota = new Set(frotaAtiva.map(e => String(e.id)));
  const dtInicioJanela = new Date(filtroKpiDataInicio + 'T00:00:00');
  const dtFimJanela = new Date(filtroKpiDataFim + 'T23:59:59');
  const horasJanelaPorMaquina = Math.max(24, (dtFimJanela - dtInicioJanela) / 3600000);
  const diasNoPeriodo = Math.max(1, Math.round(horasJanelaPorMaquina / 24));
  const horasCalendarioTotais = frotaAtiva.length * horasJanelaPorMaquina;

  let horasParadasCorretivaTotal = 0;
  let qtdFalhasCorretivasComParada = 0;
  let qtdAvisosSemParada = 0;

  const mapaViloesPorMaquina = {};
  frotaAtiva.forEach(eq => {
    mapaViloesPorMaquina[eq.id] = { tag: eq.tag, nome: eq.nome, horasCorretiva: 0, horasPreventiva: 0, qtdFalhas: 0, custoPecas: 0 };
  });

  const mapaProdutividadeMecanicos = {};

  ordensCorretivas.forEach(os => {
    if (!idsFrota.has(String(os.equipamento_id))) return;
    const dtAbertura = new Date(os.aberta_em);
    const dtSaida = os.concluida_em ? new Date(os.concluida_em) : new Date();
    if (dtSaida < dtInicioJanela || dtAbertura > dtFimJanela) return;

    if (os.mecanico_nome && (os.status === 'concluida' || os.status === 'aguardando_pcm' || os.concluida_em)) {
      os.mecanico_nome.split(',').map(n => n.trim().toUpperCase()).filter(Boolean).forEach(nome => {
        if (!mapaProdutividadeMecanicos[nome]) mapaProdutividadeMecanicos[nome] = { nome, corretivas: 0, semParada: 0, total: 0 };
        mapaProdutividadeMecanicos[nome].total++;
        if (os.parada_obrigatoria === false) mapaProdutividadeMecanicos[nome].semParada++;
        else mapaProdutividadeMecanicos[nome].corretivas++;
      });
    }

    if (os.parada_obrigatoria === false) {
      qtdAvisosSemParada++;
    } else {
      const hParada = calcularHorasInterseccaoPeriodo(os.aberta_em, os.concluida_em, dtInicioJanela, dtFimJanela);
      if (hParada > 0) {
        horasParadasCorretivaTotal += hParada;
        qtdFalhasCorretivasComParada++;
        if (mapaViloesPorMaquina[os.equipamento_id]) {
          mapaViloesPorMaquina[os.equipamento_id].horasCorretiva += hParada;
          mapaViloesPorMaquina[os.equipamento_id].qtdFalhas++;
        }
      }
    }
  });

  let horasParadasPreventivaTotal = 0;
  let qtdPreventivasExecutadasNoPeriodo = 0;

  execucoesPreventivas.forEach(ex => {
    if (!idsFrota.has(String(ex.equipamento_id))) return;
    const dtIni = new Date(ex.data_entrada);
    const dtFim = ex.data_conclusao ? new Date(ex.data_conclusao) : new Date();
    if (dtFim < dtInicioJanela || dtIni > dtFimJanela) return;

    qtdPreventivasExecutadasNoPeriodo++;
    if (ex.parada_obrigatoria !== false) {
      const hPrev = calcularHorasInterseccaoPeriodo(ex.data_entrada, ex.data_conclusao, dtInicioJanela, dtFimJanela);
      horasParadasPreventivaTotal += hPrev;
      if (mapaViloesPorMaquina[ex.equipamento_id]) mapaViloesPorMaquina[ex.equipamento_id].horasPreventiva += hPrev;
    }
  });

  const horasParadasTotaisDF = Math.min(horasCalendarioTotais, horasParadasCorretivaTotal + horasParadasPreventivaTotal);
  const horasDisponiveisOperacao = Math.max(0, horasCalendarioTotais - horasParadasTotaisDF);
  const dfPercentual = horasCalendarioTotais > 0 ? ((horasDisponiveisOperacao / horasCalendarioTotais) * 100) : 100;

  const horasOperadasParaMTBF = Math.max(0, horasCalendarioTotais - horasParadasCorretivaTotal);
  const mtbfHoras = qtdFalhasCorretivasComParada > 0 ? (horasOperadasParaMTBF / qtdFalhasCorretivasComParada) : horasOperadasParaMTBF;
  const mttrHoras = qtdFalhasCorretivasComParada > 0 ? (horasParadasCorretivaTotal / qtdFalhasCorretivasComParada) : 0;
  const confiabilidade24h = qtdFalhasCorretivasComParada > 0 && mtbfHoras > 0 ? (Math.exp(-24 / mtbfHoras) * 100) : 100;

  let planosEmDia = 0, planosVencidos = 0;
  const planosFiltrados = planosPreventiva.filter(p => idsFrota.has(String(p.equipamento_id)));
  planosFiltrados.forEach(pl => {
    const eq = frotaAtiva.find(e => String(e.id) === String(pl.equipamento_id));
    if (!eq) return;
    const saldo = (Number(pl.ultimo_horimetro_execucao || 0) + Number(pl.intervalo_base || 250)) - Number(eq.horimetro_atual || 0);
    if (saldo <= 0) planosVencidos++;
    else planosEmDia++;
  });
  const aderenciaPreventivaPerc = planosFiltrados.length > 0 ? ((planosEmDia / planosFiltrados.length) * 100) : 100;

  const valorImobilizadoEstoque = pecasEstoque.reduce((acc, p) => acc + (parseFloat(p.quantidade || 0) * parseFloat(p.custo_unitario || 0)), 0);

  let custoConsumidoNoPeriodo = 0;
  movsAlmox.forEach(m => {
    if (!['SAIDA_ESTOQUE', 'SAIDA_DIRETA_NF_MAQUINA'].includes(m.tipo_movimento)) return;
    const dtMov = new Date(m.registrado_em);
    if (dtMov < dtInicioJanela || dtMov > dtFimJanela) return;
    if (filtroKpiPrefixo && m.equipamento_id && !idsFrota.has(String(m.equipamento_id))) return;

    const custoItem = parseFloat(m.quantidade || 0) * parseFloat(m.valor_unitario || 0);
    custoConsumidoNoPeriodo += custoItem;
    if (m.equipamento_id && mapaViloesPorMaquina[m.equipamento_id]) mapaViloesPorMaquina[m.equipamento_id].custoPecas += custoItem;
  });

  renderizarDashboardKPIs({
    frotaTotal: frotaAtiva.length, diasNoPeriodo, dfPercentual, mtbfHoras, mttrHoras, confiabilidade24h,
    horasParadasCorretivaTotal, horasParadasPreventivaTotal, qtdFalhasCorretivasComParada, qtdAvisosSemParada,
    qtdPreventivasExecutadasNoPeriodo, aderenciaPreventivaPerc, planosEmDia, planosVencidos,
    valorImobilizadoEstoque, custoConsumidoNoPeriodo,
    listaMaquinasAnalitica: Object.values(mapaViloesPorMaquina),
    listaProdutividadeMecanicos: Object.values(mapaProdutividadeMecanicos)
  });
}

function formatarMoedaBR(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizarDashboardKPIs(d) {
  const sec = document.getElementById('sec-kpis');
  if (!sec) return;

  const topViloes = [...d.listaMaquinasAnalitica]
    .map(m => ({ ...m, totalParado: m.horasCorretiva + m.horasPreventiva }))
    .filter(m => m.totalParado > 0 || m.qtdFalhas > 0)
    .sort((a, b) => b.totalParado - a.totalParado)
    .slice(0, 10);

  const topCustos = [...d.listaMaquinasAnalitica].filter(m => m.custoPecas > 0).sort((a, b) => b.custoPecas - a.custoPecas).slice(0, 10);
  const rankingMec = [...d.listaProdutividadeMecanicos].sort((a, b) => b.total - a.total);

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ENGENHARIA DE CONFIABILIDADE & CUSTOS (NBR 5462)</span>
            <h2 class="text-lg font-black">Painel Executivo de Indicadores de Manutenção (KPIs)</h2>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button onclick="aplicarAtalhoPeriodoKPI(7)" class="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 text-xs font-bold">7 Dias</button>
            <button onclick="aplicarAtalhoPeriodoKPI(30)" class="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 text-xs font-bold">30 Dias</button>
            <button onclick="aplicarAtalhoPeriodoKPI('mes_atual')" class="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 text-xs font-bold">Mês Atual</button>
            <button onclick="aplicarAtalhoPeriodoKPI('ano_atual')" class="px-2.5 py-1 rounded-lg bg-slate-800 text-amber-300 text-xs font-bold">Ano Atual</button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
          <input id="kpiInputDataInicio" type="date" value="${filtroKpiDataInicio}" onchange="calcularKPIs()" class="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-white" />
          <input id="kpiInputDataFim" type="date" value="${filtroKpiDataFim}" onchange="calcularKPIs()" class="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-white" />
          <input id="kpiInputPrefixo" type="text" value="${filtroKpiPrefixo}" oninput="calcularKPIs()" placeholder="Filtrar Prefixo (Ex: EH-40)..." class="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold uppercase text-amber-300" />
          <div class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] flex items-center justify-between">
            <span class="text-slate-400">Janela:</span><strong class="text-amber-400">${d.diasNoPeriodo}d • ${d.frotaTotal} máq.</strong>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border-l-4 ${d.dfPercentual >= 85 ? 'border-emerald-500' : 'border-rose-500'} shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">Disponibilidade Física (DF%)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.dfPercentual.toFixed(1)}%</p>
          <p class="text-[11px] text-slate-500 mt-1">Corretivas: <strong>${d.horasParadasCorretivaTotal.toFixed(1)}h</strong> + Prev: <strong>${d.horasParadasPreventivaTotal.toFixed(1)}h</strong></p>
        </div>
        <div class="bg-white p-4 rounded-2xl border-l-4 border-blue-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">MTBF (Tempo Entre Falhas)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.mtbfHoras.toFixed(1)} h</p>
          <p class="text-[11px] text-slate-500 mt-1">Sobre <strong>${d.qtdFalhasCorretivasComParada}</strong> parada(s) corretiva(s)</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border-l-4 border-amber-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">MTTR (Tempo Médio Reparo)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.mttrHoras.toFixed(1)} h</p>
          <p class="text-[11px] text-slate-500 mt-1">Aderência Prev.: <strong>${d.aderenciaPreventivaPerc.toFixed(0)}%</strong> (${d.planosEmDia} em dia)</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border-l-4 border-purple-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">Custos de Peças & Estoque</span>
          <p class="text-2xl font-black text-slate-900 mt-1">${formatarMoedaBR(d.custoConsumidoNoPeriodo)}</p>
          <p class="text-[11px] text-slate-500 mt-1">Em Estoque: <strong>${formatarMoedaBR(d.valorImobilizadoEstoque)}</strong></p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl border p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">🚨 Top 10 Críticos de Horas Paradas</h3>
          <table class="w-full text-left text-[11px]">
            <thead><tr class="text-slate-500 border-b"><th class="py-1.5">Prefixo</th><th class="py-1.5 text-center">Falhas</th><th class="py-1.5 text-right">Corret.</th><th class="py-1.5 text-right">Prev.</th><th class="py-1.5 text-right">Total</th></tr></thead>
            <tbody class="divide-y">${topViloes.map(m => `<tr><td class="py-1.5 font-black text-amber-700">${esc(m.tag)}</td><td class="py-1.5 text-center font-bold">${m.qtdFalhas}</td><td class="py-1.5 text-right text-rose-600 font-bold">${m.horasCorretiva.toFixed(1)}h</td><td class="py-1.5 text-right text-blue-600 font-bold">${m.horasPreventiva.toFixed(1)}h</td><td class="py-1.5 text-right font-black">${m.totalParado.toFixed(1)}h</td></tr>`).join('')}</tbody>
          </table>
        </div>

        <div class="bg-white rounded-2xl border p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">💵 Top 10 Custos de Peças/NF por Máquina</h3>
          <table class="w-full text-left text-[11px]">
            <thead><tr class="text-slate-500 border-b"><th class="py-1.5">Prefixo</th><th class="py-1.5">Equipamento</th><th class="py-1.5 text-right">Custo</th></tr></thead>
            <tbody class="divide-y">${topCustos.map(m => `<tr><td class="py-1.5 font-black text-amber-700">${esc(m.tag)}</td><td class="py-1.5 font-semibold truncate max-w-[140px]">${esc(m.nome || '-')}</td><td class="py-1.5 text-right font-black text-emerald-700">${formatarMoedaBR(m.custoPecas)}</td></tr>`).join('')}</tbody>
          </table>
        </div>

        <div class="bg-white rounded-2xl border p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">👷 Produtividade da Equipe no Período</h3>
          <table class="w-full text-left text-[11px]">
            <thead><tr class="text-slate-500 border-b"><th class="py-1.5">Mecânico</th><th class="py-1.5 text-center">C/ Parada</th><th class="py-1.5 text-center">S/ Parada</th><th class="py-1.5 text-right">Total OS</th></tr></thead>
            <tbody class="divide-y">${rankingMec.map(mec => `<tr><td class="py-1.5 font-black">${esc(mec.nome)}</td><td class="py-1.5 text-center font-bold text-rose-600">${mec.corretivas}</td><td class="py-1.5 text-center font-bold text-emerald-700">${mec.semParada}</td><td class="py-1.5 text-right font-black">${mec.total}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function exportarRelatorioKPIsCSV() {
  const cab = ['PERIODO_INICIO', 'PERIODO_FIM', 'PREFIXO_FILTRO', 'EXPORTADO_EM'];
  const linha = [filtroKpiDataInicio, filtroKpiDataFim, filtroKpiPrefixo || 'TODOS', new Date().toLocaleString('pt-BR')].map(csvCelula).join(';');
  const blob = new Blob(['\uFEFF' + cab.join(';') + '\n' + linha], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_KPIS_${filtroKpiDataInicio}_A_${filtroKpiDataFim}.csv`;
  a.click();
}
