// @ts-check
// Manifesto declarativo. A tela continua em frota.js, na raiz.
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
    id: 'frota',
    nome: 'Frota & QR',
    versao: '1.0.0',
    categoria: 'manutencao',
    estagio: 'estavel',
    obrigatorio: false,
    depende: { nucleo: '^1.0.0' },
    opcionais: { os: '^1.0.0' },
    scripts: [{ src: 'frota.js', tipo: 'classico' }],
    vendor: [],
    permissoes: {
      'frota.ver': 'Ver a frota, o ciclo de vida e as etiquetas QR',
      'frota.gerenciar': 'Cadastrar, editar, transferir e corrigir leitura',
      'frota.lancar_leitura': 'Lançar horímetro ou quilometragem pelo QR'
    },
    cargos_padrao: {
      mecanico: ['frota.lancar_leitura'],
      almoxarife: ['frota.ver'],
      pcm: ['frota.ver', 'frota.gerenciar'],
      gestor: ['frota.ver'],
      engenheiro: ['frota.ver', 'frota.gerenciar', 'frota.lancar_leitura'],
      admin: ['frota.ver', 'frota.gerenciar', 'frota.lancar_leitura']
    },
    acoes_legadas: {
      gerenciar_frota: 'frota.gerenciar',
      lancar_horimetro_qr: 'frota.lancar_leitura'
    },
    abas_legadas: { frota: 'frota.ver' },
    // Contrato v2: o que o módulo é dono, oferece e usa.
    tabelas: ['diario_horimetro'],
    rpcs: ['lancar_horimetro', 'corrigir_leitura', 'importar_leituras', 'recalcular_horimetro_atual'],
    config: {
      limite_salto_horas: { tipo: 'numero', padrao: 300, min: 0, descricao: 'Maior salto de horímetro aceito numa leitura (h)' },
      limite_salto_km: { tipo: 'numero', padrao: 5000, min: 0, descricao: 'Maior salto de hodômetro aceito numa leitura (km)' },
      limite_km_dia: { tipo: 'numero', padrao: 100, min: 0, descricao: 'Quilômetros por dia aceitos sem alerta' },
      tolerancia_horas: { tipo: 'numero', padrao: 0.5, min: 0, descricao: 'Tolerância de horas entre leituras' },
      delta_maximo_horimetro: { tipo: 'numero', padrao: 24, min: 0, descricao: 'Horas por dia aceitas sem alerta' }
    },
    offline: {
      tabelas: ['diario_horimetro'],
      rpcs: ['lancar_horimetro']
    },
    telas: [{
      id: 'frota',
      rotulo: 'Frota & QR Codes',
      icone: 'fa-truck-monster',
      ordem: 20,
      permissao: 'frota.ver',
      abrir: 'carregarFrota',
      titulo_relatorio: 'Controle de Frota & Mobilização'
    }],
    extensoes: {
      relatorios: [
        relatorio('frota_csv', 'frota', 'csv', 'csv', 'exportarRelatorioFrotaCSV'),
        relatorio('frota_completo', 'frota', 'pdf', 'impressao', 'coletarRelatorioFrota', 'completo'),
        relatorio('frota_enxuto', 'frota', 'pdf', 'enxuto', 'coletarRelatorioFrota', 'enxuto'),
        relatorio('frota_png', 'frota', 'png', 'png', 'coletarRelatorioFrota', 'enxuto')
      ],
      qr: [{
        id: 'lancar_leitura',
        rotulo: 'Lançar leitura',
        exige_login: false,
        funcao: 'enviarApenasHorimetroViaQRCode'
      }]
    }
  };

  Plataforma.modulos.registrar(manifesto);
})();
