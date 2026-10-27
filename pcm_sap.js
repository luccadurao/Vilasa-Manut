// ============================================================================
// VILASA CMMS V2 - MÓDULO 5: PCM_SAP.JS (SEM BOM + CÁLCULO DE RITMO REAL)
// ============================================================================

let cachePlanosPreventiva = [];
let cacheExecucoesPreventiva = [];
let subAbaPreventivaAtual = 'painel'; // 'painel', 'em_execucao', 'historico'

function calcularProximoCicloHierarquico(horimetroUltimo, intervaloBase = 250) {
  const base = Number(intervaloBase) || 250;
  const proximoAlvo = Number(horimetroUltimo || 0) + base;
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

// CALCULA O RITMO REAL BASEADO NO USO EFETIVO DESDE A ÚLTIMA PREVENTIVA
function calcularStatusPlanoPreventiva(plano, equipamento) {
  const horAtual = parseFloat(equipamento?.horimetro_atual || 0);
  const horUltimo = parseFloat(plano?.ultimo_horimetro_execucao || 0);
  const intervalo = parseFloat(plano?.intervalo_base || 250);

  let ritmoReal = String(equipamento?.unidade_medida || 'H').toUpperCase() === 'KM' ? 150.0 : 8.0;
  if (plano?.ultima_data_execucao && horAtual > horUltimo) {
    const diasCorridos = Math.max(1, (new Date() - new Date(plano.ultima_data_execucao + 'T08:00:00')) / (24 * 3600000));
    const calculado = (horAtual - horUltimo) / diasCorridos;
    if (calculado >= 0.5) ritmoReal = Number(calculado.toFixed(1));
  }

  const { proximoHorimetroAlvo, proximoPacote } = calcularProximoCicloHierarquico(horUltimo, intervalo);
  const saldoHoras = Number((proximoHorimetroAlvo - horAtual).toFixed(1));
  const diasRestantes = Math.ceil(saldoHoras / ritmoReal);

  const dataPrevista = new Date();
  dataPrevista.setDate(dataPrevista.getDate() + Math.max(0, diasRestantes));

  const limiarAtencao = String(equipamento?.unidade_medida || 'H').toUpperCase() === 'KM' ? 1500 : 50;
  let faixa = 'no_prazo';
  if (saldoHoras <= 0) faixa = 'vencida';
  else if (saldoHoras <= limiarAtencao) faixa = 'atencao';

  return { horAtual, horUltimo, proximoHorimetroAlvo, proximoPacote, saldoHoras, diasRestantes, dataPrevista, ritmo: ritmoReal, faixa };
}

async function carregarPreventivas(subAba = subAbaPreventivaAtual) {
  subAbaPreventivaAtual = subAba;

  const [resPlanos, resExecs, resEquip] = await Promise.all([
    lerDadosComFallbackOffline('planos_preventiva', () => db.from('planos_preventiva').select('*')),
    lerDadosComFallbackOffline('execucoes_preventiva', () => db.from('execucoes_preventiva').select('*').order('horimetro_execucao', { ascending: false })),
    (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
      ? Promise.resolve({ data: cacheEquipamentos })
      : lerDadosComFallbackOffline('equipamentos', () => db.from('equipamentos').select('*').order('tag'))
  ]);

  cacheEquipamentos = resEquip.data || [];
  cachePlanosPreventiva = resPlanos.data || [];
  cacheExecucoesPreventiva = resExecs.data || [];

  renderizarInterfaceCompletaPCM();

  if (typeof renderizarQuadroEnxutoParadosREP === 'function' && typeof cacheOrdens !== 'undefined') {
    renderizarQuadroEnxutoParadosREP(cacheOrdens);
  }
}

const _renderREPOriginal = typeof renderizarQuadroEnxutoParadosREP === 'function' ? renderizarQuadroEnxutoParadosREP : null;
window.renderizarQuadroEnxutoParadosREP = function (listaOrdensCorretivas = []) {
  let prevParadas = (cacheExecucoesPreventiva || []).filter(p => p.status === 'em_execucao' && p.parada_obrigatoria !== false && !p.data_conclusao);
  const linhasPrevParaREP = prevParadas.map(p => {
    const eq = (cacheEquipamentos || []).find(e => String(e.id) === String(p.equipamento_id));
    return {
      id: p.id,
      numero_os: 'PREV',
      equipamento_id: p.equipamento_id,
      equipamentos: eq || { tag: 'EQUIP', nome: 'Equipamento em Preventiva', marca: '-' },
      parada_obrigatoria: true,
      status: 'em_execucao',
      motivo_rep: `PREVENTIVA ${p.pacote}`,
      local_manutencao_pcm: 'OFICINA',
      descricao_problema: p.observacoes || `Revisão Programada ${p.pacote}`,
      aberta_em: p.data_entrada,
      mecanico_nome: p.mecanicos_nomes || 'Equipe Preventiva',
      concluida_em: null
    };
  });
  if (_renderREPOriginal) _renderREPOriginal([...(listaOrdensCorretivas || []), ...linhasPrevParaREP]);
};

function renderizarInterfaceCompletaPCM() {
  const sec = document.getElementById('sec-preventivas');
  if (!sec) return;

  const podeEditar = podeExecutarAcao('gerenciar_preventivas');
  let planosVisiveis = cachePlanosPreventiva.map(pl => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(pl.equipamento_id));
    return { ...pl, equipamento: eq };
  }).filter(pl => Boolean(pl.equipamento));

  if (typeof filtrarListaPorObraAtiva === 'function') planosVisiveis = filtrarListaPorObraAtiva(planosVisiveis);

  const termoBusca = (document.getElementById('filtroPrefixoPCM')?.value || '').trim().toUpperCase();
  if (termoBusca) planosVisiveis = planosVisiveis.filter(pl => bateComPrefixoEquipamento(pl.equipamento?.tag || '', termoBusca));

  let contVencidas = 0, contAtencao = 0, contNoPrazo = 0;
  const planosCalculados = planosVisiveis.map(pl => {
    const calc = calcularStatusPlanoPreventiva(pl, pl.equipamento);
    if (calc.faixa === 'vencida') contVencidas++;
    else if (calc.faixa === 'atencao') contAtencao++;
    else contNoPrazo++;
    return { ...pl, calc };
  }).sort((a, b) => a.calc.saldoHoras - b.calc.saldoHoras);

  const execucoesAtivas = cacheExecucoesPreventiva.filter(e => e.status === 'em_execucao' && !e.data_conclusao);

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ENGENHARIA DE MANUTENÇÃO • SAP PM</span>
          <h2 class="text-lg font-black">Controle de Planos Preventivos & Histórico Próprio</h2>
        </div>
        ${podeEditar ? `
          <button onclick="abrirModalPlanoComHistoricoCompleto()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow">
            + Criar / Editar Plano + Histórico Passado
          </button>
        ` : ''}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="bg-rose-50 border border-rose-200 p-3.5 rounded-xl"><span class="text-[11px] font-black uppercase text-rose-700">🔴 Vencidas</span><p class="text-2xl font-black text-rose-900 mt-1">${contVencidas}</p></div>
        <div class="bg-amber-50 border border-amber-200 p-3.5 rounded-xl"><span class="text-[11px] font-black uppercase text-amber-800">🟡 Atenção (≤ 50h)</span><p class="text-2xl font-black text-amber-900 mt-1">${contAtencao}</p></div>
        <div class="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl"><span class="text-[11px] font-black uppercase text-emerald-800">🟢 No Prazo</span><p class="text-2xl font-black text-emerald-900 mt-1">${contNoPrazo}</p></div>
        <div class="bg-blue-50 border border-blue-200 p-3.5 rounded-xl"><span class="text-[11px] font-black uppercase text-blue-800">🛠️ Em Execução Agora</span><p class="text-2xl font-black text-blue-900 mt-1">${execucoesAtivas.length}</p></div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarPreventivas('painel')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'painel' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">📅 Projeção (${planosCalculados.length})</button>
          <button onclick="carregarPreventivas('em_execucao')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'em_execucao' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">🔧 Em Andamento (${execucoesAtivas.length})</button>
          <button onclick="carregarPreventivas('historico')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === 'historico' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">📜 Histórico Próprio (${cacheExecucoesPreventiva.length})</button>
        </div>
        <input id="filtroPrefixoPCM" type="text" value="${termoBusca}" oninput="renderizarInterfaceCompletaPCM()" placeholder="🔍 Filtrar Prefixo..." class="px-3 py-1.5 rounded-lg border text-xs font-bold uppercase" />
      </div>

      <div>
        ${subAbaPreventivaAtual === 'painel' ? renderizarTabelaProjecaoPCM(planosCalculados, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'em_execucao' ? renderizarPreventivasEmExecucao(execucoesAtivas, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'historico' ? renderizarTabelaHistoricoProprioPreventivas(termoBusca) : ''}
      </div>
    </div>
  `;
}

function renderizarTabelaProjecaoPCM(planosCalculados, podeEditar) {
  if (planosCalculados.length === 0) return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhum plano cadastrado.</div>`;
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
            <th class="p-3">Data Prevista (Ritmo Real)</th>
            <th class="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${planosCalculados.map(p => {
            const c = p.calc;
            const un = p.equipamento.unidade_medida || 'H';
            const badgeFaixa = c.faixa === 'vencida'
              ? `<span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black">${c.saldoHoras} ${un} (VENCIDA)</span>`
              : (c.faixa === 'atencao' ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black">Faltam ${c.saldoHoras} ${un}</span>` : `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Faltam ${c.saldoHoras} ${un}</span>`);
            const dtUltima = p.ultima_data_execucao ? new Date(p.ultima_data_execucao + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3"><span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded">${p.equipamento.tag}</span><div class="font-bold text-slate-600 mt-0.5">${p.equipamento.nome}</div></td>
                <td class="p-3 font-semibold"><div><strong>${p.ultimo_pacote_executado || '250H'}</strong> aos <strong>${c.horUltimo} ${un}</strong></div><div class="text-[11px] text-slate-500">Data: ${dtUltima}</div></td>
                <td class="p-3 font-black">${c.horAtual} ${un}</td>
                <td class="p-3"><span class="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-black">${c.proximoPacote}</span><div class="text-[11px] text-slate-500 mt-0.5">Alvo: ${c.proximoHorimetroAlvo} ${un}</div></td>
                <td class="p-3">${badgeFaixa}</td>
                <td class="p-3 font-bold">${c.dataPrevista.toLocaleDateString('pt-BR')}<div class="text-[10px] text-slate-400">Ritmo Real: ${c.ritmo} ${un}/dia</div></td>
                <td class="p-3 text-right space-x-1 whitespace-nowrap">
                  ${podeEditar ? `
                    <button onclick="iniciarParadaPreventivaNoREP('${p.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-black text-[11px]">🛑 Iniciar no REP</button>
                    <button onclick="abrirModalConcluirPreventivaDireto('${p.id}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-[11px]">✅ Baixar</button>
                    <button onclick="abrirModalPlanoComHistoricoCompleto('${p.equipamento_id}')" class="px-2 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px]">📜 Histórico</button>
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

async function iniciarParadaPreventivaNoREP(planoId) {
  const plano = cachePlanosPreventiva.find(p => String(p.id) === String(planoId));
  if (!plano) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(plano.equipamento_id));
  const calc = calcularStatusPlanoPreventiva(plano, eq);

  await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
    plano_id: plano.id,
    equipamento_id: plano.equipamento_id,
    pacote: calc.proximoPacote,
    status: 'em_execucao',
    parada_obrigatoria: true,
    data_entrada: new Date().toISOString(),
    horimetro_execucao: eq?.horimetro_atual || calc.proximoHorimetroAlvo,
    observacoes: `Revisão Programada ${calc.proximoPacote}`
  });
  await carregarPreventivas('em_execucao');
}

function renderizarPreventivasEmExecucao(listaAtivas, podeEditar) {
  if (listaAtivas.length === 0) return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhuma preventiva em andamento agora.</div>`;
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${listaAtivas.map(ex => {
        const eq = cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id));
        return `
          <div class="bg-white p-4 rounded-xl border-2 border-blue-500 shadow flex flex-col justify-between gap-3">
            <div>
              <div class="flex justify-between"><span class="bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded">${eq?.tag || 'EQUIP'}</span><span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded">PREVENTIVA ${ex.pacote}</span></div>
              <p class="text-xs font-bold mt-1">${eq?.nome || ''}</p>
              <p class="text-xs text-slate-500">Início: ${new Date(ex.data_entrada).toLocaleString('pt-BR')}</p>
            </div>
            ${podeEditar ? `<button onclick="concluirPreventivaQueEstavaNoREP('${ex.id}')" class="w-full py-2 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs">✅ Concluir e Liberar do REP</button>` : ''}
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
  const horFinal = parseFloat(prompt(`Horímetro/KM de conclusão da revisão ${ex.pacote}:`, ex.horimetro_execucao || eq?.horimetro_atual || 0));
  if (isNaN(horFinal)) return;
  const mecNomes = prompt('Mecânicos executantes:', ex.mecanicos_nomes || usuarioLogado?.nome || '') || '';
  const agoraISO = new Date().toISOString();

  await gravarDadosOfflineSafe('execucoes_preventiva', 'UPDATE', {
    status: 'concluida',
    data_conclusao: agoraISO,
    horimetro_execucao: horFinal,
    mecanicos_nomes: mecNomes
  }, execId);

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

  const pacote = prompt(`Pacote executado na ${eq?.tag}:`, calc.proximoPacote);
  if (!pacote) return;
  const hor = parseFloat(prompt(`Horímetro/KM na execução:`, eq?.horimetro_atual || calc.proximoHorimetroAlvo));
  if (isNaN(hor)) return;
  const dt = prompt(`Data da execução (AAAA-MM-DD):`, new Date().toISOString().slice(0, 10));
  if (!dt) return;

  await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
    plano_id: plano.id,
    equipamento_id: plano.equipamento_id,
    pacote: pacote.toUpperCase().trim(),
    status: 'concluida',
    parada_obrigatoria: false,
    data_entrada: new Date(dt + 'T08:00:00').toISOString(),
    data_conclusao: new Date(dt + 'T12:00:00').toISOString(),
    horimetro_execucao: hor,
    mecanicos_nomes: usuarioLogado?.nome || 'PCM',
    observacoes: 'Baixa direta de preventiva'
  });

  await gravarDadosOfflineSafe('planos_preventiva', 'UPDATE', {
    ultimo_horimetro_execucao: hor,
    ultima_data_execucao: dt,
    ultimo_pacote_executado: pacote.toUpperCase().trim()
  }, plano.id);
  await carregarPreventivas('painel');
}

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
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border my-8">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">Plano Preventivo + Histórico do Equipamento</h3>
      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">1. Equipamento</label>
            <select id="planoHistEquipId" onchange="carregarDadosExistentesNoModalPlano(this.value)" class="w-full border rounded-lg p-2 font-bold bg-white">
              <option value="">-- Selecione --</option>
              ${cacheEquipamentos.map(e => `<option value="${e.id}" ${String(e.id) === String(equipamentoIdPreSelecionado) ? 'selected' : ''}>${e.tag} - ${e.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">2. Intervalo Base</label>
            <select id="planoHistIntervalo" class="w-full border rounded-lg p-2 font-bold bg-white">
              <option value="250">Ciclo 250h (250 / 500 / 1000 / 2000h)</option>
              <option value="500">Ciclo 500h (500 / 1000 / 2000h)</option>
              <option value="10000">Ciclo 10.000 KM</option>
            </select>
          </div>
        </div>

        <div class="border rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-black text-slate-900 uppercase">📜 Preventivas Já Realizadas</h4>
            <button type="button" onclick="adicionarLinhaHistoricoPreventivaModal()" class="px-3 py-1.5 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">+ Adicionar Linha</button>
          </div>
          <div class="max-h-60 overflow-y-auto">
            <table class="w-full text-left border-collapse">
              <thead><tr class="bg-slate-100 text-[10px] uppercase"><th class="p-2">Data</th><th class="p-2">Horímetro / KM</th><th class="p-2">Pacote</th><th class="p-2 text-center">X</th></tr></thead>
              <tbody id="tbodyLinhasHistoricoPreventivaModal" class="divide-y"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalPlanoHistoricoCompletoV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="salvarPlanoComHistoricoCompleto()" class="px-5 py-2.5 rounded-lg font-black text-xs bg-amber-500 text-slate-950 shadow">💾 Salvar Plano</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  const sel = document.getElementById('planoHistEquipId');
  if (sel && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(sel);
  if (equipamentoIdPreSelecionado) carregarDadosExistentesNoModalPlano(equipamentoIdPreSelecionado);
  else adicionarLinhaHistoricoPreventivaModal();
}

function adicionarLinhaHistoricoPreventivaModal(data = '', horimetro = '', pacote = '250H', idExistente = '') {
  const tbody = document.getElementById('tbodyLinhasHistoricoPreventivaModal');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'linha-hist-prev-modal';
  tr.dataset.idExistente = idExistente;
  const pacotes = ['250H', '500H', '1000H', '2000H', '10000KM', '20000KM'];
  tr.innerHTML = `
    <td class="p-1.5"><input type="date" value="${data}" class="inp-hist-data w-full border rounded p-1.5 font-bold" /></td>
    <td class="p-1.5"><input type="number" step="0.1" value="${horimetro}" class="inp-hist-hor w-full border rounded p-1.5 font-bold" /></td>
    <td class="p-1.5"><select class="inp-hist-pacote w-full border rounded p-1.5 font-bold">${pacotes.map(p => `<option value="${p}" ${String(pacote).toUpperCase() === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
    <td class="p-1.5 text-center"><button type="button" onclick="this.closest('tr').remove()" class="text-rose-600 font-black">🗑️</button></td>
  `;
  tbody.appendChild(tr);
}

function carregarDadosExistentesNoModalPlano(equipamentoId) {
  const tbody = document.getElementById('tbodyLinhasHistoricoPreventivaModal');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!equipamentoId) return;

  const plano = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(equipamentoId));
  if (plano) document.getElementById('planoHistIntervalo').value = String(plano.intervalo_base || 250);

  const hist = cacheExecucoesPreventiva.filter(e => String(e.equipamento_id) === String(equipamentoId) && e.status === 'concluida');
  if (hist.length > 0) {
    hist.forEach(h => adicionarLinhaHistoricoPreventivaModal((h.data_conclusao || h.data_entrada || '').slice(0, 10), h.horimetro_execucao, h.pacote, h.id));
  } else {
    adicionarLinhaHistoricoPreventivaModal(new Date().toISOString().slice(0, 10), '', '250H');
  }
}

async function salvarPlanoComHistoricoCompleto() {
  const eqId = document.getElementById('planoHistEquipId').value;
  const intervalo = parseFloat(document.getElementById('planoHistIntervalo').value) || 250;
  if (!eqId) return alert('Selecione o equipamento!');

  const linhas = Array.from(document.querySelectorAll('#tbodyLinhasHistoricoPreventivaModal .linha-hist-prev-modal'));
  const registros = [];
  for (const tr of linhas) {
    const dt = tr.querySelector('.inp-hist-data')?.value;
    const hor = parseFloat(tr.querySelector('.inp-hist-hor')?.value);
    const pac = tr.querySelector('.inp-hist-pacote')?.value || '250H';
    if (dt && !isNaN(hor)) registros.push({ dt, hor, pac, idExistente: tr.dataset.idExistente });
  }

  let ultimoHor = 0, ultimaData = new Date().toISOString().slice(0, 10), ultimoPacote = '250H';
  if (registros.length > 0) {
    const ord = [...registros].sort((a, b) => b.hor - a.hor);
    ultimoHor = ord[0].hor;
    ultimaData = ord[0].dt;
    ultimoPacote = ord[0].pac;
  }

  const planoExistente = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(eqId));
  let planoId = planoExistente?.id || null;
  const payloadPlano = {
    equipamento_id: eqId,
    intervalo_base: intervalo,
    ultimo_horimetro_execucao: ultimoHor,
    ultima_data_execucao: ultimaData,
    ultimo_pacote_executado: ultimoPacote
  };

  if (planoId) await gravarDadosOfflineSafe('planos_preventiva', 'UPDATE', payloadPlano, planoId);
  else {
    const resIns = await gravarDadosOfflineSafe('planos_preventiva', 'INSERT', payloadPlano);
    planoId = resIns.data?.id || null;
  }

  for (const item of registros) {
    if (!item.idExistente) {
      await gravarDadosOfflineSafe('execucoes_preventiva', 'INSERT', {
        plano_id: planoId,
        equipamento_id: eqId,
        pacote: item.pac,
        status: 'concluida',
        parada_obrigatoria: false,
        data_entrada: new Date(item.dt + 'T08:00:00').toISOString(),
        data_conclusao: new Date(item.dt + 'T12:00:00').toISOString(),
        horimetro_execucao: item.hor,
        observacoes: 'Histórico registrado no plano'
      });
    }
  }

  document.getElementById('modalPlanoHistoricoCompletoV2')?.classList.add('hidden');
  await carregarPreventivas('painel');
}

function renderizarTabelaHistoricoProprioPreventivas(termoBusca = '') {
  let lista = cacheExecucoesPreventiva.map(ex => ({
    ...ex,
    equipamento: cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id))
  }));
  if (typeof filtrarListaPorObraAtiva === 'function') lista = filtrarListaPorObraAtiva(lista);
  if (termoBusca) lista = lista.filter(item => bateComPrefixoEquipamento(item.equipamento?.tag || '', termoBusca));

  if (lista.length === 0) return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhum registro encontrado.</div>`;
  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead><tr class="bg-slate-900 text-amber-400 uppercase text-[11px]"><th class="p-3">Data</th><th class="p-3">Prefixo</th><th class="p-3">Equipamento</th><th class="p-3">Pacote</th><th class="p-3">Horímetro / KM</th><th class="p-3">Equipe / Obs</th></tr></thead>
        <tbody class="divide-y divide-slate-200">
          ${lista.map(h => {
            const dt = h.data_conclusao || h.data_entrada;
            return `<tr><td class="p-3 font-bold">${dt ? new Date(dt).toLocaleDateString('pt-BR') : '-'}</td><td class="p-3 font-black text-amber-700">${h.equipamento?.tag || '-'}</td><td class="p-3 font-semibold">${h.equipamento?.nome || '-'}</td><td class="p-3 font-black text-blue-900">${h.pacote}</td><td class="p-3 font-black">${h.horimetro_execucao}</td><td class="p-3">${h.mecanicos_nomes || ''} ${h.observacoes || ''}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportarHistoricoProprioPreventivasCSV() {
  const cab = ['DATA_EXECUCAO', 'PREFIXO', 'EQUIPAMENTO', 'PACOTE_PREVENTIVA', 'HORIMETRO_KM', 'STATUS', 'EQUIPE', 'OBSERVACOES'];
  const linhas = cacheExecucoesPreventiva.map(h => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(h.equipamento_id));
    const dt = h.data_conclusao || h.data_entrada;
    return [
      dt ? new Date(dt).toLocaleDateString('pt-BR') : '', eq?.tag || '', (eq?.nome || '').replace(/;/g, ','),
      h.pacote || '', String(h.horimetro_execucao || 0).replace('.', ','), h.status || '',
      (h.mecanicos_nomes || '').replace(/;/g, ','), (h.observacoes || '').replace(/;/g, ',')
    ].join(';');
  });
  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_PREVENTIVAS_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
