'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { carregarVilasa } = require('../scripts/carregar-sandbox');
const { validarRegistros, validarRepositorio, validarCatalogoSql } = require('../scripts/validar-manifestos');

const raiz = path.resolve(__dirname, '..');

test('os manifestos do repositório passam no validador', () => {
  const erros = validarRepositorio(raiz);
  assert.deepEqual(erros, []);
});

test('o validador recusa catálogo SQL sem uma permissão do manifesto', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const sql = fs.readFileSync(path.join(raiz, 'banco', 'migracoes', '0002_plataforma_empresas_modulos.sql'), 'utf8')
    .replace("('os.abrir', 'os', 'Abrir ordem de serviço'),\n", '');
  const erros = validarCatalogoSql(sql, Vilasa.modulos.lista(), Vilasa.permissoes.matrizTraduzida());
  assert.ok(erros.some((erro) => erro.includes('os.abrir')));
});

test('o validador recusa ciclo, prefixo errado e script ausente', () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const tela = (id) => [{
    id, rotulo: id, icone: 'fa-circle', ordem: 1, permissao: `${id}.ver`, abrir: 'abrir', titulo_relatorio: id
  }];
  Vilasa.modulos.registrar({
    id: 'a', nome: 'A', versao: '1.0.0', categoria: 'manutencao', estagio: 'estavel', obrigatorio: false,
    depende: { b: '^1.0.0' }, scripts: [{ src: 'nao-existe.js', tipo: 'classico' }],
    permissoes: { 'outro.ver': 'errado', 'a.ver': 'ver' }, telas: tela('a')
  });
  Vilasa.modulos.registrar({
    id: 'b', nome: 'B', versao: '1.0.0', categoria: 'manutencao', estagio: 'estavel', obrigatorio: false,
    depende: { a: '^1.0.0' }, scripts: [{ src: 'b.js', tipo: 'classico' }],
    permissoes: { 'b.ver': 'ver' }, telas: tela('b')
  });
  const erros = validarRegistros(Vilasa.modulos.lista(), {
    existe: (rel) => rel === 'b.js',
    resolver: Vilasa.modulos.resolver
  });
  assert.ok(erros.some((erro) => erro.includes('prefixo')));
  assert.ok(erros.some((erro) => erro.includes('nao-existe.js')));
  assert.ok(erros.some((erro) => erro.includes('Ciclo')));
});
