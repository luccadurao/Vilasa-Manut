// ============================================================================
// VILASA CMMS V2 - MÓDULO 7: ESTOQUE.JS (100% CASADO COM AS COLUNAS LIMPAS)
// ============================================================================

let cacheMovimentacoesAlmox = [];
let abaVisualizacaoEstoque = 'catalogo'; // 'catalogo', 'edicao_rapida_lote', 'historico_nf_saidas'

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

function bateComBuscaPecaOuParalelo(peca, termoDigitado) {
  const termo = String(termoDigitado || '').trim().toUpperCase();
  if (!termo) return true;

  const idInterno = String(peca.id_interno || '').toUpperCase();
  const desc = String(peca.descricao || '').toUpperCase();
  const paralelos = Array.isArray(peca.codigos_paralelos) ? peca.codigos_paralelos.map(c => String(c).toUpperCase()) : [];

  return idInterno.includes(termo) || desc.includes(termo) || paralelos.some(p => p.includes(termo));
}

function renderizarPainelAlmoxarifado3Botoes() {
  const sec = document.getElementById('sec-estoque');
  if (!sec) return;

  const podeOperar = podeExecutarAcao('gerenciar_catalogo_estoque') || podeExecutarAcao('lancar_nf_entrada') || podeExecutarAcao('dar_baixa_estoque');
  const termo = (document.getElementById('buscaRapidaAlmoxInput')?.value || '').trim().toUpperCase();

  let listaPecas = [...cachePecas];
  if (typeof filtrarListaPorObraAtiva === 'function') listaPecas = filtrarListaPorObraAtiva(listaPecas);
  if (termo) listaPecas = listaPecas.filter(p => bateComBuscaPecaOuParalelo(p, termo));

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-xl">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ALMOXARIFADO CENTRAL & CONTROLE DE EQUIVALÊNCIAS</span>
            <h2 class="text-lg font-black">Gestão por Código Interno Mestre, Entrada de NF e Saída p/ Máquina</h2>
          </div>
          ${podeOperar ? `
            <button onclick="carregarEstoque('edicao_rapida_lote')" class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow">
              ⚡ Edição & Recadastro Rápido em Planilha na Tela
            </button>
          ` : ''}
        </div>

        ${podeOperar ? `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onclick="abrirModalBotao1CadastrarItem()"
              class="p-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-amber-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">1</div>
              <div>
                <div class="font-black text-sm uppercase">📦 Cadastrar Item Mestre</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Gera <strong>Nosso Código (VIL-XXXX)</strong> e atrela códigos paralelos.</p>
              </div>
            </button>

            <button onclick="abrirModalBotao2EntradaNF()"
              class="p-4 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-blue-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">2</div>
              <div>
                <div class="font-black text-sm uppercase">📥 Entrada de NF</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Soma saldo na prateleira e atualiza preço unitário.</p>
              </div>
            </button>

            <button onclick="abrirModalBotao3SaidaMaquina()"
              class="p-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-left transition shadow-lg flex items-start gap-3">
              <div class="bg-slate-950 text-emerald-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0">3</div>
              <div>
                <div class="font-black text-sm uppercase">📤 Saída para Máquina</div>
                <p class="text-[11px] font-semibold text-slate-900 mt-0.5">Baixa de prateleira OU <strong>Saída Direta de NF recém-chegada</strong>.</p>
              </div>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarEstoque('catalogo')" class="px-3.5 py-1.5 rounded-lg text-xs font-black ${abaVisualizacaoEstoque === 'catalogo' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🗂️ Catálogo Mestre & Saldos (${listaPecas.length})
          </button>
          ${podeOperar ? `
            <button onclick="carregarEstoque('edicao_rapida_lote')" class="px-3.5 py-1.5 rounded-lg text-xs font-black ${abaVisualizacaoEstoque === 'edicao_rapida_lote' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
              ⚡ Planilha de Edição Rápida
            </button>
          ` : ''}
          <button onclick="carregarEstoque('historico_nf_saidas')" class="px-3.5 py-1.5 rounded-lg text-xs font-black ${abaVisualizacaoEstoque === 'historico_nf_saidas' ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">
            🧾 Histórico de NFs & Saídas (${cacheMovimentacoesAlmox.length})
          </button>
        </div>

        <input id="buscaRapidaAlmoxInput" type="text" value="${termo}" oninput="renderizarPainelAlmoxarifado3Botoes()"
          placeholder="🔍 Buscar Nosso Código, Paralelo ou Descrição..."
          class="w-full sm:w-96 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold uppercase focus:outline-none focus:border-amber-500" />
      </div>

      ${abaVisualizacaoEstoque === 'catalogo' ? renderizarTabelaCatalogoComParalelos(listaPecas, podeOperar) : ''}
      ${abaVisualizacaoEstoque === 'edicao_rapida_lote' ? renderizarGradeRecadastroRapidoEmLote(listaPecas) : ''}
      ${abaVisualizacaoEstoque === 'historico_nf_saidas' ? renderizarTabelaMovimentacoesNFEsaidas() : ''}
    </div>
  `;
}

// GRADE ESTILO PLANILHA PARA RECADASTRO RÁPIDO EM LOTE
function renderizarGradeRecadastroRapidoEmLote(listaPecas) {
  return `
    <div class="bg-white p-5 rounded-2xl border-2 border-amber-500 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h3 class="text-sm font-black uppercase text-slate-900">⚡ Planilha de Recadastro Rápido & Correção de Saldos</h3>
          <p class="text-xs text-slate-500">Altere ou adicione quantas linhas quiser e clique em <strong>Salvar Todas as Linhas</strong>.</p>
        </div>
        <div class="flex gap-2">
          <button onclick="adicionarLinhaNovaNaGradeRapidaEstoque()" class="px-3 py-2 rounded-xl bg-slate-900 text-amber-400 font-black text-xs">
            + Nova Linha
          </button>
          <button onclick="salvarTodaGradeRapidaEstoque()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow">
            💾 Salvar Todas as Linhas
          </button>
        </div>
      </div>

      <div class="overflow-x-auto max-h-[500px]">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[10px]">
              <th class="p-2">Nosso Código</th>
              <th class="p-2">Descrição do Item</th>
              <th class="p-2">Códigos Paralelos (Separados por vírgula)</th>
              <th class="p-2">Saldo Atual</th>
              <th class="p-2">Est. Mín.</th>
              <th class="p-2">Unid.</th>
              <th class="p-2">Custo Unit. (R$)</th>
              <th class="p-2 text-center">X</th>
            </tr>
          </thead>
          <tbody id="tbodyGradeRapidaEstoque" class="divide-y divide-slate-200">
            ${listaPecas.map(p => `
              <tr class="linha-grade-rapida-est" data-id="${p.id}">
                <td class="p-1.5"><input type="text" value="${p.id_interno || ''}" class="gr-id-interno w-28 border rounded p-1.5 font-black uppercase bg-amber-50" /></td>
                <td class="p-1.5"><input type="text" value="${p.descricao || ''}" class="gr-desc w-full min-w-[200px] border rounded p-1.5 font-bold uppercase" /></td>
                <td class="p-1.5"><input type="text" value="${(p.codigos_paralelos || []).join(', ')}" class="gr-paralelos w-full min-w-[180px] border rounded p-1.5 font-semibold uppercase" /></td>
                <td class="p-1.5"><input type="number" step="0.1" value="${p.quantidade || 0}" class="gr-qtd w-20 border rounded p-1.5 font-black text-emerald-800" /></td>
                <td class="p-1.5"><input type="number" step="0.1" value="${p.estoque_minimo || 0}" class="gr-min w-20 border rounded p-1.5 font-bold" /></td>
                <td class="p-1.5"><input type="text" value="${p.unidade || 'UN'}" class="gr-un w-14 border rounded p-1.5 font-bold uppercase" /></td>
                <td class="p-1.5"><input type="number" step="0.01" value="${p.custo_unitario || 0}" class="gr-custo w-24 border rounded p-1.5 font-bold" /></td>
                <td class="p-1.5 text-center">
                  <button onclick="excluirItemAlmoxDireto('${p.id}', this)" class="text-rose-600 font-black px-2 py-1">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function adicionarLinhaNovaNaGradeRapidaEstoque() {
  const tbody = document.getElementById('tbodyGradeRapidaEstoque');
  if (!tbody) return;
  const codSug = `VIL-${String(tbody.querySelectorAll('tr').length + 1).padStart(4, '0')}`;
  const tr = document.createElement('tr');
  tr.className = 'linha-grade-rapida-est bg-emerald-50/40';
  tr.dataset.id = '';
  tr.innerHTML = `
    <td class="p-1.5"><input type="text" value="${codSug}" class="gr-id-interno w-28 border rounded p-1.5 font-black uppercase bg-amber-50" /></td>
    <td class="p-1.5"><input type="text" placeholder="DESCRIÇÃO DA PEÇA..." class="gr-desc w-full min-w-[200px] border rounded p-1.5 font-bold uppercase" /></td>
    <td class="p-1.5"><input type="text" placeholder="EX: 1R-1808, P551808" class="gr-paralelos w-full min-w-[180px] border rounded p-1.5 font-semibold uppercase" /></td>
    <td class="p-1.5"><input type="number" step="0.1" value="0" class="gr-qtd w-20 border rounded p-1.5 font-black text-emerald-800" /></td>
    <td class="p-1.5"><input type="number" step="0.1" value="0" class="gr-min w-20 border rounded p-1.5 font-bold" /></td>
    <td class="p-1.5"><input type="text" value="UN" class="gr-un w-14 border rounded p-1.5 font-bold uppercase" /></td>
    <td class="p-1.5"><input type="number" step="0.01" value="0" class="gr-custo w-24 border rounded p-1.5 font-bold" /></td>
    <td class="p-1.5 text-center"><button onclick="this.closest('tr').remove()" class="text-rose-600 font-black px-2">✖</button></td>
  `;
  tbody.prepend(tr);
}

async function salvarTodaGradeRapidaEstoque() {
  const linhas = Array.from(document.querySelectorAll('#tbodyGradeRapidaEstoque .linha-grade-rapida-est'));
  let salvos = 0;

  for (const tr of linhas) {
    const id = tr.dataset.id;
    const id_interno = tr.querySelector('.gr-id-interno')?.value.trim().toUpperCase();
    const descricao = tr.querySelector('.gr-desc')?.value.trim().toUpperCase();
    const rawPar = tr.querySelector('.gr-paralelos')?.value || '';
    const quantidade = parseFloat(tr.querySelector('.gr-qtd')?.value) || 0;
    const estoque_minimo = parseFloat(tr.querySelector('.gr-min')?.value) || 0;
    const unidade = tr.querySelector('.gr-un')?.value.trim().toUpperCase() || 'UN';
    const custo_unitario = parseFloat(tr.querySelector('.gr-custo')?.value) || 0;

    if (!descricao) continue;

    const codigos_paralelos = rawPar.split(/[,;|]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const payload = {
      id_interno: id_interno || gerarProximoNossoCodigoInterno(),
      descricao,
      codigos_paralelos,
      quantidade,
      estoque_minimo,
      unidade,
      custo_unitario,
      obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
    };

    if (id) await db.from('pecas_estoque').update(payload).eq('id', id);
    else await db.from('pecas_estoque').insert([payload]);
    salvos++;
  }

  alert(`✅ ${salvos} item(ns) salvos com sucesso!`);
  await carregarEstoque('catalogo');
}

async function excluirItemAlmoxDireto(id, btnEl) {
  if (!confirm('Confirma excluir este item do catálogo?')) return;
  await db.from('pecas_estoque').delete().eq('id', id);
  if (btnEl) btnEl.closest('tr')?.remove();
}

function renderizarTabelaCatalogoComParalelos(listaPecas, podeOperar) {
  if (listaPecas.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhum item encontrado. Use o Botão 1, a Planilha Rápida ou o Importador no Admin.</div>`;
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Nosso Código</th>
            <th class="p-3">Descrição do Material</th>
            <th class="p-3">Códigos Paralelos / Equivalentes</th>
            <th class="p-3">Saldo Atual</th>
            <th class="p-3">Custo Unit.</th>
            <th class="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${listaPecas.map(p => {
            const paralelos = Array.isArray(p.codigos_paralelos) ? p.codigos_paralelos : [];
            const abaixoMin = parseFloat(p.quantidade || 0) <= parseFloat(p.estoque_minimo || 0);

            return `
              <tr class="hover:bg-slate-50">
                <td class="p-3"><span class="bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded text-xs">${p.id_interno || 'VIL-S/N'}</span></td>
                <td class="p-3 font-extrabold text-slate-900">${p.descricao || '-'}</td>
                <td class="p-3">
                  <div class="flex flex-wrap gap-1">
                    ${paralelos.length > 0
                      ? paralelos.map(c => `<span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px]">${c}</span>`).join('')
                      : `<span class="text-slate-400 italic">Sem paralelo</span>`}
                  </div>
                </td>
                <td class="p-3 font-black text-sm ${abaixoMin ? 'text-rose-600' : 'text-emerald-700'}">${p.quantidade || 0} ${p.unidade || 'UN'}</td>
                <td class="p-3 font-bold text-slate-700">R$ ${Number(p.custo_unitario || 0).toFixed(2)}</td>
                <td class="p-3 text-right space-x-1 whitespace-nowrap">
                  ${podeOperar ? `
                    <button onclick="ajustarSaldoRapidoPeca('${p.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-black text-[11px]">✏️ Saldo/Preço</button>
                    <button onclick="adicionarNovoCodigoParaleloRapido('${p.id}')" class="px-2.5 py-1 rounded-lg bg-slate-900 text-amber-400 font-black text-[11px]">+ Paralelo</button>
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

async function ajustarSaldoRapidoPeca(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (!peca) return;
  const novoSaldo = parseFloat(prompt(`Saldo Atual para ${peca.id_interno} - ${peca.descricao}:`, peca.quantidade || 0));
  if (isNaN(novoSaldo)) return;
  const novoCusto = parseFloat(prompt(`Custo Unitário (R$):`, peca.custo_unitario || 0));

  await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', {
    quantidade: novoSaldo,
    custo_unitario: isNaN(novoCusto) ? (peca.custo_unitario || 0) : novoCusto
  }, pecaId);
  await carregarEstoque('catalogo');
}

async function adicionarNovoCodigoParaleloRapido(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (!peca) return;
  const novoCod = prompt(`Novo Código Paralelo para ${peca.id_interno} (${peca.descricao}):`);
  if (!novoCod?.trim()) return;

  const listaAtual = Array.isArray(peca.codigos_paralelos) ? [...peca.codigos_paralelos] : [];
  const limpo = novoCod.trim().toUpperCase();
  if (!listaAtual.includes(limpo)) listaAtual.push(limpo);

  await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', { codigos_paralelos: listaAtual }, pecaId);
  await carregarEstoque('catalogo');
}

// MODAIS DOS 3 BOTÕES (100% CASADOS COM AS COLUNAS ENXUTAS)
function abrirModalBotao1CadastrarItem() {
  const sugerido = gerarProximoNossoCodigoInterno();
  let modal = document.getElementById('modalAlmoxBotao1');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao1';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">📦 1. Cadastrar Item Mestre no Almoxarifado</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Nosso Código (SKU)</label>
            <input id="b1IdInterno" type="text" value="${sugerido}" class="w-full border-2 border-amber-400 bg-amber-50 rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Unidade</label>
            <input id="b1Unidade" type="text" value="UN" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição Técnica Padrão</label>
          <input id="b1Descricao" type="text" placeholder="Ex: FILTRO LUBRIFICANTE MOTOR CAT 320" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Códigos Paralelos / Equivalentes (Separe por vírgula)</label>
          <textarea id="b1Paralelos" rows="2" placeholder="Ex: 1R-1808, P551808, LF16015" class="w-full border rounded-lg p-2 font-bold uppercase"></textarea>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Saldo Inicial</label>
            <input id="b1SaldoInicial" type="number" step="0.1" value="0" class="w-full border rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Estoque Mín.</label>
            <input id="b1EstoqueMin" type="number" step="0.1" value="1" class="w-full border rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Custo Unit. (R$)</label>
            <input id="b1CustoUnit" type="number" step="0.01" value="0" class="w-full border rounded-lg p-2 font-bold" />
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao1').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao1CadastroItem()" class="px-5 py-2 rounded-lg bg-amber-500 text-slate-950 font-black text-xs">Salvar Item</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function salvarBotao1CadastroItem() {
  const id_interno = document.getElementById('b1IdInterno').value.trim().toUpperCase();
  const descricao = document.getElementById('b1Descricao').value.trim().toUpperCase();
  const rawParalelos = document.getElementById('b1Paralelos').value;
  if (!id_interno || !descricao) return alert('Informe o Nosso Código e a Descrição!');

  const codigos_paralelos = rawParalelos.split(/[,;\n|]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  await gravarDadosOfflineSafe('pecas_estoque', 'INSERT', {
    id_interno,
    descricao,
    codigos_paralelos,
    unidade: document.getElementById('b1Unidade').value.trim().toUpperCase() || 'UN',
    quantidade: parseFloat(document.getElementById('b1SaldoInicial').value) || 0,
    estoque_minimo: parseFloat(document.getElementById('b1EstoqueMin').value) || 0,
    custo_unitario: parseFloat(document.getElementById('b1CustoUnit').value) || 0,
    obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
  });

  document.getElementById('modalAlmoxBotao1')?.classList.add('hidden');
  await carregarEstoque('catalogo');
}

function abrirModalBotao2EntradaNF() {
  let modal = document.getElementById('modalAlmoxBotao2');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao2';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">📥 2. Entrada de Nota Fiscal no Almoxarifado</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <input id="b2NumeroNF" type="text" placeholder="Nº da Nota Fiscal (Ex: NF 4589)" class="border rounded-lg p-2 font-black uppercase" />
          <input id="b2Fornecedor" type="text" placeholder="Fornecedor" class="border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="bg-blue-50 p-3 rounded-xl border border-blue-200">
          <label class="block font-black uppercase text-blue-950 mb-1">🔗 Vincular ao Item do Catálogo (Soma Saldo):</label>
          <select id="b2PecaCadastradaId" onchange="preencherDadosPecaAoSelecionarNaNF(this.value)" class="w-full border rounded-lg p-2 font-bold bg-white">
            <option value="">-- Item Avulso (Sem vínculo com estoque) --</option>
            ${cachePecas.map(p => `<option value="${p.id}">${p.id_interno} - ${p.descricao} (${(p.codigos_paralelos || []).join(', ')})</option>`).join('')}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input id="b2CodigoNaNF" type="text" placeholder="Novo Código Paralelo na NF (Opcional)" class="border rounded-lg p-2 font-bold uppercase" />
          <input id="b2Descricao" type="text" placeholder="Descrição do Item..." class="border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input id="b2Quantidade" type="number" step="0.1" value="1" placeholder="Quantidade" class="border rounded-lg p-2 font-black" />
          <input id="b2ValorUnit" type="number" step="0.01" value="0.00" placeholder="Valor Unit. R$" class="border rounded-lg p-2 font-bold" />
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao2EntradaNF()" class="px-5 py-2 rounded-lg bg-blue-500 text-slate-950 font-black text-xs">Confirmar Entrada</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function preencherDadosPecaAoSelecionarNaNF(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (peca) document.getElementById('b2Descricao').value = peca.descricao || '';
}

async function salvarBotao2EntradaNF() {
  const numero_nf = document.getElementById('b2NumeroNF').value.trim().toUpperCase();
  const fornecedor = document.getElementById('b2Fornecedor').value.trim().toUpperCase();
  const pecaId = document.getElementById('b2PecaCadastradaId').value || null;
  const codigoNovo = document.getElementById('b2CodigoNaNF').value.trim().toUpperCase();
  const descricao_item = document.getElementById('b2Descricao').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('b2Quantidade').value) || 0;
  const valor_unitario = parseFloat(document.getElementById('b2ValorUnit').value) || 0;

  if (!numero_nf || !descricao_item || quantidade <= 0) return alert('Preencha Nº da NF, Descrição e Quantidade!');

  if (pecaId) {
    const peca = cachePecas.find(p => String(p.id) === String(pecaId));
    if (peca) {
      const paralelos = Array.isArray(peca.codigos_paralelos) ? [...peca.codigos_paralelos] : [];
      if (codigoNovo && !paralelos.includes(codigoNovo)) paralelos.push(codigoNovo);
      const novoSaldo = Number((parseFloat(peca.quantidade || 0) + quantidade).toFixed(2));

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
    descricao_item,
    quantidade,
    valor_unitario,
    observacao: codigoNovo ? `Cód. NF: ${codigoNovo}` : '',
    registrado_em: new Date().toISOString()
  });

  document.getElementById('modalAlmoxBotao2')?.classList.add('hidden');
  await carregarEstoque('catalogo');
}

function abrirModalBotao3SaidaMaquina() {
  let modal = document.getElementById('modalAlmoxBotao3');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalAlmoxBotao3';
    modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border">
      <h3 class="text-lg font-black text-slate-900 border-b pb-3 mb-4">📤 3. Saída de Material para Máquina</h3>
      <div class="space-y-3 text-xs">
        <select id="b3ModoSaida" onchange="alternarModoSaidaBotao3(this.value)" class="w-full border-2 border-emerald-500 bg-emerald-50 rounded-lg p-2.5 font-black">
          <option value="SAIDA_ESTOQUE">📦 1. Saída de Estoque (Baixa Saldo da Prateleira)</option>
          <option value="SAIDA_DIRETA_NF_MAQUINA">⚡ 2. NF Direto p/ Máquina (Sem passar pela prateleira)</option>
        </select>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Equipamento Destino</label>
          <select id="b3EquipamentoId" class="w-full border rounded-lg p-2 font-bold">
            <option value="">-- Selecione a Máquina --</option>
            ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
        </div>

        <div id="blocoB3SelectCatalogo">
          <label class="block font-black uppercase text-slate-700 mb-1">Item do Catálogo</label>
          <select id="b3PecaId" onchange="preencherDescSaidaBotao3(this.value)" class="w-full border rounded-lg p-2 font-bold">
            <option value="">-- Selecione pelo Nosso Código ou Descrição --</option>
            ${cachePecas.map(p => `<option value="${p.id}">${p.id_interno} - ${p.descricao} (Saldo: ${p.quantidade})</option>`).join('')}
          </select>
        </div>

        <div id="blocoB3DadosNFDireta" class="hidden bg-amber-50 p-3 rounded-xl border border-amber-300 grid grid-cols-3 gap-2">
          <input id="b3NumeroNFDireta" type="text" placeholder="Nº da NF" class="border rounded-lg p-2 font-black uppercase bg-white" />
          <input id="b3FornecedorDireta" type="text" placeholder="Fornecedor" class="border rounded-lg p-2 font-bold uppercase bg-white" />
          <input id="b3ValorUnitDireta" type="number" step="0.01" placeholder="Valor Unit. R$" class="border rounded-lg p-2 font-bold bg-white" />
        </div>

        <div class="grid grid-cols-3 gap-2">
          <input id="b3DescricaoItem" type="text" placeholder="Descrição do Material..." class="col-span-2 border rounded-lg p-2 font-bold uppercase" />
          <input id="b3Quantidade" type="number" step="0.1" value="1" class="border rounded-lg p-2 font-black" />
        </div>
        <input id="b3Observacao" type="text" placeholder="Retirado por / Observação..." class="w-full border rounded-lg p-2 font-semibold" />
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalAlmoxBotao3').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarBotao3SaidaMaquina()" class="px-5 py-2 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs">Confirmar Saída</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  const selEq = document.getElementById('b3EquipamentoId');
  if (selEq && typeof ativarBuscaPorPrefixoEmSelect === 'function') ativarBuscaPorPrefixoEmSelect(selEq);
}

function alternarModoSaidaBotao3(modo) {
  document.getElementById('blocoB3DadosNFDireta')?.classList.toggle('hidden', modo !== 'SAIDA_DIRETA_NF_MAQUINA');
}

function preencherDescSaidaBotao3(pecaId) {
  const peca = cachePecas.find(p => String(p.id) === String(pecaId));
  if (peca) document.getElementById('b3DescricaoItem').value = peca.descricao || '';
}

async function salvarBotao3SaidaMaquina() {
  const modo = document.getElementById('b3ModoSaida').value;
  const equipId = document.getElementById('b3EquipamentoId').value;
  const pecaId = document.getElementById('b3PecaId').value || null;
  const descricao_item = document.getElementById('b3DescricaoItem').value.trim().toUpperCase();
  const quantidade = parseFloat(document.getElementById('b3Quantidade').value) || 0;
  const observacao = document.getElementById('b3Observacao').value.trim();

  if (!equipId || !descricao_item || quantidade <= 0) return alert('Selecione a Máquina, Descrição e Quantidade!');

  let numero_nf = '';
  let fornecedor = '';
  let valor_unitario = 0;

  if (modo === 'SAIDA_ESTOQUE') {
    if (!pecaId) return alert('Selecione o item do estoque!');
    const peca = cachePecas.find(p => String(p.id) === String(pecaId));
    if (!peca) return;
    if (parseFloat(peca.quantidade || 0) < quantidade) return alert(`Saldo insuficiente! Disponível: ${peca.quantidade}`);
    valor_unitario = parseFloat(peca.custo_unitario || 0);
    await gravarDadosOfflineSafe('pecas_estoque', 'UPDATE', {
      quantidade: Number((parseFloat(peca.quantidade || 0) - quantidade).toFixed(2))
    }, pecaId);
  } else {
    numero_nf = document.getElementById('b3NumeroNFDireta').value.trim().toUpperCase();
    fornecedor = document.getElementById('b3FornecedorDireta').value.trim().toUpperCase();
    valor_unitario = parseFloat(document.getElementById('b3ValorUnitDireta').value) || 0;
    if (!numero_nf) return alert('Informe o Nº da NF!');
  }

  await gravarDadosOfflineSafe('movimentacoes_almoxarifado', 'INSERT', {
    obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null,
    tipo_movimento: modo,
    numero_nf,
    fornecedor,
    peca_id: pecaId,
    descricao_item,
    quantidade,
    valor_unitario,
    equipamento_id: equipId,
    observacao,
    registrado_em: new Date().toISOString()
  });

  document.getElementById('modalAlmoxBotao3')?.classList.add('hidden');
  await carregarEstoque('historico_nf_saidas');
}

function renderizarTabelaMovimentacoesNFEsaidas() {
  if (cacheMovimentacoesAlmox.length === 0) {
    return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhuma movimentação registrada.</div>`;
  }
  return `
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
            <th class="p-3">Data/Hora</th>
            <th class="p-3">Operação</th>
            <th class="p-3">Nº NF</th>
            <th class="p-3">Material</th>
            <th class="p-3">Qtd</th>
            <th class="p-3">Valor Unit.</th>
            <th class="p-3">Máquina / Fornecedor</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${cacheMovimentacoesAlmox.map(m => {
            const eq = cacheEquipamentos.find(e => String(e.id) === String(m.equipamento_id));
            return `
              <tr>
                <td class="p-3 font-semibold text-slate-600">${new Date(m.registrado_em).toLocaleString('pt-BR')}</td>
                <td class="p-3 font-black">${m.tipo_movimento}</td>
                <td class="p-3 font-bold">${m.numero_nf || '-'}</td>
                <td class="p-3 font-extrabold">${m.descricao_item}</td>
                <td class="p-3 font-black">${m.quantidade}</td>
                <td class="p-3 font-bold">R$ ${Number(m.valor_unitario || 0).toFixed(2)}</td>
                <td class="p-3 font-bold">${eq ? eq.tag : (m.fornecedor || '-')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportarInventarioAlmoxCSV() {
  const cab = ['NOSSO_CODIGO', 'DESCRICAO', 'CODIGOS_PARALELOS', 'SALDO_ATUAL', 'UNIDADE', 'CUSTO_UNITARIO', 'ESTOQUE_MINIMO'];
  const linhas = cachePecas.map(p => [
    p.id_interno || '', (p.descricao || '').replace(/;/g, ','), (p.codigos_paralelos || []).join(' | '),
    String(p.quantidade || 0).replace('.', ','), p.unidade || 'UN',
    String(p.custo_unitario || 0).replace('.', ','), String(p.estoque_minimo || 0).replace('.', ',')
  ].join(';'));

  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_ALMOXARIFADO_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
