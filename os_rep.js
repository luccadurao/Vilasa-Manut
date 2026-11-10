// ============================================================================
// VILASA CMMS V2 - MÓDULO 3: OS_REP.JS (FLUXO DIRETO SEM CONDIÇÃO OPERACIONAL)
// ============================================================================

let abaStatusOSAtual = 'ativas';
let _qtdOSAbetasAnterior = null;

const LISTA_MOTIVOS_REP = [
  'CORRETIVA',
  'PREVENTIVA',
  'FALHA OPERACIONAL'
];

const LISTA_CLASSIFICACAO_FALHA = [
  'MOTOR',
  'TRANSMISSAO/ CAIXA DE MARCHA',
  'ACIDENTES E FALHAS OPERACIONAIS',
  'DIFERENCIAL, CARDAN E CUBOS DE RODAS',
  'COMANDO FINAL E REDUTOR DE TRACAO',
  'SISTEMA HIDRAULICO',
  'IMPLEMENTO',
  'MATERIAL RODANTE',
  'PNEU',
  'LANTERNAGEM E PINTURA',
  'FREIOS, RODAS E SISTEMA PNEUMATICO',
  'FILTRO E ÓLEO',
  'MATERIAL DESGASTE E FPS',
  'CONCHA, LAMINA E ESCARIFICADOR',
  'ELETRICA',
  'AR CONDICIONADO',
  'CHASSI, ESTRUTURA E SISTEMAS DIVERSOS',
  'MANUTENÇÃO PREVENTIVA',
  'LUBRIFICAÇÃO',
  'LAVAGEM'
];

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

function dispararNotificacaoNovasOS(qtdNovas) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 Nova Ordem de Serviço Aberta!', {
        body: `Existem ${qtdNovas} OS aguardando mecânico assumir.`
      });
    }
  } catch (e) {}
}

async function carregarOrdensServico(aba = abaStatusOSAtual) {
  if (aba === 'aguardando_pcm' && !usuarioPodeClassificarPCM()) aba = 'ativas';
  if (aba === 'avisos_operando') aba = 'ativas';
  abaStatusOSAtual = aba;

  garantirCabecalhoAvancadosOS();

  ['ativas', 'aguardando_pcm', 'concluidas'].forEach(idAba => {
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

  // Verifica novas OS abertas sem mecânico para notificar equipe
  const abertasSemMecanico = lista.filter(o => o.status === 'aberta' && !o.concluida_em);
  if (_qtdOSAbetasAnterior !== null && abertasSemMecanico.length > _qtdOSAbetasAnterior) {
    dispararNotificacaoNovasOS(abertasSemMecanico.length);
  }
  _qtdOSAbetasAnterior = abertasSemMecanico.length;

  const termoPrefixo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
  if (termoPrefixo) {
    lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termoPrefixo));
  }

  cacheOrdens = lista;
  renderizarQuadroEnxutoParadosREP(lista);

  let listaFiltrada = [];
  if (aba === 'ativas') {
    listaFiltrada = lista.filter(o => !o.concluida_em && !['concluida', 'aguardando_pcm'].includes(o.status));
  } else if (aba === 'aguardando_pcm') {
    listaFiltrada = lista.filter(o => o.status === 'aguardando_pcm');
  } else if (aba === 'concluidas') {
    listaFiltrada = lista.filter(o => o.status === 'concluida' || Boolean(o.concluida_em));
  } else {
    listaFiltrada = lista;
  }

  renderizarCardsListaOS(listaFiltrada);
}

// ----------------------------------------------------------------------------
// 1. QUADRO REP ENXUTO (CONTABILIZA TODAS AS OS ATIVAS)
// ----------------------------------------------------------------------------
function renderizarQuadroEnxutoParadosREP(lista) {
  const paradasAgora = lista.filter(o =>
    !o.concluida_em && !['concluida', 'aguardando_pcm'].includes(o.status)
  );

  const spanData = document.getElementById('dataHoraCabecalhoREP');
  const spanContador = document.getElementById('contadorParadosCabecalhoREP');
  const divTabela = document.getElementById('tabelaEnxutaParadosREP');

  if (spanData) spanData.innerText = `Atualizado em: ${new Date().toLocaleString('pt-BR')}`;
  if (spanContador) spanContador.innerText = `${paradasAgora.length} Equipamento(s) em Manutenção`;
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
          <th class="py-2 px-2 border border-amber-600">SISTEMA / FALHA</th>
          <th class="py-2 px-2 border border-amber-600">LOCAL</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO DO PROBLEMA</th>
          <th class="py-2 px-2 border border-amber-600">INÍCIO</th>
          <th class="py-2 px-2 border border-amber-600 text-center">HORAS</th>
          <th class="py-2 px-2 border border-amber-600">EQUIPE / STATUS</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 text-[11px]">
        ${paradasAgora.map((o, idx) => {
          const horasParadas = Math.max(0.1, ((new Date() - new Date(o.aberta_em)) / 3600000)).toFixed(1);
          const labelStatus = o.status === 'pausada_peca'
            ? '📦 AGUARD. PEÇA'
            : (o.mecanico_nome ? `🔧 ${o.mecanico_nome}` : '🚨 AGUARD. MECÂNICO ASSUMIR');

          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">#${o.numero_os || (idx + 1)}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-800">${o.equipamentos?.nome || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${o.equipamentos?.marca || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-black text-amber-700">${o.equipamentos?.tag || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${o.motivo_rep || 'CORRETIVA'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-700">${o.classificacao_falha || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-600">${o.local_manutencao_pcm || 'OFICINA'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-900">${o.descricao_problema || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${new Date(o.aberta_em).toLocaleString('pt-BR')}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-center font-black text-rose-600">${horasParadas}h</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold ${o.mecanico_nome ? 'text-emerald-700' : 'text-rose-600'}">${labelStatus}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------------------
// 2. BARRA DE CONTROLES DA ABA OS (SEM ABA OPERANDO C/ ANOMALIA)
// ----------------------------------------------------------------------------
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
        🔴 Em Aberto / Em Manutenção
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

// ----------------------------------------------------------------------------
// 3. CARDS DE OS COM BOTÃO "ASSUMIR ATENDIMENTO" PARA OS MECÂNICOS
// ----------------------------------------------------------------------------
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
    const aguardandoAssumir = o.status === 'aberta' && !o.mecanico_nome && !o.concluida_em;
    const statusBadge = aguardandoAssumir
      ? `<span class="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black animate-pulse">🚨 CHAMADO ABERTO • AGUARDANDO MECÂNICO</span>`
      : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 text-[10px] font-black uppercase">${o.status}</span>`;

    const horasDecorridas = o.aberta_em
      ? (((o.concluida_em ? new Date(o.concluida_em) : new Date()) - new Date(o.aberta_em)) / 3600000).toFixed(1)
      : '0.0';

    return `
      <div class="bg-white rounded-xl border ${aguardandoAssumir ? 'border-2 border-rose-500' : 'border-slate-200'} p-4 shadow-sm flex flex-col justify-between gap-3">
        <div>
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm font-black text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded">${o.equipamentos?.tag || 'SEM TAG'}</span>
              ${o.numero_os ? `<span class="text-[11px] font-black text-slate-400">#${o.numero_os}</span>` : ''}
              <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">${o.motivo_rep || 'CORRETIVA'}</span>
              ${o.classificacao_falha ? `<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">${o.classificacao_falha}</span>` : ''}
            </div>
            ${statusBadge}
          </div>

          <p class="text-xs font-bold text-slate-600 mb-2">${o.equipamentos?.nome || ''} • Local: <strong>${o.local_manutencao_pcm || 'OFICINA'}</strong> • Tempo: <strong class="text-rose-600">${horasDecorridas}h</strong></p>

          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800">
            ${o.descricao_problema || '-'}
          </div>

          ${o.servico_executado ? `<p class="mt-2 text-xs text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200"><strong>Serviço Executado:</strong> ${o.servico_executado}</p>` : ''}
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
          <div>
            <div><strong>Início:</strong> ${new Date(o.aberta_em).toLocaleString('pt-BR')}</div>
            ${o.concluida_em ? `<div><strong>Fim:</strong> <span class="text-emerald-700 font-bold">${new Date(o.concluida_em).toLocaleString('pt-BR')}</span></div>` : ''}
            <div><strong>Mecânicos:</strong> <span class="text-slate-800 font-bold">${o.mecanico_nome || 'Aguardando mecânico assumir'}</span></div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            ${podeExecutar && !o.concluida_em && aguardandoAssumir ? `
              <button onclick="assumirAtendimentoOS('${o.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow">
                ✋ Assumir OS
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

async function assumirAtendimentoOS(osId) {
  if (!podeExecutarAcao('executar_os', true)) return;
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const nomeMec = (usuarioLogado?.nome || usuarioLogado?.matricula || 'MECÂNICO').toUpperCase();
  const atuais = (os.mecanico_nome || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!atuais.includes(nomeMec)) atuais.push(nomeMec);

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', {
    status: 'em_execucao',
    mecanico_nome: atuais.join(', ')
  }, osId);

  await carregarOrdensServico(abaStatusOSAtual);
}

// ----------------------------------------------------------------------------
// 4. ABERTURA DE OS (COM LOCALIZAÇÃO, TRAVA DE HORÍMETRO E AUTO-ATENDIMENTO DE MECÂNICO)
// ----------------------------------------------------------------------------
function validarHorimetroAberturaOS(equipamento, valorDigitado) {
  const horNovo = parseFloat(valorDigitado);
  const un = (equipamento?.unidade_medida || 'H').toUpperCase();
  const horAtual = parseFloat(equipamento?.horimetro_atual || 0);

  if (isNaN(horNovo) || horNovo <= 0) {
    alert(`❌ HORÍMETRO INVÁLIDO:\nInforme o Horímetro / ${un} atual do equipamento (${equipamento?.tag || ''}) para abrir a OS!`);
    return false;
  }

  // 1. Bloqueia se o valor digitado for MENOR que o horímetro já registrado no banco
  if (horAtual > 0 && horNovo < horAtual) {
    alert(
      `❌ ABERTURA BLOQUEADA (HORÍMETRO MENOR QUE O ATUAL)!\n\n` +
      `• Equipamento: ${equipamento.tag}\n` +
      `• Registrado no Sistema: ${horAtual} ${un}\n` +
      `• Valor Digitado: ${horNovo} ${un}\n\n` +
      `O horímetro não pode retroceder. Verifique a leitura no painel da máquina!`
    );
    return false;
  }

  // 2. Bloqueia se houver um salto absurdo (ex: digitou um zero a mais)
  const limiteSalto = un === 'KM' ? 5000 : 300;
  if (horAtual > 0 && (horNovo - horAtual) > limiteSalto) {
    const podeForcar = usuarioPodeClassificarPCM();
    const msgSalto =
      `❌ ABERTURA BLOQUEADA (SALTO DE HORÍMETRO INCONSISTENTE)!\n\n` +
      `• Equipamento: ${equipamento.tag}\n` +
      `• Último Registrado: ${horAtual} ${un}\n` +
      `• Valor Digitado: ${horNovo} ${un} (+${(horNovo - horAtual).toFixed(1)} ${un})\n\n` +
      `O valor digitado subiu mais de ${limiteSalto} ${un} de uma só vez. Confira se não foi digitado um número a mais!`;

    if (!podeForcar) {
      alert(msgSalto);
      return false;
    } else {
      return confirm(msgSalto + `\n\nComo você é do PCM/Admin, deseja forçar esse valor mesmo assim?`);
    }
  }

  return true;
}

function atualizarDicaHorimetroNovaOS(equipId) {
  const eq = (cacheEquipamentos || []).find(e => String(e.id) === String(equipId));
  const lbl = document.getElementById('labelDicaHorimetroNovaOS');
  const inp = document.getElementById('novaOSHorimetro');
  if (!eq) {
    if (lbl) lbl.innerText = 'Horímetro / KM Atual';
    return;
  }
  const un = eq.unidade_medida || 'H';
  const atual = parseFloat(eq.horimetro_atual || 0);
  if (lbl) lbl.innerText = `Horímetro / ${un} Atual (Mínimo: ${atual} ${un})`;
  if (inp) inp.placeholder = `Maior ou igual a ${atual}`;
}

async function abrirModalSolicitacaoAberturaOS() {
  if (!usuarioPodeAbrirOS()) return alert('Sem permissão para abrir OS.');
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }

  if (!cacheEquipamentos || cacheEquipamentos.length === 0) {
    const { data } = await db.from('equipamentos').select('*').order('tag');
    cacheEquipamentos = data || [];
  }

  const ehMecanico = obterCargosUsuario(usuarioLogado).includes('mecanico');

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
      ${ehMecanico ? `
        <div class="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold">
          🔧 Como você é <strong>Mecânico</strong>, esta OS já será aberta direto <strong>Em Atendimento</strong> no seu nome!
        </div>
      ` : ''}
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">1. Equipamento (Prefixo)</label>
          <select id="novaOSEquipId" onchange="atualizarDicaHorimetroNovaOS(this.value)" class="w-full border rounded-lg p-2.5 font-bold">
            <option value="">-- Selecione o Equipamento --</option>
            ${cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').map(e => `<option value="${e.id}">${e.tag} - ${e.nome} (Atual: ${e.horimetro_atual || 0} ${e.unidade_medida || 'H'})</option>`).join('')}
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">2. Localização / Frente</label>
            <input id="novaOSLocalizacao" type="text" placeholder="Ex: TRECHO KM 12, OFICINA, BRITADOR..." class="w-full border rounded-lg p-2.5 font-bold uppercase" />
          </div>
          <div>
            <label id="labelDicaHorimetroNovaOS" class="block font-black uppercase text-amber-800 mb-1">3. Horímetro / KM Atual</label>
            <input id="novaOSHorimetro" type="number" step="0.1" placeholder="Digite a leitura atual..." class="w-full border-2 border-amber-400 bg-amber-50/40 rounded-lg p-2.5 font-black" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">4. Descrição do Problema / Defeito</label>
          <textarea id="novaOSProblema" rows="3" placeholder="Descreva o defeito apresentado..." class="w-full border rounded-lg p-2.5 font-bold uppercase"></textarea>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalSolicitacaoNovaOSV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="confirmarAberturaSolicitacaoOS()" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 text-slate-950 shadow">
          ${ehMecanico ? '🔧 Abrir e Iniciar Atendimento' : '🚨 Abrir OS e Notificar Mecânicos'}
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
  const localizacao = (document.getElementById('novaOSLocalizacao')?.value || '').trim().toUpperCase();
  const horimetroDigitado = document.getElementById('novaOSHorimetro')?.value;
  const problema = (document.getElementById('novaOSProblema')?.value || '').trim().toUpperCase();

  if (!eqId) return alert('Selecione o Equipamento!');
  if (!localizacao) return alert('Informe a Localização onde o equipamento está!');
  if (!problema) return alert('Descreva o problema apresentado!');

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));
  if (!eqObj) return alert('Equipamento não encontrado!');

  // TRAVA DE HORÍMETRO: Bloqueia se for menor que o atual ou se tiver salto absurdo
  if (!validarHorimetroAberturaOS(eqObj, horimetroDigitado)) return;

  const horNovo = parseFloat(horimetroDigitado);

  // Se quem está abrindo for Mecânico, já entra direto 'em_execucao' com o nome dele
  const cargos = obterCargosUsuario(usuarioLogado);
  const ehMecanico = cargos.includes('mecanico');
  const nomeMec = ehMecanico ? String(usuarioLogado?.nome || usuarioLogado?.matricula || '').trim().toUpperCase() : '';

  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    status: ehMecanico ? 'em_execucao' : 'aberta',
    motivo_rep: 'CORRETIVA',
    local_manutencao_pcm: localizacao,
    descricao_problema: problema,
    mecanico_nome: nomeMec,
    horimetro_os: horNovo,
    aberta_em: new Date().toISOString()
  });

  // Atualiza também o horímetro atual da máquina na tabela equipamentos
  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { horimetro_atual: horNovo }, eqId);
  eqObj.horimetro_atual = horNovo;

  document.getElementById('modalSolicitacaoNovaOSV2')?.classList.add('hidden');
  await carregarOrdensServico('ativas');
}

// ----------------------------------------------------------------------------
// 5. FECHAMENTO PELO MECÂNICO (SERVIÇO, MECÂNICOS PRESENTES E CONFIRMAÇÃO DE INÍCIO E FIM)
// ----------------------------------------------------------------------------
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

  // Vem preenchido com os horários de abertura (início) e atual/conclusão (fim), podendo ser alterado
  const dtInicioValor = os.aberta_em
    ? formatarParaInputDatetimeLocal(os.aberta_em)
    : formatarParaInputDatetimeLocal(new Date().toISOString());
  const dtFimValor = os.concluida_em
    ? formatarParaInputDatetimeLocal(os.concluida_em)
    : formatarParaInputDatetimeLocal(new Date().toISOString());

  let modal = document.getElementById('modalExecucaoChipsV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalExecucaoChipsV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">🔧 Atendimento e Fechamento de OS (${os.equipamentos?.tag || ''})</h3>
      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Status do Atendimento</label>
            <select id="execV2Status" onchange="alternarTravaSaidaExecV2()" class="w-full border rounded-lg p-2 font-bold">
              <option value="em_execucao" ${os.status === 'em_execucao' || os.status === 'aberta' ? 'selected' : ''}>🔧 Em Execução (Assumir / Continuar)</option>
              <option value="pausada_peca" ${os.status === 'pausada_peca' ? 'selected' : ''}>📦 Aguardando Peça</option>
              <option value="concluida" ${os.status === 'concluida' || os.status === 'aguardando_pcm' ? 'selected' : ''}>✅ Fechar OS / Liberar Máquina</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Horímetro / KM (Atual: ${os.equipamentos?.horimetro_atual || 0})</label>
            <input type="number" step="0.1" id="execV2HorimetroSaida" value="${os.horimetro_os || os.equipamentos?.horimetro_atual || ''}" class="w-full border rounded-lg p-2 font-bold" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Mecânicos Presentes na Manutenção:</label>
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
          <textarea id="execV2Acao" rows="3" placeholder="Descreva o serviço executado..." class="w-full border rounded-lg p-2.5 font-semibold uppercase">${os.servico_executado || ''}</textarea>
        </div>

        <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
          <div class="font-black uppercase text-amber-950 text-[11px]">⏱️ Confirme ou Ajuste os Horários da Manutenção:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-black uppercase text-slate-700 mb-1">Horário de Início (Abertura)</label>
              <input type="datetime-local" id="execV2DataInicio" value="${dtInicioValor}" class="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white" />
            </div>
            <div id="blocoSaidaConclusaoV2">
              <label class="block font-black uppercase text-emerald-900 mb-1">Horário de Fim (Finalização)</label>
              <input type="datetime-local" id="execV2DataSaida" value="${dtFimValor}" class="w-full border border-emerald-400 rounded-lg p-2 font-bold bg-white" />
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalExecucaoChipsV2').classList.add('hidden')" class="px-4 py-2 rounded-lg font-bold text-xs bg-slate-200">Cancelar</button>
        <button onclick="salvarExecucaoOSComChips('${os.id}')" class="px-5 py-2 rounded-lg font-black text-xs bg-amber-500 text-slate-950 shadow">💾 Confirmar e Salvar</button>
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
  const blocoFim = document.getElementById('blocoSaidaConclusaoV2');
  const inpFim = document.getElementById('execV2DataSaida');
  if (blocoFim) blocoFim.classList.toggle('opacity-40', !liberado);
  if (inpFim) inpFim.disabled = !liberado;
}

async function salvarExecucaoOSComChips(osId) {
  const os = cacheOrdens.find(o => String(o.id) === String(osId));
  if (!os) return;

  const statusSel = document.getElementById('execV2Status').value;
  const servico = document.getElementById('execV2Acao').value.trim().toUpperCase();
  const nomes = Array.from(document.querySelectorAll('#containerChipsMecanicosV2 .chip-mecanico-v2.bg-amber-500')).map(c => c.dataset.mecNome).join(', ');
  const dtIni = document.getElementById('execV2DataInicio')?.value;
  const dtFim = document.getElementById('execV2DataSaida')?.value;
  const horSaida = parseFloat(document.getElementById('execV2HorimetroSaida')?.value);

  if (statusSel === 'concluida' && (!servico || !nomes)) {
    return alert('Para fechar a OS, preencha o Serviço Executado e selecione os Mecânicos presentes!');
  }

  if (statusSel === 'concluida' && (!dtIni || !dtFim)) {
    return alert('Confirme o Horário de Início e o Horário de Fim da manutenção!');
  }

  const payload = {
    status: statusSel === 'concluida' ? 'aguardando_pcm' : statusSel,
    servico_executado: servico,
    mecanico_nome: nomes || os.mecanico_nome || '',
    aberta_em: dtIni ? new Date(dtIni).toISOString() : os.aberta_em,
    concluida_em: null
  };

  if (!isNaN(horSaida)) {
    payload.horimetro_os = horSaida;
    if (statusSel === 'concluida') {
      await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { horimetro_atual: horSaida }, os.equipamento_id);
    }
  }

  if (statusSel === 'concluida') {
    payload.concluida_em = new Date(dtFim).toISOString();
  }

  await gravarDadosOfflineSafe('ordens_servico', 'UPDATE', payload, osId);
  document.getElementById('modalExecucaoChipsV2')?.classList.add('hidden');
  await carregarOrdensServico(abaStatusOSAtual);
}

// ----------------------------------------------------------------------------
// 6. REGISTRO DE CAMPO / COMBOIO (SEM CONDIÇÃO OPERACIONAL + HORÁRIO DE INÍCIO E FIM)
// ----------------------------------------------------------------------------
async function abrirModalIntervencaoCampoComboio() {
  if (!podeExecutarAcao('executar_os', true)) return;
  if (!cacheEquipamentos || cacheEquipamentos.length === 0) {
    const { data } = await db.from('equipamentos').select('*').order('tag');
    cacheEquipamentos = data || [];
  }
  const mecanicos = await obterListaMecanicosParaChips();
  const agoraLocal = formatarParaInputDatetimeLocal(new Date().toISOString());

  let modal = document.getElementById('modalIntervencaoComboioV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalIntervencaoComboioV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">⚡ Registro de Campo / Comboio</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Equipamento (Prefixo)</label>
          <select id="comboioEquipamentoId" class="w-full border rounded-lg p-2.5 font-bold">
            <option value="">-- Selecione o Equipamento --</option>
            ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50 p-3 rounded-xl border border-amber-200">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horário de Início</label>
            <input type="datetime-local" id="comboioDataInicio" value="${agoraLocal}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horário de Fim</label>
            <input type="datetime-local" id="comboioDataFim" value="${agoraLocal}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Problema e Serviço Realizado em Campo</label>
          <textarea id="comboioDescricao" rows="3" placeholder="Descreva a manutenção realizada em campo..." class="w-full border rounded-lg p-2 font-semibold uppercase"></textarea>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">👷 Mecânicos Presentes:</label>
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
        <button onclick="salvarIntervencaoCampoComboio()" class="px-5 py-2 rounded-lg font-black text-xs bg-emerald-500 text-slate-950 shadow">✅ Salvar Registro</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  const selEq = document.getElementById('comboioEquipamentoId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(selEq);
}

async function salvarIntervencaoCampoComboio() {
  const eqId = document.getElementById('comboioEquipamentoId').value;
  const dtIni = document.getElementById('comboioDataInicio').value;
  const dtFim = document.getElementById('comboioDataFim').value;
  const desc = document.getElementById('comboioDescricao').value.trim().toUpperCase();
  const nomes = Array.from(document.querySelectorAll('#containerChipsComboioV2 .chip-mecanico-v2.bg-amber-500')).map(c => c.dataset.mecNome).join(', ');

  if (!eqId || !desc || !dtIni || !dtFim) {
    return alert('Selecione o equipamento, informe os horários de início e fim e descreva o atendimento!');
  }

  const eqObj = (cacheEquipamentos || []).find(e => String(e.id) === String(eqId));

  await gravarDadosOfflineSafe('ordens_servico', 'INSERT', {
    equipamento_id: eqId,
    obra_id: eqObj?.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
    status: 'aguardando_pcm',
    motivo_rep: 'CORRETIVA',
    local_manutencao_pcm: 'CAMPO',
    descricao_problema: desc,
    servico_executado: desc,
    mecanico_nome: nomes,
    aberta_em: new Date(dtIni).toISOString(),
    concluida_em: new Date(dtFim).toISOString()
  });

  document.getElementById('modalIntervencaoComboioV2')?.classList.add('hidden');
  await carregarOrdensServico('concluidas');
}

// ----------------------------------------------------------------------------
// 7. MODAL DO PCM (MOTIVO REP COM 3 OPÇÕES + CLASSIFICAÇÃO DE FALHA COM 20 OPÇÕES)
// ----------------------------------------------------------------------------
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
  const motivoAtual = (os?.motivo_rep || 'CORRETIVA').toUpperCase();
  const classifAtual = (os?.classificacao_falha || '').toUpperCase();
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
            ${os ? `✏️ Classificar / Editar OS #${os.numero_os || ''} (${os.equipamentos?.tag || ''})` : '📋 Lançamento Completo / Retroativo de Manutenção (PCM)'}
          </h3>
        </div>
        <button onclick="document.getElementById('modalLancamentoCompletoPCMV2').classList.add('hidden')" class="text-slate-400 text-2xl font-black">&times;</button>
      </div>

      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
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
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Data/Hora de Início</label>
            <input type="datetime-local" id="pcmFullAbertaEm" value="${dtAberta}" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-emerald-900 mb-1">Data/Hora de Fim (Vazio = Aberta)</label>
            <input type="datetime-local" id="pcmFullConcluidaEm" value="${dtConcluida}" class="w-full border border-emerald-400 rounded-lg p-2 font-bold bg-white" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horímetro / KM na OS</label>
            <input type="number" step="0.1" id="pcmFullHorimetro" value="${os?.horimetro_os || ''}" placeholder="Ex: 4520.5" class="w-full border rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Motivo REP</label>
            <select id="pcmFullMotivoRep" class="w-full border rounded-lg p-2 font-bold">
              ${LISTA_MOTIVOS_REP.map(m => `<option value="${m}" ${motivoAtual === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Classificação da Falha / Sistema</label>
            <select id="pcmFullClassificacaoFalha" class="w-full border rounded-lg p-2 font-bold">
              <option value="">-- Selecione o Sistema --</option>
              ${LISTA_CLASSIFICACAO_FALHA.map(cf => `<option value="${cf}" ${classifAtual === cf ? 'selected' : ''}>${cf}</option>`).join('')}
            </select>
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
          <label class="block font-black uppercase text-slate-700">👷 Mecânicos Presentes na Manutenção:</label>
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
  const dtAberta = document.getElementById('pcmFullAbertaEm')?.value;
  const dtConcluida = document.getElementById('pcmFullConcluidaEm')?.value;
  const horimetro = parseFloat(document.getElementById('pcmFullHorimetro')?.value);
  const motivoRep = (document.getElementById('pcmFullMotivoRep')?.value || 'CORRETIVA').trim().toUpperCase();
  const classifFalha = (document.getElementById('pcmFullClassificacaoFalha')?.value || '').trim().toUpperCase();
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
    motivo_rep: motivoRep,
    classificacao_falha: classifFalha,
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
  await carregarOrdensServico(payload.concluida_em ? 'concluidas' : 'ativas');
}
