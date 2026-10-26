// ============================================================================
// VILASA CMMS - MÓDULO 1: CORE.JS (NÚCLEO CENTRAL DA ARQUITETURA MODULAR V2)
// ============================================================================

let usuarioLogado = null;
let obraAtivaId = 'TODAS';
let cacheObras = [];
let cacheEquipamentos = [];
let cacheUsuarios = [];
let cachePecas = [];
let cacheOrdens = [];

// Garante conexão com o Supabase independente do nome da variável no config.js
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
    : (user.cargo_base ? [user.cargo_base] : (user.cargo ? [user.cargo] : ['admin']));
  return [...new Set(lista.map(c => String(c).toLowerCase().trim()).filter(Boolean))];
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
// 2. AUTENTICAÇÃO E SESSÃO (LENDO A COLUNA 'senha_acesso' + CASE-INSENSITIVE)
// ----------------------------------------------------------------------------
async function realizarLogin(event) {
  if (event) event.preventDefault();
  const clienteDB = obterClienteSupabase();
  if (!clienteDB) {
    return alert('Erro de conexão: Verifique se o arquivo config.js está presente na branch modular-v2!');
  }

  const matInput = document.getElementById('loginMatricula');
  const senInput = document.getElementById('loginSenha');
  const loginDigitado = (matInput?.value || '').trim();
  const senDigitada = (senInput?.value || '').trim();

  if (!loginDigitado || !senDigitada) {
    return alert('Informe seu usuário/matrícula e senha!');
  }

  const { data: listaPerfis, error } = await clienteDB
    .from('perfis_usuarios')
    .select('*');

  if (error) {
    return alert('Erro ao consultar usuários no banco: ' + error.message);
  }

  const loginLower = loginDigitado.toLowerCase();
  const senLower = senDigitada.toLowerCase();

  const usuarioEncontrado = (listaPerfis || []).find(u => {
    if (u.ativo === false) return false;

    const matBanco = String(u.matricula || '').trim().toLowerCase();
    const nomeBanco = String(u.nome || '').trim().toLowerCase();
    const userCol = String(u.usuario || u.login || '').trim().toLowerCase();
    // Lê prioritariamente a coluna oficial 'senha_acesso' do seu Supabase
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
    console.error('Erro ao restaurar sessão:', e);
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

  const ehApenasGestor = obterCargosUsuario().length === 1 && obterCargosUsuario()[0] === 'gestor';
  document.querySelectorAll('.acao-edicao').forEach(el => {
    el.classList.toggle('hidden', ehApenasGestor);
  });
}

// ----------------------------------------------------------------------------
// 3. GESTÃO DE MÚLTIPLAS OBRAS E VISÃO CONSOLIDADA (VISUAL TEMA CLARO)
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
    container.className = 'mt-2 pt-2 border-t border-slate-200';
    headerUser.appendChild(container);
  }

  const podeVerConsolidado = temAcessoGlobal || obrasLiberadas.length > 1;

  if (obrasLiberadas.length <= 1 && !podeVerConsolidado) {
    const unica = obrasLiberadas[0];
    container.innerHTML = `
      <div class="text-[11px] font-bold text-amber-700 flex items-center gap-1.5">
        <i class="fa-solid fa-location-dot"></i>
        <span>Obra: ${unica ? `${unica.codigo} - ${unica.nome}` : 'Matriz Geral'}</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <label class="block text-[10px] font-black uppercase text-slate-500 mb-1">
      <i class="fa-solid fa-building-shield text-amber-500 mr-1"></i> Frente / Obra Ativa:
    </label>
    <select id="selectObraGlobalTopo" onchange="trocarObraAtivaGlobal(this.value)"
      class="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-extrabold focus:outline-none focus:border-amber-500">
      ${podeVerConsolidado ? `<option value="TODAS" ${obraAtivaId === 'TODAS' ? 'selected' : ''}>🌐 TODAS AS OBRAS (CONSOLIDADO)</option>` : ''}
      ${obrasLiberadas.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>📍 ${o.codigo} - ${o.nome}</option>`).join('')}
    </select>
  `;
}

function trocarObraAtivaGlobal(novoId) {
  obraAtivaId = novoId || 'TODAS';
  localStorage.setItem('vilasa_obra_ativa_v2', obraAtivaId);
  const secaoVisivel = ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'admin'].find(m => {
    const el = document.getElementById(`sec-${m}`);
    return el && !el.classList.contains('hidden');
  });
  if (secaoVisivel) navegarPara(secaoVisivel);
}

function filtrarListaPorObraAtiva(lista) {
  if (!Array.isArray(lista)) return [];
  if (!obraAtivaId || obraAtivaId === 'TODAS') return lista;
  return lista.filter(item => {
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
// 6. BUSCA ESTRITA E LIMPA POR PREFIXO (TAG)
// ----------------------------------------------------------------------------
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
    if (!selectEl._opcoesOriginais || selectEl._opcoesOriginais.length === 0) {
      salvarOpcoesOriginais();
    }
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
    if (termo && primeiraValida) {
      selectEl.value = primeiraValida.value;
    } else if (filtradas.some(o => o.value === valorAtual)) {
      selectEl.value = valorAtual;
    }
  });
}

// ============================================================================
// 7. PONTE DE SEGURANÇA OFFLINE/ONLINE (GARANTE QUE TODAS AS ABAS FUNCIONEM)
// ============================================================================
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
  } catch (err) {
    console.warn(`Fallback offline acionado para ${chaveCache}:`, err);
  }
  const salvo = localStorage.getItem(`vilasa_cache_${chaveCache}`);
  return { data: salvo ? JSON.parse(salvo) : [], error: null, offline: true };
};

window.gravarDadosOfflineSafe = window.gravarDadosOfflineSafe || async function (tabela, operacao, payload, idRegistro = null) {
  obterClienteSupabase();
  if (operacao === 'INSERT') {
    return await db.from(tabela).insert([payload]).select().maybeSingle();
  } else if (operacao === 'UPDATE') {
    return await db.from(tabela).update(payload).eq('id', idRegistro).select().maybeSingle();
  } else if (operacao === 'DELETE') {
    return await db.from(tabela).delete().eq('id', idRegistro);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  restaurarSessaoSalva();
});
