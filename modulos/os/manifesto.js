// @ts-check
// Manifesto declarativo. A tela continua em os_rep.js, na raiz.
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
      id,
      tela,
      rotulo: par[0],
      titulo: par[1],
      formato,
      estilo,
      permissao: 'relatorios.exportar',
      funcao
    };
    if (coleta) item.coleta = coleta;
    return item;
  }

  /** @type {import('../../nucleo/tipos.js').Manifesto} */
  const manifesto = {
    id: 'os',
    nome: 'Ordens & REP',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { nucleo: '^1.0.0' },
    opcionais: { estoque: '^1.0.0' },
    scripts: [{ src: 'os_rep.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'os.ver': 'Ver ordens de serviço e o quadro REP',
      'os.abrir': 'Abrir ordem de serviço',
      'os.executar': 'Executar, assumir e concluir ordem de serviço',
      'os.classificar_rep': 'Classificar a falha e fazer a triagem do PCM'
    },
    cargos_padrao: {
      mecanico: ['os.ver', 'os.abrir', 'os.executar'],
      almoxarife: ['os.ver'],
      encarregado: ['os.ver', 'os.abrir'],
      pcm: ['os.ver', 'os.abrir', 'os.executar', 'os.classificar_rep'],
      gestor: ['os.ver'],
      engenheiro: ['os.ver', 'os.abrir', 'os.executar', 'os.classificar_rep'],
      admin: ['os.ver', 'os.abrir', 'os.executar', 'os.classificar_rep']
    },
    acoes_legadas: {
      abrir_os: 'os.abrir',
      executar_os: 'os.executar',
      classificar_rep_pcm: 'os.classificar_rep'
    },
    abas_legadas: { os: 'os.ver' },
    telas: [{
      id: 'os',
      rotulo: 'Ordens & REP',
      icone: 'fa-wrench',
      ordem: 10,
      permissao: 'os.ver',
      abrir: 'carregarOrdensServico',
      abrirArgs: ['ativas'],
      titulo_relatorio: 'Ordens de Serviço & Quadro REP'
    }],
    extensoes: {
      relatorios: [
        relatorio('os_csv', 'os', 'csv', 'csv', 'exportarOrdensServicoCSV'),
        relatorio('os_completo', 'os', 'pdf', 'impressao', 'coletarRelatorioOrdensServico', 'completo'),
        relatorio('os_enxuto', 'os', 'pdf', 'enxuto', 'coletarRelatorioOrdensServico', 'enxuto'),
        relatorio('os_png', 'os', 'png', 'png', 'coletarRelatorioOrdensServico', 'enxuto')
      ],
      qr: [{
        id: 'abrir_os',
        rotulo: 'Abrir OS',
        exige_login: true,
        permissao: 'os.abrir',
        funcao: 'enviarOSViaQRCode'
      }],
      emite: ['os.concluida']
    }
  };

  Vilasa.modulos.registrar(manifesto);
})();
