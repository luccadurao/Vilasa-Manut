// ============================================================================
// VILASA CMMS - MÓDULO 1: CORE.JS (NÚCLEO CENTRAL DA ARQUITETURA MODULAR V2)
// Responsabilidades:
// 1. Sessão, Login e Logout
// 2. RBAC Multi-Cargo (Gestor [Visualização], Engenheiro [Total exceto Admin], etc.)
// 3. Controle Global de Múltiplas Obras + Visão Consolidada ("TODAS")
// 4. Buscador Paginado Universal (Sem limite de 1.000 linhas do Supabase)
// 5. Filtro Nativo e Limpo Estritamente por Prefixo (TAG) em Selects e Buscas
// ============================================================================

let usuarioLogado = null;
let obraAtivaId = 'TODAS'; // 'TODAS' (Visão Consolidada) ou UUID da obra selecionada
let cacheObras = [];
let cacheEquipamentos = [];
let cacheUsuarios = [];
let cachePecas = [];
let cacheOrdens = [];

// ----------------------------------------------------------------------------
// 1. MATRIZ DE PERMISSÕES POR CARGO (RBAC)
// ----------------------------------------------------------------------------
const MATRIZ_PERMISSOES_CARGOS = {
  operador: {
    label: 'Operador de Equipamento',
    abas_visiveis: ['os'],
    acoes: [
      'abrir_os',
      'lancar_horimetro_qr',
      'exportar_relatorios'
    ]
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
    label: 'Gestor / Diretoria (Somente Visualização + Relatórios)',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis'],
    acoes: [
      'exportar_relatorios' // Vê todas as abas operacionais e extrai relatórios, mas não altera dados
    ]
  },
  engenheiro: {
    label: 'Engenheiro de Manutenção (Acesso Total exceto Admin)',
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
      // Bloqueado apenas em 'acesso_modo_deus' (aba Admin)
    ]
  },
  admin: {
    label: 'Administrador Master (Modo Deus)',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'],
    acoes: ['*']
  }
};

// Retorna a lista de todos os cargos atribuídos ao usuário logado
function obterCargosUsuario(user = usuarioLogado) {
  if (!user) return [];
  const lista = Array.isArray(user.cargos_lista) && user.cargos_lista.length > 0
    ? [...user.cargos_lista]
    : (user.cargo_base ? [user.cargo_base] : ['operador']);
  return [...new Set(lista.map(c => String(c).toLowerCase().trim()).filter(Boolean))];
}

// Verifica se a soma dos cargos do usuário permite ver determinada aba
function podeVerAba(abaId, user = usuarioLogado) {
  if (!user) return false;
  const cargos = obterCargosUsuario(user);
  if (cargos.includes('admin')) return true;
  if (abaId === 'admin') return false; // Engenheiro e demais perfis nunca entram em Admin

  return cargos.some(cargo => {
    const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
    return cfg && cfg.abas_visiveis.includes(abaId);
  });
}

// Verifica se a soma dos cargos do usuário permite executar uma ação (ou permissão extra individual)
function podeExecutarAcao(acao, exibirAlerta = false) {
  if (!usuarioLogado) return false;
  const cargos = obterCargosUsuario(usuarioLogado);

  if (cargos.includes('admin')) return true;
  if (acao === 'acesso_modo_deus') {
    if (exibirAlerta) alert('Acesso restrito exclusivamente ao Administrador do Sistema.');
    return false;
  }

  // Relatórios liberados para todos os cargos autenticados nos módulos que eles visualizam
  if (acao === 'exportar_relatorios') return true;

  // Se o usuário for EXCLUSIVAMENTE gestor (sem outro cargo técnico cumulativo), bloqueia edições
  const ehApenasGestor = cargos.length === 1 && cargos[0] === 'gestor';
  if (ehApenasGestor) {
    if (exibirAlerta) alert('Perfil Gestor possui acesso exclusivo de visualização e extração de relatórios.');
    return false;
  }

  // Verifica se algum dos cargos do usuário possui a ação liberada
  const permitidoPorCargo = cargos.some(cargo => {
    const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
    return cfg && (cfg.acoes.includes('*') || cfg.acoes.includes(acao));
  });

  // Verifica se possui flag extra no JSON permissoes_extras do banco
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
  const matInput = document.getElementById('loginMatricula');
  const senInput = document.getElementById('loginSenha');
  const mat = (matInput?.value || '').trim().toUpperCase();
  const sen = (senInput?.value || '').trim();

  if (!mat || !sen) return alert('Informe sua matrícula e senha!');

  const { data, error } = await db
    .from('perfis_usuarios')
    .select('*')
    .ilike('matricula', mat)
    .eq('senha', sen)
    .eq('ativo', true)
    .maybeSingle();

  if (error || !data) {
    return alert('Matrícula ou senha incorreta, ou usuário inativo!');
  }

  usuarioLogado = data;
  localStorage.setItem('vilasa_sessao_v2', JSON.stringify(data));
  await inicializarSistemaPosLogin();
}

function encerrarSessao() {
  localStorage.removeItem('vilasa_sessao_v2');
  localStorage.removeItem('vilasa_obra_ativa_v2');
  usuarioLogado = null;
  window.location.reload();
}

async function restaurarSessaoSalva() {
  const raw = localStorage.getItem('vilasa_sessao_v2') || localStorage.getItem('vilasa_user');
  if (!raw) return;
  try {
    const cache = JSON.parse(raw);
    if (!cache || !cache.id) return;
    // Revalida o usuário no banco se houver internet; se estiver offline, usa o cache local
    if (navigator.onLine) {
      const { data } = await db.from('perfis_usuarios').select('*').eq('id', cache.id).eq('ativo', true).maybeSingle();
      if (data) {
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
    console.error('Erro ao restaurar sessão:', e);
  }
}

async function inicializarSistemaPosLogin() {
  document.getElementById('telaLogin')?.classList.add('hidden');
  document.getElementById('appPrincipal')?.classList.remove('hidden');

  const cargos = obterCargosUsuario(usuarioLogado);
  const nomesCargos = cargos.map(c => (MATRIZ_PERMISSOES_CARGOS[c]?.label.split(' ')[0] || c.toUpperCase())).join(' + ');

  const elNome = document.getElementById('headerNomeUsuario');
  const elCargo = document.getElementById('headerCargoUsuario');
  if (elNome) elNome.innerText = usuarioLogado.nome;
  if (elCargo) elCargo.innerText = `${usuarioLogado.matricula} • ${nomesCargos}`;

  await carregarObrasEMontarSeletorTopo();
  aplicarVisibilidadeAbasMenu();

  // Abre a primeira aba permitida para o usuário
  const primeiraAba = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].find(a => podeVerAba(a));
  if (primeiraAba) navegarPara(primeiraAba);
}

function aplicarVisibilidadeAbasMenu() {
  const todasAbas = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'];
  todasAbas.forEach(aba => {
    const btn = document.getElementById(`nav-${aba}`);
    if (btn) {
      btn.classList.toggle('hidden', !podeVerAba(aba));
    }
  });

  // Se for exclusivamente Gestor, oculta botões de gravação/criação que tenham a classe .acao-edicao
  const ehApenasGestor = obterCargosUsuario().length === 1 && obterCargosUsuario()[0] === 'gestor';
  document.querySelectorAll('.acao-edicao').forEach(el => {
    el.classList.toggle('hidden', ehApenasGestor);
  });
}

// ----------------------------------------------------------------------------
// 3. GESTÃO DE MÚLTIPLAS OBRAS E VISÃO CONSOLIDADA ("TODAS AS OBRAS")
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

function injetarSeletorObraNoHeader(obrasLiberadas, temAcessoGlobal) {
  let container = document.getElementById('containerSeletorObraGlobal');
  if (!container) {
    const headerUser = document.getElementById('headerNomeUsuario')?.parentElement;
    if (!headerUser) return;
    container = document.createElement('div');
    container.id = 'containerSeletorObraGlobal';
    container.className = 'mt-2 pt-2 border-t border-slate-700/60';
    headerUser.appendChild(container);
  }

  const podeVerConsolidado = temAcessoGlobal || obrasLiberadas.length > 1;

  if (obrasLiberadas.length <= 1 && !podeVerConsolidado) {
    const unica = obrasLiberadas[0];
    container.innerHTML = `
      <div class="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
        <i class="fa-solid fa-location-dot"></i>
        <span>Obra: ${unica ? `${unica.codigo} - ${unica.nome}` : 'Matriz Geral'}</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <label class="block text-[10px] font-black uppercase text-slate-400 mb-1">
      <i class="fa-solid fa-building-shield text-amber-400 mr-1"></i> Frente / Obra Ativa:
    </label>
    <select id="selectObraGlobalTopo" onchange="trocarObraAtivaGlobal(this.value)"
      class="w-full bg-slate-800 text-amber-300 border border-slate-600 rounded-lg px-2 py-1.5 text-xs font-extrabold focus:outline-none focus:border-amber-400">
      ${podeVerConsolidado ? `<option value="TODAS" ${obraAtivaId === 'TODAS' ? 'selected' : ''}>🌐 TODAS AS OBRAS (CONSOLIDADO)</option>` : ''}
      ${obrasLiberadas.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>📍 ${o.codigo} - ${o.nome}</option>`).join('')}
    </select>
  `;
}

function trocarObraAtivaGlobal(novoId) {
  obraAtivaId = novoId || 'TODAS';
  localStorage.setItem('vilasa_obra_ativa_v2', obraAtivaId);
  // Recarrega a aba que estiver aberta no momento já aplicando o filtro da obra escolhida
  const secaoVisivel = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].find(m => {
    const el = document.getElementById(`sec-${m}`);
    return el && !el.classList.contains('hidden');
  });
  if (secaoVisivel) navegarPara(secaoVisivel);
}

// Helper universal para filtrar qualquer lista em memória pela Obra Ativa
function filtrarListaPorObraAtiva(lista) {
  if (!Array.isArray(lista)) return [];
  if (!obraAtivaId || obraAtivaId === 'TODAS') return lista;
  return lista.filter(item => {
    // Se o registro ainda não tiver obra_id definido (legado), exibe para não esconder dados antigos
    const idObraItem = item.obra_id || item.equipamentos?.obra_id || null;
    return !idObraItem || idObraItem === obraAtivaId;
  });
}

// ----------------------------------------------------------------------------
// 4. NAVEGAÇÃO ENTRE MÓDULOS
// ----------------------------------------------------------------------------
function navegarPara(modulo) {
  if (!podeVerAba(modulo)) {
    return alert('Seu perfil não possui acesso a este módulo.');
  }

  const modulos = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'];
  modulos.forEach(m => {
    document.getElementById(`sec-${m}`)?.classList.add('hidden');
    const btn = document.getElementById(`nav-${m}`);
    if (btn) {
      btn.classList.remove('bg-amber-500', 'text-slate-950', 'font-black');
      btn.classList.add('text-slate-300');
    }
  });

  document.getElementById(`sec-${modulo}`)?.classList.remove('hidden');
  const btnAtivo = document.getElementById(`nav-${modulo}`);
  if (btnAtivo) {
    btnAtivo.classList.remove('text-slate-300');
    btnAtivo.classList.add('bg-amber-500', 'text-slate-950', 'font-black');
  }

  // Dispara o carregamento específico de cada módulo se a função já estiver carregada
  if (modulo === 'os' && typeof carregarOrdensServico === 'function') carregarOrdensServico('ativas');
  if (modulo === 'frota' && typeof carregarFrota === 'function') carregarFrota();
  if (modulo === 'preventivas' && typeof carregarPreventivas === 'function') carregarPreventivas();
  if (modulo === 'estoque' && typeof carregarEstoque === 'function') carregarEstoque();
  if (modulo === 'kpis' && typeof calcularKPIs === 'function') calcularKPIs();
  if (modulo === 'admin' && typeof carregarUsuariosAdmin === 'function') {
    carregarUsuariosAdmin();
    if (typeof carregarTabelaEditorAdmin === 'function') carregarTabelaEditorAdmin();
  }
}

// ----------------------------------------------------------------------------
// 5. BUSCADOR PAGINADO SEM LIMITE DE 1.000 LINHAS DO SUPABASE
// ----------------------------------------------------------------------------
async function buscarTudoSemLimite(tabela, colunaOrdem = 'id', ascendente = true, selectQuery = '*') {
  let todosRegistros = [];
  let de = 0;
  const passo = 1000;

  while (true) {
    let query = db.from(tabela).select(selectQuery).range(de, de + passo - 1);
    if (colunaOrdem) query = query.order(colunaOrdem, { ascending: ascendente });

    const { data, error } = await query;
    if (error) {
      console.error(`Erro ao buscar ${tabela}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    todosRegistros = todosRegistros.concat(data);
    if (data.length < passo) break;
    de += passo;
  }

  return todosRegistros;
}

// ----------------------------------------------------------------------------
// 6. BUSCA ESTRITA E LIMPA POR PREFIXO (TAG) — SEM BUG DE ELEMENTO FLUTUANTE
// ----------------------------------------------------------------------------
// Extrai apenas o prefixo (TAG) de um texto de opção, ex: "CB-05 - CAMINHÃO BASCULANTE" -> "CB-05"
function extrairPrefixoTag(textoOpcao) {
  const limpo = String(textoOpcao || '').trim().toUpperCase();
  const partes = limpo.split(/\s+-\s+|\s+\|\s+|\s+/);
  return partes[0] || limpo;
}

// Verifica se uma TAG bate estritamente com o prefixo digitado pelo usuário (com ou sem traço)
function bateComPrefixoEquipamento(tagOuTexto, termoDigitado) {
  const termo = String(termoDigitado || '').trim().toUpperCase();
  if (!termo) return true;

  const prefixo = extrairPrefixoTag(tagOuTexto);
  const prefixoSemTraco = prefixo.replace(/[^A-Z0-9]/g, '');
  const termoSemTraco = termo.replace(/[^A-Z0-9]/g, '');

  // Busca estrita pelo começo do prefixo (ex: "CB" acha "CB-05", mas não acha descrição que tenha "CB" no meio)
  return prefixo.startsWith(termo) || prefixoSemTraco.startsWith(termoSemTraco);
}

// Vincula um input de filtro por prefixo de forma estável a um <select> específico
function ativarBuscaPorPrefixoEmSelect(selectEl) {
  if (!selectEl || selectEl.dataset.prefixSearchBound === '1') return;
  if (selectEl.id === 'selectObraGlobalTopo' || selectEl.id === 'editorTabelaSelect') return;

  selectEl.dataset.prefixSearchBound = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'mb-1';

  const inputFiltro = document.createElement('input');
  inputFiltro.type = 'text';
  inputFiltro.placeholder = '🔍 Prefixo (ex: CB-05, EH-40)...';
  inputFiltro.className = 'w-full px-2.5 py-1 text-xs font-bold uppercase bg-amber-50/60 border border-amber-300 rounded-t-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500';

  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(inputFiltro);

  // Guarda a lista de opções sempre que o select for populado pelo sistema
  const salvarOpcoesOriginais = () => {
    if (inputFiltro.value.trim() !== '') return; // Não sobrescreve enquanto estiver filtrando
    selectEl._opcoesOriginais = Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      text: opt.text,
      selected: opt.selected
    }));
  };

  salvarOpcoesOriginais();

  // Observa se o código trocou o innerHTML do <select> (ex: ao abrir modal)
  const observer = new MutationObserver(() => {
    if (document.activeElement !== inputFiltro) {
      inputFiltro.value = '';
      salvarOpcoesOriginais();
    }
  });
  observer.observe(selectEl, { childList: true });

  inputFiltro.addEventListener('input', () => {
    if (!selectEl._opcoesOriginais || selectEl._opcoesOriginais.length === 0) {
      salvarOpcoesOriginais();
    }
    const termo = inputFiltro.value.trim().toUpperCase();
    const valorAtual = selectEl.value;

    const filtradas = selectEl._opcoesOriginais.filter((opt, idx) => {
      if (opt.value === '' && idx === 0) return true; // Mantém o placeholder "-- Selecione --"
      return bateComPrefixoEquipamento(opt.text, termo);
    });

    selectEl.innerHTML = '';
    filtradas.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.text = opt.text;
      selectEl.appendChild(o);
    });

    // Se encontrou opções válidas com o prefixo, já seleciona a primeira automaticamente
    const primeiraValida = filtradas.find(o => o.value !== '');
    if (termo && primeiraValida) {
      selectEl.value = primeiraValida.value;
    } else if (filtradas.some(o => o.value === valorAtual)) {
      selectEl.value = valorAtual;
    }
  });
}

// Ativa a busca por prefixo apenas nos selects d
