// @ts-check
// Manifesto declarativo. A tela continua em kpis.js, na raiz.
// O id do módulo é painel; o id da tela segue kpis, que é o da seção atual.
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
    id: 'painel',
    nome: 'Indicadores',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { nucleo: '^1.0.0', os: '^1.0.0' },
    opcionais: { frota: '^1.0.0', preventivas: '^1.0.0', estoque: '^1.0.0' },
    scripts: [{ src: 'kpis.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'painel.ver': 'Ver os indicadores'
    },
    cargos_padrao: {
      pcm: ['painel.ver'],
      gestor: ['painel.ver'],
      engenheiro: ['painel.ver'],
      admin: ['painel.ver']
    },
    acoes_legadas: {},
    abas_legadas: { kpis: 'painel.ver' },
    // Contrato v2: o painel não é dono de tabela; só lê pelos serviços dos outros.
    tabelas: [],
    consome: ['os.ordens', 'estoque.pecas', 'estoque.movimentos', 'preventivas.planos', 'frota.leituras'],
    offline: {
      cache: ['kpi_os', 'kpi_movs', 'kpi_leituras']
    },
    telas: [{
      id: 'kpis',
      rotulo: 'Indicadores (KPIs)',
      icone: 'fa-chart-line',
      ordem: 60,
      permissao: 'painel.ver',
      abrir: 'calcularKPIs',
      titulo_relatorio: 'Indicadores Executivos de Engenharia (KPIs)'
    }],
    extensoes: {
      relatorios: [
        relatorio('painel_csv', 'kpis', 'csv', 'csv', 'exportarRelatorioKPIsCSV'),
        relatorio('painel_completo', 'kpis', 'pdf', 'impressao', 'coletarRelatorioGenericoDaTela', 'completo'),
        relatorio('painel_enxuto', 'kpis', 'pdf', 'enxuto', 'coletarRelatorioGenericoDaTela', 'enxuto'),
        relatorio('painel_png', 'kpis', 'png', 'png', 'coletarRelatorioGenericoDaTela', 'enxuto')
      ],
      qr: []
    }
  };

  Plataforma.modulos.registrar(manifesto);
})();
