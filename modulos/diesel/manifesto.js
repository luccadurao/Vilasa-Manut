// @ts-check
// Manifesto declarativo. A tela continua em diesel.js, na raiz.
// Não declara importador: a carga por arquivo sai do site (etapa 0a).
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
    id: 'diesel',
    nome: 'Diesel',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { frota: '^1.0.0' },
    opcionais: {},
    scripts: [{ src: 'diesel.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'diesel.ver': 'Ver estoque, consumo e abastecimentos',
      'diesel.gerenciar': 'Lançar, aceitar e conciliar diesel'
    },
    cargos_padrao: {
      pcm: ['diesel.ver', 'diesel.gerenciar'],
      gestor: ['diesel.ver'],
      engenheiro: ['diesel.ver', 'diesel.gerenciar'],
      admin: ['diesel.ver', 'diesel.gerenciar']
    },
    acoes_legadas: { gerenciar_diesel: 'diesel.gerenciar' },
    abas_legadas: { diesel: 'diesel.ver' },
    telas: [{
      id: 'diesel',
      rotulo: 'Diesel',
      icone: 'fa-gas-pump',
      ordem: 50,
      permissao: 'diesel.ver',
      abrir: 'carregarDiesel',
      titulo_relatorio: 'Controle de Diesel'
    }],
    extensoes: {
      relatorios: [
        relatorio('diesel_csv', 'diesel', 'csv', 'csv', 'exportarRelatorioDieselCSV'),
        relatorio('diesel_completo', 'diesel', 'pdf', 'impressao', 'coletarRelatorioGenericoDaTela', 'completo'),
        relatorio('diesel_enxuto', 'diesel', 'pdf', 'enxuto', 'coletarRelatorioGenericoDaTela', 'enxuto'),
        relatorio('diesel_png', 'diesel', 'png', 'png', 'coletarRelatorioGenericoDaTela', 'enxuto')
      ],
      qr: []
    }
  };

  Vilasa.modulos.registrar(manifesto);
})();
