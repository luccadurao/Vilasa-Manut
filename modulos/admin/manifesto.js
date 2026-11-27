// @ts-check
// Manifesto declarativo. A tela continua em admin.js, na raiz.
// Não declara importador de planilhas: essa entrada sai do site (etapa 0a).
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
    id: 'admin',
    nome: 'Administração',
    versao: '1.0.0',
    categoria: 'plataforma',
    estagio: 'estavel',
    obrigatorio: true,
    depende: { nucleo: '^1.0.0' },
    opcionais: {},
    scripts: [{ src: 'admin.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'admin.ver': 'Ver a administração',
      'admin.usuarios': 'Gerir usuários e obras',
      'admin.modo_deus': 'Editar tabelas no Controle Mestre'
    },
    cargos_padrao: {
      admin: ['admin.ver', 'admin.usuarios', 'admin.modo_deus']
    },
    acoes_legadas: { acesso_modo_deus: 'admin.modo_deus' },
    abas_legadas: { admin: 'admin.ver' },
    telas: [{
      id: 'admin',
      rotulo: 'Administração',
      icone: 'fa-user-shield',
      ordem: 70,
      permissao: 'admin.ver',
      abrir: 'carregarUsuariosAdmin',
      titulo_relatorio: 'Governança & Administração'
    }],
    extensoes: {
      relatorios: [
        relatorio('admin_csv', 'admin', 'csv', 'csv', 'exportarTabelaVisivelCSV'),
        relatorio('admin_completo', 'admin', 'pdf', 'impressao', 'coletarRelatorioGenericoDaTela', 'completo'),
        relatorio('admin_enxuto', 'admin', 'pdf', 'enxuto', 'coletarRelatorioGenericoDaTela', 'enxuto'),
        relatorio('admin_png', 'admin', 'png', 'png', 'coletarRelatorioGenericoDaTela', 'enxuto')
      ],
      qr: []
    }
  };

  Plataforma.modulos.registrar(manifesto);
})();
