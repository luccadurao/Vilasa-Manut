// ============================================================================
// DIESEL — estoque dos tanques, abastecimentos, consumo e conciliação dos
// dados já gravados (planilha × CTA). A carga desses dados é feita fora do
// sistema, direto na base.
// Regras: CTA prevalece sobre a planilha (a planilha só vale antes do primeiro dia de CTA).
// Linhas de transferência (tanque -> comboio) não são consumo. Linhas marcadas
// como suspeitas ficam fora dos totais até alguém aceitar.
// ============================================================================

let dieselAba = 'estoque';
let dieselTanques = [];
let dieselMapaEquip = new Map();         // id -> {tag, nome, unidade_medida}
let dieselUltimaTabela = { cab: [], linhas: [] };

function dieselFmtL(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function dieselFmt1(n) { return n === null || n === undefined || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
function dieselFmtData(d) { return d ? d.split('-').reverse().join('/') : ''; }
function dieselEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- acesso a dados
async function dieselLerPaginado(tabela, aplicar, ordem = 'data', select = '*') {
  const todos = []; const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = db.from(tabela).select(select);
    if (aplicar) q = aplicar(q);
    const { data, error } = await q.order(ordem, { ascending: true }).range(de, de + passo - 1);
    if (error) throw error;
    todos.push(...data);
    if (data.length < passo) break;
  }
  return todos;
}
async function dieselCarregarBase() {
  const [t, eq] = await Promise.all([
    db.from('diesel_tanques').select('*').order('codigo'),
    dieselMapaEquip.size ? Promise.resolve(null) : buscarTudoSemLimite('equipamentos', 'tag', true, 'id, tag, nome, unidade_medida')
  ]);
  dieselTanques = t.data || [];
  if (eq) eq.forEach(e => dieselMapaEquip.set(e.id, e));
}
function dieselPeriodo() {
  const hoje = new Date().toISOString().slice(0, 10);
  const ini = document.getElementById('dieselDe')?.value || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const fim = document.getElementById('dieselAte')?.value || hoje;
  return { ini, fim };
}
async function dieselPrimeiroDiaCTA() {
  const { data } = await db.from('diesel_abastecimentos').select('data').eq('fonte', 'cta').order('data', { ascending: true }).limit(1);
  return data?.[0]?.data || '9999-12-31';
}

// ---------------------------------------------------------------- tela
async function carregarDiesel() {
  const sec = document.getElementById('sec-diesel');
  if (!sec) return;
  if (!sec.dataset.montado) {
    const { ini, fim } = (() => { const h = new Date().toISOString().slice(0, 10); return { ini: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), fim: h }; })();
    sec.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-3 mb-3 flex flex-wrap items-center gap-2">
        <div id="dieselAbas" class="flex flex-wrap gap-1"></div>
        <div class="ml-auto flex items-center gap-2 text-xs font-bold text-slate-600">
          <span>De</span><input id="dieselDe" type="date" value="${ini}" class="border border-slate-200 rounded-lg px-2 py-1" onchange="renderizarDiesel()">
          <span>até</span><input id="dieselAte" type="date" value="${fim}" class="border border-slate-200 rounded-lg px-2 py-1" onchange="renderizarDiesel()">
        </div>
      </div>
      <div id="dieselCorpo"></div>`;
    sec.dataset.montado = '1';
  }
  try { await dieselCarregarBase(); } catch (e) { document.getElementById('dieselCorpo').innerHTML = `<p class="text-sm text-red-600">Sem conexão para carregar o diesel: ${dieselEsc(e.message || e)}</p>`; return; }
  renderizarDiesel();
}
function dieselTrocarAba(a) { dieselAba = a; renderizarDiesel(); }
async function renderizarDiesel() {
  const abas = [['estoque', 'Estoque dos tanques'], ['consumo', 'Consumo por equipamento'], ['abastecimentos', 'Abastecimentos'], ['conciliacao', 'Conciliação']];
  document.getElementById('dieselAbas').innerHTML = abas.map(([k, n]) =>
    `<button onclick="dieselTrocarAba('${k}')" class="px-3 py-1.5 rounded-lg text-xs font-bold ${dieselAba === k ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${n}</button>`).join('');
  const corpo = document.getElementById('dieselCorpo');
  corpo.innerHTML = '<p class="text-xs text-slate-500 p-3">Carregando…</p>';
  try {
    if (dieselAba === 'estoque') await dieselRenderEstoque(corpo);
    else if (dieselAba === 'consumo') await dieselRenderConsumo(corpo);
    else if (dieselAba === 'abastecimentos') await dieselRenderAbastecimentos(corpo);
    else if (dieselAba === 'conciliacao') await dieselRenderConciliacao(corpo);
    else { dieselAba = 'estoque'; await dieselRenderEstoque(corpo); }
  } catch (e) {
    corpo.innerHTML = `<p class="text-sm text-red-600 p-3">Erro: ${dieselEsc(e.message || e)}</p>`;
  }
}
function dieselTabela(cab, linhas, vazio = 'Nada no período.') {
  dieselUltimaTabela = { cab, linhas };
  if (!linhas.length) return `<p class="text-xs text-slate-500 p-3">${vazio}</p>`;
  return `<div class="overflow-x-auto bg-white rounded-2xl border border-slate-200"><table class="w-full text-xs">
    <thead class="bg-slate-50 text-slate-600"><tr>${cab.map(c => `<th class="text-left px-3 py-2 font-black whitespace-nowrap">${dieselEsc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr class="border-t border-slate-100">${l.map(v => `<td class="px-3 py-1.5 whitespace-nowrap">${v ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---- Estoque
async function dieselRenderEstoque(corpo) {
  const { ini, fim } = dieselPeriodo();
  const [estq, carr] = await Promise.all([
    dieselLerPaginado('diesel_estoque_diario', q => q.lte('data', fim).gte('data', ini)),
    dieselLerPaginado('diesel_carregamentos', q => q.lte('data', fim).gte('data', ini))
  ]);
  const cards = dieselTanques.filter(t => t.ativo).map(t => {
    const dias = estq.filter(e => e.tanque_id === t.id);
    const u = dias[dias.length - 1];
    const compras = carr.filter(c => c.tanque_id === t.id && c.fonte === 'cta');
    const litrosNF = compras.reduce((s, c) => s + Number(c.litros), 0), custo = compras.reduce((s, c) => s + Number(c.custo_total || 0), 0);
    const soma = k => dias.reduce((s, e) => s + Number(e[k] || 0), 0);
    // Mesma conta do relatório diário do CTA: inicial + carregamentos (compras e recebido de tanque) - transferências enviadas - abastecido.
    const inicial = dias.length ? Number(dias[0].estoque_inicial || 0) : 0;
    const entradas = soma('carregamentos'), transf = soma('transferencias'), abast = soma('abastecido'), disp = soma('dispersao');
    const conta = inicial + entradas - transf - abast;
    const dif = u ? Number(u.final_fisico || 0) - conta : 0;
    return `<div class="bg-white rounded-2xl border border-slate-200 p-4">
      <p class="text-sm font-black text-slate-800">${dieselEsc(t.codigo)}</p><p class="text-[11px] text-slate-500">${t.tipo === 'COMBOIO' ? 'Comboio' : 'Tanque fixo'}${u ? ' • posição de ' + dieselFmtData(u.data) : ''}</p>
      <p class="mt-2 text-2xl font-black text-slate-900">${u ? dieselFmtL(u.final_fisico) : '—'} <span class="text-xs font-bold text-slate-500">L físico</span></p>
      <p class="text-[11px] text-slate-500">Teórico ${u ? dieselFmtL(u.final_teorico) : '—'} L</p>
      <div class="mt-2 text-[11px] space-y-0.5">
        <div class="flex justify-between"><span class="text-slate-500">Estoque no início do período</span><b>${dieselFmtL(inicial)} L</b></div>
        <div class="flex justify-between"><span class="text-slate-500">+ Entradas (compras${t.tipo === 'COMBOIO' ? ' e recebido dos tanques' : ''})</span><b>${dieselFmtL(entradas)} L</b></div>
        <div class="flex justify-between"><span class="text-slate-500">− Transferidos para comboios</span><b>${dieselFmtL(transf)} L</b></div>
        <div class="flex justify-between"><span class="text-slate-500">− Abastecido em equipamentos</span><b>${dieselFmtL(abast)} L</b></div>
        <div class="flex justify-between border-t border-slate-100 pt-0.5"><span class="text-slate-500">= Estoque calculado</span><b>${dieselFmtL(conta)} L</b></div>
        <div class="flex justify-between"><span class="text-slate-500">Dispersão (físico × teórico)</span><b class="${Math.abs(disp) > Math.max(100, abast * 0.01) ? 'text-red-600' : ''}">${dieselFmtL(disp)} L</b></div>
        ${Math.abs(dif) > 50 ? `<p class="text-amber-700">Diferença de ${dieselFmtL(dif)} L entre o calculado e o físico: ${dias.length && dias[0].data > ini ? 'o relatório do tanque começa só em ' + dieselFmtData(dias[0].data) : 'confira o relatório do CTA'}.</p>` : ''}
      </div>
      ${litrosNF ? `<p class="mt-1 text-[11px] text-slate-500">Compras com NF no período: ${dieselFmtL(litrosNF)} L • R$ ${dieselFmt1(custo)} • R$ ${dieselFmt1(custo / litrosNF)}/L</p>` : ''}
    </div>`;
  }).join('');
  const linhas = estq.slice().reverse().slice(0, 120).map(e => [
    dieselFmtData(e.data), dieselEsc(dieselTanques.find(t => t.id === e.tanque_id)?.codigo || ''),
    dieselFmtL(e.estoque_inicial), dieselFmtL(e.carregamentos), dieselFmtL(e.transferencias), dieselFmtL(e.abastecido),
    dieselFmtL(e.final_teorico), dieselFmtL(e.final_fisico), dieselFmtL(e.dispersao)]);
  const vazio = estq.length ? '' : '<p class="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mb-3">Sem relatório diário de tanque no período.</p>';
  corpo.innerHTML = `${vazio}<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">${cards}</div>` +
    dieselTabela(['Data', 'Tanque', 'Inicial', 'Carregamentos', 'Transferências', 'Abastecido', 'Final teórico', 'Final físico', 'Dispersão'], linhas, 'Sem dias no período.');
}

// ---- dados efetivos de abastecimento (CTA prevalece; sem transferência; sem suspeito)
async function dieselAbastEfetivos() {
  const { ini, fim } = dieselPeriodo();
  const [linhas, ctaIni] = await Promise.all([
    dieselLerPaginado('diesel_abastecimentos', q => q.gte('data', ini).lte('data', fim), 'data'),
    dieselPrimeiroDiaCTA()
  ]);
  return { todos: linhas, efetivos: linhas.filter(r => !r.suspeito && !r.transferencia && (r.fonte === 'cta' || r.data < ctaIni)), ctaIni };
}

// ---- Consumo
async function dieselRenderConsumo(corpo) {
  const { efetivos } = await dieselAbastEfetivos();
  const porEq = new Map();
  for (const r of efetivos) {
    if (!r.equipamento_id) continue;
    if (!porEq.has(r.equipamento_id)) porEq.set(r.equipamento_id, []);
    porEq.get(r.equipamento_id).push(r);
  }
  const linhas = [];
  for (const [id, regs] of porEq) {
    regs.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    const e = dieselMapaEquip.get(id) || {};
    const litros = regs.reduce((s, r) => s + Number(r.litros), 0);
    const rod = (campo) => {
      const l = regs.filter(r => r[campo] > 0);
      if (l.length < 2) return null;
      const delta = l[l.length - 1][campo] - l[0][campo];
      if (delta <= 0) return null;
      const lit = l.slice(1).reduce((s, r) => s + Number(r.litros), 0); // tanque cheio: litros do abastecimento i cobrem o uso desde i-1
      return { delta, lit };
    };
    const h = rod('horimetro'), k = rod('odometro');
    const lh = h ? h.lit / h.delta : null, kml = k && k.lit > 0 ? k.delta / k.lit : null;
    linhas.push({ litros, row: [dieselEsc(e.tag || '?'), dieselEsc(e.nome || ''), regs.length, dieselFmtL(litros),
      h ? dieselFmt1(h.delta) + ' h' : '', lh ? dieselFmt1(lh) : '', k ? dieselFmt1(k.delta) + ' km' : '', kml ? dieselFmt1(kml) : ''] });
  }
  linhas.sort((a, b) => b.litros - a.litros);
  corpo.innerHTML = '<p class="text-[11px] text-slate-500 mb-2">Consumo calculado entre a primeira e a última leitura do período (tanque cheio). Equipamento sem leitura mostra só os litros.</p>' +
    dieselTabela(['Equipamento', 'Nome', 'Abast.', 'Litros', 'Horas', 'L/h', 'Km', 'km/L'], linhas.map(l => l.row), 'Sem abastecimentos vinculados no período.');
}

// ---- Abastecimentos
async function dieselRenderAbastecimentos(corpo) {
  const { todos } = await dieselAbastEfetivos();
  const filtro = (document.getElementById('dieselBusca')?.value || '').toUpperCase();
  const lista = todos.filter(r => !filtro || (r.frota_texto || '').toUpperCase().includes(filtro) || (dieselMapaEquip.get(r.equipamento_id)?.tag || '').toUpperCase().includes(filtro))
    .slice().reverse().slice(0, 400);
  const pode = typeof podeExecutarAcao === 'function' && podeExecutarAcao('gerenciar_diesel');
  const linhas = lista.map(r => [
    dieselFmtData(r.data), r.fonte.toUpperCase(), dieselEsc(dieselTanques.find(t => t.id === r.tanque_id)?.codigo || ''),
    dieselEsc(r.frota_texto), r.equipamento_id ? dieselEsc(dieselMapaEquip.get(r.equipamento_id)?.tag || '') : '<span class="text-amber-600">sem vínculo</span>',
    dieselFmtL(r.litros), r.horimetro ?? '', r.odometro ?? '',
    r.transferencia ? '<span class="text-slate-500">transferência</span>' : '',
    r.suspeito ? `<span class="text-red-600 font-bold">${dieselEsc(r.motivo_suspeito)}</span>${pode ? ` <button class="underline text-[11px]" onclick="dieselAceitar('${r.id}')">aceitar</button>` : ''}` : '']);
  const aviso = todos.length > 400 ? `<p class="text-[11px] text-slate-500 mb-2">Mostrando os 400 mais recentes do período.</p>` : '';
  const acoes = pode ? `<div class="mb-2 flex flex-wrap items-center gap-2">
      <button type="button" onclick="dieselVincular()" class="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold hover:bg-slate-200">Vincular frotas aos equipamentos</button>
      <button type="button" onclick="dieselSincronizarLeituras()" class="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold hover:bg-slate-200">Enviar leituras do CTA para a Frota</button>
      <span id="dieselMsgAcoes" class="text-xs text-slate-600"></span>
    </div>` : '';
  corpo.innerHTML = `${acoes}<input id="dieselBusca" value="${dieselEsc(filtro)}" oninput="clearTimeout(window._dB);window._dB=setTimeout(renderizarDiesel,400)" placeholder="Filtrar por frota ou prefixo" class="border border-slate-200 rounded-lg px-3 py-1.5 text-xs mb-2 w-64">${aviso}` +
    dieselTabela(['Data', 'Fonte', 'Tanque', 'Frota (origem)', 'Equipamento', 'Litros', 'Horím.', 'Odôm.', 'Tipo', 'Alerta'], linhas);
  const el = document.getElementById('dieselBusca'); if (el && filtro) { el.focus(); el.setSelectionRange(filtro.length, filtro.length); }
}
async function dieselAceitar(id) {
  if (!podeExecutarAcao('gerenciar_diesel', true)) return;
  if (!confirm('Aceitar este abastecimento como válido? Ele passa a contar nos totais.')) return;
  const { error } = await db.from('diesel_abastecimentos').update({ suspeito: false, motivo_suspeito: null }).eq('id', id);
  if (error) return alert('Não foi possível aceitar: ' + error.message);
  renderizarDiesel();
}

// ---- Conciliação planilha × CTA
async function dieselRenderConciliacao(corpo) {
  const { ini, fim } = dieselPeriodo();
  const [ab, ca] = await Promise.all([
    dieselLerPaginado('diesel_abastecimentos', q => q.gte('data', ini).lte('data', fim), 'data'),
    dieselLerPaginado('diesel_carregamentos', q => q.gte('data', ini).lte('data', fim), 'data')
  ]);
  const soma = (arr, f) => arr.filter(f).reduce((s, r) => s + Number(r.litros), 0);
  const pct = (a, b) => (b ? ((a - b) / b * 100) : null);
  const linhas = [];
  for (const t of dieselTanques) {
    const a = ab.filter(r => r.tanque_id === t.id), c = ca.filter(r => r.tanque_id === t.id);
    const cta = soma(a, r => r.fonte === 'cta' && !r.transferencia && !r.suspeito);
    const pla = soma(a, r => r.fonte === 'planilha' && !r.transferencia && !r.suspeito);
    const plaSusp = soma(a, r => r.fonte === 'planilha' && !r.transferencia && r.suspeito);
    const ctaTr = soma(a, r => r.fonte === 'cta' && r.transferencia && !r.suspeito);
    const plaTr = soma(a, r => r.fonte === 'planilha' && r.transferencia && !r.suspeito);
    const nSusp = a.filter(r => r.suspeito).length;
    const eCta = soma(c, r => r.fonte === 'cta'), ePla = soma(c, r => r.fonte === 'planilha');
    const d = pct(pla, cta);
    linhas.push([dieselEsc(t.codigo), dieselFmtL(cta), dieselFmtL(pla),
      `<span class="${d !== null && Math.abs(d) > 3 ? 'text-red-600 font-bold' : ''}">${d === null ? '—' : dieselFmt1(d) + '%'}</span>`,
      dieselFmtL(ctaTr), dieselFmtL(plaTr), dieselFmtL(eCta), dieselFmtL(ePla),
      nSusp ? `<span class="text-red-600 font-bold">${nSusp} linha(s) • ${dieselFmtL(plaSusp)} L</span>` : '']);
  }
  const semVinculo = new Map();
  ab.filter(r => !r.equipamento_id && !r.transferencia).forEach(r => {
    const k = r.chave_tag || '(vazio)'; const o = semVinculo.get(k) || { txt: r.frota_texto, litros: 0, n: 0 };
    o.litros += Number(r.litros); o.n++; semVinculo.set(k, o);
  });
  const sv = [...semVinculo.values()].sort((x, y) => y.litros - x.litros).slice(0, 25).map(o => [dieselEsc(o.txt), o.n, dieselFmtL(o.litros)]);
  const principal = dieselTabela(['Tanque', 'CTA (L)', 'Planilha (L)', 'Diferença', 'Transf. CTA', 'Transf. planilha', 'Entradas CTA', 'Entradas planilha', 'Suspeitas na planilha/CTA'], linhas);
  const cabP = dieselUltimaTabela;
  corpo.innerHTML = `<p class="text-[11px] text-slate-500 mb-2">Saídas para equipamentos (sem transferências e sem linhas suspeitas). Onde há divergência, vale o CTA.</p>${principal}
    <h3 class="text-xs font-black text-slate-700 mt-4 mb-2">Frotas sem vínculo com o cadastro (maiores litragens)</h3>
    ${dieselTabela(['Como veio na fonte', 'Abast.', 'Litros'], sv, 'Todas as frotas do período estão vinculadas.')}`;
  dieselUltimaTabela = cabP;
}

async function dieselVincular() {
  if (!podeExecutarAcao('gerenciar_diesel', true)) return;
  const { data, error } = await db.rpc('diesel_vincular_equipamentos');
  const msg = document.getElementById('dieselMsgAcoes');
  if (msg) msg.innerText = error ? 'Erro: ' + error.message : `${data} abastecimento(s) vinculados.`;
}
async function dieselSincronizarLeituras() {
  if (!podeExecutarAcao('gerenciar_diesel', true)) return;
  if (!confirm('Enviar as leituras de horímetro/odômetro do CTA para o histórico da Frota? Só entram as que passam nas regras de salto; as demais servem só para o consumo.')) return;
  const { data, error } = await db.rpc('diesel_sincronizar_leituras');
  const msg = document.getElementById('dieselMsgAcoes');
  if (msg) msg.innerText = error ? 'Erro: ' + error.message
    : `${data.aceitas} leitura(s) entraram na Frota; ${data.recusadas_so_consumo} recusadas pelas regras (usadas só no consumo); ${data.ja_existiam} já existiam.`;
}

// Exportação (usa o botão de relatórios do cabeçalho)
function exportarRelatorioDieselCSV() {
  const { cab, linhas } = dieselUltimaTabela;
  if (!linhas.length) return alert('Nada para exportar nesta tela.');
  const limpar = v => String(v ?? '').replace(/<[^>]*>/g, '').replace(/"/g, '""');
  const csv = [cab, ...linhas].map(l => l.map(v => `"${limpar(v)}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `diesel_${dieselAba}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
