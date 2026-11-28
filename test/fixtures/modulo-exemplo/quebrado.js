// Módulo de exemplo que falha ao iniciar: só ele deve ficar bloqueado.
Plataforma.definirModulo('quebrado', {
  iniciar() { throw new Error('defeito no iniciar'); },
  telas: { abrirQuebrado() {} }
});
