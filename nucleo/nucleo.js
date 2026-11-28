// @ts-check
// ============================================================================
// NÚCLEO DA PLATAFORMA — montagem
// Junta as partes (nucleo/base.js, resolver.js, permissoes.js, sessao.js,
// telas.js, marca.js, carregador.js e termos.js), registra o manifesto do
// núcleo e publica window.Plataforma. Carregue por último entre elas.
// Nenhuma parte cita módulo de produto pelo nome: o núcleo só percorre o
// que cada manifesto registrou.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** @type {any} */
  const N = root.__PlataformaInterno;
  if (!N) throw new Error('Carregue nucleo/base.js antes das outras partes do núcleo.');

  const VERSAO_NUCLEO = N.VERSAO_NUCLEO;
  const implementacoes = N.implementacoes;
  const CHAVE_EMPRESA = N.CHAVE_EMPRESA;
  const CHAVE_SESSAO = N.CHAVE_SESSAO;
  const CHAVE_SESSAO_ANTERIOR = N.CHAVE_SESSAO_ANTERIOR;
  const termo = N.termo;

  /** @param {...any} a */ function abrirTela(...a) { return N.abrirTela(...a); }
  /** @param {...any} a */ function acoesQr(...a) { return N.acoesQr(...a); }
  /** @param {...any} a */ function aplicarMarca(...a) { return N.aplicarMarca(...a); }
  /** @param {...any} a */ function carregar(...a) { return N.carregar(...a); }
  /** @param {...any} a */ function codigoEmpresa(...a) { return N.codigoEmpresa(...a); }
  /** @param {...any} a */ function codigoEmpresaPadrao(...a) { return N.codigoEmpresaPadrao(...a); }
  /** @param {...any} a */ function contratoDe(...a) { return N.contratoDe(...a); }
  /** @param {...any} a */ function definirModulo(...a) { return N.definirModulo(...a); }
  /** @param {...any} a */ function descarregar(...a) { return N.descarregar(...a); }
  /** @param {...any} a */ function efetivas(...a) { return N.efetivas(...a); }
  /** @param {...any} a */ function embrulharSessao(...a) { return N.embrulharSessao(...a); }
  /** @param {...any} a */ function emitir(...a) { return N.emitir(...a); }
  /** @param {...any} a */ function estadoLoginEmpresa(...a) { return N.estadoLoginEmpresa(...a); }
  /** @param {...any} a */ function garantirCarregados(...a) { return N.garantirCarregados(...a); }
  /** @param {...any} a */ function garantirSecoes(...a) { return N.garantirSecoes(...a); }
  /** @param {...any} a */ function gravarSessao(...a) { return N.gravarSessao(...a); }
  /** @param {...any} a */ function lembrarEmpresa(...a) { return N.lembrarEmpresa(...a); }
  /** @param {...any} a */ function lerEmpresaLembrada(...a) { return N.lerEmpresaLembrada(...a); }
  /** @param {...any} a */ function lerSessao(...a) { return N.lerSessao(...a); }
  /** @param {...any} a */ function lerUrlQr(...a) { return N.lerUrlQr(...a); }
  /** @param {...any} a */ function lista(...a) { return N.lista(...a); }
  /** @param {...any} a */ function matrizTraduzida(...a) { return N.matrizTraduzida(...a); }
  /** @param {...any} a */ function montarBarra(...a) { return N.montarBarra(...a); }
  /** @param {...any} a */ function montarMenu(...a) { return N.montarMenu(...a); }
  /** @param {...any} a */ function nomeDaMarca(...a) { return N.nomeDaMarca(...a); }
  /** @param {...any} a */ function ouvir(...a) { return N.ouvir(...a); }
  /** @param {...any} a */ function pode(...a) { return N.pode(...a); }
  /** @param {...any} a */ function podeAcaoLegada(...a) { return N.podeAcaoLegada(...a); }
  /** @param {...any} a */ function podeVerTela(...a) { return N.podeVerTela(...a); }
  /** @param {...any} a */ function prefixoArquivo(...a) { return N.prefixoArquivo(...a); }
  /** @param {...any} a */ function primeiraVisivel(...a) { return N.primeiraVisivel(...a); }
  /** @param {...any} a */ function registrar(...a) { return N.registrar(...a); }
  /** @param {...any} a */ function relatoriosDaTela(...a) { return N.relatoriosDaTela(...a); }
  /** @param {...any} a */ function resolver(...a) { return N.resolver(...a); }
  /** @param {...any} a */ function resolverEGuardar(...a) { return N.resolverEGuardar(...a); }
  /** @param {...any} a */ function resolverFuncao(...a) { return N.resolverFuncao(...a); }
  /** @param {...any} a */ function siteAtual(...a) { return N.siteAtual(...a); }
  /** @param {...any} a */ function telasDe(...a) { return N.telasDe(...a); }
  /** @param {...any} a */ function traduzirAba(...a) { return N.traduzirAba(...a); }
  /** @param {...any} a */ function traduzirAcao(...a) { return N.traduzirAcao(...a); }
  /** @param {...any} a */ function urlBaseQr(...a) { return N.urlBaseQr(...a); }
  /** @param {...any} a */ function urlCanonica(...a) { return N.urlCanonica(...a); }
  /** @param {...any} a */ function usuarioDeSessao(...a) { return N.usuarioDeSessao(...a); }

  // Serviços do núcleo, para ctx.servico('nucleo.locais' | 'nucleo.ativos').
  implementacoes.set('nucleo', Object.freeze({
    iniciar: null, parar: null, telas: {}, relatorios: {}, qr: {}, funcoes: {},
    servicos: Object.freeze({
      'nucleo.locais': () => (Array.isArray(root.cacheLocais) ? root.cacheLocais.slice() : []),
      'nucleo.ativos': () => (Array.isArray(root.cacheAtivos) ? root.cacheAtivos.slice() : [])
    })
  }));

  registrar({
    id: 'nucleo',
    nome: 'Núcleo',
    versao: VERSAO_NUCLEO,
    categoria: 'plataforma',
    estagio: 'estavel',
    obrigatorio: true,
    embutido: true,
    depende: {},
    scripts: [],
    permissoes: {
      'relatorios.exportar': 'Exportar e imprimir os relatórios da tela atual'
    },
    // Contrato v2: o que é da plataforma (empresa, acesso, locais e ativos).
    tabelas: [
      'empresas', 'modulos', 'empresa_modulos', 'empresa_modulos_historico',
      'permissoes', 'cargos', 'cargo_permissoes', 'plataforma_usuarios',
      'migracoes_aplicadas', 'configuracoes_plataforma', 'configuracoes_sistema',
      'perfis_usuarios', 'locais', 'locais_niveis', 'obras', 'obras_base',
      'tipos_ativo', 'equipamentos', 'equipamentos_historico', 'ativos'
    ],
    rpcs: ['resolver_login', 'meu_perfil', 'qr_equipamento', 'rls_auto_enable'],
    fornece: {
      'nucleo.locais': 'Locais da empresa e o local ativo',
      'nucleo.ativos': 'Ativos (equipamentos) da empresa'
    },
    eventos: { emite: ['nucleo.contexto_mudou'] },
    offline: {
      tabelas: ['equipamentos', 'obras'],
      cache: ['obras_ativas', 'obras', 'equipamentos']
    },
    cargos_padrao: {
      almoxarife: ['relatorios.exportar'],
      pcm: ['relatorios.exportar'],
      gestor: ['relatorios.exportar'],
      engenheiro: ['relatorios.exportar'],
      admin: ['relatorios.exportar']
    },
    acoes_legadas: {
      exportar_relatorios: 'relatorios.exportar'
    },
    telas: [],
    extensoes: {}
  });

  /** @type {import('./tipos.js').ApiNucleo} */
  const api = {
    modulos: {
      registrar,
      lista,
      resolver,
      resolverEGuardar,
      carregar,
      garantirCarregados,
      descarregar,
      definir: definirModulo,
      implementacao: (/** @type {string} */ id) => implementacoes.get(id) || null,
      carregados: () => (N.estado.resultadoCarga ? N.estado.resultadoCarga.carregados.slice() : []),
      ultimaResolucao: () => N.estado.resolucaoGuardada,
      ultimaCarga: () => N.estado.resultadoCarga
    },
    permissoes: {
      pode,
      traduzirAcao,
      traduzirAba,
      podeAcaoLegada,
      podeVerTela,
      efetivas,
      matrizTraduzida
    },
    sessao: {
      CHAVE: CHAVE_SESSAO,
      CHAVE_ANTERIOR: CHAVE_SESSAO_ANTERIOR,
      CHAVE_EMPRESA,
      get CODIGO_EMPRESA_PADRAO() { return codigoEmpresaPadrao(); },
      codigoEmpresa,
      lerEmpresaLembrada,
      lembrarEmpresa,
      estadoLoginEmpresa,
      embrulhar: embrulharSessao,
      gravar: gravarSessao,
      ler: lerSessao,
      usuarioDe: usuarioDeSessao,
      contratoDe
    },
    eventos: { emitir, ouvir },
    extensoes: { relatoriosDaTela, montarBarra, qr: acoesQr },
    telas: { ordenadas: () => telasDe(), montarMenu, garantirSecoes, primeiraVisivel, abrir: abrirTela },
    resolverFuncao,
    definirModulo,
    qr: { get URL_BASE() { return urlBaseQr(); }, urlCanonica, lerUrl: lerUrlQr },
    marca: { nome: nomeDaMarca, prefixoArquivo, site: siteAtual, aplicar: aplicarMarca },
    termo
  };

  root.Plataforma = api;
  // Apelido antigo. Some quando nenhum script chamar mais por Vilasa.
  root.Vilasa = api;
  // As partes já se ligaram entre si: o objeto interno sai do window.
  delete root.__PlataformaInterno;
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));
