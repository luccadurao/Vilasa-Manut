// ============================================================================
// VILASA CMMS V2 - MÓDULO 1: CORE.JS (COMPLETO, VALIDADO E PRONTO PARA USO)
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
  if (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
    try {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return db;
    } catch (e) {
      console.warn('Não foi possível criar o cliente Supabase:', e);
    }
  }
  return null;
}

// 1. MATRIZ DE PERMISSÕES POR CARGO (RBAC) - SEM RELATÓRIOS P/ OPERADOR, MECÂNICO E ENCARREGADO
const MATRIZ_PERMISSOES_CARGOS = {
  operador: {
    label: 'Operador de Equipamento',
    abas_visiveis: ['os'],
    acoes: ['lancar_horimetro_qr']
  },
  mecanico: {
    label: 'Mecânico / Eletricista',
    abas_visiveis: ['os', 'preventivas', 'estoque'],
    acoes: ['abrir_os', 'executar_os', 'lancar_horimetro_qr']
  },
  almoxarife: {
    label: 'Almoxarife / Compras',
    abas_visiveis: ['estoque', 'os', 'frota'],
    acoes: ['gerenciar_catalogo_estoque', 'lancar_nf_entrada', 'dar_baixa_estoque', 'exportar_relatorios']
  },
  encarregado: {
    label: 'Encarregado',
    abas_visiveis: ['os'],
    acoes: ['abrir_os']
  },
  pcm: {
    label: 'Analista de PCM',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'diesel'],
    acoes: ['abrir_os', 'executar_os', 'classificar_rep_pcm', 'gerenciar_frota', 'gerenciar_preventivas', 'gerenciar_diesel', 'exportar_relatorios']
  },
  gestor: {
    label: 'Gestor / Diretoria',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'diesel'],
    acoes: ['exportar_relatorios']
  },
  engenheiro: {
    label: 'Engenheiro de Manutenção',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'diesel'],
    acoes: [
      'abrir_os', 'executar_os', 'classificar_rep_pcm', 'gerenciar_frota',
      'gerenciar_preventivas', 'gerenciar_diesel', 'gerenciar_catalogo_estoque', 'lancar_nf_entrada',
      'dar_baixa_estoque', 'lancar_horimetro_qr', 'exportar_relatorios'
    ]
  },
  admin: {
    label: 'Administrador Master',
    abas_visiveis: ['os', 'frota', 'preventivas', 'estoque', 'kpis', 'diesel', 'admin'],
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
  if (window.Vilasa && Vilasa.permissoes && typeof Vilasa.permissoes.podeVerTela === 'function') {
    return Vilasa.permissoes.podeVerTela(abaId, user);
  }
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

  let resultado = false;
  if (window.Vilasa && Vilasa.permissoes && typeof Vilasa.permissoes.podeAcaoLegada === 'function') {
    resultado = Vilasa.permissoes.podeAcaoLegada(acao, usuarioLogado);
  } else {
    resultado = cargos.some(cargo => {
      const cfg = MATRIZ_PERMISSOES_CARGOS[cargo];
      return cfg && (cfg.acoes.includes('*') || cfg.acoes.includes(acao));
    });
  }

  if (!resultado && exibirAlerta) {
    alert('Seu perfil não possui permissão para executar esta ação.');
  }
  return resultado;
}

// Escapa texto vindo do banco/digitado antes de colocar em HTML (evita código malicioso na tela e nos relatórios).
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Células de CSV: impede que o Excel execute fórmulas (=, +, -, @) digitadas em campos de texto.
function csvCelula(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t;
  return t.replace(/[\r\n;]+/g, ' ');
}

// 2. AUTENTICAÇÃO E SESSÃO (Supabase Auth)
// Login real: o servidor confere a senha (hash). O celular guarda uma cópia do perfil para
// continuar funcionando SEM SINAL; só o PRIMEIRO acesso no aparelho precisa de internet.
const CHAVE_SESSAO_LOCAL = 'vilasa_sessao_v3';
const CHAVE_SESSAO_ANTERIOR = 'vilasa_sessao_v2';
const COLUNAS_PERFIL_SEGURAS = 'id, matricula, nome, cargos_lista, obras_permitidas, ativo';

function sessaoVilasa() {
  return window.Vilasa && Vilasa.sessao ? Vilasa.sessao : null;
}

function guardarPerfilNaSessao(perfil) {
  const api = sessaoVilasa();
  if (!api) {
    usuarioLogado = perfil;
    localStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(perfil));
    return;
  }
  const sessao = api.gravar(localStorage, perfil);
  usuarioLogado = sessao ? api.usuarioDe(sessao) : perfil;
}

function lerPerfilDaSessao() {
  const api = sessaoVilasa();
  if (!api) {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO_LOCAL) || localStorage.getItem(CHAVE_SESSAO_ANTERIOR);
      if (!bruto) return null;
      const dado = JSON.parse(bruto);
      return dado && dado.perfil ? dado.perfil : dado;
    } catch (e) {
      return null;
    }
  }
  return api.usuarioDe(api.ler(localStorage));
}

function apagarSessaoLocal(limparObra) {
  localStorage.removeItem(CHAVE_SESSAO_LOCAL);
  localStorage.removeItem(CHAVE_SESSAO_ANTERIOR);
  if (limparObra) localStorage.removeItem('vilasa_obra_ativa_v2');
}

let trocaEmpresaAberta = false;

function prepararCampoEmpresa(trocando) {
  trocaEmpresaAberta = !!trocando;
  const api = sessaoVilasa();
  const estado = api && api.estadoLoginEmpresa
    ? api.estadoLoginEmpresa(localStorage, trocaEmpresaAberta)
    : { lembrada: null, mostrarCampo: true, mostrarLembrada: false, codigo: '' };
  document.getElementById('loginEmpresaCampo')?.classList.toggle('hidden', !estado.mostrarCampo);
  document.getElementById('loginEmpresaLembrada')?.classList.toggle('hidden', !estado.mostrarLembrada);
  const rotulo = document.getElementById('loginEmpresaCodigo');
  if (rotulo) rotulo.textContent = estado.codigo || '';
  const input = document.getElementById('loginEmpresa');
  if (input && estado.mostrarCampo && !input.value && estado.codigo) input.value = estado.codigo;
}

function abrirTrocaEmpresa() {
  const input = document.getElementById('loginEmpresa');
  if (input) input.value = '';
  prepararCampoEmpresa(true);
  input?.focus();
}

function codigoEmpresaDoLogin() {
  const api = sessaoVilasa();
  const campo = document.getElementById('loginEmpresaCampo');
  const visivel = !campo || !campo.classList.contains('hidden');
  const texto = visivel
    ? (document.getElementById('loginEmpresa')?.value || '')
    : ((api && api.lerEmpresaLembrada && api.lerEmpresaLembrada(localStorage)) || '');
  if (api && api.codigoEmpresa) return api.codigoEmpresa(texto);
  const limpo = String(texto || '').trim().toUpperCase();
  return limpo || 'VILASA';
}

function erroDeRedeAuth(err) {
  if (!err) return false;
  const t = String((err.name || '') + ' ' + (err.message || '')).toLowerCase();
  return /fetch|network|retryable|failed to|timeout|offline/.test(t);
}

async function realizarLogin(event) {
  if (event) event.preventDefault();
  const clienteDB = obterClienteSupabase();
  if (!clienteDB) return alert('Erro de conexão com o banco (verifique config.js).');

  const loginDigitado = (document.getElementById('loginMatricula')?.value || '').trim();
  const senhaDigitada = (document.getElementById('loginSenha')?.value || '').trim();
  const codigoEmpresa = codigoEmpresaDoLogin();
  if (!loginDigitado || !senhaDigitada) return alert('Informe usuário e senha!');
  if (!navigator.onLine) {
    return alert('📵 Sem sinal. O primeiro acesso neste aparelho precisa de internet. Depois dele o sistema funciona sem sinal.');
  }

  try {
    const rEmail = await clienteDB.rpc('resolver_login', { p_texto: loginDigitado, p_empresa: codigoEmpresa });
    if (rEmail.error) {
      return alert(erroDeRedeAuth(rEmail.error)
        ? 'Sem conexão com o servidor. Tente de novo com sinal.'
        : 'Erro ao validar usuário: ' + rEmail.error.message);
    }
    if (!rEmail.data) return alert('Usuário ou senha incorretos! (Se houver dois colegas com o mesmo primeiro nome, entre pela matrícula.)');

    // Senhas migradas do sistema antigo foram guardadas em minúsculas; senhas novas respeitam o que foi digitado.
    let r = await clienteDB.auth.signInWithPassword({ email: rEmail.data, password: senhaDigitada });
    if (r.error && !erroDeRedeAuth(r.error) && senhaDigitada !== senhaDigitada.toLowerCase()) {
      r = await clienteDB.auth.signInWithPassword({ email: rEmail.data, password: senhaDigitada.toLowerCase() });
    }
    if (r.error) {
      return alert(erroDeRedeAuth(r.error)
        ? 'Sem conexão com o servidor. Tente de novo com sinal.'
        : 'Usuário ou senha incorretos!');
    }

    const rPerfil = await clienteDB.rpc('meu_perfil');
    const perfil = rPerfil.data;
    if (rPerfil.error || !perfil || perfil.ativo === false) {
      await clienteDB.auth.signOut().catch(() => {});
      return alert('Seu cadastro está inativo ou incompleto. Procure o administrador.');
    }

    const apiSessao = sessaoVilasa();
    if (apiSessao && apiSessao.lembrarEmpresa) apiSessao.lembrarEmpresa(localStorage, codigoEmpresa);
    else localStorage.setItem('vilasa_empresa_codigo', codigoEmpresa);
    guardarPerfilNaSessao(perfil);
    await inicializarSistemaPosLogin();
  } catch (e) {
    console.error(e);
    alert('Não foi possível entrar agora. Verifique o sinal e tente novamente.');
  }
}

async function encerrarSessao() {
  try {
    const pendentes = (typeof lerFilaOffline === 'function') ? lerFilaOffline().length : 0;
    if (pendentes > 0 && !confirm('Há ' + pendentes + ' registro(s) ainda NÃO enviados neste celular. Eles ficam guardados e são enviados quando alguém entrar com sinal. Sair mesmo assim?')) return;
  } catch (e) { /* segue */ }
  try { await obterClienteSupabase()?.auth.signOut({ scope: 'local' }); } catch (e) { /* offline: ok */ }
  apagarSessaoLocal(true);
  try { await limparCacheLocalDeDados(); } catch (e) { /* ok */ }
  usuarioLogado = null;
  window.location.reload();
}

async function encerrarSessaoSemPerguntar() {
  try { obterClienteSupabase()?.auth.signOut({ scope: 'local' }); } catch (e) { /* ok */ }
  apagarSessaoLocal(true);
  try { await limparCacheLocalDeDados(); } catch (e) { /* ok */ }
  usuarioLogado = null;
  window.location.reload();
}

async function restaurarSessaoSalva() {
  obterClienteSupabase();
  const mostrarLogin = () => {
    prepararCampoEmpresa(false);
    document.getElementById('telaLogin')?.classList.remove('hidden');
    document.getElementById('appPrincipal')?.classList.add('hidden');
  };
  const cache = lerPerfilDaSessao();
  if (!cache?.id) return mostrarLogin();
  try {
    usuarioLogado = cache; // sem sinal: confia no perfil guardado (campo sem sinal NÃO desloga)

    if (navigator.onLine && obterClienteSupabase()) {
      try {
        const { data: dSess, error: eSess } = await db.auth.getSession();
        const sessao = dSess?.session;
        if (!sessao && !erroDeRedeAuth(eSess)) {
          // Servidor respondeu e não há mais login válido (senha trocada, usuário removido...). Pede novo login.
          // A fila de registros pendentes NÃO é apagada.
          apagarSessaoLocal(false);
          try { await limparCacheLocalDeDados(); } catch (e) { /* ok */ }
          usuarioLogado = null;
          return mostrarLogin();
        }
        if (sessao) {
          const r = await db.rpc('meu_perfil');
          if (!r.error) {
            if (r.data && r.data.ativo !== false) {
              guardarPerfilNaSessao(r.data);
            } else {
              return encerrarSessaoSemPerguntar();
            }
          }
          // Com erro (rede ruim, servidor instável): mantém o perfil local.
        }
      } catch (e) {
        console.warn('Sem confirmação do servidor; mantendo sessão local.', e);
      }
    }
    await inicializarSistemaPosLogin();
  } catch (e) {
    mostrarLogin();
  }
}

// Monta a barra de relatórios e oculta automaticamente para Operador, Mecânico e Encarregado
function montarBotoesBarraExportacaoUniversal() {
  const elTit = document.getElementById('tituloAbaExportacaoUniversal');
  if (!elTit) return;

  const barraCard = elTit.closest('.bg-white') || elTit.parentElement?.parentElement || elTit.parentElement;
  if (!barraCard) return;

  if (!podeExecutarAcao('exportar_relatorios')) {
    barraCard.classList.add('hidden');
    return;
  }
  barraCard.classList.remove('hidden');

  let containerBotoes = document.getElementById('containerBotoesExportacaoTopoV2');
  if (!containerBotoes) {
    Array.from(barraCard.querySelectorAll('button')).forEach(b => b.classList.add('hidden'));
    containerBotoes = document.createElement('div');
    containerBotoes.id = 'containerBotoesExportacaoTopoV2';
    containerBotoes.className = 'flex flex-wrap items-center gap-2';
    barraCard.appendChild(containerBotoes);
  }

  if (window.Vilasa && Vilasa.extensoes) {
    Vilasa.extensoes.montarBarra(containerBotoes, abaAtivaGlobal, (rel) => acionarRelatorioDoRegistro(rel));
    return;
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

function mostrarAvisoModulosBloqueados(carga) {
  const lista = carga && Array.isArray(carga.bloqueados) ? carga.bloqueados : [];
  const antigo = document.getElementById('avisoModulosBloqueados');
  if (!lista.length) {
    if (antigo && typeof antigo.remove === 'function') antigo.remove();
    return;
  }
  const main = document.querySelector('#appPrincipal main');
  if (!main) return;
  const box = antigo || document.createElement('div');
  box.id = 'avisoModulosBloqueados';
  box.className = 'bg-amber-50 border border-amber-400 text-amber-950 rounded-2xl p-3 text-xs font-bold';
  box.textContent = 'Módulos bloqueados (o restante segue disponível): ' + lista.map((b) => `${b.id} — ${b.motivo}`).join(' | ');
  if (!antigo) main.prepend(box);
}

async function inicializarSistemaPosLogin() {
  let carga = null;
  if (window.Vilasa && Vilasa.modulos && typeof Vilasa.modulos.garantirCarregados === 'function') {
    carga = await Vilasa.modulos.garantirCarregados(usuarioLogado);
  }
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
  if (window.Vilasa && Vilasa.modulos && Vilasa.telas) {
    const contrato = window.Vilasa.sessao ? Vilasa.sessao.contratoDe(usuarioLogado) : { todos: true };
    Vilasa.modulos.resolverEGuardar(contrato);
    const menu = document.getElementById('menuLateralModulos');
    if (menu) Vilasa.telas.montarMenu(menu);
    const painel = document.querySelector('#appPrincipal main');
    if (painel) Vilasa.telas.garantirSecoes(painel);
  }

  mostrarAvisoModulosBloqueados(carga);
  const primeiraAba = window.Vilasa && Vilasa.telas ? Vilasa.telas.primeiraVisivel() : null;
  if (primeiraAba) navegarPara(primeiraAba);
}

// 3. SELETOR GLOBAL DE OBRAS
async function carregarObrasEMontarSeletorTopo() {
  try {
    const res = await lerDadosComFallbackOffline('obras_ativas', () => db.from('obras').select('*').eq('ativa', true).order('codigo'));
    cacheObras = Array.isArray(res.data) ? res.data : [];
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
    container.innerHTML = `<div class="text-[11px] font-bold text-amber-700">📍 Obra: ${unica ? `${esc(unica.codigo)} - ${esc(unica.nome)}` : 'Matriz Geral'}</div>`;
    return;
  }

  container.innerHTML = `
    <label class="block text-[10px] font-black uppercase text-slate-500 mb-1">Frente / Obra Ativa:</label>
    <select id="selectObraGlobalTopo" onchange="trocarObraAtivaGlobal(this.value)"
      class="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-extrabold">
      ${podeVerConsolidado ? `<option value="TODAS" ${obraAtivaId === 'TODAS' ? 'selected' : ''}>🌐 TODAS AS OBRAS (CONSOLIDADO)</option>` : ''}
      ${obrasLiberadas.map(o => `<option value="${o.id}" ${obraAtivaId === o.id ? 'selected' : ''}>📍 ${esc(o.codigo)} - ${esc(o.nome)}</option>`).join('')}
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

  const telas = window.Vilasa && Vilasa.telas ? Vilasa.telas.ordenadas() : [];
  const meta = telas.find(t => t.id === modulo) || null;
  const elTit = document.getElementById('tituloAbaExportacaoUniversal');
  if (elTit) elTit.innerText = `Relatórios: ${(meta && meta.titulo_relatorio) || String(modulo).toUpperCase()}`;

  telas.forEach(t => {
    document.getElementById(`sec-${t.id}`)?.classList.add('hidden');
    const btn = document.getElementById(`nav-${t.id}`);
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

  if (!meta || !meta.abrir || !window.Vilasa) return;
  const fn = Vilasa.resolverFuncao(meta.abrir, meta.moduloId);
  if (typeof fn !== 'function') return;
  const args = Array.isArray(meta.abrirArgs) ? meta.abrirArgs : [];
  return fn(...args);
}

// ============================================================================
// 5. MOTOR DUPLO DE EXPORTAÇÃO:
//    A) MODO COMPLETO (TODAS AS ORDENS E TODAS AS COLUNAS)
//    B) MODO ENXUTO 1 PÁGINA - REP (SOMENTE ABERTAS, CABE 18+ ITENS)
// ============================================================================

async function acionarExportacaoUniversalCSV() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const rel = window.Vilasa && Vilasa.extensoes
    ? Vilasa.extensoes.relatoriosDaTela(abaAtivaGlobal).find(item => item.formato === 'csv')
    : null;
  if (rel && window.Vilasa) {
    const fn = Vilasa.resolverFuncao(rel.funcao, rel.moduloId);
    if (typeof fn === 'function') return fn();
  }
  return exportarTabelaVisivelCSV();
}

function acionarRelatorioDoRegistro(rel) {
  if (!rel) return;
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const fn = window.Vilasa ? Vilasa.resolverFuncao(rel.funcao, rel.moduloId) : null;
  if (rel.formato === 'csv') {
    if (typeof fn === 'function') return fn();
    return exportarTabelaVisivelCSV();
  }
  const modo = rel.coleta === 'completo' ? 'completo' : 'enxuto_rep';
  let dados = typeof fn === 'function' ? fn(modo) : null;
  if (!dados || !Array.isArray(dados.colunas)) dados = coletarRelatorioGenericoDaTela();
  if (rel.formato === 'png') return gerarResumoExecutivoPNG(dados);
  return abrirJanelaImpressaoFormatada(dados, modo === 'enxuto_rep');
}

function exportarTabelaVisivelCSV() {
  const sec = document.getElementById(`sec-${abaAtivaGlobal}`);
  const table = sec?.querySelector('table');
  if (!table) return alert('Nenhuma tabela visível para exportar nesta seção.');

  const linhas = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(td => `"${csvCelula(td.innerText.trim()).replace(/"/g, '""')}"`).join(';')
  );
  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `VILASA_${String(abaAtivaGlobal).toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function coletarRelatorioGenericoDaTela() {
  const obraNome = obterNomeObraAtiva();
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

function coletarDadosFiltradosDaAbaAtualParaRelatorio(modo = 'enxuto_rep') {
  const coleta = modo === 'completo' ? 'completo' : 'enxuto';
  if (window.Vilasa && Vilasa.extensoes) {
    const item = Vilasa.extensoes.relatoriosDaTela(abaAtivaGlobal).find(rel => rel.coleta === coleta);
    if (item) {
      const fn = Vilasa.resolverFuncao(item.funcao, item.moduloId);
      if (typeof fn === 'function') {
        const dados = fn(modo);
        if (dados && Array.isArray(dados.colunas)) return dados;
      }
    }
  }
  return coletarRelatorioGenericoDaTela();
}

function imprimirRelatorioGeralCompleto() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  const rel = coletarDadosFiltradosDaAbaAtualParaRelatorio('completo');
  abrirJanelaImpressaoFormatada(rel, false);
}

function gerarRelatorioCompletoPDF() {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
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
      <div style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase;">${esc(k.label)}</div>
      <div style="font-size:15px; font-weight:900; color:#0f172a; margin-top:2px;">${esc(k.valor)}</div>
    </div>
  `).join('');

  const thHtml = rel.colunas.map(c => `<th style="padding:${padCel}; border:1px solid #334155; background:#0f172a; color:#fbbf24; font-size:9.5px; text-transform:uppercase; text-align:left;">${esc(c)}</th>`).join('');
  const trHtml = linhasParaImprimir.map((l, idx) => `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">${l.map((cel, cIdx) => `<td style="padding:${padCel}; border:1px solid #cbd5e1; font-size:${fontCel}; color:#1e293b; font-weight:${cIdx === 0 || cIdx === l.length - 1 ? '800' : '600'};">${esc(cel)}</td>`).join('')}</tr>`).join('');

  win.document.write(`
    <html>
      <head>
        <title>Impressão - ${esc(rel.titulo)}</title>
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
            <h1 style="margin:2px 0; font-size:15px;">${esc(rel.titulo)}</h1>
            <div style="font-size:10px; color:#475569; font-weight:700;">${esc(rel.subtitulo)}</div>
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

async function gerarResumoExecutivoPNG(dadosProntos) {
  if (!podeExecutarAcao('exportar_relatorios', true)) return;
  if (typeof html2canvas === 'undefined') return alert('Aguarde 2 segundos, biblioteca de imagem carregando...');

  const rel = dadosProntos && Array.isArray(dadosProntos.colunas)
    ? dadosProntos
    : coletarDadosFiltradosDaAbaAtualParaRelatorio('enxuto_rep');
  const topLinhas = rel.linhas.slice(0, 24);

  const cardExecutivo = document.createElement('div');
  cardExecutivo.style.cssText = 'position:fixed; left:-9999px; top:0; width:1080px; background:#ffffff; padding:20px; font-family:sans-serif; color:#0f172a; border:4px solid #0f172a;';
  cardExecutivo.innerHTML = `
    <div style="background:#0f172a; color:#ffffff; padding:12px 18px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <div style="color:#fbbf24; font-size:10px; font-weight:900;">VILASA CMMS • QUADRO EXECUTIVO (1 PÁGINA)</div>
        <div style="font-size:17px; font-weight:900; margin-top:2px;">${esc(rel.titulo)}</div>
        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">${esc(rel.subtitulo)}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:#fbbf24; font-weight:800;">${new Date().toLocaleString('pt-BR')}</div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:12px;">
      ${rel.kpisResumo.map(k => `
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #f59e0b; border-radius:8px; padding:8px 10px;">
          <div style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase;">${esc(k.label)}</div>
          <div style="font-size:18px; font-weight:900; color:#0f172a; margin-top:2px;">${esc(k.valor)}</div>
        </div>
      `).join('')}
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10px;">
      <thead><tr style="background:#1e293b; color:#fbbf24;">${rel.colunas.map(c => `<th style="padding:5px 7px; text-align:left; border:1px solid #334155;">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${topLinhas.map((l, idx) => `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">${l.map((cel, cIdx) => `<td style="padding:4.5px 7px; border:1px solid #cbd5e1; font-weight:${cIdx === 0 || cIdx === l.length - 1 ? '800' : '600'};">${esc(cel)}</td>`).join('')}</tr>`).join('')}</tbody>
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
    if (error) { console.error('Falha ao ler ' + tabela + ':', error.message); break; }
    if (!data || data.length === 0) break;
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

document.addEventListener('DOMContentLoaded', async () => {
  await restaurarSessaoSalva();
});
