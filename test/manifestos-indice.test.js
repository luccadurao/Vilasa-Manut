'use strict';

// Fase 3: as páginas, o service worker e a fila offline se guiam pelo índice
// e pelos manifestos. Módulo novo não mexe em lista fixa nenhuma.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');
const ler = (/** @type {string} */ rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

/**
 * Documento falso: guarda os <script> injetados e deixa o teste decidir se
 * cada um carrega, falha ou carrega sem registrar.
 */
function documentoFalso() {
  /** @type {any[]} */
  const injetados = [];
  const doc = {
    injetados,
    head: { appendChild(/** @type {any} */ s) { injetados.push(s); } },
    createElement() { return { src: '', async: true, onload: null, onerror: null }; }
  };
  return doc;
}

/**
 * Núcleo sem manifestos, com o índice e um documento falso.
 * @param {string[]} indice
 */
function abrirComDocumento(indice) {
  const { sandbox, contexto } = carregarPlataforma(raiz, { manifestos: false });
  // O sandbox já rodou o carregador sem document; roda de novo como a página.
  const doc = documentoFalso();
  sandbox.document = doc;
  sandbox.PLATAFORMA_MODULOS = Object.freeze(indice.slice());
  sandbox.PLATAFORMA_VERSAO_APP = 'v99';
  sandbox.console = { warn() {}, info() {}, error() {}, log() {} };
  vm.runInContext(ler('nucleo/manifestos.js'), contexto, { filename: 'nucleo/manifestos.js' });
  return { sandbox, contexto, doc };
}

test('o carregador injeta um manifesto por módulo do índice, em ordem e com a versão', async () => {
  const { sandbox, contexto, doc } = abrirComDocumento(['os', 'frota', 'os', '../fora']);
  const P = sandbox.Plataforma;
  assert.equal(P.modulos.manifestosCarregados(), false);
  // Repetido e id estranho não viram <script>.
  assert.equal(JSON.stringify(doc.injetados.map((s) => s.src)), JSON.stringify(['modulos/os/manifesto.js?v=v99', 'modulos/frota/manifesto.js?v=v99']));
  assert.equal(doc.injetados.every((s) => s.async === false), true);
  // os carrega e registra; frota falha no download.
  vm.runInContext(ler('modulos/os/manifesto.js'), contexto, { filename: 'modulos/os/manifesto.js' });
  doc.injetados[0].onload();
  doc.injetados[1].onerror();
  await P.modulos.manifestosProntos();
  assert.equal(P.modulos.manifestosCarregados(), true);
  assert.equal(P.modulos.lista().some((/** @type {any} */ m) => m.id === 'os'), true);
  const falhas = P.modulos.manifestosComFalha().map((/** @type {any} */ f) => f.id).sort();
  assert.equal(JSON.stringify(falhas), JSON.stringify(['../fora', 'frota']));
});

test('arquivo que carrega sem registrar o manifesto conta como falha, e não trava os outros', async () => {
  const { sandbox, doc } = abrirComDocumento(['painel']);
  doc.injetados[0].onload();
  await sandbox.Plataforma.modulos.manifestosProntos();
  assert.match(sandbox.Plataforma.modulos.manifestosComFalha()[0].motivo, /não registrou/);
});

test('a carga dos módulos espera os manifestos do índice', async () => {
  const { sandbox, contexto, doc } = abrirComDocumento(['os']);
  const P = sandbox.Plataforma;
  let resolveu = false;
  sandbox.usuarioLogado = { id: '1', cargos_lista: ['mecanico'], modulos: ['os'] };
  const carga = P.modulos.garantirCarregados
    ? P.modulos.garantirCarregados(sandbox.usuarioLogado)
    : P.garantirCarregados(sandbox.usuarioLogado);
  carga.then(() => { resolveu = true; }, () => { resolveu = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(resolveu, false, 'resolveu antes de o manifesto chegar');
  vm.runInContext(ler('modulos/os/manifesto.js'), contexto, { filename: 'modulos/os/manifesto.js' });
  doc.injetados[0].onload();
  await carga.catch(() => null);
  assert.equal(resolveu, true);
  assert.equal(P.modulos.ultimaResolucao().bloqueados.some((/** @type {any} */ b) => b.id === 'os'), false);
});

test('index.html e qr.html carregam o índice e o carregador, e nenhum manifesto fixo', () => {
  for (const pagina of ['index.html', 'qr.html']) {
    const html = ler(pagina);
    assert.equal(/src="modulos\/[^"/]+\/manifesto\.js"/.test(html), false, pagina);
    const indice = html.indexOf('src="modulos/indice.js"');
    const carregador = html.indexOf('src="nucleo/manifestos.js"');
    assert.ok(indice > html.indexOf('src="nucleo/ctx.js"'), pagina);
    assert.ok(indice > 0 && indice < carregador, pagina);
  }
});

test('o service worker monta o precache dos manifestos pelo índice', () => {
  const sw = ler('sw.js');
  assert.equal(/'\.\/modulos\/[^'/]+\/manifesto\.js'/.test(sw), false);
  const indice = ler('modulos/indice.js');
  // Roda o topo do sw.js (até a lista) com o índice de verdade.
  const topo = sw.slice(sw.indexOf('const ARQUIVOS_NUCLEO'), sw.indexOf('];', sw.indexOf('const ARQUIVOS_NUCLEO')) + 2);
  const sandbox = {};
  vm.runInContext(`${indice}\n${topo}\nthis.lista = ARQUIVOS_NUCLEO;`, vm.createContext(sandbox));
  const lista = /** @type {any} */ (sandbox).lista;
  const ids = /** @type {any} */ (sandbox).PLATAFORMA_MODULOS;
  for (const id of ids) assert.equal(lista.includes(`./modulos/${id}/manifesto.js`), true, id);
  assert.equal(lista.includes('./nucleo/manifestos.js'), true);
});

test('o portal QR chama a ação pelo manifesto e não testa nome de cargo', () => {
  const html = ler('qr.html');
  assert.equal(/onclick="enviar(OSViaQRCode|ApenasHorimetroViaQRCode)\(\)"/.test(html), false);
  assert.match(html, /onclick="executarAcaoQr\('abrir_os'\)"/);
  assert.match(html, /onclick="executarAcaoQr\('lancar_leitura'\)"/);
  assert.match(html, /Plataforma\.resolverFuncao\(acao\.funcao, acao\.moduloId\)/);
  assert.equal(/cargos(_lista)?\.includes\(/.test(html), false);
  assert.equal(/cargos?\w*\s*===\s*'/.test(html), false);
  assert.equal(/CARGOS_QUE_ABREM_OS/.test(html), false);
  assert.match(html, /pode\('os\.executar', sessao\)/);
});
