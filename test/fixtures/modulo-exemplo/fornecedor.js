// Módulo de exemplo: fornece um serviço e emite um evento.
Plataforma.definirModulo('fornecedor', {
  iniciar(ctx) { globalThis.__fornecedor = { ctx }; },
  telas: { abrirFornecedor() { return 'fornecedor aberto'; } },
  relatorios: { exportarFornecedor() { return 'csv'; } },
  servicos: { 'fornecedor.dados': () => ['a', 'b'] }
});
