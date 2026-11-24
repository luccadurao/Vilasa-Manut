'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

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
  const { Vilasa } = carregarVilasa(raiz);
  for (const [acao, id] of Object.entries(TRADUCAO)) {
    assert.equal(Vilasa.permissoes.traduzirAcao(acao), id, acao);
  }
  for (const [aba, id] of Object.entries(ABAS)) {
    assert.equal(Vilasa.permissoes.traduzirAba(aba), id, aba);
  }
});

test('a matriz traduzida não tem operador e o almoxarife não abre OS', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const matriz = Vilasa.permissoes.matrizTraduzida();
  assert.equal(Object.hasOwn(matriz, 'operador'), false);
  assert.equal(matriz.almoxarife.permissoes.includes('os.abrir'), false);
  assert.equal(matriz.almoxarife.acoes.includes('abrir_os'), false);
  assert.equal(Vilasa.permissoes.pode('os.abrir', { cargos_lista: ['almoxarife'] }), false);
  assert.equal(Vilasa.permissoes.pode('os.ver', { cargos_lista: ['almoxarife'] }), true);
  assert.equal(Vilasa.permissoes.podeVerTela('os', { cargos_lista: ['operador'] }), false);
});

test('o admin da empresa recebe todas as permissões declaradas', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const todas = Vilasa.modulos.lista().flatMap((item) => Object.keys(item.permissoes));
  const efetivas = Vilasa.permissoes.efetivas(['admin']);
  for (const id of todas) assert.equal(efetivas.includes(id), true, id);
  assert.equal(Vilasa.permissoes.pode('admin.modo_deus', { cargos_lista: ['admin'] }), true);
  assert.equal(Vilasa.permissoes.pode('admin.modo_deus', { cargos_lista: ['engenheiro'] }), false);
});

test('cargos combinados somam as permissões', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const usuario = { cargos_lista: ['mecanico', 'gestor'] };
  assert.equal(Vilasa.permissoes.pode('os.abrir', usuario), true);
  assert.equal(Vilasa.permissoes.pode('relatorios.exportar', usuario), true);
  assert.equal(Vilasa.permissoes.podeVerTela('kpis', usuario), true);
  assert.equal(Vilasa.permissoes.podeVerTela('admin', usuario), false);
});
