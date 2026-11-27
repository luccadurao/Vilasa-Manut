'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

/**
 * @param {Record<string, string>} [inicial]
 */
function igual(atual, esperado) {
  assert.equal(JSON.stringify(atual), JSON.stringify(esperado));
}

function memoria(inicial) {
  /** @type {Record<string, string>} */
  const dados = Object.assign({}, inicial);
  return {
    getItem(chave) {
      return Object.prototype.hasOwnProperty.call(dados, chave) ? dados[chave] : null;
    },
    setItem(chave, valor) { dados[chave] = String(valor); },
    removeItem(chave) { delete dados[chave]; }
  };
}

test('sem módulos nem permissões, o contrato e o pode seguem os manifestos', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const usuario = { id: '1', cargos_lista: ['almoxarife'], ativo: true };
  igual(Plataforma.sessao.contratoDe(usuario), { todos: true });
  assert.equal(Plataforma.permissoes.pode('os.abrir', usuario), false);
  assert.equal(Plataforma.permissoes.pode('os.ver', usuario), true);
  assert.equal(Plataforma.permissoes.pode('estoque.baixar', usuario), true);
  assert.equal(Plataforma.permissoes.pode('admin.modo_deus', { cargos_lista: ['admin'] }), true);
  const todos = Plataforma.modulos.resolver(Plataforma.sessao.contratoDe(usuario), Plataforma.modulos.lista());
  assert.equal(todos.bloqueados.length, 0);
  assert.ok(todos.ordem.length > 1);
});

test('o perfil novo manda no contrato e nas permissões', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const perfil = {
    id: '9',
    matricula: '9',
    nome: 'Ana',
    cargos_lista: ['admin'],
    obras_permitidas: ['TODAS'],
    ativo: true,
    empresa: { id: '00000000-0000-0000-0000-000000000001', codigo: 'VILASA', nome: 'Vilasa', marca: {}, termos: {} },
    modulos: [
      { id: 'os', versao_config: 1, config: {} },
      { id: 'estoque', versao_config: 1, config: {} }
    ],
    permissoes: ['os.ver', 'estoque.ver']
  };
  const sessao = Plataforma.sessao.embrulhar(perfil);
  const usuario = Plataforma.sessao.usuarioDe(sessao);
  assert.equal(usuario.nome, 'Ana');
  assert.equal(usuario.empresa.codigo, 'VILASA');
  igual(Plataforma.sessao.contratoDe(usuario), {
    ativos: ['os', 'estoque'],
    permissoes: ['os.ver', 'estoque.ver']
  });
  assert.equal(Plataforma.permissoes.pode('os.ver', usuario), true);
  assert.equal(Plataforma.permissoes.pode('os.abrir', usuario), false);
  assert.equal(Plataforma.permissoes.pode('admin.modo_deus', usuario), false);
  const resolucao = Plataforma.modulos.resolver(Plataforma.sessao.contratoDe(usuario), Plataforma.modulos.lista());
  igual(resolucao.ordem, ['os', 'estoque']);
});

test('a sessão v2 migra para a v3 e continua no padrão dos manifestos', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const store = memoria({
    plat_sessao_v2: JSON.stringify({
      id: 'abc',
      matricula: '1',
      nome: 'Bia',
      cargos_lista: ['mecanico'],
      obras_permitidas: ['TODAS'],
      ativo: true
    })
  });
  const sessao = Plataforma.sessao.ler(store);
  assert.equal(store.getItem('plat_sessao_v2'), null);
  const guardada = JSON.parse(store.getItem('plat_sessao_v3') || 'null');
  assert.equal(guardada.perfil.nome, 'Bia');
  assert.equal(guardada.modulos, null);
  assert.equal(guardada.permissoes, null);
  const usuario = Plataforma.sessao.usuarioDe(sessao);
  assert.equal(usuario.id, 'abc');
  assert.equal(Object.prototype.hasOwnProperty.call(usuario, 'permissoes'), false);
  igual(Plataforma.sessao.contratoDe(usuario), { todos: true });
  assert.equal(Plataforma.permissoes.pode('os.abrir', usuario), true);
  assert.equal(Plataforma.permissoes.pode('diesel.ver', usuario), false);
});

test('o core grava a v3 e lê a v2 migrada', () => {
  const { sandbox, contexto } = carregarPlataforma(raiz);
  const store = memoria({
    plat_sessao_v2: JSON.stringify({
      id: 'p1',
      matricula: '4',
      nome: 'Caio',
      cargos_lista: ['gestor'],
      obras_permitidas: ['TODAS'],
      ativo: true
    })
  });
  sandbox.localStorage = store;
  sandbox.document = { addEventListener() {} };
  vm.runInContext(fs.readFileSync(path.join(raiz, 'core.js'), 'utf8'), contexto, { filename: 'core.js' });

  const lido = sandbox.lerPerfilDaSessao();
  assert.equal(lido.nome, 'Caio');
  assert.equal(store.getItem('plat_sessao_v2'), null);
  assert.match(store.getItem('plat_sessao_v3') || '', /plat_sessao_v3|gestor|"perfil"/);

  sandbox.guardarPerfilNaSessao({
    id: 'p1',
    matricula: '4',
    nome: 'Caio',
    cargos_lista: ['gestor'],
    ativo: true,
    empresa: { codigo: 'VILASA' },
    modulos: [{ id: 'os', versao_config: 1, config: {} }],
    permissoes: ['os.ver']
  });
  const usuario = vm.runInContext('usuarioLogado', contexto);
  assert.equal(usuario.permissoes[0], 'os.ver');
  igual(sandbox.Plataforma.sessao.contratoDe(usuario), {
    ativos: ['os'],
    permissoes: ['os.ver']
  });
  assert.equal(sandbox.Plataforma.permissoes.pode('diesel.ver', usuario), false);
});

test('o portal QR lê a sessão v3', () => {
  const html = fs.readFileSync(path.join(raiz, 'qr.html'), 'utf8');
  assert.match(html, /Plataforma\.sessao\.ler\(localStorage\)/);
  assert.match(html, /plat_sessao_v2/);
});
