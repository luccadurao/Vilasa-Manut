// ============================================================================
// VILASA CMMS - MÓDULO 6: FROTA.JS (GESTÃO DE ATIVOS, TRANSFERÊNCIAS E DESMOBILIZAÇÃO)
// Responsabilidades:
// 1. Listagem por Obra Ativa + Filtro estrito por Prefixo (TAG)
// 2. Ciclo de Vida: Ativo, Desmobilizado (Locado), Vendido/Baixado (Próprio), Inativo no Pátio
// 3. Guia de Transferência de Equipamentos entre Obras
// 4. Gerador de Etiquetas QR Code com parâmetros embutidos para funcionamento 100% Offline
// ============================================================================

let filtroSituacaoFrota = 'ativo'; // 'ativo', 'inativo_patio', 'desmobilizado_aluguel', 'vendido_baixado', 'todos'

async function carregarFrota(situacao = filtroSituacaoFrota) {
  filtroSituacaoFrota = situacao;

  const [resEq, resObras] = await Promise.all([
    lerDadosComFallbackOffline('equipamentos', () =>
      typeof buscarTudoSemLimite === 'function'
        ? buscarTudoSemLimite('equipamentos', 'tag', true).then(data => ({ data, error: null }))
        : db.from('equipamentos').select('*').order('tag')
    ),
    (typeof cacheObras !== 'undefined' && cacheObras.length > 0)
      ? Promise.resolve({ data: cacheObras })
      : lerDadosComFallbackOffline('obras', () => db.from('obras').select('*').eq('ativa', true))
  ]);

  cacheEquipamentos = resEq.data || [];
  cacheObras = resObras.data || [];

  renderizarPainelFrota();
}

function renderizarPainelFrota() {
  const sec = document.getElementById('sec-frota');
  if (!sec) return;

  const podeGerenciar = podeExecutarAcao('gerenciar_frota');
  const podeTransferir = podeExecutarAcao('transferir_equipamento_obra');
  const termoPrefixo = (document.getElementById('filtroPrefixoFrotaInput')?.value || '').trim().toUpperCase();

  let lista = [...cacheEquipamentos];

  // 1. Filtra pela Obra Ativa selecionada no topo
  if (typeof filtrarListaPorObraAtiva === 'function') {
    lista = filtrarListaPorObraAtiva(lista);
  }

  // 2. Filtra pelo Ciclo de Vida (Ativos vs. Desmobilizados/Vendidos/Inativos)
  if (filtroSituacaoFrota !== 'todos') {
    lista = lista.filter(e => (e.situacao_ciclo || 'ativo') === filtroSituacaoFrota);
  }

  // 3. Filtra estritamente pelo Prefixo (TAG)
  if (termoPrefixo) {
    lista = lista.filter(e => bateComPrefixoEquipamento(e.tag || '', termoPrefixo));
  }

  const contAtivos = cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').length;
  const contDesmob = cacheEquipamentos.filter(e => e.situacao_ciclo === 'desmobilizado_aluguel').length;
  const contVendidos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'vendido_baixado').length;
  const contInativos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'inativo_patio').length;

  sec.innerHTML = `
    <div class="space-y-5">
      <!-- Cabeçalho da Frota -->
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GESTÃO DE ATIVOS E MOBILIZAÇÃO</span>
          <h2 class="text-lg font-black">Controle de Frota, Transferências entre Obras & QR Codes</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          ${podeGerenciar ? `
            <button onclick="abrirModalCadastroEquipamentoV2()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i>
              <span>Cadastrar Equipamento</span>
            </button>
          ` : ''}
          <button onclick="imprimirEtiquetasQREmLote()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-black text-xs flex items-center gap-1.5">
            <i class="fa-solid fa-qrcode"></i>
            <span>Imprimir QR Codes da Lista (${lista.length})</span>
          </button>
          <button onclick="exportarRelatorioFrotaCSV()" class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow flex items-center gap-1.5">
            <i class="fa-solid fa-file-excel"></i>
            <span>Exportar Frota</span>
          </button>
        </div>
      </div>

      <!-- Filtros de Ciclo de Vida (Mobilizados x Desmobilizados x Vendidos) -->
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarFrota('ativo')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'ativo' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">
            🟢 Ativos / Mobilizados (${contAtivos})
          </button>
          <button onclick="carregarFrota('inativo_patio')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'inativo_patio' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'}">
            ⏸️ Inativos no Pátio (${contInativos})
          </button>
          <button onclick="carregarFrota('desmobilizado_aluguel')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'desmobilizado_aluguel' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}">
            🚛 Desmobilizados / Locação (${contDesmob})
          </button>
          <button onclick="carregarFrota('vendido_baixado')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'vendido_baixado' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}">
            🏷️ Vendidos / Baixados (${contVendidos})
          </button>
          <button onclick="carregarFrota('todos')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'todos' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🌐 Todos
          </button>
        </div>

        <input id="filtroPrefixoFrotaInput" type="text" value="${termoPrefixo}" oninput="renderizarPainelFrota()"
          placeholder="🔍 Buscar Prefixo (ex: CB-05)..."
          class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold uppercase focus:outline-none focus:border-amber-500" />
      </div>

      <!-- Grade de Equipamentos -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-3">Prefixo (TAG)</th>
              <th class="p-3">Descrição / Marca / Modelo</th>
              <th class="p-3">Vínculo</th>
              <th class="p-3">Obra / Frente Atual</th>
              <th class="p-3">Horímetro / KM</th>
              <th class="p-3">Situação do Ativo</th>
              <th class="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${lista.map(e => {
              const obraObj = cacheObras.find(o => String(o.id) === String(e.obra_id));
              const nomeObra = obraObj ? `${obraObj.codigo} - ${obraObj.nome}` : 'Matriz Geral';
              const propBadge = e.propriedade === 'alugado'
                ? `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-black text-[10px]">LOCADO</span>`
                : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">PRÓPRIO</span>`;

              const mapSit = {
                ativo: `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">🟢 ATIVO NA OBRA</span>`,
                inativo_patio: `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px]">⏸️ INATIVO PÁTIO</span>`,
                desmobilizado_aluguel: `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-black text-[10px]">🚛 DESMOBILIZADO</span>`,
                vendido_baixado: `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px]">🏷️ VENDIDO / BAIXADO</span>`
              };

              return `
                <tr class="hover:bg-slate-50">
                  <td class="p-3 font-black">
                    <span class="bg-amber-400 text-slate-950 px-2.5 py-1 rounded text-xs">${e.tag}</span>
                  </td>
                  <td class="p-3">
                    <div class="font-extrabold text-slate-900">${e.nome || '-'}</div>
                    <div class="text-[11px] text-slate-500">${e.marca || ''} ${e.modelo || ''}</div>
                  </td>
                  <td class="p-3">${propBadge}</td>
                  <td class="p-3 font-bold text-slate-700">📍 ${nomeObra}</td>
                  <td class="p-3 font-black text-slate-900">${e.horimetro_atual || 0} ${e.unidade_medida || 'H'}</td>
                  <td class="p-3">
                    ${mapSit[e.situacao_ciclo || 'ativo'] || mapSit.ativo}
                    ${e.motivo_baixa_desmob ? `<div class="text-[10px] text-slate-500 mt-0.5">${e.motivo_baixa_desmob}</div>` : ''}
                  </td>
                  <td class="p-3 text-right space-x-1 whitespace-nowrap">
                    <button onclick="abrirEtiquetaQRIndividual('${e.id}')" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold" title="Gerar QR Code Offline-Ready">
                      <i class="fa-solid fa-qrcode"></i> QR
                    </button>
                    ${podeTransferir ? `
                      <button onclick="abrirModalTransferirObraEquipamento('${e.id}')" class="px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold" title="Transferir para outra Obra">
                        🔄 Obra
                      </button>
                    ` : ''}
                    ${podeGerenciar ? `
                      <button onclick="abrirModalCicloVidaDesmobilizacao('${e.id}')" class="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold" title="Desmobilizar Alugado / Vender / Inativar">
                        ⚙️ Status/Baixa
                      </button>
                    ` : ''}
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

// ----------------------------------------------------------------------------
// 1. MODAL DE CADASTRO DE EQUIPAMENTO (COM PROPRIEDADE PRÓPRIO/ALUGADO E OBRA)
// ----------------------------------------------------------------------------
function abrirModalCadastroEquipamentoV2() {
  if (!podeExecutarAcao('gerenciar_frota', true)) return;

  let modal = document.getElementById('modalNovoEquipV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalNovoEquipV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
      <h3 class="text-lg font-black text-slate-900 border-b pb-2 mb-4">Cadastrar Novo Equipamento na Frota</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Prefixo (TAG)</label>
            <input id="eqV2Tag" type="text" placeholder="Ex: EH-45" class="w-full border rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Propriedade / Contrato</label>
            <select id="eqV2Prop" class="w-full border rounded-lg p-2 font-bold">
              <option value="proprio">🏢 Equipamento Próprio</option>
              <option value="alugado">🤝 Equipamento Alugado (Locado)</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Descrição do Equipamento</label>
          <input id="eqV2Nome" type="text" placeholder="Ex: ESCAVADEIRA HIDRÁULICA" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Marca</label>
            <input id="eqV2Marca" type="text" placeholder="Ex: CATERPILLAR" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Modelo</label>
            <input id="eqV2Modelo" type="text" placeholder="Ex: 320D2L" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Unidade</label>
            <select id="eqV2Unidade" class="w-full border rounded-lg p-2 font-bold">
              <option value="H">Horas (H)</option>
              <option value="KM">Quilômetros (KM)</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Leitura Inicial</label>
            <input id="eqV2Horimetro" type="number" step="0.1" value="0" class="w-full border rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Obra Inicial</label>
            <select id="eqV2Obra" class="w-full border rounded-lg p-2 font-bold">
              ${cacheObras.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>${o.codigo}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalNovoEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarNovoEquipamentoV2()" class="px-5 py-2 rounded-lg bg-amber-500 font-black text-xs text-slate-950">Salvar Ativo</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function salvarNovoEquipamentoV2() {
  const tag = document.getElementById('eqV2Tag').value.trim().toUpperCase();
  const nome = document.getElementById('eqV2Nome').value.trim().toUpperCase();
  if (!tag || !nome) return alert('Informe o Prefixo e a Descrição!');

  await gravarDadosOfflineSafe('equipamentos', 'INSERT', {
    tag,
    nome,
    marca: document.getElementById('eqV2Marca').value.trim().toUpperCase(),
    modelo: document.getElementById('eqV2Modelo').value.trim().toUpperCase(),
    propriedade: document.getElementById('eqV2Prop').value,
    situacao_ciclo: 'ativo',
    unidade_medida: document.getElementById('eqV2Unidade').value,
    horimetro_atual: parseFloat(document.getElementById('eqV2Horimetro').value) || 0,
    obra_id: document.getElementById('eqV2Obra').value || null,
    status_operacional: 'operando'
  });

  document.getElementById('modalNovoEquipV2')?.classList.add('hidden');
  await carregarFrota('ativo');
}

// ----------------------------------------------------------------------------
// 2. DESMOBILIZAÇÃO DE ALUGADO, VENDA DE PRÓPRIO OU INATIVAÇÃO NO PÁTIO
// ----------------------------------------------------------------------------
function abrirModalCicloVidaDesmobilizacao(equipId) {
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;

  let modal = document.getElementById('modalCicloVidaEquipV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalCicloVidaEquipV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
      <span class="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-xs">${eq.tag}</span>
      <h3 class="text-base font-black text-slate-900 mt-1 mb-3">Gerenciar Mobilização / Baixa do Ativo</h3>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Tipo de Contrato</label>
          <select id="cicloPropSelect" class="w-full border rounded-lg p-2 font-bold">
            <option value="proprio" ${eq.propriedade !== 'alugado' ? 'selected' : ''}>🏢 Equipamento Próprio</option>
            <option value="alugado" ${eq.propriedade === 'alugado' ? 'selected' : ''}>🤝 Equipamento Alugado (Locadora)</option>
          </select>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Nova Situação do Equipamento</label>
          <select id="cicloSituacaoSelect" class="w-full border rounded-lg p-2 font-bold">
            <option value="ativo" ${(eq.situacao_ciclo || 'ativo') === 'ativo' ? 'selected' : ''}>🟢 Ativo / Mobilizado na Obra</option>
            <option value="inativo_patio" ${eq.situacao_ciclo === 'inativo_patio' ? 'selected' : ''}>⏸️ Inativo Temporariamente no Pátio</option>
            <option value="desmobilizado_aluguel" ${eq.situacao_ciclo === 'desmobilizado_aluguel' ? 'selected' : ''}>🚛 Desmobilizar Equipamento Alugado (Devolvido à Locadora)</option>
            <option value="vendido_baixado" ${eq.situacao_ciclo === 'vendido_baixado' ? 'selected' : ''}>🏷️ Vender / Baixar Definitivamente Ativo Próprio</option>
          </select>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Motivo / Nº Termo de Devolução ou Nota de Venda</label>
          <textarea id="cicloMotivoInput" rows="2" placeholder="Ex: Contrato encerrado e devolvido à locadora em perfeitas condições..." class="w-full border rounded-lg p-2 font-semibold">${eq.motivo_baixa_desmob || ''}</textarea>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalCicloVidaEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="confirmarMudancaCicloVidaEquip('${eq.id}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Confirmar Alteração</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function confirmarMudancaCicloVidaEquip(equipId) {
  const propriedade = document.getElementById('cicloPropSelect').value;
  const situacao_ciclo = document.getElementById('cicloSituacaoSelect').value;
  const motivo_baixa_desmob = document.getElementById('cicloMotivoInput').value.trim();

  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', {
    propriedade,
    situacao_ciclo,
    motivo_baixa_desmob,
    data_baixa_desmob: situacao_ciclo === 'ativo' ? null : new Date().toISOString()
  }, equipId);

  document.getElementById('modalCicloVidaEquipV2')?.classList.add('hidden');
  await carregarFrota(situacao_ciclo);
}

// ----------------------------------------------------------------------------
// 3. TRANSFERÊNCIA DE EQUIPAMENTO ENTRE OBRAS
// ----------------------------------------------------------------------------
function abrirModalTransferirObraEquipamento(equipId) {
  if (!podeExecutarAcao('transferir_equipamento_obra', true)) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;

  const novaObraId = prompt(
    `Transferir ${eq.tag} para qual Obra?\nDigite o código exato da obra destino:\n` +
    cacheObras.map(o => `• ${o.codigo} (${o.nome})`).join('\n')
  );
  if (!novaObraId) return;

  const obraDestino = cacheObras.find(o =>
    o.codigo.toUpperCase() === novaObraId.trim().toUpperCase() || String(o.id) === novaObraId.trim()
  );
  if (!obraDestino) return alert('Código de obra não encontrado!');

  executarTransferenciaObraEquipamento(eq, obraDestino);
}

async function executarTransferenciaObraEquipamento(eq, obraDestino) {
  const obs = prompt(`Observação da guia de transferência de ${eq.tag} para ${obraDestino.codigo}:`, 'Transferência operacional entre frentes') || '';

  await gravarDadosOfflineSafe('historico_transferencias_frota', 'INSERT', {
    equipamento_id: eq.id,
    obra_origem_id: eq.obra_id || null,
    obra_destino_id: obraDestino.id,
    horimetro_momento: eq.horimetro_atual || 0,
    responsavel_nome: usuarioLogado?.nome || 'Engenharia/PCM',
    observacao: obs,
    transferido_em: new Date().toISOString()
  });

  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', {
    obra_id: obraDestino.id
  }, eq.id);

  alert(`✅ ${eq.tag} transferido com sucesso para ${obraDestino.codigo} - ${obraDestino.nome}!`);
  await carregarFrota(filtroSituacaoFrota);
}

// ----------------------------------------------------------------------------
// 4. GERADOR DE ETIQUETAS QR CODE OFFLINE-READY (PARÂMETROS EMBUTIDOS NA URL)
// ----------------------------------------------------------------------------
function gerarUrlQRCodeOfflineReady(eq) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '') + 'qr.html';
  const params = new URLSearchParams({
    id: eq.id,
    tag: eq.tag || '',
    nome: eq.nome || '',
    un: eq.unidade_medida || 'H'
  });
  return `${base}?${params.toString()}`;
}

function abrirEtiquetaQRIndividual(equipId) {
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;
  imprimirJanelaEtiquetasQR([eq]);
}

function imprimirEtiquetasQREmLote() {
  const lista = cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === filtroSituacaoFrota);
  if (lista.length === 0) return alert('Nenhum equipamento na lista atual.');
  imprimirJanelaEtiquetasQR(lista);
}

function imprimirJanelaEtiquetasQR(listaEquipamentos) {
  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups para imprimir as etiquetas QR Code.');

  const cardsHtml = listaEquipamentos.map(eq => {
    const urlQR = gerarUrlQRCodeOfflineReady(eq);
    const imgApi = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(urlQR)}`;
    return `
      <div style="border:3px solid #0f172a; border-radius:14px; padding:14px; width:240px; text-align:center; font-family:sans-serif; page-break-inside:avoid;">
        <div style="background:#f59e0b; color:#0f172a; font-weight:900; font-size:20px; padding:4px 8px; border-radius:8px;">${eq.tag}</div>
        <div style="font-size:11px; font-weight:700; margin:6px 0; color:#334155;">${eq.nome || ''}</div>
        <img src="${imgApi}" style="width:170px; height:170px; margin:6px auto;" />
        <div style="font-size:10px; font-weight:800; color:#475569;">APONTE A CÂMERA P/ HORÍMETRO OU OS</div>
      </div>
    `;
  }).join('');

  win.document.write(`
    <html><head><title>Etiquetas QR Code - Vilasa</title></head>
    <body style="display:flex; flex-wrap:wrap; gap:16px; padding:20px;" onload="setTimeout(() => window.print(), 800)">
      ${cardsHtml}
    </body></html>
  `);
  win.document.close();
}

function exportarRelatorioFrotaCSV() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const cab = ['PREFIXO', 'DESCRICAO', 'MARCA', 'MODELO', 'PROPRIEDADE', 'SITUACAO', 'HORIMETRO_ATUAL', 'UNIDADE'];
  const linhas = cacheEquipamentos.map(e => [
    e.tag || '',
    (e.nome || '').replace(/;/g, ','),
    (e.marca || '').replace(/;/g, ','),
    (e.modelo || '').replace(/;/g, ','),
    e.propriedade || 'proprio',
    e.situacao_ciclo || 'ativo',
    String(e.horimetro_atual || 0).replace('.', ','),
    e.unidade_medida || 'H'
  ].join(';'));

  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_FROTA_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
