'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

function carregarQr() {
  const carregado = carregarVilasa(raiz);
  vm.runInContext(
    fs.readFileSync(path.join(raiz, 'nucleo/qr.js'), 'utf8'),
    carregado.contexto,
    { filename: 'nucleo/qr.js' }
  );
  return carregado.Vilasa;
}

test('as ações do QR saem dos módulos ativos e o almoxarife não abre OS', () => {
  const Vilasa = carregarQr();
  const acoes = Vilasa.extensoes.qr();
  const ativas = Vilasa.qr.acoesParaContexto({
    acoes,
    modulosAtivos: ['os', 'frota'],
    logado: true,
    permissoes: ['os.abrir', 'os.ver', 'frota.lancar_leitura']
  });
  assert.deepEqual([...ativas.map((acao) => acao.id)].sort(), ['abrir_os', 'lancar_leitura']);

  const semOs = Vilasa.qr.acoesParaContexto({
    acoes,
    modulosAtivos: ['frota'],
    logado: true,
    permissoes: ['os.abrir']
  });
  assert.deepEqual([...semOs.map((acao) => acao.id)], ['lancar_leitura']);

  const almox = Vilasa.qr.acoesParaContexto({
    acoes,
    modulosAtivos: ['os', 'frota'],
    logado: true,
    permissoes: ['os.ver', 'estoque.ver', 'frota.ver']
  });
  assert.equal(almox.some((acao) => acao.id === 'abrir_os'), false);
  assert.equal(almox.some((acao) => acao.id === 'lancar_leitura'), true);

  const anonimo = Vilasa.qr.acoesParaContexto({
    acoes,
    modulosAtivos: ['frota', 'os'],
    logado: false,
    permissoes: []
  });
  assert.deepEqual([...anonimo.map((acao) => acao.id)], ['lancar_leitura']);
});

test('abrir OS pelo QR manda só o id e a página usa a RPC', () => {
  const Vilasa = carregarQr();
  const payload = Vilasa.qr.payloadAbrirOs({
    equipamentoId: '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f',
    problema: 'VAZAMENTO',
    localizacao: 'FRENTE 2',
    horimetro: 120,
    mecanico: 'ANA',
    assumir: true,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  });
  assert.equal(payload.p_equipamento, '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'p_tag'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'tag'), false);
  assert.equal(JSON.stringify(payload).includes('escolha'), false);
  const leitura = Vilasa.qr.leituraDaUrl('?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f&tag=CB-05');
  assert.equal(leitura.etiquetaAntiga, false);
  assert.equal(leitura.id, '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f');
  const antiga = Vilasa.qr.leituraDaUrl('?tag=CB-05');
  assert.equal(antiga.etiquetaAntiga, true);

  const html = fs.readFileSync(path.join(raiz, 'qr.html'), 'utf8');
  assert.match(html, /os_abrir_pelo_qr/);
  assert.match(html, /nucleo\/qr\.js/);
  assert.equal(html.includes("gravarDadosOfflineSafe('ordens_servico'"), false);
  assert.equal(html.includes('p_tag'), false);
  assert.equal(html.includes('Digite a tag'), false);
  assert.equal(html.includes('digitar a máquina'), false);
  assert.equal(html.includes('CARGOS_QUE_ABREM_OS'), false);
});

test('a migração 0005 exige os.abrir e não apaga tabela, coluna, usuário nem policy', () => {
  const sql = fs.readFileSync(path.join(raiz, 'banco/migracoes/0005_offline_qr.sql'), 'utf8');
  assert.match(sql, /app\.exigir\('os\.abrir'\)/);
  assert.match(sql, /os_abrir_pelo_qr/);
  assert.match(sql, /versao_minima_app/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.configuracoes_plataforma/);
  assert.equal(/\bDROP\s+TABLE\b/i.test(sql), false);
  assert.equal(/\bDROP\s+COLUMN\b/i.test(sql), false);
  assert.equal(/\bDROP\s+(ROLE|USER)\b/i.test(sql), false);
  assert.equal(/\bDROP\s+POLICY\b/i.test(sql), false);
  const teste = fs.readFileSync(path.join(raiz, 'banco/docs/testes_0005.sql'), 'utf8');
  const corpo = teste.replace(/--.*$/gm, '');
  assert.match(teste, /só faz SELECT e ASSERT|só leitura/);
  assert.equal(/\bINSERT\b/i.test(corpo), false);
  assert.equal(/\bUPDATE\b/i.test(corpo), false);
  assert.equal(/\bDELETE\b/i.test(corpo), false);
});
