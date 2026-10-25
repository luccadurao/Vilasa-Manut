// ============================================================================
// VILASA CMMS - MÓDULO 3: OS_REP.JS (GESTÃO DE OS, COMBOIO E QUADRO REP)
// Responsabilidades:
// 1. Trava de segurança: Operador NÃO abre OS (exclusivo Encarregado, Mecânico, PCM, Engenheiro, Admin)
// 2. Separação entre OS Com Parada (REP) vs. OS Sem Parada (Anomalia em Operação)
// 3. Registro Direto: Inspeção de Campo (Oportunidade) e Atendimento de Comboio
// 4. Apontamento de Equipe por Clique (Chips dos Mecânicos cadastrados na Obra)
// 5. Quadro Enxuto de Parados (REP) em Tempo Real + Exportação liberada
// ============================================================================

let abaStatusOSAtual = 'ativas';

// Garante no carregamento que o perfil 'operador' não tenha a ação 'abrir_os' na matriz
if (typeof MATRIZ_PERMISSOES_CARGOS !== 'undefined' && MATRIZ_PERMISSOES_CARGOS.operador) {
  MATRIZ_PERMISSOES_CARGOS.operador.acoes = ['lancar_horimetro_qr', 'exportar_relatorios'];
}

function usuarioPodeAbrirOS(user = usuarioLogado) {
  if (!user) return false;
  const cargos = typeof obterCargosUsuario === 'function' ? obterCargosUsuario(user) : [user.cargo_base];
  // Operador puro é bloqueado; Gestor puro é somente visualização
  const cargosAutorizados = ['encarregado', 'mecanico', 'pcm', 'engenheiro', 'admin'];
  return cargos.some(c => cargosAutorizados.includes(c));
}

// ----------------------------------------------------------------------------
// 1. CARREGAMENTO E FILTRAGEM DE ORDENS DE SERVIÇO (ONLINE + OFFLINE)
// ----------------------------------------------------------------------------
async function carregarOrdensServico(aba = abaStatusOSAtual) {
  abaStatusOSAtual = aba;

  // Atualiza visual dos botões de filtro de aba se existirem
  ['ativas', 'avisos_operando', 'aguardando_pcm', 'concluidas'].forEach(idAba => {
    const btn = document.getElementById(`tab-os-${idAba}`);
    if (btn) {
      const ativo = idAba === aba;
      btn.className = ativo
        ? 'px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950 shadow'
        : 'px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700';
    }
  });

  // Garante barra de abas e botão de Intervenção Técnica/Comboio injetados na seção de OS
  garantirCabecalhoAvancadoOS();

  const res = await lerDadosComFallbackOffline('ordens_servico', async () => {
    return await db
      .from('ordens_servico')
      .select('*, equipamentos(id, tag, nome, marca, modelo, setor, unidade_medida, obra_id, horimetro_atual)')
      .order('aberta_em', { ascending: false })
      .limit(600);
  });

  let lista = res.data || [];

  // Se houver registros criados offline que ainda não têm o objeto 'equipamentos' populado, vincula pelo cache
  const eqCache = (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
    ? cacheEquipamentos
    : await lerTabelaDoCacheOffline('equipamentos');

  lista = lista.map(o => {
    if (!o.equipamentos && o.equipamento_id) {
      const eq = eqCache.find(e => String(e.id) === String(o.equipamento_id));
      if (eq) o.equipamentos = eq;
    }
    return o;
  });

  // Filtra pela Obra Ativa selecionada no topo (ou exibe todas se 'TODAS')
  if (typeof filtrarListaPorObraAtiva === 'function') {
    lista = filtrarListaPorObraAtiva(lista);
  }

  // Filtro opcional por prefixo digitado na barra de pesquisa da tela de OS
  const termoPrefixo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
  if (termoPrefixo) {
    lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termoPrefixo));
  }

  // Filtro de datas se preenchido
  const dtIni = document.getElementById('filtroDataInicioOS')?.value;
  const dtFim = document.getElementById('filtroDataFimOS')?.value;
  if (dtIni) {
    const ini = new Date(dtIni + 'T00:00:00');
    lista = lista.filter(o => new Date(o.aberta_em) >= ini);
  }
  if (dtFim) {
    const fim = new Date(dtFim + 'T23:59:59');
    lista = lista.filter(o => new Date(o.aberta_em) <= fim);
  }

  cacheOrdens = lista;

  // Atualiza o Quadro Enxuto de Parados (REP) -> APENAS máquinas com parada real!
  renderizarQuadroEnxutoParadosREP(lista);

  // Atualiza painel de chamados estilo Uber se o módulo estiver carregado
  if (typeof atualizarPainelUberMecanicos === 'function') {
    atualizarPainelUberMecanicos(lista);
  }

  // Filtra a listagem principal conforme a sub-aba escolhida
  let listaFiltradaAba = [];
  if (aba === 'ativas') {
    // Máquinas efetivamente paradas ou em execução na oficina/trecho
    listaFiltradaAba = lista.filter(o =>
      o.parada_obrigatoria !== false &&
      (['aberta', 'em_execucao', 'em_deslocamento', 'pausada_peca', 'pausada_outros'].includes(o.status) || !o.concluida_em)
    );
  } else if (aba === 'avisos_operando') {
    // Anomalias registradas onde o equipamento continua operando (Sem Parada)
    listaFiltradaAba = lista.filter(o =>
      o.parada_obrigatoria === false && !o.concluida_em && o.status !== 'concluida'
    );
  } else if (aba === 'aguardando_pcm') {
    listaFiltradaAba = lista.filter(o => o.status === 'aguardando_pcm');
  } else if (aba === 'concluidas') {
    listaFiltradaAba = lista.filter(o => o.status === 'concluida' || Boolean(o.concluida_em));
  } else {
    listaFiltradaAba = lista;
  }

  renderizarCardsListaOS(listaFiltradaAba);
}

// ----------------------------------------------------------------------------
// 2. QUADRO ENXUTO DE PARADOS (REP) — FILTRA ESTRITAMENTE PARADAS REAIS
// ----------------------------------------------------------------------------
function renderizarQuadroEnxutoParadosREP(lista) {
  // REGRA DE OURO: Só entra no Quadro de Parados se parada_obrigatoria !== false E ainda não tiver data de saída
  const paradasAgora = lista.filter(o => {
    const exigeParada = o.parada_obrigatoria !== false;
    const statusAtivo = ['aberta', 'em_execucao', 'em_deslocamento', 'pausada_peca', 'pausada_outros'].includes(o.status);
    const semSaida = !o.concluida_em && o.status !== 'concluida' && o.status !== 'aguardando_pcm';
    return exigeParada && (statusAtivo || semSaida);
  });

  const spanData = document.getElementById('dataHoraCabecalhoREP');
  const spanContador = document.getElementById('contadorParadosCabecalhoREP');
  const divTabela = document.getElementById('tabelaEnxutaParadosREP');

  if (spanData) spanData.innerText = `Atualizado em: ${new Date().toLocaleString('pt-BR')}`;
  if (spanContador) spanContador.innerText = `${paradasAgora.length} Equipamento(s) Parado(s)`;
  if (!divTabela) return;

  if (paradasAgora.length === 0) {
    divTabela.innerHTML = `<p class="text-emerald-700 font-bold py-3 text-center">✅ Nenhum equipamento parado em manutenção no momento!</p>`;
    return;
  }

  divTabela.innerHTML = `
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="bg-amber-500 text-white text-[11px] uppercase">
          <th class="py-2 px-2 border border-amber-600">Nº</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO</th>
          <th class="py-2 px-2 border border-amber-600">MARCA</th>
          <th class="py-2 px-2 border border-amber-600">PREFIXO</th>
          <th class="py-2 px-2 border border-amber-600">MOTIVO</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO DO PROBLEMA</th>
          <th class="py-2 px-2 border border-amber-600">ENTRADA</th>
          <th class="py-2 px-2 border border-amber-600">PREV. LIBERAÇÃO</th>
          <th class="py-2 px-2 border border-amber-600 text-center">DIAS PARADOS</th>
          <th class="py-2 px-2 border border-amber-600">EQUIPE / STATUS</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 text-[11px]">
        ${paradasAgora.map((o, idx) => {
          const diasParados = Math.max(1, Math.ceil((new Date() - new Date(o.aberta_em)) / (24 * 3600000)));
          const prev = o.previsao_liberacao ? new Date(o.previsao_liberacao + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
          const labelStatus = o.status === 'pausada_peca'
            ? 'AGUARD. PEÇA'
            : (o.mecanico_nome ? `🔧 ${o.mecanico_nome}` : 'EM EXECUÇÃO');

          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${idx + 1}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-800">${o.equipamentos?.nome || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${o.equipamentos?.marca || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-black text-amber-700">${o.equipamentos?.tag || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${o.motivo_rep || (o.tipo || 'CORRETIVA').toUpperCase()}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-900">${o.descricao_problema || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${new Date(o.aberta_em).toLocaleString('pt-BR')}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-blue-700">${prev}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-center font-black text-rose-600">${diasParados}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-amber-700">${labelStatus}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------------------
// 3. RENDERIZAÇÃO DA LISTA DE ORDENS E BARRA DE CONTROLES
// ----------------------------------------------------------------------------
function garantirCabecalhoAvancadoOS() {
  const secaoOS = document.getElementById('sec-os');
  if (!secaoOS || document.getElementById('barraModosAvancadosOS')) return;

  const barra = document.createElement('div');
  barra.id = 'barraModosAvancadosOS';
  barra.className = 'mb-4 flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white p-3 rounded-xl shadow';

  const podeAbrir = usuarioPodeAbrirOS();

  barra.innerHTML = `
    <div class="flex flex-wrap items-center gap-1.5">
      <button id="tab-os-ativas" onclick="carregarOrdensServico('ativas')" class="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950">
        🔴 Paradas / Em Execução
      </button>
      <button id="tab-os-avisos_operando" onclick="carregarOrdensServico('avisos_operando')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
        🟡 Em Operação c/ Anomalia (Sem Parada)
      </button>
      <button id="tab-os-aguardando_pcm" onclick="carregarOrdensServico('aguardando_pcm')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
        📋 Triagem PCM
      </button>
      <button id="tab-os-concluidas" onclick="carregarOrdensServico('concluidas')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
        ✅ Concluídas
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input id="filtroPrefixoOS" type="text" oninput="carregarOrdensServico()" placeholder="🔍 Filtrar Prefixo (ex: CB-05)..."
        class="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold uppercase text-amber-300 placeholder-slate-400 focus:outline-none focus:border-amber-400" />
      ${podeAbrir ? `
        <button onclick="abrirModalIntervencaoCampoComboio()" class="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-truck-droplet"></i>
          <span>⚡ Registro de Campo / Comboio</span>
        </button>
      ` : ''}
    </div>
  `;

  secaoOS.insertBefore(barra, secaoOS.firstChild);
}

function renderizarCardsListaOS(lista) {
  const container = document.getElementById('listaOrdensServico');
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `<div class="col-span-full bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhuma Ordem de Serviço encontrada neste filtro.</div>`;
    return;
  }

  const MapOrigens = {
    solicitacao_encarregado: '📋 Solicitação Formal (Encarregado/PCM)',
    inspecao_campo: '🔍 Inspeção de Campo (Oportunidade)',
    atendimento_comboio: '🚛 Atendimento de Comboio / Lubrificação'
  };

  container.innerHTML = lista.map(o => {
    const paradaBadge = o.parada_obrigatoria === false
      ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black">🟡 OPERANDO COM ANOMALIA</span>`
      : `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">🔴 COM PARADA DE MÁQUINA</span>`;

    const offlineBadge = o._offline_pendente
      ? `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black">⏳ Sinc. Pendente</span>`
      : '';

    const labelOrigem = MapOrigens[o.origem_atendimento] || MapOrigens.solicitacao_encarregado;

    return `
      <div class="bg-white rounded-xl border ${o.parada_obrigatoria === false ? 'border-amber-300' : 'border-slate-200'} p-4 shadow-sm flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span class="text-sm font-black text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded">${o.equipamentos?.tag || 'SEM TAG'}</span>
            <div class="flex items-center gap-1 flex-wrap">
              ${paradaBadge}
              ${offlineBadge}
            </div>
          </div>
          <p class="text-xs font-bold text-slate-600 mb-1">${o.equipamentos?.nome || ''} • ${o.equipamentos?.marca || ''}</p>
          <p class="text-[11px] font-semibold text-slate-500 mb-2">${labelOrigem}${o.localizacao_trecho ? ` • 📍 ${o.localizacao_trecho}` : ''}</p>
          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800">
            ${o.descricao_problema || '-'}
          </div>
          ${o.acao_realizada ? `<p class="mt-2 text-xs text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200"><strong>Serviço Executado:</strong> ${o.acao_realizada}</p>` : ''}
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
          <div>
            <div><strong>Entrada:</strong> ${new Date(o.aberta_em).toLocaleString('pt-BR')}</div>
            <div><strong>Equipe:</strong> <span class="text-slate-800 font-bold">${o.mecanico_nome || 'Aguardando atribuição'}</span></div>
          </div>
          <div class="flex items-center gap-1.5">
            ${o.parada_obrigatoria === false && !o.concluida_em && podeExecutarAcao('executar_os') ? `
              <button onclick="converterAnomaliaEmParadaOficina('${o.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px]">
                🛑 Encostar p/ Parada
              </button>
            ` : ''}
            ${podeExecutarAcao('executar_os') ? `
              <button onclick="abrirModalExecucaoOSComChips('${o.id}')" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs">
                🔧 Atender / Fechar
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Quando uma máquina que estava rodando com anomalia finalmente encosta na oficina para consertar
async function converterAnomaliaEmParadaOficina(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;
  if (!confirm('Confirmar que o equipamento parou a operação agora para iniciar o reparo?')) return;

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', {
    parada_obrigatoria: true,
    status: 'em_execucao',
    aberta_em: new Date().toISOString() // Marca o início real da parada física para não distorcer a DF%
  }, osId);

  await carregarOrdensServico('ativas');
}

// ----------------------------------------------------------------------------
// 4. SELETOR CLICÁVEL DE MECÂNICOS CADASTRADOS (CHIPS NO FECHAMENTO DA OS)
// ----------------------------------------------------------------------------
async function obterListaMecanicosParaChips() {
  if (navigator.onLine) {
    try {
      const { data } = await db.from('perfis_usuarios').select('*').eq('ativo', true).order('nome');
      if (data) {
        await salvarTabelaNoCacheOffline('perfis_usuarios', data);
        cacheUsuarios = data;
      }
    } catch (e) {}
  }
  const todos = (cacheUsuarios && cacheUsuarios.length > 0)
    ? cacheUsuarios
    : await lerTabelaDoCacheOffline('perfis_usuarios');

  // Filtra usuários que possuem perfil de mecânico, encarregado ou engenheiro
  return todos.filter(u => {
    const cargos = Array.isArray(u.cargos_lista) && u.cargos_lista.length > 0 ? u.cargos_lista : [u.cargo_base];
    return cargos.some(c => ['mecanico', 'encarregado'].includes(String(c).toLowerCase()));
  });
}

async function abrirModalExecucaoOSComChips(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;

  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return alert('Ordem de serviço não localizada na memória.');

  const mecanicos = await obterListaMecanicosParaChips();
  const idsSelecionados = new Set(Array.isArray(os.mecanicos_ids) ? os.mecanicos_ids : []);
  if (os.mecanico_id) idsSelecionados.add(String(os.mecanico_id));

  let modal = document.getElementById('modalExecucaoChipsV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalExecucaoChipsV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  const dtSaidaValor = os.concluida_em ? new Date(os.concluida_em).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div>
          <span class="bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded text-xs">${os.equipamentos?.tag || ''}</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Execução e Apontamento Técnico de OS</h3>
        </div>
        <button onclick="document.getElementById('modalExecucaoChipsV2').classList.add('hidden')" class="text-slate-400 hover:text-slate-700 text-xl font-black">&times;</button>
      </div>

      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Status do Atendimento</label>
            <select id="execV2Status" onchange="alternarTravaSaidaExecV2()" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="em_execucao" ${os.status === 'em_execucao' ? 'selected' : ''}>🔧 Em Execução</option>
              <option value="pausada_peca" ${os.status === 'pausada_peca' ? 'selected' : ''}>📦 Aguardando Peça</option>
              <option value="concluida" ${os.status === 'concluida' ? 'selected' : ''}>✅ Concluída / Liberar Equipamento</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Condição Operacional</label>
            <select id="execV2Parada" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="true" ${os.parada_obrigatoria !== false ? 'selected' : ''}>🔴 Com Parada do Equipamento</option>
              <option value="false" ${os.parada_obrigatoria === false ? 'selected' : ''}>🟡 Sem Parada (Operando / Oportunidade)</option>
            </select>
          </div>
        </div>

        <!-- SELETOR POR CLIQUE DOS MECÂNICOS QUE TRABALHARAM NA FALHA -->
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">
            👷 Clique nos Mecânicos / Técnicos que atuaram nesta OS:
          </label>
          <div id="containerChipsMecanicosV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
            ${mecanicos.length > 0 ? mecanicos.map(m => {
              const ativo = idsSelecionados.has(String(m.id)) || (os.mecanico_nome && os.mecanico_nome.toUpperCase().includes(m.nome.toUpperCase()));
              return `
                <button type="button" data-mec-id="${m.id}" data-mec-nome="${m.nome}"
                  onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ativo ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}">
                  <i class="fa-solid ${ativo ? 'fa-square-check' : 'fa-square'}"></i>
                  <span>${m.nome}</span>
                </button>
              `;
            }).join('') : `<span class="text-slate-400">Nenhum mecânico cadastrado na lista.</span>`}
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Descrição do Serviço Executado / Causa</label>
          <textarea id="execV2Acao" rows="3" class="w-full border border-slate-300 rounded-lg p-2.5 font-semibold" placeholder="Descreva o reparo técnico realizado...">${os.acao_realizada || ''}</textarea>
        </div>

        <div id="blocoSaidaConclusaoV2" class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Data/Hora de Liberação (Saída)</label>
            <input type="datetime-local" id="execV2DataSaida" value="${dtSaidaValor}" class="w-full border border-emerald-300 rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Horímetro / KM na Saída (Atual: ${os.equipamentos?.horimetro_atual || 0})</label>
            <input type="number" step="0.1" id="execV2HorimetroSaida" value="${os.horimetro_conclusao || os.equipamentos?.horimetro_atual || ''}" class="w-full border border-emerald-300 rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalExecucaoChipsV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200 text-slate-700">Cancelar</button>
        <button onclick="salvarExecucaoOSComChips('${os.id}')" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow">
          💾 Salvar Apontamento da OS
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  alternarTravaSaidaExecV2();
}

function alternarSelecaoChipMecanico(btn) {
  const ativo = btn.classList.contains('bg-amber-500');
  const icon = btn.querySelector('i');
  if (ativo) {
    btn.className = 'chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 bg-white text-slate-700 border-slate-300 hover:bg-slate-100';
    if (icon) icon.className = 'fa-solid fa-square';
  } else {
    btn.className = 'chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 bg-amber-500 text-slate-950 border-amber-600 shadow';
    if (icon) icon.className = 'fa-solid fa-square-check';
  }
}

function alternarTravaSaidaExecV2() {
  const st = document.getElementById('execV2Status')?.value;
  const bloco = document.getElementById('blocoSaidaConclusaoV2');
  const inpData = document.getElementById('execV2DataSaida');
  const inpHor = document.getElementById('execV2HorimetroSaida');
  const liberado = st === 'concluida';

  if (bloco) bloco.classList.toggle('opacity-40', !liberado);
  if (inpData) inpData.disabled = !liberado;
  if (inpHor) inpHor.disabled = !liberado;
}

async function salvarExecucaoOSComChips(osId) {
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const status = document.getElementById('execV2Status').value;
  const paradaObrigatoria = document.getElementById('execV2Parada').value === 'true';
  const acaoRealizada = document.getElementById('execV2Acao').value.trim();

  // Coleta todos os mecânicos marcados nos chips clicáveis
  const chipsAtivos = Array.from(document.querySelectorAll('#containerChipsMecanicosV2 .chip-mecanico-v2.bg-amber-500'));
  const mecanicosIds = chipsAtivos.map(c => c.dataset.mecId);
  const mecanicosNomes = chipsAtivos.map(c => c.dataset.mecNome).join(', ');

  if (status === 'concluida' && !acaoRealizada) {
    return alert('Descreva o serviço executado antes de concluir a Ordem de Serviço!');
  }
  if (status === 'concluida' && chipsAtivos.length === 0) {
    return alert('Selecione pelo menos um mecânico que trabalhou nesta Ordem de Serviço clicando no nome!');
  }

  const payload = {
    status: status === 'concluida' ? 'aguardando_pcm' : status,
    parada_obrigatoria: paradaObrigatoria,
    acao_realizada: acaoRealizada,
    mecanicos_ids: mecanicosIds,
    mecanico_nome: mecanicosNomes || os.mecanico_nome || null,
    concluida_em: null
  };

  if (status === 'concluida') {
    const dtSaida = document.getElementById('execV2DataSaida').value;
    const horSaida = parseFloat(document.getElementById('execV2HorimetroSaida').value);

    if (os.equipamentos && !isNaN(horSaida)) {
      const validacao = validarFisicaHorimetro(os.equipamentos, horSaida);
      if (!validacao.valido) return alert(validacao.mensagem);
      if (validacao.nivel === 'alerta' && !confirm(validacao.mensagem)) return;

      await gravarDadosOfflineSafe('equipamentos', 'UPDATE', {
        horimetro_atual: horSaida,
        horimetro_atualizado_em: new Date().toISOString(),
        status_operacional: 'operando'
      }, os.equipamento_id);
      payload.horimetro_conclusao = horSaida;
    }

    payload.concluida_em = dtSaida ? new Date(dtSaida).toISOString() : new Date().toISOString();
  }

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', payload, osId);
  document.getElementById('modalExecucaoChipsV2')?.classList.add('hidden');
  await carregarOrdensServico(abaStatusOSAtual);
}

// ----------------------------------------------------------------------------
// 5. MODAL DE INTERVENÇÃO DIRETA DE CAMPO (OPORTUNIDADE) E ATENDIMENTO DE COMBOIO
// ----------------------------------------------------------------------------
async function abrirModalIntervencaoCampoComboio() {
  if (!usuarioPodeAbrirOS()) {
    return alert('Apenas Encarregados, Mecânicos, PCM, Engenheiros e Administradores podem registrar Ordens de Serviço.');
  }

  const eqLista = (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
    ? cacheEquipamentos
    : await lerTabelaDoCacheOffline('equipamentos');

  const mecanicos = await obterListaMecanicosParaChips();

  let modal = document.getElementById('modalIntervencaoComboioV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalIntervencaoComboioV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div>
          <span class="bg-emerald-500 text-slate-950 font-black px-2.5 py-0.5 rounded text-[11px] uppercase">Registro Técnico Rápido</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Inspeção de Campo / Atendimento de Comboio</h3>
        </div>
        <button onclick="document.getElementById('modalIntervencaoComboioV2').classList.add('hidden')" class="text-slate-400 hover:text-slate-700 text-xl font-black">&times;</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Origem Técnica do Atendimento</label>
            <select id="comboioOrigem" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="atendimento_comboio">🚛 Atendimento de Comboio / Lubrificação</option>
              <option value="inspecao_campo">🔍 Inspeção de Campo (Manut. de Oportunidade)</option>
              <option value="solicitacao_encarregado">📋 Solicitação Formal de Manutenção</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Impacto na Operação</label>
            <select id="comboioParada" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="false">🟢 Sem Parada (Feito na Janela de Abastecimento / Operando)</option>
              <option value="true">🔴 Com Parada de Produção do Equipamento</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Equipamento (Filtre pelo Prefixo)</label>
            <select id="comboioEquipamentoId" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="">-- Selecione o Prefixo --</option>
              ${eqLista.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Resultado da Intervenção</label>
            <select id="comboioResultado" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="concluido_na_hora">✅ Resolvido Imediatamente no Local</option>
              <option value="gerar_pendencia_oficina">🚨 Gerar Chamado / Pendência para Oficina</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Anomalia Identificada e Serviço Realizado</label>
          <textarea id="comboioDescricao" rows="2" class="w-full border border-slate-300 rounded-lg p-2 font-semibold" placeholder="Ex: Substituição de mangueira de retorno e reaperto de abraçadeira durante abastecimento..."></textarea>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Equipe Executante (Clique nos Nomes):</label>
          <div id="containerChipsComboioV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-32 overflow-y-auto">
            ${mecanicos.map(m => {
              const ehLogado = usuarioLogado && String(usuarioLogado.id) === String(m.id);
              return `
                <button type="button" data-mec-id="${m.id}" data-mec-nome="${m.nome}"
                  onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ehLogado ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300'}">
                  <i class="fa-solid ${ehLogado ? 'fa-square-check' : 'fa-square'}"></i>
                  <span>${m.nome}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalIntervencaoComboioV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200 text-slate-700">Cancelar</button>
        <button onclick="salvarIntervencaoCampoComboio()" class="px-5 py-2 rounded-lg font-black text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow">
          ✅ Registrar Intervenção
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  const selEq = document.getElementById('comboioEquipamentoId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') {
    ativarBuscaPorPrefixoEmSelect(selEq);
  }
}

async function salvarIntervencaoCampoComboio() {
  if (!usuarioPodeAbrirOS()) return alert('Perfil sem permissão para abrir OS.');

  const eqId = document.getElementById('comboioEquipamentoId').value;
  const origem = document.getElementById('comboioOrigem').value;
  const parada = document.getElementById('comboioParada').value === 'true';
  const resultado = document.getElementById('comboioResultado').value;
  const desc = document.getElementById('comboioDescricao').value.trim();

  if (!eqId || !desc) return alert('Selecione o equipamento e descreva a intervenção realizada!');

  const chips = Array.from(document.querySelectorAll('#containerChipsComboioV2 .chip-mecanico-v2.bg-amber-500'));
  const mecIds = chips.map(c => c.dataset.mecId);
  const mecNomes = chips.map(c => c.dataset.mecNome).join(', ');

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  const agoraISO = new Date().toISOString();

  const resolvidaNaHora = resultado === 'concluido_na_hora';

  const novaOS = {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    tipo: 'corretiva',
    origem_atendimento: origem,
    parada_obrigatoria: parada,
    status: resolvidaNaHora ? 'aguardando_pcm' : (parada ? 'aberta' : 'aviso_operando'),
    descricao_problema: desc,
    acao_realizada: resolvidaNaHora ? desc : null,
    mecanicos_ids: mecIds,
    mecanico_nome: mecNomes || usuarioLogado?.nome || null,
    aberta_por_nome: usuarioLogado?.nome || 'Campo/Comboio',
    aberta_em: agoraISO,
    concluida_em: resolvidaNaHora ? agoraISO : null
  };

  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', novaOS);
  document.getElementById('modalIntervencaoComboioV2')?.classList.add('hidden');
  await carregarOrdensServico(resolvidaNaHora ? 'aguardando_pcm' : (parada ? 'ativas' : 'avisos_operando'));
}
