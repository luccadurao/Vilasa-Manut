// @ts-check
// Manifesto declarativo. A tela continua em estoque.js, na raiz.
(function () {
  'use strict';
  /**
   * @param {string} id
   * @param {string} tela
   * @param {'csv' | 'pdf' | 'png'} formato
   * @param {'csv' | 'impressao' | 'enxuto' | 'png'} estilo
   * @param {string} funcao
   * @param {'completo' | 'enxuto'} [coleta]
   * @returns {import('../../nucleo/tipos.js').RelatorioModulo}
   */
  function relatorio(id, tela, formato, estilo, funcao, coleta) {
    /** @type {Record<'csv' | 'impressao' | 'enxuto' | 'png', [string, string]>} */
    const rotulos = {
      csv: ['Planilha Completa (CSV)', 'Exportar planilha completa com todas as informações'],
      impressao: ['Imprimir Tudo (Completo)', 'Imprimir relatório completo com todos os itens e colunas'],
      enxuto: ['Imprimir 1 Pág. (Parados/REP)', 'Imprimir resumo enxuto de 1 página (Na aba OS: apenas máquinas abertas/paradas)'],
      png: ['Exportar 1 Pág. (PNG)', 'Baixar imagem PNG de 1 página (até 25 máquinas paradas)']
    };
    const par = rotulos[estilo];
    /** @type {import('../../nucleo/tipos.js').RelatorioModulo} */
    const item = {
      id, tela, rotulo: par[0], titulo: par[1], formato, estilo,
      permissao: 'relatorios.exportar', funcao
    };
    if (coleta) item.coleta = coleta;
    return item;
  }

  /** @type {import('../../nucleo/tipos.js').Manifesto} */
  const manifesto = {
    id: 'estoque',
    nome: 'Almoxarifado',
    versao: '1.0.0',
    categoria: 'suprimentos',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { nucleo: '^1.0.0' },
    opcionais: { os: '^1.0.0' },
    scripts: [{ src: 'estoque.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'estoque.ver': 'Ver o almoxarifado',
      'estoque.catalogo': 'Cadastrar e editar o catálogo',
      'estoque.entrada': 'Lançar nota fiscal de entrada',
      'estoque.baixar': 'Dar baixa de peças'
    },
    cargos_padrao: {
      mecanico: ['estoque.ver'],
      almoxarife: ['estoque.ver', 'estoque.catalogo', 'estoque.entrada', 'estoque.baixar'],
      pcm: ['estoque.ver'],
      gestor: ['estoque.ver'],
      engenheiro: ['estoque.ver', 'estoque.catalogo', 'estoque.entrada', 'estoque.baixar'],
      admin: ['estoque.ver', 'estoque.catalogo', 'estoque.entrada', 'estoque.baixar']
    },
    acoes_legadas: {
      gerenciar_catalogo_estoque: 'estoque.catalogo',
      lancar_nf_entrada: 'estoque.entrada',
      dar_baixa_estoque: 'estoque.baixar'
    },
    abas_legadas: { estoque: 'estoque.ver' },
    // Contrato v2: o que o módulo é dono, oferece e usa.
    tabelas: ['pecas_estoque', 'movimentacoes_almoxarifado', 'lotes_estoque', 'servicos_almoxarifado',
      'notas_fora_do_custo', 'itens_os_estoque'],
    rpcs: ['almox_movimentar'],
    fornece: {
      'estoque.pecas': 'Catálogo de peças e saldo',
      'estoque.movimentos': 'Entradas e baixas do almoxarifado'
    },
    consome: ['os.ordens'],
    offline: {
      tabelas: ['pecas_estoque', 'movimentacoes_almoxarifado'],
      rpcs: ['almox_movimentar'],
      cache: ['pecas_estoque', 'movimentacoes_almoxarifado']
    },
    telas: [{
      id: 'estoque',
      rotulo: 'Almoxarifado',
      icone: 'fa-boxes-stacked',
      ordem: 40,
      permissao: 'estoque.ver',
      abrir: 'carregarEstoque',
      titulo_relatorio: 'Almoxarifado Central & Notas Fiscais'
    }],
    extensoes: {
      relatorios: [
        relatorio('estoque_csv', 'estoque', 'csv', 'csv', 'exportarInventarioAlmoxCSV'),
        relatorio('estoque_completo', 'estoque', 'pdf', 'impressao', 'coletarRelatorioEstoque', 'completo'),
        relatorio('estoque_enxuto', 'estoque', 'pdf', 'enxuto', 'coletarRelatorioEstoque', 'enxuto'),
        relatorio('estoque_png', 'estoque', 'png', 'png', 'coletarRelatorioEstoque', 'enxuto')
      ],
      qr: []
    }
  };

  Plataforma.modulos.registrar(manifesto);
})();
