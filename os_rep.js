// ============================================================================
// VILASA CMMS - MÓDULO 3: OS_REP.JS (100% ALINHADO AO SCHEMA REAL DO SUPABASE)
// Colunas oficiais mapeadas:
// - servico_executado (text)
// - executantes_nomes (text[]), mecanicos_ids (text[]), quantidade_executantes (int)
// - maquina_parada (bool) + parada_obrigatoria (bool)
// - horimetro_os (numeric), aberto_por_nome (text)
// - status check: 'aberta','em_execucao','pausada_peca','pausada_outros','aguardando_pcm','concluida_oficina','auditada_pcm'
// ============================================================================

let abaStatusOSAtual = 'ativas';

if (typeof MATRIZ_PERMISSOES_CARGOS !== 'undefined') {
  if (MATRIZ_PERMISSOES_CARGOS.operador) {
    MATRIZ_PERMISSOES_CARGOS.operador.acoes = ['lancar_horimetro_qr', 'exportar_relatorios'];
  }
  if (MATRIZ_PERMISSOES_CARGOS.encarregado) {
    MATRIZ_PERMISSOES_CARGOS.encarregado.abas_visiveis = ['os'];
    MATRIZ_PERMISSOES_CARGOS.encarregado.acoes = ['abrir_os', 'exportar_relatorios'];
  }
}

function usuarioPodeAbrirOS(user = usuarioLogado) {
  if (!user) return false;
  const cargos = typeof obterCargosUsuario === 'function' ? obterCargosUsuario(user) : [user.cargo_base];
  return cargos.some(c => ['encarregado', 'mecanico', 'pcm', 'engenheiro', 'admin'].includes(c));
}

function usuarioPodeClassificarPCM(user = usuarioLogado) {
  if (!user) return false;
  const cargos = typeof obterCargosUsuario === 'function' ? obterCargosUsuario(user) : [user.cargo_base];
  return cargos.some(c => ['pcm', 'engenheiro', 'admin'].includes(c));
}

function usuarioEhApenasEncarregado(user = usuarioLogado) {
  if (!user) return false;
  const cargos = typeof obterCargosUsuario === 'function' ? obterCargosUsuario(user) : [user.cargo_base];
  return cargos.includes('encarregado') && !cargos.some(c => ['mecanico', 'pcm', 'engenheiro', 'admin'].includes(c));
}

// Helpers para ler campos do schema oficial sem quebrar nada
function osEstaParada(o) {
  if (typeof o.parada_obrigatoria === 'boolean') return o.parada_obrigatoria;
  if (typeof o.maquina_parada === 'boolean') return o.maquina_parada;
  return true;
}

function osEstaFinalizada(o) {
  return ['concluida_oficina', 'auditada_pcm'].includes(o.status) || Boolean(o.concluida_em);
}

function obterNomesExecutantesOS(o) {
  if (Array.isArray(o.executantes_nomes) && o.executantes_nomes.length > 0) {
    return o.executantes_nomes.join(', ');
  }
  return o.mecanico_nome || '';
}

async function lerCacheLocalSeguro(tabela) {
  if (typeof lerTabelaDoCacheOffline === 'function') return await lerTabelaDoCacheOffline(tabela);
  try {
    const raw = localStorage.getItem(`vilasa_cache_${tabela}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ----------------------------------------------------------------------------
// 1. CARREGAMENTO E FILTRAGEM DE ORDENS DE SERVIÇO
// ----------------------------------------------------------------------------
async function carregarOrdensServico(aba = abaStatusOSAtual) {
  if (aba === 'aguardando_pcm' && !usuarioPodeClassificarPCM()) {
    aba = 'ativas';
  }
  abaStatusOSAtual = aba;

  garantirCabecalhoAvancadoOS();

  ['ativas', 'avisos_operando', 'aguardando_pcm', 'concluidas'].forEach(idAba => {
    const btn = document.getElementById(`tab-os-${idAba}`);
    if (btn) {
      const ativo = idAba === aba;
      btn.className = ativo
        ? 'px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950 shadow'
        : 'px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700';
    }
  });

  const res = await lerDadosComFallbackOffline('ordens_servico', async () => {
    return await db
      .from('ordens_servico')
      .select('*, equipamentos(id, tag, nome, marca, modelo, setor, unidade_medida, obra_id, horimetro_atual)')
      .order('aberta_em', { ascending: false })
      .limit(600);
  });

  let lista = res.data || [];

  const eqCache = (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
    ? cacheEquipamentos
    : await lerCacheLocalSeguro('equipamentos');

  lista = lista.map(o => {
    if (!o.equipamentos && o.equipamento_id) {
      const eq = (eqCache || []).find(e => String(e.id) === String(o.equipamento_id));
      if (eq) o.equipamentos = eq;
    }
    // Espelha campos para que o gerador de relatórios PDF/PNG do core.js leia sem erro
    o.mecanico_nome = obterNomesExecutantesOS(o);
    o.acao_realizada = o.servico_executado || '';
    return o;
  });

  if (typeof filtrarListaPorObraAtiva === 'function') {
    lista = filtrarListaPorObraAtiva(lista);
  }

  const termoPrefixo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
  if (termoPrefixo) {
    lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termoPrefixo));
  }

  cacheOrdens = lista;

  // Atualiza Quadro Enxuto de Parados (REP)
  renderizarQuadroEnxutoParadosREP(lista);

  let listaFiltradaAba = [];
  if (aba === 'ativas') {
    listaFiltradaAba = lista.filter(o =>
      osEstaParada(o) &&
      ['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(o.status) &&
      !o.concluida_em
    );
  } else if (aba === 'avisos_operando') {
    listaFiltradaAba = lista.filter(o =>
      !osEstaParada(o) &&
      ['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(o.status) &&
      !o.concluida_em
    );
  } else if (aba === 'aguardando_pcm') {
    listaFiltradaAba = lista.filter(o => o.status === 'aguardando_pcm' || o.status === 'concluida_oficina');
  } else if (aba === 'concluidas') {
    listaFiltradaAba = lista.filter(o => osEstaFinalizada(o) || o.status === 'aguardando_pcm');
  } else {
    listaFiltradaAba = lista;
  }

  renderizarCardsListaOS(listaFiltradaAba);
}

// ----------------------------------------------------------------------------
// 2. QUADRO ENXUTO DE PARADOS (REP)
// ----------------------------------------------------------------------------
function renderizarQuadroEnxutoParadosREP(lista) {
  const paradasAgora = lista.filter(o => {
    const exigeParada = osEstaParada(o);
    const statusAtivo = ['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(o.status);
    return exigeParada && statusAtivo && !o.concluida_em;
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
          <th class="py-2 px-2 border border-amber-600">Nº OS</th>
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
          const nomesEq = obterNomesExecutantesOS(o);
          const labelStatus = o.status === 'pausada_peca' ? 'AGUARD. PEÇA' : (nomesEq ? `🔧 ${nomesEq}` : 'AGUARD. MECÂNICO');

          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">#${o.numero_os || (idx + 1)}</td>
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
// 3. BARRA DE CONTROLES DA ABA OS (RESPEITANDO AS RESTRIÇÕES POR CARGO)
// ----------------------------------------------------------------------------
function garantirCabecalhoAvancadoOS() {
  const secaoOS = document.getElementById('sec-os');
  if (!secaoOS) return;

  document.getElementById('barraModosAvancadosOS')?.remove();

  const barra = document.createElement('div');
  barra.id = 'barraModosAvancadosOS';
  barra.className = 'mb-4 flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white p-3 rounded-xl shadow';

  const podeAbrir = usuarioPodeAbrirOS();
  const podeExecutar = podeExecutarAcao('executar_os');
  const podeVerTriagemPCM = usuarioPodeClassificarPCM();
  const soEncarregado = usuarioEhApenasEncarregado();

  barra.innerHTML = `
    <div class="flex flex-wrap items-center gap-1.5">
      <button id="tab-os-ativas" onclick="carregarOrdensServico('ativas')" class="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950">
        🔴 Paradas / Em Aberto
      </button>
      <button id="tab-os-avisos_operando" onclick="carregarOrdensServico('avisos_operando')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
        🟡 Operando c/ Anomalia (Sem Parada)
      </button>
      ${podeVerTriagemPCM ? `
        <button id="tab-os-aguardando_pcm" onclick="carregarOrdensServico('aguardando_pcm')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
          📋 Triagem / Classificação PCM
        </button>
      ` : ''}
      ${!soEncarregado ? `
        <button id="tab-os-concluidas" onclick="carregarOrdensServico('concluidas')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
          ✅ Concluídas
        </button>
      ` : ''}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input id="filtroPrefixoOS" type="text" oninput="carregarOrdensServico()" placeholder="🔍 Filtrar Prefixo (ex: CB-05)..."
        class="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold uppercase text-amber-300 placeholder-slate-400 focus:outline-none focus:border-amber-400" />
      ${podeAbrir ? `
        <button onclick="abrirModalSolicitacaoAberturaOS()" class="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-plus"></i>
          <span>🚨 Abrir Nova OS</span>
        </button>
      ` : ''}
      ${podeExecutar ? `
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
    solicitacao_encarregado: '📋 Solicitação de Manutenção (OS)',
    inspecao_campo: '🔍 Inspeção de Campo (Oportunidade)',
    atendimento_comboio: '🚛 Atendimento de Comboio / Lubrificação'
  };

  const podeExecutar = podeExecutarAcao('executar_os');
  const podeClassificarPCM = usuarioPodeClassificarPCM();

  container.innerHTML = lista.map(o => {
    const parada = osEstaParada(o);
    const paradaBadge = !parada
      ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black">🟡 OPERANDO COM ANOMALIA</span>`
      : `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">🔴 COM PARADA DE MÁQUINA</span>`;

    const labelOrigem = MapOrigens[o.origem_atendimento] || MapOrigens.solicitacao_encarregado;
    const nomesEquipe = obterNomesExecutantesOS(o);

    return `
      <div class="bg-white rounded-xl border ${!parada ? 'border-amber-300' : 'border-slate-200'} p-4 shadow-sm flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-black text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded">${o.equipamentos?.tag || 'SEM TAG'}</span>
              ${o.numero_os ? `<span class="text-[11px] font-black text-slate-400">#${o.numero_os}</span>` : ''}
            </div>
            <div class="flex items-center gap-1 flex-wrap">${paradaBadge}</div>
          </div>

          <p class="text-xs font-bold text-slate-600 mb-1">${o.equipamentos?.nome || ''} • ${o.equipamentos?.marca || ''}</p>
          <p class="text-[11px] font-semibold text-slate-500 mb-2">${labelOrigem}</p>

          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800">
            ${o.descricao_problema || '-'}
          </div>

          ${o.servico_executado ? `<p class="mt-2 text-xs text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200"><strong>Serviço Executado:</strong> ${o.servico_executado}</p>` : ''}
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
          <div>
            <div><strong>Entrada:</strong> ${new Date(o.aberta_em).toLocaleString('pt-BR')}</div>
            <div><strong>Equipe:</strong> <span class="text-slate-800 font-bold">${nomesEquipe || 'Aguardando mecânico'}</span></div>
          </div>

          <div class="flex items-center gap-1.5">
            ${!parada && !o.concluida_em && podeExecutar ? `
              <button onclick="converterAnomaliaEmParadaOficina('${o.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px]">
                🛑 Encostar p/ Parada
              </button>
            ` : ''}
            ${podeExecutar ? `
              <button onclick="abrirModalExecucaoOSComChips('${o.id}')" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs">
                🔧 Atender / Fechar
              </button>
            ` : ''}
            ${podeClassificarPCM && (o.status === 'aguardando_pcm' || o.status === 'concluida_oficina') && typeof abrirModalValidacaoPCM === 'function' ? `
              <button onclick="abrirModalValidacaoPCM('${o.id}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs">
                📋 Validar PCM
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function converterAnomaliaEmParadaOficina(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;
  if (!confirm('Confirmar que o equipamento parou a operação agora para iniciar o reparo?')) return;

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', {
    maquina_parada: true,
    parada_obrigatoria: true,
    status: 'em_execucao',
    aberta_em: new Date().toISOString()
  }, osId);

  await carregarOrdensServico('ativas');
}

// ----------------------------------------------------------------------------
// 4. MODAL LIMPO PARA ABRIR NOVA OS (GRAVA NAS COLUNAS EXATAS DO BANCO)
// ----------------------------------------------------------------------------
async function abrirModalSolicitacaoAberturaOS() {
  if (!usuarioPodeAbrirOS()) return alert('Seu perfil não possui permissão para abrir OS.');

  const eqLista = (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
    ? cacheEquipamentos
    : await lerCacheLocalSeguro('equipamentos');

  let modal = document.getElementById('modalSolicitacaoNovaOSV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalSolicitacaoNovaOSV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b pb-3 mb-4">
        <div>
          <span class="bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded text-[10px] uppercase">Abertura de Chamado</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">🚨 Abrir Nova Ordem de Serviço (OS)</h3>
        </div>
        <button onclick="document.getElementById('modalSolicitacaoNovaOSV2').classList.add('hidden')" class="text-slate-400 text-xl font-black">&times;</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Equipamento (Filtre pelo Prefixo)</label>
          <select id="novaOSEquipId" class="w-full border border-slate-300 rounded-lg p-2.5 font-bold">
            <option value="">-- Selecione o Equipamento --</option>
            ${(eqLista || []).filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Condição da Máquina</label>
            <select id="novaOSParada" class="w-full border border-slate-300 rounded-lg p-2.5 font-bold">
              <option value="true">🔴 Máquina Parada (REP)</option>
              <option value="false">🟡 Operando c/ Anomalia</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Prioridade</label>
            <select id="novaOSPrioridade" class="w-full border border-slate-300 rounded-lg p-2.5 font-bold">
              <option value="alta">🟠 Alta</option>
              <option value="emergencia">🔴 Emergência</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição do Problema / Defeito Apresentado</label>
          <textarea id="novaOSProblema" rows="3" placeholder="Descreva o sintoma ou defeito observado na máquina..."
            class="w-full border border-slate-300 rounded-lg p-2.5 font-bold uppercase"></textarea>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalSolicitacaoNovaOSV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200 text-slate-700">Cancelar</button>
        <button onclick="confirmarAberturaSolicitacaoOS()" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow">
          🚨 Abrir Ordem de Serviço
        </button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  const selEq = document.getElementById('novaOSEquipId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(selEq);
}

async function confirmarAberturaSolicitacaoOS() {
  const eqId = document.getElementById('novaOSEquipId')?.value;
  const parada = document.getElementById('novaOSParada')?.value === 'true';
  const prioridade = document.getElementById('novaOSPrioridade')?.value || 'alta';
  const problema = document.getElementById('novaOSProblema')?.value.trim().toUpperCase();

  if (!eqId || !problema) return alert('Selecione o Equipamento e descreva o problema!');

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  const nomeAutor = usuarioLogado?.nome || usuarioLogado?.matricula || 'Encarregado';

  // Usa estritamente as colunas e constraints reais da tabela ordens_servico
  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    tipo: 'corretiva',
    prioridade,
    origem_atendimento: 'solicitacao_encarregado',
    maquina_parada: parada,
    parada_obrigatoria: parada,
    status: 'aberta', // Status válido na constraint ordens_servico_status_check
    descricao_problema: problema,
    motivo_rep: 'CORRETIVA',
    aberto_por: usuarioLogado?.id || null,
    aberto_por_nome: nomeAutor,
    aberta_em: new Date().toISOString()
  });

  document.getElementById('modalSolicitacaoNovaOSV2')?.classList.add('hidden');
  await carregarOrdensServico(parada ? 'ativas' : 'avisos_operando');
}

// ----------------------------------------------------------------------------
// 5. SELETOR DE EQUIPE EXECUTANTE — SOMENTE QUEM TEM O CARGO 'mecanico'
// ----------------------------------------------------------------------------
async function obterListaMecanicosParaChips() {
  if (navigator.onLine) {
    try {
      const { data } = await db.from('perfis_usuarios').select('*').order('nome');
      if (data) cacheUsuarios = data;
    } catch (e) {}
  }

  const todos = (cacheUsuarios && cacheUsuarios.length > 0)
    ? cacheUsuarios
    : await lerCacheLocalSeguro('perfis_usuarios');

  return (todos || []).filter(u => {
    if (u.ativo === false) return false;
    const cargos = Array.isArray(u.cargos_lista) && u.cargos_lista.length > 0
      ? u.cargos_lista
      : [u.cargo_base || u.cargo];
    return cargos.some(c => String(c || '').toLowerCase().trim() === 'mecanico');
  });
}

async function abrirModalExecucaoOSComChips(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return alert('Ordem de serviço não localizada.');

  const mecanicos = await obterListaMecanicosParaChips();
  const idsSelecionados = new Set([
    ...(Array.isArray(os.mecanicos_ids) ? os.mecanicos_ids.map(String) : []),
    ...(Array.isArray(os.executantes_ids) ? os.executantes_ids.map(String) : [])
  ]);
  const nomesSalvos = Array.isArray(os.executantes_nomes) ? os.executantes_nomes.map(n => String(n).toUpperCase()) : [];

  let modal = document.getElementById('modalExecucaoChipsV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalExecucaoChipsV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  const dtSaidaValor = os.concluida_em
    ? new Date(os.concluida_em).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);

  const paradaAtual = osEstaParada(os);
  const statusEstaConcluido = ['aguardando_pcm', 'concluida_oficina', 'auditada_pcm'].includes(os.status);

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
              <option value="em_execucao" ${os.status === 'em_execucao' || os.status === 'aberta' ? 'selected' : ''}>🔧 Em Execução</option>
              <option value="pausada_peca" ${os.status === 'pausada_peca' ? 'selected' : ''}>📦 Aguardando Peça</option>
              <option value="pausada_outros" ${os.status === 'pausada_outros' ? 'selected' : ''}>⏸️ Pausada (Outros Motivos)</option>
              <option value="concluida_oficina" ${statusEstaConcluido ? 'selected' : ''}>✅ Concluída / Liberar Equipamento</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Condição Operacional</label>
            <select id="execV2Parada" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="true" ${paradaAtual ? 'selected' : ''}>🔴 Com Parada do Equipamento</option>
              <option value="false" ${!paradaAtual ? 'selected' : ''}>🟡 Sem Parada (Operando / Oportunidade)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">
            👷 Equipe de Mecânicos Executantes (Somente Cargo Mecânico):
          </label>
          <div id="containerChipsMecanicosV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
            ${mecanicos.length > 0 ? mecanicos.map(m => {
              const ativo = idsSelecionados.has(String(m.id)) || nomesSalvos.includes(String(m.nome).toUpperCase());
              return `
                <button type="button" data-mec-id="${m.id}" data-mec-nome="${m.nome}"
                  onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ativo ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}">
                  <i class="fa-solid ${ativo ? 'fa-square-check' : 'fa-square'}"></i>
                  <span>${m.nome}</span>
                </button>
              `;
            }).join('') : `<span class="text-slate-400 font-bold">Nenhum usuário com o cargo 'Mecânico' cadastrado no Admin.</span>`}
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Descrição do Serviço Executado / Causa</label>
          <textarea id="execV2Acao" rows="3" class="w-full border border-slate-300 rounded-lg p-2.5 font-semibold uppercase" placeholder="Descreva o reparo técnico realizado...">${os.servico_executado || ''}</textarea>
        </div>

        <div id="blocoSaidaConclusaoV2" class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Data/Hora de Liberação (Saída)</label>
            <input type="datetime-local" id="execV2DataSaida" value="${dtSaidaValor}" class="w-full border border-emerald-300 rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Horímetro / KM na Saída (Atual: ${os.equipamentos?.horimetro_atual || 0})</label>
            <input type="number" step="0.1" id="execV2HorimetroSaida" value="${os.horimetro_os || os.equipamentos?.horimetro_atual || ''}" class="w-full border border-emerald-300 rounded-lg p-2 font-bold bg-white" />
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
  const liberado = st === 'concluida_oficina';
  if (bloco) bloco.classList.toggle('opacity-40', !liberado);
  if (inpData) inpData.disabled = !liberado;
  if (inpHor) inpHor.disabled = !liberado;
}

async function salvarExecucaoOSComChips(osId) {
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const statusSelecionado = document.getElementById('execV2Status').value;
  const paradaObrigatoria = document.getElementById('execV2Parada').value === 'true';
  const servicoExecutado = document.getElementById('execV2Acao').value.trim().toUpperCase();

  const chipsAtivos = Array.from(document.querySelectorAll('#containerChipsMecanicosV2 .chip-mecanico-v2.bg-amber-500'));
  const mecanicosIds = chipsAtivos.map(c => String(c.dataset.mecId));
  const executantesNomes = chipsAtivos.map(c => String(c.dataset.mecNome));

  const concluindoAgora = statusSelecionado === 'concluida_oficina';

  if (concluindoAgora && !servicoExecutado) {
    return alert('Descreva o serviço executado antes de concluir a Ordem de Serviço!');
  }
  if (concluindoAgora && chipsAtivos.length === 0) {
    return alert('Selecione pelo menos um mecânico que trabalhou nesta Ordem de Serviço clicando no nome!');
  }

  // Usa EXATAMENTE os nomes das colunas da sua tabela ordens_servico!
  const payload = {
    status: concluindoAgora ? 'aguardando_pcm' : statusSelecionado,
    maquina_parada: paradaObrigatoria,
    parada_obrigatoria: paradaObrigatoria,
    servico_executado: servicoExecutado,
    mecanicos_ids: mecanicosIds,
    executantes_nomes: executantesNomes,
    quantidade_executantes: Math.max(1, executantesNomes.length),
    iniciada_em: os.iniciada_em || new Date().toISOString(),
    concluida_em: null
  };

  if (concluindoAgora) {
    const dtSaida = document.getElementById('execV2DataSaida').value;
    const horSaida = parseFloat(document.getElementById('execV2HorimetroSaida').value);

    if (os.equipamentos && !isNaN(horSaida)) {
      await gravarDadosOfflineSafe('equipamentos', 'UPDATE', {
        horimetro_atual: horSaida
      }, os.equipamento_id);
      payload.horimetro_os = horSaida;
    }

    payload.concluida_em = dtSaida ? new Date(dtSaida).toISOString() : new Date().toISOString();
  }

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', payload, osId);
  document.getElementById('modalExecucaoChipsV2')?.classList.add('hidden');
  await carregarOrdensServico(abaStatusOSAtual);
}

// ----------------------------------------------------------------------------
// 6. MODAL DE INTERVENÇÃO DIRETA DE CAMPO / ATENDIMENTO DE COMBOIO
// ----------------------------------------------------------------------------
async function abrirModalIntervencaoCampoComboio() {
  if (!podeExecutarAcao('executar_os', true)) return;

  const eqLista = (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
    ? cacheEquipamentos
    : await lerCacheLocalSeguro('equipamentos');
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
              ${(eqLista || []).map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
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
          <textarea id="comboioDescricao" rows="2" class="w-full border border-slate-300 rounded-lg p-2 font-semibold uppercase" placeholder="Ex: Substituição de mangueira de retorno durante abastecimento..."></textarea>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Equipe Executante (Somente Cargo Mecânico):</label>
          <div id="containerChipsComboioV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-32 overflow-y-auto">
            ${mecanicos.length > 0 ? mecanicos.map(m => {
              const ehLogado = usuarioLogado && String(usuarioLogado.id) === String(m.id);
              return `
                <button type="button" data-mec-id="${m.id}" data-mec-nome="${m.nome}"
                  onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ehLogado ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300'}">
                  <i class="fa-solid ${ehLogado ? 'fa-square-check' : 'fa-square'}"></i>
                  <span>${m.nome}</span>
                </button>
              `;
            }).join('') : `<span class="text-slate-400 font-bold">Nenhum usuário com o cargo 'Mecânico' cadastrado no Admin.</span>`}
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
  if (!podeExecutarAcao('executar_os', true)) return;

  const eqId = document.getElementById('comboioEquipamentoId').value;
  const origem = document.getElementById('comboioOrigem').value;
  const parada = document.getElementById('comboioParada').value === 'true';
  const resultado = document.getElementById('comboioResultado').value;
  const desc = document.getElementById('comboioDescricao').value.trim().toUpperCase();

  if (!eqId || !desc) return alert('Selecione o equipamento e descreva a intervenção realizada!');

  const chips = Array.from(document.querySelectorAll('#containerChipsComboioV2 .chip-mecanico-v2.bg-amber-500'));
  const mecIds = chips.map(c => String(c.dataset.mecId));
  const executantesNomes = chips.map(c => String(c.dataset.mecNome));

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  const agoraISO = new Date().toISOString();
  const resolvidaNaHora = resultado === 'concluido_na_hora';

  const novaOS = {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    tipo: 'corretiva',
    prioridade: parada ? 'alta' : 'media',
    origem_atendimento: origem,
    maquina_parada: parada,
    parada_obrigatoria: parada,
    status: resolvidaNaHora ? 'aguardando_pcm' : 'aberta',
    descricao_problema: desc,
    servico_executado: resolvidaNaHora ? desc : null,
    mecanicos_ids: mecIds,
    executantes_nomes: executantesNomes,
    quantidade_executantes: Math.max(1, executantesNomes.length),
    aberto_por: usuarioLogado?.id || null,
    aberto_por_nome: usuarioLogado?.nome || 'Campo/Comboio',
    aberta_em: agoraISO,
    iniciada_em: agoraISO,
    concluida_em: resolvidaNaHora ? agoraISO : null
  };

  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', novaOS);
  document.getElementById('modalIntervencaoComboioV2')?.classList.add('hidden');
  await carregarOrdensServico(resolvidaNaHora ? 'concluidas' : (parada ? 'ativas' : 'avisos_operando'));
}
