// ============================================================================
// VILASA CMMS - MOTOR JAVASCRIPT MODULAR (app.js)
// ============================================================================

let usuarioLogado = null;
let cacheEquipamentos = [];
let cachePecas = [];
let cacheUsuarios = [];
let cacheOS = [];
let cacheRegistrosEditorAdmin = [];
let listaFiltradaAdmin = [];
let paginaAtualAdmin = 1;
const ITENS_POR_PAGINA_ADMIN = 50;
let ultimoRelatorioKPIs = [];
let ultimoHorimetroMaquinaConcluir = 0;
let abaOSAtual = 'ativas';
let contadorLinhaNF = 0;
let contadorLinhaSaida = 0;

// 1. MATRIZ DE PERMISSÕES (RBAC)
const PERMISSOES_MODULOS = {
  encarregado: ['os'],
  mecanico:    ['os'],
  almoxarife:  ['estoque', 'os'],
  pcm:         ['os', 'frota', 'pcm', 'estoque', 'kpis'],
  gestor:      ['os', 'frota', 'pcm', 'estoque', 'kpis'],
  admin:       ['os', 'frota', 'pcm', 'estoque', 'kpis', 'admin']
};

const PERMISSOES_ACOES = {
  abrir_os_campo:      ['encarregado', 'pcm', 'gestor', 'admin'],
  executar_os_oficina: ['mecanico', 'pcm', 'admin'],
  classificar_rep_pcm: ['pcm', 'gestor', 'admin'],
  exportar_relatorios: ['pcm', 'gestor', 'admin'],
  editar_frota:        ['pcm', 'admin'],
  gerenciar_pcm:       ['pcm', 'admin'],
  operar_almoxarifado: ['almoxarife', 'admin'],
  reservar_material:   ['mecanico', 'almoxarife', 'pcm', 'admin'],
  acesso_modo_deus:    ['admin']
};

function cargoAtualNormalizado() {
  if (!usuarioLogado || !usuarioLogado.cargo_base) return 'encarregado';
  return String(usuarioLogado.cargo_base).trim().toLowerCase();
}

function podeAcessarModulo(modulo) {
  return (PERMISSOES_MODULOS[cargoAtualNormalizado()] || ['os']).includes(modulo);
}

function podeExecutarAcao(acao) {
  return (PERMISSOES_ACOES[acao] || []).includes(cargoAtualNormalizado());
}

function mostrarElemento(id, visivel) {
  const el = document.getElementById(id);
  if (!el) return;
  if (visivel) el.classList.remove('trava-oculta');
  else el.classList.add('trava-oculta');
}

// 2. BUSCADOR PAGINADO SEM LIMITE DE 100 / 1000 LINHAS DO SUPABASE
async function buscarTudoSemLimite(tabela, colunaOrdem = null, ascendente = true) {
  let todos = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    let q = db.from(tabela).select('*').range(de, de + passo - 1);
    if (colunaOrdem) q = q.order(colunaOrdem, { ascending: ascendente });
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    todos = todos.concat(data);
    if (data.length < passo) break;
    de += passo;
  }
  return todos;
}

// 3. UTILITÁRIOS DE EXPORTAÇÃO E CÁLCULO DE TURNO (10h20/dia VILASA)
async function exportarImagemElemento(elementId, nomeArquivo, formato = 'png') {
  const alvo = document.getElementById(elementId);
  if (!alvo) return;
  const canvas = await html2canvas(alvo, { backgroundColor: '#ffffff', scale: 2 });
  const mime = formato === 'jpeg' ? 'image/jpeg' : 'image/png';
  const link = document.createElement('a');
  link.download = `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.${formato}`;
  link.href = canvas.toDataURL(mime, 0.95);
  link.click();
}

function imprimirREPEnxuto() {
  window.print();
}

function calcularHorasParadasTurnoVilasa(entradaISO, saidaISO) {
  if (!entradaISO) return 0;
  const d1 = new Date(entradaISO);
  const d2 = saidaISO ? new Date(saidaISO) : new Date();
  const diffHorasCorridas = Math.max(0.1, (d2 - d1) / 3600000);
  if (diffHorasCorridas <= 10.33) return diffHorasCorridas;
  return (diffHorasCorridas / 24) * 10.3333;
}

function parseDataSeguraREP(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
  let s = String(val).trim().replace(/::+/g, ':');
  const matchBR = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})?:?(\d{1,2})?/);
  if (matchBR) {
    const [_, d, m, y, hh = '08', mm = '00'] = matchBR;
    const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dtGenerica = new Date(s);
  return !isNaN(dtGenerica.getTime()) ? dtGenerica.toISOString() : null;
}

// 4. LOGIN E CONTROLO DE SESSÃO
async function fazerLogin() {
  const mat = document.getElementById('loginMatricula').value.trim();
  const sen = document.getElementById('loginSenha').value.trim();
  const divErro = document.getElementById('erroLogin');
  divErro.classList.add('hidden');

  const { data, error } = await db.from('perfis_usuarios').select('*').eq('matricula', mat).eq('senha_acesso', sen).single();
  if (error || !data || !data.ativo) {
    divErro.innerText = "Matrícula/senha incorretos ou utilizador inativo!";
    divErro.classList.remove('hidden');
    return;
  }

  data.cargo_base = String(data.cargo_base || 'encarregado').trim().toLowerCase();
  usuarioLogado = data;
  localStorage.setItem('vilasa_user', JSON.stringify(data));
  iniciarSessaoUsuario();
}

function fazerLogout() {
  localStorage.removeItem('vilasa_user');
  usuarioLogado = null;
  document.getElementById('appPrincipal').classList.add('hidden');
  document.getElementById('telaLogin').classList.remove('hidden');
  document.getElementById('loginSenha').value = '';
}

function aplicarTravasVisuaisDeSeguranca() {
  const cargo = cargoAtualNormalizado();
  const modulosPermitidos = PERMISSOES_MODULOS[cargo] || ['os'];

  ['os', 'frota', 'pcm', 'estoque', 'kpis', 'admin'].forEach(mod => {
    mostrarElemento(`nav-${mod}`, modulosPermitidos.includes(mod));
  });

  mostrarElemento('btnTopoAbrirOS', podeExecutarAcao('abrir_os_campo'));
  mostrarElemento('btnLancamentoManualREP', podeExecutarAcao('classificar_rep_pcm'));
  mostrarElemento('btnExportarREPExcel', podeExecutarAcao('exportar_relatorios'));
  mostrarElemento('btnImprimirREPPdf', podeExecutarAcao('exportar_relatorios'));
  mostrarElemento('btnImgREPPng', podeExecutarAcao('exportar_relatorios'));
  mostrarElemento('btnImgREPJpeg', podeExecutarAcao('exportar_relatorios'));
  mostrarElemento('tabOS-triagem', podeExecutarAcao('classificar_rep_pcm'));
  mostrarElemento('tabOS-externas', podeExecutarAcao('classificar_rep_pcm'));
  mostrarElemento('painelGraficosOS', podeExecutarAcao('classificar_rep_pcm'));
  mostrarElemento('barraFiltroPeriodoREP', podeExecutarAcao('classificar_rep_pcm'));
  mostrarElemento('quadroExportacaoREP', podeExecutarAcao('classificar_rep_pcm'));

  mostrarElemento('btnBaixarModeloFrota', podeExecutarAcao('editar_frota'));
  mostrarElemento('btnImportarFrotaMassa', podeExecutarAcao('editar_frota'));
  mostrarElemento('btnCadastrarEquipamento', podeExecutarAcao('editar_frota'));
  mostrarElemento('btnNovoPlanoPCM', podeExecutarAcao('gerenciar_pcm'));

  mostrarElemento('btnEstCadastrarPeca', podeExecutarAcao('operar_almoxarifado'));
  mostrarElemento('btnEstEntradaNF', podeExecutarAcao('operar_almoxarifado'));
  mostrarElemento('btnEstReservar', podeExecutarAcao('reservar_material'));
  mostrarElemento('btnEstSaidaAvulsa', podeExecutarAcao('operar_almoxarifado'));
  mostrarElemento('btnEstServicoTerceiro', podeExecutarAcao('operar_almoxarifado'));

  document.getElementById('resumoPermissaoRodape').innerText = `Módulos: ${modulosPermitidos.join(', ').toUpperCase()}`;
}

function iniciarSessaoUsuario() {
  document.getElementById('telaLogin').classList.add('hidden');
  document.getElementById('appPrincipal').classList.remove('hidden');

  const cargo = cargoAtualNormalizado();
  document.getElementById('txtNomeUsuario').innerText = usuarioLogado.nome;
  document.getElementById('txtMatriculaUsuario').innerText = `Matrícula: ${usuarioLogado.matricula}`;
  document.getElementById('badgeCargo').innerText = cargo.toUpperCase();

  aplicarTravasVisuaisDeSeguranca();

  const hoje = new Date();
  const trintaDias = new Date(hoje.getTime() - (30 * 24 * 3600 * 1000));
  const hojeStr = hoje.toISOString().split('T')[0];
  const trintaStr = trintaDias.toISOString().split('T')[0];

  document.getElementById('kpiDataFim').value = hojeStr;
  document.getElementById('kpiDataInicio').value = trintaStr;
  document.getElementById('repDataFim').value = hojeStr;
  document.getElementById('repDataInicio').value = trintaStr;

  const modulosPermitidos = PERMISSOES_MODULOS[cargo] || ['os'];
  navegarPara(modulosPermitidos[0]);
}

function navegarPara(modulo) {
  if (!podeAcessarModulo(modulo)) {
    alert("Acesso negado para o seu perfil.");
    modulo = (PERMISSOES_MODULOS[cargoAtualNormalizado()] || ['os'])[0];
  }

  ['os', 'frota', 'pcm', 'estoque', 'kpis', 'admin'].forEach(m => {
    mostrarElemento(`sec-${m}`, m === modulo);
  });

  ['os', 'frota', 'pcm', 'estoque', 'kpis', 'admin'].forEach(m => {
    const btn = document.getElementById(`nav-${m}`);
    if (!btn) return;
    const vis = podeAcessarModulo(m) ? '' : 'trava-oculta';
    btn.className = (m === modulo)
      ? `nav-btn ${vis} flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition bg-amber-500 text-white shadow-sm`
      : `nav-btn ${vis} flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition text-slate-600 hover:bg-slate-200/70`;
  });

  if (modulo === 'os') carregarOrdensServico('ativas');
  if (modulo === 'frota') carregarFrota('TODOS');
  if (modulo === 'pcm') carregarPCM();
  if (modulo === 'estoque') carregarEstoque();
  if (modulo === 'kpis') inicializarTelaKPIs();
  if (modulo === 'admin' && podeExecutarAcao('acesso_modo_deus')) {
    carregarTabelaEditorAdmin();
    carregarAdminUsuarios();
  }
}

// ============================================================================
// MÓDULO 1: ORDENS DE SERVIÇO & REP
// ============================================================================
function alternarModoPeriodoREP() {
  const modo = document.getElementById('repModoPeriodo').value;
  document.getElementById('boxDatasFiltroREP').classList.toggle('hidden', modo !== 'PERIODO');
  carregarOrdensServico(abaOSAtual);
}

async function abrirModalNovaOS() {
  if (!podeExecutarAcao('abrir_os_campo')) return;
  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos.filter(e => e.ativo !== false);
  document.getElementById('osEquipamentoSelect').innerHTML = `<option value="">-- Selecione o equipamento --</option>` +
    cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');
  document.getElementById('osAbertoPorNome').value = usuarioLogado.nome;
  document.getElementById('osLocalizacao').value = '';
  document.getElementById('osDescricao').value = '';
  document.getElementById('alertaDuplicidadeOS').classList.add('hidden');
  document.getElementById('modalNovaOS').classList.remove('hidden');
}

async function verificarDuplicidadeOS() {
  const eqId = document.getElementById('osEquipamentoSelect').value;
  const divAlerta = document.getElementById('alertaDuplicidadeOS');
  if (!eqId) return divAlerta.classList.add('hidden');
  const { data } = await db.from('ordens_servico').select('numero_os, descricao_problema, status')
    .eq('equipamento_id', eqId).in('status', ['aberta', 'em_execucao', 'pausada_peca']);
  if (data && data.length > 0) {
    document.getElementById('textoDuplicidadeOS').innerText = `OS #${data[0].numero_os}: "${data[0].descricao_problema}"`;
    divAlerta.classList.remove('hidden');
  } else divAlerta.classList.add('hidden');
}

async function salvarNovaOS() {
  if (!podeExecutarAcao('abrir_os_campo')) return;
  const eqId = document.getElementById('osEquipamentoSelect').value;
  const localizacao = document.getElementById('osLocalizacao').value.trim();
  const abertoPorNome = document.getElementById('osAbertoPorNome').value.trim() || usuarioLogado.nome;
  const desc = document.getElementById('osDescricao').value.trim();
  if (!eqId || !localizacao || !desc) return alert("Preencha Equipamento, Localização e Descrição!");

  const { error } = await db.from('ordens_servico').insert([{
    equipamento_id: eqId, tipo: 'corretiva', motivo_rep: 'CORRETIVA',
    localizacao, local_manutencao_pcm: 'OFICINA',
    aberto_por: usuarioLogado.id, aberto_por_nome: abertoPorNome,
    descricao_problema: desc.toUpperCase(), status: 'aberta'
  }]);
  if (error) return alert("Erro: " + error.message);
  await db.from('equipamentos').update({ status_operacional: 'parado_corretiva' }).eq('id', eqId);
  document.getElementById('modalNovaOS').classList.add('hidden');
  carregarOrdensServico('ativas');
}

async function carregarOrdensServico(filtro) {
  abaOSAtual = filtro;
  if ((filtro === 'triagem' || filtro === 'externas') && !podeExecutarAcao('classificar_rep_pcm')) filtro = 'ativas';

  ['ativas', 'triagem', 'externas', 'concluidas'].forEach(tab => {
    const el = document.getElementById(`tabOS-${tab}`);
    if (!el) return;
    const oculto = ((tab === 'triagem' || tab === 'externas') && !podeExecutarAcao('classificar_rep_pcm')) ? 'trava-oculta' : '';
    el.className = (tab === filtro)
      ? `${oculto} px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white shadow-sm`
      : `${oculto} px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300`;
  });

  let query = db.from('ordens_servico')
    .select('*, equipamentos(tag, nome, marca, modelo, horimetro_atual, unidade_medida, proprietario)')
    .order('aberta_em', { ascending: false })
    .limit(500);

  const modoPer = document.getElementById('repModoPeriodo')?.value || 'INTEIRO';
  if (modoPer === 'PERIODO') {
    const dIni = document.getElementById('repDataInicio').value;
    const dFim = document.getElementById('repDataFim').value;
    if (dIni) query = query.gte('aberta_em', `${dIni}T00:00:00.000Z`);
    if (dFim) query = query.lte('aberta_em', `${dFim}T23:59:59.999Z`);
  }

  const { data: todasRecentes } = await query;
  cacheOS = todasRecentes || [];

  if (podeExecutarAcao('classificar_rep_pcm')) {
    atualizarGraficosAbaOS(cacheOS);
    renderizarQuadroEnxutoParadosREP(cacheOS);
  }

  const qtdTriagem = cacheOS.filter(o => o.status === 'aguardando_pcm' || (o.status === 'concluida_oficina' && !o.codigo_componente)).length;
  document.getElementById('contadorTriagemPCM').innerText = qtdTriagem;

  let listaFiltrada = cacheOS;
  if (filtro === 'ativas') listaFiltrada = cacheOS.filter(o => ['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(o.status));
  else if (filtro === 'triagem') listaFiltrada = cacheOS.filter(o => o.status === 'aguardando_pcm' || (o.status === 'concluida_oficina' && !o.codigo_componente));
  else if (filtro === 'externas') listaFiltrada = cacheOS.filter(o => o.manutencao_externa === true || o.local_manutencao_pcm === 'TERCEIRO');
  else listaFiltrada = cacheOS.filter(o => ['aguardando_pcm', 'concluida_oficina', 'auditada_pcm'].includes(o.status));

  const { data: listaPecas } = await db.from('pecas_estoque').select('*').eq('ativo', true);
  cachePecas = listaPecas || [];
  const { data: listaUsrs } = await db.from('perfis_usuarios').select('*').eq('ativo', true).order('nome');
  cacheUsuarios = listaUsrs || [];

  const container = document.getElementById('listaOS');
  if (listaFiltrada.length === 0) {
    container.innerHTML = `<div class="col-span-full p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">Nenhuma Ordem de Serviço neste filtro.</div>`;
    return;
  }

  const podeExecutar = podeExecutarAcao('executar_os_oficina');
  const podeClassificar = podeExecutarAcao('classificar_rep_pcm');

  container.innerHTML = listaFiltrada.map(os => {
    const opcoesPecas = cachePecas.map(p => `<option value="${p.id}">${p.codigo} - ${p.descricao} (Disp: ${p.saldo_atual - (p.quantidade_reservada || 0)})</option>`).join('');
    const listaExec = (os.executantes_nomes && os.executantes_nomes.length > 0) ? os.executantes_nomes.join(' / ') : 'Aguardando';
    const horasVilasa = calcularHorasParadasTurnoVilasa(os.aberta_em, os.concluida_em).toFixed(1);

    return `
      <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3 flex flex-col justify-between shadow-sm">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <span class="text-xs font-mono font-bold text-slate-500">OS #${os.numero_os} &bull; ${os.motivo_rep || os.tipo.toUpperCase()}</span>
            <div class="flex items-center gap-1.5">
              ${os.codigo_componente ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">${os.codigo_componente} - ${os.nome_componente}</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">EM TRIAGEM</span>`}
              <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">${os.status.replace('_', ' ')}</span>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <h3 class="text-base font-black text-amber-600">${os.equipamentos?.tag || '---'} <span class="text-xs font-semibold text-slate-600">- ${os.equipamentos?.nome || ''}</span></h3>
            ${os.manutencao_externa || os.local_manutencao_pcm === 'TERCEIRO' ? `<span class="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200 font-bold">EXTERNA: ${os.oficina_externa || 'TERCEIRO'}</span>` : ''}
          </div>

          <p class="text-xs text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-semibold">${os.descricao_problema}</p>

          <div class="text-[11px] text-slate-600 grid grid-cols-2 gap-1 pt-1">
            <span><i class="fa-solid fa-map-pin text-amber-500"></i> Local Físico: <strong>${os.localizacao || '-'}</strong></span>
            <span><i class="fa-solid fa-warehouse text-blue-500"></i> Local PCM: <strong>${os.local_manutencao_pcm || 'OFICINA'}</strong></span>
            <span><i class="fa-regular fa-clock"></i> Entrada: ${new Date(os.aberta_em).toLocaleString('pt-BR')}</span>
            <span><i class="fa-solid fa-stopwatch text-rose-500"></i> Tempo Turno: <strong>${horasVilasa} h</strong></span>
            <span><i class="fa-solid fa-gauge-high text-emerald-600"></i> Leitura OS: <strong>${os.horimetro_os || os.equipamentos?.horimetro_atual || '-'}</strong></span>
            <span><i class="fa-solid fa-user-tie"></i> Abriu: <strong>${os.aberto_por_nome || '-'}</strong></span>
            <span class="col-span-2"><i class="fa-solid fa-users-gear text-amber-600"></i> Mecânicos: <strong>${listaExec}</strong></span>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 space-y-2">
          ${['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(os.status) && podeExecutar ? `
            <div class="flex gap-1.5 items-end">
              <div class="flex-1">
                <select id="selPecaOS-${os.id}" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-[11px] text-slate-900">
                  <option value="">+ Reservar peça para esta OS...</option>
                  ${opcoesPecas}
                </select>
              </div>
              <input type="number" id="qtdPecaOS-${os.id}" value="1" min="1" class="w-14 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-[11px] text-center text-slate-900" />
              <button onclick="requisitarPecaNaOS('${os.id}', '${os.equipamento_id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded text-[11px] font-bold">Reservar</button>
            </div>
            <div class="grid grid-cols-3 gap-2 pt-1">
              <button onclick="acaoMecanicoOS('${os.id}', 'em_execucao')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-xs">Iniciar</button>
              <button onclick="acaoMecanicoOS('${os.id}', 'pausada_peca')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg text-xs">Aguard. Peça</button>
              <button onclick="abrirModalConcluirOS('${os.id}', '${os.equipamento_id}', ${os.equipamentos?.horimetro_atual || 0})" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs">Encerrar OS</button>
            </div>
          ` : ''}

          ${!['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(os.status) ? `
            <div class="text-[11px] text-emerald-700 font-semibold"><p><i class="fa-solid fa-wrench"></i> Serviço: ${os.servico_executado || '-'}</p></div>
          ` : ''}

          ${podeClassificar ? `
            <button onclick="abrirModalClassificarExistente('${os.id}')" class="w-full mt-1 bg-slate-100 hover:bg-amber-500 hover:text-white text-slate-700 border border-slate-300 font-bold py-1.5 rounded-lg text-xs transition">
              <i class="fa-solid fa-tags"></i> Classificar Falha (COR) / Editar Dados (PCM)
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderizarQuadroEnxutoParadosREP(lista) {
  const paradasAgora = lista.filter(o => ['aberta', 'em_execucao', 'pausada_peca', 'pausada_outros'].includes(o.status));
  document.getElementById('dataHoraCabecalhoREP').innerText = `Atualizado em: ${new Date().toLocaleString('pt-BR')}`;
  document.getElementById('contadorParadosCabecalhoREP').innerText = `${paradasAgora.length} Equipamento(s) Parado(s)`;

  if (paradasAgora.length === 0) {
    document.getElementById('tabelaEnxutaParadosREP').innerHTML = `<p class="text-emerald-700 font-bold py-3 text-center">Nenhum equipamento parado em manutenção no momento!</p>`;
    return;
  }

  document.getElementById('tabelaEnxutaParadosREP').innerHTML = `
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="bg-amber-500 text-white text-[11px] uppercase">
          <th class="py-2 px-2 border border-amber-600">Nº</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO</th>
          <th class="py-2 px-2 border border-amber-600">MARCA</th>
          <th class="py-2 px-2 border border-amber-600">PATRIMÔNIO</th>
          <th class="py-2 px-2 border border-amber-600">MOTIVO</th>
          <th class="py-2 px-2 border border-amber-600">DESCRIÇÃO DO PROBLEMA</th>
          <th class="py-2 px-2 border border-amber-600">ENTRADA</th>
          <th class="py-2 px-2 border border-amber-600">PREV. LIBERAÇÃO</th>
          <th class="py-2 px-2 border border-amber-600 text-center">DIAS PARADOS</th>
          <th class="py-2 px-2 border border-amber-600">OBSERVAÇÃO</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 text-[11px]">
        ${paradasAgora.map((o, idx) => {
          const diasParados = Math.max(1, Math.ceil((new Date() - new Date(o.aberta_em)) / (24 * 3600000)));
          const prev = o.previsao_liberacao ? new Date(o.previsao_liberacao + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${idx + 1}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-800">${o.equipamentos?.nome || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${o.equipamentos?.marca || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-black text-amber-700">${o.equipamentos?.tag || '-'}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-slate-700">${o.motivo_rep || o.tipo.toUpperCase()}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-semibold text-slate-900">${o.descricao_problema}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-slate-600">${new Date(o.aberta_em).toLocaleString('pt-BR')}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-blue-700">${prev}</td>
              <td class="py-1.5 px-2 border border-slate-200 text-center font-black text-rose-600">${diasParados}</td>
              <td class="py-1.5 px-2 border border-slate-200 font-bold text-amber-700">${o.status === 'pausada_peca' ? 'AGUARD. PEÇA' : 'EM EXECUÇÃO'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function atualizarGraficosAbaOS(lista) {
  const emExec = lista.filter(o => ['aberta', 'em_execucao', 'pausada_peca'].includes(o.status)).length;
  const triagem = lista.filter(o => o.status === 'aguardando_pcm' || (!o.codigo_componente && o.status === 'concluida_oficina')).length;
  const concluidas = lista.filter(o => ['concluida_oficina', 'auditada_pcm'].includes(o.status)).length;
  const externas = lista.filter(o => o.manutencao_externa === true || o.local_manutencao_pcm === 'TERCEIRO').length;

  document.getElementById('graficoStatusOS').innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-white p-2.5 rounded-lg border border-rose-200"><span class="text-[10px] text-slate-500 block">Máquinas Paradas</span><span class="text-lg font-black text-rose-600">${emExec}</span></div>
      <div class="bg-white p-2.5 rounded-lg border border-amber-200"><span class="text-[10px] text-slate-500 block">Pendentes Triagem</span><span class="text-lg font-black text-amber-600">${triagem}</span></div>
      <div class="bg-white p-2.5 rounded-lg border border-emerald-200"><span class="text-[10px] text-slate-500 block">Concluídas no Filtro</span><span class="text-lg font-black text-emerald-600">${concluidas}</span></div>
      <div class="bg-white p-2.5 rounded-lg border border-purple-200"><span class="text-[10px] text-slate-500 block">Em Oficina Externa</span><span class="text-lg font-black text-purple-600">${externas}</span></div>
    </div>
  `;

  const mapaComp = {};
  lista.forEach(o => {
    const chave = o.codigo_componente ? `${o.codigo_componente} - ${o.nome_componente}` : 'EM TRIAGEM (SEM CÓDIGO COR)';
    mapaComp[chave] = (mapaComp[chave] || 0) + 1;
  });
  const ordenado = Object.entries(mapaComp).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxVal = ordenado.length > 0 ? ordenado[0][1] : 1;

  document.getElementById('graficoComponentesOS').innerHTML = ordenado.map(([nome, qtd]) => {
    const larg = Math.max(8, Math.round((qtd / maxVal) * 100));
    return `
      <div class="space-y-0.5">
        <div class="flex justify-between text-[11px]"><span class="font-bold text-slate-700 truncate">${nome}</span><span class="font-black text-blue-600">${qtd} OS</span></div>
        <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div class="bg-blue-600 h-2 rounded-full" style="width: ${larg}%"></div></div>
      </div>
    `;
  }).join('');
}

async function acaoMecanicoOS(osId, novoStatus) {
  if (!podeExecutarAcao('executar_os_oficina')) return;
  const agora = new Date().toISOString();
  const { data: osAtual } = await db.from('ordens_servico').select('*').eq('id', osId).single();
  if (!osAtual) return;
  let updateData = { status: novoStatus };
  if (novoStatus === 'em_execucao' && !osAtual.iniciada_em) updateData.iniciada_em = agora;
  if (novoStatus === 'pausada_peca') updateData.ultima_pausa_em = agora;
  await db.from('ordens_servico').update(updateData).eq('id', osId);
  carregarOrdensServico('ativas');
}

function abrirModalConcluirOS(osId, eqId, ultimoHorimetro) {
  if (!podeExecutarAcao('executar_os_oficina')) return;
  document.getElementById('concluirOsId').value = osId;
  document.getElementById('concluirEqId').value = eqId;
  ultimoHorimetroMaquinaConcluir = parseFloat(ultimoHorimetro || 0);
  document.getElementById('txtUltimoHorimetroModalOS').innerText = `Último: ${ultimoHorimetroMaquinaConcluir}`;
  document.getElementById('concluirHorimetroOS').value = '';
  document.getElementById('concluirServicoTexto').value = '';
  document.getElementById('concluirExecutantesExtras').value = '';
  document.getElementById('listaCheckboxesMecanicos').innerHTML = cacheUsuarios.map(u => `
    <label class="flex items-center gap-2 text-xs text-slate-800 cursor-pointer hover:bg-slate-100 p-1 rounded">
      <input type="checkbox" value="${u.nome.toUpperCase()}" class="chk-executante rounded" ${u.id === usuarioLogado.id ? 'checked' : ''} />
      <span>${u.nome} <span class="text-[10px] text-slate-500">(${u.cargo_base})</span></span>
    </label>
  `).join('');
  document.getElementById('modalConcluirOS').classList.remove('hidden');
}

function usarUltimoHorimetroOS() {
  document.getElementById('concluirHorimetroOS').value = ultimoHorimetroMaquinaConcluir;
}

async function confirmarFechamentoMecanico() {
  if (!podeExecutarAcao('executar_os_oficina')) return;
  const osId = document.getElementById('concluirOsId').value;
  const eqId = document.getElementById('concluirEqId').value;
  const horimetroOS = parseFloat(document.getElementById('concluirHorimetroOS').value);
  const servico = document.getElementById('concluirServicoTexto').value.trim().toUpperCase();
  const extras = document.getElementById('concluirExecutantesExtras').value.trim().toUpperCase();

  if (isNaN(horimetroOS)) return alert("Informe o Horímetro ou KM na saída!");
  const selecionados = Array.from(document.querySelectorAll('.chk-executante:checked')).map(cb => cb.value);
  if (extras) extras.split(/[,/]/).map(s => s.trim()).filter(Boolean).forEach(n => selecionados.push(n));
  if (selecionados.length === 0 || !servico) return alert("Selecione executantes e descreva o serviço!");

  const { data: osAtual } = await db.from('ordens_servico').select('*').eq('id', osId).single();
  const agora = new Date();
  const horasTurno = calcularHorasParadasTurnoVilasa(osAtual.aberta_em, agora.toISOString());

  await db.from('ordens_servico').update({
    status: 'aguardando_pcm', horimetro_os: horimetroOS, servico_executado: servico,
    executantes_nomes: selecionados, quantidade_executantes: selecionados.length,
    concluida_em: agora.toISOString(), tempo_efetivo_segundos: Math.round(horasTurno * 3600)
  }).eq('id', osId);

  const updateEq = { status_operacional: 'operando' };
  if (horimetroOS > ultimoHorimetroMaquinaConcluir) updateEq.horimetro_atual = horimetroOS;
  await db.from('equipamentos').update(updateEq).eq('id', eqId);
  document.getElementById('modalConcluirOS').classList.add('hidden');
  carregarOrdensServico('ativas');
}

async function abrirModalManualPCM() {
  if (!podeExecutarAcao('classificar_rep_pcm')) return;
  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos.filter(e => e.ativo !== false);
  document.getElementById('repEquipamentoId').innerHTML = cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');
  document.getElementById('repOsId').value = '';
  document.getElementById('repStatusOS').value = 'auditada_pcm';
  document.getElementById('repHorimetro').value = '';
  document.getElementById('repLocalFisico').value = 'CAMPO / OBRA';
  document.getElementById('repLocalPCM').value = 'OFICINA';
  document.getElementById('repMotivo').value = 'CORRETIVA';
  document.getElementById('repComponenteSelect').value = '';
  document.getElementById('repOficinaExterna').value = '';
  const agoraLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('repDataEntrada').value = agoraLocal;
  document.getElementById('repDataSaida').value = agoraLocal;
  document.getElementById('repPrevisaoLiberacao').value = '';
  document.getElementById('repMecanicosTexto').value = '';
  document.getElementById('repProblemaTexto').value = '';
  document.getElementById('repServicoTexto').value = '';
  document.getElementById('modalClassificarPCM').classList.remove('hidden');
}

async function abrirModalClassificarExistente(osId) {
  if (!podeExecutarAcao('classificar_rep_pcm')) return;
  const os = cacheOS.find(o => o.id === osId);
  if (!os) return;
  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos.filter(e => e.ativo !== false);
  document.getElementById('repEquipamentoId').innerHTML = cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');

  document.getElementById('repOsId').value = os.id;
  document.getElementById('repEquipamentoId').value = os.equipamento_id;
  document.getElementById('repStatusOS').value = os.status === 'aguardando_pcm' ? 'auditada_pcm' : os.status;
  document.getElementById('repHorimetro').value = os.horimetro_os || os.equipamentos?.horimetro_atual || 0;
  document.getElementById('repLocalFisico').value = os.localizacao || '';
  document.getElementById('repLocalPCM').value = os.local_manutencao_pcm || 'OFICINA';
  document.getElementById('repMotivo').value = os.motivo_rep || 'CORRETIVA';
  document.getElementById('repComponenteSelect').value = os.codigo_componente ? `${os.codigo_componente}|${os.nome_componente}` : '';
  document.getElementById('repOficinaExterna').value = os.oficina_externa || '';

  const paraInputLocal = (iso) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  document.getElementById('repDataEntrada').value = paraInputLocal(os.aberta_em);
  document.getElementById('repDataSaida').value = paraInputLocal(os.concluida_em) || paraInputLocal(new Date().toISOString());
  document.getElementById('repPrevisaoLiberacao').value = os.previsao_liberacao || '';
  document.getElementById('repMecanicosTexto').value = (os.executantes_nomes || []).join(' / ');
  document.getElementById('repProblemaTexto').value = os.descricao_problema || '';
  document.getElementById('repServicoTexto').value = os.servico_executado || '';
  document.getElementById('modalClassificarPCM').classList.remove('hidden');
}

function ajustarMotivoPorComponente() {
  const val = document.getElementById('repComponenteSelect').value;
  if (val.startsWith('PRE18|') || val.startsWith('PRE01|')) document.getElementById('repMotivo').value = 'PREVENTIVA';
  else if (val.startsWith('COR03|')) document.getElementById('repMotivo').value = 'FALHA OPERACIONAL';
}

function verificarSelecaoTerceiroPCM() {
  if (document.getElementById('repLocalPCM').value === 'TERCEIRO' && !document.getElementById('repOficinaExterna').value) {
    document.getElementById('repOficinaExterna').focus();
  }
}

async function salvarClassificacaoOuManualPCM() {
  if (!podeExecutarAcao('classificar_rep_pcm')) return;
  const osId = document.getElementById('repOsId').value;
  const eqId = document.getElementById('repEquipamentoId').value;
  const status = document.getElementById('repStatusOS').value;
  const horimetro_os = parseFloat(document.getElementById('repHorimetro').value) || null;
  const localizacao = document.getElementById('repLocalFisico').value.trim().toUpperCase();
  const local_manutencao_pcm = document.getElementById('repLocalPCM').value;
  const motivo_rep = document.getElementById('repMotivo').value;
  const compRaw = document.getElementById('repComponenteSelect').value;
  const [codigo_componente, nome_componente] = compRaw ? compRaw.split('|') : ['', ''];
  const oficina_externa = document.getElementById('repOficinaExterna').value.trim().toUpperCase();
  const manutencao_externa = Boolean(local_manutencao_pcm === 'TERCEIRO' || oficina_externa !== '');

  const dEntrada = document.getElementById('repDataEntrada').value;
  const dSaida = document.getElementById('repDataSaida').value;
  const previsao_liberacao = document.getElementById('repPrevisaoLiberacao').value || null;
  const mecsRaw = document.getElementById('repMecanicosTexto').value.trim().toUpperCase();
  const executantes_nomes = mecsRaw ? mecsRaw.split(/[/,]/).map(s => s.trim()).filter(Boolean) : [];
  const descricao_problema = document.getElementById('repProblemaTexto').value.trim().toUpperCase();
  const servico_executado = document.getElementById('repServicoTexto').value.trim().toUpperCase();

  if (!eqId || !descricao_problema || !dEntrada) return alert("Preencha Equipamento, Entrada e Problema!");

  const aberta_em = new Date(dEntrada).toISOString();
  const concluida_em = dSaida ? new Date(dSaida).toISOString() : null;
  const horasTurno = calcularHorasParadasTurnoVilasa(aberta_em, concluida_em);
  const tipo = motivo_rep === 'PREVENTIVA' ? 'preventiva' : (motivo_rep === 'FALHA OPERACIONAL' ? 'falha_operacional' : 'corretiva');

  const payload = {
    equipamento_id: eqId, tipo, motivo_rep, status, horimetro_os, localizacao, local_manutencao_pcm,
    codigo_componente, nome_componente, manutencao_externa, oficina_externa, aberta_em, concluida_em,
    previsao_liberacao, executantes_nomes, quantidade_executantes: Math.max(1, executantes_nomes.length),
    descricao_problema, servico_executado, tempo_efetivo_segundos: Math.round(horasTurno * 3600),
    classificada_pcm: Boolean(codigo_componente !== ''), classificada_por_nome: usuarioLogado.nome
  };

  if (osId) await db.from('ordens_servico').update(payload).eq('id', osId);
  else {
    payload.aberto_por = usuarioLogado.id;
    payload.aberto_por_nome = `PCM (${usuarioLogado.nome})`;
    await db.from('ordens_servico').insert([payload]);
  }

  const eq = cacheEquipamentos.find(e => e.id === eqId);
  if (eq && horimetro_os && horimetro_os > parseFloat(eq.horimetro_atual || 0)) {
    await db.from('equipamentos').update({ horimetro_atual: horimetro_os }).eq('id', eqId);
  }

  document.getElementById('modalClassificarPCM').classList.add('hidden');
  carregarOrdensServico(abaOSAtual);
}

function exportarOSExcel() {
  if (!podeExecutarAcao('exportar_relatorios')) return;
  const linhasREP = cacheOS.map(o => ({
    OS_NUMERO: o.numero_os, PATRIMONIO: o.equipamentos?.tag || '',
    DESCRICAO_EQUIPAMENTO: o.equipamentos?.nome || '', MARCA: o.equipamentos?.marca || '',
    LOCAL_FISICO: o.localizacao || '', LOCAL_MANUTENCAO_PCM: o.local_manutencao_pcm || '',
    MOTIVO: o.motivo_rep || o.tipo.toUpperCase(), COMPONENTE: o.codigo_componente || '',
    DESCRICAO_COMPONENTE: o.nome_componente || '', DESCRICAO_PROBLEMA: o.descricao_problema || '',
    STATUS: o.status.toUpperCase(), ENTRADA: o.aberta_em ? new Date(o.aberta_em).toLocaleString('pt-BR') : '',
    SAIDA: o.concluida_em ? new Date(o.concluida_em).toLocaleString('pt-BR') : '',
    HORIMETRO_KM: o.horimetro_os || o.equipamentos?.horimetro_atual || '',
    MECANICOS: (o.executantes_nomes || []).join(' / '), SERVICO_EXECUTADO: o.servico_executado || ''
  }));
  const ws = XLSX.utils.json_to_sheet(linhasREP);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BASE_REP");
  XLSX.writeFile(wb, `REP_Vilasa_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================================================
// MÓDULO 2: FROTA + PLANILHA PADRÃO DE EQUIPAMENTOS
// ============================================================================
function baixarPlanilhaPadraoFrota() {
  const modeloPadrao = [
    {
      TAG: "CB-14", DESCRICAO: "CAMINHAO BASCULANTE", UNIDADE: "KM", LEITURA_ATUAL: 125400,
      MARCA: "VOLKSWAGEN", MODELO: "31320", ANO: "2012", PLACA: "HBZ-1610",
      SERIE: "9534J8268AR001078", PROPRIETARIO: "VILASA", PREVENTIVA_NOSSA: "SIM"
    },
    {
      TAG: "EH-40", DESCRICAO: "ESCAVADEIRA HIDRAULICA", UNIDADE: "HORAS", LEITURA_ATUAL: 3120.5,
      MARCA: "CATERPILLAR", MODELO: "320D", ANO: "2020", PLACA: "",
      SERIE: "CAT0320D99812", PROPRIETARIO: "VILASA", PREVENTIVA_NOSSA: "SIM"
    }
  ];
  const ws = XLSX.utils.json_to_sheet(modeloPadrao);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "FROTA_PADRAO");
  XLSX.writeFile(wb, "Planilha_Padrao_Frota_Vilasa.xlsx");
}

function abrirModalImportarFrotaMassa() {
  if (!podeExecutarAcao('editar_frota')) return;
  document.getElementById('inputArquivoFrotaPadrao').value = '';
  document.getElementById('textoPreviaFrotaMassa').value = '';
  document.getElementById('statusImportFrotaMassa').innerText = '';
  document.getElementById('modalImportarFrotaMassa').classList.remove('hidden');
}

function lerPlanilhaPadraoFrota(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (json.length === 0) return alert("A planilha está vazia!");
    const linhasTexto = json.map(r => {
      const tag = r.TAG || r.PREFIXO || r.PREFIXOS || '';
      const desc = r.DESCRICAO || r.EQUIPAMENTO || '';
      const unid = r.UNIDADE || 'HORAS';
      const leit = r.LEITURA_ATUAL ?? r.HORIMETRO ?? 0;
      const marca = r.MARCA || '';
      const mod = r.MODELO || '';
      const ano = r.ANO || r.ANO_FABRICACAO || '';
      const placa = r.PLACA || '';
      const serie = r.SERIE || r.CHASSI || '';
      const prop = r.PROPRIETARIO || 'VILASA';
      const prev = r.PREVENTIVA_NOSSA || 'SIM';
      return `${tag} ; ${desc} ; ${unid} ; ${leit} ; ${marca} ; ${mod} ; ${ano} ; ${placa} ; ${serie} ; ${prop} ; ${prev}`;
    }).join('\n');
    document.getElementById('textoPreviaFrotaMassa').value = linhasTexto;
    document.getElementById('statusImportFrotaMassa').innerText = `${json.length} equipamento(s) lidos!`;
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportacaoFrotaMassa() {
  if (!podeExecutarAcao('editar_frota')) return;
  const raw = document.getElementById('textoPreviaFrotaMassa').value.trim();
  if (!raw) return alert("Selecione uma planilha primeiro!");
  const linhas = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const lote = [];
  for (const linha of linhas) {
    const cols = (linha.includes('\t') ? linha.split('\t') : linha.split(';')).map(c => c.trim());
    const tag = (cols[0] || '').toUpperCase();
    if (!tag || tag === 'TAG') continue;
    const nome = (cols[1] || 'EQUIPAMENTO').toUpperCase();
    const unidade_medida = (cols[2] || '').toUpperCase().includes('KM') ? 'KM' : 'HORAS';
    const horimetro_atual = parseFloat(String(cols[3] || '0').replace(',', '.')) || 0;
    const marca = (cols[4] || '').toUpperCase();
    const modelo = (cols[5] || '').toUpperCase();
    const ano_fabricacao = cols[6] || '';
    const placa = (cols[7] || '').toUpperCase();
    const numero_serie = (cols[8] || '').toUpperCase();
    const proprietario = (cols[9] || 'VILASA').toUpperCase().includes('TERC') ? 'TERCEIRO' : 'VILASA';
    const prevTxt = (cols[10] || 'SIM').toUpperCase();
    const preventiva_propria = !(prevTxt.includes('NAO') || prevTxt.includes('NÃO') || prevTxt === 'FALSE');
    const codigo_curto = `${tag.replace(/[^A-Z0-9]/g, '')}-${Math.floor(10 + Math.random() * 89)}`;
    lote.push({
      tag, nome, unidade_medida, horimetro_atual, marca, modelo, ano_fabricacao,
      placa, numero_serie, proprietario, preventiva_propria, setor: '', codigo_curto, ativo: true
    });
  }
  if (lote.length === 0) return alert("Nenhuma linha válida!");
  const { error } = await db.from('equipamentos').upsert(lote, { onConflict: 'tag' });
  if (error) return alert("Erro: " + error.message);
  alert(`Sucesso! ${lote.length} equipamentos importados!`);
  document.getElementById('modalImportarFrotaMassa').classList.add('hidden');
  carregarFrota('TODOS');
}

function abrirModalEquipamento() {
  if (!podeExecutarAcao('editar_frota')) return;
  document.getElementById('eqTag').value = '';
  document.getElementById('eqNome').value = '';
  document.getElementById('eqMarca').value = '';
  document.getElementById('eqModelo').value = '';
  document.getElementById('eqAno').value = '';
  document.getElementById('eqPlaca').value = '';
  document.getElementById('eqSerie').value = '';
  document.getElementById('eqHorimetro').value = '0';
  document.getElementById('eqUnidade').value = 'HORAS';
  document.getElementById('eqProprietario').value = 'VILASA';
  document.getElementById('eqPreventivaPropria').value = 'true';
  document.getElementById('modalEquipamento').classList.remove('hidden');
}

async function carregarFrota(filtroProp = 'TODOS') {
  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos.filter(e => e.ativo !== false);
  const spanCount = document.getElementById('countFrotaTodos');
  if (spanCount) spanCount.innerText = cacheEquipamentos.length;
  filtrarCardsFrota(filtroProp);
}

function filtrarCardsFrotaPorTexto() {
  const termo = (document.getElementById('buscaRapidaAbaFrota')?.value || '').toLowerCase().trim();
  const filtrados = cacheEquipamentos.filter(eq =>
    (eq.tag || '').toLowerCase().includes(termo) ||
    (eq.nome || '').toLowerCase().includes(termo) ||
    (eq.marca || '').toLowerCase().includes(termo) ||
    (eq.modelo || '').toLowerCase().includes(termo) ||
    (eq.placa || '').toLowerCase().includes(termo) ||
    (eq.numero_serie || '').toLowerCase().includes(termo)
  );
  renderizarListaCardsFrota(filtrados);
}

function filtrarCardsFrota(filtroProp) {
  const lista = filtroProp === 'TODOS' ? cacheEquipamentos : cacheEquipamentos.filter(e => (e.proprietario || 'VILASA') === filtroProp);
  renderizarListaCardsFrota(lista);
}

function renderizarListaCardsFrota(lista) {
  const container = document.getElementById('listaEquipamentos');
  if (lista.length === 0) {
    container.innerHTML = `<div class="col-span-full p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">Nenhum equipamento encontrado.</div>`;
    return;
  }
  container.innerHTML = lista.map(eq => {
    const sufixo = eq.unidade_medida === 'KM' ? 'km' : 'h';
    const ehProprio = (eq.proprietario || 'VILASA') === 'VILASA';
    return `
      <div class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-base font-black text-amber-600">${eq.tag}</span>
            <div class="flex gap-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded ${ehProprio ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}">${eq.proprietario || 'VILASA'}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${eq.preventiva_propria !== false ? 'Prev: Nossa' : 'Prev: Terceiro'}</span>
            </div>
          </div>
          <p class="text-xs font-bold text-slate-900 mt-1">${eq.nome}</p>
          <div class="text-[11px] text-slate-600 mt-1 space-y-0.5">
            <p>Marca/Modelo: <strong>${eq.marca || '-'} / ${eq.modelo || '-'}</strong> (${eq.ano_fabricacao || '-'})</p>
            <p>Placa / Série: <span class="font-mono">${eq.placa || '-'} / ${eq.numero_serie || '-'}</span></p>
          </div>
        </div>
        <div class="pt-3 border-t border-slate-200 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-500 block">${eq.unidade_medida === 'KM' ? 'Quilometragem' : 'Horímetro Atual'}</span>
            <span class="text-sm font-black text-emerald-600">${parseFloat(eq.horimetro_atual).toFixed(1)} ${sufixo}</span>
          </div>
          <button onclick="exibirEtiquetaQR('${eq.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
            <i class="fa-solid fa-qrcode text-amber-600"></i> QR Code
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function salvarEquipamento() {
  if (!podeExecutarAcao('editar_frota')) return;
  const tag = document.getElementById('eqTag').value.trim().toUpperCase();
  const nome = document.getElementById('eqNome').value.trim().toUpperCase();
  const marca = document.getElementById('eqMarca').value.trim().toUpperCase();
  const modelo = document.getElementById('eqModelo').value.trim().toUpperCase();
  const ano_fabricacao = document.getElementById('eqAno').value.trim();
  const placa = document.getElementById('eqPlaca').value.trim().toUpperCase();
  const numero_serie = document.getElementById('eqSerie').value.trim().toUpperCase();
  const unidade_medida = document.getElementById('eqUnidade').value;
  const horimetro_atual = parseFloat(document.getElementById('eqHorimetro').value) || 0;
  const proprietario = document.getElementById('eqProprietario').value;
  const preventiva_propria = document.getElementById('eqPreventivaPropria').value === 'true';

  if (!tag || !nome) return alert("Preencha TAG e Descrição!");
  const codigo_curto = `${tag.replace(/[^A-Z0-9]/g, '')}-${Math.floor(10 + Math.random() * 89)}`;

  const { error } = await db.from('equipamentos').insert([{
    tag, nome, marca, modelo, ano_fabricacao, placa, numero_serie, unidade_medida,
    proprietario, preventiva_propria, setor: '', horimetro_atual, codigo_curto
  }]);
  if (error) return alert("Erro: " + error.message);
  document.getElementById('modalEquipamento').classList.add('hidden');
  carregarFrota('TODOS');
}

function exibirEtiquetaQR(id) {
  const eq = cacheEquipamentos.find(e => e.id === id);
  if (!eq) return;
  document.getElementById('qrModalTag').innerText = eq.tag;
  document.getElementById('qrModalNome').innerText = `${eq.nome} (${eq.marca || ''} ${eq.modelo || ''})`;
  document.getElementById('qrModalCurto').innerText = eq.tag;
  const container = document.getElementById('qrcodeCanvas');
  container.innerHTML = '';
  const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
  new QRCode(container, { text: `${urlBase}/qr.html?token=${eq.qr_token}`, width: 160, height: 160 });
  document.getElementById('modalQrCode').classList.remove('hidden');
}

// ============================================================================
// MÓDULO 3: PCM PREVENTIVAS
// ============================================================================
async function abrirModalPlanoPreventiva() {
  if (!podeExecutarAcao('gerenciar_pcm')) return;
  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  const proprios = todos.filter(e => e.ativo !== false && e.preventiva_propria !== false);
  document.getElementById('pcmEquipamentoSelect').innerHTML = proprios.map(e => `<option value="${e.id}">${e.tag} - ${e.nome} (${e.horimetro_atual} ${e.unidade_medida === 'KM' ? 'km' : 'h'})</option>`).join('');
  document.getElementById('modalPlanoPCM').classList.remove('hidden');
}

async function salvarPlanoPCM() {
  if (!podeExecutarAcao('gerenciar_pcm')) return;
  const eqId = document.getElementById('pcmEquipamentoSelect').value;
  const base = parseFloat(document.getElementById('pcmIntervaloBase').value) || 250;
  const ultimo = parseFloat(document.getElementById('pcmUltimoHorimetro').value) || 0;
  const t250 = document.getElementById('pcmTarefas250').value.trim();
  const t500 = document.getElementById('pcmTarefas500').value.trim();
  const t1000 = document.getElementById('pcmTarefas1000').value.trim();

  if (!eqId || !t250) return alert("Preencha o equipamento e as tarefas base!");
  await db.from('planos_preventiva').insert([{
    equipamento_id: eqId, nome_plano: `Plano (${base}/${base*2}/${base*4})`,
    intervalo_horas: base, intervalo_base: base, ultimo_horimetro_executado: ultimo,
    tarefas_250: t250, tarefas_500: t500, tarefas_1000: t1000, checklist_tarefas: t250
  }]);
  document.getElementById('modalPlanoPCM').classList.add('hidden');
  carregarPCM();
}

async function carregarPCM() {
  const { data } = await db.from('planos_preventiva').select('*, equipamentos(id, tag, nome, horimetro_atual, unidade_medida)').eq('ativo', true);
  const container = document.getElementById('listaPlanosPCM');
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="col-span-full p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">Nenhum plano preventivo configurado.</div>`;
    return;
  }

  const podeGerenciar = podeExecutarAcao('gerenciar_pcm');
  container.innerHTML = data.map(p => {
    const sufixo = p.equipamentos?.unidade_medida === 'KM' ? 'km' : 'h';
    const base = parseFloat(p.intervalo_base || p.intervalo_horas || 250);
    const atual = parseFloat(p.equipamentos?.horimetro_atual || 0);
    const ultimo = parseFloat(p.ultimo_horimetro_executado || 0);
    const proxAlvo = ultimo + base;
    const falta = proxAlvo - atual;

    let nivelRevisao = `${base}${sufixo}`;
    let checklistAcumulado = `[${base}${sufixo}]: ${p.tarefas_250 || p.checklist_tarefas}`;
    if (proxAlvo % (base * 4) === 0) {
      nivelRevisao = `${base * 4}${sufixo} (Completa)`;
      checklistAcumulado = `[${base}${sufixo}]: ${p.tarefas_250 || ''} | [+${base*2}${sufixo}]: ${p.tarefas_500 || ''} | [+${base*4}${sufixo}]: ${p.tarefas_1000 || ''}`;
    } else if (proxAlvo % (base * 2) === 0) {
      nivelRevisao = `${base * 2}${sufixo} (Acumulada)`;
      checklistAcumulado = `[${base}${sufixo}]: ${p.tarefas_250 || ''} | [+${base*2}${sufixo}]: ${p.tarefas_500 || ''}`;
    }

    let cor = falta <= 0 ? 'border-rose-400 bg-rose-50/40' : 'border-emerald-300 bg-white';
    return `
      <div class="border ${cor} rounded-xl p-4 space-y-3 flex flex-col justify-between shadow-sm">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-base font-black text-slate-900">${p.equipamentos?.tag} - ${p.equipamentos?.nome}</span>
            <span class="text-xs font-black ${falta <= 0 ? 'text-rose-600' : 'text-emerald-600'}">${falta <= 0 ? `VENCIDA HÁ ${Math.abs(falta).toFixed(1)} ${sufixo}` : `Faltam ${falta.toFixed(1)} ${sufixo}`}</span>
          </div>
          <div class="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
            <p class="text-amber-700 font-bold">Próxima Revisão: ${nivelRevisao} (Alvo: ${proxAlvo} ${sufixo})</p>
            <p class="text-slate-700 text-[11px]">${checklistAcumulado}</p>
          </div>
        </div>
        ${podeGerenciar ? `
          <button onclick="abrirModalKitPreventiva('${p.id}', '${p.equipamentos?.id}', '${p.equipamentos?.tag}', '${nivelRevisao}', \`${checklistAcumulado.replace(/`/g, '')}\`, ${proxAlvo})"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs shadow-sm">
            Criar OS Preventiva + Atribuir Material do Almoxarifado
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function abrirModalKitPreventiva(planoId, eqId, tag, nivelRevisao, checklist, proxAlvo) {
  if (!podeExecutarAcao('gerenciar_pcm')) return;
  document.getElementById('kitPlanoId').value = planoId;
  document.getElementById('kitEqId').value = eqId;
  document.getElementById('kitProxAlvo').value = proxAlvo;
  document.getElementById('kitResumoEquipamento').innerText = `${tag} - Preventiva ${nivelRevisao}`;
  document.getElementById('kitResumoChecklist').innerText = checklist;

  const { data: pecas } = await db.from('pecas_estoque').select('*').eq('ativo', true).order('codigo');
  cachePecas = pecas || [];
  document.getElementById('listaPecasParaKitPreventiva').innerHTML = cachePecas.map(p => {
    const disp = parseFloat(p.saldo_atual) - parseFloat(p.quantidade_reservada || 0);
    return `
      <div class="flex items-center justify-between gap-2 p-1.5 border-b border-slate-200">
        <label class="flex items-center gap-2 flex-1 cursor-pointer">
          <input type="checkbox" value="${p.id}" class="chk-kit-peca rounded" />
          <span><strong>${p.codigo}</strong> - ${p.descricao} <span class="text-[10px] text-emerald-700 font-bold">(Disp: ${disp})</span></span>
        </label>
        <input type="number" id="qtdKitPeca-${p.id}" value="1" min="1" class="w-14 px-2 py-1 bg-white border border-slate-300 rounded text-center text-slate-900" />
      </div>
    `;
  }).join('');
  document.getElementById('modalGerarOSPreventivaKit').classList.remove('hidden');
}

async function confirmarCriacaoOSPreventivaComKit() {
  if (!podeExecutarAcao('gerenciar_pcm')) return;
  const planoId = document.getElementById('kitPlanoId').value;
  const eqId = document.getElementById('kitEqId').value;
  const proxAlvo = parseFloat(document.getElementById('kitProxAlvo').value);
  const titulo = document.getElementById('kitResumoEquipamento').innerText;
  const check = document.getElementById('kitResumoChecklist').innerText;

  const { data: novaOS, error } = await db.from('ordens_servico').insert([{
    equipamento_id: eqId, tipo: 'preventiva', motivo_rep: 'PREVENTIVA',
    codigo_componente: 'PRE18', nome_componente: 'MANUTENÇÃO PREVENTIVA PROGRAMADA',
    localizacao: 'OFICINA PREVENTIVA', local_manutencao_pcm: 'OFICINA',
    aberto_por: usuarioLogado.id, aberto_por_nome: `PCM (${usuarioLogado.nome})`,
    descricao_problema: `${titulo} -> ${check}`, status: 'aberta'
  }]).select().single();
  if (error) return alert("Erro: " + error.message);

  const checks = Array.from(document.querySelectorAll('.chk-kit-peca:checked'));
  for (const cb of checks) {
    const pecaId = cb.value;
    const qtd = parseFloat(document.getElementById(`qtdKitPeca-${pecaId}`).value) || 1;
    const peca = cachePecas.find(p => p.id === pecaId);
    await db.from('itens_os_estoque').insert([{
      peca_id: pecaId, os_id: novaOS.id, equipamento_id: eqId,
      tipo_movimento: 'reserva', quantidade: qtd,
      custo_unitario_congelado: peca ? peca.custo_unitario_atual : 0,
      status_baixa: 'reservado', observacao: `Kit ${titulo}`, solicitado_por: usuarioLogado.id
    }]);
    if (peca) {
      await db.from('pecas_estoque').update({
        quantidade_reservada: parseFloat(peca.quantidade_reservada || 0) + qtd
      }).eq('id', pecaId);
    }
  }

  await db.from('planos_preventiva').update({ ultimo_horimetro_executado: proxAlvo }).eq('id', planoId);
  document.getElementById('modalGerarOSPreventivaKit').classList.add('hidden');
  alert("OS Preventiva criada e peças reservadas!");
  carregarPCM();
}

// ============================================================================
// MÓDULO 4: ALMOXARIFADO (NOTAS MULTI-ITENS, SAÍDAS EM MASSA & FIFO)
// ============================================================================
function alternarAbaEstoque(sub) {
  document.getElementById('subEstoque-pecas').classList.toggle('hidden', sub !== 'pecas');
  document.getElementById('subEstoque-servicos').classList.toggle('hidden', sub !== 'servicos');
  document.getElementById('btnSubEstoque-pecas').className = sub === 'pecas'
    ? "px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white"
    : "px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300";
  document.getElementById('btnSubEstoque-servicos').className = sub === 'servicos'
    ? "px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 text-white"
    : "px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-purple-700 border border-purple-300";
}

async function consumirLotesFIFO(pecaId, qtdNecessaria) {
  const { data: lotes } = await db.from('lotes_estoque')
    .select('*').eq('peca_id', pecaId).gt('quantidade_restante', 0).order('data_entrada', { ascending: true });

  let faltaConsumir = qtdNecessaria;
  let custoTotalReal = 0;

  if (lotes && lotes.length > 0) {
    for (const lote of lotes) {
      if (faltaConsumir <= 0) break;
      const dispLote = parseFloat(lote.quantidade_restante);
      const retirar = Math.min(dispLote, faltaConsumir);
      custoTotalReal += retirar * parseFloat(lote.custo_unitario_real);
      faltaConsumir -= retirar;
      await db.from('lotes_estoque').update({ quantidade_restante: dispLote - retirar }).eq('id', lote.id);
    }
  }

  if (faltaConsumir > 0) {
    const peca = cachePecas.find(p => p.id === pecaId);
    custoTotalReal += faltaConsumir * parseFloat(peca?.custo_unitario_atual || 0);
  }

  return qtdNecessaria > 0 ? (custoTotalReal / qtdNecessaria) : 0;
}

function abrirModalNovaPeca() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  document.getElementById('pecaCodigo').value = `CAD-${Math.floor(100000 + Math.random() * 900000)}`;
  document.getElementById('pecaDescricao').value = '';
  document.getElementById('pecaEquivalentes').value = '';
  document.getElementById('pecaEquipamentos').value = '';
  document.getElementById('pecaLocal').value = '';
  document.getElementById('pecaSaldo').value = '0';
  document.getElementById('pecaCusto').value = '0.00';
  document.getElementById('modalPeca').classList.remove('hidden');
}

async function salvarPecaEstoque() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const codigo = document.getElementById('pecaCodigo').value.trim().toUpperCase();
  const unidade = document.getElementById('pecaUnidade').value.trim().toUpperCase() || 'UN';
  const localizacao = document.getElementById('pecaLocal').value.trim();
  const descricao = document.getElementById('pecaDescricao').value.trim().toUpperCase();
  const codigos_equivalentes = document.getElementById('pecaEquivalentes').value.trim();
  const equipamentos_aplicaveis = document.getElementById('pecaEquipamentos').value.trim().toUpperCase();
  const saldo_atual = parseFloat(document.getElementById('pecaSaldo').value) || 0;
  const estoque_minimo = parseFloat(document.getElementById('pecaMinimo').value) || 1;
  const custo_unitario_atual = parseFloat(document.getElementById('pecaCusto').value) || 0;

  if (!codigo || !descricao) return alert("Preencha a Descrição da Peça!");

  const { data: novaPeca, error } = await db.from('pecas_estoque').insert([{
    codigo, id_paralelo: codigo, unidade, localizacao, descricao, codigos_equivalentes, equipamentos_aplicaveis,
    aplicacao_apelidos: `${codigos_equivalentes} ${equipamentos_aplicaveis}`,
    saldo_atual, quantidade_reservada: 0, estoque_minimo, custo_unitario_atual
  }]).select().single();

  if (error) return alert("Erro ao cadastrar: " + error.message);

  if (saldo_atual > 0) {
    await db.from('lotes_estoque').insert([{
      peca_id: novaPeca.id, nota_fiscal: 'SALDO-INICIAL', fornecedor: 'CADASTRO',
      quantidade_inicial: saldo_atual, quantidade_restante: saldo_atual, custo_unitario_real: custo_unitario_atual
    }]);
  }

  document.getElementById('modalPeca').classList.add('hidden');
  carregarEstoque();
}

async function abrirModalEntradaNF() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const todosPecas = await buscarTudoSemLimite('pecas_estoque', 'codigo', true);
  cachePecas = todosPecas.filter(p => p.ativo !== false);
  const todosEqs = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todosEqs.filter(e => e.ativo !== false);

  document.getElementById('nfNumero').value = '';
  document.getElementById('nfFornecedor').value = '';
  document.getElementById('containerLinhasEntradaNF').innerHTML = '';
  contadorLinhaNF = 0;
  adicionarLinhaItemEntradaNF();
  document.getElementById('modalEntradaNF').classList.remove('hidden');
}

function adicionarLinhaItemEntradaNF() {
  contadorLinhaNF++;
  const idx = contadorLinhaNF;
  const opcoesPecas = cachePecas.map(p => `<option value="${p.id}">[${p.codigo}] ${p.descricao} (${p.codigos_equivalentes || 'Sem PNs'})</option>`).join('');
  const opcoesEqs = cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');

  const div = document.createElement('div');
  div.id = `linhaNF-${idx}`;
  div.className = "linha-item-nf p-3 bg-slate-50 border border-slate-300 rounded-xl space-y-2";
  div.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
      <div class="md:col-span-3">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Tipo do Item</label>
        <select id="nfTipo-${idx}" onchange="alternarTipoLinhaNF(${idx})" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800">
          <option value="ESTOCAVEL">Estocável (Vai p/ Estoque)</option>
          <option value="NAO_ESTOCAVEL">Não Estocável (Uso Direto)</option>
        </select>
      </div>
      <div id="nfBoxEstocavel-${idx}" class="md:col-span-5 grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Item Cadastrado (Grupo) *</label>
          <select id="nfPeca-${idx}" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold">${opcoesPecas}</select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-blue-700 mb-0.5">Fabricante / PN na Nota</label>
          <input type="text" id="nfPN-${idx}" placeholder="Ex: Tecfil PSL283" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900" />
        </div>
      </div>
      <div id="nfBoxNaoEstocavel-${idx}" class="hidden md:col-span-5 grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-amber-800 mb-0.5">Descrição Livre do Item *</label>
          <input type="text" id="nfDescLivre-${idx}" placeholder="Digite o material..." class="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900 font-semibold uppercase" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-amber-800 mb-0.5">Aplicado na Máquina *</label>
          <select id="nfEqDireto-${idx}" class="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900 font-bold">${opcoesEqs}</select>
        </div>
      </div>
      <div class="md:col-span-1">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Qtd *</label>
        <input type="number" step="0.01" id="nfQtd-${idx}" value="1" oninput="recalcularTotalNotaFiscal()" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900" />
      </div>
      <div class="md:col-span-2">
        <label class="block text-[10px] font-bold text-emerald-700 mb-0.5">Valor Unit. (R$) *</label>
        <input type="number" step="0.01" id="nfVal-${idx}" placeholder="0.00" oninput="recalcularTotalNotaFiscal()" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900" />
      </div>
      <div class="md:col-span-1 text-right">
        <button type="button" onclick="removerLinhaNF(${idx})" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg font-bold">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  document.getElementById('containerLinhasEntradaNF').appendChild(div);
  recalcularTotalNotaFiscal();
}

function alternarTipoLinhaNF(idx) {
  const tipo = document.getElementById(`nfTipo-${idx}`).value;
  document.getElementById(`nfBoxEstocavel-${idx}`).classList.toggle('hidden', tipo !== 'ESTOCAVEL');
  document.getElementById(`nfBoxNaoEstocavel-${idx}`).classList.toggle('hidden', tipo !== 'NAO_ESTOCAVEL');
}

function removerLinhaNF(idx) {
  const todas = document.querySelectorAll('.linha-item-nf');
  if (todas.length <= 1) return alert("A Nota Fiscal precisa ter pelo menos 1 item!");
  document.getElementById(`linhaNF-${idx}`)?.remove();
  recalcularTotalNotaFiscal();
}

function recalcularTotalNotaFiscal() {
  let total = 0;
  document.querySelectorAll('.linha-item-nf').forEach(div => {
    const idNum = div.id.split('-')[1];
    const q = parseFloat(document.getElementById(`nfQtd-${idNum}`)?.value) || 0;
    const v = parseFloat(document.getElementById(`nfVal-${idNum}`)?.value) || 0;
    total += (q * v);
  });
  document.getElementById('txtTotalGeralEntradaNF').innerText = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function confirmarEntradaNFMulti() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const nf = document.getElementById('nfNumero').value.trim();
  const fornecedor = document.getElementById('nfFornecedor').value.trim().toUpperCase();
  if (!nf) return alert("Informe o Número da Nota Fiscal no topo!");

  const divs = document.querySelectorAll('.linha-item-nf');
  let processados = 0;

  for (const div of divs) {
    const idx = div.id.split('-')[1];
    const tipo = document.getElementById(`nfTipo-${idx}`).value;
    const qtd = parseFloat(document.getElementById(`nfQtd-${idx}`).value) || 0;
    const custoRealNF = parseFloat(document.getElementById(`nfVal-${idx}`).value) || 0;
    if (qtd <= 0 || custoRealNF <= 0) continue;

    if (tipo === 'ESTOCAVEL') {
      const pecaId = document.getElementById(`nfPeca-${idx}`).value;
      const novoPN = document.getElementById(`nfPN-${idx}`).value.trim();
      if (!pecaId) continue;
      const { data: pecaAtual } = await db.from('pecas_estoque').select('*').eq('id', pecaId).single();
      if (!pecaAtual) continue;

      let equivalentesAtualizados = pecaAtual.codigos_equivalentes || '';
      if (novoPN && !equivalentesAtualizados.toLowerCase().includes(novoPN.toLowerCase())) {
        equivalentesAtualizados = equivalentesAtualizados ? `${equivalentesAtualizados} | ${novoPN}` : novoPN;
      }

      await db.from('lotes_estoque').insert([{
        peca_id: pecaId, nota_fiscal: nf, fornecedor: novoPN ? `${fornecedor} (${novoPN})` : fornecedor,
        quantidade_inicial: qtd, quantidade_restante: qtd, custo_unitario_real: custoRealNF
      }]);

      await db.from('itens_os_estoque').insert([{
        peca_id: pecaId, estocavel: true, part_number_nf: novoPN, tipo_movimento: 'entrada_nf',
        quantidade: qtd, custo_unitario_congelado: custoRealNF, nota_fiscal: nf, fornecedor,
        status_baixa: 'confirmado', solicitado_por: usuarioLogado.id, confirmado_por: usuarioLogado.id
      }]);

      await db.from('pecas_estoque').update({
        saldo_atual: parseFloat(pecaAtual.saldo_atual || 0) + qtd,
        custo_unitario_atual: custoRealNF,
        codigos_equivalentes: equivalentesAtualizados
      }).eq('id', pecaId);
      processados++;
    } else {
      const descLivre = document.getElementById(`nfDescLivre-${idx}`).value.trim().toUpperCase();
      const eqId = document.getElementById(`nfEqDireto-${idx}`).value;
      if (!descLivre || !eqId) continue;

      await db.from('itens_os_estoque').insert([{
        peca_id: null, equipamento_id: eqId, estocavel: false, descricao_livre: descLivre,
        tipo_movimento: 'saida_direta_nf', quantidade: qtd, custo_unitario_congelado: custoRealNF,
        nota_fiscal: nf, fornecedor, observacao: `NÃO ESTOCÁVEL (NF ${nf}): ${descLivre}`,
        status_baixa: 'confirmado', solicitado_por: usuarioLogado.id, confirmado_por: usuarioLogado.id
      }]);
      processados++;
    }
  }

  if (processados === 0) return alert("Preencha corretamente a Quantidade e o Valor Unitário dos itens!");
  alert(`Nota Fiscal ${nf} registrada com sucesso (${processados} itens processados)!`);
  document.getElementById('modalEntradaNF').classList.add('hidden');
  carregarEstoque();
}

async function abrirModalSaidaAvulsa() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const todosPecas = await buscarTudoSemLimite('pecas_estoque', 'codigo', true);
  cachePecas = todosPecas.filter(p => p.ativo !== false);
  const todosEqs = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todosEqs.filter(e => e.ativo !== false);

  document.getElementById('saidaNFGeral').value = '';
  document.getElementById('saidaObservacaoGeral').value = '';
  document.getElementById('containerLinhasSaidaAvulsa').innerHTML = '';
  contadorLinhaSaida = 0;
  adicionarLinhaSaidaAvulsa();
  document.getElementById('modalSaidaAvulsa').classList.remove('hidden');
}

function adicionarLinhaSaidaAvulsa() {
  contadorLinhaSaida++;
  const idx = contadorLinhaSaida;
  const opcoesPecas = cachePecas.map(p => `<option value="${p.id}">[${p.codigo}] ${p.descricao} (Saldo: ${p.saldo_atual})</option>`).join('');
  const opcoesEqs = cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');

  const div = document.createElement('div');
  div.id = `linhaSaida-${idx}`;
  div.className = "linha-item-saida p-3 bg-slate-50 border border-slate-300 rounded-xl";
  div.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
      <div class="md:col-span-3">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Tipo de Saída</label>
        <select id="saidaModo-${idx}" onchange="alternarModoLinhaSaida(${idx})" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800">
          <option value="FIFO_PRATELEIRA">Estocável Armazém (FIFO)</option>
          <option value="NAO_ESTOCAVEL_LIVRE">Não Estocável / Livre (NF)</option>
        </select>
      </div>
      <div id="saidaBoxArmazem-${idx}" class="md:col-span-4">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Peça do Armazém *</label>
        <select id="saidaPeca-${idx}" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold">${opcoesPecas}</select>
      </div>
      <div id="saidaBoxLivre-${idx}" class="hidden md:col-span-4 grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-amber-800 mb-0.5">Descrição Livre *</label>
          <input type="text" id="saidaDescLivre-${idx}" placeholder="Nome da peça/item..." class="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900 font-semibold uppercase" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-emerald-700 mb-0.5">Valor Unit. Real (R$) *</label>
          <input type="number" step="0.01" id="saidaValLivre-${idx}" placeholder="0.00" class="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900 font-bold" />
        </div>
      </div>
      <div class="md:col-span-1">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Qtd *</label>
        <input type="number" step="0.01" id="saidaQtd-${idx}" value="1" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900" />
      </div>
      <div class="md:col-span-3">
        <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Equipamento Destino *</label>
        <select id="saidaEq-${idx}" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold">${opcoesEqs}</select>
      </div>
      <div class="md:col-span-1 text-right">
        <button type="button" onclick="removerLinhaSaida(${idx})" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg font-bold">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  document.getElementById('containerLinhasSaidaAvulsa').appendChild(div);
  atualizarContadorLinhasSaida();
}

function alternarModoLinhaSaida(idx) {
  const modo = document.getElementById(`saidaModo-${idx}`).value;
  document.getElementById(`saidaBoxArmazem-${idx}`).classList.toggle('hidden', modo !== 'FIFO_PRATELEIRA');
  document.getElementById(`saidaBoxLivre-${idx}`).classList.toggle('hidden', modo !== 'NAO_ESTOCAVEL_LIVRE');
}

function removerLinhaSaida(idx) {
  const todas = document.querySelectorAll('.linha-item-saida');
  if (todas.length <= 1) return alert("Mantenha pelo menos 1 linha na saída!");
  document.getElementById(`linhaSaida-${idx}`)?.remove();
  atualizarContadorLinhasSaida();
}

function atualizarContadorLinhasSaida() {
  const qtd = document.querySelectorAll('.linha-item-saida').length;
  document.getElementById('txtTotalLinhasSaida').innerText = `${qtd} Item(ns)`;
}

async function confirmarSaidaAvulsaMulti() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const nfGeral = document.getElementById('saidaNFGeral').value.trim();
  const obsGeral = document.getElementById('saidaObservacaoGeral').value.trim();
  const divs = document.querySelectorAll('.linha-item-saida');
  let processados = 0;

  for (const div of divs) {
    const idx = div.id.split('-')[1];
    const modo = document.getElementById(`saidaModo-${idx}`).value;
    const qtd = parseFloat(document.getElementById(`saidaQtd-${idx}`).value) || 0;
    const eqId = document.getElementById(`saidaEq-${idx}`).value;
    if (qtd <= 0 || !eqId) continue;

    if (modo === 'NAO_ESTOCAVEL_LIVRE') {
      const descLivre = document.getElementById(`saidaDescLivre-${idx}`).value.trim().toUpperCase();
      const valLivre = parseFloat(document.getElementById(`saidaValLivre-${idx}`).value) || 0;
      if (!descLivre || valLivre <= 0) continue;

      await db.from('itens_os_estoque').insert([{
        peca_id: null, equipamento_id: eqId, estocavel: false, descricao_livre: descLivre,
        tipo_movimento: 'saida_direta_nf', quantidade: qtd, custo_unitario_congelado: valLivre,
        nota_fiscal: nfGeral, observacao: `NÃO ESTOCÁVEL: ${descLivre} ${obsGeral ? '- ' + obsGeral : ''}`,
        status_baixa: 'confirmado', solicitado_por: usuarioLogado.id, confirmado_por: usuarioLogado.id
      }]);
      processados++;
    } else {
      const pecaId = document.getElementById(`saidaPeca-${idx}`).value;
      if (!pecaId) continue;
      const custoUnitFIFO = await consumirLotesFIFO(pecaId, qtd);
      const { data: pecaAtual } = await db.from('pecas_estoque').select('saldo_atual').eq('id', pecaId).single();

      await db.from('itens_os_estoque').insert([{
        peca_id: pecaId, equipamento_id: eqId, estocavel: true, tipo_movimento: 'saida_avulsa',
        quantidade: qtd, custo_unitario_congelado: custoUnitFIFO, nota_fiscal: nfGeral, observacao: obsGeral,
        status_baixa: 'confirmado', solicitado_por: usuarioLogado.id, confirmado_por: usuarioLogado.id
      }]);

      if (pecaAtual) {
        await db.from('pecas_estoque').update({
          saldo_atual: parseFloat(pecaAtual.saldo_atual || 0) - qtd
        }).eq('id', pecaId);
      }
      processados++;
    }
  }

  if (processados === 0) return alert("Preencha corretamente os campos dos itens para confirmar a saída!");
  alert(`Saída em massa concluída (${processados} itens baixados)!`);
  document.getElementById('modalSaidaAvulsa').classList.add('hidden');
  carregarEstoque();
}

async function requisitarPecaNaOS(osId, eqId) {
  if (!podeExecutarAcao('reservar_material')) return;
  const pecaId = document.getElementById(`selPecaOS-${osId}`).value;
  const qtd = parseFloat(document.getElementById(`qtdPecaOS-${osId}`).value) || 1;
  if (!pecaId) return alert("Selecione a peça!");
  const peca = cachePecas.find(p => p.id === pecaId);
  await db.from('itens_os_estoque').insert([{
    peca_id: pecaId, os_id: osId, equipamento_id: eqId, tipo_movimento: 'saida_os',
    quantidade: qtd, custo_unitario_congelado: peca ? peca.custo_unitario_atual : 0,
    status_baixa: 'reservado', solicitado_por: usuarioLogado.id
  }]);
  if (peca) {
    await db.from('pecas_estoque').update({
      quantidade_reservada: parseFloat(peca.quantidade_reservada || 0) + qtd
    }).eq('id', pecaId);
  }
  alert("Material reservado para esta OS!");
}

async function abrirModalReservaMaterial() {
  if (!podeExecutarAcao('reservar_material')) return;
  const todosPecas = await buscarTudoSemLimite('pecas_estoque', 'codigo', true);
  cachePecas = todosPecas.filter(p => p.ativo !== false);
  document.getElementById('resPecaSelect').innerHTML = cachePecas.map(p => `<option value="${p.id}">[${p.codigo}] ${p.descricao} (Disp: ${p.saldo_atual - (p.quantidade_reservada || 0)})</option>`).join('');
  const todosEqs = await buscarTudoSemLimite('equipamentos', 'tag', true);
  document.getElementById('resEquipamentoSelect').innerHTML = todosEqs.filter(e => e.ativo !== false).map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');
  const { data: oss } = await db.from('ordens_servico').select('id, numero_os, descricao_problema').in('status', ['aberta', 'em_execucao', 'pausada_peca']);
  document.getElementById('resOsSelect').innerHTML = `<option value="">-- Reserva Avulsa --</option>` +
    (oss || []).map(o => `<option value="${o.id}">OS #${o.numero_os} - ${o.descricao_problema.substring(0, 30)}</option>`).join('');
  document.getElementById('modalReservaMaterial').classList.remove('hidden');
}

async function confirmarReservaUniversal() {
  if (!podeExecutarAcao('reservar_material')) return;
  const pecaId = document.getElementById('resPecaSelect').value;
  const qtd = parseFloat(document.getElementById('resQuantidade').value) || 1;
  const eqId = document.getElementById('resEquipamentoSelect').value;
  const osId = document.getElementById('resOsSelect').value || null;
  const obs = document.getElementById('resObservacao').value.trim();
  const peca = cachePecas.find(p => p.id === pecaId);

  await db.from('itens_os_estoque').insert([{
    peca_id: pecaId, os_id: osId, equipamento_id: eqId, tipo_movimento: 'reserva',
    quantidade: qtd, custo_unitario_congelado: peca ? peca.custo_unitario_atual : 0,
    status_baixa: 'reservado', observacao: obs, solicitado_por: usuarioLogado.id
  }]);
  await db.from('pecas_estoque').update({
    quantidade_reservada: parseFloat(peca.quantidade_reservada || 0) + qtd
  }).eq('id', pecaId);
  document.getElementById('modalReservaMaterial').classList.add('hidden');
  carregarEstoque();
}

async function confirmarBaixaAlmoxarife(itemId, pecaId, qtd) {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const custoUnitFIFO = await consumirLotesFIFO(pecaId, qtd);
  const { data: peca } = await db.from('pecas_estoque').select('*').eq('id', pecaId).single();
  await db.from('itens_os_estoque').update({
    status_baixa: 'confirmado', custo_unitario_congelado: custoUnitFIFO, confirmado_por: usuarioLogado.id
  }).eq('id', itemId);
  if (peca) {
    await db.from('pecas_estoque').update({
      saldo_atual: parseFloat(peca.saldo_atual || 0) - qtd,
      quantidade_reservada: Math.max(0, parseFloat(peca.quantidade_reservada || 0) - qtd)
    }).eq('id', pecaId);
  }
  carregarEstoque();
}

async function cancelarReservaAlmoxarife(itemId, pecaId, qtd) {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const { data: peca } = await db.from('pecas_estoque').select('*').eq('id', pecaId).single();
  await db.from('itens_os_estoque').update({ status_baixa: 'cancelado' }).eq('id', itemId);
  if (peca) {
    await db.from('pecas_estoque').update({
      quantidade_reservada: Math.max(0, parseFloat(peca.quantidade_reservada || 0) - qtd)
    }).eq('id', pecaId);
  }
  carregarEstoque();
}

async function abrirModalServicoTerceiro() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const todosEqs = await buscarTudoSemLimite('equipamentos', 'tag', true);
  document.getElementById('srvEquipamentoSelect').innerHTML = todosEqs.filter(e => e.ativo !== false).map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('');
  document.getElementById('srvFornecedor').value = '';
  document.getElementById('srvCusto').value = '';
  document.getElementById('srvData').value = new Date().toISOString().split('T')[0];
  document.getElementById('srvNF').value = '';
  document.getElementById('srvDescricao').value = '';
  document.getElementById('modalServicoTerceiro').classList.remove('hidden');
}

async function salvarServicoTerceiro() {
  if (!podeExecutarAcao('operar_almoxarifado')) return;
  const equipamento_id = document.getElementById('srvEquipamentoSelect').value;
  const fornecedor = document.getElementById('srvFornecedor').value.trim().toUpperCase();
  const custo = parseFloat(document.getElementById('srvCusto').value) || 0;
  const data_servico = document.getElementById('srvData').value;
  const nota_fiscal = document.getElementById('srvNF').value.trim();
  const descricao = document.getElementById('srvDescricao').value.trim();
  if (!equipamento_id || !fornecedor || custo <= 0 || !descricao) return alert("Preencha todos os campos obrigatórios!");

  await db.from('servicos_almoxarifado').insert([{
    equipamento_id, fornecedor, custo, data_servico, nota_fiscal, descricao, registrado_por: usuarioLogado.id
  }]);
  document.getElementById('modalServicoTerceiro').classList.add('hidden');
  alternarAbaEstoque('servicos');
  carregarEstoque();
}

async function carregarEstoque() {
  const podeBaixar = podeExecutarAcao('operar_almoxarifado');
  const { data: pendentes } = await db.from('itens_os_estoque')
    .select('*, pecas_estoque(codigo, descricao), ordens_servico(numero_os), equipamentos(tag)')
    .in('status_baixa', ['reservado', 'pendente_almoxarife']);

  const divPend = document.getElementById('listaBaixasPendentes');
  if (!pendentes || pendentes.length === 0) {
    divPend.innerHTML = `<p class="text-slate-500">Nenhuma reserva ou requisição pendente.</p>`;
  } else {
    divPend.innerHTML = pendentes.map(item => `
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
        <div>
          <span class="font-bold text-amber-700">${item.ordens_servico ? 'OS #' + item.ordens_servico.numero_os : 'RESERVA'} (${item.equipamentos?.tag || '-'})</span> &bull;
          <span class="text-slate-900 font-bold">${item.quantidade}x [${item.pecas_estoque?.codigo}] ${item.pecas_estoque?.descricao}</span>
        </div>
        ${podeBaixar ? `
          <div class="flex gap-2">
            <button onclick="confirmarBaixaAlmoxarife('${item.id}', '${item.peca_id}', ${item.quantidade})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-xs">Dar Baixa (FIFO)</button>
            <button onclick="cancelarReservaAlmoxarife('${item.id}', '${item.peca_id}', ${item.quantidade})" class="bg-slate-200 hover:bg-rose-100 text-slate-700 px-2.5 py-1 rounded text-xs font-bold">Devolver</button>
          </div>
        ` : '<span class="text-[11px] text-amber-700 font-bold">Aguardando Almoxarife</span>'}
      </div>
    `).join('');
  }

  const todosPecas = await buscarTudoSemLimite('pecas_estoque', 'codigo', true);
  cachePecas = todosPecas.filter(p => p.ativo !== false);
  renderizarTabelaCatalogo(cachePecas);

  const { data: lotes } = await db.from('lotes_estoque')
    .select('*, pecas_estoque(codigo, descricao)').gt('quantidade_restante', 0).order('data_entrada', { ascending: true });

  document.getElementById('listaLotesFIFO').innerHTML = `
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="py-1.5">Ordem FIFO</th><th>Data</th><th>Nº Cadastro / Peça</th><th>Nota Fiscal</th><th>Fornecedor / PN</th><th>Restante</th><th>Custo Real</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${(lotes || []).map((l, idx) => `
          <tr>
            <td class="py-1.5 font-mono text-amber-700 font-bold">#${idx + 1}</td>
            <td>${new Date(l.data_entrada).toLocaleDateString('pt-BR')}</td>
            <td class="font-bold text-slate-900">[${l.pecas_estoque?.codigo}] ${l.pecas_estoque?.descricao}</td>
            <td class="text-blue-700 font-bold">${l.nota_fiscal}</td>
            <td>${l.fornecedor || '-'}</td>
            <td class="font-bold text-emerald-700">${l.quantidade_restante}</td>
            <td class="font-bold text-slate-900">R$ ${parseFloat(l.custo_unitario_real).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const { data: servicos } = await db.from('servicos_almoxarifado').select('*, equipamentos(tag, nome)').order('data_servico', { ascending: false });
  document.getElementById('listaServicosTerceiros').innerHTML = `
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600"><th class="py-2">Data</th><th>Equipamento</th><th>Fornecedor</th><th>Descrição</th><th>NF</th><th>Custo (R$)</th></tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${(servicos || []).map(s => `
          <tr>
            <td class="py-2">${new Date(s.data_servico + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td class="font-bold text-amber-700">${s.equipamentos?.tag} - ${s.equipamentos?.nome}</td>
            <td class="font-bold text-slate-900">${s.fornecedor}</td>
            <td>${s.descricao}</td>
            <td>${s.nota_fiscal || '-'}</td>
            <td class="font-black text-purple-700">R$ ${parseFloat(s.custo).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderizarTabelaCatalogo(lista) {
  document.getElementById('listaCatalogoPecas').innerHTML = `
    <table class="w-full text-left text-xs">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="py-2">Nº Cadastro (Grupo)</th><th>Descrição Unificada</th><th>Fabricantes / Part Numbers Paralelos Atrelados</th><th>Máquinas</th><th>Físico</th><th>Reservado</th><th>Disponível</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${lista.map(p => {
          const fisico = parseFloat(p.saldo_atual || 0);
          const res = parseFloat(p.quantidade_reservada || 0);
          const disp = fisico - res;
          return `
            <tr>
              <td class="py-2 font-mono font-black text-amber-700">${p.codigo}</td>
              <td class="font-bold text-slate-900">${p.descricao}</td>
              <td class="text-blue-700 font-medium">${p.codigos_equivalentes || '-'}</td>
              <td class="text-emerald-700 font-semibold">${p.equipamentos_aplicaveis || '-'}</td>
              <td class="font-bold">${fisico} ${p.unidade}</td>
              <td class="font-bold text-amber-600">${res}</td>
              <td class="font-black ${disp <= p.estoque_minimo ? 'text-rose-600' : 'text-emerald-600'}">${disp} ${p.unidade}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function filtrarTabelaEstoque() {
  const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase();
  renderizarTabelaCatalogo(cachePecas.filter(p =>
    (p.codigo || '').toLowerCase().includes(termo) ||
    (p.descricao || '').toLowerCase().includes(termo) ||
    (p.codigos_equivalentes || '').toLowerCase().includes(termo) ||
    (p.equipamentos_aplicaveis || '').toLowerCase().includes(termo)
  ));
}

// ============================================================================
// MÓDULO 5: KPIs E RELATÓRIOS
// ============================================================================
async function inicializarTelaKPIs() {
  const todosEqs = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todosEqs.filter(e => e.ativo !== false);
  const sel = document.getElementById('kpiFiltroEquipamento');
  sel.innerHTML = `<option value="TODOS">Todos da Seleção</option>` +
    cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome} (${e.proprietario || 'VILASA'})</option>`).join('');
  calcularSuperKPIs();
}

async function calcularSuperKPIs() {
  const propFiltro = document.getElementById('kpiFiltroProprietario').value;
  const eqFiltro = document.getElementById('kpiFiltroEquipamento').value;
  const dInicio = document.getElementById('kpiDataInicio').value;
  const dFim = document.getElementById('kpiDataFim').value;
  const tempoMissao = parseFloat(document.getElementById('kpiTempoMissao').value) || 24;

  const labelMissao = tempoMissao === 24 ? '24 Horas' : (tempoMissao === 168 ? '1 Semana' : '1 Mês');
  document.getElementById('kpiSubConfiabilidade').innerText = `Missão: ${labelMissao}`;
  document.getElementById('subtituloPeriodoKPIs').innerText = `Período analisado: ${dInicio || 'Início'} até ${dFim || 'Hoje'} | Missão Confiabilidade: ${labelMissao}`;

  const inicioISO = dInicio ? `${dInicio}T00:00:00.000Z` : '2020-01-01T00:00:00.000Z';
  const fimISO = dFim ? `${dFim}T23:59:59.999Z` : new Date().toISOString();

  const diasPeriodo = Math.max(1, (new Date(fimISO) - new Date(inicioISO)) / (24 * 3600000));
  const horasProgPorMaquina = diasPeriodo * 10.3333;

  const { data: lotesAtivos } = await db.from('lotes_estoque').select('quantidade_restante, custo_unitario_real').gt('quantidade_restante', 0);
  const valorRealEstoque = (lotesAtivos || []).reduce((acc, l) => acc + (parseFloat(l.quantidade_restante) * parseFloat(l.custo_unitario_real)), 0);
  document.getElementById('kpiCardValorEstoque').innerText = `R$ ${valorRealEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const { data: todasOS } = await db.from('ordens_servico').select('*').gte('aberta_em', inicioISO).lte('aberta_em', fimISO).limit(5000);
  const { data: movsEstoque } = await db.from('itens_os_estoque').select('*, ordens_servico(equipamento_id)')
    .in('tipo_movimento', ['saida_os', 'saida_avulsa', 'saida_direta_nf']).eq('status_baixa', 'confirmado')
    .gte('created_at', inicioISO).lte('created_at', fimISO);
  const { data: servicos } = await db.from('servicos_almoxarifado').select('*')
    .gte('data_servico', dInicio || '2020-01-01').lte('data_servico', dFim || '2099-12-31');

  const calcularMetricasGrupo = (listaMaquinas) => {
    let hProg = 0, hParadas = 0, qtdCorr = 0, qtdExt = 0, custoTotal = 0;
    const linhas = listaMaquinas.map(eq => {
      const osEq = (todasOS || []).filter(o => o.equipamento_id === eq.id);
      const corrEq = osEq.filter(o => (o.motivo_rep || o.tipo.toUpperCase()) === 'CORRETIVA');
      const extEq = osEq.filter(o => o.manutencao_externa === true || o.local_manutencao_pcm === 'TERCEIRO');

      let hParadaEq = 0;
      osEq.forEach(o => { hParadaEq += calcularHorasParadasTurnoVilasa(o.aberta_em, o.concluida_em); });
      hParadaEq = Math.min(horasProgPorMaquina, hParadaEq);

      const hDispEq = Math.max(0, horasProgPorMaquina - hParadaEq);
      const dfEq = (hDispEq / horasProgPorMaquina) * 100;
      const falhas = corrEq.length;
      const mtbfEq = falhas > 0 ? (hDispEq / falhas) : hDispEq;
      const mttrEq = falhas > 0 ? (hParadaEq / falhas) : 0;
      const confEq = falhas > 0 ? (Math.exp(-tempoMissao / Math.max(0.1, mtbfEq)) * 100) : 100;

      const custoPecasEq = (movsEstoque || []).reduce((acc, m) => {
        const vinc = m.equipamento_id || m.ordens_servico?.equipamento_id;
        return vinc === eq.id ? acc + (parseFloat(m.quantidade || 0) * parseFloat(m.custo_unitario_congelado || 0)) : acc;
      }, 0);

      const custoServEq = (servicos || []).reduce((acc, s) => s.equipamento_id === eq.id ? acc + parseFloat(s.custo || 0) : acc, 0);
      const gastoMaquina = custoPecasEq + custoServEq;

      hProg += horasProgPorMaquina;
      hParadas += hParadaEq;
      qtdCorr += falhas;
      qtdExt += extEq.length;
      custoTotal += gastoMaquina;

      return {
        tag: eq.tag, nome: eq.nome, proprietario: eq.proprietario || 'VILASA',
        leitura_atual: `${parseFloat(eq.horimetro_atual).toFixed(1)} ${eq.unidade_medida === 'KM' ? 'km' : 'h'}`,
        qtd_corretivas: falhas, qtd_externas: extEq.length,
        horas_paradas: hParadaEq, mtbf: mtbfEq, mttr: mttrEq, df: dfEq, confiabilidade: confEq,
        custo_pecas: custoPecasEq, custo_servicos: custoServEq, custo_total: gastoMaquina
      };
    });

    const hDisp = Math.max(0, hProg - hParadas);
    const df = hProg > 0 ? (hDisp / hProg) * 100 : 100;
    const mtbf = qtdCorr > 0 ? (hDisp / qtdCorr) : hDisp;
    const mttr = qtdCorr > 0 ? (hParadas / qtdCorr) : 0;
    const conf = qtdCorr > 0 ? (Math.exp(-tempoMissao / Math.max(0.1, mtbf)) * 100) : 100;
    return { df, mtbf, mttr, conf, hParadas, qtdCorr, qtdExt, custoTotal, linhas };
  };

  const metVilasa = calcularMetricasGrupo(cacheEquipamentos.filter(e => (e.proprietario || 'VILASA') === 'VILASA'));
  const metTerc = calcularMetricasGrupo(cacheEquipamentos.filter(e => e.proprietario === 'TERCEIRO'));

  document.getElementById('resumoComparativoVilasa').innerHTML = `
    <div><span class="text-slate-500 block">Disp. (DF)</span><strong class="text-emerald-700 text-sm">${metVilasa.df.toFixed(1)}%</strong></div>
    <div><span class="text-slate-500 block">MTBF / MTTR</span><strong class="text-slate-900 text-sm">${metVilasa.mtbf.toFixed(0)}h / ${metVilasa.mttr.toFixed(1)}h</strong></div>
    <div><span class="text-slate-500 block">Horas Paradas</span><strong class="text-rose-600 text-sm">${metVilasa.hParadas.toFixed(1)}h</strong></div>
    <div><span class="text-slate-500 block">Gasto Total</span><strong class="text-amber-700 text-sm">R$ ${metVilasa.custoTotal.toFixed(0)}</strong></div>
  `;
  document.getElementById('resumoComparativoTerceiros').innerHTML = `
    <div><span class="text-slate-500 block">Disp. (DF)</span><strong class="text-amber-700 text-sm">${metTerc.df.toFixed(1)}%</strong></div>
    <div><span class="text-slate-500 block">MTBF / MTTR</span><strong class="text-slate-900 text-sm">${metTerc.mtbf.toFixed(0)}h / ${metTerc.mttr.toFixed(1)}h</strong></div>
    <div><span class="text-slate-500 block">Horas Paradas</span><strong class="text-rose-600 text-sm">${metTerc.hParadas.toFixed(1)}h</strong></div>
    <div><span class="text-slate-500 block">Gasto Total</span><strong class="text-amber-700 text-sm">R$ ${metTerc.custoTotal.toFixed(0)}</strong></div>
  `;

  let maquinasFoco = cacheEquipamentos;
  if (propFiltro !== 'GERAL') maquinasFoco = maquinasFoco.filter(e => (e.proprietario || 'VILASA') === propFiltro);
  if (eqFiltro !== 'TODOS') maquinasFoco = maquinasFoco.filter(e => e.id === eqFiltro);

  const metFoco = calcularMetricasGrupo(maquinasFoco);
  ultimoRelatorioKPIs = metFoco.linhas;

  document.getElementById('kpiCardDF').innerText = `${metFoco.df.toFixed(1)}%`;
  document.getElementById('kpiCardConfiabilidade').innerText = `${metFoco.conf.toFixed(1)}%`;
  document.getElementById('kpiCardMTBF').innerText = `${metFoco.mtbf.toFixed(1)} h`;
  document.getElementById('kpiCardMTTR').innerText = `${metFoco.mttr.toFixed(1)} h`;
  document.getElementById('kpiCardTempoParado').innerText = `${metFoco.hParadas.toFixed(1)} h`;
  document.getElementById('kpiCardExternas').innerText = `${metFoco.qtdExt}`;
  document.getElementById('kpiCardGastoPeriodo').innerText = `R$ ${metFoco.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById('tabelaKpisPorEquipamento').innerHTML = `
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="py-2">Equipamento</th><th>Vínculo</th><th>Leitura</th><th>Falhas</th><th>OS Fora</th><th>Tempo Parado</th><th>MTBF</th><th>MTTR</th><th>DF (%)</th><th>Confiab. R(t)</th><th>Peças (R$)</th><th>Serviços (R$)</th><th>Total Gasto</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${ultimoRelatorioKPIs.map(r => `
          <tr>
            <td class="py-2 font-bold text-amber-700">${r.tag} <span class="text-slate-500 font-normal">- ${r.nome}</span></td>
            <td><span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${r.proprietario === 'VILASA' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.proprietario}</span></td>
            <td class="font-mono">${r.leitura_atual}</td>
            <td class="font-bold">${r.qtd_corretivas}</td>
            <td class="text-purple-700 font-bold">${r.qtd_externas}</td>
            <td class="text-rose-600 font-bold">${r.horas_paradas.toFixed(1)} h</td>
            <td class="text-blue-700 font-bold">${r.mtbf.toFixed(1)} h</td>
            <td class="text-amber-700 font-bold">${r.mttr.toFixed(1)} h</td>
            <td class="font-bold ${r.df >= 85 ? 'text-emerald-600' : 'text-rose-600'}">${r.df.toFixed(1)}%</td>
            <td class="font-bold text-cyan-700">${r.confiabilidade.toFixed(1)}%</td>
            <td>R$ ${r.custo_pecas.toFixed(2)}</td>
            <td>R$ ${r.custo_servicos.toFixed(2)}</td>
            <td class="font-black text-emerald-700">R$ ${r.custo_total.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function exportarRelatorioKPIsExcel() {
  if (!ultimoRelatorioKPIs || ultimoRelatorioKPIs.length === 0) return alert("Gere os indicadores primeiro!");
  const ws = XLSX.utils.json_to_sheet(ultimoRelatorioKPIs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KPIs_Equipamentos");
  XLSX.writeFile(wb, `KPIs_Vilasa_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================================================
// MÓDULO 6: ADMIN (SEM LIMITE DE 100 LINHAS + PLANILHA PADRÃO DO REP)
// ============================================================================
function AlternarAbaAdmin(aba) {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  document.querySelectorAll('.aba-admin-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`abaAdmin-${aba}`).classList.remove('hidden');
  ['editor', 'importador', 'backup', 'usuarios'].forEach(item => {
    document.getElementById(`btnAbaAdmin-${item}`).className = (item === aba)
      ? "px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white"
      : "px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300";
  });
}

// 6.1 EDITOR UNIVERSAL SEM LIMITE DE 100 ITENS (COM BUSCA E PAGINAÇÃO)
async function carregarTabelaEditorAdmin() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const tabela = document.getElementById('selectTabelaEditorAdmin').value;
  const container = document.getElementById('containerTabelaEditorAdmin');
  container.innerHTML = `<p class="text-amber-600 font-bold py-4"><i class="fa-solid fa-spinner fa-spin"></i> Carregando todos os registros da tabela ${tabela}...</p>`;

  cacheRegistrosEditorAdmin = await buscarTudoSemLimite(tabela, null);
  listaFiltradaAdmin = [...cacheRegistrosEditorAdmin];
  paginaAtualAdmin = 1;
  renderizarTabelaPaginadaAdmin('');
}

function filtrarRegistrosEditorAdmin(termo) {
  const t = (termo || '').toLowerCase().trim();
  if (!t) {
    listaFiltradaAdmin = [...cacheRegistrosEditorAdmin];
  } else {
    listaFiltradaAdmin = cacheRegistrosEditorAdmin.filter(reg =>
      Object.values(reg).some(val => String(val ?? '').toLowerCase().includes(t))
    );
  }
  paginaAtualAdmin = 1;
  renderizarTabelaPaginadaAdmin(termo);
}

function mudarPaginaAdmin(delta) {
  const totalPaginas = Math.max(1, Math.ceil(listaFiltradaAdmin.length / ITENS_POR_PAGINA_ADMIN));
  paginaAtualAdmin = Math.min(totalPaginas, Math.max(1, paginaAtualAdmin + delta));
  const inputBusca = document.getElementById('inputBuscaEditorAdmin');
  renderizarTabelaPaginadaAdmin(inputBusca ? inputBusca.value : '');
}

function renderizarTabelaPaginadaAdmin(termoMantido = '') {
  const container = document.getElementById('containerTabelaEditorAdmin');
  if (cacheRegistrosEditorAdmin.length === 0) {
    container.innerHTML = `<p class="text-slate-500 py-4">Sem registros nesta tabela.</p>`;
    return;
  }

  const total = listaFiltradaAdmin.length;
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA_ADMIN));
  const inicio = (paginaAtualAdmin - 1) * ITENS_POR_PAGINA_ADMIN;
  const fatia = listaFiltradaAdmin.slice(inicio, inicio + ITENS_POR_PAGINA_ADMIN);
  const colunas = Object.keys(cacheRegistrosEditorAdmin[0]).slice(0, 7);

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200">
      <div class="flex items-center gap-2 flex-1 min-w-[240px]">
        <i class="fa-solid fa-magnifying-glass text-slate-400"></i>
        <input type="text" id="inputBuscaEditorAdmin" value="${termoMantido.replace(/"/g, '&quot;')}"
          oninput="filtrarRegistrosEditorAdmin(this.value)"
          placeholder="Pesquisar qualquer TAG, código, nome ou valor nos ${cacheRegistrosEditorAdmin.length} registros..."
          class="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:border-amber-500" />
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="text-slate-700 font-bold">Exibindo ${fatia.length} de ${total} registro(s) &bull; Pág. ${paginaAtualAdmin}/${totalPaginas}</span>
        <button onclick="mudarPaginaAdmin(-1)" ${paginaAtualAdmin <= 1 ? 'disabled' : ''} class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded border border-slate-300 font-bold">Anterior</button>
        <button onclick="mudarPaginaAdmin(1)" ${paginaAtualAdmin >= totalPaginas ? 'disabled' : ''} class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded border border-slate-300 font-bold">Próxima</button>
      </div>
    </div>
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          ${colunas.map(c => `<th class="py-2 pr-3 uppercase text-[10px]">${c}</th>`).join('')}
          <th class="py-2 text-right">Ação</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${fatia.map(reg => {
          const idxOriginal = cacheRegistrosEditorAdmin.findIndex(r => r.id === reg.id);
          return `
            <tr class="hover:bg-slate-50">
              ${colunas.map(c => `<td class="py-2 pr-3 truncate max-w-[150px]">${typeof reg[c] === 'object' ? JSON.stringify(reg[c]) : (reg[c] ?? '-')}</td>`).join('')}
              <td class="py-2 text-right">
                <button onclick="abrirModalEditorUniversal(${idxOriginal})" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1 rounded text-[11px]">Modificar</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const inputFoco = document.getElementById('inputBuscaEditorAdmin');
  if (termoMantido && inputFoco) {
    inputFoco.focus();
    inputFoco.setSelectionRange(termoMantido.length, termoMantido.length);
  }
}

function abrirModalEditorUniversal(idx) {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const tabela = document.getElementById('selectTabelaEditorAdmin').value;
  const reg = cacheRegistrosEditorAdmin[idx];
  document.getElementById('labelTabelaEditorModal').innerText = `Tabela: ${tabela}`;
  document.getElementById('editorRegistroId').value = reg.id;
  const ignorar = ['id', 'created_at', 'updated_at', 'qr_token'];
  document.getElementById('camposDinamicosEditor').innerHTML = Object.keys(reg).filter(k => !ignorar.includes(k)).map(chave => {
    const valor = reg[chave] === null || reg[chave] === undefined ? '' : (typeof reg[chave] === 'object' ? JSON.stringify(reg[chave]) : reg[chave]);
    return `
      <div>
        <label class="block text-slate-600 font-mono text-[11px] mb-1">${chave}</label>
        <input type="text" data-campo="${chave}" value="${String(valor).replace(/"/g, '&quot;')}"
          class="input-editor-universal w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900" />
      </div>
    `;
  }).join('');
  document.getElementById('modalEditorUniversal').classList.remove('hidden');
}

async function salvarEdicaoModoDeus() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const tabela = document.getElementById('selectTabelaEditorAdmin').value;
  const id = document.getElementById('editorRegistroId').value;
  const payload = {};
  document.querySelectorAll('.input-editor-universal').forEach(inp => {
    const chave = inp.getAttribute('data-campo');
    let val = inp.value.trim();
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (val === '') val = null;
    else if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
      try { val = JSON.parse(val); } catch(e) {}
    }
    payload[chave] = val;
  });
  const { error } = await db.from(tabela).update(payload).eq('id', id);
  if (error) return alert("Erro: " + error.message);
  document.getElementById('modalEditorUniversal').classList.add('hidden');
  carregarTabelaEditorAdmin();
}

async function excluirRegistroModoDeus() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  if (!confirm("Excluir permanentemente este registro?")) return;
  const tabela = document.getElementById('selectTabelaEditorAdmin').value;
  const id = document.getElementById('editorRegistroId').value;
  const { error } = await db.from(tabela).delete().eq('id', id);
  if (error) return alert("Erro: " + error.message);
  document.getElementById('modalEditorUniversal').classList.add('hidden');
  carregarTabelaEditorAdmin();
}

// 6.2 PLANILHA PADRÃO DO REP (BLINDADA CONTRA QUEBRAS DE LINHA E NA ORDEM EXATA DA ABA BASE)
let memoriaLinhasREPExcel = [];

function baixarPlanilhaPadraoREP() {
  // Usa EXATAMENTE os mesmos nomes e a mesma ordem da sua aba BASE oficial
  const modeloREP = [
    {
      "PATRIMÔNIO": "TE-09",
      "DESCRIÇÃO": "TRATOR DE ESTEIRAS",
      "MARCA": "KOMATSU",
      "LOCAL MANUTENÇÃO": "OFICINA",
      "MOTIVO": "CORRETIVA",
      "COMPONENTE": "COR14",
      "DESCRIÇÃO COMPONENTE": "CONCHA, LAMINA E ESCARIFICADOR",
      "DESCRIÇÃO DO PROBLEMA": "EQUIP. SEM LAMINA",
      "OBSERVAÇÃO": "EXECUTADO",
      "ENTRADA": "19/07/2025 09:30",
      "HORIMETRO": 2017,
      "PREVISÃO DE LIBERAÇÃO": "",
      "SAÍDA": "19/07/2025 12:05",
      "MECÂNICO": "MARIO / JOSE CARLOS / FELIPE",
      "SERVIÇO EXECUTADO": "COLOCADO LAMINA"
    },
    {
      "PATRIMÔNIO": "CB-05",
      "DESCRIÇÃO": "CAMINHÃO BASCULANTE",
      "MARCA": "VOLKSWAGEN",
      "LOCAL MANUTENÇÃO": "OFICINA",
      "MOTIVO": "CORRETIVA",
      "COMPONENTE": "COR01",
      "DESCRIÇÃO COMPONENTE": "MOTOR",
      "DESCRIÇÃO DO PROBLEMA": "MOTOR COM AVARIAS",
      "OBSERVAÇÃO": "EM EXECUÇÃO",
      "ENTRADA": "01/10/2026 07:00",
      "HORIMETRO": 85400,
      "PREVISÃO DE LIBERAÇÃO": "25/10/2026",
      "SAÍDA": "",
      "MECÂNICO": "MARIO",
      "SERVIÇO EXECUTADO": ""
    }
  ];

  const ws = XLSX.utils.json_to_sheet(modeloREP);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "REP_PADRAO");
  XLSX.writeFile(wb, "Planilha_Padrao_REP_Vilasa.xlsx");
}

function lerPlanilhaPadraoREP(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusTxt = document.getElementById('statusImportacaoREP');
  statusTxt.innerText = "Lendo arquivo Excel... Aguarde.";

  const reader = new FileReader();
  reader.onload = function(e) {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
    let json = [];
    if (wb.Sheets['BASE']) {
      json = XLSX.utils.sheet_to_json(wb.Sheets['BASE'], { range: 5, defval: "" });
    } else {
      json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    }

    if (json.length === 0) return alert("A planilha selecionada está vazia!");

    const limparQuebras = (txt) => String(txt ?? '').replace(/[\r\n]+/g, ' | ').replace(/;/g, ',').trim();
    const fmtData = (v) => {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
      return limparQuebras(v);
    };

    memoriaLinhasREPExcel = [];
    const previaVisual = [];

    for (const r of json) {
      const pat = limparQuebras(r['PATRIMÔNIO'] || r['PATRIMONIO'] || '').toUpperCase();
      // Ignora linhas vazias ou TAGs inválidas (como "307 KM" ou números soltos sem traço/letra)
      if (!pat || pat === 'PATRIMÔNIO' || pat === 'PATRIMONIO' || pat === '0' || pat.length > 14 || pat.includes(' ')) continue;

      const itemLimpo = {
        tag: pat,
        descEq: limparQuebras(r['DESCRIÇÃO '] || r['DESCRIÇÃO'] || r['DESCRICAO_EQ'] || 'EQUIPAMENTO').toUpperCase(),
        marca: limparQuebras(r['MARCA'] || '').toUpperCase(),
        localPCM: limparQuebras(r['LOCAL MANUTENÇÃO '] || r['LOCAL MANUTENÇÃO'] || r['LOCAL_PCM'] || 'OFICINA').toUpperCase(),
        motivo: limparQuebras(r['MOTIVO '] || r['MOTIVO'] || 'CORRETIVA').toUpperCase(),
        codComp: limparQuebras(r['COMPONENTE'] || r['COD_COMPONENTE'] || '').toUpperCase(),
        nomeComp: limparQuebras(r['DESCRIÇÃO COMPONENTE'] || r['DESC_COMPONENTE'] || '').toUpperCase(),
        problema: limparQuebras(r['DESCRIÇÃO DO PROBLEMA '] || r['DESCRIÇÃO DO PROBLEMA'] || r['PROBLEMA'] || 'MANUTENÇÃO').toUpperCase(),
        obsStatus: limparQuebras(r['OBSERVAÇÃO '] || r['OBSERVAÇÃO'] || r['STATUS'] || 'EXECUTADO').toUpperCase(),
        entrada: fmtData(r['ENTRADA']),
        horimetro: r['HORIMETRO'] ?? '',
        previsao: fmtData(r['PREVISÃO DE LIBERAÇÃO '] || r['PREVISÃO DE LIBERAÇÃO'] || ''),
        saida: fmtData(r['SAÍDA '] || r['SAÍDA'] || r['SAIDA']),
        mecanicos: limparQuebras(r['MECÂNICO'] || r['MECANICOS'] || '').toUpperCase(),
        servico: limparQuebras(r['SERVIÇO EXECUTADO '] || r['SERVIÇO EXECUTADO'] || r['SERVICO_EXECUTADO'] || '').toUpperCase()
      };

      memoriaLinhasREPExcel.push(itemLimpo);
      if (previaVisual.length < 100) {
        previaVisual.push(`${itemLimpo.tag} | ${itemLimpo.descEq} | ${itemLimpo.localPCM} | ${itemLimpo.codComp} | ${itemLimpo.problema.substring(0, 35)} | Ent: ${itemLimpo.entrada.substring(0, 16)}`);
      }
    }

    document.getElementById('textoPreviaREPMassa').value =
      `[PRÉVIA SEGURA - MOSTRANDO AS PRIMEIRAS ${previaVisual.length} DE ${memoriaLinhasREPExcel.length} ORDENS DE SERVIÇO VÁLIDAS LIDAS DO EXCEL]:\n` +
      previaVisual.join('\n');
    statusTxt.innerText = `✅ ${memoriaLinhasREPExcel.length} Ordem(ns) de Serviço válidas carregadas na memória (sem risco de quebra de linha)!`;
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportacaoREPPadrao() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const statusTxt = document.getElementById('statusImportacaoREP');

  if (!memoriaLinhasREPExcel || memoriaLinhasREPExcel.length === 0) {
    return alert("Selecione o arquivo Excel (.xlsx) no botão 'Escolher arquivo' primeiro!");
  }

  if (document.getElementById('chkLimparOSAntesImportarREP').checked) {
    if (!confirm("Confirmar limpeza das OS antigas antes de importar esta planilha?")) return;
    statusTxt.innerText = "Limpando OS antigas...";
    await db.from('ordens_servico').delete().neq('status', 'inexistente_placeholder');
  }

  const todosEq = await buscarTudoSemLimite('equipamentos', null);
  const mapaTagId = {};
  const maiorHorimetroPorEq = {};
  (todosEq || []).forEach(e => {
    mapaTagId[e.tag.trim().toUpperCase()] = e.id;
    maiorHorimetroPorEq[e.id] = parseFloat(e.horimetro_atual || 0);
  });

  // Verifica quais TAGs válidas (ex: CB-05, EH-40) estão no REP mas não estão na Frota
  const novosEqMap = {};
  for (const item of memoriaLinhasREPExcel) {
    const tag = item.tag;
    // Regra rígida: só aceita TAG com letra + traço + número (ex: CB-05, TP-AL-0048)
    const tagValidaPadrao = /^[A-Z]{1,6}-?[A-Z0-9-]{1,10}$/.test(tag);
    if (tagValidaPadrao && !mapaTagId[tag] && !novosEqMap[tag]) {
      const ehTerc = tag.includes('-AL-') || tag.includes('AL-');
      const ehKm = item.descEq.includes('CAMINH') || item.descEq.includes('ONIBUS') || item.descEq.includes('ÔNIBUS') || item.descEq.includes('CARRETA') || item.descEq.includes('VEICULO') || item.descEq.includes('PICK');
      novosEqMap[tag] = {
        tag,
        nome: item.descEq || 'EQUIPAMENTO',
        marca: item.marca || '',
        unidade_medida: ehKm ? 'KM' : 'HORAS',
        setor: '',
        proprietario: ehTerc ? 'TERCEIRO' : 'VILASA',
        preventiva_propria: !ehTerc,
        codigo_curto: `${tag.replace(/[^A-Z0-9]/g, '')}-${Math.floor(10 + Math.random() * 89)}`,
        ativo: true
      };
    }
  }

  const listaNovosEq = Object.values(novosEqMap);
  if (listaNovosEq.length > 0) {
    const exemplos = listaNovosEq.slice(0, 8).map(e => `${e.tag} (${e.nome})`).join(', ');
    const desejaCriar = confirm(
      `Encontramos ${listaNovosEq.length} equipamentos no REP que ainda não estavam cadastrados na sua Frota:\n` +
      `Exemplos: ${exemplos}...\n\n` +
      `Clique em OK para cadastrar essas máquinas automaticamente, ou Cancelar para importar APENAS as OS das máquinas que você já cadastrou na Frota!`
    );

    if (desejaCriar) {
      statusTxt.innerText = `Cadastrando ${listaNovosEq.length} equipamento(s) novos...`;
      await db.from('equipamentos').upsert(listaNovosEq, { onConflict: 'tag' });
      const recarregados = await buscarTudoSemLimite('equipamentos', null);
      (recarregados || []).forEach(e => {
        mapaTagId[e.tag.trim().toUpperCase()] = e.id;
        if (!(e.id in maiorHorimetroPorEq)) maiorHorimetroPorEq[e.id] = parseFloat(e.horimetro_atual || 0);
      });
    }
  }

  // Insere as Ordens de Serviço em pacotes de 200 direto da memória limpa
  const loteOS = [];
  const maquinasParadasAgora = new Set();
  let osImportadas = 0;

  for (const item of memoriaLinhasREPExcel) {
    const eqId = mapaTagId[item.tag];
    if (!eqId) continue; // Se o usuário optou por não criar máquinas ausentes, pula com segurança

    let localPCM = 'OFICINA';
    if (item.localPCM.includes('TRECHO')) localPCM = 'TRECHO';
    else if (item.localPCM.includes('TERCEIRO')) localPCM = 'TERCEIRO';
    else if (item.localPCM.includes('USINA')) localPCM = 'USINA';

    let motivo = item.motivo || 'CORRETIVA';
    if (motivo === 'OFICINA') motivo = 'CORRETIVA';
    if (item.codComp === 'PRE18' || item.codComp === 'PRE01') motivo = 'PREVENTIVA';

    const dEnt = parseDataSeguraREP(item.entrada) || new Date().toISOString();
    const dSai = parseDataSeguraREP(item.saida);
    const prevLib = parseDataSeguraREP(item.previsao);
    const horOS = parseFloat(String(item.horimetro || '').replace(',', '.')) || null;

    if (horOS && horOS > (maiorHorimetroPorEq[eqId] || 0)) {
      maiorHorimetroPorEq[eqId] = horOS;
    }

    const mecsLista = item.mecanicos ? item.mecanicos.split('/').map(s => s.trim()).filter(Boolean) : [];
    const estaParadaAgora = !dSai;
    if (estaParadaAgora) maquinasParadasAgora.add(eqId);

    const horasTurno = calcularHorasParadasTurnoVilasa(dEnt, dSai);

    loteOS.push({
      equipamento_id: eqId,
      tipo: motivo === 'PREVENTIVA' ? 'preventiva' : (motivo.includes('OPERACIONAL') ? 'falha_operacional' : 'corretiva'),
      motivo_rep: motivo,
      localizacao: localPCM,
      local_manutencao_pcm: localPCM,
      codigo_componente: item.codComp,
      nome_componente: item.nomeComp,
      descricao_problema: item.problema,
      servico_executado: item.servico,
      horimetro_os: horOS,
      executantes_nomes: mecsLista,
      quantidade_executantes: Math.max(1, mecsLista.length),
      manutencao_externa: localPCM === 'TERCEIRO',
      oficina_externa: localPCM === 'TERCEIRO' ? item.mecanicos : '',
      aberta_em: dEnt,
      concluida_em: dSai,
      previsao_liberacao: prevLib ? prevLib.split('T')[0] : null,
      tempo_efetivo_segundos: Math.round(horasTurno * 3600),
      status: estaParadaAgora ? 'em_execucao' : 'auditada_pcm',
      classificada_pcm: Boolean(item.codComp !== '')
    });

    if (loteOS.length >= 200) {
      const chunk = loteOS.splice(0, 200);
      await db.from('ordens_servico').insert(chunk);
      osImportadas += chunk.length;
      statusTxt.innerText = `Gravando no banco: ${osImportadas} de ${memoriaLinhasREPExcel.length} OS...`;
    }
  }

  if (loteOS.length > 0) {
    await db.from('ordens_servico').insert(loteOS);
    osImportadas += loteOS.length;
  }

  statusTxt.innerText = `Sincronizando horímetros e máquinas paradas...`;
  for (const [eqId, maxHor] of Object.entries(maiorHorimetroPorEq)) {
    const parada = maquinasParadasAgora.has(eqId);
    if (maxHor > 0 || parada) {
      await db.from('equipamentos').update({
        horimetro_atual: maxHor,
        status_operacional: parada ? 'parado_corretiva' : 'operando'
      }).eq('id', eqId);
    }
  }

  statusTxt.innerText = `✅ Importação Concluída! ${osImportadas} Ordens de Serviço gravadas e ${maquinasParadasAgora.size} máquinas paradas atualmente no REP!`;
  alert(`Importação concluída com sucesso! ${osImportadas} OS registradas.`);
}

async function gerarBackupCompletoExcel() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const wb = XLSX.utils.book_new();
  const tabelas = ['equipamentos', 'ordens_servico', 'diario_horimetro', 'pecas_estoque', 'lotes_estoque', 'itens_os_estoque', 'servicos_almoxarifado', 'planos_preventiva'];
  for (const tab of tabelas) {
    const data = await buscarTudoSemLimite(tab, null);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data || []), tab.substring(0, 30));
  }
  XLSX.writeFile(wb, `Backup_Geral_Vilasa_${new Date().toISOString().split('T')[0]}.xlsx`);

  const btnExpurgo = document.getElementById('btnExecutarExpurgo');
  btnExpurgo.disabled = false;
  btnExpurgo.className = "w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 shadow cursor-pointer";
  btnExpurgo.innerHTML = `<i class="fa-solid fa-trash-can"></i> 2. Executar Limpeza de Registros Antigos na Nuvem`;
}

async function executarExpurgoNuvem() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const dataCorte = document.getElementById('dataCorteExpurgo').value;
  if (!dataCorte) return alert("Selecione a data limite!");
  if (!confirm(`Apagar OS concluídas e horímetros anteriores a ${dataCorte}?`)) return;
  const corteISO = `${dataCorte}T23:59:59.999Z`;
  await db.from('diario_horimetro').delete().lt('inicio_turno_em', corteISO);
  await db.from('ordens_servico').delete().in('status', ['concluida_oficina', 'auditada_pcm']).lt('concluida_em', corteISO);
  alert("Expurgo concluído!");
}

async function carregarAdminUsuarios() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const { data: usrs } = await db.from('perfis_usuarios').select('*').order('nome');
  document.getElementById('listaUsuariosAdmin').innerHTML = `
    <table class="w-full text-left text-xs">
      <thead><tr class="border-b border-slate-300 text-slate-600"><th class="py-2">Matrícula</th><th>Nome</th><th>Cargo Base</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody class="divide-y divide-slate-200">
        ${(usrs || []).map(u => `
          <tr>
            <td class="py-2 font-mono font-bold text-amber-700">${u.matricula}</td>
            <td class="font-bold text-slate-900">${u.nome}</td>
            <td>
              <select onchange="alterarCargoUsuario('${u.id}', this.value)" class="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 uppercase">
                <option value="encarregado" ${u.cargo_base === 'encarregado' ? 'selected' : ''}>ENCARREGADO</option>
                <option value="mecanico" ${u.cargo_base === 'mecanico' ? 'selected' : ''}>MECÂNICO</option>
                <option value="almoxarife" ${u.cargo_base === 'almoxarife' ? 'selected' : ''}>ALMOXARIFE</option>
                <option value="pcm" ${u.cargo_base === 'pcm' ? 'selected' : ''}>PCM</option>
                <option value="gestor" ${u.cargo_base === 'gestor' ? 'selected' : ''}>GESTOR</option>
                <option value="admin" ${u.cargo_base === 'admin' ? 'selected' : ''}>ADMIN</option>
              </select>
            </td>
            <td>${u.ativo ? '<span class="text-emerald-600 font-bold">Ativo</span>' : '<span class="text-rose-600 font-bold">Inativo</span>'}</td>
            <td><button onclick="alternarStatusUsuario('${u.id}', ${u.ativo})" class="underline text-slate-600 font-semibold">${u.ativo ? 'Inativar' : 'Reativar'}</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function alterarCargoUsuario(id, novoCargo) {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  await db.from('perfis_usuarios').update({ cargo_base: novoCargo }).eq('id', id);
  alert("Cargo atualizado para " + novoCargo.toUpperCase() + "!");
  carregarAdminUsuarios();
}

async function salvarNovoUsuario() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const matricula = document.getElementById('usrMatricula').value.trim();
  const senha_acesso = document.getElementById('usrSenha').value.trim();
  const nome = document.getElementById('usrNome').value.trim().toUpperCase();
  const cargo_base = document.getElementById('usrCargo').value.trim().toLowerCase();
  if (!matricula || !senha_acesso || !nome) return alert("Preencha todos os campos!");
  await db.from('perfis_usuarios').insert([{ matricula, senha_acesso, nome, cargo_base }]);
  document.getElementById('modalUsuario').classList.add('hidden');
  carregarAdminUsuarios();
}

async function alternarStatusUsuario(id, statusAtual) {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  await db.from('perfis_usuarios').update({ ativo: !statusAtual }).eq('id', id);
  carregarAdminUsuarios();
}

// 7. INJETOR AUTOMÁTICO DE BUSCA DIGITÁVEL EM QUALQUER CAIXA DE SELEÇÃO (<SELECT>)
function ativarBuscaEmTodosOsSelects() {
  document.querySelectorAll('select').forEach(sel => {
    if (sel.options.length <= 5 && !sel.dataset.temBuscaAtiva) return;

    const assinaturaAtual = sel.options.length + '_' + (sel.options[0]?.text || '') + '_' + (sel.options[sel.options.length - 1]?.text || '');
    if (sel.dataset.assinaturaOpcoes !== assinaturaAtual && !sel.dataset.filtrandoAgora) {
      sel._opcoesOriginais = Array.from(sel.options).map(o => ({
        value: o.value,
        text: o.text
      }));
      sel.dataset.assinaturaOpcoes = assinaturaAtual;
    }

    if (sel.dataset.temBuscaAtiva) return;
    sel.dataset.temBuscaAtiva = "true";

    const inputFiltro = document.createElement('input');
    inputFiltro.type = "text";
    inputFiltro.placeholder = "🔍 Digite para filtrar opções...";
    inputFiltro.className = "w-full mb-1 px-2.5 py-1 bg-amber-50/70 border border-amber-300 rounded-lg text-[11px] text-slate-900 font-semibold placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:bg-white no-print";

    sel.parentNode.insertBefore(inputFiltro, sel);

    inputFiltro.addEventListener('input', function() {
      const termo = this.value.toLowerCase().trim();
      const originais = sel._opcoesOriginais || [];
      const valorAntes = sel.value;

      sel.dataset.filtrandoAgora = "true";
      sel.innerHTML = '';

      const correspondentes = originais.filter(o =>
        o.value === '' || o.text.toLowerCase().includes(termo) || o.value.toLowerCase().includes(termo)
      );

      if (correspondentes.length === 0) {
        const optVazia = document.createElement('option');
        optVazia.value = "";
        optVazia.text = `-- Sem resultados para "${this.value}" --`;
        sel.appendChild(optVazia);
      } else {
        correspondentes.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.text = o.text;
          sel.appendChild(opt);
        });
        const primeiroValido = correspondentes.find(o => o.value !== '');
        if (termo && primeiroValido) {
          sel.value = primeiroValido.value;
          sel.dispatchEvent(new Event('change'));
        } else if (correspondentes.some(o => o.value === valorAntes)) {
          sel.value = valorAntes;
        }
      }
      delete sel.dataset.filtrandoAgora;
    });
  });
}

const observadorSelects = new MutationObserver(() => ativarBuscaEmTodosOsSelects());
observadorSelects.observe(document.body, { childList: true, subtree: true });

// 8. INICIALIZAÇÃO AUTOMÁTICA DA SESSÃO
window.onload = async () => {
  setTimeout(ativarBuscaEmTodosOsSelects, 500);
  const salvo = localStorage.getItem('vilasa_user');
  if (salvo) {
    try {
      const parsed = JSON.parse(salvo);
      const { data } = await db.from('perfis_usuarios').select('*').eq('id', parsed.id).single();
      if (data && data.ativo) {
        data.cargo_base = String(data.cargo_base || 'encarregado').trim().toLowerCase();
        usuarioLogado = data;
        localStorage.setItem('vilasa_user', JSON.stringify(data));
        iniciarSessaoUsuario();
      } else fazerLogout();
    } catch (e) { fazerLogout(); }
  }
};

// ============================================================================
// MÓDULO EXTRA: FUSÃO / UNIFICAÇÃO DE EQUIPAMENTOS DUPLICADOS OU COM ERRO DE DIGITAÇÃO
// ============================================================================

function normalizarTagParaComparacao(tag) {
  const limpo = String(tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = limpo.match(/^([A-Z]+)0*(\d+)$/);
  if (match) return `${match[1]}_${match[2]}`;
  return limpo;
}

async function injetarPainelFusaoEquipamentosAdmin() {
  const abaEditor = document.getElementById('abaAdmin-editor');
  if (!abaEditor || document.getElementById('painelFusaoEquipamentos')) return;

  const box = document.createElement('div');
  box.id = 'painelFusaoEquipamentos';
  box.className = "bg-amber-50/70 border-2 border-amber-300 rounded-xl p-4 space-y-3 mb-4";
  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2">
      <div>
        <h4 class="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
          <i class="fa-solid fa-object-group text-amber-600"></i> Unificador / Fusão de Equipamentos Duplicados (Corrige TAGs do REP)
        </h4>
        <p class="text-[11px] text-amber-800">Transfere todas as OS, Horímetros, Peças e Serviços do cadastro com erro para o equipamento oficial e apaga a duplicata.</p>
      </div>
      <button onclick="detectarSugestoesFusaoAutomatica()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm flex items-center gap-1.5">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Detectar Duplicatas (Zeros / Traços)
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
      <div class="md:col-span-5">
        <label class="block text-rose-800 font-bold mb-1">1. Equipamento ERRADO / Duplicado (Será absorvido e excluído)</label>
        <select id="selFusaoOrigemErrado" class="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-slate-900 font-bold"></select>
      </div>
      <div class="md:col-span-5">
        <label class="block text-emerald-800 font-bold mb-1">2. Equipamento OFICIAL / Correto (Receberá todo o histórico)</label>
        <select id="selFusaoDestinoCorreto" class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-slate-900 font-bold"></select>
      </div>
      <div class="md:col-span-2">
        <button onclick="executarFusaoManualEquipamentos()" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-2 rounded-lg shadow transition">
          <i class="fa-solid fa-code-merge"></i> Fundir Agora
        </button>
      </div>
    </div>

    <!-- Área onde aparecem os grupos de duplicatas encontrados automaticamente -->
    <div id="containerSugestoesFusao" class="hidden pt-2 border-t border-amber-200 space-y-2 text-xs"></div>
  `;

  abaEditor.insertBefore(box, abaEditor.firstChild);
  await atualizarSelectsFusaoEquipamentos();
}

async function atualizarSelectsFusaoEquipamentos() {
  const selOrigem = document.getElementById('selFusaoOrigemErrado');
  const selDestino = document.getElementById('selFusaoDestinoCorreto');
  if (!selOrigem || !selDestino) return;

  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos;

  const htmlOpcoes = `<option value="">-- Selecione o Equipamento --</option>` +
    todos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome} (${e.marca || 'S/ Marca'} | ${e.horimetro_atual || 0} ${e.unidade_medida === 'KM' ? 'km' : 'h'})</option>`).join('');

  selOrigem.innerHTML = htmlOpcoes;
  selDestino.innerHTML = htmlOpcoes;
  setTimeout(ativarBuscaEmTodosOsSelects, 200);
}

// Motor que transfere todo o histórico de um equipamento para outro sem perder nada
async function fundirDoisEquipamentosNoBanco(idErrado, idCorreto, silencioso = false) {
  if (!idErrado || !idCorreto || idErrado === idCorreto) {
    if (!silencioso) alert("Selecione dois equipamentos diferentes para fundir!");
    return false;
  }

  const eqErrado = cacheEquipamentos.find(e => e.id === idErrado);
  const eqCorreto = cacheEquipamentos.find(e => e.id === idCorreto);
  if (!eqErrado || !eqCorreto) return false;

  if (!silencioso) {
    const ok = confirm(
      `CONFIRMAR FUSÃO DE EQUIPAMENTOS?\n\n` +
      `• Sairá de (Será apagado): ${eqErrado.tag} (${eqErrado.nome})\n` +
      `• Irá tudo para (Oficial): ${eqCorreto.tag} (${eqCorreto.nome})\n\n` +
      `Todas as Ordens de Serviço, Horímetros, Peças e Serviços serão transferidos para ${eqCorreto.tag}.`
    );
    if (!ok) return false;
  }

  // 1. Transfere todas as tabelas filhas para o equipamento correto
  await db.from('ordens_servico').update({ equipamento_id: idCorreto }).eq('equipamento_id', idErrado);
  await db.from('diario_horimetro').update({ equipamento_id: idCorreto }).eq('equipamento_id', idErrado);
  await db.from('itens_os_estoque').update({ equipamento_id: idCorreto }).eq('equipamento_id', idErrado);
  await db.from('servicos_almoxarifado').update({ equipamento_id: idCorreto }).eq('equipamento_id', idErrado);
  await db.from('planos_preventiva').update({ equipamento_id: idCorreto }).eq('equipamento_id', idErrado);

  // 2. Preserva o maior horímetro e preenche dados cadastrais que estejam vazios no oficial
  const horMaior = Math.max(parseFloat(eqCorreto.horimetro_atual || 0), parseFloat(eqErrado.horimetro_atual || 0));
  const updateOficial = {
    horimetro_atual: horMaior,
    marca: eqCorreto.marca || eqErrado.marca || '',
    modelo: eqCorreto.modelo || eqErrado.modelo || '',
    placa: eqCorreto.placa || eqErrado.placa || '',
    numero_serie: eqCorreto.numero_serie || eqErrado.numero_serie || '',
    ano_fabricacao: eqCorreto.ano_fabricacao || eqErrado.ano_fabricacao || ''
  };
  if (eqErrado.status_operacional === 'parado_corretiva') {
    updateOficial.status_operacional = 'parado_corretiva';
  }

  await db.from('equipamentos').update(updateOficial).eq('id', idCorreto);

  // 3. Remove o equipamento duplicado/errado
  await db.from('equipamentos').delete().eq('id', idErrado);
  return true;
}

async function executarFusaoManualEquipamentos() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const idErrado = document.getElementById('selFusaoOrigemErrado').value;
  const idCorreto = document.getElementById('selFusaoDestinoCorreto').value;

  const sucesso = await fundirDoisEquipamentosNoBanco(idErrado, idCorreto, false);
  if (sucesso) {
    alert("✅ Fusão concluída com sucesso! Todo o histórico foi unificado.");
    await atualizarSelectsFusaoEquipamentos();
    carregarTabelaEditorAdmin();
  }
}

// Detector inteligente que acha variações como TP-AL-47 vs TP-AL-0047 vs TPAL-0047
async function detectarSugestoesFusaoAutomatica() {
  if (!podeExecutarAcao('acesso_modo_deus')) return;
  const container = document.getElementById('containerSugestoesFusao');
  container.classList.remove('hidden');
  container.innerHTML = `<p class="text-amber-700 font-bold"><i class="fa-solid fa-spinner fa-spin"></i> Analisando TAGs parecidas na frota...</p>`;

  const todos = await buscarTudoSemLimite('equipamentos', 'tag', true);
  cacheEquipamentos = todos;

  const grupos = {};
  todos.forEach(eq => {
    const chave = normalizarTagParaComparacao(eq.tag);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(eq);
  });

  const duplicados = Object.entries(grupos).filter(([_, lista]) => lista.length > 1);

  if (duplicados.length === 0) {
    container.innerHTML = `<p class="text-emerald-700 font-bold">✅ Nenhuma duplicata por zeros à esquerda ou falta de traço encontrada!</p>`;
    return;
  }

  container.innerHTML = `
    <p class="font-bold text-slate-800">Encontramos <span class="text-rose-600">${duplicados.length} grupo(s)</span> de equipamentos que parecem ser a mesma máquina com escrita diferente. Escolha qual TAG manter em cada grupo:</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
      ${duplicados.map(([chave, lista], idx) => {
        // Sugere manter o que tem Placa/Série/Modelo preenchido, ou o de TAG mais limpa
        const ordenados = [...lista].sort((a, b) => {
          const scoreA = (a.placa ? 2 : 0) + (a.modelo ? 2 : 0) + (a.tag.includes('-') ? 1 : 0);
          const scoreB = (b.placa ? 2 : 0) + (b.modelo ? 2 : 0) + (b.tag.includes('-') ? 1 : 0);
          return scoreB - scoreA;
        });
        const principal = ordenados[0];
        const outros = ordenados.slice(1);
        const idsOutros = outros.map(o => o.id).join(',');
        const tagsOutros = outros.map(o => o.tag).join(', ');

        return `
          <div id="cardSugestaoFusao-${idx}" class="bg-white border border-slate-300 rounded-lg p-2.5 flex items-center justify-between gap-2">
            <div>
              <span class="text-[11px] font-black text-emerald-700 block">Manter Oficial: ${principal.tag}</span>
              <span class="text-[10px] text-rose-600 font-semibold block">Absorver e Apagar: ${tagsOutros}</span>
            </div>
            <button onclick="unificarGrupoSugerido(${idx}, '${principal.id}', '${idsOutros}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[11px] shrink-0">
              Unificar
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function unificarGrupoSugerido(idxCard, idPrincipal, idsOutrosStr) {
  const idsOutros = idsOutrosStr.split(',').filter(Boolean);
  for (const idErrado of idsOutros) {
    await fundirDoisEquipamentosNoBanco(idErrado, idPrincipal, true);
  }
  const card = document.getElementById(`cardSugestaoFusao-${idxCard}`);
  if (card) {
    card.innerHTML = `<span class="text-emerald-700 font-bold text-xs"><i class="fa-solid fa-check"></i> Grupo unificado com sucesso!</span>`;
  }
  await atualizarSelectsFusaoEquipamentos();
  carregarTabelaEditorAdmin();
}

// Pluga o painel automaticamente sempre que abrir a aba Admin
const navOriginalFusao = navegarPara;
navegarPara = function(modulo) {
  navOriginalFusao(modulo);
  if (modulo === 'admin' && podeExecutarAcao('acesso_modo_deus')) {
    setTimeout(injetarPainelFusaoEquipamentosAdmin, 300);
  }
};
setTimeout(() => {
  if (usuarioLogado && podeExecutarAcao('acesso_modo_deus')) injetarPainelFusaoEquipamentosAdmin();
}, 800);
