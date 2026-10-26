// ============================================================================
// VILASA CMMS - MÓDULO 5: PCM_SAP.JS (MOTOR DE PREVENTIVAS SAP PM + BOM + HISTÓRICO PRÓPRIO)
// Responsabilidades:
// 1. Ciclos Hierárquicos (250/500/1000/2000h) + Ritmo Diário + Data Prevista
// 2. Histórico Próprio ('execucoes_preventiva') 100% separado das OS Corretivas
// 3. Integração Transparente com o Quadro REP (Paradas Preventivas entram no REP sem virar OS Corretiva)
// 4. Cadastro de Plano já com Histórico Completo Retroativo (Data, Horímetro e Pacote)
// 5. Semáforo de Estoque (BOM) e Exportação de Planilha Exclusiva de Preventivas
// ============================================================================

let cachePlanosPreventiva = [];
let cacheExecucoesPreventiva = [];
let cacheBomItens = [];
let subAbaPreventivaAtual = 'painel'; // 'painel', 'em_execucao', 'historico', 'bom'

// ----------------------------------------------------------------------------
// 1. CÁLCULO HIERÁRQUICO SAP PM (QUAL É O PRÓXIMO PACOTE E QUANDO VENCE)
// ----------------------------------------------------------------------------
function calcularProximoCicloHierarquico(horimetroUltimo, intervaloBase = 250) {
  const base = Number(intervaloBase) || 250;
  const proximoAlvo = Number(horimetroUltimo || 0) + base;

  // Determina qual pacote múltiplo corresponde ao alvo (ex: múltiplo de 2000, 1000, 500 ou 250)
  let pacote = `${base}H`;
  if (base === 250) {
    if (proximoAlvo % 2000 === 0) pacote = '2000H';
    else if (proximoAlvo % 1000 === 0) pacote = '1000H';
    else if (proximoAlvo % 500 === 0) pacote = '500H';
    else pacote = '250H';
  } else if (base === 500) {
    if (proximoAlvo % 2000 === 0) pacote = '2000H';
    else if (proximoAlvo % 1000 === 0) pacote = '1000H';
    else pacote = '500H';
  }

  return { proximoHorimetroAlvo: proximoAlvo, proximoPacote: pacote };
}

function calcularStatusPlanoPreventiva(plano, equipamento) {
  const horAtual = parseFloat(equipamento?.horimetro_atual || 0);
  const horUltimo = parseFloat(plano?.ultimo_horimetro_execucao || 0);
  const intervalo = parseFloat(plano?.intervalo_base || 250);
  const ritmo = Math.max(0.5, parseFloat(plano?.ritmo_uso_diario || equipamento?.estimativa_uso_diario || 8.0));

  const { proximoHorimetroAlvo, proximoPacote } = calcularProximoCicloHierarquico(horUltimo, intervalo);
  const saldoHoras = Number((proximoHorimetroAlvo - horAtual).toFixed(1));
  const diasRestantes = Math.ceil(saldoHoras / ritmo);

  const dataPrevista = new Date();
  dataPrevista.setDate(dataPrevista.getDate() + diasRestantes);

  const limiarAtencao = String(equipamento?.unidade_medida || 'H').toUpperCase() === 'KM' ? 1500 : 50;

  let faixa = 'no_prazo'; // 🟢
  if (saldoHoras <= 0) faixa = 'vencida'; // 🔴
  else if (saldoHoras <= limiarAtencao) faixa = 'atencao'; // 🟡

  return {
    horAtual,
    horUltimo,
    proximoHorimetroAlvo,
    proximoPacote,
    saldoHoras,
    diasRestantes,
    dataPrevista,
    ritmo,
    faixa
  };
}

// Verifica no Almoxarifado se todas as peças da BOM daquele modelo/pacote têm saldo suficiente
function verificarSemaforoEstoqueBOM(equipamento, proximoPacote) {
  if (!equipamento || !Array.isArray(cacheBomItens) || cacheBomItens.length === 0) {
    return { status: 'sem_bom', label: '⚪ Sem BOM cadastrada', faltantes: [] };
  }

  const modeloLimpo = String(equipamento.modelo || equipamento.nome || '').trim().toUpperCase();
  const tagLimpa = String(equipamento.tag || '').trim().toUpperCase();

  // Pacotes menores também entram na revisão maior (ex: 1000H usa kit de 250H/500H se cadastrado ou kit específico de 1000H)
  const itensDoPacote = cacheBomItens.filter(item => {
    const fam = String(item.familia_modelo || '').trim().toUpperCase();
    const bateMaquina = fam === tagLimpa || (fam && modeloLimpo.includes(fam)) || (fam && String(equipamento.nome || '').toUpperCase().includes(fam));
    return bateMaquina && String(item.pacote).toUpperCase() === String(proximoPacote).toUpperCase();
  });

  if (itensDoPacote.length === 0) {
    return { status: 'sem_bom', label: '⚪ Sem kit vinculado', faltantes: [] };
  }

  const faltantes = [];
  itensDoPacote.forEach(item => {
    const peca = (cachePecas || []).find(p => String(p.id) === String(item.peca_id));
    const saldoDisponivel = parseFloat(peca?.quantidade || 0);
    if (saldoDisponivel < parseFloat(item.quantidade || 1)) {
      faltantes.push(`${peca?.codigo || 'PEÇA'} (${saldoDisponivel}/${item.quantidade})`);
    }
  });

  if (faltantes.length > 0) {
    return {
      status: 'falta_peca',
      label: `🔴 FALTA MATERIAL: ${faltantes.join(', ')}`,
      faltantes
    };
  }
  return { status: 'ok', label: '🟢 KIT 100% EM ESTOQUE', faltantes: [] };
}

// ----------------------------------------------------------------------------
// 2. CARREGAMENTO CENTRAL DO MÓDULO DE PREVENTIVAS (ONLINE + OFFLINE)
// ----------------------------------------------------------------------------
async function carregarPreventivas(subAba = subAbaPreventivaAtual) {
  subAbaPreventivaAtual = subAba;

  const [resPlanos, resExecs, resBom, resEquip, resPecas] = await Promise.all([
    lerDadosComFallbackOffline('planos_preventiva', () => db.from('planos_preventiva').select('*')),
    lerDadosComFallbackOffline('execucoes_preventiva', () => db.from('execucoes_preventiva').select('*').order('horimetro_execucao', { ascending: false })),
    lerDadosComFallbackOffline('preventiva_bom_itens', () => db.from('preventiva_bom_itens').select('*')),
    (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
      ? Promise.resolve({ data: cacheEquipamentos })
      : lerDadosComFallbackOffline('equipamentos', () => db.from('equipamentos').select('*').order('tag')),
    (typeof cachePecas !== 'undefined' && cachePecas.length > 0)
      ? Promise.resolve({ data: cachePecas })
      : lerDadosComFallbackOffline('pecas_estoque', () => db.from('pecas_estoque').select('*'))
  ]);

  cacheEquipamentos = resEquip.data || [];
  cachePecas = resPecas.data || [];
  cachePlanosPreventiva = resPlanos.data || [];
  cacheExecucoesPreventiva = resExecs.data || [];
  cacheBomItens = resBom.data || [];

  renderizarInterfaceCompletaPCM();

  // Atualiza também o Quadro REP caso haja preventivas em andamento com máquina parada
  if (typeof renderizarQuadroEnxutoParadosREP === 'function' && typeof cacheOrdens !== 'undefined') {
    renderizarQuadroEnxutoParadosREP(cacheOrdens);
  }
}

// ----------------------------------------------------------------------------
// 3. INTEGRAÇÃO AUTOMÁTICA COM O QUADRO REP (SEM MISTURAR COM OS CORRETIVA!)
// ----------------------------------------------------------------------------
// Faz um "hook" limpo no renderizador do REP para somar as máquinas paradas em Preventiva
const _renderREPOriginal = typeof renderizarQuadroEnxutoParadosREP === 'function' ? renderizarQuadroEnxutoParadosREP : null;

window.renderizarQuadroEnxutoParadosREP = function (listaOrdensCorretivas = []) {
  // Busca preventivas que estão 'em_execucao' com máquina parada neste momento
  let prevParadas = (cacheExecucoesPreventiva || []).filter(p =>
    p.status === 'em_execucao' && p.parada_obrigatoria !== false && !p.data_conclusao
  );

  if (typeof filtrarListaPorObraAtiva === 'function') {
    prevParadas = filtrarListaPorObraAtiva(prevParadas);
  }

  // Converte apenas visualmente para o formato da linha do Quadro REP (sem gravar na tabela ordens_servico!)
  const linhasPrevParaREP = prevParadas.map(p => {
    const eq = (cacheEquipamentos || []).find(e => String(e.id) === String(p.equipamento_id));
    return {
      id: p.id,
      equipamento_id: p.equipamento_id,
      equipamentos: eq || { tag: 'EQUIP', nome: 'Equipamento em Preventiva', marca: '-' },
      parada_obrigatoria: true,
      status: 'em_execucao',
      motivo_rep: `PREVENTIVA ${p.pacote}`,
      descricao_problema: p.observacoes || `Revisão Programada do Pacote ${p.pacote}`,
      aberta_em: p.data_entrada || p.criado_em,
      previsao_liberacao: p.previsao_liberacao || null,
      mecanico_nome: p.mecanicos_nomes || 'Equipe Preventiva',
      concluida_em: null
    };
  });

  const listaUnificadaParaQuadroREP = [...(listaOrdensCorretivas || []), ...linhasPrevParaREP];
  if (_renderREPOriginal) {
    _renderREPOriginal(listaUnificadaParaQuadroREP);
  }
};

// ----------------------------------------------------------------------------
// 4. INTERFACE COMPLETA DO MÓDULO PCM SAP (PAINEL + EM EXECUÇÃO + HISTÓRICO PRÓPRIO + BOM)
// ----------------------------------------------------------------------------
function renderizarInterfaceCompletaPCM() {
  const sec = document.getElementById('sec-preventivas');
  if (!sec) return;

  const podeEditar = podeExecutarAcao('gerenciar_preventivas');

  let planosVisiveis = cachePlanosPreventiva.map(pl => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(pl.equipamento_id));
    return { ...pl, equipamento: eq };
  }).filter(pl => Boolean(pl.equipamento));

  if (typeof filtrarListaPorObraAtiva === 'function') {
    planosVisiveis = planosVisiveis.filter(pl => {
      if (!obraAtivaId || obraAtivaId === 'TODAS') return true;
      return !pl.equipamento.obra_id || pl.equipamento.obra_id === obraAtivaId;
    });
  }

  const termoBusca = (document.getElementById('filtroPrefixoPCM')?.value || '').trim().toUpperCase();
  if (termoBusca) {
    planosVisiveis = planosVisiveis.filter(pl => bateComPrefixoEquipamento(pl.equipamento?.tag || '', termoBusca));
  }

  // Calcula indicadores rápidos das preventivas
  let contVencidas = 0;
  let contAtencao = 0;
  let contNoPrazo = 0;

  const planosCalculados = planosVisiveis.map(pl => {
    const calc = calcularStatusPlanoPreventiva(pl, pl.equipamento);
    const bom = verificarSemaforoEstoqueBOM(pl.equipamento, calc.proximoPacote);
    if (calc.faixa === 'vencida') contVencidas++;
    else if (calc.faixa === 'atencao') contAtencao++;
    else contNoPrazo++;
    return { ...pl, calc, bom };
  }).sort((a, b) => a.calc.saldoHoras - b.calc.saldoHoras);

  const execucoesAtivas = cacheExecucoesPreventiva.filter(e => e.status === 'em_execucao' && !e.data_conclusao);

  sec.innerHTML = `
    <div class="space-y-5">
      <!-- Cabeçalho e KPIs de Preventiva -->
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ENGENHARIA DE MANUTENÇÃO • SAP PM</span>
          <h2 class="text-lg font-black">Controle de Planos Preventivos & Histórico Próprio</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          ${podeEditar ? `
            <button onclick="abrirModalPlanoComHistoricoCompleto()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-calendar-plus"></i>
              <span>+ Criar / Editar Plano + Histórico Passado</span>
            </button>
          ` : ''}
          <button onclick="exportarHistoricoProprioPreventivasCSV()" class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow flex items-center gap-1.5">
            <i class="fa-solid fa-file-excel"></i>
            <span>📊 Exportar Planilha Exclusiva de Preventivas</span>
          </button>
        </div>
      </div>

      <!-- Resumo de Semáforo -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="bg-rose-50 border border-rose-200 p-3.5 rounded-xl">
          <span class="text-[11px] font-black uppercase text-rose-700">🔴 Vencidas / Críticas</span>
          <p class="text-2xl font-black text-rose-900 mt-1">${contVencidas}</p>
        </div>
        <div class="bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
          <span class="text-[11px] font-black uppercase text-amber-800">🟡 Atenção (≤ 50h)</span>
          <p class="text-2xl font-black text-amber-900 mt-1">${contAtencao}</p>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
          <span class="text-[11px] font-black uppercase text-emerald-800">🟢 No Prazo</span>
          <p class="text-2xl font-black text-emerald-900 mt-1">${contNoPrazo}</p>
        </div>
        <div class="bg-blue-50 border border-blue-200 p-3.5 rounded-xl">
          <span class="text-[11px] font-black uppercase text-blue-800">🛠️ Em Execução Agora (No REP)</span>
          <p class="text-2xl font-black text-blue-900 mt-1">${execucoesAtivas.length}</p>
        </div>
      </div>

      <!-- Sub-abas do Módulo PCM -->
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarPreventivas('painel')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'painel' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            📅 Painel de Projeção SAP PM (${planosCalculados.length})
          </button>
          <button onclick="carregarPreventivas('em_execucao')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'em_execucao' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🔧 Preventivas em Andamento (${execucoesAtivas.length})
          </button>
          <button onclick="carregarPreventivas('historico')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'historico' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            📜 Histórico Próprio de Preventivas (${cacheExecucoesPreventiva.length})
          </button>
          <button onclick="carregarPreventivas('bom')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'bom' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            📦 Kits de Peças (BOM)
          </button>
        </div>

        <input id="filtroPrefixoPCM" type="text" value="${termoBusca}" oninput="renderizarInterfaceCompletaPCM()"
          placeholder="🔍 Filtrar Prefixo (ex: EH-40)..."
          class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold uppercase focus:outline-none focus:border-amber-500" />
      </div>

      <!-- Conteúdo Dinâmico da Sub-Aba -->
      <div id="conteudoSubAbaPCM">
        ${subAbaPreventivaAtual === 'painel' ? renderizarTabelaProjeçaoPCM(planosCalculados, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'em_execucao' ? renderizarPreventivasEmExecucao(execucoesAtivas, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'historico' ? renderizarTabelaHistoricoProprioPreventivas(termoBusca, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'bom' ? renderizarGerenciadorBOM(podeEditar) : ''}
      </div>
    </div>
  `;
}

function renderizarTabelaProjeçaoPCM(planosCalculados, podeEditar) {
  if (planosCalculados.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhum plano preventivo cadastrado para este filtro. Clique em "+ Criar / Editar Plano + Histórico Passado" no topo.</div>`;
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Prefixo / Máquina</th>
            <th class="p-3">Última Preventiva</th>
            <th class="p-3">Horímetro Atual</th>
            <th class="p-3">Próximo Pacote</th>
            <th class="p-3">Saldo Restante</th>
            <th class="p-3">Data Prevista</th>
            <th class="p-3">Semáforo Estoque (BOM)</th>
            <th class="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${planosCalculados.map(p => {
            const c = p.calc;
            const un = p.equipamento.unidade_medida || 'H';
            const badgeFaixa = c.faixa === 'vencida'
              ? `<span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black">${c.saldoHoras} ${un} (VENCIDA)</span>`
              : (c.faixa === 'atencao'
                ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black">Faltam ${c.saldoHoras} ${un}</span>`
                : `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Faltam ${c.saldoHoras} ${un}</span>`);

            const dtUltima = p.ultima_data_execucao ? new Date(p.ultima_data_execucao + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3">
                  <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded">${p.equipamento.tag}</span>
                  <div class="font-bold text-slate-600 mt-0.5">${p.equipamento.nome}</div>
                </td>
                <td class="p-3 font-semibold text-slate-700">
                  <div><strong>${p.ultimo_pacote_executado || '250H'}</strong> aos <strong>${c.horUltimo} ${un}</strong></div>
                  <div class="text-[11px] text-slate-500">Data: ${dtUltima}</div>
                </td>
                <td class="p-3 font-black text-slate-900">${c.horAtual} ${un}</td>
                <td class="p-3">
                  <span class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-black">${c.proximoPacote}</span>
                  <div class="text-[11px] text-slate-500 mt-0.5">Alvo: ${c.proximoHorimetroAlvo} ${un}</div>
                </td>
                <td class="p-3">${badgeFaixa}</td>
                <td class="p-3 font-bold text-slate-800">
                  ${c.dataPrevista.toLocaleDateString('pt-BR')}
                  <div class="text-[10px] text-slate-400">Ritmo: ${c.ritmo} ${un}/dia</div>
                </td>
                <td class="p-3 font-bold text-[11px]">${p.bom.label}</td>
                <td class="p-3 text-right space-x-1 whitespace-nowrap">
                  ${podeEditar ? `
                    <button onclick="iniciarParadaPreventivaNoREP('${p.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px]" title="Encostar máquina para executar revisão (entra no Quadro REP, mas salva histórico separado)">
                      🛑 Iniciar no REP
                    </button>
                    <button onclick="abrirModalConcluirPreventivaDireto('${p.id}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px]" title="Dar baixa direta na revisão">
                      ✅ Baixar Revisão
                    </button>
                    <button onclick="abrirModalPlanoComHistoricoCompleto('${p.equipamento_id}')" class="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px]" title="Editar Plano e Histórico Passado">
                      📜 Histórico
                    </button>
                  ` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 5. PREVENTIVAS EM ANDAMENTO (APARECEM NO QUADRO REP DE PARADOS, MAS NÃO SÃO OS CORRETIVA)
// ----------------------------------------------------------------------------
async function iniciarParadaPreventivaNoREP(planoId) {
  if (!podeExecutarAcao('gerenciar_preventivas', true)) return;
  const plano = cachePlanosPreventiva.find(p => String(p.id) === String(planoId));
  if (!plano) return;

  const eq = cacheEquipamentos.find(e => String(e.id) === String(plano.equipamento_id));
  const calc = calcularStatusPlanoPreventiva(plano, eq);

  const prevLib = prompt(`Equipamento ${eq?.tag}: Informe a Data Prevista de Liberação (AAAA-MM-DD) para o Quadro REP:`, new Date().toISOString().slice(0, 10));
  if (prevLib === null) return;

  await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
    plano_id: plano.id,
    equipamento_id: plano.equipamento_id,
    obra_id: eq?.obra_id || null,
    pacote: calc.proximoPacote,
    status: 'em_execucao',
    parada_obrigatoria: true,
    data_entrada: new Date().toISOString(),
    previsao_liberacao: prevLib || null,
    horimetro_execucao: eq?.horimetro_atual || calc.proximoHorimetroAlvo,
    observacoes: `Revisão Programada ${calc.proximoPacote} em andamento`
  });

  alert(`🛑 ${eq?.tag} entrou em execução de Preventiva (${calc.proximoPacote}). Ela já está visível no Quadro de Parados (REP), sem sujar a planilha de OS Corretiva!`);
  await carregarPreventivas('em_execucao');
}

function renderizarPreventivasEmExecucao(listaAtivas, podeEditar) {
  if (listaAtivas.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhuma máquina parada em execução de preventiva no momento.</div>`;
  }

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${listaAtivas.map(ex => {
        const eq = cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id));
        return `
          <div class="bg-white p-4 rounded-xl border-2 border-blue-500 shadow flex flex-col justify-between gap-3">
            <div>
              <div class="flex items-center justify-between">
                <span class="bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded text-sm">${eq?.tag || 'EQUIP'}</span>
                <span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded">🛠️ PREVENTIVA ${ex.pacote} NO REP</span>
              </div>
              <p class="text-xs font-bold text-slate-700 mt-1">${eq?.nome || ''}</p>
              <p class="text-xs text-slate-500 mt-1">Início da Parada: <strong>${new Date(ex.data_entrada).toLocaleString('pt-BR')}</strong></p>
              <p class="text-xs text-slate-500">Horímetro na Parada: <strong>${ex.horimetro_execucao}</strong></p>
            </div>
            ${podeEditar ? `
              <button onclick="concluirPreventivaQueEstavaNoREP('${ex.id}')" class="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase shadow">
                ✅ Concluir Preventiva e Liberar do REP
              </button>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function concluirPreventivaQueEstavaNoREP(execId) {
  const ex = cacheExecucoesPreventiva.find(e => String(e.id) === String(execId));
  if (!ex) return;

  const eq = cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id));
  const horFinal = parseFloat(prompt(`Confirme o Horímetro/KM de conclusão da revisão ${ex.pacote}:`, ex.horimetro_execucao || eq?.horimetro_atual || 0));
  if (isNaN(horFinal)) return;

  const mecNomes = prompt('Informe os mecânicos que executaram a revisão:', ex.mecanicos_nomes || usuarioLogado?.nome || '') || '';
  const agoraISO = new Date().toISOString();

  await gravarDadosOfflineSafe('execucoes_preventiva', 'UPDATE', {
    status: 'concluida',
    data_conclusao: agoraISO,
    horimetro_execucao: horFinal,
    mecanicos_nomes: mecNomes
  }, execId);

  // Atualiza o plano mestre com esta última preventiva concluída
  if (ex.plano_id) {
    await gravarDadosOfflineSafe('planos_preventiva', 'UPDATE', {
      ultimo_horimetro_execucao: horFinal,
      ultima_data_execucao: agoraISO.slice(0, 10),
      ultimo_pacote_executado: ex.pacote
    }, ex.plano_id);
  }

  await carregarPreventivas('painel');
}

async function abrirModalConcluirPreventivaDireto(planoId) {
  const plano = cachePlanosPreventiva.find(p => String(p.id) === String(planoId));
  if (!plano) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(plano.equipamento_id));
  const calc = calcularStatusPlanoPreventiva(plano, eq);

  const pacote = prompt(`Qual pacote de preventiva foi executado na ${eq?.tag}?`, calc.proximoPacote);
  if (!pacote) return;
  const hor = parseFloat(prompt(`Horímetro/KM no momento da execução:`, eq?.horimetro_atual || calc.proximoHorimetroAlvo));
  if (isNaN(hor)) return;
  const dt = prompt(`Data da execução (AAAA-MM-DD):`, new Date().toISOString().slice(0, 10));
  if (!dt) return;

  await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
    plano_id: plano.id,
    equipamento_id: plano.equipamento_id,
    obra_id: eq?.obra_id || null,
    pacote: pacote.toUpperCase().trim(),
    status: 'concluida',
    parada_obrigatoria: false,
    data_entrada: new Date(dt + 'T08:00:00').toISOString(),
    data_conclusao: new Date(dt + 'T12:00:00').toISOString(),
    horimetro_execucao: hor,
    mecanicos_nomes: usuarioLogado?.nome || 'PCM',
    observacoes: 'Baixa direta de revisão preventiva'
  });

  await gravarDadosOfflineSafe('planos_preventiva', 'UPDATE', {
    ultimo_horimetro_execucao: hor,
    ultima_data_execucao: dt,
    ultimo_pacote_executado: pacote.toUpperCase().trim()
  }, plano.id);

  await carregarPreventivas('painel');
}

// ----------------------------------------------------------------------------
// 6. MODAL PARA CRIAR PLANO JÁ COM HISTÓRICO COMPLETO DE PREVENTIVAS PASSADAS
// (Basta informar DATA, HORÍMETRO e PACOTE de cada preventiva já feita!)
// ----------------------------------------------------------------------------
function abrirModalPlanoComHistoricoCompleto(equipamentoIdPreSelecionado = '') {
  if (!podeExecutarAcao('gerenciar_preventivas', true)) return;

  let modal = document.getElementById('modalPlanoHistoricoCompletoV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalPlanoHistoricoCompletoV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div>
          <span class="bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded text-[10px] uppercase">Configuração & Memória Técnica</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Plano Preventivo + Histórico Completo do Equipamento</h3>
        </div>
        <button onclick="document.getElementById('modalPlanoHistoricoCompletoV2').classList.add('hidden')" class="text-slate-400 hover:text-slate-700 text-xl font-black">&times;</button>
      </div>

      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">1. Equipamento (Prefixo)</label>
            <select id="planoHistEquipId" onchange="carregarDadosExistentesNoModalPlano(this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
              <option value="">-- Selecione o Equipamento --</option>
              ${cacheEquipamentos.map(e => `<option value="${e.id}" ${String(e.id) === String(equipamentoIdPreSelecionado) ? 'selected' : ''}>${e.tag} - ${e.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">2. Intervalo Base (H ou KM)</label>
            <select id="planoHistIntervalo" class="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white">
              <option value="250">Ciclo 250h (250 / 500 / 1000 / 2000h)</option>
              <option value="500">Ciclo 500h (500 / 1000 / 2000h)</option>
              <option value="10000">Ciclo 10.000 KM (Veículos/Rodoviários)</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">3. Ritmo Médio Diário</label>
            <input id="planoHistRitmo" type="number" step="0.5" value="8.0" class="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>

        <!-- GRADE DE HISTÓRICO RETROATIVO (DATA + HORÍMETRO + PACOTE) -->
        <div class="border border-slate-200 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h4 class="font-black text-slate-900 uppercase">📜 Histórico de Preventivas Já Realizadas nesta Máquina</h4>
              <p class="text-[11px] text-slate-500">Informe apenas <strong>Data</strong>, <strong>Horímetro</strong> e <strong>Pacote</strong>. O sistema usará a maior leitura como referência atual do plano!</p>
            </div>
            <button type="button" onclick="adicionarLinhaHistoricoPreventivaModal()" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs">
              + Adicionar Preventiva Feita
            </button>
          </div>

          <div class="max-h-60 overflow-y-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-100 text-slate-700 uppercase text-[10px]">
                  <th class="p-2">Data da Preventiva</th>
                  <th class="p-2">Horímetro / KM na Época</th>
                  <th class="p-2">Pacote Executado</th>
                  <th class="p-2 text-center">Remover</th>
                </tr>
              </thead>
              <tbody id="tbodyLinhasHistoricoPreventivaModal" class="divide-y divide-slate-200">
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalPlanoHistoricoCompletoV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200 text-slate-700">Cancelar</button>
        <button onclick="salvarPlanoComHistoricoCompleto()" class="px-5 py-2.5 rounded-lg font-black text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow">
          💾 Salvar Plano e Todo o Histórico
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  const sel = document.getElementById('planoHistEquipId');
  if (sel && typeof ativarBuscaPorPrefixoEmSelect === 'function') {
    ativarBuscaPorPrefixoEmSelect(sel);
  }

  if (equipamentoIdPreSelecionado) {
    carregarDadosExistentesNoModalPlano(equipamentoIdPreSelecionado);
  } else {
    adicionarLinhaHistoricoPreventivaModal();
  }
}

function adicionarLinhaHistoricoPreventivaModal(data = '', horimetro = '', pacote = '250H', idExistente = '') {
  const tbody = document.getElementById('tbodyLinhasHistoricoPreventivaModal');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'linha-hist-prev-modal';
  tr.dataset.idExistente = idExistente;

  const pacotesPadrao = ['250H', '500H', '1000H', '2000H', '10000KM', '20000KM'];

  tr.innerHTML = `
    <td class="p-1.5">
      <input type="date" value="${data}" class="inp-hist-data w-full border border-slate-300 rounded p-1.5 font-bold" required />
    </td>
    <td class="p-1.5">
      <input type="number" step="0.1" value="${horimetro}" placeholder="Ex: 1250" class="inp-hist-hor w-full border border-slate-300 rounded p-1.5 font-bold" required />
    </td>
    <td class="p-1.5">
      <select class="inp-hist-pacote w-full border border-slate-300 rounded p-1.5 font-bold">
        ${pacotesPadrao.map(p => `<option value="${p}" ${String(pacote).toUpperCase() === p ? 'selected' : ''}>Pacote ${p}</option>`).join('')}
      </select>
    </td>
    <td class="p-1.5 text-center">
      <button type="button" onclick="this.closest('tr').remove()" class="text-rose-600 hover:text-rose-800 font-black px-2 py-1">🗑️</button>
    </td>
  `;
  tbody.appendChild(tr);
}

function carregarDadosExistentesNoModalPlano(equipamentoId) {
  const tbody = document.getElementById('tbodyLinhasHistoricoPreventivaModal');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!equipamentoId) return;

  const plano = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(equipamentoId));
  if (plano) {
    document.getElementById('planoHistIntervalo').value = String(plano.intervalo_base || 250);
    document.getElementById('planoHistRitmo').value = String(plano.ritmo_uso_diario || 8.0);
  }

  const historicoDaMaquina = cacheExecucoesPreventiva
    .filter(e => String(e.equipamento_id) === String(equipamentoId) && e.status === 'concluida')
    .sort((a, b) => parseFloat(a.horimetro_execucao) - parseFloat(b.horimetro_execucao));

  if (historicoDaMaquina.length > 0) {
    historicoDaMaquina.forEach(h => {
      const dt = (h.data_conclusao || h.data_entrada || '').slice(0, 10);
      adicionarLinhaHistoricoPreventivaModal(dt, h.horimetro_execucao, h.pacote, h.id);
    });
  } else if (plano && plano.ultimo_horimetro_execucao > 0) {
    adicionarLinhaHistoricoPreventivaModal(plano.ultima_data_execucao || new Date().toISOString().slice(0, 10), plano.ultimo_horimetro_execucao, plano.ultimo_pacote_executado || '250H');
  } else {
    adicionarLinhaHistoricoPreventivaModal(new Date().toISOString().slice(0, 10), '', '250H');
  }
}

async function salvarPlanoComHistoricoCompleto() {
  const eqId = document.getElementById('planoHistEquipId').value;
  const intervalo = parseFloat(document.getElementById('planoHistIntervalo').value) || 250;
  const ritmo = parseFloat(document.getElementById('planoHistRitmo').value) || 8.0;

  if (!eqId) return alert('Selecione o equipamento!');

  const eq = cacheEquipamentos.find(e => String(e.id) === String(eqId));
  const linhas = Array.from(document.querySelectorAll('#tbodyLinhasHistoricoPreventivaModal .linha-hist-prev-modal'));

  const registrosHistorico = [];
  for (const tr of linhas) {
    const dt = tr.querySelector('.inp-hist-data')?.value;
    const hor = parseFloat(tr.querySelector('.inp-hist-hor')?.value);
    const pac = tr.querySelector('.inp-hist-pacote')?.value || '250H';
    const idExistente = tr.dataset.idExistente;

    if (dt && !isNaN(hor)) {
      registrosHistorico.push({ dt, hor, pac, idExistente });
    }
  }

  // Descobre qual foi a última preventiva feita (maior horímetro) para alimentar o cabeçalho do plano
  let ultimoHor = 0;
  let ultimaData = new Date().toISOString().slice(0, 10);
  let ultimoPacote = '250H';

  if (registrosHistorico.length > 0) {
    const ordenados = [...registrosHistorico].sort((a, b) => b.hor - a.hor);
    ultimoHor = ordenados[0].hor;
    ultimaData = ordenados[0].dt;
    ultimoPacote = ordenados[0].pac;
  }

  const planoExistente = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(eqId));
  let planoId = planoExistente?.id || null;

  const payloadPlano = {
    equipamento_id: eqId,
    obra_id: eq?.obra_id || null,
    intervalo_base: intervalo,
    ultimo_horimetro_execucao: ultimoHor,
    ultima_data_execucao: ultimaData,
    ultimo_pacote_executado: ultimoPacote,
    ritmo_uso_diario: ritmo,
    ativo: true
  };

  if (planoId) {
    await gravarDadosOfflineSafe('planos_preventiva', 'UPDATE', payloadPlano, planoId);
  } else {
    const resIns = await gravarDadosOfflineSafe('planos_preventiva', 'INSERT', payloadPlano);
    planoId = resIns.data?.id || null;
  }

  // Grava na tabela própria 'execucoes_preventiva' todas as linhas novas do histórico passado
  for (const item of registrosHistorico) {
    if (!item.idExistente) {
      await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
        plano_id: planoId,
        equipamento_id: eqId,
        obra_id: eq?.obra_id || null,
        pacote: item.pac,
        status: 'concluida',
        parada_obrigatoria: false,
        data_entrada: new Date(item.dt + 'T08:00:00').toISOString(),
        data_conclusao: new Date(item.dt + 'T12:00:00').toISOString(),
        horimetro_execucao: item.hor,
        observacoes: 'Histórico de preventiva registrado no plano'
      });
    }
  }

  document.getElementById('modalPlanoHistoricoCompletoV2')?.classList.add('hidden');
  await carregarPreventivas('painel');
}

// ----------------------------------------------------------------------------
// 7. VISUALIZAÇÃO E EXPORTAÇÃO DA PLANILHA PRÓPRIA DE HISTÓRICO DE PREVENTIVAS
// ----------------------------------------------------------------------------
function renderizarTabelaHistoricoProprioPreventivas(termoBusca = '') {
  let lista = cacheExecucoesPreventiva.map(ex => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id));
    return { ...ex, equipamento: eq };
  });

  if (typeof filtrarListaPorObraAtiva === 'function') {
    lista = lista.filter(item => !obraAtivaId || obraAtivaId === 'TODAS' || item.equipamento?.obra_id === obraAtivaId);
  }
  if (termoBusca) {
    lista = lista.filter(item => bateComPrefixoEquipamento(item.equipamento?.tag || '', termoBusca));
  }

  if (lista.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhum registro encontrado no Histórico Próprio de Preventivas.</div>`;
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Data</th>
            <th class="p-3">Prefixo</th>
            <th class="p-3">Equipamento</th>
            <th class="p-3">Pacote Executado</th>
            <th class="p-3">Horímetro / KM na Execução</th>
            <th class="p-3">Status</th>
            <th class="p-3">Equipe / Observações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${lista.map(h => {
            const dt = h.data_conclusao || h.data_entrada || h.criado_em;
            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3 font-bold text-slate-700">${dt ? new Date(dt).toLocaleDateString('pt-BR') : '-'}</td>
                <td class="p-3 font-black text-amber-700">${h.equipamento?.tag || '-'}</td>
                <td class="p-3 font-semibold text-slate-800">${h.equipamento?.nome || '-'}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-black">${h.pacote}</span></td>
                <td class="p-3 font-black text-slate-900">${h.horimetro_execucao} ${h.equipamento?.unidade_medida || 'H'}</td>
                <td class="p-3 font-bold ${h.status === 'concluida' ? 'text-emerald-700' : 'text-amber-600'}">${h.status.toUpperCase()}</td>
                <td class="p-3 text-slate-600">${h.mecanicos_nomes ? `👷 ${h.mecanicos_nomes} • ` : ''}${h.observacoes || ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Exporta um CSV/Excel exclusivo de Preventivas, 100% separado da planilha de OS Corretiva
function exportarHistoricoProprioPreventivasCSV() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;

  const cabecalho = ['DATA_EXECUCAO', 'PREFIXO', 'EQUIPAMENTO', 'MARCA', 'PACOTE_PREVENTIVA', 'HORIMETRO_KM', 'STATUS', 'EQUIPE', 'OBSERVACOES'];
  const linhas = cacheExecucoesPreventiva.map(h => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(h.equipamento_id));
    const dt = h.data_conclusao || h.data_entrada || h.criado_em;
    return [
      dt ? new Date(dt).toLocaleDateString('pt-BR') : '',
      eq?.tag || '',
      (eq?.nome || '').replace(/;/g, ','),
      (eq?.marca || '').replace(/;/g, ','),
      h.pacote || '',
      String(h.horimetro_execucao || 0).replace('.', ','),
      h.status || '',
      (h.mecanicos_nomes || '').replace(/;/g, ','),
      (h.observacoes || '').replace(/;/g, ',')
    ].join(';');
  });

  const conteudoCSV = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\n');
  const blob = new Blob([conteudoCSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VILASA_HISTORICO_EXCLUSIVO_PREVENTIVAS_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ----------------------------------------------------------------------------
// 8. GERENCIADOR SIMPLIFICADO DE LISTA TÉCNICA (BOM) POR MODELO/PACOTE
// ----------------------------------------------------------------------------
function renderizarGerenciadorBOM(podeEditar) {
  return `
    <div class="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-black text-slate-900 text-sm uppercase">📦 Kits de Peças por Família/Equipamento e Pacote (BOM)</h4>
          <p class="text-xs text-slate-500">Vincule os filtros e óleos do almoxarifado aos pacotes 250H, 500H, 1000H ou 2000H.</p>
        </div>
      </div>

      ${podeEditar ? `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
          <input id="bomFamiliaInput" type="text" placeholder="Prefixo ou Modelo (ex: EH-40 ou CAT)" class="border border-slate-300 rounded-lg p-2 font-bold uppercase" />
          <select id="bomPacoteSelect" class="border border-slate-300 rounded-lg p-2 font-bold">
            <option value="250H">Pacote 250H</option>
            <option value="500H">Pacote 500H</option>
            <option value="1000H">Pacote 1000H</option>
            <option value="2000H">Pacote 2000H</option>
          </select>
          <select id="bomPecaSelect" class="border border-slate-300 rounded-lg p-2 font-bold">
            <option value="">-- Peça do Almoxarifado --</option>
            ${cachePecas.map(p => `<option value="${p.id}">${p.codigo} - ${p.descricao} (Saldo: ${p.quantidade})</option>`).join('')}
          </select>
          <div class="flex gap-1">
            <input id="bomQtdInput" type="number" step="0.5" value="1" class="w-20 border border-slate-300 rounded-lg p-2 font-bold" />
            <button onclick="adicionarItemBOMPreventiva()" class="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg px-3">+ Vincular</button>
          </div>
        </div>
      ` : ''}

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 text-slate-700 uppercase text-[11px]">
              <th class="p-2.5">Família / Prefixo</th>
              <th class="p-2.5">Pacote</th>
              <th class="p-2.5">Peça / Insumo</th>
              <th class="p-2.5">Qtd Exigida</th>
              <th class="p-2.5">Saldo Atual no Estoque</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${cacheBomItens.map(b => {
              const peca = cachePecas.find(p => String(p.id) === String(b.peca_id));
              return `
                <tr>
                  <td class="p-2.5 font-black text-slate-900">${b.familia_modelo}</td>
                  <td class="p-2.5 font-bold text-blue-800">${b.pacote}</td>
                  <td class="p-2.5 font-semibold">${peca ? `${peca.codigo} - ${peca.descricao}` : '-'}</td>
                  <td class="p-2.5 font-black">${b.quantidade}</td>
                  <td class="p-2.5 font-bold ${parseFloat(peca?.quantidade || 0) >= parseFloat(b.quantidade) ? 'text-emerald-700' : 'text-rose-600'}">
                    ${peca?.quantidade || 0}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function adicionarItemBOMPreventiva() {
  const familia = (document.getElementById('bomFamiliaInput')?.value || '').trim().toUpperCase();
  const pacote = document.getElementById('bomPacoteSelect')?.value || '250H';
  const pecaId = document.getElementById('bomPecaSelect')?.value;
  const qtd = parseFloat(document.getElementById('bomQtdInput')?.value) || 1;

  if (!familia || !pecaId) return alert('Informe o Prefixo/Modelo e selecione a peça do estoque!');

  await gravarDadosOfflineSafe('preventiva_bom_itens', 'INSERT', {
    familia_modelo: familia,
    pacote,
    peca_id: pecaId,
    quantidade: qtd
  });

  await carregarPreventivas('bom');
}
