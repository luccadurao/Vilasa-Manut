// ============================================================================
// VILASA CMMS - MÓDULO 1: CORE.JS (NÚCLEO CENTRAL + EXPORTADOR PDF/PNG/CSV)
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

// ----------------------------------------------------------------------------
// 1. MATRIZ DE PERMISSÕES POR CARGO (RBAC)
// ----------------------------------------------------------------------------
const MATRIZ_PERMISSOES_CARGOS = {
  operador: {
    label: 'Operador de Equipamento',
    abas_visiveis: ['os'],
    acoes: ['lancar_horimetro_qr', 'exportar_relatorios']
  },
  mecanico: {
    label: 'Mecânico / Eletricista',
    abas_visiveis: ['os', 'preventivas', 'estoque'],
    acoes: [
      'abrir_os',
      'executar_os',
      'aceitar_chamado_uber',
      'solicitar_peca_os',
      'lancar_horimetro_qr',
      'exportar_relatorios'
    ]
  },
  almoxarife: {
    label: 'Almoxarife / Compras',
    abas_visiveis: ['estoque', 'os', 'frota'],
    acoes: [
      'gerenciar_catalogo_estoque',
      'lancar_nf_entrada',
      'dar_baixa_estoque',
      'atender_reserva_os',
      'transferir_estoque_obras',
      'exportar_relatorios'
    ]
  },
  encarregado: {
    label: 'Encarregado de Manutenção',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: [
      'abrir_os',
      'executar_os',
      'classificar_rep_pcm',
      'solicitar_peca_os',
      'gerenciar_frota',
      'gerenciar_preventivas',
      'transferir_equipamento_obra',
      'exportar_relatorios'
    ]
  },
  pcm: {
    label: 'Analista de PCM',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: [
      'abrir_os',
      'executar_os',
      'classificar_rep_pcm',
      'gerenciar_frota',
      'gerenciar_preventivas',
      'solicitar_peca_os',
      'transferir_equipamento_obra',
      'exportar_relatorios'
    ]
  },
  gestor: {
    label: 'Gestor / Diretoria (Somente Visualização)',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: ['exportar_relatorios']
  },
  engenheiro: {
    label: 'Engenheiro de Manutenção',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: [
      'abrir_os',
      'executar_os',
      'aceitar_chamado_uber',
      'classificar_rep_pcm',
      'gerenciar_frota',
      'gerenciar_preventivas',
      'gerenciar_catalogo_estoque',
      'lancar_nf_entrada',
      'dar_baixa_estoque',
      'atender_reserva_os',
      'solicitar_peca_os',
      'transferir_equipamento_obra',
      'transferir_estoque_obras',
      'lancar_horimetro_qr',
      'exportar_relatorios'
    ]
  },
  admin: {
    label: 'Administrador Master',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'],
    acoes: ['*']
  }
};

function obterCargosUsuario(user = usuarioLogado) {
  if (!user) return [];
  const lista = Array.isArray(user.cargos_lista) && user.cargos_lista.length > 0
    ? [...user.cargos_lista]
    : (user.cargo_base ? [user.cargo_base] : (user.cargo ? [user.cargo] : []));
  return [...new Set(lista.map(c => String(c).toLowerCase().trim()).filter(Boolean))];
}

// FILTRO ESTRITO DE EXECUTANTES: Retorna SOMENTE quem possui o cargo 'mecanico' atribuído!
function obterApenasMecanicosExecutantes(listaUsuarios = cacheUsuarios) {
  if (!Array.isArray(listaUsuarios)) return [];
  return listaUsuarios.filter(u => {
    if (u.ativo === false) return false;
    const cargos = obterCargosUsuario(u);
    return cargos.includes('mecanico');
  });
}

function podeVerAba(abaId, user = usuarioLogado) {
  if (!user) return false;
  const cargos = obterCargosUsuario(user);
  if (cargos.includes('admin')) return true;
  if (abaId === 'admin') return false;

  return cargos.some(cargo => {
    const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
    return cfg && cfg.abas_visiveis.includes(abaId);
  });
}

function podeExecutarAcao(acao, exibirAlerta = false) {
  if (!usuarioLogado) return false;
  const cargos = obterCargosUsuario(usuarioLogado);

  if (cargos.includes('admin')) return true;
  if (acao === 'acesso_modo_deus') {
    if (exibirAlerta) alert('Acesso restrito exclusivamente ao Administrador do Sistema.');
    return false;
  }

  if (acao === 'exportar_relatorios') return true;

  const ehApenasGestor = cargos.length === 1 && cargos[0] === 'gestor';
  if (ehApenasGestor) {
    if (exibirAlerta) alert('Perfil Gestor possui acesso exclusivo de visualização e extração de relatórios.');
    return false;
  }

  const permitidoPorCargo = cargos.some(cargo => {
    const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
    return cfg && (cfg.acoes.includes('*') || cfg.acoes.includes(acao));
  });

  const permitidoExtra = Boolean(usuarioLogado.permissoes_extras && usuarioLogado.permissoes_extras[acao]);
  const resultado = permitidoPorCargo || permitidoExtra;

  if (!resultado && exibirAlerta) {
    alert('Seu perfil atual não possui permissão para executar esta alteração.');
  }
  return resultado;
}

// ----------------------------------------------------------------------------
// 2. AUTENTICAÇÃO E SESSÃO
// ----------------------------------------------------------------------------
async function realizarLogin(event) {
  if (event) event.preventDefault();
  const clienteDB = obterClienteSupabase();
  if (!clienteDB) {
    return alert('Erro de conexão: Verifique se o arquivo config.js está presente!');
  }

  const matInput = document.getElementById('loginMatricula');
  const senInput = document.getElementById('loginSenha');
  const loginDigitado = (matInput?.value || '').trim();
  const senDigitada = (senInput?.value || '').trim();

  if (!loginDigitado || !senDigitada) {
    return alert('Informe seu usuário/matrícula e senha!');
  }

  const { data: listaPerfis, error } = await clienteDB.from('perfis_usuarios').select('*');
  if (error) return alert('Erro ao consultar usuários no banco: ' + error.message);

  const loginLower = loginDigitado.toLowerCase();
  const senLower = senDigitada.toLowerCase();

  const usuarioEncontrado = (listaPerfis || []).find(u => {
    if (u.ativo === false) return false;
    const matBanco = String(u.matricula || '').trim().toLowerCase();
    const nomeBanco = String(u.nome || '').trim().toLowerCase();
    const userCol = String(u.usuario || u.login || '').trim().toLowerCase();
    const senhaBanco = String(u.senha_acesso || u.senha || '').trim().toLowerCase();

    const bateUsuario =
      matBanco === loginLower ||
      nomeBanco === loginLower ||
      userCol === loginLower ||
      nomeBanco.split(' ')[0] === loginLower;

    return bateUsuario && (senhaBanco === senLower);
  });

  if (!usuarioEncontrado) {
    return alert('Usuário ou senha incorretos! Verifique seus dados.');
  }

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
  const telaLogin = document.getElementById('telaLogin');
  const appPrincipal = document.getElementById('appPrincipal');

  const raw = localStorage.getItem('vilasa_sessao_v2') || localStorage.getItem('vilasa_user');
  if (!raw) {
    if (telaLogin) telaLogin.classList.remove('hidden');
    if (appPrincipal) appPrincipal.classList.add('hidden');
    return;
  }

  try {
    const cache = JSON.parse(raw);
    if (!cache || !cache.id) {
      if (telaLogin) telaLogin.classList.remove('hidden');
      return;
    }
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
    if (telaLogin) telaLogin.classList.remove('hidden');
  }
}

async function inicializarSistemaPosLogin() {
  document.getElementById('telaLogin')?.classList.add('hidden');
  document.getElementById('appPrincipal')?.classList.remove('hidden');

  const cargos = obterCargosUsuario(usuarioLogado);
  const nomesCargos = cargos.map(c => (MATRIZ_PERMISSOES_CARGOS[c]?.label.split(' ')[0] || c.toUpperCase())).join(' + ');

  const elNome = document.getElementById('headerNomeUsuario');
  const elCargo = document.getElementById('headerCargoUsuario');
  if (elNome) elNome.innerText = usuarioLogado.nome || usuarioLogado.matricula;
  if (elCargo) elCargo.innerText = `${usuarioLogado.matricula || ''} • ${nomesCargos}`;

  await carregarObrasEMontarSeletorTopo();
  aplicarVisibilidadeAbasMenu();

  const primeiraAba = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].find(a => podeVerAba(a));
  if (primeiraAba) navegarPara(primeiraAba);
}

function aplicarVisibilidadeAbasMenu() {
  const todasAbas = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'];
  todasAbas.forEach(aba => {
    const btn = document.getElementById(`nav-${aba}`);
    if (btn) btn.classList.toggle('hidden', !podeVerAba(aba));
  });
}

// ----------------------------------------------------------------------------
// 3. GESTÃO DE MÚLTIPLAS OBRAS E VISÃO CONSOLIDADA
// ----------------------------------------------------------------------------
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
    const idObraItem = item.obra_id || item.equipamentos?.obra_id || null;
    return !idObraItem || String(idObraItem) === String(obraAtivaId);
  });
}

// ----------------------------------------------------------------------------
// 4. NAVEGAÇÃO ENTRE MÓDULOS + ATUALIZAÇÃO DO TÍTULO DA BARRA DE RELATÓRIOS
// ----------------------------------------------------------------------------
function navegarPara(modulo) {
  if (!podeVerAba(modulo)) {
    return alert('Seu perfil não possui acesso a este módulo.');
  }
  abaAtivaGlobal = modulo;

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

  const modulos = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'];
  modulos.forEach(m => {
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

// ----------------------------------------------------------------------------
// 5. MOTOR UNIVERSAL DE EXPORTAÇÃO (CSV + PDF COMPLETO FILTRADO + PNG EXECUTIVO 1 PÁGINA)
// ----------------------------------------------------------------------------
function acionarExportacaoUniversalCSV() {
  if (abaAtivaGlobal === 'os' && typeof exportarPlanilhaOSFiltradaCSV === 'function') return exportarPlanilhaOSFiltradaCSV();
  if (abaAtivaGlobal === 'frota' && typeof exportarRelatorioFrotaCSV === 'function') return exportarRelatorioFrotaCSV();
  if (abaAtivaGlobal === 'preventivas' && typeof exportarHistoricoProprioPreventivasCSV === 'function') return exportarHistoricoProprioPreventivasCSV();
  if (abaAtivaGlobal === 'estoque' && typeof exportarInventarioAlmoxCSV === 'function') return exportarInventarioAlmoxCSV();
  if (abaAtivaGlobal === 'kpis' && typeof exportarRelatorioKPIsCSV === 'function') return exportarRelatorioKPIsCSV();

  // Fallback genérico que lê a tabela visível da aba atual
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

// Coleta dados estruturados e respeitando o filtro atual da aba aberta
function coletarDadosFiltradosDaAbaAtualParaRelatorio() {
  const obraNome = obterNomeObraAtiva();
  const dataHora = new Date().toLocaleString('pt-BR');

  if (abaAtivaGlobal === 'os') {
    const termo = (document.getElementById('filtroPrefixoOSInput')?.value || '').trim().toUpperCase();
    let lista = filtrarListaPorObraAtiva(cacheOrdens || []);
    if (termo) lista = lista.filter(o => bateComPrefixoEquipamento(o.equipamentos?.tag || '', termo));
    const paradas = lista.filter(o => o.status !== 'concluida' && o.parada_obrigatoria !== false);

    return {
      titulo: 'Relatório de Ordens de Serviço & Equipamentos Parados (REP)',
      subtitulo: `Obra: ${obraNome} | Filtro Prefixo: ${termo || 'TODOS'}`,
      kpisResumo: [
        { label: 'Total de OS Filtradas', valor: lista.length },
        { label: 'Máquinas Paradas (REP)', valor: paradas.length },
        { label: 'Avisos Sem Parada', valor: lista.filter(o => o.parada_obrigatoria === false && o.status !== 'concluida').length },
        { label: 'Concluídas na Lista', valor: lista.filter(o => o.status === 'concluida').length }
      ],
      colunas: ['Prefixo', 'Equipamento', 'Status / Tipo', 'Motivo / Problema', 'Abertura', 'Mecânico / Equipe'],
      linhas: lista.map(o => [
        o.equipamentos?.tag || '-',
        o.equipamentos?.nome || '-',
        `${(o.status || '').toUpperCase()} ${o.parada_obrigatoria === false ? '(SEM PARADA)' : '(PARADO)'}`,
        o.descricao_problema || o.motivo_rep || '-',
        o.aberta_em ? new Date(o.aberta_em).toLocaleString('pt-BR') : '-',
        o.mecanico_nome || 'Aguardando'
      ])
    };
  }

  if (abaAtivaGlobal === 'frota') {
    const termo = (document.getElementById('filtroPrefixoFrotaInput')?.value || '').trim().toUpperCase();
    const sit = typeof filtroSituacaoFrota !== 'undefined' ? filtroSituacaoFrota : 'ativo';
    let lista = filtrarListaPorObraAtiva(cacheEquipamentos || []);
    if (sit !== 'todos') lista = lista.filter(e => (e.situacao_ciclo || 'ativo') === sit);
    if (termo) lista = lista.filter(e => bateComPrefixoEquipamento(e.tag || '', termo));

    return {
      titulo: 'Relatório Oficial de Frota e Mobilização de Ativos',
      subtitulo: `Obra: ${obraNome} | Situação: ${sit.toUpperCase()} | Prefixo: ${termo || 'TODOS'}`,
      kpisResumo: [
        { label: 'Total na Lista Filtrada', valor: lista.length },
        { label: 'Equipamentos Próprios', valor: lista.filter(e => e.propriedade !== 'alugado').length },
        { label: 'Equipamentos Alugados', valor: lista.filter(e => e.propriedade === 'alugado').length },
        { label: 'Ativos Mobilizados', valor: lista.filter(e => (e.situacao_ciclo || 'ativo') === 'ativo').length }
      ],
      colunas: ['Prefixo', 'Descrição', 'Marca / Modelo', 'Vínculo', 'Horímetro / KM', 'Situação'],
      linhas: lista.map(e => [
        e.tag || '-',
        e.nome || '-',
        `${e.marca || ''} ${e.modelo || ''}`,
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
      titulo: 'Posição de Almoxarifado & Catálogo Mestre de Equivalências',
      subtitulo: `Obra: ${obraNome} | Busca Aplicada: ${termo || 'TODOS OS ITENS'}`,
      kpisResumo: [
        { label: 'Itens Listados', valor: lista.length },
        { label: 'Itens com Saldo > 0', valor: lista.filter(p => parseFloat(p.quantidade || 0) > 0).length },
        { label: 'Abaixo do Mínimo', valor: lista.filter(p => parseFloat(p.quantidade || 0) <= parseFloat(p.estoque_minimo || 0)).length },
        { label: 'Valor Imobilizado', valor: valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
      ],
      colunas: ['Nosso Código', 'Descrição do Material', 'Códigos Paralelos', 'Saldo Atual', 'Custo Unit.'],
      linhas: lista.map(p => [
        p.id_interno || p.codigo || '-',
        p.descricao || p.nome || '-',
        Array.isArray(p.codigos_paralelos) ? p.codigos_paralelos.join(', ') : (p.codigo || '-'),
        `${p.quantidade || 0} ${p.unidade || 'UN'}`,
        Number(p.custo_unitario || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ])
    };
  }

  // Fallback para Preventivas, KPIs ou Admin (captura tabelas e cards visíveis da seção)
  const sec = document.getElementById(`sec-${abaAtivaGlobal}`);
  const trs = Array.from(sec?.querySelectorAll('table tbody tr') || []);
  const ths = Array.from(sec?.querySelectorAll('table thead th') || []).map(th => th.innerText.trim());

  return {
    titulo: document.getElementById('tituloAbaExportacaoUniversal')?.innerText || 'Relatório Gerencial Vilasa',
    subtitulo: `Obra: ${obraNome} | Emitido em: ${dataHora}`,
    kpisResumo: [
      { label: 'Registros Filtrados', valor: trs.length },
      { label: 'Obra / Frente', valor: obraNome.split(' ')[0] },
      { label: 'Data de Emissão', valor: new Date().toLocaleDateString('pt-BR') },
      { label: 'Responsável', valor: usuarioLogado?.nome || 'Engenharia' }
    ],
    colunas: ths.length > 0 ? ths.slice(0, 7) : ['Informação'],
    linhas: trs.map(tr => Array.from(tr.querySelectorAll('td')).slice(0, 7).map(td => td.innerText.replace(/\n+/g, ' ').trim()))
  };
}

// BOTÃO 2: RELATÓRIO COMPLETO EM PDF (RESPEITANDO O FILTRO APLICADO NA PÁGINA)
function gerarRelatorioCompletoPDF() {
  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio();
  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups no navegador para gerar o PDF.');

  const kpisHtml = rel.kpisResumo.map(k => `
    <div style="border:1px solid #cbd5e1; border-radius:10px; padding:10px; background:#f8fafc; flex:1;">
      <div style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">${k.label}</div>
      <div style="font-size:18px; font-weight:900; color:#0f172a; margin-top:4px;">${k.valor}</div>
    </div>
  `).join('');

  const thHtml = rel.colunas.map(c => `<th style="padding:8px; border:1px solid #334155; background:#0f172a; color:#fbbf24; font-size:10px; text-transform:uppercase; text-align:left;">${c}</th>`).join('');
  const trHtml = rel.linhas.map(l => `
    <tr>
      ${l.map(cel => `<td style="padding:7px; border:1px solid #cbd5e1; font-size:10px; color:#1e293b;">${cel}</td>`).join('')}
    </tr>
  `).join('');

  win.document.write(`
    <html>
    <head>
      <title>${rel.titulo}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #0f172a; }
        @media print { body { margin: 10px; } }
      </style>
    </head>
    <body onload="setTimeout(() => window.print(), 500)">
      <div style="border-bottom:3px solid #f59e0b; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:11px; font-weight:900; color:#d97706;">VILASA CONSTRUTORA • ENGENHARIA DE MANUTENÇÃO</div>
          <h1 style="margin:4px 0; font-size:18px;">${rel.titulo}</h1>
          <div style="font-size:11px; color:#475569; font-weight:700;">${rel.subtitulo}</div>
        </div>
        <div style="text-align:right; font-size:10px; color:#64748b;">
          Emitido em: ${new Date().toLocaleString('pt-BR')}<br/>
          Por: ${usuarioLogado?.nome || 'Sistema'}
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:16px;">${kpisHtml}</div>

      <table style="width:100%; border-collapse:collapse;">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${trHtml}</tbody>
      </table>
    </body>
    </html>
  `);
  win.document.close();
}

// BOTÃO 3: GERADOR DE PNG DE 1 PÁGINA DO RELATÓRIO EXECUTIVO RESUMIDO (DIRETO PARA WHATSAPP / DIRETORIA)
async function gerarResumoExecutivoPNG() {
  if (typeof html2canvas === 'undefined') {
    return alert('Biblioteca de imagem carregando. Tente novamente em 2 segundos.');
  }

  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio();
  const topLinhas = rel.linhas.slice(0, 15); // Resumo executivo de 1 página (Top 15 registros filtrados)

  const cardExecutivo = document.createElement('div');
  cardExecutivo.style.cssText = 'position:fixed; left:-9999px; top:0; width:960px; background:#ffffff; padding:28px; font-family:sans-serif; color:#0f172a; border:4px solid #0f172a;';

  cardExecutivo.innerHTML = `
    <div style="background:#0f172a; color:#ffffff; padding:18px 22px; border-radius:14px; display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
      <div>
        <div style="color:#fbbf24; font-size:11px; font-weight:900; letter-spacing:1px;">VILASA CMMS • RESUMO EXECUTIVO DE 1 PÁGINA</div>
        <div style="font-size:20px; font-weight:900; margin-top:4px;">${rel.titulo}</div>
        <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">${rel.subtitulo}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:#fbbf24; font-weight:800;">
        ${new Date().toLocaleString('pt-BR')}<br/>
        <span style="color:#94a3b8;">Total Filtrado: ${rel.linhas.length} reg.</span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:18px;">
      ${rel.kpisResumo.map(k => `
        <div style="background:#f8fafc; border:2px solid #e2e8f0; border-left:5px solid #f59e0b; border-radius:10px; padding:12px;">
          <div style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">${k.label}</div>
          <div style="font-size:22px; font-weight:900; color:#0f172a; margin-top:4px;">${k.valor}</div>
        </div>
      `).join('')}
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead>
        <tr style="background:#1e293b; color:#fbbf24;">
          ${rel.colunas.map(c => `<th style="padding:8px; text-align:left; border:1px solid #334155;">${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${topLinhas.map((l, idx) => `
          <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            ${l.map(cel => `<td style="padding:7px 8px; border:1px solid #cbd5e1; font-weight:600;">${cel}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${rel.linhas.length > 15 ? `<div style="margin-top:10px; font-size:11px; font-weight:800; color:#64748b; text-align:right;">* Exibindo os 15 principais registros de um total de ${rel.linhas.length} filtrados na página.</div>` : ''}
  `;

  document.body.appendChild(cardExecutivo);
  try {
    const canvas = await html2canvas(cardExecutivo, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `RESUMO_EXECUTIVO_${abaAtivaGlobal.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    cardExecutivo.remove();
  }
}

// ----------------------------------------------------------------------------
// 6. BUSCA PAGINADA E FILTRO ESTRITO POR PREFIXO
// ----------------------------------------------------------------------------
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
  const partes = limpo.split(/\s+-\s+|\s+\|\s+|\s+/);
  return partes[0] || limpo;
}

function bateComPrefixoEquipamento(tagOuTexto, termoDigitado) {
  const termo = String(termoDigitado || '').trim().toUpperCase();
  if (!termo) return true;
  const prefixo = extrairPrefixoTag(tagOuTexto);
  const prefixoSemTraco = prefixo.replace(/[^A-Z0-9]/g, '');
  const termoSemTraco = termo.replace(/[^A-Z0-9]/g, '');
  return prefixo.startsWith(termo) || prefixoSemTraco.startsWith(termoSemTraco);
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
    selectEl._opcoesOriginais = Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      text: opt.text,
      selected: opt.selected
    }));
  };
  salvarOpcoesOriginais();

  const observer = new MutationObserver(() => {
    if (document.activeElement !== inputFiltro) {
      inputFiltro.value = '';
      salvarOpcoesOriginais();
    }
  });
  observer.observe(selectEl, { childList: true });

  inputFiltro.addEventListener('input', () => {
    if (!selectEl._opcoesOriginais || selectEl._opcoesOriginais.length === 0) salvarOpcoesOriginais();
    const termo = inputFiltro.value.trim().toUpperCase();
    const valorAtual = selectEl.value;

    const filtradas = selectEl._opcoesOriginais.filter((opt, idx) => {
      if (opt.value === '' && idx === 0) return true;
      return bateComPrefixoEquipamento(opt.text, termo);
    });

    selectEl.innerHTML = '';
    filtradas.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.text = opt.text;
      selectEl.appendChild(o);
    });

    const primeiraValida = filtradas.find(o => o.value !== '');
    if (termo && primeiraValida) selectEl.value = primeiraValida.value;
    else if (filtradas.some(o => o.value === valorAtual)) selectEl.value = valorAtual;
  });
}

// Ponte de Segurança Offline/Online
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

document.addEventListener('DOMContentLoaded', () => {
  restaurarSessaoSalva();
});
