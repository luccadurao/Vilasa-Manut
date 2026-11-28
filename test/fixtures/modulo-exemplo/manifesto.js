// Manifestos de exemplo para os testes do contrato em runtime
// (test/contrato-modulo.test.js). Não fazem parte do produto.
(function () {
  'use strict';
  const base = 'test/fixtures/modulo-exemplo/';

  Plataforma.modulos.registrar({
    id: 'fornecedor', nome: 'Fornecedor', versao: '1.0.0', categoria: 'manutencao', estagio: 'beta',
    obrigatorio: false, depende: { nucleo: '^1.0.0' },
    scripts: [{ src: base + 'fornecedor.js', tipo: 'classico' }],
    permissoes: { 'fornecedor.ver': 'Ver' },
    tabelas: ['fornecedor_itens'],
    fornece: { 'fornecedor.dados': 'Dados do fornecedor' },
    eventos: { emite: ['fornecedor.pronto'] },
    telas: [{ id: 'fornecedor', rotulo: 'Fornecedor', icone: 'fa-box', ordem: 90, permissao: 'fornecedor.ver', abrir: 'abrirFornecedor', titulo_relatorio: 'F' }],
    extensoes: {
      relatorios: [{ id: 'fornecedor_csv', tela: 'fornecedor', rotulo: 'CSV', formato: 'csv', estilo: 'csv', permissao: 'fornecedor.ver', funcao: 'exportarFornecedor' }]
    }
  });

  Plataforma.modulos.registrar({
    id: 'exemplo', nome: 'Exemplo', versao: '0.1.0', categoria: 'manutencao', estagio: 'beta',
    obrigatorio: false, depende: { nucleo: '^1.0.0', fornecedor: '^1.0.0' }, opcionais: { ausente: '^1.0.0' },
    scripts: [{ src: base + 'exemplo.js', tipo: 'classico' }],
    permissoes: { 'exemplo.ver': 'Ver' },
    tabelas: ['exemplo_registros'],
    rpcs: ['exemplo_fechar'],
    consome: ['fornecedor.dados', 'ausente.coisa', 'nucleo.locais'],
    eventos: { emite: ['exemplo.feito'], ouve: { 'fornecedor.pronto': 'aoFornecedorPronto' } },
    config: {
      limite: { tipo: 'numero', padrao: 10, min: 0, max: 100 },
      rotulo: { tipo: 'texto', padrao: 'Padrão' }
    },
    offline: { tabelas: ['exemplo_registros'], rpcs: ['exemplo_fechar'], cache: ['exemplo_lista'] },
    telas: [
      { id: 'exemplo', rotulo: 'Exemplo', icone: 'fa-star', ordem: 91, permissao: 'exemplo.ver', abrir: 'abrirExemplo', titulo_relatorio: 'E' },
      { id: 'exemplo_quebrada', rotulo: 'Quebrada', icone: 'fa-bug', ordem: 92, permissao: 'exemplo.ver', abrir: 'abrirQuebrada', titulo_relatorio: 'Q' }
    ],
    extensoes: { qr: [{ id: 'exemplo_qr', rotulo: 'QR', exige_login: false, funcao: 'qrExemplo' }] }
  });

  Plataforma.modulos.registrar({
    id: 'quebrado', nome: 'Quebrado', versao: '0.1.0', categoria: 'manutencao', estagio: 'beta',
    obrigatorio: false, depende: { nucleo: '^1.0.0' },
    scripts: [{ src: base + 'quebrado.js', tipo: 'classico' }],
    permissoes: { 'quebrado.ver': 'Ver' },
    tabelas: [],
    telas: [{ id: 'quebrado', rotulo: 'Quebrado', icone: 'fa-bomb', ordem: 93, permissao: 'quebrado.ver', abrir: 'abrirQuebrado', titulo_relatorio: 'X' }],
    extensoes: { qr: [{ id: 'quebrado_qr', rotulo: 'QR', exige_login: false, funcao: 'qrQuebrado' }] }
  });
})();
