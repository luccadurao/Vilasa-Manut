// @ts-check
// ============================================================================
// NÚCLEO — SESSÃO: perfil guardado no aparelho, contrato e código de empresa no login
// Parte do núcleo (ver nucleo/nucleo.js, que monta a API pública).
// As partes conversam pelo objeto interno N; função de outra parte é chamada
// por um repasse de uma linha, resolvido na hora da chamada.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** @type {any} */
  const N = root.__PlataformaInterno;
  if (!N) throw new Error('Carregue nucleo/base.js antes das outras partes do núcleo.');

  /** @param {...any} a */ function ambienteAtual(...a) { return N.ambienteAtual(...a); }

  /**
   * Chave do localStorage com o prefixo do produto (nucleo/produto.js).
   * @param {string} nome
   */
  function chaveLocal(nome) {
    const produto = root.PlataformaProduto;
    return produto && typeof produto.chave === 'function' ? produto.chave(nome) : 'plat_' + nome;
  }

  const CHAVE_SESSAO = chaveLocal('sessao_v3');
  const CHAVE_SESSAO_ANTERIOR = chaveLocal('sessao_v2');

  /**
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada['perfil'] | null}
   */
  function copiarPerfil(entrada) {
    if (!entrada || entrada.id == null || entrada.id === '') return null;
    return {
      id: String(entrada.id),
      matricula: entrada.matricula,
      nome: entrada.nome,
      cargos_lista: entrada.cargos_lista,
      // locais_permitidos é o nome novo (meu_perfil, 0006); obras_permitidas, o antigo.
      locais_permitidos: entrada.locais_permitidos !== undefined ? entrada.locais_permitidos : entrada.obras_permitidas,
      obras_permitidas: entrada.obras_permitidas !== undefined ? entrada.obras_permitidas : entrada.locais_permitidos,
      ativo: entrada.ativo
    };
  }

  /**
   * @param {any} entrada
   * @returns {Record<string, any>}
   */
  function copiarFlags(entrada) {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return {};
    return entrada;
  }

  /**
   * Aceita o jsonb do meu_perfil (campos no topo) ou uma sessão v3 já embrulhada.
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function embrulharSessao(entrada) {
    if (!entrada || typeof entrada !== 'object') return null;
    const brutoPerfil = entrada.perfil && typeof entrada.perfil === 'object' ? entrada.perfil : entrada;
    const perfil = copiarPerfil(brutoPerfil);
    if (!perfil) return null;
    const origem = entrada.perfil && typeof entrada.perfil === 'object' ? entrada : entrada;
    const empresa = origem.empresa && typeof origem.empresa === 'object' ? origem.empresa : null;
    const empresaIdBruto = empresa && empresa.id != null && empresa.id !== ''
      ? empresa.id
      : origem.empresa_id;
    const versaoMinima = origem.versao_minima_app != null && origem.versao_minima_app !== ''
      ? String(origem.versao_minima_app)
      : null;
    return {
      perfil,
      empresa,
      empresa_id: empresaIdBruto != null && empresaIdBruto !== '' ? String(empresaIdBruto) : null,
      modulos: Array.isArray(origem.modulos) ? origem.modulos : null,
      permissoes: Array.isArray(origem.permissoes) ? origem.permissoes.map((/** @type {unknown} */ id) => String(id)) : null,
      versao_minima_app: versaoMinima,
      flags: copiarFlags(origem.flags),
      gerado_em: typeof origem.gerado_em === 'string' ? origem.gerado_em : new Date().toISOString()
    };
  }

  /**
   * @param {import('./tipos.js').SessaoGuardada | null} sessao
   */
  function usuarioDeSessao(sessao) {
    if (!sessao || !sessao.perfil) return null;
    /** @type {any} */
    const usuario = {
      id: sessao.perfil.id,
      matricula: sessao.perfil.matricula,
      nome: sessao.perfil.nome,
      cargos_lista: sessao.perfil.cargos_lista,
      locais_permitidos: sessao.perfil.locais_permitidos !== undefined ? sessao.perfil.locais_permitidos : sessao.perfil.obras_permitidas,
      obras_permitidas: sessao.perfil.obras_permitidas !== undefined ? sessao.perfil.obras_permitidas : sessao.perfil.locais_permitidos,
      ativo: sessao.perfil.ativo
    };
    if (sessao.empresa) usuario.empresa = sessao.empresa;
    if (sessao.empresa_id) usuario.empresa_id = sessao.empresa_id;
    else if (sessao.empresa && sessao.empresa.id != null && sessao.empresa.id !== '') {
      usuario.empresa_id = String(sessao.empresa.id);
    }
    if (Array.isArray(sessao.modulos)) usuario.modulos = sessao.modulos;
    if (Array.isArray(sessao.permissoes)) usuario.permissoes = sessao.permissoes;
    if (sessao.versao_minima_app) usuario.versao_minima_app = sessao.versao_minima_app;
    return usuario;
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {string} chave
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function lerChaveSessao(storage, chave) {
    const texto = storage.getItem(chave);
    if (!texto) return null;
    try {
      return embrulharSessao(JSON.parse(texto));
    } catch (erro) {
      return null;
    }
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function gravarSessao(storage, entrada) {
    const sessao = embrulharSessao(entrada);
    if (!sessao) return null;
    storage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    storage.removeItem(CHAVE_SESSAO_ANTERIOR);
    return sessao;
  }

  /**
   * Lê a v3. Se só houver a v2, copia para a v3 e apaga a chave antiga.
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function lerSessao(storage) {
    const atual = lerChaveSessao(storage, CHAVE_SESSAO);
    if (atual) {
      storage.removeItem(CHAVE_SESSAO_ANTERIOR);
      return atual;
    }
    const antiga = lerChaveSessao(storage, CHAVE_SESSAO_ANTERIOR);
    if (!antiga) return null;
    storage.setItem(CHAVE_SESSAO, JSON.stringify(antiga));
    storage.removeItem(CHAVE_SESSAO_ANTERIOR);
    return antiga;
  }

  /**
   * Sem módulos nem permissões no perfil, o contrato continua "todos ativos".
   * @param {any} [usuario]
   * @returns {import('./tipos.js').ContratoModulos}
   */
  function contratoDe(usuario) {
    const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
    const temModulos = !!(pessoa && Array.isArray(pessoa.modulos));
    const temPermissoes = !!(pessoa && Array.isArray(pessoa.permissoes));
    if (!temModulos && !temPermissoes) return { todos: true };
    /** @type {import('./tipos.js').ContratoModulos} */
    const contrato = {};
    if (temModulos) {
      contrato.ativos = pessoa.modulos.map((/** @type {any} */ item) => {
        if (typeof item === 'string') return item;
        return item && item.id ? String(item.id) : '';
      }).filter(Boolean);
    } else {
      contrato.todos = true;
    }
    if (temPermissoes) contrato.permissoes = pessoa.permissoes.map((/** @type {unknown} */ id) => String(id));
    return contrato;
  }

  const CHAVE_EMPRESA = chaveLocal('empresa_codigo');
  /**
   * Código de empresa quando o login vem sem código: o do ambiente
   * (config.js). '' deixa o servidor usar a empresa 1 do banco.
   * @returns {string}
   */
  function codigoEmpresaPadrao() {
    const amb = ambienteAtual();
    return amb && typeof amb.empresa_padrao === 'string' ? amb.empresa_padrao.trim().toUpperCase() : '';
  }

  /**
   * Código digitado no login. Vazio vira o código padrão do ambiente.
   * @param {unknown} texto
   * @returns {string}
   */
  function codigoEmpresa(texto) {
    const limpo = String(texto == null ? '' : texto).trim().toUpperCase();
    return limpo || codigoEmpresaPadrao();
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @returns {string | null}
   */
  function lerEmpresaLembrada(storage) {
    const limpo = String(storage.getItem(CHAVE_EMPRESA) || '').trim().toUpperCase();
    return limpo || null;
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {unknown} codigo
   */
  function lembrarEmpresa(storage, codigo) {
    storage.setItem(CHAVE_EMPRESA, codigoEmpresa(codigo));
  }

  /**
   * No primeiro acesso o campo aparece. Depois fica a empresa lembrada,
   * com o campo só se a pessoa pedir para trocar.
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {boolean} [trocando]
   */
  function estadoLoginEmpresa(storage, trocando) {
    const lembrada = lerEmpresaLembrada(storage);
    const mostrarCampo = !lembrada || trocando === true;
    return {
      lembrada,
      mostrarCampo,
      mostrarLembrada: !!lembrada && trocando !== true,
      codigo: lembrada || ''
    };
  }

  Object.assign(N, {
    CHAVE_EMPRESA,
    CHAVE_SESSAO,
    CHAVE_SESSAO_ANTERIOR,
    chaveLocal,
    codigoEmpresa,
    codigoEmpresaPadrao,
    contratoDe,
    copiarFlags,
    copiarPerfil,
    embrulharSessao,
    estadoLoginEmpresa,
    gravarSessao,
    lembrarEmpresa,
    lerChaveSessao,
    lerEmpresaLembrada,
    lerSessao,
    usuarioDeSessao
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));
