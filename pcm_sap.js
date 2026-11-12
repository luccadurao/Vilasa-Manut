// ============================================================================
// VILASA CMMS - PREVENTIVAS ESTILO SAP PM
//  Estratégia (intervalo base H/KM + pacotes por múltiplo) → Lista de tarefas/peças
//  → Plano por equipamento (contador + histórico) → Chamada: gera OS preventiva no horizonte.
//  Cadastros (estratégia/lista/plano) são feitos pelo PCM com internet; a execução (OS + checklist)
//  roda offline pela fila normal de OS.
// ============================================================================

let cachePlanosPreventiva = [];
let cacheExecucoesPreventiva = [];
let cacheEstrategiasPrev = [];
let cachePacotesPrev = [];
let cacheListasPrev = [];
let cacheTarefasPrev = [];
let cacheMateriaisPrev = [];
let cachePecasPrev = [];
let subAbaPreventivaAtual = 'painel'; // painel | estrategias | listas | historico

// ---------- regras (espelham o banco: app.pacote_do_ciclo) ----------
function pacoteDoCicloPrev(estrategiaId, ciclo) {
  const pks = cachePacotesPrev.filter(p => p.estrategia_id === estrategiaId && ciclo % p.multiplo === 0);
  return pks.sort((a, b) => b.multiplo - a.multiplo)[0] || null;
}

function calcularStatusPlanoPreventiva(plano, equipamento) {
  const est = cacheEstrategiasPrev.find(s => s.id === plano.estrategia_id);
  const un = est?.unidade || (String(equipamento?.unidade_medida || 'H').toUpperCase() === 'KM' ? 'KM' : 'H');
  const horAtual = parseFloat(equipamento?.horimetro_atual || 0);
  const horUltimo = parseFloat(plano?.ultimo_horimetro_execucao || 0);
  const base = parseFloat(est?.intervalo_base || 0);
  const horizonte = parseFloat(est?.horizonte ?? 0);
  const proximo = est ? pacoteDoCicloPrev(est.id, (plano.ciclo_atual || 0) + 1) : null;

  let ritmo = un === 'KM' ? 150 : 8;
  if (plano?.ultima_data_execucao && horAtual > horUltimo) {
    const dias = Math.max(1, (new Date() - new Date(plano.ultima_data_execucao + 'T08:00:00')) / 86400000);
    const calc = (horAtual - horUltimo) / dias;
    if (calc >= 0.5) ritmo = Number(calc.toFixed(1));
  }
  const alvo = horUltimo + base;
  const saldo = Number((alvo - horAtual).toFixed(1));
  const diasRestantes = Math.ceil(saldo / ritmo);
  const dataPrevista = new Date();
  dataPrevista.setDate(dataPrevista.getDate() + Math.max(0, diasRestantes));

  let faixa = 'no_prazo';
  if (!est) faixa = 'sem_estrategia';
  else if (saldo <= 0) faixa = 'vencida';
  else if (saldo <= horizonte) faixa = 'atencao';
  return { un, horAtual, horUltimo, alvo, saldo, ritmo, dataPrevista, faixa, proximoPacote: proximo?.nome || '-', horizonte };
}

// ---------- carga ----------
async function carregarPreventivas(subAba = subAbaPreventivaAtual) {
  subAbaPreventivaAtual = subAba;
  const ler = (t, f) => lerDadosComFallbackOffline(t, f);
  const [planos, execs, equips, ests, pks, listas, tarefas, mats, pecas] = await Promise.all([
    ler('planos_preventiva', () => db.from('planos_preventiva').select('*')),
    ler('execucoes_preventiva', () => db.from('execucoes_preventiva').select('*').order('data_conclusao', { ascending: false, nullsFirst: false })),
    (typeof cacheEquipamentos !== 'undefined' && cacheEquipamentos.length > 0)
      ? Promise.resolve({ data: cacheEquipamentos })
      : ler('equipamentos', () => db.from('equipamentos').select('*').order('tag')),
    ler('preventiva_estrategias', () => db.from('preventiva_estrategias').select('*').order('codigo')),
    ler('preventiva_pacotes', () => db.from('preventiva_pacotes').select('*').order('multiplo')),
    ler('preventiva_listas', () => db.from('preventiva_listas').select('*').order('codigo')),
    ler('preventiva_lista_tarefas', () => db.from('preventiva_lista_tarefas').select('*').order('ordem')),
    ler('preventiva_lista_materiais', () => db.from('preventiva_lista_materiais').select('*')),
    ler('pecas_estoque', () => db.from('pecas_estoque').select('id, id_interno, descricao, unidade').order('descricao'))
  ]);
  cachePlanosPreventiva = planos.data || [];
  cacheExecucoesPreventiva = execs.data || [];
  cacheEquipamentos = equips.data || [];
  cacheEstrategiasPrev = ests.data || [];
  cachePacotesPrev = pks.data || [];
  cacheListasPrev = listas.data || [];
  cacheTarefasPrev = tarefas.data || [];
  cacheMateriaisPrev = mats.data || [];
  cachePecasPrev = pecas.data || [];
  renderizarInterfaceCompletaPCM();
}

function _somenteOnlinePCM() {
  if (!podeExecutarAcao('gerenciar_preventivas', true)) return false;
  if (!navigator.onLine) { alert('Este cadastro exige internet (somente PCM).'); return false; }
  return true;
}

// ---------- tela ----------
function renderizarInterfaceCompletaPCM() {
  const sec = document.getElementById('sec-preventivas');
  if (!sec) return;
  const podeEditar = podeExecutarAcao('gerenciar_preventivas');

  let planos = cachePlanosPreventiva.filter(p => p.ativo !== false).map(pl => ({
    ...pl, equipamento: cacheEquipamentos.find(e => String(e.id) === String(pl.equipamento_id))
  })).filter(pl => pl.equipamento);
  if (typeof filtrarListaPorObraAtiva === 'function') planos = filtrarListaPorObraAtiva(planos);
  const termo = (document.getElementById('filtroPrefixoPCM')?.value || '').trim().toUpperCase();
  if (termo) planos = planos.filter(pl => bateComPrefixoEquipamento(pl.equipamento.tag || '', termo));

  let venc = 0, aten = 0, ok = 0, sem = 0;
  const calculados = planos.map(pl => {
    const calc = calcularStatusPlanoPreventiva(pl, pl.equipamento);
    if (calc.faixa === 'vencida') venc++; else if (calc.faixa === 'atencao') aten++; else if (calc.faixa === 'sem_estrategia') sem++; else ok++;
    return { ...pl, calc };
  }).sort((a, b) => a.calc.saldo - b.calc.saldo);

  const aba = (id, rot) => `<button onclick="carregarPreventivas('${id}')" class="px-3 py-1.5 rounded-lg text-xs font-black ${subAbaPreventivaAtual === id ? 'bg-slate-900 text-amber-400' : 'bg-slate-100 text-slate-700'}">${rot}</button>`;
  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div><span class="text-[10px] font-black uppercase tracking-widest text-amber-400">ENGENHARIA DE MANUTENÇÃO • ESTILO SAP PM</span>
          <h2 class="text-lg font-black">Preventivas: Estratégias, Planos e Chamadas</h2></div>
        ${podeEditar ? `<div class="flex flex-wrap gap-2">
          <button onclick="gerarOSPreventivasAgora()" class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow">⚙️ Gerar OS no horizonte</button>
          <button onclick="abrirModalPlanoPreventiva()" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow">+ Plano / Histórico</button></div>` : ''}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-rose-50 border border-rose-200 p-3 rounded-xl"><span class="text-[11px] font-black uppercase text-rose-700">🔴 Vencidas</span><p class="text-2xl font-black text-rose-900">${venc}</p></div>
        <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl"><span class="text-[11px] font-black uppercase text-amber-800">🟡 No horizonte</span><p class="text-2xl font-black text-amber-900">${aten}</p></div>
        <div class="bg-emerald-50 border border-emerald-200 p-3 rounded-xl"><span class="text-[11px] font-black uppercase text-emerald-800">🟢 No prazo</span><p class="text-2xl font-black text-emerald-900">${ok}</p></div>
        <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl"><span class="text-[11px] font-black uppercase text-slate-600">Sem estratégia</span><p class="text-2xl font-black text-slate-800">${sem}</p></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
        <div class="flex flex-wrap gap-1.5">
          ${aba('painel', `📅 Programação (${calculados.length})`)}${aba('estrategias', `🧩 Estratégias (${cacheEstrategiasPrev.length})`)}
          ${aba('listas', `📋 Listas de Tarefas (${cacheListasPrev.length})`)}${aba('historico', `📜 Histórico (${cacheExecucoesPreventiva.length})`)}
        </div>
        <input id="filtroPrefixoPCM" type="text" value="${esc(termo)}" oninput="renderizarInterfaceCompletaPCM()" placeholder="🔍 Filtrar Prefixo..." class="px-3 py-1.5 rounded-lg border text-xs font-bold uppercase" />
      </div>
      <div>
        ${subAbaPreventivaAtual === 'painel' ? renderizarTabelaProjecaoPCM(calculados, podeEditar) : ''}
        ${subAbaPreventivaAtual === 'estrategias' ? renderizarEstrategiasPrev(podeEditar) : ''}
        ${subAbaPreventivaAtual === 'listas' ? renderizarListasPrev(podeEditar) : ''}
        ${subAbaPreventivaAtual === 'historico' ? renderizarTabelaHistoricoProprioPreventivas(termo) : ''}
      </div>
    </div>`;
}

function renderizarTabelaProjecaoPCM(calculados, podeEditar) {
  if (!calculados.length) return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhum plano cadastrado. Crie uma estratégia e depois o plano do equipamento.</div>`;
  return `<div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm"><table class="w-full text-left border-collapse text-xs">
    <thead><tr class="bg-slate-900 text-amber-400 uppercase text-[11px]"><th class="p-3">Equipamento</th><th class="p-3">Última</th><th class="p-3">Contador atual</th><th class="p-3">Próxima chamada</th><th class="p-3">Saldo</th><th class="p-3">Previsão</th><th class="p-3 text-right">Ações</th></tr></thead>
    <tbody class="divide-y divide-slate-200">${calculados.map(p => {
      const c = p.calc, un = c.un;
      const est = cacheEstrategiasPrev.find(s => s.id === p.estrategia_id);
      const osAberta = p.os_aberta_id ? (typeof cacheOrdens !== 'undefined' ? cacheOrdens.find(o => o.id === p.os_aberta_id) : null) : null;
      const badge = c.faixa === 'sem_estrategia' ? `<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-black">SEM ESTRATÉGIA</span>`
        : c.faixa === 'vencida' ? `<span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black">${c.saldo} ${un} (VENCIDA)</span>`
        : c.faixa === 'atencao' ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black">Faltam ${c.saldo} ${un}</span>`
        : `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Faltam ${c.saldo} ${un}</span>`;
      const dtU = p.ultima_data_execucao ? new Date(p.ultima_data_execucao + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
      return `<tr class="hover:bg-slate-50">
        <td class="p-3"><span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded">${esc(p.equipamento.tag)}</span><div class="font-bold text-slate-600 mt-0.5">${esc(p.equipamento.nome || '')}</div><div class="text-[10px] text-slate-400">${esc(est?.nome || '')}</div></td>
        <td class="p-3 font-semibold"><strong>${esc(p.ultimo_pacote_executado || '-')}</strong> aos <strong>${c.horUltimo} ${un}</strong><div class="text-[11px] text-slate-500">${dtU}</div></td>
        <td class="p-3 font-black">${c.horAtual} ${un}</td>
        <td class="p-3"><span class="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-black">${esc(c.proximoPacote)}</span><div class="text-[11px] text-slate-500 mt-0.5">Alvo: ${c.alvo} ${un}</div></td>
        <td class="p-3">${badge}${p.os_aberta_id ? `<div class="text-[10px] font-black text-blue-700 mt-1">OS ${osAberta ? '#' + osAberta.numero_os : ''} ABERTA</div>` : ''}</td>
        <td class="p-3 font-bold">${c.dataPrevista.toLocaleDateString('pt-BR')}<div class="text-[10px] text-slate-400">Ritmo: ${c.ritmo} ${un}/dia</div></td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">${podeEditar ? `
          ${!p.os_aberta_id && p.estrategia_id ? `<button onclick="gerarOSPreventivaDoPlano('${p.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-black text-[11px]">⚙️ Gerar OS</button>` : ''}
          <button onclick="abrirModalPlanoPreventiva('${p.equipamento_id}')" class="px-2 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px]">📜 Plano/Histórico</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---------- geração de OS (servidor) ----------
async function gerarOSPreventivasAgora() {
  if (!_somenteOnlinePCM()) return;
  const { data, error } = await db.rpc('preventiva_gerar_os', {});
  if (error) return alert('Erro ao gerar: ' + error.message);
  alert(`${data?.geradas || 0} OS preventiva(s) gerada(s).`);
  await carregarPreventivas();
  if (typeof carregarOrdensServico === 'function') carregarOrdensServico();
}
async function gerarOSPreventivaDoPlano(planoId) {
  if (!_somenteOnlinePCM()) return;
  const { data, error } = await db.rpc('preventiva_gerar_os', { p_plano: planoId });
  if (error) return alert('Erro ao gerar: ' + error.message);
  alert(data?.geradas ? 'OS preventiva gerada.' : 'Nada a gerar (já existe OS aberta para este ciclo).');
  await carregarPreventivas();
}

// ---------- modal genérico ----------
function _modalPrev(id, html, largo) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div'); m.id = id;
    m.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-start justify-center p-4 overflow-y-auto';
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="bg-white rounded-2xl p-5 w-full ${largo ? 'max-w-3xl' : 'max-w-md'} space-y-3 my-6">${html}</div>`;
  m.classList.remove('hidden');
}
function _fecharPrev(id) { document.getElementById(id)?.classList.add('hidden'); }
const _inp = 'mt-1 w-full border rounded-lg p-2 text-sm font-bold';

// ---------- ESTRATÉGIAS ----------
function renderizarEstrategiasPrev(podeEditar) {
  return `<div class="space-y-3">
    ${podeEditar ? `<button onclick="abrirModalEstrategiaPrev()" class="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">+ Nova Estratégia</button>` : ''}
    ${cacheEstrategiasPrev.length === 0 ? `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhuma estratégia. Defina o intervalo (horas ou km) e os pacotes.</div>` : ''}
    ${cacheEstrategiasPrev.map(s => {
      const pks = cachePacotesPrev.filter(p => p.estrategia_id === s.id).sort((a, b) => a.multiplo - b.multiplo);
      const usados = cachePlanosPreventiva.filter(p => p.estrategia_id === s.id && p.ativo !== false).length;
      return `<div class="bg-white rounded-xl border p-4 shadow-sm">
        <div class="flex flex-wrap justify-between gap-2"><div><span class="font-black">${esc(s.codigo)}</span> — <span class="font-bold">${esc(s.nome)}</span>
          <div class="text-xs text-slate-600">Base ${s.intervalo_base} ${s.unidade} • abre OS faltando ${s.horizonte} ${s.unidade} • ${usados} equipamento(s)${s.ativa ? '' : ' • INATIVA'}</div></div>
          ${podeEditar ? `<button onclick="abrirModalEstrategiaPrev('${s.id}')" class="px-3 py-1.5 rounded-lg bg-slate-200 text-xs font-black">✏️ Editar</button>` : ''}</div>
        <div class="flex flex-wrap gap-1.5 mt-2">${pks.map(p => {
          const l = cacheListasPrev.find(x => x.id === p.lista_id);
          return `<span class="px-2 py-1 rounded bg-blue-100 text-blue-900 text-[11px] font-black">${esc(p.nome)} (×${p.multiplo} = ${p.multiplo * s.intervalo_base} ${s.unidade})${l ? ' • ' + esc(l.codigo) : ''}${p.acumulativo ? ' ⊕' : ''}</span>`;
        }).join('') || '<span class="text-xs text-slate-500">Sem pacotes</span>'}</div></div>`;
    }).join('')}</div>`;
}

function abrirModalEstrategiaPrev(id = '') {
  if (!_somenteOnlinePCM()) return;
  const s = cacheEstrategiasPrev.find(x => x.id === id) || { unidade: 'H', horizonte: 50, ativa: true };
  const pks = cachePacotesPrev.filter(p => p.estrategia_id === id).sort((a, b) => a.multiplo - b.multiplo);
  _modalPrev('modalEstrategiaPrev', `
    <h3 class="font-black">🧩 ${id ? 'Editar' : 'Nova'} Estratégia</h3>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-xs font-black">Código<input id="esCod" value="${esc(s.codigo || '')}" class="${_inp} uppercase" /></label>
      <label class="text-xs font-black">Nome<input id="esNome" value="${esc(s.nome || '')}" class="${_inp}" /></label>
      <label class="text-xs font-black">Medidor<select id="esUn" class="${_inp}"><option value="H" ${s.unidade === 'H' ? 'selected' : ''}>Horas</option><option value="KM" ${s.unidade === 'KM' ? 'selected' : ''}>KM</option></select></label>
      <label class="text-xs font-black">Intervalo base<input id="esBase" type="number" min="1" value="${s.intervalo_base || ''}" class="${_inp}" /></label>
      <label class="text-xs font-black">Horizonte (abrir OS faltando)<input id="esHor" type="number" min="0" value="${s.horizonte}" class="${_inp}" /></label>
      <label class="text-xs font-black">Situação<select id="esAtiva" class="${_inp}"><option value="1" ${s.ativa ? 'selected' : ''}>Ativa</option><option value="0" ${!s.ativa ? 'selected' : ''}>Inativa</option></select></label>
    </div>
    <div class="text-xs font-black">Pacotes (múltiplos do intervalo base — ex.: ×1 = 250H, ×2 = 500H, ×4 = 1000H)</div>
    <div id="esPacotes" class="space-y-1.5"></div>
    <button onclick="addLinhaPacotePrev()" class="px-3 py-1.5 rounded-lg bg-slate-200 text-xs font-black">+ Pacote</button>
    <div class="flex justify-end gap-2 pt-2"><button onclick="_fecharPrev('modalEstrategiaPrev')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="salvarEstrategiaPrev('${id}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Salvar</button></div>`, true);
  (pks.length ? pks : [{ multiplo: 1, nome: '', acumulativo: true }]).forEach(p => addLinhaPacotePrev(p));
}

function addLinhaPacotePrev(p = { multiplo: '', nome: '', acumulativo: true }) {
  const div = document.createElement('div');
  div.className = 'linha-pacote-prev grid grid-cols-12 gap-1.5 items-center';
  div.innerHTML = `<input type="number" min="1" placeholder="×" value="${p.multiplo || ''}" class="pk-mult col-span-2 border rounded p-1.5 text-sm font-bold" />
    <input placeholder="Nome (ex.: 500H)" value="${esc(p.nome || '')}" class="pk-nome col-span-3 border rounded p-1.5 text-sm font-bold uppercase" />
    <select class="pk-lista col-span-4 border rounded p-1.5 text-sm font-bold"><option value="">(sem lista)</option>${cacheListasPrev.map(l => `<option value="${l.id}" ${l.id === p.lista_id ? 'selected' : ''}>${esc(l.codigo)} — ${esc(l.nome)}</option>`).join('')}</select>
    <label class="col-span-2 text-[10px] font-black"><input type="checkbox" class="pk-acum" ${p.acumulativo !== false ? 'checked' : ''} /> inclui menores</label>
    <button onclick="this.parentElement.remove()" class="col-span-1 text-rose-600 font-black">✕</button>`;
  document.getElementById('esPacotes').appendChild(div);
}

async function salvarEstrategiaPrev(id) {
  if (!_somenteOnlinePCM()) return;
  const v = x => document.getElementById(x).value.trim();
  const base = parseFloat(v('esBase'));
  if (!v('esCod') || !v('esNome') || !(base > 0)) return alert('Informe código, nome e intervalo base.');
  const pacotes = [...document.querySelectorAll('.linha-pacote-prev')].map(l => ({
    multiplo: parseInt(l.querySelector('.pk-mult').value, 10), nome: l.querySelector('.pk-nome').value.trim().toUpperCase(),
    lista_id: l.querySelector('.pk-lista').value || null, acumulativo: l.querySelector('.pk-acum').checked
  })).filter(p => p.multiplo > 0 && p.nome);
  if (!pacotes.length) return alert('Inclua ao menos um pacote.');
  if (new Set(pacotes.map(p => p.multiplo)).size !== pacotes.length) return alert('Há múltiplos repetidos nos pacotes.');
  if (!pacotes.some(p => p.multiplo === 1)) return alert('Inclua o pacote ×1 (o ciclo base), senão alguns ciclos ficam sem pacote.');
  const corpo = { codigo: v('esCod').toUpperCase(), nome: v('esNome'), unidade: v('esUn'), intervalo_base: base, horizonte: parseFloat(v('esHor')) || 0, ativa: v('esAtiva') === '1' };
  let estId = id;
  if (id) {
    const r = await db.from('preventiva_estrategias').update(corpo).eq('id', id);
    if (r.error) return alert('Erro: ' + r.error.message);
    await db.from('planos_preventiva').update({ intervalo_base: base }).eq('estrategia_id', id);
    const d = await db.from('preventiva_pacotes').delete().eq('estrategia_id', id);
    if (d.error) return alert('Erro: ' + d.error.message);
  } else {
    const r = await db.from('preventiva_estrategias').insert(corpo).select('id').single();
    if (r.error) return alert('Erro: ' + r.error.message);
    estId = r.data.id;
  }
  const rp = await db.from('preventiva_pacotes').insert(pacotes.map(p => ({ ...p, estrategia_id: estId })));
  if (rp.error) return alert('Erro nos pacotes: ' + rp.error.message);
  _fecharPrev('modalEstrategiaPrev');
  await carregarPreventivas('estrategias');
}

// ---------- LISTAS DE TAREFAS / PEÇAS ----------
function renderizarListasPrev(podeEditar) {
  return `<div class="space-y-3">
    ${podeEditar ? `<button onclick="abrirModalListaPrev()" class="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">+ Nova Lista</button>` : ''}
    ${cacheListasPrev.map(l => {
      const t = cacheTarefasPrev.filter(x => x.lista_id === l.id), m = cacheMateriaisPrev.filter(x => x.lista_id === l.id);
      return `<div class="bg-white rounded-xl border p-4 shadow-sm flex flex-wrap justify-between gap-2">
        <div><span class="font-black">${esc(l.codigo)}</span> — <span class="font-bold">${esc(l.nome)}</span>
          <div class="text-xs text-slate-600">${t.length} tarefa(s) • ${m.length} peça(s) prevista(s) • local padrão: ${esc(l.local_padrao)}</div></div>
        ${podeEditar ? `<button onclick="abrirModalListaPrev('${l.id}')" class="px-3 py-1.5 rounded-lg bg-slate-200 text-xs font-black">✏️ Editar</button>` : ''}</div>`;
    }).join('') || `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhuma lista cadastrada.</div>`}</div>`;
}

function abrirModalListaPrev(id = '') {
  if (!_somenteOnlinePCM()) return;
  const l = cacheListasPrev.find(x => x.id === id) || { local_padrao: 'OFICINA' };
  const tarefas = cacheTarefasPrev.filter(x => x.lista_id === id).sort((a, b) => a.ordem - b.ordem).map(x => x.descricao).join('\n');
  _modalPrev('modalListaPrev', `
    <h3 class="font-black">📋 ${id ? 'Editar' : 'Nova'} Lista de Tarefas</h3>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-xs font-black">Código<input id="liCod" value="${esc(l.codigo || '')}" class="${_inp} uppercase" /></label>
      <label class="text-xs font-black">Nome<input id="liNome" value="${esc(l.nome || '')}" class="${_inp}" /></label>
      <label class="text-xs font-black">Local padrão<select id="liLocal" class="${_inp}">${['OFICINA', 'TRECHO', 'TERCEIRO'].map(x => `<option ${x === l.local_padrao ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <label class="block text-xs font-black">Tarefas (uma por linha)<textarea id="liTarefas" rows="8" class="${_inp}">${esc(tarefas)}</textarea></label>
    <div class="text-xs font-black">Peças previstas</div><div id="liMats" class="space-y-1.5"></div>
    <button onclick="addLinhaMaterialPrev()" class="px-3 py-1.5 rounded-lg bg-slate-200 text-xs font-black">+ Peça</button>
    <div class="flex justify-end gap-2 pt-2"><button onclick="_fecharPrev('modalListaPrev')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="salvarListaPrev('${id}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Salvar</button></div>`, true);
  cacheMateriaisPrev.filter(x => x.lista_id === id).forEach(m => addLinhaMaterialPrev(m));
}

function addLinhaMaterialPrev(m = {}) {
  const div = document.createElement('div');
  div.className = 'linha-mat-prev grid grid-cols-12 gap-1.5 items-center';
  div.innerHTML = `<select class="mt-peca col-span-8 border rounded p-1.5 text-sm font-bold"><option value="">Selecione a peça</option>${cachePecasPrev.map(p => `<option value="${p.id}" ${p.id === m.peca_id ? 'selected' : ''}>${esc((p.id_interno ? p.id_interno + ' — ' : '') + p.descricao)}</option>`).join('')}</select>
    <input type="number" min="0.01" step="any" placeholder="Qtd" value="${m.quantidade || ''}" class="mt-qtd col-span-3 border rounded p-1.5 text-sm font-bold" />
    <button onclick="this.parentElement.remove()" class="col-span-1 text-rose-600 font-black">✕</button>`;
  document.getElementById('liMats').appendChild(div);
}

async function salvarListaPrev(id) {
  if (!_somenteOnlinePCM()) return;
  const v = x => document.getElementById(x).value.trim();
  if (!v('liCod') || !v('liNome')) return alert('Informe código e nome.');
  const tarefas = v('liTarefas').split('\n').map(s => s.trim()).filter(Boolean);
  const mats = {};
  document.querySelectorAll('.linha-mat-prev').forEach(l => {
    const pid = l.querySelector('.mt-peca').value, q = parseFloat(l.querySelector('.mt-qtd').value);
    if (pid && q > 0) mats[pid] = (mats[pid] || 0) + q;
  });
  const corpo = { codigo: v('liCod').toUpperCase(), nome: v('liNome'), local_padrao: v('liLocal') };
  let lid = id;
  if (id) {
    const r = await db.from('preventiva_listas').update(corpo).eq('id', id);
    if (r.error) return alert('Erro: ' + r.error.message);
    await db.from('preventiva_lista_tarefas').delete().eq('lista_id', id);
    await db.from('preventiva_lista_materiais').delete().eq('lista_id', id);
  } else {
    const r = await db.from('preventiva_listas').insert(corpo).select('id').single();
    if (r.error) return alert('Erro: ' + r.error.message);
    lid = r.data.id;
  }
  if (tarefas.length) {
    const r = await db.from('preventiva_lista_tarefas').insert(tarefas.map((descricao, i) => ({ lista_id: lid, ordem: i, descricao })));
    if (r.error) return alert('Erro nas tarefas: ' + r.error.message);
  }
  const linhasMat = Object.entries(mats).map(([peca_id, quantidade]) => ({ lista_id: lid, peca_id, quantidade }));
  if (linhasMat.length) {
    const r = await db.from('preventiva_lista_materiais').insert(linhasMat);
    if (r.error) return alert('Erro nas peças: ' + r.error.message);
  }
  _fecharPrev('modalListaPrev');
  await carregarPreventivas('listas');
}

// ---------- PLANO + HISTÓRICO REAL (pacote, data, contador) ----------
function abrirModalPlanoPreventiva(equipId = '') {
  if (!_somenteOnlinePCM()) return;
  if (!cacheEstrategiasPrev.some(s => s.ativa)) {
    alert('Ainda não há estratégia cadastrada. Crie primeiro a estratégia (intervalo e pacotes) na aba 🧩 Estratégias; depois volte aqui para criar o plano.');
    return carregarPreventivas('estrategias');
  }
  const plano = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(equipId) && p.ativo !== false);
  const comPlano = new Set(cachePlanosPreventiva.filter(p => p.ativo !== false).map(p => String(p.equipamento_id)));
  const equips = cacheEquipamentos.filter(e => e.situacao_ciclo === 'ativo' && (String(e.id) === String(equipId) || !comPlano.has(String(e.id))));
  _modalPrev('modalPlanoPrev', `
    <h3 class="font-black">📜 Plano e Histórico de Preventivas</h3>
    <div class="grid grid-cols-2 gap-2">
      <label class="text-xs font-black">Equipamento<select id="plEq" onchange="trocarEquipPlanoPrev()" class="${_inp}" ${equipId ? 'disabled' : ''}><option value="">Selecione</option>${equips.map(e => `<option value="${e.id}" ${String(e.id) === String(equipId) ? 'selected' : ''}>${esc(e.tag)} — ${esc(e.nome || '')}</option>`).join('')}</select></label>
      <label class="text-xs font-black">Estratégia<select id="plEst" onchange="atualizarProximoPacotePlanoPrev()" class="${_inp}"><option value="">${cacheEstrategiasPrev.some(s => s.ativa) ? 'Selecione' : '(nenhuma estratégia cadastrada)'}</option>${cacheEstrategiasPrev.filter(s => s.ativa || s.id === plano?.estrategia_id).map(s => `<option value="${s.id}" ${s.id === plano?.estrategia_id ? 'selected' : ''}>${esc(s.codigo)} — ${esc(s.nome)} (${s.intervalo_base} ${s.unidade})</option>`).join('')}</select></label>
      <label class="text-xs font-black col-span-2">Próximo pacote a executar<select id="plProx" class="${_inp}"></select></label>
    </div>
    <div class="text-xs font-black">Histórico real já executado (pacote, data e leitura da máquina)</div>
    <div id="plHist" class="space-y-1.5"></div>
    <button onclick="addLinhaHistoricoPrev()" class="px-3 py-1.5 rounded-lg bg-slate-200 text-xs font-black">+ Preventiva realizada</button>
    <div class="flex justify-end gap-2 pt-2"><button onclick="_fecharPrev('modalPlanoPrev')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="salvarPlanoPrev()" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Salvar</button></div>`, true);
  atualizarProximoPacotePlanoPrev(plano);
  if (equipId) mostrarHistoricoExistentePrev(equipId);
}

function trocarEquipPlanoPrev() { /* novo plano: sem histórico anterior */ }

function atualizarProximoPacotePlanoPrev(plano) {
  const estId = document.getElementById('plEst').value;
  const sel = document.getElementById('plProx');
  const pks = cachePacotesPrev.filter(p => p.estrategia_id === estId).sort((a, b) => a.multiplo - b.multiplo);
  const atual = plano && plano.id ? pacoteDoCicloPrev(plano.estrategia_id, (plano.ciclo_atual || 0) + 1) : null;
  sel.innerHTML = pks.map(p => `<option value="${p.multiplo}" ${atual && p.id === atual.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('') || '<option value="">(escolha a estratégia)</option>';
  // atualiza os pacotes das linhas de histórico ainda não gravadas
  document.querySelectorAll('.linha-hist-prev:not([data-existente]) .hp-pacote').forEach(selP => {
    const anterior = selP.value;
    selP.innerHTML = pks.map(p => `<option ${p.nome === anterior ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  });
}

function addLinhaHistoricoPrev(h = {}, somenteLeitura = false) {
  if (!somenteLeitura && !document.getElementById('plEst').value) return alert('Escolha a estratégia primeiro: os pacotes do histórico vêm dela.');
  const div = document.createElement('div');
  div.className = 'linha-hist-prev grid grid-cols-12 gap-1.5 items-center';
  const estId = document.getElementById('plEst').value;
  const opts = cachePacotesPrev.filter(p => p.estrategia_id === estId).sort((a, b) => a.multiplo - b.multiplo)
    .map(p => `<option ${p.nome === h.pacote ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  const dt = h.data_conclusao ? String(h.data_conclusao).slice(0, 10) : '';
  div.innerHTML = `<select class="hp-pacote col-span-4 border rounded p-1.5 text-sm font-bold" ${somenteLeitura ? 'disabled' : ''}>${opts}</select>
    <input type="date" value="${dt}" class="hp-data col-span-4 border rounded p-1.5 text-sm font-bold" ${somenteLeitura ? 'disabled' : ''} />
    <input type="number" step="any" min="0" placeholder="Leitura (H/KM)" value="${h.horimetro_execucao ?? ''}" class="hp-leitura col-span-3 border rounded p-1.5 text-sm font-bold" ${somenteLeitura ? 'disabled' : ''} />
    ${somenteLeitura ? '' : '<button onclick="this.parentElement.remove()" class="col-span-1 text-rose-600 font-black">✕</button>'}`;
  if (somenteLeitura) div.dataset.existente = '1';
  document.getElementById('plHist').appendChild(div);
}

function mostrarHistoricoExistentePrev(equipId) {
  cacheExecucoesPreventiva.filter(h => String(h.equipamento_id) === String(equipId))
    .sort((a, b) => new Date(a.data_conclusao || a.data_entrada) - new Date(b.data_conclusao || b.data_entrada))
    .forEach(h => addLinhaHistoricoPrev(h, true));
}

async function salvarPlanoPrev() {
  if (!_somenteOnlinePCM()) return;
  const equipId = document.getElementById('plEq').value, estId = document.getElementById('plEst').value;
  const mult = parseInt(document.getElementById('plProx').value, 10);
  if (!equipId || !estId || !(mult > 0)) return alert('Selecione equipamento, estratégia e o próximo pacote.');
  const novas = [...document.querySelectorAll('.linha-hist-prev')].filter(l => !l.dataset.existente).map(l => ({
    pacote: l.querySelector('.hp-pacote').value, data: l.querySelector('.hp-data').value, leitura: parseFloat(l.querySelector('.hp-leitura').value)
  }));
  if (novas.some(n => !n.pacote || !n.data || isNaN(n.leitura) || n.leitura < 0)) return alert('Preencha pacote, data e leitura em todas as linhas do histórico.');

  const existentes = cacheExecucoesPreventiva.filter(h => String(h.equipamento_id) === String(equipId));
  const todos = [...existentes.map(h => ({ data: String(h.data_conclusao || h.data_entrada).slice(0, 10), leitura: Number(h.horimetro_execucao), pacote: h.pacote })), ...novas];
  const ultimo = todos.sort((a, b) => a.leitura - b.leitura || a.data.localeCompare(b.data)).pop();

  const corpo = {
    equipamento_id: equipId, estrategia_id: estId, ativo: true, ciclo_atual: mult - 1, intervalo_base: cacheEstrategiasPrev.find(s => s.id === estId)?.intervalo_base || 0,
    ultimo_horimetro_execucao: ultimo ? ultimo.leitura : (cacheEquipamentos.find(e => String(e.id) === String(equipId))?.horimetro_atual || 0),
    ultima_data_execucao: ultimo ? ultimo.data : null, ultimo_pacote_executado: ultimo ? ultimo.pacote : null
  };
  const plano = cachePlanosPreventiva.find(p => String(p.equipamento_id) === String(equipId) && p.ativo !== false);
  let planoId = plano?.id;
  if (planoId) {
    const r = await db.from('planos_preventiva').update(corpo).eq('id', planoId);
    if (r.error) return alert('Erro: ' + r.error.message);
  } else {
    const r = await db.from('planos_preventiva').insert(corpo).select('id').single();
    if (r.error) return alert('Erro: ' + r.error.message);
    planoId = r.data.id;
  }
  if (novas.length) {
    const r = await db.from('execucoes_preventiva').insert(novas.map(n => ({
      plano_id: planoId, equipamento_id: equipId, pacote: n.pacote, status: 'concluida', parada_obrigatoria: true,
      data_entrada: n.data + 'T08:00:00', data_conclusao: n.data + 'T17:00:00', horimetro_execucao: n.leitura,
      observacoes: 'Histórico lançado pelo PCM', origem: 'historico'
    })));
    if (r.error) return alert('Erro no histórico: ' + r.error.message);
  }
  _fecharPrev('modalPlanoPrev');
  await carregarPreventivas('painel');
}

// ---------- histórico + CSV ----------
function renderizarTabelaHistoricoProprioPreventivas(termoBusca = '') {
  let lista = cacheExecucoesPreventiva.map(ex => ({ ...ex, equipamento: cacheEquipamentos.find(e => String(e.id) === String(ex.equipamento_id)) }));
  if (typeof filtrarListaPorObraAtiva === 'function') lista = filtrarListaPorObraAtiva(lista);
  if (termoBusca) lista = lista.filter(i => bateComPrefixoEquipamento(i.equipamento?.tag || '', termoBusca));
  if (!lista.length) return `<div class="bg-white p-6 rounded-xl border text-center text-slate-500 font-bold">Nenhum registro encontrado.</div>`;
  return `<div class="space-y-2"><button onclick="exportarHistoricoProprioPreventivasCSV()" class="px-3 py-1.5 rounded-lg bg-slate-800 text-amber-300 text-xs font-black">⬇️ CSV</button>
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm"><table class="w-full text-left border-collapse text-xs">
    <thead><tr class="bg-slate-900 text-amber-400 uppercase text-[11px]"><th class="p-3">Data</th><th class="p-3">Prefixo</th><th class="p-3">Equipamento</th><th class="p-3">Pacote</th><th class="p-3">Leitura</th><th class="p-3">Origem / Obs</th></tr></thead>
    <tbody class="divide-y divide-slate-200">${lista.map(h => {
      const dt = h.data_conclusao || h.data_entrada;
      return `<tr><td class="p-3 font-bold">${dt ? new Date(dt).toLocaleDateString('pt-BR') : '-'}</td><td class="p-3 font-black text-amber-700">${esc(h.equipamento?.tag || '-')}</td><td class="p-3 font-semibold">${esc(h.equipamento?.nome || '-')}</td><td class="p-3 font-black text-blue-900">${esc(h.pacote || '')}</td><td class="p-3 font-black">${esc(String(h.horimetro_execucao ?? ''))}</td><td class="p-3">${h.origem === 'historico' ? '📝 histórico ' : '🔧 OS '}${esc(h.mecanicos_nomes || '')} ${esc(h.observacoes || '')}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
}

function exportarHistoricoProprioPreventivasCSV() {
  const cab = ['DATA_EXECUCAO', 'PREFIXO', 'EQUIPAMENTO', 'PACOTE_PREVENTIVA', 'LEITURA', 'STATUS', 'EQUIPE', 'OBSERVACOES'];
  const linhas = cacheExecucoesPreventiva.map(h => {
    const eq = cacheEquipamentos.find(e => String(e.id) === String(h.equipamento_id));
    const dt = h.data_conclusao || h.data_entrada;
    return [dt ? new Date(dt).toLocaleDateString('pt-BR') : '', eq?.tag || '', (eq?.nome || '').replace(/;/g, ','), h.pacote || '',
      String(h.horimetro_execucao || 0).replace('.', ','), h.status || '', (h.mecanicos_nomes || '').replace(/;/g, ','), (h.observacoes || '').replace(/;/g, ',')].map(csvCelula).join(';');
  });
  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_PREVENTIVAS_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
