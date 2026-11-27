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

test('o primeiro acesso mostra a empresa e o vazio vale o padrão do ambiente', () => {
  const { Plataforma, sandbox } = carregarPlataforma(raiz, { manifestos: false });
  const store = memoria();
  const estado = Plataforma.sessao.estadoLoginEmpresa(store, false);
  assert.equal(estado.lembrada, null);
  assert.equal(estado.mostrarCampo, true);
  assert.equal(estado.mostrarLembrada, false);
  // Sem ambiente: vazio deixa o servidor escolher a empresa 1 do banco.
  assert.equal(Plataforma.sessao.codigoEmpresa(''), '');
  // Produção da Vilasa (config.js): vazio vira VILASA.
  sandbox.AMBIENTE_ATUAL = { empresa_padrao: 'vilasa' };
  assert.equal(Plataforma.sessao.codigoEmpresa(''), 'VILASA');
  assert.equal(Plataforma.sessao.CODIGO_EMPRESA_PADRAO, 'VILASA');
  assert.equal(Plataforma.sessao.codigoEmpresa('  outra '), 'OUTRA');
});

test('a marca é a empresa logada, depois a do ambiente, depois o produto', () => {
  const { Plataforma, sandbox } = carregarPlataforma(raiz, { manifestos: false });
  assert.equal(Plataforma.marca.nome(null), sandbox.PLATAFORMA_PRODUTO.nome);
  sandbox.AMBIENTE_ATUAL = { marca: 'Vilasa' };
  assert.equal(Plataforma.marca.nome(null), 'Vilasa');
  const pessoa = { empresa: { codigo: 'agro-sul', nome: 'Agro Sul Ltda' } };
  assert.equal(Plataforma.marca.nome(pessoa), 'Agro Sul Ltda');
  assert.equal(Plataforma.marca.prefixoArquivo(pessoa), 'AGRO_SUL');
  assert.equal(Plataforma.marca.prefixoArquivo({ empresa: { nome: 'Fazenda São João' } }), 'FAZENDA_SAO_JOAO');
  assert.equal(Plataforma.marca.prefixoArquivo(null), 'VILASA');
});

test('depois do primeiro acesso a empresa fica lembrada e a troca reabre o campo', () => {
  const { Plataforma } = carregarPlataforma(raiz, { manifestos: false });
  const store = memoria();
  Plataforma.sessao.lembrarEmpresa(store, 'vilasa');
  const quieto = Plataforma.sessao.estadoLoginEmpresa(store, false);
  assert.equal(quieto.mostrarCampo, false);
  assert.equal(quieto.mostrarLembrada, true);
  assert.equal(quieto.codigo, 'VILASA');
  assert.equal(store.getItem(Plataforma.sessao.CHAVE_EMPRESA), 'VILASA');
  const trocando = Plataforma.sessao.estadoLoginEmpresa(store, true);
  assert.equal(trocando.mostrarCampo, true);
  assert.equal(trocando.mostrarLembrada, false);
  assert.equal(trocando.codigo, 'VILASA');
});

test('a sessão guarda empresa_id a partir do perfil', () => {
  const { Plataforma } = carregarPlataforma(raiz, { manifestos: false });
  const store = memoria();
  const sessao = Plataforma.sessao.gravar(store, {
    id: '9',
    matricula: '9',
    nome: 'Ana',
    cargos_lista: ['mecanico'],
    ativo: true,
    empresa_id: '00000000-0000-0000-0000-000000000001',
    empresa: {
      id: '00000000-0000-0000-0000-000000000001',
      codigo: 'VILASA',
      nome: 'Vilasa'
    }
  });
  assert.equal(sessao && sessao.empresa_id, '00000000-0000-0000-0000-000000000001');
  const usuario = Plataforma.sessao.usuarioDe(Plataforma.sessao.ler(store));
  assert.equal(usuario.empresa_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(usuario.empresa.codigo, 'VILASA');
});

test('a tela de login manda a empresa no resolver_login e lembra o código', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(raiz, 'core.js'), 'utf8');
  assert.match(html, /id="loginEmpresa"/);
  assert.match(html, /abrirTrocaEmpresa\(\)/);
  assert.match(core, /p_empresa: codigoEmpresa/);
  assert.match(core, /lembrarEmpresa/);
  assert.match(core, /prepararCampoEmpresa\(false\)/);
});

test('a fila nova guarda empresa_id e o INSERT leva a empresa no payload', () => {
  const { sandbox, contexto } = carregarPlataforma(raiz, { manifestos: false });
  const store = memoria();
  sandbox.Plataforma.sessao.gravar(store, {
    id: '9',
    nome: 'Ana',
    ativo: true,
    empresa: { id: '00000000-0000-0000-0000-000000000001', codigo: 'VILASA' }
  });
  sandbox.localStorage = store;
  sandbox.crypto = crypto;
  sandbox.navigator = { onLine: false };
  sandbox.document = {
    visibilityState: 'hidden',
    addEventListener() {},
    getElementById() { return null; }
  };
  sandbox.addEventListener = () => {};
  sandbox.setInterval = () => 0;
  sandbox.setTimeout = () => 0;
  sandbox.alert = () => {};
  sandbox.confirm = () => false;
  vm.runInContext(
    fs.readFileSync(path.join(raiz, 'offline_sync.js'), 'utf8'),
    contexto,
    { filename: 'offline_sync.js' }
  );
  const item = sandbox.enfileirarOperacaoOffline('ordens_servico', 'INSERT', {
    equipamento_id: 'eq-1',
    descricao_problema: 'VAZAMENTO'
  });
  assert.equal(item.empresa_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(item.payload.empresa_id, '00000000-0000-0000-0000-000000000001');
  assert.ok(item.payload.id);

  const rpc = sandbox.enfileirarOperacaoOffline('lancar_horimetro', 'RPC', {
    p_equipamento: 'eq-1',
    p_leitura: 10
  });
  assert.equal(rpc.empresa_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(Object.prototype.hasOwnProperty.call(rpc.payload, 'empresa_id'), false);
  assert.equal(rpc.payload.p_equipamento, 'eq-1');
});
