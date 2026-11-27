'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

test('evento local é síncrono e também acorda o ouvinte do manifesto', () => {
  const { Vilasa, sandbox } = carregarVilasa(raiz, { manifestos: false });
  /** @type {any[]} */
  const recebidos = [];
  sandbox.reagirOsConcluida = (dados) => recebidos.push(dados);
  const cancelar = Vilasa.eventos.ouvir('os.concluida', (dados) => recebidos.push(['direto', dados]));
  Vilasa.modulos.registrar({
    id: 'ouvinte',
    nome: 'Ouvinte',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    scripts: [],
    permissoes: {},
    extensoes: { ouve: { 'os.concluida': 'reagirOsConcluida' } }
  });
  Vilasa.eventos.emitir('os.concluida', { id: 7 });
  assert.deepEqual(recebidos, [['direto', { id: 7 }], { id: 7 }]);
  cancelar();
  Vilasa.eventos.emitir('os.concluida', { id: 8 });
  assert.equal(recebidos.length, 3);
  assert.deepEqual(recebidos[2], { id: 8 });
});

test('sem id a etiqueta é antiga e não vira busca por tag', () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const antiga = Vilasa.qr.lerUrl('?tag=CB-05&nome=PA');
  assert.equal(antiga.etiquetaAntiga, true);
  assert.equal(antiga.id, '');
  assert.equal(antiga.mensagem, 'Etiqueta antiga: peça a reimpressão');
  const comId = Vilasa.qr.lerUrl('?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f&tag=CB-05');
  assert.equal(comId.etiquetaAntiga, false);
  assert.equal(comId.id, '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f');
  assert.equal(comId.tag, 'CB-05');
  const html = fs.readFileSync(path.join(raiz, 'qr.html'), 'utf8');
  assert.match(html, /Etiqueta antiga: peça a reimpressão/);
  assert.match(html, /p_id: equipAtualQR\.id/);
  assert.equal(html.includes('p_tag'), false);
  assert.equal(html.includes('Digite a tag'), false);
  assert.equal(html.includes('digitar a máquina'), false);
});

test('a URL canônica do QR identifica a máquina só pelo id', () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const id = '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f';
  assert.equal(
    Vilasa.qr.urlCanonica(id),
    `https://vilasa-manut.vercel.app/qr.html?id=${id}`
  );
  assert.equal(Vilasa.qr.URL_BASE, 'https://vilasa-manut.vercel.app/qr.html');
});

test('as etiquetas atuais continuam com id, tag, nome e unidade', () => {
  const frota = fs.readFileSync(path.join(raiz, 'frota.js'), 'utf8');
  const inicio = frota.indexOf('const URL_BASE_QR_PRODUCAO');
  const fim = frota.indexOf('function abrirEtiquetaQRIndividual');
  const sandbox = { URLSearchParams };
  vm.runInContext(frota.slice(inicio, fim), vm.createContext(sandbox));
  const url = sandbox.gerarUrlQRCodeOfflineReady({
    id: '3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f',
    tag: 'CB-05',
    nome: 'PÁ CARREGADEIRA',
    unidade_medida: 'H'
  });
  assert.equal(
    url,
    'https://vilasa-manut.vercel.app/qr.html?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f&tag=CB-05&nome=P%C3%81+CARREGADEIRA&un=H'
  );
});

test('o QR declara leitura sem login e abertura de OS com os.abrir', () => {
  const { Vilasa } = carregarVilasa(raiz);
  const acoes = Vilasa.extensoes.qr();
  const leitura = acoes.find((acao) => acao.id === 'lancar_leitura');
  const abrir = acoes.find((acao) => acao.id === 'abrir_os');
  assert.equal(leitura && leitura.exige_login, false);
  assert.equal(leitura && leitura.moduloId, 'frota');
  assert.equal(abrir && abrir.exige_login, true);
  assert.equal(abrir && abrir.permissao, 'os.abrir');
  assert.equal(abrir && abrir.moduloId, 'os');
});
