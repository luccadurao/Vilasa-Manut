// ============================================================================
// VILASA CMMS V2 - MÓDULO 1: CORE.JS (EXPORTAÇÃO DUPLA: COMPLETA vs REP 1 PÁG.)
// ============================================================================

let usuarioLogado = null;
let obraAtivaId = 'TODAS';
let abaAtivaGlobal = 'os';
let cacheObras = [];
let cacheEquipamentos = [];
let cacheUsuarios = [];
let cachePecas = [];
let cacheOrdens = [];

function obterClienteSupabase() {
  if (typeof db !== 'undefined' && db) return db;
  if (typeof supabaseClient !== 'undefined' && supabaseClient) return (window.db = supabaseClient);
  if (typeof sb !== 'undefined' && sb) return (window.db = sb);
  if (typeof window.supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined') {
    window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return window.db;
  }
  return null;
}

// 1. MATRIZ DE PERMISSÕES POR CARGO (RBAC)
const MATRIZ_PERMISSOES_CARGOS = {
  operador: {
    label: 'Operador de Equipamento',
    abas_visiveis: ['os'],
    acoes: ['lancar_horimetro_qr', 'exportar_relatorios']
  },
  mecanico: {
    label: 'Mecânico / Eletricista',
    abas_visiveis: ['os', 'preventivas', 'estoque'],
    acoes: ['abrir_os', 'executar_os', 'lancar_horimetro_qr', 'exportar_relatorios']
  },
  almoxarife: {
    label: 'Almoxarife / Compras',
    abas_visiveis: ['estoque', 'os', 'frota'],
    acoes: ['gerenciar_catalogo_estoque', 'lancar_nf_entrada', 'dar_baixa_estoque', 'exportar_relatorios']
  },
  encarregado: {
    label: 'Encarregado',
    abas_visiveis: ['os'],
    acoes: ['abrir_os', 'exportar_relatorios']
  },
  pcm: {
    label: 'Analista de PCM',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: ['abrir_os', 'executar_os', 'classificar_rep_pcm', 'gerenciar_frota', 'gerenciar_preventivas', 'exportar_relatorios']
  },
  gestor: {
    label: 'Gestor / Diretoria',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: ['exportar_relatorios']
  },
  engenheiro: {
    label: 'Engenheiro de Manutenção',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: [
      'abrir_os', 'executar_os', 'classificar_rep_pcm', 'gerenciar_frota',
      'gerenciar_preventivas', 'gerenciar_catalogo_estoque', 'lancar_nf_entrada',
      'dar_baixa_estoque', 'lancar_horimetro_qr', 'exportar_relatorios'
    ]
  },
  admin: {
    label: 'Administrador Master',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'],
    acoes: ['*']
  }
};

function obterCargosUsuario(user = usuarioLogado) {
  if (!user || !Array.isArray(user.cargos_lista)) return [];
  return [...new Set(user.cargos_lista.map(c => String(c).toLowerCase().trim()).filter(Boolean))];
}

function obterApenasMecanicosExecutantes(listaUsuarios = cacheUsuarios) {
  if (!Array.isArray(listaUsuarios)) return [];
  return listaUsuarios.filter(u => u.ativo !== false && obterCargosUsuario(u).includes('mecanico'));
}

function podeVerAba(abaId, user = usuarioLogado) {
  if (!user) return false;
  const cargos = obterCargosUsuario(user);
  if (cargos.includes('admin')) return true;
  if (abaId === 'admin') return false;
  return cargos.some(cargo => MATRIZ_PERMISSOES_CARGOS[cargo]?.abas_visiveis.includes(abaId));
}

function podeExecutarAcao(acao, exibirAlerta = false) {
  if (!usuarioLogado) return false;
  const cargos = obterCargosUsuario(usuarioLogado);
  if (cargos.includes('admin')) return true;
  if (acao === 'acesso_modo_deus') {
    if (exibirAlerta) alert('Acesso restrito ao Administrador.');
    return false;
  }
  if (acao === 'exportar_relatorios') return true;

  const resultado = cargos.some(cargo => {
    const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
    return cfg && (cfg.acoes.includes('*') || cfg.acoes.includes(acao));
  });

  if (!resultado && exibirAlerta) {
    alert('Seu perfil não possui permissão para executar esta ação.');
  }
  return resultado;
}

// 2. AUTENTICAÇÃO E SESSÃO
async function realizarLogin(event) {
  if (event) event.preventDefault();
  const clienteDB = obterClienteSupabase();
  if (!clienteDB) return alert('Erro de conexão com o banco (verifique config.js).');

  const loginDigitado = (document.getElementById('loginMatricula')?.value || '').trim().toLowerCase();
  const senDigitada = (document.getElementById('loginSenha')?.value || '').trim().toLowerCase();

  if (!loginDigitado || !senDigitada) return alert('Informe usuário e senha!');

  const { data: listaPerfis, error } = await clienteDB.from('perfis_usuarios').select('*');
  if (error) return alert('Erro ao consultar usuários: ' + error.message);

  const usuarioEncontrado = (listaPerfis || []).find(u => {
    if (u.ativo === false) return false;
    const mat = String(u.matricula || '').trim().toLowerCase();
    const nome = String(u.nome || '').trim().toLowerCase();
    const senha = String(u.senha_acesso || '').trim().toLowerCase();
    const bateUser = mat === loginDigitado || nome === loginDigitado || nome.split(' ')[0] === loginDigitado;
    return bateUser && senha === senDigitada;
  });

  if (!usuarioEncontrado) return alert('Usuário ou senha incorretos!');

  usuarioLogado = usuarioEncontrado;
  localStorage.setItem('vilasa_sessao_v2', JSON.stringify(usuarioEncontrado));
  await inicializarSistemaPosLogin();
}

function encerrarSessao() {
  localStorage.removeItem('vilasa_sessao_v2');
  localStorage.removeItem('vilasa_obra_ativa_v2');
  usuarioLogado = null;
  window.location.reload();
}

async function restaurarSessaoSalva() {
  obterClienteSupabase();
  montarBotoesBarraExportacaoUniversal();
  const raw = localStorage.getItem('vilasa_sessao_v2');
  if (!raw) {
    document.getElementById('telaLogin')?.classList.remove('hidden');
    document.getElementById('appPrincipal')?.classList.add('hidden');
    return;
  }
  try {
    const cache = JSON.parse(raw);
    if (!cache?.id) return encerrarSessao();
    if (navigator.onLine && typeof db !== 'undefined') {
      const { data } = await db.from('perfis_usuarios').select('*').eq('id', cache.id).maybeSingle();
      if (data && data.ativo !== false) {
        usuarioLogado = data;
        localStorage.setItem('vilasa_sessao_v2', JSON.stringify(data));
      } else {
        return encerrarSessao();
      }
    } else {
      usuarioLogado = cache;
    }
    await inicializarSistemaPosLogin();
  } catch (e) {
    document.getElementById('telaLogin')?.classList.remove('hidden');
  }
}

// Reconstrói os botões do topo separando: CSV Completo, Imprimir Tudo, Imprimir REP (1 Pág.) e Exportar PNG (1 Pág.)
function montarBotoesBarraExportacaoUniversal() {
  const elTit = document.getElementById('tituloAbaExportacaoUniversal');
  const barraPai = elTit?.parentElement?.parentElement || elTit?.parentElement;
  if (!barraPai) return;

  let containerBotoes = document.getElementById('containerBotoesExportacaoTopoV2');
  if (!containerBotoes) {
    // Esconde os botões antigos para não duplicar nem sobrescrever errado
    Array.from(barraPai.querySelectorAll('button')).forEach(b => b.classList.add('hidden'));
    containerBotoes = document.createElement('div');
    containerBotoes.id = 'containerBotoesExportacaoTopoV2';
    containerBotoes.className = 'flex flex-wrap items-center gap-2';
    barraPai.appendChild(containerBotoes);
  }

  containerBotoes.innerHTML = `
    <button type="button" onclick="acionarExportacaoUniversalCSV()"
      class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow flex items-center gap-1.5"
      title="Exportar planilha completa com todas as informações">
      <i class="fa-solid fa-file-csv"></i>
      <span>Planilha Completa (CSV)</span>
    </button>

    <button type="button" onclick="imprimirRelatorioGeralCompleto()"
      class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow flex items-center gap-1.5"
      title="Imprimir relatório completo com todos os itens e colunas">
      <i class="fa-solid fa-print"></i>
      <span>Imprimir Tudo (Completo)</span>
    </button>

    <button type="button" onclick="gerarRelatorioCompletoPDF()"
      class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow flex items-center gap-1.5"
      title="Imprimir resumo enxuto de 1 página (Na aba OS: apenas máquinas abertas/paradas)">
      <i class="fa-solid fa-bolt"></i>
      <span>Imprimir 1 Pág. (Parados/REP)</span>
    </button>

    <button type="button" onclick="gerarResumoExecutivoPNG()"
      class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 font-black text-xs shadow flex items-center gap-1.5"
      title="Baixar imagem PNG de 1 página (até 25 máquinas paradas)">
      <i class="fa-solid fa-image"></i>
      <span>Exportar 1 Pág. (PNG)</span>
    </button>
  `;
}

async function inicializarSistemaPosLogin() {
  document.getElementById('telaLogin')?.classList.add('hidden');
  document.getElementById('appPrincipal')?.classList.remove('hidden');
  montarBotoesBarraExportacaoUniversal();

  const cargos = obterCargosUsuario(usuarioLogado);
  const nomesCargos = cargos.map(c => (MATRIZ_PERMISSOES_CARGOS[c]?.label.split(' ')[0] || c.toUpperCase())).join(' + ');

  const elNome = document.getElementById('headerNomeUsuario');
  const elCargo = document.getElementById('headerCargoUsuario');
  if (elNome) elNome.innerText = usuarioLogado.nome || usuarioLogado.matricula;
  if (elCargo) elCargo.innerText = `${usuarioLogado.matricula || ''} • ${nomesCargos}`;

  await carregarObrasEMontarSeletorTopo();
  ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].forEach(aba => {
    document.getElementById(`nav-${aba}`)?.classList.toggle('hidden', !podeVerAba(aba));
  });

  const primeiraAba = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].find(a => podeVerAba(a));
  if (primeiraAba) navegarPara(primeiraAba);
}

// 3. SELETOR GLOBAL DE OBRAS
async function carregarObrasEMontarSeletorTopo() {
  try {
    const { data } = await db.from('obras').select('*').eq('ativa', true).order('codigo');
    cacheObras = data || [];
  } catch (e) {
    cacheObras = [];
  }

  const permissoesObra = Array.isArray(usuarioLogado?.obras_permitidas) && usuarioLogado.obras_permitidas.length > 0
    ? usuarioLogado.obras_permitidas
    : ['TODAS'];

  const cargos = obterCargosUsuario();
  const temAcessoGlobal = cargos.includes('admin') || cargos.includes('engenheiro') || cargos.includes('gestor') || permissoesObra.includes('TODAS');

  const obrasLiberadas = temAcessoGlobal
    ? cacheObras
    : cacheObras.filter(o => permissoesObra.includes(o.id) || permissoesObra.includes(o.codigo));

  const salva = localStorage.getItem('vilasa_obra_ativa_v2');
  if (obrasLiberadas.length === 1 && !temAcessoGlobal) {
    obraAtivaId = obrasLiberadas[0].id;
  } else if (salva && (salva === 'TODAS' || obrasLiberadas.some(o => o.id === salva))) {
    obraAtivaId = salva;
  } else {
    obraAtivaId = 'TODAS';
  }

  injetarSeletorObraNoHeader(obrasLiberadas, temAcessoGlobal);
}

function obterNomeObraAtiva() {
  if (!obraAtivaId || obraAtivaId === 'TODAS') return 'TODAS AS OBRAS (CONSOLIDADO)';
  const ob = (cacheObras || []).find(o => String(o.id) === String(obraAtivaId));
  return ob ? `${ob.codigo} - ${ob.nome}` : 'Obra Selecionada';
}

function injetarSeletorObraNoHeader(obrasLiberadas, temAcessoGlobal) {
  let container = document.getElementById('containerSeletorObraGlobal');
  if (!container) {
    const headerUser = document.getElementById('headerNomeUsuario')?.parentElement;
    if (!headerUser) return;
    container = document.createElement('div');
    container.id = 'containerSeletorObraGlobal';
    container.className = 'mt-2 pt-2 border-t border-slate-200';
    headerUser.appendChild(container);
  }

  const podeVerConsolidado = temAcessoGlobal || obrasLiberadas.length > 1;
  if (obrasLiberadas.length <= 1 && !podeVerConsolidado) {
    const unica = obrasLiberadas[0];
    container.innerHTML = `<div class="text-[11px] font-bold text-amber-700">📍 Obra: ${unica ? `${unica.codigo} - ${unica.nome}` : 'Matriz Geral'}</div>`;
    return;
  }

  container.innerHTML = `
    <label class="block text-[10px] font-black uppercase text-slate-500 mb-1">Frente / Obra Ativa:</label>
    <select id="selectObraGlobalTopo" onchange="trocarObraAtivaGlobal(this.value)"
      class="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-extrabold">
      ${podeVerConsolidado ? `<option value="TODAS" ${obraAtivaId === 'TODAS' ? 'selected' : ''}>🌐 TODAS AS OBRAS (CONSOLIDADO)</option>` : ''}
      ${obrasLiberadas.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>📍 ${o.codigo} - ${o.nome}</option>`).join('')}
    </select>
  `;
}

function trocarObraAtivaGlobal(novoId) {
  obraAtivaId = novoId || 'TODAS';
  localStorage.setItem('vilasa_obra_ativa_v2', obraAtivaId);
  navegarPara(abaAtivaGlobal);
}

function filtrarListaPorObraAtiva(lista) {
  if (!Array.isArray(lista)) return [];
  if (!obraAtivaId || obraAtivaId === 'TODAS') return lista;
  return lista.filter(item => {
    const idObraItem = item.obra_id || item.equipamentos?.obra_id || item.equipamento?.obra_id || null;
    return !idObraItem || String(idObraItem) === String(obraAtivaId);
  });
}

// 4. NAVEGAÇÃO ENTRE MÓDULOS
function navegarPara(modulo) {
  if (!podeVerAba(modulo)) return alert('Seu perfil não possui acesso a este módulo.');
  abaAtivaGlobal = modulo;
  montarBotoesBarraExportacaoUniversal();

  const nomesAbas = {
    os: 'Ordens de Serviço & Quadro REP',
    frota: 'Controle de Frota & Mobilização',
    preventivas: 'Planos Preventivos SAP PM & Histórico',
    estoque: 'Almoxarifado Central & Notas Fiscais',
    kpis: 'Indicadores Executivos de Engenharia (KPIs)',
    admin: 'Governança & Administração'
  };
  const elTit = document.getElementById('tituloAbaExportacaoUniversal');
  if (elTit) elTit.innerText = `Relatórios: ${nomesAbas[modulo] || modulo.toUpperCase()}`;

  ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].forEach(m => {
    document.getElementById(`sec-${m}`)?.classList.add('hidden');
    const btn = document.getElementById(`nav-${m}`);
    if (btn) {
      btn.classList.remove('bg-amber-500', 'text-slate-950', 'font-black', 'shadow-sm');
      btn.classList.add('text-slate-700');
    }
  });

  document.getElementById(`sec-${modulo}`)?.classList.remove('hidden');
  const btnAtivo = document.getElementById(`nav-${modulo}`);
  if (btnAtivo) {
    btnAtivo.classList.remove('text-slate-700');
    btnAtivo.classList.add('bg-amber-500', 'text-slate-950', 'font-black', 'shadow-sm');
  }

  if (modulo === 'os' && typeof carregarOrdensServico === 'function') carregarOrdensServico('ativas');
  if (modulo === 'frota' && typeof carregarFrota === 'function') carregarFrota();
  if (modulo === 'preventivas' && typeof carregarPreventivas === 'function') carregarPreventivas();
  if (modulo === 'estoque' && typeof carregarEstoque === 'function') carregarEstoque();
  if (modulo === 'kpis' && typeof calcularKPIs === 'function') calcularKPIs();
  if (modulo === 'admin' && typeof carregarUsuariosAdmin === 'function') carregarUsuariosAdmin();
}

// ============================================================================
// 5. MOTOR DUPLO DE EXPORTAÇÃO:
//    A) MODO COMPLETO (TODAS AS ORDENS E TODAS AS COLUNAS)
//    B) MODO ENXUTO 1 PÁGINA - REP (SOMENTE ABERTAS, SEM LOCAL/EQUIPE/MOTIVO/DATAS, CABE 18+ ITENS)
// ============================================================================

// BOTÃO 1: Exporta CSV Completo (Na aba OS: exporta TODAS as OS com todas as colunas detalhadas)
async function acionarExportacaoUniversalCSV() {
  if (abaAtivaGlobal === 'os') {
    const todasOS = typeof buscarTudoSemLimite === 'function'
      ? await buscarTudoSemLimite('ordens_servico', 'aberta_em', false, '*, equipamentos(tag, nome, marca)')
      : cacheOrdens || [];

    let lista = filtrarListaPorObraAtiva(todasOS);
    const termo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
    if (termo) lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termo));

    const cab = [
      'NUMERO_OS', 'PREFIXO', 'EQUIPAMENTO', 'MARCA', 'STATUS', 'MOTIVO_REP',
      'CLASSIFICACAO_FALHA', 'LOCAL_MANUTENCAO', 'DESCRICAO_PROBLEMA',
      'SERVICO_EXECUTADO', 'MECANICO_NOME', 'HORIMETRO_OS', 'DATA_INICIO', 'DATA_FIM', 'DIAS_PARADOS'
    ];

    const linhas = lista.map(o => {
      const fimRef = o.concluida_em ? new Date(o.concluida_em) : new Date();
      const dias = o.aberta_em ? Math.max(1, Math.ceil((fimRef - new Date(o.aberta_em)) / 86400000)) : 1;
      return [
        o.numero_os || '',
        o.equipamentos?.tag || '',
        (o.equipamentos?.nome || '').replace(/;/g, ','),
        (o.equipamentos?.marca || '').replace(/;/g, ','),
        o.status || '',
        o.motivo_rep || 'CORRETIVA',
        (o.classificacao_falha || '').replace(/;/g, ','),
        o.local_manutencao_pcm || 'OFICINA',
        (o.descricao_problema || '').replace(/[\r\n;]+/g, ' '),
        (o.servico_executado || '').replace(/[\r\n;]+/g, ' '),
        (o.mecanico_nome || '').replace(/;/g, ','),
        String(o.horimetro_os || '').replace('.', ','),
        o.aberta_em ? new Date(o.aberta_em).toLocaleString('pt-BR') : '',
        o.concluida_em ? new Date(o.concluida_em).toLocaleString('pt-BR') : 'EM ABERTO',
        dias
      ].join(';');
    });

    const blob = new Blob(['\uFEFF' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `VILASA_OS_COMPLETO_${new Date().toISOString().slice(0, 10)}.csv`;
    return a.click();
  }

  if (abaAtivaGlobal === 'frota' && typeof exportarRelatorioFrotaCSV === 'function') return exportarRelatorioFrotaCSV();
  if (abaAtivaGlobal === 'preventivas' && typeof exportarHistoricoProprioPreventivasCSV === 'function') return exportarHistoricoProprioPreventivasCSV();
  if (abaAtivaGlobal === 'estoque' && typeof exportarInventarioAlmoxCSV === 'function') return exportarInventarioAlmoxCSV();
  if (abaAtivaGlobal === 'kpis' && typeof exportarRelatorioKPIsCSV === 'function') return exportarRelatorioKPIsCSV();

  const sec = document.getElementById(`sec-${abaAtivaGlobal}`);
  const table = sec?.querySelector('table');
  if (!table) return alert('Nenhuma tabela visível para exportar nesta seção.');

  const linhas = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(td => `"${td.innerText.replace(/\n/g, ' ').replace(/"/g, '""').trim()}"`).join(';')
  );
  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_${abaAtivaGlobal.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// Coleta dados em 2 modos: 'enxuto_rep' (só abertas e colunas enxutas p/ caber 18+ em 1 pág.) ou 'completo' (tudo e todas as colunas)
function coletarDadosFiltradosDaAbaAtualParaRelatorio(modo = 'enxuto_rep') {
  const obraNome = obterNomeObraAtiva();

  if (abaAtivaGlobal === 'os') {
    const termo = (document.getElementById('filtroPrefixoOS')?.value || '').trim().toUpperCase();
    let lista = filtrarListaPorObraAtiva(cacheOrdens || []);
    if (termo) lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termo));

    const abertas = lista.filter(o => !o.concluida_em && !['concluida', 'aguardando_pcm'].includes(o.status));

    // MODO 1: ENXUTO DE 1 PÁGINA PARA OS EQUIPAMENTOS PARADOS (REP) -> Só abertas, sem datas início/fim, sem local, sem motivo e sem equipe!
    if (modo === 'enxuto_rep') {
      return {
        titulo: 'QUADRO DE EQUIPAMENTOS PARADOS EM MANUTENÇÃO (REP)',
        subtitulo: `Obra: ${obraNome} | Posição Atualizada: ${new Date().toLocaleString('pt-BR')}`,
        kpisResumo: [
          { label: 'Máquinas Paradas Agora', valor: abertas.length },
          { label: 'Aguardando Peça', valor: abertas.filter(o => o.status === 'pausada_peca').length },
          { label: 'Em Execução / Fila', valor: abertas.filter(o => o.status !== 'pausada_peca').length },
          { label: 'Média Dias Parados', valor: abertas.length > 0 ? (abertas.reduce((acc, o) => acc + Math.max(1, Math.ceil((new Date() - new Date(o.aberta_em)) / 86400000)), 0) / abertas.length).toFixed(1) + ' d' : '0 d' }
        ],
        colunas: ['PREFIXO', 'EQUIPAMENTO / MARCA', 'SISTEMA (FALHA)', 'DESCRIÇÃO DO PROBLEMA', 'ANDAMENTO / STATUS', 'DIAS PARADOS'],
        linhas: abertas.map(o => {
          const dias = Math.max(1, Math.ceil((new Date() - new Date(o.aberta_em)) / 86400000));
          const statusCurto = o.status === 'pausada_peca' ? 'AGUARD. PEÇA' : (o.servico_executado || 'EM MANUTENÇÃO');
          return [
            o.equipamentos?.tag || '-',
            `${o.equipamentos?.nome || '-'}${o.equipamentos?.marca ? ` (${o.equipamentos.marca})` : ''}`,
            o.classificacao_falha || 'EM ANÁLISE',
            o.descricao_problema || '-',
            statusCurto,
            `${dias} dia(s)`
          ];
        })
      };
    }

    // MODO 2: RELATÓRIO COMPLETO DE OS (Todas as ordens + todas as informações)
    return {
      titulo: 'Relatório Geral Completo de Ordens de Serviço (Abertas & Concluídas)',
      subtitulo: `Obra: ${obraNome} | Filtro Prefixo: ${termo || 'TODOS'}`,
      kpisResumo: [
        { label: 'Total Listado', valor: lista.length },
        { label: 'Em Manutenção Agora', valor: abertas.length },
        { label: 'Triagem PCM', valor: lista.filter(o => o.status === 'aguardando_pcm').length },
        { label: 'Concluídas', valor: lista.filter(o => Boolean(o.concluida_em) || o.status === 'concluida').length }
      ],
      colunas: ['Nº OS', 'Prefixo / Máquina', 'Motivo / Sistema', 'Local', 'Problema', 'Serviço Executado', 'Início / Fim', 'Dias', 'Equipe'],
      linhas: lista.map(o => {
        const fimRef = o.concluida_em ? new Date(o.concluida_em) : new Date();
        const dias = o.aberta_em ? Math.max(1, Math.ceil((fimRef - new Date(o.aberta_em)) / 86400000)) : 1;
        return [
          `#${o.numero_os || '-'}`,
          `${o.equipamentos?.tag || '-'} - ${o.equipamentos?.nome || ''}`,
          `${o.motivo_rep || 'CORRETIVA'} / ${o.classificacao_falha || '-'}`,
          o.local_manutencao_pcm || 'OFICINA',
          o.descricao_problema || '-',
          o.servico_executado || '-',
          `${o.aberta_em ? new Date(o.aberta_em).toLocaleString('pt-BR') : '-'} → ${o.concluida_em ? new Date(o.concluida_em).toLocaleString('pt-BR') : 'ABERTA'}`,
          `${dias}d`,
          o.mecanico_nome || '-'
        ];
      })
    };
  }

  if (abaAtivaGlobal === 'frota') {
    const sit = typeof filtroSituacaoFrota !== 'undefined' ? filtroSituacaoFrota : 'ativo';
    // Respeita todos os filtros de coluna estilo Excel aplicados na tela da Frota!
    let lista = typeof obterListaFrotaFiltradaAtual === 'function'
      ? obterListaFrotaFiltradaAtual()
      : filtrarListaPorObraAtiva(cacheEquipamentos || []);

    return {
      titulo: 'Relatório Oficial de Frota e Mobilização de Ativos',
      subtitulo: `Obra: ${obraNome} | Situação: ${sit.toUpperCase()}`,
      kpisResumo: [
        { label: 'Total Filtrado', valor: lista.length },
        { label: 'Próprios', valor: lista.filter(e => e.propriedade !== 'alugado').length },
        { label: 'Locados', valor: lista.filter(e => e.propriedade === 'alugado').length },
        { label: 'Ativos na Obra', valor: lista.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').length }
      ],
      colunas: ['Prefixo', 'Descrição', 'Marca / Modelo / Ano', 'Nº Série / Placa', 'Vínculo', 'Horímetro / KM', 'Situação'],
      linhas: lista.map(e => [
        e.tag || '-',
        e.nome || '-',
        `${e.marca || ''} ${e.modelo || ''} ${e.ano_fabricacao ? `(${e.ano_fabricacao})` : ''}`,
        `Série: ${e.numero_serie || 'N/I'}${e.placa ? ` | Placa: ${e.placa}` : ''}`,
        (e.propriedade || 'proprio').toUpperCase(),
        `${e.horimetro_atual || 0} ${e.unidade_medida || 'H'}`,
        (e.situacao_ciclo || 'ativo').toUpperCase()
      ])
    };
  }

  if (abaAtivaGlobal === 'estoque') {
    const termo = (document.getElementById('buscaRapidaAlmoxInput')?.value || '').trim().toUpperCase();
    let lista = filtrarListaPorObraAtiva(cachePecas || []);
    if (termo && typeof bateComBuscaPecaOuParalelo === 'function') {
      lista = lista.filter(p => bateComBuscaPecaOuParalelo(p, termo));
    }
    const valorTotal = lista.reduce((acc, p) => acc + (parseFloat(p.quantidade || 0) * parseFloat(p.custo_unitario || 0)), 0);

    return {
      titulo: 'Posição de Almoxarifado & Catálogo Mestre',
      subtitulo: `Obra: ${obraNome} | Busca: ${termo || 'TODOS'}`,
      kpisResumo: [
        { label: 'Itens Listados', valor: lista.length },
        { label: 'Com Saldo > 0', valor: lista.filter(p => parseFloat(p.quantidade || 0) > 0).length },
        { label: 'Abaixo do Mínimo', valor: lista.filter(p => parseFloat(p.quantidade || 0) <= parseFloat(p.estoque_minimo || 0)).length },
        { label: 'Valor em Estoque', valor: valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
      ],
      colunas: ['Nosso Código', 'Descrição', 'Códigos Paralelos', 'Saldo Atual', 'Custo Unit.'],
      linhas: lista.map(p => [
        p.id_interno || '-',
        p.descricao || '-',
        Array.isArray(p.codigos_paralelos) ? p.codigos_paralelos.join(', ') : '-',
        `${p.quantidade || 0} ${p.unidade || 'UN'}`,
        Number(p.custo_unitario || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ])
    };
  }

  const sec = document.getElementById(`sec-${abaAtivaGlobal}`);
  const trs = Array.from(sec?.querySelectorAll('table tbody tr') || []);
  const ths = Array.from(sec?.querySelectorAll('table thead th') || []).map(th => th.innerText.trim());

  return {
    titulo: document.getElementById('tituloAbaExportacaoUniversal')?.innerText || 'Relatório Gerencial Vilasa',
    subtitulo: `Obra: ${obraNome} | Emitido em: ${new Date().toLocaleString('pt-BR')}`,
    kpisResumo: [
      { label: 'Registros Filtrados', valor: trs.length },
      { label: 'Obra / Frente', valor: obraNome.split(' ')[0] },
      { label: 'Data', valor: new Date().toLocaleDateString('pt-BR') },
      { label: 'Emitido por', valor: usuarioLogado?.nome || 'Engenharia' }
    ],
    colunas: ths.length > 0 ? ths.slice(0, 7) : ['Informação'],
    linhas: trs.map(tr => Array.from(tr.querySelectorAll('td')).slice(0, 7).map(td => td.innerText.replace(/\n+/g, ' ').trim()))
  };
}

// BOTÃO 2: IMPRIMIR TUDO (COMPLETO, COM TODAS AS ORDENS E TODAS AS COLUNAS)
function imprimirRelatorioGeralCompleto() {
  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio('completo');
  abrirJanelaImpressaoFormatada(rel, false);
}

// BOTÃO 3: IMPRIMIR 1 PÁGINA ENXUTA (PARADOS / REP - CABE 18 A 25 ORDENS EM 1 PÁGINA)
function gerarRelatorioCompletoPDF() {
  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio('enxuto_rep');
  abrirJanelaImpressaoFormatada(rel, true);
}

function abrirJanelaImpressaoFormatada(rel, modoCompactoUmaPagina = true) {
  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups no navegador para imprimir o relatório.');

  const linhasParaImprimir = modoCompactoUmaPagina ? rel.linhas.slice(0, 25) : rel.linhas;
  const padCel = modoCompactoUmaPagina ? '4px 6px' : '6px 8px';
  const fontCel = modoCompactoUmaPagina ? '9.5px' : '10px';

  const kpisHtml = rel.kpisResumo.map(k => `
    <div style="border:1px solid #cbd5e1; border-radius:8px; padding:7px 10px; background:#f8fafc; flex:1;">
      <div style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase;">${k.label}</div>
      <div style="font-size:15px; font-weight:900; color:#0f172a; margin-top:2px;">${k.valor}</div>
    </div>
  `).join('');

  const thHtml = rel.colunas.map(c => `<th style="padding:${padCel}; border:1px solid #334155; background:#0f172a; color:#fbbf24; font-size:9.5px; text-transform:uppercase; text-align:left;">${c}</th>`).join('');
  const trHtml = linhasParaImprimir.map((l, idx) => `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">${l.map((cel, cIdx) => `<td style="padding:${padCel}; border:1px solid #cbd5e1; font-size:${fontCel}; color:#1e293b; font-weight:${cIdx === 0 || cIdx === l.length - 1 ? '800' : '600'};">${cel}</td>`).join('')}</tr>`).join('');

  win.document.write(`
    <html>
      <head>
        <title>Impressão - ${rel.titulo}</title>
        <style>
          @page { size: landscape; margin: 7mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 4px; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { width: 100%; border-collapse: collapse; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        </style>
      </head>
      <body onload="setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 350)">
        <div style="border-bottom:2px solid #f59e0b; padding-bottom:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:10px; font-weight:900; color:#d97706;">VILASA CONSTRUTORA • ENGENHARIA DE MANUTENÇÃO</div>
            <h1 style="margin:2px 0; font-size:15px;">${rel.titulo}</h1>
            <div style="font-size:10px; color:#475569; font-weight:700;">${rel.subtitulo}</div>
          </div>
          <div style="text-align:right; font-size:9px; color:#64748b;">Impresso em: ${new Date().toLocaleString('pt-BR')}</div>
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">${kpisHtml}</div>
        <table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>
      </body>
    </html>
  `);
  win.document.close();
}

// BOTÃO 4: EXPORTAR IMAGEM PNG DE 1 PÁGINA (CABEM ATÉ 24 ORDENS COMPACTAS)
async function gerarResumoExecutivoPNG() {
  if (typeof html2canvas === 'undefined') return alert('Aguarde 2 segundos, biblioteca de imagem carregando...');
  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio('enxuto_rep');
  const topLinhas = rel.linhas.slice(0, 24);

  const cardExecutivo = document.createElement('div');
  cardExecutivo.style.cssText = 'position:fixed; left:-9999px; top:0; width:1080px; background:#ffffff; padding:20px; font-family:sans-serif; color:#0f172a; border:4px solid #0f172a;';
  cardExecutivo.innerHTML = `
    <div style="background:#0f172a; color:#ffffff; padding:12px 18px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <div style="color:#fbbf24; font-size:10px; font-weight:900;">VILASA CMMS • QUADRO EXECUTIVO (1 PÁGINA)</div>
        <div style="font-size:17px; font-weight:900; margin-top:2px;">${rel.titulo}</div>
        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">${rel.subtitulo}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:#fbbf24; font-weight:800;">${new Date().toLocaleString('pt-BR')}</div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:12px;">
      ${rel.kpisResumo.map(k => `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #f59e0b; border-radius:8px; padding:8px 10px;">
          <div style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase;">${k.label}</div>
          <div style="font-size:18px; font-weight:900; color:#0f172a; margin-top:2px;">${k.valor}</div>
        </div>
      `).join('')}
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10px;">
      <thead><tr style="background:#1e293b; color:#fbbf24;">${rel.colunas.map(c => `<th style="padding:5px 7px; text-align:left; border:1px solid #334155;">${c}</th>`).join('')}</tr></thead>
      <tbody>${topLinhas.map((l, idx) => `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">${l.map((cel, cIdx) => `<td style="padding:4.5px 7px; border:1px solid #cbd5e1; font-weight:${cIdx === 0 || cIdx === l.length - 1 ? '800' : '600'};">${cel}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
  document.body.appendChild(cardExecutivo);
  try {
    const canvas = await html2canvas(cardExecutivo, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `REP_VILASA_${abaAtivaGlobal.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    cardExecutivo.remove();
  }
}

// 6. BUSCA PAGINADA E FILTRO POR PREFIXO
async function buscarTudoSemLimite(tabela, colunaOrdem = 'id', ascendente = true, selectQuery = '*') {
  let todosRegistros = [];
  let de = 0;
  const passo = 1000;
  while (true) {
    let query = db.from(tabela).select(selectQuery).range(de, de + passo - 1);
    if (colunaOrdem) query = query.order(colunaOrdem, { ascending: ascendente });
    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    todosRegistros = todosRegistros.concat(data);
    if (data.length < passo) break;
    de += passo;
  }
  return todosRegistros;
}

function extrairPrefixoTag(textoOpcao) {
  const limpo = String(textoOpcao || '').trim().toUpperCase();
  return limpo.split(/\s+-\s+|\s+\|\s+|\s+/)[0] || limpo;
}

function bateComPrefixoEquipamento(tagOuTexto, termoDigitado) {
  const termo = String(termoDigitado || '').trim().toUpperCase();
  if (!termo) return true;
  const prefixo = extrairPrefixoTag(tagOuTexto);
  return prefixo.startsWith(termo) || prefixo.replace(/[^A-Z0-9]/g, '').startsWith(termo.replace(/[^A-Z0-9]/g, ''));
}

function ativarBuscaPorPrefixoEmSelect(selectEl) {
  if (!selectEl || selectEl.dataset.prefixSearchBound === '1') return;
  if (selectEl.id === 'selectObraGlobalTopo' || selectEl.id === 'editorTabelaSelect') return;
  selectEl.dataset.prefixSearchBound = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'mb-1';
  const inputFiltro = document.createElement('input');
  inputFiltro.type = 'text';
  inputFiltro.placeholder = '🔍 Prefixo (ex: CB-05, EH-40)...';
  inputFiltro.className = 'w-full px-2.5 py-1 text-xs font-bold uppercase bg-amber-50 border border-amber-300 rounded-t-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500';

  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(inputFiltro);

  const salvarOpcoesOriginais = () => {
    if (inputFiltro.value.trim() !== '') return;
    selectEl._opcoesOriginais = Array.from(selectEl.options).map(opt => ({ value: opt.value, text: opt.text }));
  };
  salvarOpcoesOriginais();

  inputFiltro.addEventListener('input', () => {
    if (!selectEl._opcoesOriginais || selectEl._opcoesOriginais.length === 0) salvarOpcoesOriginais();
    const termo = inputFiltro.value.trim().toUpperCase();
    const filtradas = selectEl._opcoesOriginais.filter((opt, idx) => (opt.value === '' && idx === 0) || bateComPrefixoEquipamento(opt.text, termo));
    selectEl.innerHTML = '';
    filtradas.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.text = opt.text;
      selectEl.appendChild(o);
    });
    const primeiraValida = filtradas.find(o => o.value !== '');
    if (termo && primeiraValida) selectEl.value = primeiraValida.value;
  });
}

window.lerDadosComFallbackOffline = window.lerDadosComFallbackOffline || async function (chaveCache, fnQuerySupabase) {
  try {
    obterClienteSupabase();
    if (navigator.onLine && typeof fnQuerySupabase === 'function') {
      const res = await fnQuerySupabase();
      if (res && !res.error && res.data) {
        try { localStorage.setItem(`vilasa_cache_${chaveCache}`, JSON.stringify(res.data)); } catch (e) {}
        return { data: res.data, error: null, offline: false };
      }
    }
  } catch (err) {}
  const salvo = localStorage.getItem(`vilasa_cache_${chaveCache}`);
  return { data: salvo ? JSON.parse(salvo) : [], error: null, offline: true };
};

window.gravarDadosOfflineSafe = window.gravarDadosOfflineSafe || async function (tabela, operacao, payload, idRegistro = null) {
  obterClienteSupabase();
  if (operacao === 'INSERT') return await db.from(tabela).insert([payload]).select().maybeSingle();
  if (operacao === 'UPDATE') return await db.from(tabela).update(payload).eq('id', idRegistro).select().maybeSingle();
  if (operacao === 'DELETE') return await db.from(tabela).delete().eq('id', idRegistro);
};

document.addEventListener('DOMContentLoaded', () => restaurarSessaoSalva());
