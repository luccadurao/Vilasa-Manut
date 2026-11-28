'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');
const EMPRESA = '00000000-0000-0000-0000-000000000001';
const OUTRA = '00000000-0000-4000-8000-0000000000aa';

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
    removeItem(chave) { delete dados[chave]; },
    get length() { return Object.keys(dados).length; },
    key(i) { return Object.keys(dados)[i] || null; }
  };
}

/**
 * @param {Record<string, string>} [inicial]
 * @param {{ versao?: string }} [opcoes]
 */
function carregarFila(inicial, opcoes) {
  const { sandbox, contexto } = carregarPlataforma(raiz);
  const store = memoria(inicial);
  sandbox.localStorage = store;
  sandbox.PLATAFORMA_VERSAO_APP = (opcoes && opcoes.versao) || 'v25';
  sandbox.crypto = crypto;
  sandbox.navigator = { onLine: true };
  sandbox.document = {
    visibilityState: 'hidden',
    addEventListener() {},
    getElementById() { return null; },
    createElement() { return { click() {}, remove() {} }; },
    body: { appendChild() {} }
  };
  sandbox.addEventListener = () => {};
  sandbox.setInterval = () => 0;
  sandbox.setTimeout = () => 0;
  sandbox.alert = () => {};
  sandbox.confirm = () => false;
  sandbox.URL = { createObjectURL() { return 'blob:teste'; }, revokeObjectURL() {} };
  sandbox.Blob = function Blob() {};
  vm.runInContext(fs.readFileSync(path.join(raiz, 'offline_sync.js'), 'utf8'), contexto, { filename: 'offline_sync.js' });
  return { sandbox, store };
}

function sessao(sandbox, extra) {
  sandbox.Plataforma.sessao.gravar(sandbox.localStorage, Object.assign({
    id: '9',
    nome: 'Ana',
    ativo: true,
    empresa: { id: EMPRESA, codigo: 'VILASA' },
    modulos: [{ id: 'os' }, { id: 'frota' }, { id: 'nucleo' }],
    permissoes: ['os.abrir', 'os.ver'],
    versao_minima_app: 'v25'
  }, extra || {}));
}

test('o item novo carrega empresa, módulo e versão do app', () => {
  const { sandbox } = carregarFila();
  sessao(sandbox);
  const item = sandbox.enfileirarOperacaoOffline('ordens_servico', 'INSERT', {
    descricao_problema: 'VAZAMENTO'
  });
  assert.equal(item.empresa_id, EMPRESA);
  assert.equal(item.payload.empresa_id, EMPRESA);
  assert.equal(item.modulo, 'os');
  assert.equal(item.versao_app, 'v25');
  assert.equal(item.usuario_id, '9');

  const leitura = sandbox.enfileirarOperacaoOffline('lancar_horimetro', 'RPC', {
    p_equipamento: 'eq-1',
    p_leitura: 12
  });
  assert.equal(leitura.modulo, 'frota');
  assert.equal(Object.prototype.hasOwnProperty.call(leitura.payload, 'empresa_id'), false);
});

test('módulo desligado, outra empresa, versão baixa e 403 vão para suspensos', async () => {
  const { sandbox, store } = carregarFila();
  sessao(sandbox, {
    modulos: [{ id: 'nucleo' }],
    versao_minima_app: 'v25'
  });
  sandbox.PLATAFORMA_VERSAO_APP = 'v24';
  const preparadoVersao = sandbox.prepararFila([
    {
      id_temp: 'v1', tabela: 'ordens_servico', operacao: 'INSERT',
      payload: { id: 'os-1', descricao_problema: 'A' }, idRegistro: null,
      empresa_id: EMPRESA, modulo: 'os', versao_app: 'v24', criado_em: '2026-01-01T00:00:00.000Z'
    }
  ], [], sandbox.contextoDaSessao());
  assert.equal(preparadoVersao.fila.length, 0);
  assert.equal(preparadoVersao.suspensos.length, 1);
  assert.equal(preparadoVersao.suspensos[0].motivo, 'versao_minima_app');

  sandbox.PLATAFORMA_VERSAO_APP = 'v25';
  const ctx = sandbox.contextoDaSessao();
  const preparado = sandbox.prepararFila([
    {
      id_temp: 'mod', tabela: 'ordens_servico', operacao: 'INSERT',
      payload: { id: 'os-2' }, empresa_id: EMPRESA, modulo: 'os', versao_app: 'v25',
      criado_em: '2026-01-02T00:00:00.000Z'
    },
    {
      id_temp: 'emp', tabela: 'ordens_servico', operacao: 'INSERT',
      payload: { id: 'os-3', empresa_id: OUTRA }, empresa_id: OUTRA, modulo: 'os', versao_app: 'v25',
      criado_em: '2026-01-03T00:00:00.000Z'
    }
  ], [], ctx);
  assert.deepEqual([...preparado.suspensos.map((item) => item.motivo)].sort(), ['modulo_desligado', 'outra_empresa']);
  assert.equal(preparado.fila.length, 0);
  assert.equal(preparado.fila.length + preparado.suspensos.length, 2);

  store.setItem('plat_fila_sync_v2', JSON.stringify([{
    id_temp: 'http',
    tabela: 'os_abrir_pelo_qr',
    operacao: 'RPC',
    payload: { p_equipamento: 'eq-1', p_problema: 'X', p_id: 'os-4' },
    empresa_id: EMPRESA,
    modulo: 'nucleo',
    versao_app: 'v25',
    criado_em: '2026-01-04T00:00:00.000Z',
    tentativas: 0
  }]));
  sandbox.db = {
    rpc() {
      return { data: null, error: { message: 'VM403: sem permissão para "os.abrir".', code: 'VM403' }, status: 400 };
    }
  };
  await sandbox.sincronizarFilaOffline();
  const suspensos = JSON.parse(store.getItem('plat_fila_suspensos_v1') || '[]');
  const rejeitados = JSON.parse(store.getItem('plat_fila_rejeitados_v2') || '[]');
  const fila = JSON.parse(store.getItem('plat_fila_sync_v2') || '[]');
  assert.equal(fila.length, 0);
  assert.equal(rejeitados.length, 0);
  assert.equal(suspensos.some((item) => item.id_temp === 'http' && item.motivo === 'vm403'), true);
});

test('suspenso volta para a fila na ordem original quando o módulo liga', () => {
  const { sandbox } = carregarFila();
  sessao(sandbox, { modulos: [{ id: 'os' }, { id: 'frota' }] });
  const fora = sandbox.prepararFila([
    { id_temp: 'a', tabela: 'ordens_servico', operacao: 'INSERT', payload: { id: 'a' }, empresa_id: EMPRESA, modulo: 'os', versao_app: 'v25', criado_em: '2026-02-01T00:00:00.000Z' },
    { id_temp: 'b', tabela: 'lancar_horimetro', operacao: 'RPC', payload: { p_id: 'b' }, empresa_id: EMPRESA, modulo: 'frota', versao_app: 'v25', criado_em: '2026-02-02T00:00:00.000Z' },
    { id_temp: 'c', tabela: 'ordens_servico', operacao: 'INSERT', payload: { id: 'c' }, empresa_id: EMPRESA, modulo: 'os', versao_app: 'v25', criado_em: '2026-02-03T00:00:00.000Z' }
  ], [], Object.assign(sandbox.contextoDaSessao(), { modulos: ['frota'] }));
  assert.deepEqual([...fora.fila.map((item) => item.id_temp)], ['b']);
  assert.deepEqual([...fora.suspensos.map((item) => item.id_temp)], ['a', 'c']);

  const volta = sandbox.prepararFila(fora.fila, fora.suspensos, sandbox.contextoDaSessao());
  assert.deepEqual([...volta.fila.map((item) => item.id_temp)], ['a', 'b', 'c']);
  assert.equal(volta.suspensos.length, 0);
});

test('o badge mostra suspensos e a lista não é descartada', () => {
  const { sandbox, store } = carregarFila();
  sessao(sandbox);
  store.setItem('plat_fila_suspensos_v1', JSON.stringify([
    { id_temp: 's1', motivo: 'modulo_desligado', operacao: 'INSERT', tabela: 'ordens_servico', modulo: 'os' }
  ]));
  const badge = { innerHTML: '' };
  sandbox.document.getElementById = (id) => (id === 'badgeStatusRedeV2' ? badge : null);
  sandbox.atualizarBadgeStatusRede();
  assert.match(badge.innerHTML, /suspensos/);
  assert.equal(JSON.parse(store.getItem('plat_fila_suspensos_v1')).length, 1);
  assert.match(sandbox.textoSuspensos(JSON.parse(store.getItem('plat_fila_suspensos_v1'))), /modulo_desligado/);
});

test('a chave do cache é empresa:modulo:chave e o KPI leva o período', () => {
  const { sandbox } = carregarFila();
  sessao(sandbox);
  const chave = sandbox.resolverChaveLeitura('kpi_os', { modulo: 'painel', periodo: '2026-01-01:2026-01-31' });
  const outra = sandbox.resolverChaveLeitura('kpi_os', { modulo: 'painel', periodo: '2026-02-01:2026-02-28' });
  assert.equal(chave, `${EMPRESA}:painel:kpi_os:2026-01-01:2026-01-31`);
  assert.notEqual(chave, outra);
  assert.equal(sandbox.montarChaveCache(EMPRESA, 'estoque', 'pecas_estoque'), `${EMPRESA}:estoque:pecas_estoque`);
  const kpis = fs.readFileSync(path.join(raiz, 'kpis.js'), 'utf8');
  assert.match(kpis, /periodo: periodoKpi/);
  assert.match(kpis, /filtroKpiDataInicio \+ ':' \+ filtroKpiDataFim/);
});

test('trocar de empresa ou desligar módulo apaga só o cache correspondente', () => {
  const { sandbox } = carregarFila();
  const chaves = [
    `${EMPRESA}:painel:kpi_os:2026-01-01:2026-01-31`,
    `${EMPRESA}:os:os_ativas`,
    `${EMPRESA}:frota:qr:1`,
    `${OUTRA}:os:os_ativas`,
    'kpi_os'
  ];
  const apagar = sandbox.chavesObsoletas(chaves, {
    empresaId: EMPRESA,
    modulosAtivos: ['os', 'nucleo']
  });
  assert.deepEqual(apagar.sort(), [
    `${EMPRESA}:frota:qr:1`,
    `${EMPRESA}:painel:kpi_os:2026-01-01:2026-01-31`,
    `${OUTRA}:os:os_ativas`,
    'kpi_os'
  ].sort());
  assert.equal(apagar.includes(`${EMPRESA}:os:os_ativas`), false);
});

test('o dono do item vem dos manifestos: diesel e admin deixam de ficar sem módulo', () => {
  const { sandbox } = carregarFila();
  sessao(sandbox);
  assert.equal(sandbox.enfileirarOperacaoOffline('diesel_abastecimentos', 'INSERT', { litros: 10 }).modulo, 'diesel');
  assert.equal(sandbox.enfileirarOperacaoOffline('admin_auditoria', 'INSERT', { acao: 'x' }).modulo, 'admin');
  assert.equal(sandbox.enfileirarOperacaoOffline('equipamentos', 'INSERT', { nome: 'A' }).modulo, 'nucleo');
  assert.equal(sandbox.enfileirarOperacaoOffline('preventiva_gerar_os', 'RPC', { p_id: 'p' }).modulo, 'preventivas');
  assert.equal(sandbox.enfileirarOperacaoOffline('tabela_que_nao_existe', 'INSERT', { a: 1 }).modulo, null);
  assert.match(sandbox.resolverChaveLeitura('kpi_os'), /:painel:kpi_os$/);
  assert.match(sandbox.resolverChaveLeitura('chave_solta'), /:nucleo:chave_solta$/);
});

test('enquanto os manifestos chegam, a fila não é reclassificada nem enviada', async () => {
  const { sandbox, store } = carregarFila();
  sessao(sandbox, { modulos: [{ id: 'os' }] });
  const fila = [{ id_temp: 'a', tabela: 'ordens_servico', operacao: 'INSERT', payload: { id: 'a' }, empresa_id: EMPRESA, modulo: 'os', versao_app: 'v25', criado_em: '2026-02-01T00:00:00.000Z' }];
  store.setItem('plat_fila_sync_v2', JSON.stringify(fila));
  let prontos = false;
  sandbox.Plataforma.modulos.manifestosCarregados = () => prontos;
  assert.equal(sandbox.reclassificarFilaOffline(), null);
  sandbox.db = { from() { throw new Error('não devia enviar'); }, rpc() { throw new Error('não devia enviar'); } };
  await sandbox.sincronizarFilaOffline();
  assert.equal(JSON.parse(store.getItem('plat_fila_sync_v2')).length, 1);
  prontos = true;
  assert.notEqual(sandbox.reclassificarFilaOffline(), null);
});

test('com manifesto faltando, item sem dono fica suspenso em vez de ir sem módulo', () => {
  const { sandbox } = carregarFila();
  sessao(sandbox, { modulos: [{ id: 'os' }] });
  sandbox.Plataforma.modulos.manifestosComFalha = () => [{ id: 'diesel', motivo: 'não consegui baixar o manifesto' }];
  const r = sandbox.classificarItemFila({ tabela: 'tabela_de_quem_falhou', operacao: 'INSERT', payload: { id: 'x' }, empresa_id: EMPRESA, versao_app: 'v25' }, sandbox.contextoDaSessao());
  assert.equal(r.destino, 'suspenso');
  assert.equal(r.motivo, 'manifesto_ausente');
  sandbox.Plataforma.modulos.manifestosComFalha = () => [];
  const ok = sandbox.classificarItemFila({ tabela: 'tabela_de_quem_falhou', operacao: 'INSERT', payload: { id: 'x' }, empresa_id: EMPRESA, versao_app: 'v25' }, sandbox.contextoDaSessao());
  assert.equal(ok.destino, 'enviar');
});
