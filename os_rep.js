// ============================================================================
// VILASA CMMS V2 - MÓDULO 3: OS_REP.JS (100% CASADO COM AS 13 COLUNAS LIMPAS)
// ============================================================================

let abaStatusOSAtual = 'ativas';

function usuarioPodeAbrirOS(user = usuarioLogado) {
  if (!user) return false;
  return obterCargosUsuario(user).some(c => ['encarregado', 'mecanico', 'pcm', 'engenheiro', 'admin'].includes(c));
}

function usuarioPodeClassificarPCM(user = usuarioLogado) {
  if (!user) return false;
  return obterCargosUsuario(user).some(c => ['pcm', 'engenheiro', 'admin'].includes(c));
}

function usuarioEhApenasEncarregado(user = usuarioLogado) {
  if (!user) return false;
  const cargos = obterCargosUsuario(user);
  return cargos.includes('encarregado') && !cargos.some(c => ['mecanico', 'pcm', 'engenheiro', 'admin'].includes(c));
}

function formatarParaInputDatetimeLocal(isoString) {
  if (!isoString) return '';
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) return '';
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function carregarOrdensServico(aba = abaStatusOSAtual) {
  if (aba === 'aguardando_pcm' && !usuarioPodeClassificarPCM()) aba = 'ativas';
  abaStatusOSAtual = aba;

  garantirCabecalhoAvancadosOS();

  ['ativas', 'avisos_operando', 'aguardando_pcm', 'concluidas'].forEach(idAba => {
    const btn = document.getElementById(`tab-os-${idAba}`);
    if (btn) {
      btn.className = idAba === aba
        ? 'px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950 shadow'
        : 'px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700';
    }
  });

  const res = await lerDadosComFallbackOffline('ordens_servico', () =>
    db.from('ordens_servico')
      .select('*, equipamentos(id, tag, nome, marca, modelo, unidade_medida, obra_id, horimetro_atual)')
      .order('aberta_em', { ascending: false })
      .limit(600)
  );

  let lista = res.data || [];
  if (typeof filtrarListaPorObraAtiva === 'function') lista = filtrarListaPorObraAtiva(lista);

  const termoPrefixo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
  if (termoPrefixo) {
    lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termoPrefixo));
  }

  cacheOrdens = lista;
  renderizarQuadroEnxutoParadosREP(lista);

  let listaFiltrada = [];
  if (aba === 'ativas') {
    listaFiltrada = lista.filter(o => o.parada_obrigatoria !== false && !o.concluida_em && !['concluida', 'aguardando_pcm'].includes(o.status));
  } else if (aba === 'avisos_operando') {
    listaFiltrada = lista.filter(o => o.parada_obrigatoria === false && !o.concluida_em && o.status !== 'concluida');
  } else if (aba === 'aguardando_pcm') {
    listaFiltrada = lista.filter(o => o.status === 'aguardando_pcm');
  } else if (aba === 'concluidas') {
    listaFiltrada = lista.filter(o => o.status === 'concluida' || Boolean(o.concluida_em));
  } else {
    listaFiltrada = lista;
  }

  renderizarCardsListaOS(listaFiltrada);
}

// QUADRO REP ENXUTO (SEM PREVISÃO DE LIBERAÇÃO)
function renderizarQuadroEnxutoParadosREP(lista) {
  const paradasAgora = lista.filter(o =>
    o.parada_obrigatoria !== false && !o.concluida_em && !['concluida', 'aguardando_pcm'].includes(o.status)
  );

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
          <th class="py-2 px-2 border border-amber-600">LOCAL</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO DO PROBLEMA</th>
          <th class="py-2 px-2 border border-amber-600">ENTRADA</th>
          <th class="py-2 px-2 border border-amber-600 text-center">DIAS PARADOS</th>
          <th class="py-2 px-2 border border-amber-600">EQUIPE / STATUS</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 text-[11px]">
        ${paradasAgora.map((o, idx) => {
          const diasParados = Math.max(1, Math.ceil((new Date() - new Date(o.aberta_em)) / (24 * 3600000)));
          const labelStatus = o.status === 'pausada_peca' ? 'AGUARD. PEÇA' : (o.mecanico_nome ? `🔧 ${o.mecanico_nome}` : 'AGUARD. MECÂNICO');

          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">#${o.numero_os || (idx + 1)}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-800">${o.equipamentos?.nome || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${o.equipamentos?.marca || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-black text-amber-700">${o.equipamentos?.tag || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${o.motivo_rep || 'CORRETIVA'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-600">${o.local_manutencao_pcm || 'OFICINA'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-900">${o.descricao_problema || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${new Date(o.aberta_em).toLocaleString('pt-BR')}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-center font-black text-rose-600">${diasParados}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-amber-700">${labelStatus}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function garantirCabecalhoAvancadosOS() {
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
        🟡 Operando c/ Anomalia
      </button>
      ${podeVerTriagemPCM ? `
        <button id="tab-os-aguardando_pcm" onclick="carregarOrdensServico('aguardando_pcm')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
          📋 Triagem PCM
        </button>
      ` : ''}
      ${!soEncarregado ? `
        <button id="tab-os-concluidas" onclick="carregarOrdensServico('concluidas')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">
          ✅ Concluídas
        </button>
      ` : ''}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input id="filtroPrefixoOS" type="text" oninput="carregarOrdensServico()" placeholder="🔍 Prefixo (ex: CB-05)..."
        class="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold uppercase text-amber-300 placeholder-slate-400 focus:outline-none focus:border-amber-400" />
      ${podeAbrir ? `
        <button onclick="abrirModalSolicitacaoAberturaOS()" class="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-plus"></i><span>🚨 Abrir OS</span>
        </button>
      ` : ''}
      ${podeExecutar ? `
        <button onclick="abrirModalIntervencaoCampoComboio()" class="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-truck-droplet"></i><span>⚡ Registro de Campo</span>
        </button>
      ` : ''}
      ${podeVerTriagemPCM ? `
        <button onclick="abrirModalLancamentoCompletoPCM()" class="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-500 hover:bg-blue-400 text-slate-950 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-clock-rotate-left"></i><span>📋 Lançamento Completo / Retroativo (PCM)</span>
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

  const podeExecutar = podeExecutarAcao('executar_os');
  const podeClassificarPCM = usuarioPodeClassificarPCM();

  container.innerHTML = lista.map(o => {
    const paradaBadge = o.parada_obrigatoria === false
      ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black">🟡 OPERANDO C/ ANOMALIA</span>`
      : `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">🔴 COM PARADA</span>`;

    return `
      <div class="bg-white rounded-xl border ${o.parada_obrigatoria === false ? 'border-amber-300' : 'border-slate-200'} p-4 shadow-sm flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-black text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded">${o.equipamentos?.tag || 'SEM TAG'}</span>
              ${o.numero_os ? `<span class="text-[11px] font-black text-slate-400">#${o.numero_os}</span>` : ''}
              <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">${o.motivo_rep || 'CORRETIVA'}</span>
            </div>
            ${paradaBadge}
          </div>

          <p class="text-xs font-bold text-slate-600 mb-2">${o.equipamentos?.nome || ''} • Local: <strong>${o.local_manutencao_pcm || 'OFICINA'}</strong></p>

          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800">
            ${o.descricao_problema || '-'}
          </div>

          ${o.servico_executado ? `<p class="mt-2 text-xs text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200"><strong>Serviço Executado:</strong> ${o.servico_executado}</p>` : ''}
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
          <div>
            <div><strong>Entrada:</strong> ${new Date(o.aberta_em).toLocaleString('pt-BR')}</div>
            ${o.concluida_em ? `<div><strong>Saída:</strong> <span class="text-emerald-700 font-bold">${new Date(o.concluida_em).toLocaleString('pt-BR')}</span></div>` : ''}
            <div><strong>Equipe:</strong> <span class="text-slate-800 font-bold">${o.mecanico_nome || 'Aguardando mecânico'}</span></div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            ${o.parada_obrigatoria === false && !o.concluida_em && podeExecutar ? `
              <button onclick="converterAnomaliaEmParadaOficina('${o.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px]">
                🛑 Encostar p/ Parada
              </button>
            ` : ''}
            ${podeExecutar ? `
              <button onclick="abrirModalExecucaoOSComChips('${o.id}')" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs">
                🔧 Atender / Fechar
              </button>
            ` : ''}
            ${podeClassificarPCM ? `
              <button onclick="abrirModalLancamentoCompletoPCM('${o.id}')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs">
                📋 Editar / PCM
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
  if (!confirm('Confirmar que o equipamento parou a operação agora?')) return;
  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', {
    parada_obrigatoria: true,
    status: 'em_execucao',
    aberta_em: new Date().toISOString()
  }, osId);
  await carregarOrdensServico('ativas');
}

// MODAL COMPLETO / RETROATIVO DO PCM (APENAS OS CAMPOS ENXUTOS DA TABELA NOVA)
async function abrirModalLancamentoCompletoPCM(osId = null) {
  if (!usuarioPodeClassificarPCM()) return alert('Acesso restrito ao PCM e Administração.');

  if (!cacheEquipamentos || cacheEquipamentos.length === 0) {
    const { data } = await db.from('equipamentos').select('*').order('tag');
    cacheEquipamentos = data || [];
  }
  const mecanicos = await obterListaMecanicosParaChips();
  const os = osId ? (cacheOrdens || []).find(o => String(o.id) === String(osId)) : null;

  const agoraLocal = formatarParaInputDatetimeLocal(new Date().toISOString());
  const dtAberta = os?.aberta_em ? formatarParaInputDatetimeLocal(os.aberta_em) : agoraLocal;
  const dtConcluida = os?.concluida_em ? formatarParaInputDatetimeLocal(os.concluida_em) : (os ? '' : agoraLocal);
  const statusAtual = os?.status || 'concluida';
  const nomesSalvos = (os?.mecanico_nome || '').split(',').map(n => n.trim().toUpperCase()).filter(Boolean);

  let modal = document.getElementById('modalLancamentoCompletoPCMV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalLancamentoCompletoPCMV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border-2 border-blue-500 my-8 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b pb-3 mb-4">
        <div>
          <span class="bg-blue-600 text-white font-black px-2.5 py-0.5 rounded text-[10px] uppercase">Controle Total PCM & REP</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">
            ${os ? `✏️ Editar OS #${os.numero_os || ''} (${os.equipamentos?.tag || ''})` : '📋 Lançamento Completo / Retroativo de Manutenção (PCM)'}
          </h3>
        </div>
        <button onclick="document.getElementById('modalLancamentoCompletoPCMV2').classList.add('hidden')" class="text-slate-400 text-2xl font-black">&times;</button>
      </div>

      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Equipamento (Prefixo)</label>
            <select id="pcmFullEquipId" class="w-full border rounded-lg p-2 font-bold bg-white">
              <option value="">-- Selecione --</option>
              ${cacheEquipamentos.map(e => `<option value="${e.id}" ${os && String(os.equipamento_id) === String(e.id) ? 'selected' : ''}>${e.tag} - ${e.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-blue-900 mb-1">Etapa / Status da OS</label>
            <select id="pcmFullStatus" class="w-full border-2 border-blue-400 rounded-lg p-2 font-black bg-white">
              <option value="concluida" ${statusAtual === 'concluida' ? 'selected' : ''}>✅ Concluída / Finalizada</option>
              <option value="aguardando_pcm" ${statusAtual === 'aguardando_pcm' ? 'selected' : ''}>📋 Aguardando Triagem PCM</option>
              <option value="em_execucao" ${statusAtual === 'em_execucao' ? 'selected' : ''}>⚙️ Em Execução (Ativa)</option>
              <option value="pausada_peca" ${statusAtual === 'pausada_peca' ? 'selected' : ''}>📦 Aguardando Peça</option>
              <option value="aberta" ${statusAtual === 'aberta' ? 'selected' : ''}>🚨 Aberta (Fila Inicial)</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Condição Operacional</label>
            <select id="pcmFullParada" class="w-full border rounded-lg p-2 font-bold bg-white">
              <option value="true" ${os?.parada_obrigatoria !== false ? 'selected' : ''}>🔴 Com Parada (REP)</option>
              <option value="false" ${os?.parada_obrigatoria === false ? 'selected' : ''}>🟡 Sem Parada (Operando)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Data/Hora Entrada (Abertura)</label>
            <input type="datetime-local" id="pcmFullAbertaEm" value="${dtAberta}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Data/Hora Saída (Vazio = Aberta)</label>
            <input type="datetime-local" id="pcmFullConcluidaEm" value="${dtConcluida}" class="w-full border border-emerald-400 rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horímetro / KM na OS</label>
            <input type="number" step="0.1" id="pcmFullHorimetro" value="${os?.horimetro_os || ''}" placeholder="Ex: 4520.5" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Motivo REP (Livre)</label>
            <input type="text" id="pcmFullMotivoRep" value="${os?.motivo_rep || 'CORRETIVA'}" placeholder="CORRETIVA, PREVENTIVA, MOTOR, HIDRÁULICA..." class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Local da Manutenção</label>
            <input type="text" id="pcmFullLocalManut" value="${os?.local_manutencao_pcm || 'OFICINA'}" placeholder="OFICINA, CAMPO, EXTERNA..." class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Descrição do Problema / Defeito</label>
            <textarea id="pcmFullProblema" rows="3" class="w-full border rounded-lg p-2 font-bold uppercase">${os?.descricao_problema || ''}</textarea>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Serviço Executado / Solução</label>
            <textarea id="pcmFullServico" rows="3" class="w-full border rounded-lg p-2 font-bold uppercase">${os?.servico_executado || ''}</textarea>
          </div>
        </div>

        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
          <label class="block font-black uppercase text-slate-700">👷 Equipe de Mecânicos Executantes:</label>
          <div id="containerChipsPCMFull" class="flex flex-wrap gap-1.5">
            ${mecanicos.map(m => {
              const ativo = nomesSalvos.includes(String(m.nome).toUpperCase());
              return `
                <button type="button" data-mec-nome="${m.nome}" onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ativo ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300'}">
                  <i class="fa-solid ${ativo ? 'fa-square-check' : 'fa-square'}"></i><span>${m.nome}</span>
                </button>
              `;
            }).join('')}
          </div>
          <input type="text" id="pcmFullExecutantesLivres" value="${nomesSalvos.filter(n => !mecanicos.some(m => String(m.nome).toUpperCase() === n)).join(', ')}"
            placeholder="Ou digite nomes extras separados por vírgula..." class="w-full border rounded-lg p-2 font-bold uppercase bg-white" />
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2 border-t pt-3">
        <button onclick="document.getElementById('modalLancamentoCompletoPCMV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200 text-slate-700">Cancelar</button>
        <button onclick="salvarLancamentoCompletoPCM('${os ? os.id : ''}')" class="px-6 py-2.5 rounded-lg font-black text-xs bg-blue-600 hover:bg-blue-500 text-white shadow">
          💾 Salvar Registro
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  const selEq = document.getElementById('pcmFullEquipId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(selEq);
}

async function salvarLancamentoCompletoPCM(osId = '') {
  const eqId = document.getElementById('pcmFullEquipId')?.value;
  const status = document.getElementById('pcmFullStatus')?.value || 'concluida';
  const parada = document.getElementById('pcmFullParada')?.value === 'true';
  const dtAberta = document.getElementById('pcmFullAbertaEm')?.value;
  const dtConcluida = document.getElementById('pcmFullConcluidaEm')?.value;
  const horimetro = parseFloat(document.getElementById('pcmFullHorimetro')?.value);
  const motivoRep = (document.getElementById('pcmFullMotivoRep')?.value || 'CORRETIVA').trim().toUpperCase();
  const localManut = (document.getElementById('pcmFullLocalManut')?.value || 'OFICINA').trim().toUpperCase();
  const problema = (document.getElementById('pcmFullProblema')?.value || '').trim().toUpperCase();
  const servico = (document.getElementById('pcmFullServico')?.value || '').trim().toUpperCase();

  if (!eqId || !problema) return alert('Selecione o Equipamento e descreva o problema!');

  const chips = Array.from(document.querySelectorAll('#containerChipsPCMFull .chip-mecanico-v2.bg-amber-500')).map(c => c.dataset.mecNome.toUpperCase());
  const livres = (document.getElementById('pcmFullExecutantesLivres')?.value || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const todosNomes = [...new Set([...chips, ...livres])].join(', ');

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  const payload = {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    status,
    parada_obrigatoria: parada,
    motivo_rep: motivoRep,
    local_manutencao_pcm: localManut,
    descricao_problema: problema,
    servico_executado: servico,
    mecanico_nome: todosNomes,
    horimetro_os: isNaN(horimetro) ? null : horimetro,
    aberta_em: dtAberta ? new Date(dtAberta).toISOString() : new Date().toISOString(),
    concluida_em: dtConcluida ? new Date(dtConcluida).toISOString() : null
  };

  if (!osId) await gravarDadosOfflineSafe('ordens_servico', 'INSERT', payload);
  else await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', payload, osId);

  if (!isNaN(horimetro) && horimetro > (parseFloat(eqObj?.horimetro_atual) || 0)) {
    await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { horimetro_atual: horimetro }, eqId);
  }

  document.getElementById('modalLancamentoCompletoPCMV2')?.classList.add('hidden');
  await carregarOrdensServico(payload.concluida_em ? 'concluidas' : (parada ? 'ativas' : 'avisos_operando'));
}

// MODAL SIMPLES DE ABERTURA DE OS (ENCARREGADO)
async function abrirModalSolicitacaoAberturaOS() {
  if (!usuarioPodeAbrirOS()) return alert('Sem permissão para abrir OS.');
  if (!cacheEquipamentos || cacheEquipamentos.length === 0) {
    const { data } = await db.from('equipamentos').select('*').order('tag');
    cacheEquipamentos = data || [];
  }

  let modal = document.getElementById('modalSolicitacaoNovaOSV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalSolicitacaoNovaOSV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">🚨 Abrir Nova Ordem de Serviço (OS)</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Equipamento (Prefixo)</label>
          <select id="novaOSEquipId" class="w-full border rounded-lg p-2.5 font-bold">
            <option value="">-- Selecione o Equipamento --</option>
            ${cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Condição da Máquina</label>
          <select id="novaOSParada" class="w-full border rounded-lg p-2.5 font-bold">
            <option value="true">🔴 Máquina Parada (REP)</option>
            <option value="false">🟡 Operando c/ Anomalia (Sem Parada)</option>
          </select>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição do Problema</label>
          <textarea id="novaOSProblema" rows="3" placeholder="Descreva o defeito apresentado..." class="w-full border rounded-lg p-2.5 font-bold uppercase"></textarea>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalSolicitacaoNovaOSV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="confirmarAberturaSolicitacaoOS()" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 text-slate-950 shadow">🚨 Abrir OS</button>
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
  const problema = document.getElementById('novaOSProblema')?.value.trim().toUpperCase();
  if (!eqId || !problema) return alert('Selecione o Equipamento e descreva o problema!');

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    status: 'aberta',
    parada_obrigatoria: parada,
    motivo_rep: 'CORRETIVA',
    local_manutencao_pcm: 'OFICINA',
    descricao_problema: problema,
    aberta_em: new Date().toISOString()
  });

  document.getElementById('modalSolicitacaoNovaOSV2')?.classList.add('hidden');
  await carregarOrdensServico(parada ? 'ativas' : 'avisos_operando');
}

// CHIPS DE MECÂNICOS EXECUTANTES (SOMENTE CARGO 'mecanico')
async function obterListaMecanicosParaChips() {
  if (navigator.onLine) {
    try {
      const { data } = await db.from('perfis_usuarios').select('*').order('nome');
      if (data) cacheUsuarios = data;
    } catch (e) {}
  }
  return obterApenasMecanicosExecutantes(cacheUsuarios || []);
}

async function abrirModalExecucaoOSComChips(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const mecanicos = await obterListaMecanicosParaChips();
  const nomesSalvos = (os.mecanico_nome || '').split(',').map(n => n.trim().toUpperCase()).filter(Boolean);
  const dtSaidaValor = os.concluida_em ? formatarParaInputDatetimeLocal(os.concluida_em) : formatarParaInputDatetimeLocal(new Date().toISOString());

  let modal = document.getElementById('modalExecucaoChipsV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalExecucaoChipsV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">🔧 Apontamento Técnico (${os.equipamentos?.tag || ''})</h3>
      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Status</label>
            <select id="execV2Status" onchange="alternarTravaSaidaExecV2()" class="w-full border rounded-lg p-2 font-bold">
              <option value="em_execucao" ${os.status === 'em_execucao' || os.status === 'aberta' ? 'selected' : ''}>🔧 Em Execução</option>
              <option value="pausada_peca" ${os.status === 'pausada_peca' ? 'selected' : ''}>📦 Aguardando Peça</option>
              <option value="concluida" ${os.status === 'concluida' || os.status === 'aguardando_pcm' ? 'selected' : ''}>✅ Concluir e Liberar Máquina</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Condição Operacional</label>
            <select id="execV2Parada" class="w-full border rounded-lg p-2 font-bold">
              <option value="true" ${os.parada_obrigatoria !== false ? 'selected' : ''}>🔴 Com Parada</option>
              <option value="false" ${os.parada_obrigatoria === false ? 'selected' : ''}>🟡 Sem Parada</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Equipe de Mecânicos (Somente Cargo Mecânico):</label>
          <div id="containerChipsMecanicosV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-3 rounded-xl border">
            ${mecanicos.map(m => {
              const ativo = nomesSalvos.includes(String(m.nome).toUpperCase());
              return `
                <button type="button" data-mec-nome="${m.nome}" onclick="alternarSelecaoChipMecanico(this)"
                  class="chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 ${ativo ? 'bg-amber-500 text-slate-950 border-amber-600 shadow' : 'bg-white text-slate-700 border-slate-300'}">
                  <i class="fa-solid ${ativo ? 'fa-square-check' : 'fa-square'}"></i><span>${m.nome}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Serviço Executado</label>
          <textarea id="execV2Acao" rows="3" class="w-full border rounded-lg p-2.5 font-semibold uppercase">${os.servico_executado || ''}</textarea>
        </div>

        <div id="blocoSaidaConclusaoV2" class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Data/Hora de Saída</label>
            <input type="datetime-local" id="execV2DataSaida" value="${dtSaidaValor}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Horímetro / KM na Saída</label>
            <input type="number" step="0.1" id="execV2HorimetroSaida" value="${os.horimetro_os || os.equipamentos?.horimetro_atual || ''}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalExecucaoChipsV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="salvarExecucaoOSComChips('${os.id}')" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 text-slate-950 shadow">💾 Salvar</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  alternarTravaSaidaExecV2();
}

function alternarSelecaoChipMecanico(btn) {
  const ativo = btn.classList.contains('bg-amber-500');
  const icon = btn.querySelector('i');
  btn.className = ativo
    ? 'chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 bg-white text-slate-700 border-slate-300'
    : 'chip-mecanico-v2 px-3 py-1.5 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 bg-amber-500 text-slate-950 border-amber-600 shadow';
  if (icon) icon.className = ativo ? 'fa-solid fa-square' : 'fa-solid fa-square-check';
}

function alternarTravaSaidaExecV2() {
  const liberado = document.getElementById('execV2Status')?.value === 'concluida';
  document.getElementById('blocoSaidaConclusaoV2')?.classList.toggle('opacity-40', !liberado);
}

async function salvarExecucaoOSComChips(osId) {
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const statusSel = document.getElementById('execV2Status').value;
  const parada = document.getElementById('execV2Parada').value === 'true';
  const servico = document.getElementById('execV2Acao').value.trim().toUpperCase();
  const nomes = Array.from(document.querySelectorAll('#containerChipsMecanicosV2 .chip-mecanico-v2.bg-amber-500')).map(c => c.dataset.mecNome).join(', ');

  if (statusSel === 'concluida' && (!servico || !nomes)) {
    return alert('Para concluir a OS, descreva o serviço executado e marque pelo menos 1 mecânico!');
  }

  const payload = {
    status: statusSel === 'concluida' ? 'aguardando_pcm' : statusSel,
    parada_obrigatoria: parada,
    servico_executado: servico,
    mecanico_nome: nomes || os.mecanico_nome || '',
    concluida_em: null
  };

  if (statusSel === 'concluida') {
    const dtSaida = document.getElementById('execV2DataSaida').value;
    const horSaida = parseFloat(document.getElementById('execV2HorimetroSaida').value);
    if (!isNaN(horSaida)) {
      await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { horimetro_atual: horSaida }, os.equipamento_id);
      payload.horimetro_os = horSaida;
    }
    payload.concluida_em = dtSaida ? new Date(dtSaida).toISOString() : new Date().toISOString();
  }

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', payload, osId);
  document.getElementById('modalExecucaoChipsV2')?.classList.add('hidden');
  await carregarOrdensServico(abaStatusOSAtual);
}

// REGISTRO DE CAMPO / COMBOIO
async function abrirModalIntervencaoCampoComboio() {
  if (!podeExecutarAcao('executar_os', true)) return;
  if (!cacheEquipamentos || cacheEquipamentos.length === 0) {
    const { data } = await db.from('equipamentos').select('*').order('tag');
    cacheEquipamentos = data || [];
  }
  const mecanicos = await obterListaMecanicosParaChips();

  let modal = document.getElementById('modalIntervencaoComboioV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalIntervencaoComboioV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">⚡ Registro de Campo / Atendimento de Comboio</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Equipamento</label>
            <select id="comboioEquipamentoId" class="w-full border rounded-lg p-2 font-bold">
              <option value="">-- Selecione --</option>
              ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Condição</label>
            <select id="comboioParada" class="w-full border rounded-lg p-2 font-bold">
              <option value="false">🟢 Sem Parada (Comboio / Oportunidade)</option>
              <option value="true">🔴 Com Parada da Máquina</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Problema e Serviço Realizado em Campo</label>
          <textarea id="comboioDescricao" rows="2" class="w-full border rounded-lg p-2 font-semibold uppercase"></textarea>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Equipe Executante (Somente Cargo Mecânico):</label>
          <div id="containerChipsComboioV2" class="flex flex-wrap gap-1.5 bg-slate-50 p-2.5 rounded-xl border">
            ${mecanicos.map(m => `
              <button type="button" data-mec-nome="${m.nome}" onclick="alternarSelecaoChipMecanico(this)"
                class="chip-mecanico-v2 px-3 py-1 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 bg-white text-slate-700 border-slate-300">
                <i class="fa-solid fa-square"></i><span>${m.nome}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalIntervencaoComboioV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="salvarIntervencaoCampoComboio()" class="px-5 py-2 rounded-lg font-black text-xs bg-emerald-500 text-slate-950 shadow">✅ Salvar</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  const selEq = document.getElementById('comboioEquipamentoId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(selEq);
}

async function salvarIntervencaoCampoComboio() {
  const eqId = document.getElementById('comboioEquipamentoId').value;
  const parada = document.getElementById('comboioParada').value === 'true';
  const desc = document.getElementById('comboioDescricao').value.trim().toUpperCase();
  const nomes = Array.from(document.querySelectorAll('#containerChipsComboioV2 .chip-mecanico-v2.bg-amber-500')).map(c => c.dataset.mecNome).join(', ');

  if (!eqId || !desc) return alert('Selecione o equipamento e descreva o atendimento!');
  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  const agora = new Date().toISOString();

  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    status: 'aguardando_pcm',
    parada_obrigatoria: parada,
    motivo_rep: 'CAMPO / COMBOIO',
    local_manutencao_pcm: 'CAMPO',
    descricao_problema: desc,
    servico_executado: desc,
    mecanico_nome: nomes,
    aberta_em: agora,
    concluida_em: agora
  });

  document.getElementById('modalIntervencaoComboioV2')?.classList.add('hidden');
  await carregarOrdensServico('concluidas');
}
