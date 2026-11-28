// Módulo de exemplo no contrato v2: tudo pelo ctx, nada solto no window.
Plataforma.definirModulo('exemplo', {
  iniciar(ctx) {
    globalThis.__exemplo = { ctx, recebido: [], parou: false };
    ctx.eventos.ouvir('fornecedor.pronto', (dados) => globalThis.__exemplo.recebido.push(dados));
  },
  parar() { globalThis.__exemplo.parou = true; },
  telas: {
    abrirExemplo() { return 'aberta'; },
    async abrirQuebrada() { throw new Error('tela com defeito'); }
  },
  qr: { qrExemplo() { return 'qr'; } },
  funcoes: { aoFornecedorPronto() {} }
});
