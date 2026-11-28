'use strict';

// Contrato do módulo em runtime: o núcleo carrega o módulo de exemplo
// (test/fixtures/modulo-exemplo), entrega o ctx escopado e isola as falhas.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

/**
 * Núcleo num sandbox, só com os módulos de exemplo, já carregados.
 * @param {{ usuario?: any, semResolverQuebrado?: boolean }} [opcoes]
 */
async function montar(opcoes = {}) {
  const { Plataforma, sandbox, contexto } = carregarPlataforma(raiz, { manifestos: false });
  /** @type {any[]} */
  const consoleErros = [];
  sandbox.console = { log() {}, info() {}, warn() {}, error: (...a) => consoleErros.push(a) };
  sandbox.usuarioLogado = opcoes.usuario || { id: 'u1', cargos_lista: ['admin'], ativo: true };
  /** @type {any[]} */
  const gravacoes = [];
  sandbox.gravarDadosOfflineSafe = async (...args) => { gravacoes.push(args); return { data: null, error: null }; };
  sandbox.lerDadosComFallbackOffline = async (chave, fn, meta) => ({ data: [chave, meta && meta.modulo] });
  sandbox.obterClienteSupabase = () => ({ from: (t) => `from:${t}`, rpc: (n) => `rpc:${n}` });
  const rodar = (/** @type {string} */ rel) => vm.runInContext(fs.readFileSync(path.join(raiz, rel), 'utf8'), contexto, { filename: rel });
  rodar('test/fixtures/modulo-exemplo/manifesto.js');
  const ordem = ['fornecedor', 'exemplo', 'quebrado'];
  const resolucao = { ordem, ativos: ['nucleo', ...ordem], bloqueados: [], avisos: [] };
  const carga = await Plataforma.modulos.carregar(resolucao, Plataforma.modulos.lista(), {
    carregarScript: async (src) => rodar(src),
    criarCtx: (m) => Plataforma.modulos.criarCtx(m)
  });
  return { Plataforma, sandbox, contexto, carga, gravacoes, consoleErros };
}

test('carrega os módulos bons e bloqueia só o que falhou no iniciar', async () => {
  const { carga, sandbox } = await montar();
  assert.equal(JSON.stringify(carga.carregados), JSON.stringify(['fornecedor', 'exemplo']));
  assert.equal(carga.bloqueados.length, 1);
  assert.equal(carga.bloqueados[0].id, 'quebrado');
  assert.match(carga.bloqueados[0].motivo, /defeito no iniciar/);
  assert.equal(sandbox.__exemplo.ctx.id, 'exemplo');
});

test('um iniciar global solto não é chamado para os módulos', async () => {
  const { Plataforma, sandbox, contexto } = carregarPlataforma(raiz, { manifestos: false });
  let chamado = 0;
  sandbox.iniciar = () => { chamado += 1; };
  vm.runInContext("Plataforma.modulos.registrar({ id: 'solto', nome: 'S', versao: '1.0.0', categoria: 'manutencao', estagio: 'beta', obrigatorio: false, depende: { nucleo: '^1.0.0' }, scripts: [{ src: 'x.js', tipo: 'classico' }], permissoes: {}, tabelas: [] });", contexto);
  const carga = await Plataforma.modulos.carregar({ ordem: ['solto'], ativos: ['nucleo', 'solto'], bloqueados: [], avisos: [] },
    Plataforma.modulos.lista(), { carregarScript: async () => {} });
  assert.equal(JSON.stringify(carga.carregados), JSON.stringify(['solto']));
  assert.equal(chamado, 0);
});

test('depois da carga, menu, relatórios e QR mostram só os módulos carregados', async () => {
  const { Plataforma } = await montar();
  const telas = Plataforma.telas.ordenadas().map((t) => t.id);
  assert.equal(telas.includes('exemplo'), true);
  assert.equal(telas.includes('fornecedor'), true);
  assert.equal(telas.includes('quebrado'), false);
  assert.equal(JSON.stringify(Plataforma.extensoes.qr().map((a) => a.id)), JSON.stringify(['exemplo_qr']));
  assert.equal(Plataforma.extensoes.relatoriosDaTela('fornecedor').length, 1);
});

test('a barra de relatórios confere a permissão de cada relatório', async () => {
  const { Plataforma, sandbox } = await montar();
  const filhos = [];
  const doc = { createElement: () => ({ append() {}, set className(v) {}, set title(v) {} }) };
  const container = { ownerDocument: doc, set textContent(v) {}, appendChild: (n) => filhos.push(n) };
  Plataforma.extensoes.montarBarra(container, 'fornecedor', () => {});
  assert.equal(filhos.length, 1, 'admin vê');
  sandbox.usuarioLogado = { id: 'u2', cargos_lista: ['mecanico'], permissoes: ['exemplo.ver'], ativo: true };
  filhos.length = 0;
  Plataforma.extensoes.montarBarra(container, 'fornecedor', () => {});
  assert.equal(filhos.length, 0, 'sem fornecedor.ver, o botão não aparece');
});

test('ctx: serviço só do que está em consome; fornecedor opcional desligado dá null', async () => {
  const { sandbox } = await montar();
  const ctx = sandbox.__exemplo.ctx;
  assert.equal(JSON.stringify(ctx.servico('fornecedor.dados')()), JSON.stringify(['a', 'b']));
  assert.equal(ctx.servico('ausente.coisa'), null);
  assert.throws(() => ctx.servico('os.ordens'), /não está em consome/);
});

test('ctx: eventos só os declarados, e o ouvinte recebe', async () => {
  const { sandbox } = await montar();
  const ctxExemplo = sandbox.__exemplo.ctx;
  const ctxFornecedor = sandbox.__fornecedor.ctx;
  ctxFornecedor.eventos.emitir('fornecedor.pronto', { n: 1 });
  assert.equal(sandbox.__exemplo.recebido.length, 1);
  assert.throws(() => ctxExemplo.eventos.emitir('fornecedor.pronto'), /não está em eventos.emite/);
  assert.throws(() => ctxExemplo.eventos.ouvir('os.concluida', () => {}), /não está em eventos.ouve/);
  ctxExemplo.eventos.emitir('exemplo.feito', {});
});

test('ctx: config da empresa com padrões; valor inválido cai no padrão com aviso', async () => {
  const usuario = {
    id: 'u1', cargos_lista: ['admin'], ativo: true,
    modulos: [{ id: 'exemplo', config: { limite: 999, rotulo: 'Fazenda', estranho: 1 } }]
  };
  const { sandbox } = await montar({ usuario });
  const ctx = sandbox.__exemplo.ctx;
  assert.equal(ctx.config.limite, 10);
  assert.equal(ctx.config.rotulo, 'Fazenda');
  assert.equal(Object.prototype.hasOwnProperty.call(ctx.config, 'estranho'), false);
  assert.equal(ctx.avisos.length, 1);
  assert.match(ctx.avisos[0], /config.limite/);
  assert.equal(Object.isFrozen(ctx.config), true);
});

test('ctx: db só tabela e RPC do módulo ou do núcleo', async () => {
  const { sandbox } = await montar();
  const ctx = sandbox.__exemplo.ctx;
  assert.equal(ctx.db.from('exemplo_registros'), 'from:exemplo_registros');
  assert.equal(ctx.db.from('equipamentos'), 'from:equipamentos', 'tabela do núcleo pode');
  assert.equal(ctx.db.rpc('exemplo_fechar'), 'rpc:exemplo_fechar');
  assert.throws(() => ctx.db.from('fornecedor_itens'), /Use o serviço do módulo dono/);
  assert.throws(() => ctx.db.rpc('os_assumir'), /não é do módulo nem do núcleo/);
});

test('ctx: offline grava e lê só o declarado, já com o módulo', async () => {
  const { sandbox, gravacoes } = await montar();
  const ctx = sandbox.__exemplo.ctx;
  await ctx.offline.gravar('exemplo_registros', 'INSERT', { a: 1 });
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0][4].modulo, 'exemplo');
  await assert.rejects(ctx.offline.gravar('ordens_servico', 'INSERT', {}), /não está em offline/);
  const lido = await ctx.offline.ler('exemplo_lista', () => null);
  assert.equal(JSON.stringify(lido.data), JSON.stringify(['exemplo_lista', 'exemplo']));
  await assert.rejects(ctx.offline.ler('os_ativas', () => null), /não está em offline.cache/);
});

test('ctx: contexto só leitura e o próprio ctx congelado', async () => {
  const { sandbox } = await montar();
  const ctx = sandbox.__exemplo.ctx;
  assert.equal(ctx.contexto.usuario.id, 'u1');
  assert.equal(Object.isFrozen(ctx), true);
  assert.throws(() => { 'use strict'; ctx.contexto.usuario = null; });
  assert.equal(ctx.pode('exemplo.ver'), true);
});

test('tela com erro vira aviso só nela; a outra abre', async () => {
  const { Plataforma, consoleErros } = await montar();
  assert.equal(await Plataforma.telas.abrir('exemplo'), true);
  assert.equal(await Plataforma.telas.abrir('exemplo_quebrada'), false);
  assert.equal(consoleErros.some((a) => /exemplo_quebrada/.test(String(a[0]))), true);
  assert.equal(await Plataforma.telas.abrir('fornecedor'), true);
});

test('descarregar chama o parar, solta os ouvintes e zera a carga', async () => {
  const { Plataforma, sandbox } = await montar();
  const ctxFornecedor = sandbox.__fornecedor.ctx;
  await Plataforma.modulos.descarregar();
  assert.equal(sandbox.__exemplo.parou, true);
  assert.equal(Plataforma.modulos.carregados().length, 0);
  ctxFornecedor.eventos.emitir('fornecedor.pronto', {});
  assert.equal(sandbox.__exemplo.recebido.length, 0, 'ouvinte do exemplo foi solto');
});

test('ctx: serviço do núcleo (nucleo.locais) responde', async () => {
  const { sandbox, contexto } = await montar();
  vm.runInContext("cacheLocais = [{ id: 'L1' }];", contexto);
  const locais = sandbox.__exemplo.ctx.servico('nucleo.locais')();
  assert.equal(locais.length, 1);
  assert.equal(locais[0].id, 'L1');
});

test('descarregar e carregar de novo, sem recarregar a página, funciona', async () => {
  const { Plataforma, sandbox } = await montar();
  await Plataforma.modulos.descarregar();
  const ordem = ['fornecedor', 'exemplo'];
  let baixados = 0;
  const carga = await Plataforma.modulos.carregar({ ordem, ativos: ['nucleo', ...ordem], bloqueados: [], avisos: [] },
    Plataforma.modulos.lista(), { carregarScript: async () => { baixados += 1; }, criarCtx: (m) => Plataforma.modulos.criarCtx(m) });
  assert.equal(JSON.stringify(carga.carregados), JSON.stringify(ordem));
  assert.equal(baixados, 0, 'script já rodou nesta página: não injeta de novo');
  assert.equal(carga.bloqueados.length, 0);
  assert.equal(sandbox.__exemplo.parou, false, 'o iniciar rodou de novo com ctx novo');
});

test('ctx: manifesto e usuário são cópias congeladas; o registro não muda', async () => {
  const { Plataforma, sandbox } = await montar();
  const ctx = sandbox.__exemplo.ctx;
  assert.throws(() => { 'use strict'; ctx.manifesto.permissoes['exemplo.novo'] = 'x'; });
  assert.throws(() => { 'use strict'; ctx.contexto.usuario.cargos_lista.push('admin'); });
  const original = Plataforma.modulos.lista().find((m) => m.id === 'exemplo');
  assert.equal(Object.prototype.hasOwnProperty.call(original.permissoes, 'exemplo.novo'), false);
  assert.equal(sandbox.usuarioLogado.cargos_lista.length, 1);
});

test('sessão sem módulos contratados (modulos: []) não reduz o menu ao Admin', async () => {
  const { Plataforma, sandbox } = carregarPlataforma(raiz);
  sandbox.usuarioLogado = { id: 'a', cargos_lista: ['admin'], ativo: true, modulos: [] };
  const resolucao = Plataforma.modulos.resolverEGuardar(Plataforma.sessao.contratoDe(sandbox.usuarioLogado));
  await Plataforma.modulos.carregar(resolucao, Plataforma.modulos.lista(), { carregarScript: async () => {} });
  assert.equal(Plataforma.telas.ordenadas().length > 1, true);
});

test('carga vazia não esvazia o menu', () => {
  const { Plataforma } = carregarPlataforma(raiz);
  return Plataforma.modulos.carregar({ ordem: [], ativos: ['nucleo'], bloqueados: [], avisos: [] }, Plataforma.modulos.lista(),
    { carregarScript: async () => {} }).then(() => {
    assert.equal(Plataforma.telas.ordenadas().length > 0, true);
  });
});

test('definirModulo recusa módulo sem manifesto, serviço fora do fornece e repetição', () => {
  const { Plataforma, contexto } = carregarPlataforma(raiz, { manifestos: false });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'test/fixtures/modulo-exemplo/manifesto.js'), 'utf8'), contexto);
  assert.throws(() => Plataforma.definirModulo('naoexiste', {}), /manifesto desse módulo não foi registrado/);
  assert.throws(() => Plataforma.definirModulo('fornecedor', { servicos: { 'fornecedor.outro': 1 } }), /não está em fornece/);
  Plataforma.definirModulo('quebrado', {});
  assert.throws(() => Plataforma.definirModulo('quebrado', {}), /já foi definido/);
});

test('compatibilidade: módulo sem definirModulo ainda acha a função global, com um aviso só', () => {
  const { Plataforma, sandbox } = carregarPlataforma(raiz, { manifestos: false });
  /** @type {any[]} */
  const infos = [];
  sandbox.console = { info: (m) => infos.push(m), warn() {}, error() {}, log() {} };
  sandbox.abrirLegado = () => 'ok';
  sandbox.outraLegada = () => 'ok';
  assert.equal(Plataforma.resolverFuncao('abrirLegado', 'legado')(), 'ok');
  assert.equal(Plataforma.resolverFuncao('outraLegada', 'legado')(), 'ok');
  assert.equal(infos.length, 1);
  assert.match(infos[0], /Módulo legado usa funções globais/);
});

test('o ctx.js é carregado depois do contexto em todas as páginas e no SW', () => {
  for (const pagina of ['index.html', 'qr.html']) {
    const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    const ctx = html.indexOf('src="nucleo/ctx.js"');
    assert.ok(ctx > html.indexOf('src="nucleo/contexto.js"'), pagina);
  }
  assert.equal(fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8').includes("'./nucleo/ctx.js'"), true);
});
