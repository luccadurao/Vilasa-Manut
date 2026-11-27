'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

const TRADUCAO = {
  abrir_os: 'os.abrir',
  executar_os: 'os.executar',
  classificar_rep_pcm: 'os.classificar_rep',
  gerenciar_frota: 'frota.gerenciar',
  lancar_horimetro_qr: 'frota.lancar_leitura',
  gerenciar_preventivas: 'preventivas.gerenciar',
  gerenciar_catalogo_estoque: 'estoque.catalogo',
  lancar_nf_entrada: 'estoque.entrada',
  dar_baixa_estoque: 'estoque.baixar',
  gerenciar_diesel: 'diesel.gerenciar',
  exportar_relatorios: 'relatorios.exportar',
  acesso_modo_deus: 'admin.modo_deus'
};

const ABAS = {
  os: 'os.ver',
  frota: 'frota.ver',
  preventivas: 'preventivas.ver',
  estoque: 'estoque.ver',
  diesel: 'diesel.ver',
  kpis: 'painel.ver',
  admin: 'admin.ver'
};

test('traduz cada ação da matriz atual para um id de permissão', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  for (const [acao, id] of Object.entries(TRADUCAO)) {
    assert.equal(Plataforma.permissoes.traduzirAcao(acao), id, acao);
  }
  for (const [aba, id] of Object.entries(ABAS)) {
    assert.equal(Plataforma.permissoes.traduzirAba(aba), id, aba);
  }
});

test('a matriz traduzida não tem operador e o almoxarife não abre OS', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const matriz = Plataforma.permissoes.matrizTraduzida();
  assert.equal(Object.hasOwn(matriz, 'operador'), false);
  assert.equal(matriz.almoxarife.permissoes.includes('os.abrir'), false);
  assert.equal(matriz.almoxarife.acoes.includes('abrir_os'), false);
  assert.equal(Plataforma.permissoes.pode('os.abrir', { cargos_lista: ['almoxarife'] }), false);
  assert.equal(Plataforma.permissoes.pode('os.ver', { cargos_lista: ['almoxarife'] }), true);
  assert.equal(Plataforma.permissoes.podeVerTela('os', { cargos_lista: ['operador'] }), false);
});

test('o admin da empresa recebe todas as permissões declaradas', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const todas = Plataforma.modulos.lista().flatMap((item) => Object.keys(item.permissoes));
  const efetivas = Plataforma.permissoes.efetivas(['admin']);
  for (const id of todas) assert.equal(efetivas.includes(id), true, id);
  assert.equal(Plataforma.permissoes.pode('admin.modo_deus', { cargos_lista: ['admin'] }), true);
  assert.equal(Plataforma.permissoes.pode('admin.modo_deus', { cargos_lista: ['engenheiro'] }), false);
});

test('cargos combinados somam as permissões', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  const usuario = { cargos_lista: ['mecanico', 'gestor'] };
  assert.equal(Plataforma.permissoes.pode('os.abrir', usuario), true);
  assert.equal(Plataforma.permissoes.pode('relatorios.exportar', usuario), true);
  assert.equal(Plataforma.permissoes.podeVerTela('kpis', usuario), true);
  assert.equal(Plataforma.permissoes.podeVerTela('admin', usuario), false);
});
