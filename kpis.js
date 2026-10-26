// ============================================================================
// VILASA CMMS - MÓDULO 8: KPIS.JS (ENGENHARIA DE MANUTENÇÃO, CUSTOS E CONFIABILIDADE)
// Responsabilidades:
// 1. Filtro de Período Dinâmico (7d, 30d, Mês, Ano ou Datas Customizadas) + Prefixo
// 2. DF% Clássica (NBR 5462): Desconta Horas Paradas de Corretivas + Preventivas
// 3. MTBF, MTTR e Confiabilidade R(t): Calculados estritamente sobre Quebras Corretivas c/ Parada
// 4. Indicadores de Gestão: Aderência Preventiva, Custo de Estoque/NF, Tempo de Resposta Uber
// 5. Tabelas Analíticas Sem Gráficos (Top 10 Vilões, Custos por Máquina e Produtividade Mecânicos)
// ============================================================================

let filtroKpiDataInicio = '';
let filtroKpiDataFim = '';
let filtroKpiPrefixo = '';

function inicializarDatasPadraoKPI() {
  if (filtroKpiDataInicio && filtroKpiDataFim) return;
  const hoje = new Date();
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(hoje.getDate() - 30);

  filtroKpiDataInicio = trintaDiasAtras.toISOString().slice(0, 10);
  filtroKpiDataFim = hoje.toISOString().slice(0, 10);
}

function aplicarAtalhoPeriodoKPI(diasOuModo) {
  const hoje = new Date();
  let ini = new Date();

  if (diasOuModo === 'mes_atual') {
    ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  } else if (diasOuModo === 'ano_atual') {
    ini = new Date(hoje.getFullYear(), 0, 1);
  } else {
    ini.setDate(hoje.getDate() - Number(diasOuModo));
  }

  filtroKpiDataInicio = ini.toISOString().slice(0, 10);
  filtroKpiDataFim = hoje.toISOString().slice(0, 10);

  const inpIni = document.getElementById('kpiInputDataInicio');
  const inpFim = document.getElementById('kpiInputDataFim');
  if (inpIni) inpIni.value = filtroKpiDataInicio;
  if (inpFim) inpFim.value = filtroKpiDataFim;

  calcularKPIs();
}

// Calcula quantas horas uma intervenção ficou efetivamente parada dentro da janela [inicioPeriodo, fimPeriodo]
function calcularHorasInterseccaoPeriodo(dtEntradaISO, dtSaidaISO, inicioJanela, fimJanela) {
  if (!dtEntradaISO) return 0;
  const entrada = new Date(dtEntradaISO);
  const saida = dtSaidaISO ? new Date(dtSaidaISO) : new Date();

  const iniEfetivo = entrada > inicioJanela ? entrada : inicioJanela;
  const fimEfetivo = saida < fimJanela ? saida : fimJanela;

  if (fimEfetivo <= iniEfetivo) return 0;
  return (fimEfetivo - iniEfetivo) / 3600000;
}

async function calcularKPIs() {
  inicializarDatasPadraoKPI();

  const inpIni = document.getElementById('kpiInputDataInicio');
  const inpFim = document.getElementById('kpiInputDataFim');
  const inpPref = document.getElementById('kpiInputPrefixo');

  if (inpIni && inpIni.value) filtroKpiDataInicio = inpIni.value;
  if (inpFim && inpFim.value) filtroKpiDataFim = inpFim.value;
  if (inpPref) filtroKpiPrefixo = inpPref.value.trim().toUpperCase();

  // Carrega todas as fontes necessárias (com fallback offline automático)
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

  // 1. Filtra pela Obra Ativa selecionada no topo
  if (typeof filtrarListaPorObraAtiva === 'function') {
    equipamentos = filtrarListaPorObraAtiva(equipamentos);
    ordensCorretivas = filtrarListaPorObraAtiva(ordensCorretivas);
    execucoesPreventivas = filtrarListaPorObraAtiva(execucoesPreventivas);
    planosPreventiva = filtrarListaPorObraAtiva(planosPreventiva);
    pecasEstoque = filtrarListaPorObraAtiva(pecasEstoque);
    movsAlmox = filtrarListaPorObraAtiva(movsAlmox);
  }

  // Considera apenas equipamentos ATIVOS/MOBILIZADOS para cálculo de disponibilidade atual
  let frotaAtiva = equipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo');

  // 2. Filtro estrito por Prefixo (TAG), se digitado
  if (filtroKpiPrefixo) {
    frotaAtiva = frotaAtiva.filter(e => bateComPrefixoEquipamento(e.tag || '', filtroKpiPrefixo));
  }

  const idsFrotaFiltrada = new Set(frotaAtiva.map(e => String(e.id)));

  // Define a janela exata de tempo
  const dtInicioJanela = new Date(filtroKpiDataInicio + 'T00:00:00');
  const dtFimJanela = new Date(filtroKpiDataFim + 'T23:59:59');
  const horasJanelaPorMaquina = Math.max(24, (dtFimJanela - dtInicioJanela) / 3600000);
  const diasNoPeriodo = Math.max(1, Math.round(horasJanelaPorMaquina / 24));

  const horasCalendarioTotais = frotaAtiva.length * horasJanelaPorMaquina;

  // --------------------------------------------------------------------------
  // CÁLCULO DE PARADAS CORRETIVAS E PREVENTIVAS NO PERÍODO
  // --------------------------------------------------------------------------
  let horasParadasCorretivaTotal = 0;
  let qtdFalhasCorretivasComParada = 0;
  let qtdAvisosSemParada = 0;
  let qtdAtendimentosComboioOportunidade = 0;

  let somaMinutosAceiteUber = 0;
  let contChamadosComAceiteUber = 0;

  const mapaViloesPorMaquina = {};
  frotaAtiva.forEach(eq => {
    mapaViloesPorMaquina[eq.id] = {
      tag: eq.tag,
      nome: eq.nome,
      horasCorretiva: 0,
      horasPreventiva: 0,
      qtdFalhas: 0,
      custoPecas: 0
    };
  });

  // Produtividade por Mecânico
  const mapaProdutividadeMecanicos = {};

  // Processa Ordens de Serviço (Corretivas / Avisos / Comboio)
  ordensCorretivas.forEach(os => {
    if (!idsFrotaFiltrada.has(String(os.equipamento_id))) return;

    const dtAbertura = new Date(os.aberta_em);
    const dtSaida = os.concluida_em ? new Date(os.concluida_em) : new Date();

    // Verifica se a OS teve interseção com o período selecionado
    if (dtSaida < dtInicioJanela || dtAbertura > dtFimJanela) return;

    if (['inspecao_campo', 'atendimento_comboio'].includes(os.origem_atendimento)) {
      qtdAtendimentosComboioOportunidade++;
    }

    // Contabiliza Tempo de Resposta do Uber (se teve aceite registrado no período)
    if (os.aceita_em && os.aberta_em) {
      const minResp = (new Date(os.aceita_em) - new Date(os.aberta_em)) / 60000;
      if (minResp >= 0 && minResp <= 1440) {
        somaMinutosAceiteUber += minResp;
        contChamadosComAceiteUber++;
      }
    }

    // Contabiliza Produtividade da Equipe (pelos nomes marcados nos chips)
    if (os.mecanico_nome && (os.status === 'concluida' || os.status === 'aguardando_pcm' || os.concluida_em)) {
      const nomes = os.mecanico_nome.split(',').map(n => n.trim().toUpperCase()).filter(Boolean);
      nomes.forEach(nome => {
        if (!mapaProdutividadeMecanicos[nome]) {
          mapaProdutividadeMecanicos[nome] = { nome, corretivas: 0, semParada: 0, comboio: 0, total: 0 };
        }
        mapaProdutividadeMecanicos[nome].total++;
        if (['inspecao_campo', 'atendimento_comboio'].includes(os.origem_atendimento)) {
          mapaProdutividadeMecanicos[nome].comboio++;
        } else if (os.parada_obrigatoria === false) {
          mapaProdutividadeMecanicos[nome].semParada++;
        } else {
          mapaProdutividadeMecanicos[nome].corretivas++;
        }
      });
    }

    // Separa OS Sem Parada vs. OS Com Parada
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

  // Processa Execuções de Preventiva (Contam na DF% clássica quando têm parada, mas NÃO contam como falha no MTBF)
  let horasParadasPreventivaTotal = 0;
  let qtdPreventivasExecutadasNoPeriodo = 0;

  execucoesPreventivas.forEach(ex => {
    if (!idsFrotaFiltrada.has(String(ex.equipamento_id))) return;
    const dtIni = new Date(ex.data_entrada || ex.criado_em);
    const dtFim = ex.data_conclusao ? new Date(ex.data_conclusao) : new Date();

    if (dtFim < dtInicioJanela || dtIni > dtFimJanela) return;

    qtdPreventivasExecutadasNoPeriodo++;

    if (ex.parada_obrigatoria !== false) {
      const hPrev = calcularHorasInterseccaoPeriodo(ex.data_entrada || ex.criado_em, ex.data_conclusao, dtInicioJanela, dtFimJanela);
      horasParadasPreventivaTotal += hPrev;
      if (mapaViloesPorMaquina[ex.equipamento_id]) {
        mapaViloesPorMaquina[ex.equipamento_id].horasPreventiva += hPrev;
      }
    }
  });

  // --------------------------------------------------------------------------
  // FÓRMULAS CLÁSSICAS DE ENGENHARIA (NBR 5462)
  // --------------------------------------------------------------------------
  const horasParadasTotaisDF = Math.min(horasCalendarioTotais, horasParadasCorretivaTotal + horasParadasPreventivaTotal);
  const horasDisponiveisOperacao = Math.max(0, horasCalendarioTotais - horasParadasTotaisDF);

  // 1. Disponibilidade Física (DF%) -> Considera Corretivas + Preventivas
  const dfPercentual = horasCalendarioTotais > 0
    ? ((horasDisponiveisOperacao / horasCalendarioTotais) * 100)
    : 100;

  // 2. MTBF (Tempo Médio Entre Falhas) -> Exclusivo sobre falhas corretivas com parada!
  const horasOperadasParaMTBF = Math.max(0, horasCalendarioTotais - horasParadasCorretivaTotal);
  const mtbfHoras = qtdFalhasCorretivasComParada > 0
    ? (horasOperadasParaMTBF / qtdFalhasCorretivasComParada)
    : horasOperadasParaMTBF;

  // 3. MTTR (Tempo Médio Para Reparo) -> Exclusivo sobre falhas corretivas com parada!
  const mttrHoras = qtdFalhasCorretivasComParada > 0
    ? (horasParadasCorretivaTotal / qtdFalhasCorretivasComParada)
    : 0;

  // 4. Confiabilidade R(t) para um turno de 24h: R(24) = e^(-24 / MTBF)
  const confiabilidade24h = qtdFalhasCorretivasComParada > 0 && mtbfHoras > 0
    ? (Math.exp(-24 / mtbfHoras) * 100)
    : 100;

  // --------------------------------------------------------------------------
  // INDICADORES DE ADERÊNCIA PREVENTIVA, ALMOXARIFADO E TEMPO DE RESPOSTA UBER
  // --------------------------------------------------------------------------
  let planosEmDia = 0;
  let planosVencidos = 0;
  const planosFiltrados = planosPreventiva.filter(p => idsFrotaFiltrada.has(String(p.equipamento_id)));

  planosFiltrados.forEach(pl => {
    const eq = frotaAtiva.find(e => String(e.id) === String(pl.equipamento_id));
    if (!eq) return;
    const statusCalc = typeof calcularStatusPlanoPreventiva === 'function'
      ? calcularStatusPlanoPreventiva(pl, eq)
      : { saldoHoras: (Number(pl.ultimo_horimetro_execucao || 0) + Number(pl.intervalo_base || 250)) - Number(eq.horimetro_atual || 0) };

    if (statusCalc.saldoHoras <= 0) planosVencidos++;
    else planosEmDia++;
  });

  const aderenciaPreventivaPerc = planosFiltrados.length > 0
    ? ((planosEmDia / planosFiltrados.length) * 100)
    : 100;

  // Proporção Proativa (Preventivas + Comboio/Oportunidade) vs. Reativa (Corretivas c/ Parada)
  const totalEventosManut = qtdFalhasCorretivasComParada + qtdPreventivasExecutadasNoPeriodo + qtdAtendimentosComboioOportunidade;
  const indiceProatividadePerc = totalEventosManut > 0
    ? (((qtdPreventivasExecutadasNoPeriodo + qtdAtendimentosComboioOportunidade) / totalEventosManut) * 100)
    : 100;

  // Custo Imobilizado em Estoque Atual
  const valorImobilizadoEstoque = pecasEstoque.reduce((acc, p) => {
    if (p.estocavel === false) return acc;
    return acc + (parseFloat(p.quantidade || 0) * parseFloat(p.custo_unitario || 0));
  }, 0);

  // Custo Consumido pelas Máquinas no Período (Saída de Estoque + Saída Direta de NF)
  let custoConsumidoNoPeriodo = 0;
  movsAlmox.forEach(m => {
    if (!['SAIDA_ESTOQUE', 'SAIDA_DIRETA_NF_MAQUINA'].includes(m.tipo_movimento)) return;
    const dtMov = new Date(m.registrado_em);
    if (dtMov < dtInicioJanela || dtMov > dtFimJanela) return;
    if (filtroKpiPrefixo && m.equipamento_id && !idsFrotaFiltrada.has(String(m.equipamento_id))) return;

    const custoTotalItem = parseFloat(m.quantidade || 0) * parseFloat(m.valor_unitario || 0);
    custoConsumidoNoPeriodo += custoTotalItem;

    if (m.equipamento_id && mapaViloesPorMaquina[m.equipamento_id]) {
      mapaViloesPorMaquina[m.equipamento_id].custoPecas += custoTotalItem;
    }
  });

  const tempoMedioAceiteUberMin = contChamadosComAceiteUber > 0
    ? Math.round(somaMinutosAceiteUber / contChamadosComAceiteUber)
    : 0;

  renderizarDashboardKPIsSemGraficos({
    frotaTotal: frotaAtiva.length,
    diasNoPeriodo,
    horasCalendarioTotais,
    horasParadasCorretivaTotal,
    horasParadasPreventivaTotal,
    dfPercentual,
    mtbfHoras,
    mttrHoras,
    confiabilidade24h,
    qtdFalhasCorretivasComParada,
    qtdAvisosSemParada,
    qtdPreventivasExecutadasNoPeriodo,
    qtdAtendimentosComboioOportunidade,
    aderenciaPreventivaPerc,
    planosEmDia,
    planosVencidos,
    indiceProatividadePerc,
    valorImobilizadoEstoque,
    custoConsumidoNoPeriodo,
    tempoMedioAceiteUberMin,
    listaMaquinasAnalitica: Object.values(mapaViloesPorMaquina),
    listaProdutividadeMecanicos: Object.values(mapaProdutividadeMecanicos)
  });
}

function formatarMoedaBR(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizarDashboardKPIsSemGraficos(d) {
  const sec = document.getElementById('sec-kpis');
  if (!sec) return;

  // Ordena Top 10 Vilões por Total de Horas Paradas (Corretiva + Preventiva)
  const topViloesParada = [...d.listaMaquinasAnalitica]
    .map(m => ({ ...m, totalParado: m.horasCorretiva + m.horasPreventiva }))
    .filter(m => m.totalParado > 0 || m.qtdFalhas > 0)
    .sort((a, b) => b.totalParado - a.totalParado)
    .slice(0, 10);

  // Ordena Top 10 Máquinas por Custo de Peças/NF no Período
  const topCustosMaquinas = [...d.listaMaquinasAnalitica]
    .filter(m => m.custoPecas > 0)
    .sort((a, b) => b.custoPecas - a.custoPecas)
    .slice(0, 10);

  // Ordena Produtividade da Equipe
  const rankingMecanicos = [...d.listaProdutividadeMecanicos]
    .sort((a, b) => b.total - a.total);

  sec.innerHTML = `
    <div class="space-y-5">
      <!-- BARRA DE FILTRO DE PERÍODO E PREFIXO -->
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ENGENHARIA DE CONFIABILIDADE & CUSTOS (NBR 5462)</span>
            <h2 class="text-lg font-black">Painel Executivo de Indicadores de Manutenção (KPIs)</h2>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button onclick="aplicarAtalhoPeriodoKPI(7)" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold">Últimos 7 Dias</button>
            <button onclick="aplicarAtalhoPeriodoKPI(30)" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold">Últimos 30 Dias</button>
            <button onclick="aplicarAtalhoPeriodoKPI('mes_atual')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold">Mês Atual</button>
            <button onclick="aplicarAtalhoPeriodoKPI('ano_atual')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold">Ano Atual</button>
            <button onclick="exportarRelatorioKPIsCSV()" class="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black ml-1">
              <i class="fa-solid fa-file-excel mr-1"></i> Exportar KPIs
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
          <div>
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data Inicial</label>
            <input id="kpiInputDataInicio" type="date" value="${filtroKpiDataInicio}" onchange="calcularKPIs()"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-white" />
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data Final</label>
            <input id="kpiInputDataFim" type="date" value="${filtroKpiDataFim}" onchange="calcularKPIs()"
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-white" />
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Filtrar Prefixo (TAG)</label>
            <input id="kpiInputPrefixo" type="text" value="${filtroKpiPrefixo}" oninput="calcularKPIs()" placeholder="Ex: EH-40 ou CB..."
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold uppercase text-amber-300" />
          </div>
          <div class="flex flex-col justify-end">
            <div class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px]">
              <span class="text-slate-400">Janela Analisada:</span>
              <strong class="text-amber-400 block">${d.diasNoPeriodo} dia(s) • ${d.frotaTotal} máquina(s) ativa(s)</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- LINHA 1: OS 4 INDICADORES CLÁSSICOS DE CONFIABILIDADE (DF%, MTBF, MTTR, R(t)) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border-l-4 ${d.dfPercentual >= 85 ? 'border-emerald-500' : 'border-rose-500'} shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">Disponibilidade Física (DF%)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.dfPercentual.toFixed(1)}%</p>
          <p class="text-[11px] text-slate-500 mt-1">
            Corretivas: <strong>${d.horasParadasCorretivaTotal.toFixed(1)}h</strong> + Preventivas: <strong>${d.horasParadasPreventivaTotal.toFixed(1)}h</strong>
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border-l-4 border-blue-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">MTBF (Tempo Médio Entre Falhas)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.mtbfHoras.toFixed(1)} h</p>
          <p class="text-[11px] text-slate-500 mt-1">
            Calculado sobre <strong>${d.qtdFalhasCorretivasComParada}</strong> quebra(s) corretiva(s) c/ parada
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border-l-4 border-amber-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">MTTR (Tempo Médio Para Reparo)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.mttrHoras.toFixed(1)} h</p>
          <p class="text-[11px] text-slate-500 mt-1">
            Média de horas de oficina para sanar cada parada corretiva
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border-l-4 border-purple-500 shadow-sm">
          <span class="text-[11px] font-black uppercase text-slate-500">Confiabilidade Operacional R(24h)</span>
          <p class="text-3xl font-black text-slate-900 mt-1">${d.confiabilidade24h.toFixed(1)}%</p>
          <p class="text-[11px] text-slate-500 mt-1">
            Probabilidade de operar o próximo dia inteiro sem falha
          </p>
        </div>
      </div>

      <!-- LINHA 2: GESTÃO DE PCM, ALMOXARIFADO E VELOCIDADE DE ATENDIMENTO -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-black uppercase text-emerald-700">📅 Aderência às Preventivas</span>
          <p class="text-2xl font-black text-slate-900 mt-1">${d.aderenciaPreventivaPerc.toFixed(1)}%</p>
          <p class="text-[11px] text-slate-500 mt-1">
            <strong>${d.planosEmDia}</strong> máquina(s) no prazo • <strong class="text-rose-600">${d.planosVencidos}</strong> vencida(s)
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-black uppercase text-blue-700">⚡ Índice de Manut. Proativa</span>
          <p class="text-2xl font-black text-slate-900 mt-1">${d.indiceProatividadePerc.toFixed(1)}%</p>
          <p class="text-[11px] text-slate-500 mt-1">
            <strong>${d.qtdPreventivasExecutadasNoPeriodo}</strong> Prev. + <strong>${d.qtdAtendimentosComboioOportunidade}</strong> Comboio/Oport. + <strong>${d.qtdAvisosSemParada}</strong> Sem Parada
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-black uppercase text-amber-700">💰 Custos de Estoque & NFs</span>
          <p class="text-xl font-black text-slate-900 mt-1">${formatarMoedaBR(d.custoConsumidoNoPeriodo)} <span class="text-[10px] font-normal text-slate-500">(no período)</span></p>
          <p class="text-[11px] text-slate-500 mt-1">
            Capital Imobilizado na Prateleira: <strong>${formatarMoedaBR(d.valorImobilizadoEstoque)}</strong>
          </p>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-black uppercase text-rose-700">📡 Tempo Médio Resposta (Uber)</span>
          <p class="text-2xl font-black text-slate-900 mt-1">${d.tempoMedioAceiteUberMin} min</p>
          <p class="text-[11px] text-slate-500 mt-1">
            Da abertura pelo Encarregado até o aceite do Mecânico
          </p>
        </div>
      </div>

      <!-- LINHA 3: TABELAS ANALÍTICAS DETALHADAS (SEM GRÁFICOS) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- TABELA 1: TOP 10 VILÕES DE INDISPONIBILIDADE -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">
            🚨 Top 10 Críticos de Horas Paradas no Período
          </h3>
          ${topViloesParada.length === 0
            ? `<p class="text-xs text-slate-400 py-4 text-center">Nenhuma hora de máquina parada registrada no período.</p>`
            : `
              <table class="w-full text-left text-[11px]">
                <thead>
                  <tr class="text-slate-500 border-b">
                    <th class="py-1.5">Prefixo</th>
                    <th class="py-1.5 text-center">Falhas</th>
                    <th class="py-1.5 text-right">H. Corret.</th>
                    <th class="py-1.5 text-right">H. Prev.</th>
                    <th class="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${topViloesParada.map(m => `
                    <tr>
                      <td class="py-1.5 font-black text-amber-700">${m.tag}</td>
                      <td class="py-1.5 text-center font-bold">${m.qtdFalhas}</td>
                      <td class="py-1.5 text-right text-rose-600 font-bold">${m.horasCorretiva.toFixed(1)}h</td>
                      <td class="py-1.5 text-right text-blue-600 font-bold">${m.horasPreventiva.toFixed(1)}h</td>
                      <td class="py-1.5 text-right font-black text-slate-900">${m.totalParado.toFixed(1)}h</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
        </div>

        <!-- TABELA 2: CUSTO DE PEÇAS E NF DIRETA POR EQUIPAMENTO -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">
            💵 Top 10 Custos de Material / NF por Máquina
          </h3>
          ${topCustosMaquinas.length === 0
            ? `<p class="text-xs text-slate-400 py-4 text-center">Nenhuma saída valorizada registrada para máquinas neste período.</p>`
            : `
              <table class="w-full text-left text-[11px]">
                <thead>
                  <tr class="text-slate-500 border-b">
                    <th class="py-1.5">Prefixo</th>
                    <th class="py-1.5">Equipamento</th>
                    <th class="py-1.5 text-right">Custo Aplicado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${topCustosMaquinas.map(m => `
                    <tr>
                      <td class="py-1.5 font-black text-amber-700">${m.tag}</td>
                      <td class="py-1.5 font-semibold text-slate-700 truncate max-w-[140px]">${m.nome || '-'}</td>
                      <td class="py-1.5 text-right font-black text-emerald-700">${formatarMoedaBR(m.custoPecas)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
        </div>

        <!-- TABELA 3: PRODUTIVIDADE POR MECÂNICO (CHIPS APONTADOS NAS OS) -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 class="text-xs font-black uppercase text-slate-900 border-b pb-2 mb-3">
            👷 Produtividade da Equipe Técnica no Período
          </h3>
          ${rankingMecanicos.length === 0
            ? `<p class="text-xs text-slate-400 py-4 text-center">Nenhuma OS concluída com apontamento de mecânico neste período.</p>`
            : `
              <table class="w-full text-left text-[11px]">
                <thead>
                  <tr class="text-slate-500 border-b">
                    <th class="py-1.5">Profissional</th>
                    <th class="py-1.5 text-center">Corret.</th>
                    <th class="py-1.5 text-center">Comboio/S.Par.</th>
                    <th class="py-1.5 text-right">Total OS</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${rankingMecanicos.map(mec => `
                    <tr>
                      <td class="py-1.5 font-black text-slate-800">${mec.nome}</td>
                      <td class="py-1.5 text-center font-bold text-rose-600">${mec.corretivas}</td>
                      <td class="py-1.5 text-center font-bold text-emerald-700">${mec.comboio + mec.semParada}</td>
                      <td class="py-1.5 text-right font-black text-slate-900">${mec.total}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
        </div>

      </div>
    </div>
  `;
}

function exportarRelatorioKPIsCSV() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const cab = ['PERIODO_INICIO', 'PERIODO_FIM', 'PREFIXO_FILTRO', 'EXPORTADO_EM'];
  const linha = [filtroKpiDataInicio, filtroKpiDataFim, filtroKpiPrefixo || 'TODOS', new Date().toLocaleString('pt-BR')].join(';');
  const blob = new Blob(['\uFEFF' + cab.join(';') + '\n' + linha], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_KPIS_${filtroKpiDataInicio}_A_${filtroKpiDataFim}.csv`;
  a.click();
}
