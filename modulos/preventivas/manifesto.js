// @ts-check
// Manifesto declarativo. A tela continua em pcm_sap.js, na raiz.
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
    id: 'preventivas',
    nome: 'Preventivas (SAP PM)',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { os: '^1.0.0', frota: '^1.0.0' },
    opcionais: { estoque: '^1.0.0' },
    scripts: [{ src: 'pcm_sap.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'preventivas.ver': 'Ver planos e a projeção',
      'preventivas.gerenciar': 'Criar e editar estratégias, listas e planos',
      'preventivas.gerar_os': 'Gerar ordem de serviço a partir do plano'
    },
    cargos_padrao: {
      mecanico: ['preventivas.ver'],
      pcm: ['preventivas.ver', 'preventivas.gerenciar', 'preventivas.gerar_os'],
      gestor: ['preventivas.ver'],
      engenheiro: ['preventivas.ver', 'preventivas.gerenciar', 'preventivas.gerar_os'],
      admin: ['preventivas.ver', 'preventivas.gerenciar', 'preventivas.gerar_os']
    },
    acoes_legadas: { gerenciar_preventivas: 'preventivas.gerenciar' },
    abas_legadas: { preventivas: 'preventivas.ver' },
    telas: [{
      id: 'preventivas',
      rotulo: 'Preventivas (SAP)',
      icone: 'fa-calendar-check',
      ordem: 30,
      permissao: 'preventivas.ver',
      abrir: 'carregarPreventivas',
      titulo_relatorio: 'Planos Preventivos SAP PM & Histórico'
    }],
    extensoes: {
      relatorios: [
        relatorio('preventivas_csv', 'preventivas', 'csv', 'csv', 'exportarHistoricoProprioPreventivasCSV'),
        relatorio('preventivas_completo', 'preventivas', 'pdf', 'impressao', 'coletarRelatorioGenericoDaTela', 'completo'),
        relatorio('preventivas_enxuto', 'preventivas', 'pdf', 'enxuto', 'coletarRelatorioGenericoDaTela', 'enxuto'),
        relatorio('preventivas_png', 'preventivas', 'png', 'png', 'coletarRelatorioGenericoDaTela', 'enxuto')
      ],
      qr: []
    }
  };

  Plataforma.modulos.registrar(manifesto);
})();
