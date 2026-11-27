'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

function igual(atual, esperado) {
  assert.equal(JSON.stringify(atual), JSON.stringify(esperado));
}

const raiz = path.resolve(__dirname, '..');

function base(id, extra = {}) {
  return {
    id,
    nome: id,
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: {},
    scripts: [],
    permissoes: { [`${id}.ver`]: 'ver' },
    telas: [{ id, rotulo: id, icone: 'fa-circle', ordem: extra.ordem || 10, permissao: `${id}.ver`, abrir: 'abrir', titulo_relatorio: id }],
    ...extra
  };
}

test('resolve todos os módulos atuais sem bloqueio, na ordem das telas', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const lista = Plataforma.modulos.lista();
  const resultado = Plataforma.modulos.resolver({ todos: true }, lista);
  igual(resultado.bloqueados, []);
  igual(resultado.avisos, []);
  igual(resultado.ordem, ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'painel', 'admin']);
  assert.equal(resultado.ativos[0], 'nucleo');
});

test('módulo obrigatório entra mesmo fora do contrato', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const resultado = Plataforma.modulos.resolver({ ativos: ['os'] }, Plataforma.modulos.lista());
  igual(resultado.ordem, ['os', 'admin']);
  igual(resultado.bloqueados, []);
});

test('id sem manifesto vira aviso e não derruba o resto', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const resultado = Plataforma.modulos.resolver({ ativos: ['fantasma'] }, Plataforma.modulos.lista());
  assert.equal(resultado.ordem.includes('fantasma'), false);
  assert.equal(resultado.ordem.includes('admin'), true);
  assert.ok(resultado.avisos.some((aviso) => aviso.includes('fantasma')));
});

test('dependência ausente bloqueia o módulo e quem precisa dele', () => {
  const { Plataforma } = carregarPlataforma(raiz, { manifestos: false });
  const resultado = Plataforma.modulos.resolver(['a', 'b'], [
    base('a'),
    base('b', { depende: { a: '^1.0.0', c: '^1.0.0' }, ordem: 20 })
  ]);
  igual(resultado.ordem, ['a']);
  assert.equal(resultado.bloqueados.length, 1);
  assert.equal(resultado.bloqueados[0].id, 'b');
  assert.match(resultado.bloqueados[0].motivo, /não existe/);
});

test('faixa de versão incompatível bloqueia sem derrubar os outros', () => {
  const { Plataforma } = carregarPlataforma(raiz, { manifestos: false });
  const resultado = Plataforma.modulos.resolver(['a', 'b'], [
    base('a', { versao: '2.0.0' }),
    base('b', { depende: { a: '^1.0.0' }, ordem: 20 })
  ]);
  igual(resultado.ordem, ['a']);
  assert.equal(resultado.bloqueados[0].id, 'b');
  assert.match(resultado.bloqueados[0].motivo, /não cabe/);
});

test('ciclo deixa os módulos do ciclo bloqueados', () => {
  const { Plataforma } = carregarPlataforma(raiz, { manifestos: false });
  const resultado = Plataforma.modulos.resolver(['a', 'b', 'c'], [
    base('a', { depende: { b: '^1.0.0' }, ordem: 10 }),
    base('b', { depende: { a: '^1.0.0' }, ordem: 20 }),
    base('c', { ordem: 30 })
  ]);
  igual(resultado.ordem, ['c']);
  igual(resultado.bloqueados.map((item) => item.id), ['a', 'b']);
  assert.ok(resultado.bloqueados.every((item) => item.motivo.includes('Ciclo')));
});

test('filtra pelo usuário e puxa só a dependência obrigatória', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const lista = Plataforma.modulos.lista();
  const preventivas = Plataforma.modulos.resolver(
    { todos: true, permissoes: ['preventivas.ver'] },
    lista
  );
  igual(preventivas.ordem, ['os', 'frota', 'preventivas']);

  const painel = Plataforma.modulos.resolver(
    { todos: true, permissoes: ['painel.ver'] },
    lista
  );
  igual(painel.ordem, ['os', 'painel']);

  const estoque = Plataforma.modulos.resolver(
    { todos: true, permissoes: ['estoque.ver'] },
    lista
  );
  igual(estoque.ordem, ['estoque']);
});

test('o resolver não altera a lista recebida', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const lista = Plataforma.modulos.lista();
  const antes = lista.map((item) => item.id).join(',');
  Plataforma.modulos.resolver({ todos: true }, lista);
  assert.equal(lista.map((item) => item.id).join(','), antes);
});
