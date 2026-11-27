'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

function igual(atual, esperado) {
  assert.equal(JSON.stringify(atual), JSON.stringify(esperado));
}

function base(id, extra = {}) {
  const ordem = extra.ordem || 10;
  return {
    id,
    nome: id,
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: {},
    scripts: [{ src: `${id}.js`, tipo: 'classico' }],
    permissoes: { [`${id}.ver`]: 'ver' },
    telas: [{ id, rotulo: id, icone: 'fa-circle', ordem, permissao: `${id}.ver`, abrir: 'abrir', titulo_relatorio: id }],
    ...extra,
    ordem
  };
}

test('carrega os scripts na ordem topológica e não repete vendor', async () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const manifestos = [
    base('a', { vendor: ['vendor/compartilhado.js'], ordem: 10 }),
    base('b', { depende: { a: '^1.0.0' }, vendor: ['vendor/compartilhado.js'], ordem: 20 })
  ];
  const resolucao = Vilasa.modulos.resolver(['a', 'b'], manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src) => { chamadas.push(src); }
  });
  igual(chamadas, ['vendor/compartilhado.js', 'a.js', 'b.js']);
  igual(carga.carregados, ['a', 'b']);
  igual(carga.bloqueados, []);
});

test('os módulos atuais pedem os scripts na ordem das dependências', async () => {
  const { Vilasa } = carregarVilasa(raiz);
  const manifestos = Vilasa.modulos.lista();
  const resolucao = Vilasa.modulos.resolver({ todos: true }, manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src, tipo) => {
      assert.equal(tipo, 'classico');
      chamadas.push(src);
    }
  });
  igual(chamadas, [
    'os_rep.js', 'frota.js', 'pcm_sap.js', 'estoque.js', 'diesel.js', 'kpis.js', 'admin.js'
  ]);
  igual(carga.carregados, ['os', 'frota', 'preventivas', 'estoque', 'diesel', 'painel', 'admin']);
  igual(carga.bloqueados, []);
});

test('ciclo não pede o script dos módulos do ciclo', async () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const manifestos = [
    base('a', { depende: { b: '^1.0.0' }, ordem: 10 }),
    base('b', { depende: { a: '^1.0.0' }, ordem: 20 }),
    base('c', { ordem: 30 })
  ];
  const resolucao = Vilasa.modulos.resolver(['a', 'b', 'c'], manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src) => { chamadas.push(src); }
  });
  igual(chamadas, ['c.js']);
  igual(carga.carregados, ['c']);
  igual(carga.bloqueados.map((item) => item.id), ['a', 'b']);
  assert.ok(carga.bloqueados.every((item) => item.motivo.includes('Ciclo')));
});

test('dependência ausente não pede o script de quem ficou bloqueado', async () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const manifestos = [
    base('a'),
    base('b', { depende: { a: '^1.0.0', c: '^1.0.0' }, ordem: 20 })
  ];
  const resolucao = Vilasa.modulos.resolver(['a', 'b'], manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src) => { chamadas.push(src); }
  });
  igual(chamadas, ['a.js']);
  igual(carga.carregados, ['a']);
  assert.equal(carga.bloqueados.length, 1);
  assert.equal(carga.bloqueados[0].id, 'b');
  assert.match(carga.bloqueados[0].motivo, /não existe/);
});

test('falha de script bloqueia o módulo e quem depende dele, sem derrubar o resto', async () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const manifestos = [
    base('a', { ordem: 10 }),
    base('b', { depende: { a: '^1.0.0' }, ordem: 20 }),
    base('c', { ordem: 30 })
  ];
  const resolucao = Vilasa.modulos.resolver(['a', 'b', 'c'], manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src) => {
      chamadas.push(src);
      if (src === 'a.js') throw new Error('a.js');
    }
  });
  igual(chamadas, ['a.js', 'c.js']);
  igual(carga.carregados, ['c']);
  const porId = new Map(carga.bloqueados.map((item) => [item.id, item.motivo]));
  assert.match(porId.get('a') || '', /a\.js/);
  assert.match(porId.get('b') || '', /não carregou/);
  assert.equal(porId.has('c'), false);
});

test('falha no iniciar bloqueia o módulo e o dependente', async () => {
  const { Vilasa, sandbox } = carregarVilasa(raiz, { manifestos: false });
  sandbox.VilasaMod = {
    a: {
      iniciar() { throw new Error('boot-a'); }
    }
  };
  const manifestos = [
    base('a', { ordem: 10 }),
    base('b', { depende: { a: '^1.0.0' }, ordem: 20 })
  ];
  const resolucao = Vilasa.modulos.resolver(['a', 'b'], manifestos);
  /** @type {string[]} */
  const chamadas = [];
  const carga = await Vilasa.modulos.carregar(resolucao, manifestos, {
    carregarScript: async (src) => { chamadas.push(src); }
  });
  igual(chamadas, ['a.js']);
  igual(carga.carregados, []);
  igual(carga.bloqueados.map((item) => item.id), ['a', 'b']);
});

test('o index não fixa os scripts dos módulos e o cache lê a versão única', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  for (const src of ['os_rep.js', 'pcm_sap.js', 'frota.js', 'estoque.js', 'kpis.js', 'diesel.js', 'admin.js']) {
    assert.equal(html.includes(`src="${src}"`), false, src);
  }
  assert.equal(html.includes('src="nucleo/versao.js"'), true);
  assert.equal(html.includes('src="vendor/xlsx.mini.min.js"'), false);

  const versao = fs.readFileSync(path.join(raiz, 'nucleo/versao.js'), 'utf8');
  assert.match(versao, /var VILASA_VERSAO_APP = 'v24'/);
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.match(sw, /importScripts\('\.\/nucleo\/versao\.js'\)/);
  assert.match(sw, /const VERSAO = VILASA_VERSAO_APP/);
  assert.equal(/const VERSAO = 'v\d+'/.test(sw), false);
  assert.match(sw, /ARQUIVOS_NUCLEO/);
  for (const arquivo of ['./offline_sync.js', './qr.html', './config.js', './nucleo/versao.js', './modulos/os/manifesto.js']) {
    assert.equal(sw.includes(`'${arquivo}'`), true, arquivo);
  }
  for (const arquivo of ['./os_rep.js', './pcm_sap.js', './frota.js', './estoque.js', './kpis.js', './diesel.js', './admin.js']) {
    assert.equal(sw.includes(`'${arquivo}'`), false, arquivo);
  }
});
