// ============================================================================
// DIESEL — estoque dos tanques, abastecimentos, consumo e conciliação planilha × CTA.
// Regras: CTA prevalece sobre a planilha (a planilha só vale antes do primeiro dia de CTA).
// Linhas de transferência (tanque -> comboio) não são consumo. Linhas com valores
// implausíveis entram como "suspeitas" e ficam fora dos totais até alguém aceitar.
// ============================================================================

const DIESEL_LIMITE_LITROS = 3000;       // abastecimento de equipamento
const DIESEL_LIMITE_TRANSF = 30000;      // transferência tanque -> comboio
let dieselAba = 'estoque';
let dieselTanques = [];
let dieselMapaEquip = new Map();         // id -> {tag, nome, unidade_medida}
let dieselPendente = null;               // importação aguardando confirmação
let dieselUltimaTabela = { cab: [], linhas: [] };

// ---------------------------------------------------------------- utilitários
function dieselChaveTag(t) {
  return String(t ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/([A-Z])0+(\d)/g, '$1$2');
}
// Planilha tem sufixos soltos ("CB-AL-0439 JN"): usa o primeiro pedaço que tem número.
function dieselTagPlanilha(t) {
  const partes = String(t ?? '').trim().split(/\s+/).filter(Boolean);
  return partes.find(p => /\d/.test(p)) || partes[0] || '';
}
function dieselNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function dieselNormCab(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const dieselPad = n => String(n).padStart(2, '0');
// Aceita serial do Excel, Date, "dd/mm/aaaa [hh:mm[:ss]]" ou "aaaa-mm-dd". Retorna {data:'AAAA-MM-DD', hora:'HH:MM:SS'|null}
function dieselDataHora(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return { data: `${v.getUTCFullYear()}-${dieselPad(v.getUTCMonth() + 1)}-${dieselPad(v.getUTCDate())}`, hora: null };
  }
  if (typeof v === 'number') {
    const p = (typeof XLSX !== 'undefined') ? XLSX.SSF.parse_date_code(v) : null;
    if (!p || !p.y) return null;
    const temHora = (p.H || p.M || p.S);
    return { data: `${p.y}-${dieselPad(p.m)}-${dieselPad(p.d)}`, hora: temHora ? `${dieselPad(p.H)}:${dieselPad(p.M)}:${dieselPad(Math.floor(p.S))}` : null };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return { data: `${m[3]}-${dieselPad(m[2])}-${dieselPad(m[1])}`, hora: m[4] ? `${dieselPad(m[4])}:${m[5]}:${m[6] || '00'}` : null };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return { data: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] ? `${m[4]}:${m[5]}:${m[6] || '00'}` : null };
  return null;
}
function dieselFmtL(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function dieselFmt1(n) { return n === null || n === undefined || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
function dieselFmtData(d) { return d ? d.split('-').reverse().join('/') : ''; }
function dieselEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Acha a linha de cabeçalho (a primeira que contém todas as colunas obrigatórias) e mapeia nome -> índice.
function dieselAcharCab(rows, obrigatorias) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const nomes = (rows[i] || []).map(dieselNormCab);
    if (obrigatorias.every(o => nomes.includes(o))) {
      const mapa = {};
      nomes.forEach((n, ix) => { if (n && !(n in mapa)) mapa[n] = ix; });
      return { linha: i, mapa };
    }
  }
  return null;
}

// Marca como suspeito o que não faz sentido físico.
function dieselAvaliar(r) {
  const motivos = [];
  const teto = r.transferencia ? DIESEL_LIMITE_TRANSF : DIESEL_LIMITE_LITROS;
  if (r.litros > teto) motivos.push(`litros acima de ${dieselFmtL(teto)}`);
  if (r.encerrante_ini != null && r.encerrante_fim != null) {
    if (r.encerrante_fim < r.encerrante_ini) motivos.push('encerrante final menor que o inicial');
    else if (Math.abs((r.encerrante_fim - r.encerrante_ini) - r.litros) > Math.max(5, r.litros * 0.1)) motivos.push('encerrante não bate com os litros');
  }
  r.suspeito = motivos.length > 0;
  r.motivo_suspeito = motivos.join('; ') || null;
  return r;
}
const DIESEL_RE_TRANSF = /^X?(CLAL|CL|TF|TQTF|TFQF)\d+$/;

// ---------------------------------------------------------------- leitura dos arquivos
function dieselUnicaChave(base, contador) {
  const n = (contador.get(base) || 0) + 1;
  contador.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}
function dieselCodigoTanqueCTA(txt) { return String(txt ?? '').split(' - ')[0].trim().toUpperCase(); }

function dieselParseCTAAbast(rows) {
  const cab = dieselAcharCab(rows, ['data/hora inicio', 'volume (l)', 'tanque']);
  if (!cab) return null;
  const c = cab.mapa, cont = new Map(), out = [];
  for (const row of rows.slice(cab.linha + 1)) {
    const dh = dieselDataHora(row[c['data/hora inicio']]);
    const litros = dieselNum(row[c['volume (l)']]);
    if (!dh || litros === null) continue;
    const frota = String(row[c['nr. de frota']] ?? '').trim() || String(row[c['placa']] ?? '').trim();
    const tanqueCod = dieselCodigoTanqueCTA(row[c['tanque']]);
    const hor = dieselNum(row[c['horimetro']]), odo = dieselNum(row[c['odometro']]);
    const encFim = dieselNum(row[c['encerrante final']]);
    const chaveTag = dieselChaveTag(frota);
    out.push(dieselAvaliar({
      fonte: 'cta', tanque_codigo: tanqueCod, data: dh.data, hora: dh.hora,
      frota_texto: frota, chave_tag: chaveTag || null, litros,
      horimetro: hor > 0 ? hor : null, odometro: odo > 0 ? odo : null,
      encerrante_ini: null, encerrante_fim: encFim,
      transferencia: DIESEL_RE_TRANSF.test(chaveTag),
      chave_externa: dieselUnicaChave(`${dh.data} ${dh.hora}|${frota}|${litros}|${tanqueCod}|${encFim ?? ''}`, cont)
    }));
  }
  return { tipo: 'cta_abastecimentos', tabela: 'diesel_abastecimentos', registros: out };
}

function dieselParseCTACarregamentos(rows) {
  const cab = dieselAcharCab(rows, ['tanque', 'volume (l)', 'entrega']);
  if (!cab) return null;
  const c = cab.mapa, cont = new Map(), out = [], descartadas = [];
  for (const row of rows.slice(cab.linha + 1)) {
    const litros = dieselNum(row[c['volume (l)']]);
    const dh = dieselDataHora(row[c['entrega']]);
    if (litros === null || litros <= 0) continue;
    if (!dh) { descartadas.push('carregamento sem data de entrega'); continue; }
    const tanqueCod = dieselCodigoTanqueCTA(row[c['tanque']]);
    const nf = String(row[c['nº nota fiscal']] ?? row[c['n° nota fiscal']] ?? row[c['no nota fiscal']] ?? '').trim();
    out.push({
      fonte: 'cta', tanque_codigo: tanqueCod, data: dh.data, litros,
      custo_total: dieselNum(row[c['custo (r$)']]), preco_litro: (() => { const x = dieselNum(row[c['preco por litro/m³']]); return x === null ? null : Math.round(x * 10000) / 10000; })(),
      nota_fiscal: nf || null, fornecedor: String(row[c['fornecedor']] ?? '').trim() || null,
      chave_externa: dieselUnicaChave(`${nf}|${tanqueCod}|${litros}|${dh.data}`, cont)
    });
  }
  return { tipo: 'cta_carregamentos', tabela: 'diesel_carregamentos', registros: out, descartadas };
}

// Relatório diário de tanque do CTA: uma aba por tanque.
function dieselParseCTAEstoque(wb) {
  const out = [];
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    const cab = dieselAcharCab(rows, ['data', 'tanque', 'estoque inicial']);
    if (!cab) continue;
    const c = cab.mapa;
    for (const row of rows.slice(cab.linha + 1)) {
      const dh = dieselDataHora(row[c['data']]);
      if (!dh) continue;
      const v = k => dieselNum(row[c[k]]);
      const vals = [v('estoque inicial'), v('carregamentos'), v('transferencias'), v('volume abastecido'), v('estoque final teorico'), v('estoque final fisico')];
      if (vals.every(x => !x)) continue; // dias antes da operação (tudo zero)
      out.push({
        tanque_codigo: dieselCodigoTanqueCTA(row[c['tanque']]), data: dh.data,
        estoque_inicial: vals[0], carregamentos: vals[1], transferencias: vals[2], abastecido: vals[3],
        final_teorico: vals[4], final_fisico: vals[5], dispersao: v('dispersao diaria')
      });
    }
  }
  return out.length ? { tipo: 'cta_estoque', tabela: 'diesel_estoque_diario', registros: out } : null;
}

// Pompa da planilha -> código do tanque.
const DIESEL_BOMBA_TANQUE = { CLAL12: 'CLAL-12', CL11: 'CL-11', TF5: 'TF-05', TF11: 'TF-11', TQTF11: 'TF-11', TFQF11: 'TF-11' };
function dieselParsePlanilha(wb) {
  const nomeAba = wb.SheetNames.find(n => /ECO\s*153/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: null });
  const cab = dieselAcharCab(rows, ['data', 'bomba', 'tipo', 'equipamento', 'litros']);
  if (!cab) return null;
  const c = cab.mapa;
  // INICIAL e FINAL aparecem sob "ENCERRANTE": pega as duas primeiras ocorrências.
  const nomes = rows[cab.linha].map(dieselNormCab);
  const ixIni = nomes.indexOf('inicial'), ixFim = nomes.indexOf('final');
  const contA = new Map(), contC = new Map(), abast = [], carr = [], descartadas = [];
  for (const row of rows.slice(cab.linha + 1)) {
    const dh = dieselDataHora(row[c['data']]);
    const litros = dieselNum(row[c['litros']]);
    const tipo = dieselNormCab(row[c['tipo']]);
    if (!dh || litros === null || litros <= 0) continue;
    const comb = dieselNormCab(row[c['combustivel']]);
    if (comb && !/diesel|s10|s500/.test(comb)) continue; // outros combustíveis/lubrificantes ficam de fora
    const bomba = String(row[c['bomba']] ?? '').trim();
    const chaveBomba = dieselChaveTag(bomba);
    const tanqueCod = DIESEL_BOMBA_TANQUE[chaveBomba] || null;
    const nf = String(row[c['nota fiscal / controle']] ?? '').trim();
    const equipTxt = String(row[c['equipamento']] ?? '').trim();
    if (tipo.startsWith('entrada')) {
      // Na entrada, BOMBA é o fornecedor (posto) e EQUIPAMENTO é o tanque que recebeu.
      if (DIESEL_BOMBA_TANQUE[chaveBomba]) continue; // veio de outro tanque: é transferência, já está nas saídas
      const qtd = dieselNum(row[c['quantidade']]);
      const lit = qtd > 0 ? qtd : litros;
      const destino = DIESEL_BOMBA_TANQUE[dieselChaveTag(dieselTagPlanilha(equipTxt))] || null;
      if (lit > 40000) { descartadas.push(`entrada de ${lit} L em ${dh.data} (valor implausível)`); continue; }
      carr.push({
        fonte: 'planilha', tanque_codigo: destino, data: dh.data, litros: lit,
        preco_litro: dieselNum(row[c['preco']]), custo_total: dieselNum(row[c['total']]),
        nota_fiscal: nf || null, fornecedor: bomba || null,
        chave_externa: dieselUnicaChave(`${dh.data}|${bomba}|${nf}|${lit}|${equipTxt}`, contC)
      });
      continue;
    }
    const tag = dieselTagPlanilha(equipTxt);
    const chaveTag = dieselChaveTag(tag);
    const ini = ixIni >= 0 ? dieselNum(row[ixIni]) : null, fim = ixFim >= 0 ? dieselNum(row[ixFim]) : null;
    const hor = dieselNum(row[c['horimetro']]), km = dieselNum(row[c['km']]);
    abast.push(dieselAvaliar({
      fonte: 'planilha', tanque_codigo: tanqueCod, data: dh.data, hora: null,
      frota_texto: equipTxt, chave_tag: chaveTag || null, litros,
      horimetro: hor > 0 ? hor : null, odometro: km > 0 ? km : null,
      encerrante_ini: ini, encerrante_fim: fim,
      transferencia: DIESEL_RE_TRANSF.test(chaveTag) || /^POSTO|VIBRA/i.test(equipTxt),
      chave_externa: dieselUnicaChave(`${dh.data}|${bomba}|${equipTxt}|${ini ?? ''}|${fim ?? ''}|${litros}`, contA)
    }));
  }
  return { tipo: 'planilha', registros: abast, carregamentos: carr, descartadas };
}

function dieselDetectarEParsear(wb) {
  const primeira = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[primeira], { header: 1, raw: true, defval: null });
  if (wb.SheetNames.some(n => /ECO\s*153/i.test(n))) return dieselParsePlanilha(wb);
  return dieselParseCTAAbast(rows) || dieselParseCTACarregamentos(rows) || dieselParseCTAEstoque(wb) || dieselParsePlanilha(wb);
}

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
function dieselIdTanque(codigo) {
  const k = dieselChaveTag(codigo);
  return dieselTanques.find(t => dieselChaveTag(t.codigo) === k)?.id || null;
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
  const abas = [['estoque', 'Estoque dos tanques'], ['consumo', 'Consumo por equipamento'], ['abastecimentos', 'Abastecimentos'], ['conciliacao', 'Conciliação'], ['importar', 'Importar']];
  document.getElementById('dieselAbas').innerHTML = abas.map(([k, n]) =>
    `<button onclick="dieselTrocarAba('${k}')" class="px-3 py-1.5 rounded-lg text-xs font-bold ${dieselAba === k ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${n}</button>`).join('');
  const corpo = document.getElementById('dieselCorpo');
  corpo.innerHTML = '<p class="text-xs text-slate-500 p-3">Carregando…</p>';
  try {
    if (dieselAba === 'estoque') await dieselRenderEstoque(corpo);
    else if (dieselAba === 'consumo') await dieselRenderConsumo(corpo);
    else if (dieselAba === 'abastecimentos') await dieselRenderAbastecimentos(corpo);
    else if (dieselAba === 'conciliacao') await dieselRenderConciliacao(corpo);
    else dieselRenderImportar(corpo);
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
    const entr = carr.filter(c => c.tanque_id === t.id && c.fonte === 'cta');
    const litros = entr.reduce((s, c) => s + Number(c.litros), 0), custo = entr.reduce((s, c) => s + Number(c.custo_total || 0), 0);
    const abast = dias.reduce((s, e) => s + Number(e.abastecido || 0), 0);
    const disp = dias.reduce((s, e) => s + Number(e.dispersao || 0), 0);
    return `<div class="bg-white rounded-2xl border border-slate-200 p-4">
      <div class="flex justify-between items-start"><div><p class="text-sm font-black text-slate-800">${dieselEsc(t.codigo)}</p><p class="text-[11px] text-slate-500">${t.tipo === 'COMBOIO' ? 'Comboio' : 'Tanque fixo'}${u ? ' • posição de ' + dieselFmtData(u.data) : ''}</p></div></div>
      <p class="mt-2 text-2xl font-black text-slate-900">${u ? dieselFmtL(u.final_fisico) : '—'} <span class="text-xs font-bold text-slate-500">L físico</span></p>
      <p class="text-[11px] text-slate-500">Teórico ${u ? dieselFmtL(u.final_teorico) : '—'} L</p>
      <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div><p class="text-slate-500">Entradas</p><p class="font-black">${dieselFmtL(litros)} L</p></div>
        <div><p class="text-slate-500">Saídas</p><p class="font-black">${dieselFmtL(abast)} L</p></div>
        <div><p class="text-slate-500">Dispersão</p><p class="font-black ${Math.abs(disp) > Math.max(100, abast * 0.01) ? 'text-red-600' : ''}">${dieselFmtL(disp)} L</p></div>
      </div>
      ${custo ? `<p class="mt-1 text-[11px] text-slate-500">Compras: R$ ${dieselFmt1(custo)} • R$ ${dieselFmt1(custo / litros)}/L</p>` : ''}
    </div>`;
  }).join('');
  const linhas = estq.slice().reverse().slice(0, 120).map(e => [
    dieselFmtData(e.data), dieselEsc(dieselTanques.find(t => t.id === e.tanque_id)?.codigo || ''),
    dieselFmtL(e.estoque_inicial), dieselFmtL(e.carregamentos), dieselFmtL(e.transferencias), dieselFmtL(e.abastecido),
    dieselFmtL(e.final_teorico), dieselFmtL(e.final_fisico), dieselFmtL(e.dispersao)]);
  const vazio = estq.length ? '' : '<p class="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mb-3">Sem relatório diário de tanque no período. Importe o relatório de estoque do CTA na aba Importar.</p>';
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
  corpo.innerHTML = `<input id="dieselBusca" value="${dieselEsc(filtro)}" oninput="clearTimeout(window._dB);window._dB=setTimeout(renderizarDiesel,400)" placeholder="Filtrar por frota ou prefixo" class="border border-slate-200 rounded-lg px-3 py-1.5 text-xs mb-2 w-64">${aviso}` +
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

// ---- Importar
function dieselRenderImportar(corpo) {
  const pode = podeExecutarAcao('gerenciar_diesel');
  corpo.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
    <p class="text-xs text-slate-600">Envie os arquivos do CTA (Abastecimentos, Carregamentos, relatório diário de tanque) ou a planilha de abastecimento. O tipo é reconhecido sozinho; reenviar o mesmo arquivo não duplica.</p>
    ${pode ? `<input id="dieselArquivo" type="file" accept=".xls,.xlsx,.csv" multiple onchange="dieselLerArquivos(this.files)" class="text-xs">` : '<p class="text-xs text-amber-700">Seu perfil só visualiza o diesel.</p>'}
    <div id="dieselPrevia"></div>
    ${pode ? `<div class="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
      <button onclick="dieselVincular()" class="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold hover:bg-slate-200">Vincular frotas aos equipamentos</button>
      <button onclick="dieselSincronizarLeituras()" class="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-bold hover:bg-slate-200">Enviar leituras do CTA para a Frota</button></div>
      <p id="dieselMsgAcoes" class="text-xs text-slate-600"></p>` : ''}</div>`;
}
async function dieselLerArquivos(files) {
  if (!files || !files.length) return;
  if (typeof XLSX === 'undefined') return alert('Biblioteca de planilhas não carregada. Recarregue a página.');
  const prev = document.getElementById('dieselPrevia');
  prev.innerHTML = '<p class="text-xs text-slate-500">Lendo arquivos…</p>';
  const pacotes = [];
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const p = dieselDetectarEParsear(wb);
      if (!p) { pacotes.push({ nome: f.name, erro: 'formato não reconhecido' }); continue; }
      pacotes.push({ nome: f.name, ...p });
    } catch (e) { pacotes.push({ nome: f.name, erro: String(e.message || e) }); }
  }
  dieselPendente = pacotes.filter(p => !p.erro);
  prev.innerHTML = pacotes.map(p => {
    if (p.erro) return `<p class="text-xs text-red-600">${dieselEsc(p.nome)}: ${dieselEsc(p.erro)}</p>`;
    const regs = p.registros || [];
    const datas = regs.map(r => r.data).filter(Boolean).sort();
    const susp = regs.filter(r => r.suspeito);
    const extra = p.carregamentos ? ` + ${p.carregamentos.length} entradas` : '';
    const desc = (p.descartadas || []).length ? `<p class="text-amber-700">${p.descartadas.length} entrada(s) ignoradas por valor implausível: ${dieselEsc(p.descartadas.slice(0, 3).join('; '))}</p>` : '';
    return `<div class="text-xs border border-slate-100 rounded-xl p-2 mb-2"><p class="font-black">${dieselEsc(p.nome)} — ${dieselEsc(p.tipo)}</p>
      <p>${regs.length} linhas${extra}${datas.length ? ` • ${dieselFmtData(datas[0])} a ${dieselFmtData(datas[datas.length - 1])}` : ''}</p>
      ${desc}${susp.length ? `<p class="text-amber-700">${susp.length} linha(s) suspeitas (ficam fora dos totais até você aceitar). Exemplos: ${susp.slice(0, 3).map(s => dieselFmtData(s.data) + ' ' + dieselEsc(s.frota_texto) + ' ' + dieselFmtL(s.litros) + ' L').join('; ')}</p>` : ''}</div>`;
  }).join('') + (dieselPendente.length ? '<button onclick="dieselGravar()" class="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black">Gravar no sistema</button><span id="dieselProg" class="ml-3 text-xs text-slate-600"></span>' : '');
}
async function dieselEnviar(tabela, linhas, onConflict, rotulo, manter = false) {
  const passo = 500; const el = document.getElementById('dieselProg');
  for (let i = 0; i < linhas.length; i += passo) {
    const { error } = await db.from(tabela).upsert(linhas.slice(i, i + passo), { onConflict, ignoreDuplicates: manter });
    if (error) throw new Error(`${rotulo}: ${error.message}`);
    if (el) el.innerText = `${rotulo}: ${Math.min(i + passo, linhas.length)}/${linhas.length}`;
  }
}
function dieselComTanque(r) {
  const { tanque_codigo, ...resto } = r;
  return { ...resto, tanque_id: tanque_codigo ? dieselIdTanque(tanque_codigo) : null };
}
async function dieselGravar() {
  if (!podeExecutarAcao('gerenciar_diesel', true) || !dieselPendente?.length) return;
  try {
    await dieselCarregarBase();
    for (const p of dieselPendente) {
      const desconhecidos = new Set((p.registros || []).concat(p.carregamentos || []).map(r => r.tanque_codigo).filter(c => c && !dieselIdTanque(c)));
      if (desconhecidos.size) throw new Error(`Tanque(s) não cadastrado(s): ${[...desconhecidos].join(', ')}.`);
      if (p.tipo === 'planilha') {
        await dieselEnviar('diesel_carregamentos', p.carregamentos.map(dieselComTanque).filter(r => r.tanque_id), 'fonte,chave_externa', 'Entradas', true);
        await dieselEnviar('diesel_abastecimentos', p.registros.map(dieselComTanque), 'fonte,chave_externa', 'Abastecimentos', true);
      } else if (p.tipo === 'cta_estoque') {
        await dieselEnviar(p.tabela, p.registros.map(dieselComTanque).filter(r => r.tanque_id), 'tanque_id,data', 'Estoque');
      } else {
        await dieselEnviar(p.tabela, p.registros.map(dieselComTanque), 'fonte,chave_externa', p.tipo, true);
      }
    }
    const { data } = await db.rpc('diesel_vincular_equipamentos');
    dieselPendente = null;
    document.getElementById('dieselPrevia').innerHTML = `<p class="text-xs text-green-700 font-bold">Gravado. ${data ?? 0} abastecimento(s) vinculados a equipamentos.</p>`;
  } catch (e) {
    alert('Falha ao gravar: ' + (e.message || e));
  }
}
async function dieselVincular() {
  const { data, error } = await db.rpc('diesel_vincular_equipamentos');
  document.getElementById('dieselMsgAcoes').innerText = error ? 'Erro: ' + error.message : `${data} abastecimento(s) vinculados.`;
}
async function dieselSincronizarLeituras() {
  if (!confirm('Enviar as leituras de horímetro/odômetro do CTA para o histórico da Frota? Só entram as que passam nas regras de salto; as demais servem só para o consumo.')) return;
  const { data, error } = await db.rpc('diesel_sincronizar_leituras');
  document.getElementById('dieselMsgAcoes').innerText = error ? 'Erro: ' + error.message
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
