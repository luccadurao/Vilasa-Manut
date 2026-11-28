'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { validarContratoV2, objetosDoSql, lerMapaDoScript } = require('../scripts/contrato-v2');
const { validarRepositorio } = require('../scripts/validar-manifestos');

const raiz = path.resolve(__dirname, '..');

/**
 * Um produto mínimo e coerente: núcleo + "vendas" + "rh". Cada teste estraga
 * uma coisa e confere que o validador acusa.
 */
function base() {
  const manifestos = [
    {
      id: 'nucleo', embutido: true, depende: {}, scripts: [],
      tabelas: ['empresas'], rpcs: ['meu_perfil'],
      fornece: { 'nucleo.locais': 'Locais' },
      eventos: { emite: ['nucleo.contexto_mudou'] },
      offline: {}
    },
    {
      id: 'vendas', depende: { nucleo: '^1.0.0' }, opcionais: {},
      scripts: [{ src: 'modulos/vendas/vendas.js', tipo: 'classico' }],
      tabelas: ['pedidos'], rpcs: ['pedido_fechar'],
      fornece: { 'vendas.pedidos': 'Pedidos' },
      consome: ['nucleo.locais'],
      eventos: { emite: ['vendas.pedido_fechado'] },
      config: { desconto_maximo: { tipo: 'numero', padrao: 10, min: 0, max: 50 } },
      offline: { tabelas: ['pedidos'], rpcs: ['pedido_fechar'], cache: ['pedidos_abertos'] },
      telas: [{ id: 'vendas', abrir: 'abrirVendas' }],
      extensoes: { relatorios: [{ id: 'vendas_csv', funcao: 'exportarVendasCSV' }], qr: [] }
    },
    {
      id: 'rh', depende: { nucleo: '^1.0.0', vendas: '^1.0.0' }, opcionais: {},
      scripts: [{ src: 'modulos/rh/rh.js', tipo: 'classico' }],
      tabelas: ['folhas'],
      consome: ['vendas.pedidos'],
      eventos: { ouve: { 'vendas.pedido_fechado': 'aoFecharPedido' } },
      offline: { cache: ['folhas'] },
      telas: [{ id: 'rh', abrir: 'abrirRh' }]
    }
  ];
  const arquivos = {
    'modulos/vendas/vendas.js': 'function abrirVendas() {}\nfunction exportarVendasCSV() {}',
    'modulos/rh/rh.js': 'function abrirRh() {}\nasync function aoFecharPedido(d) {}',
    'core.js': 'function coletarRelatorioGenericoDaTela() {}'
  };
  const fontes = {
    indice: ['vendas', 'rh'],
    pastas: ['rh', 'vendas'],
    paginas: {
      index: '<script src="modulos/vendas/manifesto.js"></script><script src="modulos/rh/manifesto.js"></script>',
      qr: '<script src="modulos/vendas/manifesto.js"></script><script src="modulos/rh/manifesto.js"></script>',
      sw: "'./modulos/vendas/manifesto.js', './modulos/rh/manifesto.js'"
    },
    sql: [
      'CREATE TABLE IF NOT EXISTS public.empresas (id uuid);',
      'CREATE TABLE public.pedidos (id uuid);',
      'CREATE TABLE public.folhas_antigas (id uuid);',
      'ALTER TABLE public.folhas_antigas RENAME TO folhas;',
      'CREATE OR REPLACE FUNCTION public.meu_perfil() RETURNS jsonb AS $$ select 1 $$;',
      'CREATE OR REPLACE FUNCTION public.pedido_fechar(uuid) RETURNS void AS $$ $$;',
      '-- CREATE TABLE public.so_no_comentario (id uuid);'
    ].join('\n'),
    offlineSync: [
      "const MODULO_POR_TABELA = {\n  pedidos: 'vendas',\n  pedido_fechar: 'vendas'\n};",
      "const MODULO_POR_CHAVE = {\n  pedidos_abertos: 'vendas',\n  folhas: 'rh'\n};"
    ].join('\n'),
    /** @param {string} src */
    ler: (src) => /** @type {Record<string, string>} */ (arquivos)[src] || ''
  };
  return { manifestos, fontes, arquivos };
}

/**
 * @param {ReturnType<typeof base>} b
 */
function erros(b) {
  return validarContratoV2(b.manifestos, b.fontes);
}

/**
 * @param {string[]} lista
 * @param {RegExp} padrao
 */
function acusa(lista, padrao) {
  assert.ok(lista.some((e) => padrao.test(e)), `esperava ${padrao}, veio:\n${lista.join('\n')}`);
}

/** @param {ReturnType<typeof base>} b @param {string} id */
const mod = (b, id) => /** @type {any} */ (b.manifestos.find((m) => m.id === id));

test('produto coerente passa sem erro', () => {
  assert.deepEqual(erros(base()), []);
});

test('o repositório real passa no contrato v2', () => {
  assert.deepEqual(validarRepositorio(raiz), []);
});

test('regra 1: índice, pastas e páginas batem', () => {
  let b = base();
  b.fontes.indice = ['vendas'];
  acusa(erros(b), /pasta modulos\/rh não está/);
  acusa(erros(b), /módulo rh está registrado, mas fora/);
  b = base();
  b.fontes.indice.push('fantasma');
  acusa(erros(b), /"fantasma" não tem modulos\/fantasma\/manifesto.js/);
  b = base();
  b.fontes.paginas.sw = "'./modulos/vendas/manifesto.js'";
  acusa(erros(b), /sw.js não guarda modulos\/rh\/manifesto.js/);
  b = base();
  b.fontes.paginas.qr = '';
  acusa(erros(b), /qr.html não carrega modulos\/vendas/);
});

test('regra 2: todo módulo declara depende.nucleo', () => {
  const b = base();
  mod(b, 'rh').depende = { vendas: '^1.0.0' };
  acusa(erros(b), /Módulo rh: declare depende.nucleo/);
});

test('regra 3: toda tabela e RPC tem exatamente um dono e existe no banco', () => {
  let b = base();
  mod(b, 'rh').tabelas = [];
  mod(b, 'rh').offline = { cache: ['folhas'] };
  acusa(erros(b), /public.folhas não tem dono/);
  b = base();
  mod(b, 'rh').tabelas = ['folhas', 'pedidos'];
  acusa(erros(b), /Tabela pedidos tem dois donos: vendas e rh/);
  b = base();
  mod(b, 'vendas').tabelas.push('inexistente');
  acusa(erros(b), /"inexistente" não existe em nenhuma migração/);
  b = base();
  delete mod(b, 'rh').tabelas;
  acusa(erros(b), /Módulo rh: declare "tabelas"/);
  b = base();
  mod(b, 'vendas').rpcs = [];
  mod(b, 'vendas').offline.rpcs = [];
  acusa(erros(b), /função public.pedido_fechar não tem dono/);
});

test('leitor de SQL: renomeação conta e comentário não conta', () => {
  const { tabelas, funcoes } = objetosDoSql(base().fontes.sql);
  assert.equal(tabelas.has('folhas'), true);
  assert.equal(tabelas.has('so_no_comentario'), false);
  assert.equal(funcoes.has('pedido_fechar'), true);
});

test('leitor de SQL: sem esquema, com aspas, DROP e texto entre aspas', () => {
  const { tabelas, funcoes } = objetosDoSql([
    'CREATE TABLE sem_esquema (id int);',
    'CREATE TABLE public."com_aspas" (id int);',
    'CREATE TABLE app.de_outro_esquema (id int);',
    'CREATE TABLE public.apagada (id int);',
    'DROP TABLE IF EXISTS public.apagada;',
    'CREATE FUNCTION public.f_apagada() RETURNS int AS $$ select 1 $$;',
    'DROP FUNCTION IF EXISTS public.f_apagada();',
    "SELECT 'CREATE TABLE AS', 'CREATE TABLE public.em_texto';"
  ].join('\n'));
  assert.equal(tabelas.has('sem_esquema'), true);
  assert.equal(tabelas.has('com_aspas'), true);
  assert.equal(tabelas.has('de_outro_esquema'), false);
  assert.equal(tabelas.has('apagada'), false);
  assert.equal(funcoes.has('f_apagada'), false);
  assert.equal(tabelas.has('as'), false);
  assert.equal(tabelas.has('em_texto'), false);
});

test('regra 4: consome aponta para serviço que existe e cujo dono está nas dependências', () => {
  let b = base();
  mod(b, 'rh').consome = ['estoque.pecas'];
  acusa(erros(b), /consome "estoque.pecas", que nenhum módulo fornece/);
  b = base();
  mod(b, 'rh').depende = { nucleo: '^1.0.0' };
  acusa(erros(b), /de vendas, mas vendas não está em depende nem em opcionais/);
  b = base();
  mod(b, 'rh').depende = { nucleo: '^1.0.0' };
  mod(b, 'rh').opcionais = { vendas: '^1.0.0' };
  assert.deepEqual(erros(b), []);
  b = base();
  mod(b, 'vendas').fornece = { 'pedidos.todos': 'x' };
  acusa(erros(b), /serviço "pedidos.todos" não usa o prefixo "vendas."/);
});

test('regra 5: eventos com prefixo e só se ouve o que alguém emite', () => {
  let b = base();
  mod(b, 'vendas').eventos.emite = ['pedido_fechado'];
  acusa(erros(b), /evento "pedido_fechado" não usa o prefixo "vendas."/);
  acusa(erros(b), /ouve "vendas.pedido_fechado", que nenhum módulo emite/);
  b = base();
  mod(b, 'rh').eventos.ouve['nucleo.contexto_mudou'] = 'aoFecharPedido';
  assert.deepEqual(erros(b), [], 'evento do núcleo declarado pelo núcleo pode ser ouvido');
  b = base();
  mod(b, 'vendas').eventos = {};
  mod(b, 'vendas').extensoes.emite = ['vendas.pedido_fechado'];
  assert.deepEqual(erros(b), [], 'o antigo extensoes.emite continua valendo');
});

test('regra 6: config com tipo, padrão e limites coerentes', () => {
  /** @type {[any, RegExp][]} */
  const casos = [
    [{ tipo: 'cor', padrao: 'azul' }, /tipo "cor" inválido/],
    [{ tipo: 'numero', padrao: '10' }, /padrão que não é do tipo numero/],
    [{ tipo: 'numero', padrao: 60, max: 50 }, /acima do máximo/],
    [{ tipo: 'numero', padrao: -1, min: 0 }, /abaixo do mínimo/],
    [{ tipo: 'numero', padrao: 5, min: 10, max: 1 }, /min maior que max/],
    [{ tipo: 'texto', padrao: 'a', min: 1 }, /só pode ter min\/max se for numero/],
    [{ tipo: 'lista', padrao: ['a', 2] }, /padrão que não é do tipo lista/],
    [{ tipo: 'booleano', padrao: 'sim' }, /padrão que não é do tipo booleano/]
  ];
  for (const [campo, padrao] of casos) {
    const b = base();
    mod(b, 'vendas').config = { campo };
    acusa(erros(b), padrao);
  }
});

test('regra 7: offline só com o que é do módulo e igual ao offline_sync.js', () => {
  let b = base();
  mod(b, 'rh').offline = { tabelas: ['pedidos'], cache: ['folhas'] };
  acusa(erros(b), /offline.tabelas tem "pedidos", que não é do módulo/);
  b = base();
  mod(b, 'rh').offline = { cache: ['folhas', 'pedidos_abertos'] };
  acusa(erros(b), /Chave de cache pedidos_abertos tem dois donos/);
  b = base();
  b.fontes.offlineSync = b.fontes.offlineSync.replace("pedidos: 'vendas'", "pedidos: 'rh'");
  acusa(erros(b), /põe "pedidos" no módulo rh, mas o manifesto de rh não declara/);
  acusa(erros(b), /offline declara "pedidos", mas offline_sync.js não o liga a vendas/);
  b = base();
  b.fontes.offlineSync = '';
  acusa(erros(b), /não achei MODULO_POR_TABELA/);
});

test('leitor dos mapas do offline_sync.js', () => {
  const mapa = lerMapaDoScript("const MODULO_POR_CHAVE = {\n  a_b: 'os', // comentário\n  c: 'frota'\n};", 'MODULO_POR_CHAVE');
  assert.deepEqual(mapa, { a_b: 'os', c: 'frota' });
  assert.equal(lerMapaDoScript('nada', 'MODULO_POR_CHAVE'), null);
});

test('regra 8: funções de tela, relatório, QR e evento existem', () => {
  let b = base();
  b.arquivos['modulos/vendas/vendas.js'] = 'function exportarVendasCSV() {}';
  acusa(erros(b), /a tela "vendas" abre "abrirVendas" não existe/);
  b = base();
  mod(b, 'vendas').extensoes.relatorios.push({ id: 'vendas_pdf', funcao: 'coletarRelatorioGenericoDaTela' });
  assert.deepEqual(erros(b), [], 'função comum do core.js vale');
  b = base();
  mod(b, 'vendas').extensoes.qr = [{ id: 'lancar', funcao: 'lancarPeloQr' }];
  acusa(erros(b), /ação de QR "lancar" chama "lancarPeloQr" não existe/);
  b.fontes.paginas.qr += '<script>function lancarPeloQr() {}</script>';
  assert.deepEqual(erros(b), [], 'ação de QR pode estar no qr.html');
  b = base();
  b.arquivos['modulos/rh/rh.js'] = 'function abrirRh() {}';
  acusa(erros(b), /o evento "vendas.pedido_fechado" chama "aoFecharPedido" não existe/);
  b = base();
  b.arquivos['modulos/vendas/vendas.js'] = 'obj.abrirVendas = function () {}; function exportarVendasCSV() {}';
  acusa(erros(b), /abre "abrirVendas" não existe/);
});
