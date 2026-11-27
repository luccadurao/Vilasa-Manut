'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');
const CAMPOS = ['usuarioLogado', 'obraAtivaId', 'abaAtivaGlobal', 'cacheObras',
  'cacheEquipamentos', 'cacheUsuarios', 'cachePecas', 'cacheOrdens'];

test('o que o código antigo grava sem declarar chega ao núcleo', () => {
  const { Vilasa, sandbox, contexto } = carregarVilasa(raiz);
  // Mesmo jeito do core.js: script clássico que só atribui o nome.
  vm.runInContext(
    "usuarioLogado = { id: '1', cargos_lista: ['mecanico'], ativo: true, empresa: { termos: { 'local.nivel1': 'Fazenda' } } };" +
    "obraAtivaId = 'L1'; cacheObras = [{ id: 'L1' }];",
    contexto
  );
  assert.equal(sandbox.usuarioLogado.id, '1');
  assert.equal(Vilasa.contexto.usuario.id, '1');
  assert.equal(Vilasa.contexto.localAtivoId, 'L1');
  assert.equal(Vilasa.contexto.ler('cacheObras').length, 1);
  // Sem passar o usuário: antes do contexto isto dava sempre false.
  assert.equal(Vilasa.permissoes.pode('os.abrir'), true);
  assert.equal(Vilasa.permissoes.pode('admin.modo_deus'), false);
  assert.equal(Vilasa.termo('local.nivel1'), 'Fazenda');
});

test('valores iniciais e campo desconhecido', () => {
  const { Vilasa, sandbox } = carregarVilasa(raiz);
  assert.equal(sandbox.usuarioLogado, null);
  assert.equal(sandbox.obraAtivaId, 'TODAS');
  assert.equal(Array.isArray(sandbox.cacheEquipamentos), true);
  assert.equal(JSON.stringify(Vilasa.contexto.campos().slice().sort()), JSON.stringify(CAMPOS.slice().sort()));
  assert.throws(() => Vilasa.contexto.ler('naoExiste'), /não tem o campo/);
  assert.throws(() => Vilasa.contexto.definir('naoExiste', 1), /não tem o campo/);
});

test('trocar usuário ou local avisa nucleo.contexto_mudou; cache não avisa', () => {
  const { Vilasa, contexto } = carregarVilasa(raiz);
  /** @type {any[]} */
  const avisos = [];
  Vilasa.eventos.ouvir('nucleo.contexto_mudou', (dados) => avisos.push(dados));
  vm.runInContext("usuarioLogado = { id: '9' }; obraAtivaId = 'L2'; obraAtivaId = 'L2'; cacheOrdens = [1];", contexto);
  assert.equal(JSON.stringify(avisos.map((a) => a.campo)), JSON.stringify(['usuarioLogado', 'obraAtivaId']));
  assert.equal(avisos[1].anterior, 'TODAS');
  assert.equal(avisos[1].atual, 'L2');
});

test('ninguém declara o estado compartilhado com let/const/var', () => {
  const declaracao = new RegExp(`^\\s*(let|const|var)\\s+(${CAMPOS.join('|')})\\b`, 'm');
  const arquivos = fs.readdirSync(raiz).filter((n) => n.endsWith('.js') || n.endsWith('.html'));
  for (const pasta of ['nucleo', ...fs.readdirSync(path.join(raiz, 'modulos')).map((m) => path.join('modulos', m))]) {
    for (const n of fs.readdirSync(path.join(raiz, pasta))) {
      const rel = path.join(pasta, n);
      if (n.endsWith('.js') && rel !== path.join('nucleo', 'contexto.js')) arquivos.push(rel);
    }
  }
  for (const nome of arquivos) {
    const texto = fs.readFileSync(path.join(raiz, nome), 'utf8');
    assert.equal(declaracao.test(texto), false, `${nome} declara um campo do contexto`);
  }
});

test('index.html e qr.html carregam o contexto logo depois do núcleo e antes do core', () => {
  for (const pagina of ['index.html', 'qr.html']) {
    const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    const nucleo = html.indexOf('src="nucleo/nucleo.js"');
    const ctx = html.indexOf('src="nucleo/contexto.js"');
    assert.ok(nucleo > 0 && ctx > nucleo, `${pagina}: contexto depois do núcleo`);
    const core = html.indexOf('src="core.js"');
    if (core !== -1) assert.ok(ctx < core, `${pagina}: contexto antes do core`);
  }
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.equal(sw.includes("'./nucleo/contexto.js'"), true);
});
