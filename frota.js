// ============================================================================
// VILASA CMMS V2 - MÓDULO 6: FROTA.JS (FILTRO POR COLUNA ESTILO EXCEL + QR CODE)
// ============================================================================

let filtroSituacaoFrota = 'ativo';

// Guarda o texto digitado em cada coluna e quais colunas estão com a caixinha aberta
let filtrosColunaFrota = {
  tag: '',
  nome: '',
  marca: '',
  modelo: '',
  ano_fabricacao: '',
  numero_serie: '',
  placa: '',
  propriedade: '',
  obra: '',
  horimetro: ''
};

let colunasFiltroAbertasFrota = {};

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

function obterNomeObraEquipamento(e) {
  const obraObj = (cacheObras || []).find(o => String(o.id) === String(e.obra_id));
  return obraObj ? `${obraObj.codigo} - ${obraObj.nome}` : 'MATRIZ GERAL';
}

// Retorna a lista de equipamentos aplicando Obra Ativa + Situação + Busca Geral + Filtros de Cada Coluna
function obterListaFrotaFiltradaAtual() {
  const termoPrefixo = (document.getElementById('filtroPrefixoFrotaInput')?.value || '').trim().toUpperCase();

  let lista = [...(cacheEquipamentos || [])];
  if (typeof filtrarListaPorObraAtiva === 'function') lista = filtrarListaPorObraAtiva(lista);
  if (filtroSituacaoFrota !== 'todos') {
    lista = lista.filter(e => (e.situacao_ciclo || 'ativo') === filtroSituacaoFrota);
  }
  if (termoPrefixo) {
    lista = lista.filter(e => bateComPrefixoEquipamento(e.tag || '', termoPrefixo));
  }

  // Aplica os filtros individuais de cada coluna (Estilo Excel)
  lista = lista.filter(e => {
    const f = filtrosColunaFrota;
    if (f.tag && !String(e.tag || '').toUpperCase().includes(f.tag)) return false;
    if (f.nome && !String(e.nome || '').toUpperCase().includes(f.nome)) return false;
    if (f.marca && !String(e.marca || '').toUpperCase().includes(f.marca)) return false;
    if (f.modelo && !String(e.modelo || '').toUpperCase().includes(f.modelo)) return false;
    if (f.ano_fabricacao && !String(e.ano_fabricacao || '').toUpperCase().includes(f.ano_fabricacao)) return false;
    if (f.numero_serie && !String(e.numero_serie || '').toUpperCase().includes(f.numero_serie)) return false;
    if (f.placa && !String(e.placa || '').toUpperCase().includes(f.placa)) return false;

    if (f.propriedade) {
      const txtProp = (e.propriedade === 'alugado' ? 'LOCADO ALUGADO' : 'PROPRIO PRÓPRIO');
      if (!txtProp.includes(f.propriedade)) return false;
    }

    if (f.obra) {
      const txtObra = obterNomeObraEquipamento(e).toUpperCase();
      if (!txtObra.includes(f.obra)) return false;
    }

    if (f.horimetro) {
      const txtHor = `${e.horimetro_atual || 0} ${e.unidade_medida || 'H'}`.toUpperCase();
      if (!txtHor.includes(f.horimetro)) return false;
    }

    return true;
  });

  return lista;
}

function temFiltroColunaAtivoFrota() {
  return Object.values(filtrosColunaFrota).some(v => String(v || '').trim() !== '');
}

function alternarInputFiltroColunaFrota(colKey, event) {
  if (event) event.stopPropagation();
  colunasFiltroAbertasFrota[colKey] = !colunasFiltroAbertasFrota[colKey];
  renderizarPainelFrota();

  if (colunasFiltroAbertasFrota[colKey]) {
    setTimeout(() => {
      const inp = document.getElementById(`inp-col-frota-${colKey}`);
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 30);
  }
}

function atualizarFiltroColunaFrota(colKey, valor) {
  filtrosColunaFrota[colKey] = String(valor || '').trim().toUpperCase();
  atualizarApenasCorpoTabelaFrota();
}

function limparTodosFiltrosColunaFrota() {
  Object.keys(filtrosColunaFrota).forEach(k => { filtrosColunaFrota[k] = ''; });
  colunasFiltroAbertasFrota = {};
  const inpGeral = document.getElementById('filtroPrefixoFrotaInput');
  if (inpGeral) inpGeral.value = '';
  renderizarPainelFrota();
}

function renderizarThColunaFiltravelFrota(colKey, titulo) {
  const valorAtual = filtrosColunaFrota[colKey] || '';
  const aberto = Boolean(colunasFiltroAbertasFrota[colKey]) || valorAtual !== '';
  const ativo = valorAtual !== '';

  return `
    <th class="p-2.5 align-top select-none border-r border-slate-800 last:border-r-0">
      <div onclick="alternarInputFiltroColunaFrota('${colKey}', event)"
        class="flex items-center justify-between gap-1.5 cursor-pointer group ${ativo ? 'text-white bg-amber-600/30 px-1.5 py-0.5 rounded' : 'hover:text-white'}">
        <span>${esc(titulo)}</span>
        <i class="fa-solid ${ativo ? 'fa-filter text-amber-300' : 'fa-caret-down text-slate-400 group-hover:text-amber-300'} text-[10px]"></i>
      </div>
      ${aberto ? `
        <div class="mt-1.5 flex items-center gap-1" onclick="event.stopPropagation()">
          <input id="inp-col-frota-${colKey}" type="text" value="${valorAtual}"
            oninput="atualizarFiltroColunaFrota('${colKey}', this.value)"
            placeholder="Filtrar..."
            class="w-full min-w-[75px] px-2 py-1 rounded bg-slate-800 border ${ativo ? 'border-amber-400 text-amber-300' : 'border-slate-600 text-white'} text-[11px] font-bold uppercase placeholder-slate-400 focus:outline-none focus:border-amber-400" />
          ${ativo ? `
            <button type="button" onclick="atualizarFiltroColunaFrota('${colKey}', ''); renderizarPainelFrota();"
              class="text-rose-400 hover:text-rose-300 font-black text-xs px-1" title="Limpar esta coluna">&times;</button>
          ` : ''}
        </div>
      ` : ''}
    </th>
  `;
}

function gerarLinhasHtmlTabelaFrota(lista, podeGerenciar) {
  if (lista.length === 0) {
    return `
      <tr>
        <td colspan="12" class="p-6 text-center text-slate-500 font-bold">
          Nenhum equipamento encontrado com os filtros aplicados.
        </td>
      </tr>
    `;
  }

  return lista.map(e => {
    const nomeObra = obterNomeObraEquipamento(e);
    const propBadge = e.propriedade === 'alugado'
      ? `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-black text-[10px]">LOCADO</span>`
      : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">PRÓPRIO</span>`;

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 text-center">
          <input type="checkbox" value="${e.id}" class="chk-qr-equipamento rounded text-amber-500 cursor-pointer" />
        </td>
        <td class="p-2.5 font-black whitespace-nowrap">
          <span class="bg-amber-400 text-slate-950 px-2.5 py-1 rounded text-xs">${esc(e.tag)}</span>
        </td>
        <td class="p-2.5 font-extrabold text-slate-900">${esc(e.nome || '-')}</td>
        <td class="p-2.5 font-bold text-slate-700">${esc(e.marca || '-')}</td>
        <td class="p-2.5 font-bold text-slate-700">${esc(e.modelo || '-')}</td>
        <td class="p-2.5 font-bold text-slate-700 text-center">${esc(String(e.ano_fabricacao || '-'))}</td>
        <td class="p-2.5 font-semibold text-slate-700">${esc(e.numero_serie || '-')}</td>
        <td class="p-2.5 font-black text-amber-800">${esc(e.placa || '-')}</td>
        <td class="p-2.5">${propBadge}</td>
        <td class="p-2.5 font-bold text-slate-700 whitespace-nowrap">📍 ${esc(nomeObra)}</td>
        <td class="p-2.5 font-black text-slate-900 whitespace-nowrap">${e.horimetro_atual || 0} ${esc(e.unidade_medida || 'H')}${e.km_atual != null && e.unidade_medida !== 'KM' ? `<div class="text-[10px] text-slate-500">${esc(String(e.km_atual))} KM</div>` : ''}</td>
        <td class="p-2.5 text-right space-x-1 whitespace-nowrap">
          <button onclick="abrirEtiquetaQRIndividual('${e.id}')" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"><i class="fa-solid fa-qrcode"></i> QR</button>
          ${podeGerenciar ? `
            <button onclick="abrirModalTransferirObraEquipamento('${e.id}')" class="px-2 py-1 rounded bg-blue-100 text-blue-900 font-bold">🔄 Obra</button>
            <button onclick="abrirModalCicloVidaDesmobilizacao('${e.id}')" class="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold">⚙️ Status</button>
            <button onclick="abrirModalEditarEquipamento('${e.id}')" class="px-2 py-1 rounded bg-slate-100 text-slate-900 font-bold">✏️ Editar</button>
            <button onclick="abrirModalCorrigirLeitura('${e.id}')" class="px-2 py-1 rounded bg-red-100 text-red-900 font-bold">🛠️ Leitura</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// Atualiza apenas o tbody e os contadores enquanto o usuário digita no filtro da coluna (para não perder o foco do cursor!)
function atualizarApenasCorpoTabelaFrota() {
  const tbody = document.getElementById('tbodyTabelaFrotaExcel');
  if (!tbody) return renderizarPainelFrota();

  const podeGerenciar = podeExecutarAcao('gerenciar_frota');
  const lista = obterListaFrotaFiltradaAtual();
  tbody.innerHTML = gerarLinhasHtmlTabelaFrota(lista, podeGerenciar);

  const badgeCont = document.getElementById('contadorLinhasFiltradasFrota');
  if (badgeCont) badgeCont.innerText = `${lista.length} equipamento(s) listado(s)`;

  const btnLimpar = document.getElementById('btnLimparFiltrosColunaFrota');
  if (btnLimpar) btnLimpar.classList.toggle('hidden', !temFiltroColunaAtivoFrota());
}

function renderizarPainelFrota() {
  const sec = document.getElementById('sec-frota');
  if (!sec) return;

  const podeGerenciar = podeExecutarAcao('gerenciar_frota');
  const termoPrefixo = (document.getElementById('filtroPrefixoFrotaInput')?.value || '').trim().toUpperCase();
  const lista = obterListaFrotaFiltradaAtual();

  const contAtivos = cacheEquipamentos.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').length;
  const contDesmob = cacheEquipamentos.filter(e => e.situacao_ciclo === 'desmobilizado_aluguel').length;
  const contVendidos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'vendido_baixado').length;
  const contInativos = cacheEquipamentos.filter(e => e.situacao_ciclo === 'inativo_patio').length;

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GESTÃO DE ATIVOS E MOBILIZAÇÃO</span>
          <h2 class="text-lg font-black">Controle de Frota, Ano, Série, Placa & QR Codes</h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${podeGerenciar ? `
            <button onclick="abrirModalCadastroEquipamentoV2()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow">
              + Cadastrar Equipamento
            </button>
          ` : ''}
          ${podeGerenciar ? `<button onclick="abrirModalObraEmLote()" class="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-black text-xs shadow">📍 Atribuir obra aos selecionados</button>` : ''}
          <button onclick="imprimirQRCodesSelecionados()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-black text-xs shadow">
            <i class="fa-solid fa-qrcode mr-1"></i> Imprimir QR Codes Selecionados
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="carregarFrota('ativo')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'ativo' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">🟢 Ativos (${contAtivos})</button>
          <button onclick="carregarFrota('inativo_patio')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'inativo_patio' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'}">⏸️ Pátio (${contInativos})</button>
          <button onclick="carregarFrota('desmobilizado_aluguel')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'desmobilizado_aluguel' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}">🚛 Desmobilizados (${contDesmob})</button>
          <button onclick="carregarFrota('vendido_baixado')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'vendido_baixado' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}">🏷️ Vendidos (${contVendidos})</button>
          <button onclick="carregarFrota('todos')" class="px-3 py-1.5 rounded-lg text-xs font-black ${filtroSituacaoFrota === 'todos' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">🌐 Todos</button>
          <span id="contadorLinhasFiltradasFrota" class="ml-2 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-black text-[11px]">
            ${lista.length} equipamento(s) listado(s)
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button id="btnLimparFiltrosColunaFrota" onclick="limparTodosFiltrosColunaFrota()"
            class="${temFiltroColunaAtivoFrota() ? '' : 'hidden'} px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-black text-xs">
            ✖ Limpar Filtros de Coluna
          </button>
          <input id="filtroPrefixoFrotaInput" type="text" value="${termoPrefixo}" oninput="atualizarApenasCorpoTabelaFrota()" placeholder="🔍 Busca Rápida Prefixo..." class="px-3 py-1.5 rounded-lg border text-xs font-bold uppercase" />
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <div class="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-900 flex items-center justify-between">
          <span>💡 <strong>Dica:</strong> Clique em cima do nome de qualquer coluna abaixo (ex: <em>Descrição</em>, <em>Marca</em>, <em>Modelo</em>, <em>Ano</em>) para abrir o filtro individual estilo Excel!</span>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-2.5 text-center w-10 align-top border-r border-slate-800">
                <input type="checkbox" id="chkSelecionarTodosQR" onclick="alternarSelecaoTodosQR(this)" class="rounded text-amber-500 cursor-pointer" title="Selecionar Todos Filtrados" />
              </th>
              ${renderizarThColunaFiltravelFrota('tag', 'Prefixo')}
              ${renderizarThColunaFiltravelFrota('nome', 'Descrição')}
              ${renderizarThColunaFiltravelFrota('marca', 'Marca')}
              ${renderizarThColunaFiltravelFrota('modelo', 'Modelo')}
              ${renderizarThColunaFiltravelFrota('ano_fabricacao', 'Ano')}
              ${renderizarThColunaFiltravelFrota('numero_serie', 'Nº Série')}
              ${renderizarThColunaFiltravelFrota('placa', 'Placa')}
              ${renderizarThColunaFiltravelFrota('propriedade', 'Vínculo')}
              ${renderizarThColunaFiltravelFrota('obra', 'Obra Atual')}
              ${renderizarThColunaFiltravelFrota('horimetro', 'Horímetro/KM')}
              <th class="p-2.5 text-right align-top">Ações</th>
            </tr>
          </thead>
          <tbody id="tbodyTabelaFrotaExcel" class="divide-y divide-slate-200">
            ${gerarLinhasHtmlTabelaFrota(lista, podeGerenciar)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function alternarSelecaoTodosQR(masterChk) {
  const checks = document.querySelectorAll('.chk-qr-equipamento');
  checks.forEach(chk => { chk.checked = masterChk.checked; });
}

function abrirModalCadastroEquipamentoV2() {
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  if (!navigator.onLine) return alert('Cadastro de equipamento exige internet. Faça pelo PCM quando estiver online.');
  let modal = document.getElementById('modalNovoEquipV2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalNovoEquipV2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border my-8 max-h-[90vh] overflow-y-auto">
      <h3 class="text-lg font-black text-slate-900 border-b pb-2 mb-4">Cadastrar Equipamento na Frota</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Prefixo (TAG)</label>
            <input id="eqV2Tag" type="text" placeholder="Ex: EH-45" class="w-full border rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Propriedade</label>
            <select id="eqV2Prop" class="w-full border rounded-lg p-2 font-bold">
              <option value="proprio">🏢 Próprio</option>
              <option value="alugado">🤝 Alugado</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição</label>
          <input id="eqV2Nome" type="text" placeholder="Ex: ESCAVADEIRA HIDRÁULICA" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Marca</label>
            <input id="eqV2Marca" type="text" placeholder="Marca" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Modelo</label>
            <input id="eqV2Modelo" type="text" placeholder="Modelo" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Ano Fab.</label>
            <input id="eqV2Ano" type="text" placeholder="Ex: 2023" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Número de Série</label>
            <input id="eqV2Serie" type="text" placeholder="Nº de Série" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Placa (Opcional)</label>
            <input id="eqV2Placa" type="text" placeholder="Ex: ABC-1234" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Unidade</label>
            <select id="eqV2Unidade" class="w-full border rounded-lg p-2 font-bold">
              <option value="H">Horas (H)</option>
              <option value="KM">KM</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horímetro</label>
            <input id="eqV2Horimetro" type="number" step="0.1" value="0" class="w-full border rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Obra</label>
            <select id="eqV2Obra" class="w-full border rounded-lg p-2 font-bold">
              ${cacheObras.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>${esc(o.codigo)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalNovoEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarNovoEquipamentoV2()" class="px-5 py-2 rounded-lg bg-amber-500 font-black text-xs text-slate-950 shadow">Salvar Ativo</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function salvarNovoEquipamentoV2() {
  const tag = document.getElementById('eqV2Tag').value.trim().toUpperCase();
  const nome = document.getElementById('eqV2Nome').value.trim().toUpperCase();
  if (!tag || !nome) return alert('Informe Prefixo e Descrição!');
  if (!navigator.onLine) return alert('Equipamento só pode ser cadastrado com internet (somente PCM). Tente novamente quando estiver online.');
  const chave = t => String(t).toUpperCase().replace(/[\s-]/g, '').replace(/([A-Z])0+(\d)/g, '$1$2');
  if (cacheEquipamentos.some(e => chave(e.tag) === chave(tag))) return alert('Já existe um equipamento com esse prefixo (' + tag + ').');

  await gravarDadosOfflineSafe('equipamentos', 'INSERT', {
    tag,
    nome,
    marca: document.getElementById('eqV2Marca').value.trim().toUpperCase(),
    modelo: document.getElementById('eqV2Modelo').value.trim().toUpperCase(),
    ano_fabricacao: document.getElementById('eqV2Ano').value.trim(),
    numero_serie: document.getElementById('eqV2Serie').value.trim().toUpperCase(),
    placa: document.getElementById('eqV2Placa').value.trim().toUpperCase(),
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
      <h3 class="text-base font-black text-slate-900 mb-3">Alterar Status / Vínculo (${esc(eq.tag)})</h3>
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
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;
  _modalFrota('modalObraLoteV2', `
    <h3 class="font-black text-slate-900">🔄 Transferir ${esc(eq.tag)} para qual obra?</h3>
    <select id="obraLoteSel" class="w-full border rounded-lg p-2 text-sm font-bold">${cacheObras.map(o => `<option value="${o.id}" ${String(o.id) === String(eq.obra_id) ? 'selected' : ''}>${esc(o.codigo)} — ${esc(o.nome)}</option>`).join('')}</select>
    <div class="flex justify-end gap-2 pt-2">
      <button onclick="_fecharModalFrota('modalObraLoteV2')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick='confirmarObraEmLote(${JSON.stringify([String(eq.id)])})' class="px-5 py-2 rounded-lg bg-blue-700 text-white font-black text-xs">Transferir</button>
    </div>`);
}

// QR impresso no escritório sempre aponta para produção, mesmo se gerado a partir de teste/preview
const URL_BASE_QR_PRODUCAO = 'https://vilasa-manut.vercel.app/';

function gerarUrlQRCodeOfflineReady(eq) {
  const base = URL_BASE_QR_PRODUCAO + 'qr.html';
  const params = new URLSearchParams({ id: eq.id, tag: eq.tag || '', nome: eq.nome || '', un: eq.unidade_medida || 'H' });
  return `${base}?${params.toString()}`;
}

function abrirEtiquetaQRIndividual(equipId) {
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (eq) imprimirJanelaEtiquetasQR([eq]);
}

function imprimirQRCodesSelecionados() {
  const selecionadosIds = Array.from(document.querySelectorAll('.chk-qr-equipamento:checked')).map(chk => chk.value);
  if (selecionadosIds.length === 0) {
    return alert('Selecione pelo menos um equipamento na caixa de seleção da tabela para imprimir o QR Code!');
  }
  const lista = cacheEquipamentos.filter(e => selecionadosIds.includes(String(e.id)));
  imprimirJanelaEtiquetasQR(lista);
}

function imprimirJanelaEtiquetasQR(listaEquipamentos) {
  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups para imprimir as etiquetas.');
  const cardsHtml = listaEquipamentos.map(eq => {
    const imgApi = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(gerarUrlQRCodeOfflineReady(eq))}`;
    return `
      <div style="border:3px solid #0f172a; border-radius:14px; padding:14px; width:240px; text-align:center; font-family:sans-serif; page-break-inside:avoid;">
        <div style="background:#f59e0b; color:#0f172a; font-weight:900; font-size:20px; padding:4px 8px; border-radius:8px;">${esc(eq.tag)}</div>
        <div style="font-size:11px; font-weight:700; margin:6px 0;">${esc(eq.nome || '')}</div>
        <div style="font-size:9px; font-weight:600; color:#475569;">${eq.ano_fabricacao ? `Ano: ${esc(String(eq.ano_fabricacao))} | ` : ''}Série: ${esc(eq.numero_serie || 'N/I')} ${eq.placa ? `| Placa: ${esc(eq.placa)}` : ''}</div>
        <img src="${imgApi}" style="width:160px; height:160px; margin:4px auto;" />
        <div style="font-size:10px; font-weight:800;">LEITURA DE HORÍMETRO / OS</div>
      </div>
    `;
  }).join('');
  win.document.write(`<html><body style="display:flex;flex-wrap:wrap;gap:16px;padding:20px;" onload="setTimeout(()=>window.print(),800)">${cardsHtml}</body></html>`);
  win.document.close();
}

function exportarRelatorioFrotaCSV() {
  const listaParaExportar = typeof obterListaFrotaFiltradaAtual === 'function'
    ? obterListaFrotaFiltradaAtual()
    : cacheEquipamentos;

  const cab = ['PREFIXO', 'DESCRICAO', 'MARCA', 'MODELO', 'ANO_FABRICACAO', 'NUMERO_SERIE', 'PLACA', 'PROPRIEDADE', 'SITUACAO', 'HORIMETRO_ATUAL', 'UNIDADE'];
  const linhas = listaParaExportar.map(e => [
    e.tag || '', (e.nome || '').replace(/;/g, ','), (e.marca || '').replace(/;/g, ','),
    (e.modelo || '').replace(/;/g, ','), e.ano_fabricacao || '', e.numero_serie || '', e.placa || '',
    e.propriedade || 'proprio', e.situacao_ciclo || 'ativo',
    String(e.horimetro_atual || 0).replace('.', ','), e.unidade_medida || 'H'
  ].map(csvCelula).join(';'));
  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_FROTA_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}


// ===== Fase Frota: edição, obra em lote, correção manual de leitura =====
function _modalFrota(id, html) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.id = id;
    m.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="bg-white rounded-2xl p-5 w-full max-w-md space-y-3">${html}</div>`;
  m.classList.remove('hidden');
}
function _fecharModalFrota(id) { document.getElementById(id)?.classList.add('hidden'); }

function abrirModalEditarEquipamento(equipId) {
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;
  const campo = (id, rot, v) => `<label class="block text-xs font-black text-slate-700">${rot}<input id="${id}" value="${esc(String(v ?? ''))}" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold uppercase" /></label>`;
  _modalFrota('modalEditarEquipV2', `
    <h3 class="font-black text-slate-900">✏️ Editar ${esc(eq.tag)}</h3>
    ${campo('edNome', 'Descrição', eq.nome)}${campo('edMarca', 'Marca', eq.marca)}${campo('edModelo', 'Modelo', eq.modelo)}
    ${campo('edAno', 'Ano', eq.ano_fabricacao)}${campo('edSerie', 'Nº de série', eq.numero_serie)}${campo('edPlaca', 'Placa', eq.placa)}
    <label class="block text-xs font-black text-slate-700">Medidor principal
      <select id="edUn" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold"><option value="H" ${eq.unidade_medida !== 'KM' ? 'selected' : ''}>Horas</option><option value="KM" ${eq.unidade_medida === 'KM' ? 'selected' : ''}>KM</option></select></label>
    <div class="flex justify-end gap-2 pt-2">
      <button onclick="_fecharModalFrota('modalEditarEquipV2')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="salvarEdicaoEquipamento('${eq.id}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Salvar</button>
    </div>`);
}

async function salvarEdicaoEquipamento(equipId) {
  const v = id => document.getElementById(id).value.trim().toUpperCase();
  const nome = v('edNome');
  if (!nome) return alert('Informe a descrição!');
  await gravarDadosOfflineSafe('equipamentos', 'UPDATE', {
    nome, marca: v('edMarca'), modelo: v('edModelo'), ano_fabricacao: v('edAno'),
    numero_serie: v('edSerie'), placa: v('edPlaca'), unidade_medida: v('edUn')
  }, equipId);
  _fecharModalFrota('modalEditarEquipV2');
  await carregarFrota(filtroSituacaoFrota);
}

function abrirModalObraEmLote() {
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  const ids = [...document.querySelectorAll('.chk-qr-equipamento:checked')].map(c => c.value);
  if (!ids.length) return alert('Marque os equipamentos na primeira coluna da tabela.');
  _modalFrota('modalObraLoteV2', `
    <h3 class="font-black text-slate-900">📍 Atribuir obra a ${ids.length} equipamento(s)</h3>
    <select id="obraLoteSel" class="w-full border rounded-lg p-2 text-sm font-bold">${cacheObras.map(o => `<option value="${o.id}">${esc(o.codigo)} — ${esc(o.nome)}</option>`).join('')}</select>
    <div class="flex justify-end gap-2 pt-2">
      <button onclick="_fecharModalFrota('modalObraLoteV2')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick='confirmarObraEmLote(${JSON.stringify(ids)})' class="px-5 py-2 rounded-lg bg-blue-700 text-white font-black text-xs">Aplicar</button>
    </div>`);
}

async function confirmarObraEmLote(ids) {
  const obraId = document.getElementById('obraLoteSel').value;
  for (const id of ids) await gravarDadosOfflineSafe('equipamentos', 'UPDATE', { obra_id: obraId }, id);
  _fecharModalFrota('modalObraLoteV2');
  await carregarFrota(filtroSituacaoFrota);
}

function abrirModalCorrigirLeitura(equipId) {
  const eq = cacheEquipamentos.find(e => String(e.id) === String(equipId));
  if (!eq) return;
  if (!podeExecutarAcao('gerenciar_frota', true)) return;
  if (!navigator.onLine) return alert('Correção de leitura exige internet.');
  const un = eq.unidade_medida === 'KM' ? 'KM' : 'H';
  _modalFrota('modalCorrigirLeituraV2', `
    <h3 class="font-black text-slate-900">🛠️ Corrigir leitura — ${esc(eq.tag)}</h3>
    <p class="text-xs font-bold text-slate-600">Atual: ${esc(String(eq.horimetro_atual ?? 0))} ${un}${eq.km_atual != null && un !== 'KM' ? ' | ' + esc(String(eq.km_atual)) + ' KM' : ''}. A correção ignora os limites de salto e fica registrada no histórico.</p>
    <label class="block text-xs font-black text-slate-700">Medidor
      <select id="corMed" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold"><option value="${un}">${un === 'KM' ? 'KM' : 'Horímetro (H)'}</option>${un === 'KM' ? '<option value="H">Horímetro (H)</option>' : '<option value="KM">KM</option>'}</select></label>
    <label class="block text-xs font-black text-slate-700">Leitura correta<input id="corVal" type="number" step="0.1" min="0" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold" /></label>
    <label class="block text-xs font-black text-slate-700">Motivo (obrigatório)<input id="corMotivo" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold" placeholder="Ex.: digitado errado na planilha" /></label>
    <div class="flex justify-end gap-2 pt-2">
      <button onclick="_fecharModalFrota('modalCorrigirLeituraV2')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="confirmarCorrecaoLeitura('${eq.id}')" class="px-5 py-2 rounded-lg bg-red-700 text-white font-black text-xs">Corrigir</button>
    </div>`);
}

async function confirmarCorrecaoLeitura(equipId) {
  const leitura = parseFloat(document.getElementById('corVal').value);
  const motivo = document.getElementById('corMotivo').value.trim();
  const medidor = document.getElementById('corMed').value;
  if (isNaN(leitura) || leitura < 0) return alert('Informe uma leitura válida.');
  if (!motivo) return alert('Informe o motivo da correção.');
  if (!navigator.onLine) return alert('Sem internet. Tente novamente online.');
  const { error } = await db.rpc('corrigir_leitura', {
    p_id: (crypto.randomUUID ? crypto.randomUUID() : null), p_equipamento: equipId,
    p_medidor: medidor, p_leitura: leitura, p_motivo: motivo
  });
  if (error) return alert('Não foi possível corrigir: ' + error.message);
  _fecharModalFrota('modalCorrigirLeituraV2');
  await carregarFrota(filtroSituacaoFrota);
}
