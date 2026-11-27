'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

function igual(atual, esperado, rotulo) {
  assert.equal(JSON.stringify(atual), JSON.stringify(esperado), rotulo);
}

const CARGOS = {
  mecanico: {
    abas: ['os', 'preventivas', 'estoque'],
    acoes: ['abrir_os', 'executar_os', 'lancar_horimetro_qr'],
    relatorios: false,
    abrirOs: true,
    executar: true,
    triagem: false
  },
  almoxarife: {
    abas: ['os', 'frota', 'estoque'],
    acoes: ['dar_baixa_estoque', 'exportar_relatorios', 'gerenciar_catalogo_estoque', 'lancar_nf_entrada'],
    relatorios: true,
    abrirOs: false,
    executar: false,
    triagem: false
  },
  encarregado: {
    abas: ['os'],
    acoes: ['abrir_os'],
    relatorios: false,
    abrirOs: true,
    executar: false,
    triagem: false
  },
  pcm: {
    abas: ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'kpis'],
    acoes: ['abrir_os', 'classificar_rep_pcm', 'executar_os', 'exportar_relatorios', 'gerenciar_diesel', 'gerenciar_frota', 'gerenciar_preventivas'],
    relatorios: true,
    abrirOs: true,
    executar: true,
    triagem: true
  },
  gestor: {
    abas: ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'kpis'],
    acoes: ['exportar_relatorios'],
    relatorios: true,
    abrirOs: false,
    executar: false,
    triagem: false
  },
  engenheiro: {
    abas: ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'kpis'],
    acoes: [
      'abrir_os', 'classificar_rep_pcm', 'dar_baixa_estoque', 'executar_os', 'exportar_relatorios',
      'gerenciar_catalogo_estoque', 'gerenciar_diesel', 'gerenciar_frota', 'gerenciar_preventivas',
      'lancar_horimetro_qr', 'lancar_nf_entrada'
    ],
    relatorios: true,
    abrirOs: true,
    executar: true,
    triagem: true
  },
  admin: {
    abas: ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'kpis', 'admin'],
    acoes: [
      'abrir_os', 'acesso_modo_deus', 'classificar_rep_pcm', 'dar_baixa_estoque', 'executar_os',
      'exportar_relatorios', 'gerenciar_catalogo_estoque', 'gerenciar_diesel', 'gerenciar_frota',
      'gerenciar_preventivas', 'lancar_horimetro_qr', 'lancar_nf_entrada'
    ],
    relatorios: true,
    abrirOs: true,
    executar: true,
    triagem: true
  }
};

const ROTULOS = [
  ['os', 'Ordens & REP'],
  ['frota', 'Frota & QR Codes'],
  ['preventivas', 'Preventivas (SAP)'],
  ['estoque', 'Almoxarifado'],
  ['diesel', 'Diesel'],
  ['kpis', 'Indicadores (KPIs)'],
  ['admin', 'Administração']
];

const BOTOES_RELATORIO = [
  'Planilha Completa (CSV)',
  'Imprimir Tudo (Completo)',
  'Imprimir 1 Pág. (Parados/REP)',
  'Exportar 1 Pág. (PNG)'
];

test('cada cargo vê as mesmas abas, ações e relatórios de hoje', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const matriz = Vilasa.permissoes.matrizTraduzida();
  for (const [cargo, esperado] of Object.entries(CARGOS)) {
    igual(matriz[cargo].abas, esperado.abas, cargo);
    igual(matriz[cargo].acoes, esperado.acoes, cargo);
  }
  const usuario = (cargo) => ({ cargos_lista: [cargo] });
  for (const [cargo, esperado] of Object.entries(CARGOS)) {
    assert.equal(Vilasa.permissoes.pode('os.abrir', usuario(cargo)), esperado.abrirOs, `${cargo} abrir`);
    assert.equal(Vilasa.permissoes.podeAcaoLegada('executar_os', usuario(cargo)), esperado.executar, `${cargo} executar`);
    assert.equal(Vilasa.permissoes.podeAcaoLegada('classificar_rep_pcm', usuario(cargo)), esperado.triagem, `${cargo} triagem`);
    assert.equal(Vilasa.permissoes.podeAcaoLegada('exportar_relatorios', usuario(cargo)), esperado.relatorios, `${cargo} relatorios`);
  }
});

test('a barra de relatórios é a mesma em todas as telas', () => {
  const { Vilasa } = carregarVilasa(raiz);
  for (const tela of Vilasa.telas.ordenadas()) {
    const rotulos = Vilasa.extensoes.relatoriosDaTela(tela.id).map((rel) => rel.rotulo);
    igual(rotulos, BOTOES_RELATORIO, tela.id);
  }
});

test('o menu montado na página segue o cargo, sem pedir login', async () => {
  const { sandbox, contexto } = carregarVilasa(raiz);
  const doc = criarDocumento();
  sandbox.document = doc;
  sandbox.navigator = { onLine: false };
  sandbox.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  sandbox.alert = () => {};
  sandbox.confirm = () => false;
  sandbox.URL = URL;
  sandbox.Blob = class Blob {};
  vm.runInContext(fs.readFileSync(path.join(raiz, 'core.js'), 'utf8'), contexto, { filename: 'core.js' });

  for (const nome of ['carregarOrdensServico', 'carregarFrota', 'carregarPreventivas', 'carregarEstoque', 'carregarDiesel', 'calcularKPIs', 'carregarUsuariosAdmin']) {
    sandbox[nome] = () => {};
  }
  sandbox.Vilasa.modulos.garantirCarregados = async () => ({
    carregados: [],
    bloqueados: [],
    avisos: [],
    arquivos: []
  });

  for (const [cargo, esperado] of Object.entries(CARGOS)) {
    vm.runInContext(
      `usuarioLogado = ${JSON.stringify({ id: 't', nome: 'Teste', matricula: '9', cargos_lista: [cargo], obras_permitidas: ['TODAS'], ativo: true })};`,
      contexto
    );
    await sandbox.inicializarSistemaPosLogin();
    const botoes = doc.getElementById('menuLateralModulos').children.map((botao) => ({
      id: botao.id,
      texto: textoDe(botao),
      oculto: botao.classList.contains('hidden')
    }));
    assert.deepEqual(botoes.map((botao) => botao.id), ROTULOS.map(([id]) => `nav-${id}`), cargo);
    assert.deepEqual(botoes.map((botao) => botao.texto), ROTULOS.map(([, rotulo]) => rotulo), cargo);
    const visiveis = botoes.filter((botao) => !botao.oculto).map((botao) => botao.id.replace(/^nav-/, ''));
    assert.deepEqual(visiveis, esperado.abas, cargo);
    const barra = doc.getElementById('barraExportacaoUniversal');
    assert.equal(barra.classList.contains('hidden'), !esperado.relatorios, `${cargo} barra`);
    if (esperado.relatorios) {
      const relatorios = doc.getElementById('containerBotoesExportacaoTopoV2').children.map((botao) => textoDe(botao));
      assert.deepEqual(relatorios, BOTOES_RELATORIO, cargo);
    }
    assert.match(doc.getElementById('sec-os').textContent, /RELATÓRIO DE EQUIPAMENTOS PARADOS/);
  }
});

test('o núcleo não escolhe módulo por nome', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'nucleo/nucleo.js'), 'utf8');
  for (const nome of ['preventivas', 'diesel', 'estoque', 'frota', 'kpis', 'pcm_sap', 'os_rep']) {
    assert.equal(fonte.includes(nome), false, nome);
  }
  const core = fs.readFileSync(path.join(raiz, 'core.js'), 'utf8');
  assert.equal(/abaAtivaGlobal ===/.test(core), false);
  assert.equal(/modulo === '/.test(core), false);
});

/**
 * @param {any} el
 */
function textoDe(el) {
  const proprios = el.textContent || '';
  const filhos = (el.children || []).map((filho) => textoDe(filho)).join('');
  return `${proprios}${filhos}`.replace(/\s+/g, ' ').trim();
}

function criarDocumento() {
  /** @type {any[]} */
  const raizes = [];
  /** @type {any} */
  const doc = {
    children: raizes,
    createElement(tag) { return criarElemento(tag, doc); },
    getElementById(id) { return acharId(raizes, id); },
    querySelector(sel) {
      if (sel === '#appPrincipal main') {
        const app = doc.getElementById('appPrincipal');
        return (app && app.children || []).find((filho) => filho.tagName === 'MAIN') || null;
      }
      if (String(sel).startsWith('#')) return doc.getElementById(String(sel).slice(1));
      return null;
    },
    addEventListener() {}
  };

  const tela = doc.createElement('div');
  tela.id = 'telaLogin';
  raizes.push(tela);

  const app = doc.createElement('div');
  app.id = 'appPrincipal';
  app.className = 'hidden';
  raizes.push(app);

  const bloco = doc.createElement('div');
  const nome = doc.createElement('div');
  nome.id = 'headerNomeUsuario';
  const cargo = doc.createElement('div');
  cargo.id = 'headerCargoUsuario';
  bloco.appendChild(nome);
  bloco.appendChild(cargo);
  app.appendChild(bloco);

  const nav = doc.createElement('nav');
  nav.id = 'menuLateralModulos';
  app.appendChild(nav);

  const main = doc.createElement('main');
  app.appendChild(main);
  const barra = doc.createElement('div');
  barra.id = 'barraExportacaoUniversal';
  barra.className = 'bg-white border border-slate-200 rounded-2xl p-3 shadow-sm';
  const faixa = doc.createElement('div');
  const titulo = doc.createElement('span');
  titulo.id = 'tituloAbaExportacaoUniversal';
  faixa.appendChild(titulo);
  barra.appendChild(faixa);
  main.appendChild(barra);

  const secoes = ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'kpis', 'admin'];
  for (const id of secoes) {
    const secao = doc.createElement('section');
    secao.id = `sec-${id}`;
    if (id !== 'os') secao.className = 'hidden';
    if (id === 'os') secao.textContent = 'RELATÓRIO DE EQUIPAMENTOS PARADOS';
    main.appendChild(secao);
  }
  return doc;
}

/**
 * @param {any[]} nos
 * @param {string} id
 */
function acharId(nos, id) {
  for (const no of nos) {
    if (no.id === id) return no;
    const dentro = acharId(no.children || [], id);
    if (dentro) return dentro;
  }
  return null;
}

/**
 * @param {string} tag
 * @param {any} doc
 */
function criarElemento(tag, doc) {
  /** @type {any} */
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    children: [],
    parentElement: null,
    ownerDocument: doc,
    type: '',
    title: '',
    onclick: null,
    _classes: new Set(),
    _text: '',
    _html: ''
  };
  Object.defineProperty(el, 'className', {
    get() { return [...el._classes].join(' '); },
    set(valor) { el._classes = new Set(String(valor || '').split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(valor) {
      el._text = String(valor == null ? '' : valor);
      el.children = [];
    }
  });
  Object.defineProperty(el, 'innerText', {
    get() { return el._text; },
    set(valor) { el.textContent = valor; }
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(valor) { el._html = String(valor == null ? '' : valor); }
  });
  el.classList = {
    add(...nomes) { for (const nome of nomes) if (nome) el._classes.add(nome); },
    remove(...nomes) { for (const nome of nomes) el._classes.delete(nome); },
    contains(nome) { return el._classes.has(nome); },
    toggle(nome, forcar) {
      const ligado = forcar === undefined ? !el._classes.has(nome) : Boolean(forcar);
      if (ligado) el._classes.add(nome);
      else el._classes.delete(nome);
      return ligado;
    }
  };
  el.append = (...nos) => { for (const no of nos) el.appendChild(no); };
  el.appendChild = (filho) => {
    if (filho.parentElement && filho.parentElement !== el) {
      filho.parentElement.children = filho.parentElement.children.filter((item) => item !== filho);
    }
    filho.parentElement = el;
    if (!el.children.includes(filho)) el.children.push(filho);
    return filho;
  };
  el.closest = (sel) => {
    let no = el;
    while (no) {
      if (String(sel).startsWith('.') && no._classes && no._classes.has(String(sel).slice(1))) return no;
      no = no.parentElement;
    }
    return null;
  };
  el.querySelectorAll = (sel) => {
    /** @type {any[]} */
    const saida = [];
    const andar = (no) => {
      if (sel === 'button' && no.tagName === 'BUTTON') saida.push(no);
      for (const filho of no.children || []) andar(filho);
    };
    for (const filho of el.children) andar(filho);
    return saida;
  };
  return el;
}
