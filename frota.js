// ============================================================================
// VILASA CMMS V2 - MÓDULO 6: FROTA.JS (9 COLUNAS LIMPAS, SEM TABELAS EXTRAS)
// ============================================================================

let filtroSituacaoFrota = 'ativo';

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
  const termoPrefixo = (document.getElementById('filtroPrefixoFrotaInput')?.value || '').trim().toUpperCase();

  let lista = [...cacheEquipamentos];
  if (typeof filtrarListaPorObraAtiva === 'function') lista = filtrarListaPorObraAtiva(lista);
  if (filtroSituacaoFrota !== 'todos') lista = lista.filter(e => (e.situacao_ciclo || 'ativo') === filtroSituacaoFrota);
  if (termoPrefixo) lista = lista.filter(e => bateComPrefixoEquipamento(e.tag || '', termoPrefixo));

  const contAtivos = cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').length;
  const contDesmob = cacheEquipamentos.filter(e => e.situacao_ciclo === 'desmobilizado_aluguel').length;
  const contVendidos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'vendido_baixado').length;
  const contInativos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'inativo_patio').length;

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GESTÃO DE ATIVOS E MOBILIZAÇÃO</span>
          <h2 class="text-lg font-black">Controle de Frota, Obras & QR Codes</h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${podeGerenciar ? `
            <button onclick="abrirModalCadastroEquipamentoV2()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow">
              + Cadastrar Equipamento
            </button>
          ` : ''}
          <button onclick="imprimirEtiquetasQREmLote()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-black text-xs">
            <i class="fa-solid fa-qrcode mr-1"></i> Imprimir QR Codes (${lista.length})
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarFrota('ativo')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'ativo' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">🟢 Ativos (${contAtivos})</button>
          <button onclick="carregarFrota('inativo_patio')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'inativo_patio' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'}">⏸️ Pátio (${contInativos})</button>
          <button onclick="carregarFrota('desmobilizado_aluguel')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'desmobilizado_aluguel' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}">🚛 Desmobilizados (${contDesmob})</button>
          <button onclick="carregarFrota('vendido_baixado')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'vendido_baixado' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}">🏷️ Vendidos (${contVendidos})</button>
          <button onclick="carregarFrota('todos')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'todos' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">🌐 Todos</button>
        </div>
        <input id="filtroPrefixoFrotaInput" type="text" value="${termoPrefixo}" oninput="renderizarPainelFrota()" placeholder="🔍 Buscar Prefixo..." class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold uppercase" />
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-3">Prefixo</th>
              <th class="p-3">Descrição / Marca / Modelo</th>
              <th class="p-3">Vínculo</th>
              <th class="p-3">Obra Atual</th>
              <th class="p-3">Horímetro / KM</th>
              <th class="p-3">Situação</th>
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

              return `
                <tr class="hover:bg-slate-50">
                  <td class="p-3 font-black"><span class="bg-amber-400 text-slate-950 px-2.5 py-1 rounded text-xs">${e.tag}</span></td>
                  <td class="p-3">
                    <div class="font-extrabold text-slate-900">${e.nome || '-'}</div>
                    <div class="text-[11px] text-slate-500">${e.marca || ''} ${e.modelo || ''}</div>
                  </td>
                  <td class="p-3">${propBadge}</td>
                  <td class="p-3 font-bold text-slate-700">📍 ${nomeObra}</td>
                  <td class="p-3 font-black text-slate-900">${e.horimetro_atual || 0} ${e.unidade_medida || 'H'}</td>
                  <td class="p-3 font-bold uppercase text-[11px]">${e.situacao_ciclo || 'ativo'}</td>
                  <td class="p-3 text-right space-x-1 whitespace-nowrap">
                    <button onclick="abrirEtiquetaQRIndividual('${e.id}')" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"><i class="fa-solid fa-qrcode"></i> QR</button>
                    ${podeGerenciar ? `
                      <button onclick="abrirModalTransferirObraEquipamento('${e.id}')" class="px-2 py-1 rounded bg-blue-100 text-blue-900 font-bold">🔄 Obra</button>
                      <button onclick="abrirModalCicloVidaDesmobilizacao('${e.id}')" class="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold">⚙️ Status</button>
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
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border">
      <h3 class="text-lg font-black text-slate-900 border-b pb-2 mb-4">Cadastrar Equipamento na Frota</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <input id="eqV2Tag" type="text" placeholder="Prefixo (Ex: EH-45)" class="border rounded-lg p-2 font-black uppercase" />
          <select id="eqV2Prop" class="border rounded-lg p-2 font-bold">
            <option value="proprio">🏢 Próprio</option>
            <option value="alugado">🤝 Alugado</option>
          </select>
        </div>
        <input id="eqV2Nome" type="text" placeholder="Descrição (Ex: ESCAVADEIRA HIDRÁULICA)" class="w-full border rounded-lg p-2 font-bold uppercase" />
        <div class="grid grid-cols-2 gap-2">
          <input id="eqV2Marca" type="text" placeholder="Marca" class="border rounded-lg p-2 font-bold uppercase" />
          <input id="eqV2Modelo" type="text" placeholder="Modelo" class="border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <select id="eqV2Unidade" class="border rounded-lg p-2 font-bold">
            <option value="H">Horas (H)</option>
            <option value="KM">KM</option>
          </select>
          <input id="eqV2Horimetro" type="number" step="0.1" value="0" placeholder="Horímetro" class="border rounded-lg p-2 font-bold" />
          <select id="eqV2Obra" class="border rounded-lg p-2 font-bold">
            ${cacheObras.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>${o.codigo}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalNovoEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarNovoEquipamentoV2()" class="px-5 py-2 rounded-lg bg-amber-500 font-black text-xs text-slate-950">Salvar</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function salvarNovoEquipamentoV2() {
  const tag = document.getElementById('eqV2Tag').value.trim().toUpperCase();
  const nome = document.getElementById('eqV2Nome').value.trim().toUpperCase();
  if (!tag || !nome) return alert('Informe Prefixo e Descrição!');

  await gravarDadosOfflineSafe('equipamentos', 'INSERT', {
    tag,
    nome,
    marca: document.getElementById('eqV2Marca').value.trim().toUpperCase(),
    modelo: document.getElementById('eqV2Modelo').value.trim().toUpperCase(),
    propriedade: document.getElementById('eqV2Prop').value,
    situacao_ciclo: 'ativo',
    unidade_medida: document.getElementById('eqV2Unidade').value,
    horimetro_atual: parseFloat(document.getElementById('eqV2Horimetro').value) || 0,
    obra_id: document.getElementById('eqV2Obra').value || null
  });

  document.getElementById('modalNovoEquipV2')?.classList.add('hidden');
  await carregarFrota('ativo');
}

function abrirModalCicloVidaDesmobilizacao(equipId) {
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
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border">
      <h3 class="text-base font-black text-slate-900 mb-3">Alterar Status / Vínculo (${eq.tag})</h3>
      <div class="space-y-3 text-xs">
        <select id="cicloPropSelect" class="w-full border rounded-lg p-2 font-bold">
          <option value="proprio" ${eq.propriedade !== 'alugado' ? 'selected' : ''}>🏢 Próprio</option>
          <option value="alugado" ${eq.propriedade === 'alugado' ? 'selected' : ''}>🤝 Alugado</option>
        </select>
        <select id="cicloSituacaoSelect" class="w-full border rounded-lg p-2 font-bold">
          <option value="ativo" ${(eq.situacao_ciclo || 'ativo') === 'ativo' ? 'selected' : ''}>🟢 Ativo na Obra</option>
          <option value="inativo_patio" ${eq.situacao_ciclo === 'inativo_patio' ? 'selected' : ''}>⏸️ Inativo no Pátio</option>
          <option value="desmobilizado_aluguel" ${eq.situacao_ciclo === 'desmobilizado_aluguel' ? 'selected' : ''}>🚛 Desmobilizado (Locadora)</option>
          <option value="vendido_baixado" ${eq.situacao_ciclo === 'vendido_baixado' ? 'selected' : ''}>🏷️ Vendido / Baixado</option>
        </select>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalCicloVidaEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="confirmarMudancaCicloVidaEquip('${eq.id}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Confirmar</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function confirmarMudancaCicloVidaEquip(equipId) {
  const propriedade = document.getElementById('cicloPropSelect').value;
  const situacao_ciclo = document.getElementById('cicloSituacaoSelect').value;
  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { propriedade, situacao_ciclo }, equipId);
  document.getElementById('modalCicloVidaEquipV2')?.classList.add('hidden');
  await carregarFrota(situacao_ciclo);
}

async function abrirModalTransferirObraEquipamento(equipId) {
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;
  const novaObraCod = prompt(`Transferir ${eq.tag} para qual Obra?\n` + cacheObras.map(o => `• ${o.codigo} (${o.nome})`).join('\n'));
  if (!novaObraCod) return;
  const obraDest = cacheObras.find(o => o.codigo.toUpperCase() === novaObraCod.trim().toUpperCase());
  if (!obraDest) return alert('Código de obra não encontrado!');

  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { obra_id: obraDest.id }, eq.id);
  await carregarFrota(filtroSituacaoFrota);
}

function gerarUrlQRCodeOfflineReady(eq) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '') + 'qr.html';
  const params = new URLSearchParams({ id: eq.id, tag: eq.tag || '', nome: eq.nome || '', un: eq.unidade_medida || 'H' });
  return `${base}?${params.toString()}`;
}

function abrirEtiquetaQRIndividual(equipId) {
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (eq) imprimirJanelaEtiquetasQR([eq]);
}

function imprimirEtiquetasQREmLote() {
  const lista = cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === filtroSituacaoFrota);
  if (lista.length > 0) imprimirJanelaEtiquetasQR(lista);
}

function imprimirJanelaEtiquetasQR(listaEquipamentos) {
  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups para imprimir as etiquetas.');
  const cardsHtml = listaEquipamentos.map(eq => {
    const imgApi = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(gerarUrlQRCodeOfflineReady(eq))}`;
    return `
      <div style="border:3px solid #0f172a; border-radius:14px; padding:14px; width:240px; text-align:center; font-family:sans-serif; page-break-inside:avoid;">
        <div style="background:#f59e0b; color:#0f172a; font-weight:900; font-size:20px; padding:4px 8px; border-radius:8px;">${eq.tag}</div>
        <div style="font-size:11px; font-weight:700; margin:6px 0;">${eq.nome || ''}</div>
        <img src="${imgApi}" style="width:170px; height:170px; margin:6px auto;" />
        <div style="font-size:10px; font-weight:800;">LEITURA DE HORÍMETRO / OS</div>
      </div>
    `;
  }).join('');
  win.document.write(`<html><body style="display:flex;flex-wrap:wrap;gap:16px;padding:20px;" onload="setTimeout(()=>window.print(),800)">${cardsHtml}</body></html>`);
  win.document.close();
}

function exportarRelatorioFrotaCSV() {
  const cab = ['PREFIXO', 'DESCRICAO', 'MARCA', 'MODELO', 'PROPRIEDADE', 'SITUACAO', 'HORIMETRO_ATUAL', 'UNIDADE'];
  const linhas = cacheEquipamentos.map(e => [
    e.tag || '', (e.nome || '').replace(/;/g, ','), (e.marca || '').replace(/;/g, ','),
    (e.modelo || '').replace(/;/g, ','), e.propriedade || 'proprio', e.situacao_ciclo || 'ativo',
    String(e.horimetro_atual || 0).replace('.', ','), e.unidade_medida || 'H'
  ].join(';'));
  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_FROTA_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
