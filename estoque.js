// ============================================================================
// VILASA CMMS - MÓDULO 7: ESTOQUE.JS (OS 3 BOTÕES + NOSSO CÓDIGO MESTRE DE PARALELOS)
// Responsabilidades:
// 1. Botão 1 [Cadastrar Item]: Cria Nosso Código Mestre (ex: VIL-0010) e atrela N códigos paralelos
// 2. Botão 2 [Entrada de NF]: Entrada de itens estocáveis ou não, permitindo atrelar ao Nosso Código
// 3. Botão 3 [Saída p/ Máquina]: Saída do estoque (FIFO) OU Saída Direta (NF acabou de chegar -> Máquina)
// ============================================================================

let cacheMovimentacoesAlmox = [];
let abaVisualizacaoEstoque = 'catalogo'; // 'catalogo' ou 'historico_nf_saidas'

async function carregarEstoque(aba = abaVisualizacaoEstoque) {
  abaVisualizacaoEstoque = aba;

  const [resPecas, resMovs, resEq] = await Promise.all([
    lerDadosComFallbackOffline('pecas_estoque', () => db.from('pecas_estoque').select('*').order('id_interno')),
    lerDadosComFallbackOffline('movimentacoes_almoxarifado', () =>
      db.from('movimentacoes_almoxarifado').select('*').order('registrado_em', { ascending: false }).limit(400)
    ),
    (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
      ? Promise.resolve({ data: cacheEquipamentos })
      : lerDadosComFallbackOffline('equipamentos', () => db.from('equipamentos').select('*').order('tag'))
  ]);

  cachePecas = resPecas.data || [];
  cacheMovimentacoesAlmox = resMovs.data || [];
  cacheEquipamentos = resEq.data || [];

  renderizarPainelAlmoxarifado3Botoes();
}

// Gera sugestão sequencial para o Nosso Código Interno (ex: VIL-0042)
function gerarProximoNossoCodigoInterno() {
  let maior = 0;
  (cachePecas || []).forEach(p => {
    const m = String(p.id_interno || '').match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maior) maior = n;
    }
  });
  return `VIL-${String(maior + 1).padStart(4, '0')}`;
}

// Busca peça tanto pelo Nosso Código Interno quanto por qualquer código paralelo atrelado
function bateComBuscaPecaOuParalelo(peca, termoDigitado) {
  const termo = String(termoDigitado || '').trim().toUpperCase();
  if (!termo) return true;

  const idInterno = String(peca.id_interno || '').toUpperCase();
  const codFabricante = String(peca.codigo || '').toUpperCase();
  const desc = String(peca.descricao || '').toUpperCase();
  const paralelos = Array.isArray(peca.codigos_paralelos) ? peca.codigos_paralelos.map(c => String(c).toUpperCase()) : [];

  return (
    idInterno.includes(termo) ||
    codFabricante.includes(termo) ||
    desc.includes(termo) ||
    paralelos.some(p => p.includes(termo))
  );
}

function renderizarPainelAlmoxarifado3Botoes() {
  const sec = document.getElementById('sec-estoque');
  if (!sec) return;

  const podeOperar = podeExecutarAcao('gerenciar_catalogo_estoque') || podeExecutarAcao('lancar_nf_entrada') || podeExecutarAcao('dar_baixa_estoque');
  const termo = (document.getElementById('buscaRapidaAlmoxInput')?.value || '').trim().toUpperCase();

  let listaPecas = [...cachePecas];
  if (typeof filtrarListaPorObraAtiva === 'function') {
    listaPecas = filtrarListaPorObraAtiva(listaPecas);
  }
  if (termo) {
    listaPecas = listaPecas.filter(p => bateComBuscaPecaOuParalelo(p, termo));
  }

  sec.innerHTML = `
    <div class="space-y-5">
      <!-- PAINEL CENTRAL COM OS 3 BOTÕES DEFINITIVOS DO ALMOXARIFADO -->
      <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ALMOXARIFADO CENTRAL & CONTROLE DE EQUIVALÊNCIAS</span>
            <h2 class="text-lg font-black">Gestão por Código Interno Mestre, Entrada de NF e Saída Direta</h2>
          </div>
          <button onclick="exportarInventarioAlmoxCSV()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-black text-xs">
            <i class="fa-solid fa-file-excel mr-1"></i> Exportar Relatório
          </button>
        </div>

        ${podeOperar ? `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <!-- BOTÃO 1: CADASTRAR ITEM (NOSSO CÓDIGO + PARALELOS) -->
            <button onclick="abrirModalBotao1CadastrarItem()"
              class="p-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-amber-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">1</div>
              <div>
                <div class="font-black text-sm uppercase">📦 Cadastrar Item Mestre</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Gera <strong>Nosso Código Interno</strong> para atrelar vários códigos paralelos diferentes.</p>
              </div>
            </button>

            <!-- BOTÃO 2: ENTRADA DE NF -->
            <button onclick="abrirModalBotao2EntradaNF()"
              class="p-4 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-blue-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">2</div>
              <div>
                <div class="font-black text-sm uppercase">📥 Entrada de NF</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Entrada de itens estocáveis ou não, podendo atrelar o item da NF ao Nosso Código.</p>
              </div>
            </button>

            <!-- BOTÃO 3: SAÍDA PARA MÁQUINA (PRATELEIRA OU DIRETO DA NF) -->
            <button onclick="abrirModalBotao3SaidaMaquina()"
              class="p-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-emerald-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">3</div>
              <div>
                <div class="font-black text-sm uppercase">📤 Saída para Máquina</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Baixa de prateleira para o equipamento OU <strong>Saída Direta de NF recém-chegada</strong>.</p>
              </div>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Barra de Abas e Busca por Nosso Código ou Código Paralelo -->
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex gap-1.5">
          <button onclick="carregarEstoque('catalogo')" class="px-3.5 py-1.5 rounded-lg text-xs font-black ${abaVisualizacaoEstoque === 'catalogo' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🗂️ Catálogo Mestre & Saldos (${listaPecas.length})
          </button>
          <button onclick="carregarEstoque('historico_nf_saidas')" class="px-3.5 py-1.5 rounded-lg text-xs font-black ${abaVisualizacaoEstoque === 'historico_nf_saidas' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🧾 Histórico de NFs & Saídas p/ Máquinas (${cacheMovimentacoesAlmox.length})
          </button>
        </div>

        <input id="buscaRapidaAlmoxInput" type="text" value="${termo}" oninput="renderizarPainelAlmoxarifado3Botoes()"
          placeholder="🔍 Buscar Nosso Código (VIL-...), Código Paralelo ou Descrição..."
          class="w-full sm:w-96 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold uppercase focus:outline-none focus:border-amber-500" />
      </div>

      <!-- Tabela Principal -->
      ${abaVisualizacaoEstoque === 'catalogo'
        ? renderizarTabelaCatalogoComParalelos(listaPecas, podeOperar)
        : renderizarTabelaMovimentacoesNFEsaidas()}
    </div>
  `;
}

function renderizarTabelaCatalogoComParalelos(listaPecas, podeOperar) {
  if (listaPecas.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhum item encontrado no almoxarifado. Use o Botão 1 para cadastrar.</div>`;
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Nosso Código Mestre</th>
            <th class="p-3">Descrição Padrão no Almoxarifado</th>
            <th class="p-3">Códigos Paralelos / Equivalentes Atrelados</th>
            <th class="p-3">Tipo</th>
            <th class="p-3">Saldo Atual</th>
            <th class="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${listaPecas.map(p => {
            const paralelos = Array.isArray(p.codigos_paralelos) ? p.codigos_paralelos : [];
            const todosCodigos = [...new Set([p.codigo, ...paralelos].filter(Boolean))];
            const abaixoMin = parseFloat(p.quantidade || 0) <= parseFloat(p.estoque_minimo || 0) && p.estocavel !== false;

            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3">
                  <span class="bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded text-xs">${p.id_interno || 'VIL-S/N'}</span>
                </td>
                <td class="p-3 font-extrabold text-slate-900">${p.descricao || '-'}</td>
                <td class="p-3">
                  <div class="flex flex-wrap gap-1">
                    ${todosCodigos.length > 0
                      ? todosCodigos.map(c => `<span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px]">${c}</span>`).join('')
                      : `<span class="text-slate-400 italic">Nenhum paralelo atrelado</span>`}
                  </div>
                </td>
                <td class="p-3">
                  ${p.estocavel !== false
                    ? `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">ESTOCÁVEL</span>`
                    : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">NÃO ESTOCÁVEL</span>`}
                </td>
                <td class="p-3 font-black text-sm ${abaixoMin ? 'text-rose-600' : 'text-emerald-700'}">
                  ${p.quantidade || 0} ${p.unidade || 'UN'}
                </td>
                <td class="p-3 text-right whitespace-nowrap">
                  ${podeOperar ? `
                    <button onclick="adicionarNovoCodigoParaleloRapido('${p.id}')" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-[11px]">
                      + Atrelar Paralelo
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

// Permite atrelar um código paralelo novo a um Nosso Código existente com 1 clique
async function adicionarNovoCodigoParaleloRapido(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (!peca) return;

  const novoCod = prompt(`Atrelar novo Código Paralelo / Fabricante ao nosso item ${peca.id_interno} (${peca.descricao}):\nEx: LF16015 - FLEETGUARD`);
  if (!novoCod || !novoCod.trim()) return;

  const listaAtual = Array.isArray(peca.codigos_paralelos) ? [...peca.codigos_paralelos] : [];
  const limpo = novoCod.trim().toUpperCase();
  if (!listaAtual.includes(limpo)) listaAtual.push(limpo);

  await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', {
    codigos_paralelos: listaAtual
  }, pecaId);

  await carregarEstoque('catalogo');
}

// ----------------------------------------------------------------------------
// BOTÃO 1: CADASTRAR ITEM MESTRE (CRIA NOSSO CÓDIGO + ATRELA VÁRIOS PARALELOS)
// ----------------------------------------------------------------------------
function abrirModalBotao1CadastrarItem() {
  const sugerido = gerarProximoNossoCodigoInterno();

  let modal = document.getElementById('modalAlmoxBotao1');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao1';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b pb-3 mb-4">
        <div>
          <span class="bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded text-[10px] uppercase">Botão 1 • Catálogo Mestre</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Cadastrar Item com Nosso Código Interno</h3>
        </div>
        <button onclick="document.getElementById('modalAlmoxBotao1').classList.add('hidden')" class="text-xl font-black text-slate-400">&times;</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Nosso Número de Cadastro (SKU)</label>
            <input id="b1IdInterno" type="text" value="${sugerido}" class="w-full border-2 border-amber-400 bg-amber-50 rounded-lg p-2 font-black uppercase text-slate-950" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Natureza do Item</label>
            <select id="b1Estocavel" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="true">📦 Item Estocável (Controla Prateleira)</option>
              <option value="false">⚡ Consumo Direto / Não Estocável</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição Técnica Padrão (Nosso Nome)</label>
          <input id="b1Descricao" type="text" placeholder="Ex: FILTRO LUBRIFICANTE MOTOR ESCAVADEIRA CAT 320" class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">
            🔗 Códigos Paralelos / Referências de Fabricantes (Separe por vírgula)
          </label>
          <textarea id="b1Paralelos" rows="2" placeholder="Ex: 1R-1808, P551808, LF16015, PSL283" class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase"></textarea>
          <p class="text-[10px] text-slate-500 mt-0.5">Você pode atrelar quantos códigos paralelos quiser agora ou durante a Entrada de NF.</p>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Unidade</label>
            <input id="b1Unidade" type="text" value="UN" class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Saldo Inicial</label>
            <input id="b1SaldoInicial" type="number" step="0.1" value="0" class="w-full border border-slate-300 rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Estoque Mínimo</label>
            <input id="b1EstMinimo" type="number" step="0.1" value="2" class="w-full border border-slate-300 rounded-lg p-2 font-bold" />
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao1').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao1CadastroItem()" class="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow">
          💾 Criar Nosso Código no Almoxarifado
        </button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function salvarBotao1CadastroItem() {
  const id_interno = document.getElementById('b1IdInterno').value.trim().toUpperCase();
  const descricao = document.getElementById('b1Descricao').value.trim().toUpperCase();
  const estocavel = document.getElementById('b1Estocavel').value === 'true';
  const rawParalelos = document.getElementById('b1Paralelos').value;

  if (!id_interno || !descricao) return alert('Informe o Nosso Código e a Descrição do item!');

  const codigos_paralelos = rawParalelos
    .split(/[,;\n]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const codigoPrincipal = codigos_paralelos[0] || id_interno;

  await gravarDadosOfflineSafe('pecas_estoque', 'INSERT', {
    id_interno,
    codigo: codigoPrincipal,
    codigos_paralelos,
    descricao,
    estocavel,
    unidade: document.getElementById('b1Unidade').value.trim().toUpperCase() || 'UN',
    quantidade: parseFloat(document.getElementById('b1SaldoInicial').value) || 0,
    estoque_minimo: parseFloat(document.getElementById('b1EstMinimo').value) || 0,
    obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
  });

  document.getElementById('modalAlmoxBotao1')?.classList.add('hidden');
  await carregarEstoque('catalogo');
}

// ----------------------------------------------------------------------------
// BOTÃO 2: ENTRADA DE NF (ITENS ESTOCÁVEIS OU NÃO + OPÇÃO DE ATRELAR AO NOSSO CÓDIGO)
// ----------------------------------------------------------------------------
function abrirModalBotao2EntradaNF() {
  let modal = document.getElementById('modalAlmoxBotao2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b pb-3 mb-4">
        <div>
          <span class="bg-blue-500 text-slate-950 font-black px-2 py-0.5 rounded text-[10px] uppercase">Botão 2 • Recebimento Fiscal</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Entrada de Nota Fiscal no Almoxarifado</h3>
        </div>
        <button onclick="document.getElementById('modalAlmoxBotao2').classList.add('hidden')" class="text-xl font-black text-slate-400">&times;</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Nº da Nota Fiscal</label>
            <input id="b2NumeroNF" type="text" placeholder="Ex: NF 45890" class="w-full border border-slate-300 rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Fornecedor</label>
            <input id="b2Fornecedor" type="text" placeholder="Ex: SOTREQ / AUTO PEÇAS" class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>

        <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 space-y-2">
          <label class="block font-black uppercase text-blue-950">
            🔗 Atrelar a um Item Cadastrado (Nosso Código) — Opcional:
          </label>
          <select id="b2PecaCadastradaId" onchange="preencherDadosPecaAoSelecionarNaNF(this.value)" class="w-full border border-blue-300 rounded-lg p-2 font-bold bg-white">
            <option value="">-- Item Avulso / Não atrelar a item existente --</option>
            ${cachePecas.map(p => `<option value="${p.id}">${p.id_interno || p.codigo} - ${p.descricao} [Paralelos: ${(p.codigos_paralelos || []).join(', ')}]</option>`).join('')}
          </select>
          <p class="text-[10px] text-blue-800">Se você selecionar um item nosso acima e digitar um código de fabricante novo abaixo, o sistema já amarra esse código novo como paralelo automaticamente!</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Código que veio na NF (Paralelo/Fab.)</label>
            <input id="b2CodigoNaNF" type="text" placeholder="Ex: LF16015" class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Tipo de Entrada</label>
            <select id="b2Estocavel" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
              <option value="true">📦 Estocável (Soma Saldo na Prateleira)</option>
              <option value="false">⚡ Não Estocável (Apenas Registro de Entrada)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição do Item</label>
          <input id="b2Descricao" type="text" placeholder="Descrição do material..." class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Quantidade Recebida</label>
            <input id="b2Quantidade" type="number" step="0.1" value="1" class="w-full border border-slate-300 rounded-lg p-2 font-black" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Valor Unitário na NF (R$)</label>
            <input id="b2ValorUnit" type="number" step="0.01" value="0.00" class="w-full border border-slate-300 rounded-lg p-2 font-bold" />
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao2EntradaNF()" class="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-slate-950 font-black text-xs shadow">
          📥 Confirmar Entrada da NF
        </button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function preencherDadosPecaAoSelecionarNaNF(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (!peca) return;
  document.getElementById('b2Descricao').value = peca.descricao || '';
  document.getElementById('b2Estocavel').value = String(peca.estocavel !== false);
}

async function salvarBotao2EntradaNF() {
  const numero_nf = document.getElementById('b2NumeroNF').value.trim().toUpperCase();
  const fornecedor = document.getElementById('b2Fornecedor').value.trim().toUpperCase();
  const pecaId = document.getElementById('b2PecaCadastradaId').value || null;
  const codigo_nf_paralelo = document.getElementById('b2CodigoNaNF').value.trim().toUpperCase();
  const estocavel = document.getElementById('b2Estocavel').value === 'true';
  const descricao_item = document.getElementById('b2Descricao').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('b2Quantidade').value) || 0;
  const valor_unitario = parseFloat(document.getElementById('b2ValorUnit').value) || 0;

  if (!numero_nf || !descricao_item || quantidade <= 0) {
    return alert('Informe o Nº da NF, a Descrição e uma Quantidade válida!');
  }

  let idInternoSnapshot = 'AVULSO';

  // Se atrelou a um item cadastrado, soma o saldo (se estocável) e adiciona o código da NF na lista de paralelos dele!
  if (pecaId) {
    const peca = cachePecas.find(p => String(p.id) === String(pecaId));
    if (peca) {
      idInternoSnapshot = peca.id_interno || peca.codigo;
      const paralelos = Array.isArray(peca.codigos_paralelos) ? [...peca.codigos_paralelos] : [];
      if (codigo_nf_paralelo && !paralelos.includes(codigo_nf_paralelo)) {
        paralelos.push(codigo_nf_paralelo);
      }
      const novoSaldo = estocavel
        ? Number((parseFloat(peca.quantidade || 0) + quantidade).toFixed(2))
        : parseFloat(peca.quantidade || 0);

      await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', {
        quantidade: novoSaldo,
        codigos_paralelos: paralelos,
        custo_unitario: valor_unitario > 0 ? valor_unitario : (peca.custo_unitario || 0)
      }, pecaId);
    }
  }

  await gravarDadosOfflineSafe('movimentacoes_almoxarifado', 'INSERT', {
    obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null,
    tipo_movimento: 'ENTRADA_NF',
    numero_nf,
    fornecedor,
    peca_id: pecaId,
    id_interno_snapshot: idInternoSnapshot,
    codigo_nf_paralelo,
    descricao_item,
    estocavel,
    quantidade,
    saldo_restante_lote_fifo: estocavel ? quantidade : 0,
    valor_unitario,
    responsavel_nome: usuarioLogado?.nome || 'Almoxarifado',
    registrado_em: new Date().toISOString()
  });

  document.getElementById('modalAlmoxBotao2')?.classList.add('hidden');
  await carregarEstoque('catalogo');
}

// ----------------------------------------------------------------------------
// BOTÃO 3: SAÍDA PARA MÁQUINA (DO ESTOQUE OU SAÍDA DIRETA DE NF RECÉM-CHEGADA)
// ----------------------------------------------------------------------------
function abrirModalBotao3SaidaMaquina() {
  let modal = document.getElementById('modalAlmoxBotao3');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao3';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
      <div class="flex items-center justify-between border-b pb-3 mb-4">
        <div>
          <span class="bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded text-[10px] uppercase">Botão 3 • Aplicação em Equipamento</span>
          <h3 class="text-lg font-black text-slate-900 mt-1">Saída de Material para Máquina</h3>
        </div>
        <button onclick="document.getElementById('modalAlmoxBotao3').classList.add('hidden')" class="text-xl font-black text-slate-400">&times;</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Modalidade da Saída</label>
          <select id="b3ModoSaida" onchange="alternarModoSaidaBotao3(this.value)" class="w-full border-2 border-emerald-500 bg-emerald-50 rounded-lg p-2.5 font-black text-slate-950">
            <option value="SAIDA_ESTOQUE">📦 1. Saída Normal de Item em Estoque (Dá baixa na prateleira)</option>
            <option value="SAIDA_DIRETA_NF_MAQUINA">⚡ 2. Nota Fiscal Acabou de Entrar e Foi Direto p/ Máquina</option>
          </select>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Equipamento Destino (Filtre pelo Prefixo)</label>
          <select id="b3EquipamentoId" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
            <option value="">-- Selecione a Máquina --</option>
            ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
        </div>

        <!-- BLOCO A: SELEÇÃO DE ITEM DO ESTOQUE (OU OPCIONAL NA SAÍDA DIRETA DE NF) -->
        <div id="blocoB3SelecaoCatalogo">
          <label class="block font-black uppercase text-slate-700 mb-1">Item do Nosso Catálogo (Opcional no modo Direto de NF)</label>
          <select id="b3PecaId" onchange="preencherDescSaidaBotao3(this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-bold">
            <option value="">-- Selecione pelo Nosso Código ou Paralelo --</option>
            ${cachePecas.map(p => `<option value="${p.id}">${p.id_interno || p.codigo} - ${p.descricao} (Saldo: ${p.quantidade})</option>`).join('')}
          </select>
        </div>

        <!-- BLOCO B: DADOS DA NF (QUANDO A NOTA ACABOU DE ENTRAR E FOI DIRETO P/ MÁQUINA) -->
        <div id="blocoB3DadosNFDireta" class="hidden bg-amber-50 p-3 rounded-xl border border-amber-300 space-y-2">
          <div class="font-black text-amber-950 uppercase text-[11px]">⚡ Dados da Nota Fiscal que Foi Direto para a Máquina:</div>
          <div class="grid grid-cols-2 gap-2">
            <input id="b3NumeroNFDireta" type="text" placeholder="Nº da NF (Ex: NF 9912)" class="border border-amber-400 rounded-lg p-2 font-black uppercase bg-white" />
            <input id="b3FornecedorDireta" type="text" placeholder="Fornecedor" class="border border-amber-400 rounded-lg p-2 font-bold uppercase bg-white" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <input id="b3CodigoParaleloDireta" type="text" placeholder="Código na NF (p/ atrelar)" class="border border-amber-400 rounded-lg p-2 font-bold uppercase bg-white" />
            <input id="b3ValorUnitDireta" type="number" step="0.01" placeholder="Valor Unit. R$" class="border border-amber-400 rounded-lg p-2 font-bold bg-white" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div class="col-span-2">
            <label class="block font-black uppercase text-slate-700 mb-1">Descrição do Material Aplicado</label>
            <input id="b3DescricaoItem" type="text" placeholder="Descrição da peça..." class="w-full border border-slate-300 rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Quantidade</label>
            <input id="b3Quantidade" type="number" step="0.1" value="1" class="w-full border border-slate-300 rounded-lg p-2 font-black" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Retirado por / Observação</label>
          <input id="b3Observacao" type="text" placeholder="Ex: Mecânico João Silva • Aplicado no comando hidráulico" class="w-full border border-slate-300 rounded-lg p-2 font-semibold" />
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao3').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao3SaidaMaquina()" class="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow">
          📤 Confirmar Saída para a Máquina
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  const selEq = document.getElementById('b3EquipamentoId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') {
    ativarBuscaPorPrefixoEmSelect(selEq);
  }
}

function alternarModoSaidaBotao3(modo) {
  const blocoNF = document.getElementById('blocoB3DadosNFDireta');
  if (blocoNF) blocoNF.classList.toggle('hidden', modo !== 'SAIDA_DIRETA_NF_MAQUINA');
}

function preencherDescSaidaBotao3(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (peca) {
    document.getElementById('b3DescricaoItem').value = peca.descricao || '';
  }
}

async function salvarBotao3SaidaMaquina() {
  const modo = document.getElementById('b3ModoSaida').value;
  const equipId = document.getElementById('b3EquipamentoId').value;
  const pecaId = document.getElementById('b3PecaId').value || null;
  const descricao_item = document.getElementById('b3DescricaoItem').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('b3Quantidade').value) || 0;
  const observacao = document.getElementById('b3Observacao').value.trim();

  if (!equipId || !descricao_item || quantidade <= 0) {
    return alert('Selecione a Máquina, informe a Descrição do material e a Quantidade!');
  }

  let idInternoSnapshot = 'DIRETO-NF';
  let numero_nf = '';
  let fornecedor = '';
  let codigo_nf_paralelo = '';
  let valor_unitario = 0;

  if (modo === 'SAIDA_ESTOQUE') {
    if (!pecaId) return alert('Selecione qual item do estoque está saindo!');
    const peca = cachePecas.find(p => String(p.id) === String(pecaId));
    if (!peca) return;

    if (peca.estocavel !== false && parseFloat(peca.quantidade || 0) < quantidade) {
      return alert(`Saldo insuficiente em estoque! Disponível: ${peca.quantidade}`);
    }

    idInternoSnapshot = peca.id_interno || peca.codigo;
    valor_unitario = parseFloat(peca.custo_unitario || 0);

    if (peca.estocavel !== false) {
      const novoSaldo = Number((parseFloat(peca.quantidade || 0) - quantidade).toFixed(2));
      await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', { quantidade: novoSaldo }, pecaId);
    }
  } else {
    // MODO: SAÍDA DIRETA DA NOTA FISCAL PARA A MÁQUINA (Entra e sai no mesmo ato sem acumular prateleira)
    numero_nf = document.getElementById('b3NumeroNFDireta').value.trim().toUpperCase();
    fornecedor = document.getElementById('b3FornecedorDireta').value.trim().toUpperCase();
    codigo_nf_paralelo = document.getElementById('b3CodigoParaleloDireta').value.trim().toUpperCase();
    valor_unitario = parseFloat(document.getElementById('b3ValorUnitDireta').value) || 0;

    if (!numero_nf) return alert('Informe o Nº da Nota Fiscal que foi direto para a máquina!');

    // Se o almoxarife aproveitou para vincular a um Nosso Código existente, já registra o código paralelo lá!
    if (pecaId) {
      const peca = cachePecas.find(p => String(p.id) === String(pecaId));
      if (peca) {
        idInternoSnapshot = peca.id_interno || peca.codigo;
        const paralelos = Array.isArray(peca.codigos_paralelos) ? [...peca.codigos_paralelos] : [];
        if (codigo_nf_paralelo && !paralelos.includes(codigo_nf_paralelo)) {
          paralelos.push(codigo_nf_paralelo);
          await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', { codigos_paralelos: paralelos }, pecaId);
        }
      }
    }
  }

  await gravarDadosOfflineSafe('movimentacoes_almoxarifado', 'INSERT', {
    obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null,
    tipo_movimento: modo,
    numero_nf,
    fornecedor,
    peca_id: pecaId,
    id_interno_snapshot: idInternoSnapshot,
    codigo_nf_paralelo,
    descricao_item,
    estocavel: modo === 'SAIDA_ESTOQUE',
    quantidade,
    saldo_restante_lote_fifo: 0,
    valor_unitario,
    equipamento_id: equipId,
    responsavel_nome: usuarioLogado?.nome || 'Almoxarifado',
    observacao,
    registrado_em: new Date().toISOString()
  });

  document.getElementById('modalAlmoxBotao3')?.classList.add('hidden');
  await carregarEstoque('historico_nf_saidas');
}

function renderizarTabelaMovimentacoesNFEsaidas() {
  if (cacheMovimentacoesAlmox.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">Nenhuma movimentação de NF ou saída registrada ainda.</div>`;
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Data/Hora</th>
            <th class="p-3">Operação</th>
            <th class="p-3">Nosso Código / NF</th>
            <th class="p-3">Material</th>
            <th class="p-3">Qtd</th>
            <th class="p-3">Máquina Destino / Fornecedor</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${cacheMovimentacoesAlmox.map(m => {
            const eq = cacheEquipamentos.find(e => String(e.id) === String(m.equipamento_id));
            const mapBadge = {
              ENTRADA_NF: `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-black text-[10px]">📥 ENTRADA NF</span>`,
              SAIDA_ESTOQUE: `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black text-[10px]">📤 SAÍDA ESTOQUE</span>`,
              SAIDA_DIRETA_NF_MAQUINA: `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px]">⚡ DIRETO NF ➔ MÁQUINA</span>`
            };

            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3 font-semibold text-slate-600">${new Date(m.registrado_em).toLocaleString('pt-BR')}</td>
                <td class="p-3">${mapBadge[m.tipo_movimento] || m.tipo_movimento}</td>
                <td class="p-3 font-bold">
                  <span class="text-slate-900">${m.id_interno_snapshot || '-'}</span>
                  ${m.numero_nf ? `<span class="text-blue-700 ml-1">(${m.numero_nf})</span>` : ''}
                </td>
                <td class="p-3 font-extrabold text-slate-800">
                  ${m.descricao_item}
                  ${m.codigo_nf_paralelo ? `<span class="text-[10px] text-slate-500 block">Cód. NF: ${m.codigo_nf_paralelo}</span>` : ''}
                </td>
                <td class="p-3 font-black text-slate-900">${m.quantidade}</td>
                <td class="p-3 font-bold">
                  ${eq ? `<span class="bg-amber-400 text-slate-950 px-2 py-0.5 rounded">${eq.tag}</span>` : (m.fornecedor || '-')}
                  ${m.observacao ? `<div class="text-[10px] text-slate-500 font-normal mt-0.5">${m.observacao}</div>` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportarInventarioAlmoxCSV() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const cab = ['NOSSO_CODIGO', 'DESCRICAO', 'CODIGOS_PARALELOS', 'ESTOCAVEL', 'SALDO_ATUAL', 'UNIDADE'];
  const linhas = cachePecas.map(p => [
    p.id_interno || '',
    (p.descricao || '').replace(/;/g, ','),
    (p.codigos_paralelos || []).join(' | '),
    p.estocavel !== false ? 'SIM' : 'NAO',
    String(p.quantidade || 0).replace('.', ','),
    p.unidade || 'UN'
  ].join(';'));

  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_ALMOXARIFADO_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
