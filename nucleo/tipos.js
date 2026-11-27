// @ts-check
// Tipos do contrato entre o núcleo e os módulos. Só o tsc lê este arquivo.
// O site não carrega este script.

/**
 * @typedef {'beta' | 'estavel' | 'descontinuado'} EstagioModulo
 * @typedef {'manutencao' | 'producao' | 'suprimentos' | 'pessoas' | 'plataforma'} CategoriaModulo
 * @typedef {'classico' | 'esm'} TipoScriptModulo
 * @typedef {'csv' | 'pdf' | 'png'} FormatoRelatorio
 * @typedef {'csv' | 'impressao' | 'enxuto' | 'png'} EstiloRelatorio
 * @typedef {'completo' | 'enxuto'} ColetaRelatorio
 */

/**
 * @typedef {Object} ScriptModulo
 * @property {string} src
 * @property {TipoScriptModulo} tipo
 */

/**
 * @typedef {Object} TelaModulo
 * @property {string} id
 * @property {string} rotulo
 * @property {string} icone
 * @property {number} ordem
 * @property {string} permissao
 * @property {string} abrir
 * @property {string[]} [abrirArgs]
 * @property {string} titulo_relatorio
 */

/**
 * @typedef {Object} RelatorioModulo
 * @property {string} id
 * @property {string} tela
 * @property {string} rotulo
 * @property {string} [titulo]
 * @property {FormatoRelatorio} formato
 * @property {EstiloRelatorio} estilo
 * @property {ColetaRelatorio} [coleta]
 * @property {string} permissao
 * @property {string} funcao
 */

/**
 * @typedef {Object} AcaoQrModulo
 * @property {string} id
 * @property {string} rotulo
 * @property {boolean} exige_login
 * @property {string} [permissao]
 * @property {string} funcao
 */

/**
 * @typedef {Object} ExtensoesModulo
 * @property {RelatorioModulo[]} [relatorios]
 * @property {AcaoQrModulo[]} [qr]
 * @property {Record<string, string>} [ouve]
 * @property {string[]} [emite]
 */

/**
 * @typedef {Object} Manifesto
 * @property {string} id
 * @property {string} nome
 * @property {string} versao
 * @property {CategoriaModulo} categoria
 * @property {EstagioModulo} estagio
 * @property {boolean} obrigatorio
 * @property {boolean} [embutido]
 * @property {Record<string, string>} [depende]
 * @property {Record<string, string>} [opcionais]
 * @property {ScriptModulo[]} scripts
 * @property {string[]} [vendor]
 * @property {Record<string, string>} permissoes
 * @property {Record<string, string[]>} [cargos_padrao]
 * @property {Record<string, string>} [acoes_legadas]
 * @property {Record<string, string>} [abas_legadas]
 * @property {TelaModulo[]} [telas]
 * @property {ExtensoesModulo} [extensoes]
 */

/**
 * @typedef {Object} ContratoModulos
 * @property {string[]} [ativos]
 * @property {boolean} [todos]
 * @property {string[] | null} [permissoes]
 */

/**
 * @typedef {Object} BloqueioModulo
 * @property {string} id
 * @property {string} motivo
 */

/**
 * @typedef {Object} ResultadoResolucao
 * @property {string[]} ordem
 * @property {string[]} ativos
 * @property {BloqueioModulo[]} bloqueados
 * @property {string[]} avisos
 */

/**
 * @typedef {Object} ResultadoCarga
 * @property {string[]} carregados
 * @property {BloqueioModulo[]} bloqueados
 * @property {string[]} avisos
 * @property {string[]} arquivos
 */

/**
 * @typedef {Object} ApiModulos
 * @property {(manifesto: Manifesto) => void} registrar
 * @property {() => Manifesto[]} lista
 * @property {(contrato: ContratoModulos | string[], manifestos: Manifesto[]) => ResultadoResolucao} resolver
 * @property {(contrato: ContratoModulos | string[]) => ResultadoResolucao} resolverEGuardar
 * @property {(resolucao: ResultadoResolucao, manifestos: Manifesto[], io: { carregarScript: (src: string, tipo: TipoScriptModulo) => Promise<void> }) => Promise<ResultadoCarga>} carregar
 * @property {() => Promise<ResultadoCarga>} garantirCarregados
 * @property {() => ResultadoResolucao | null} ultimaResolucao
 * @property {() => ResultadoCarga | null} ultimaCarga
 */

/**
 * @typedef {Object} ApiPermissoes
 * @property {(permissao: string, usuario?: any, manifestos?: Manifesto[]) => boolean} pode
 * @property {(acao: string, manifestos?: Manifesto[]) => string | null} traduzirAcao
 * @property {(abaId: string, manifestos?: Manifesto[]) => string | null} traduzirAba
 * @property {(acao: string, usuario?: any) => boolean} podeAcaoLegada
 * @property {(abaId: string, usuario?: any) => boolean} podeVerTela
 * @property {(cargos: string[], manifestos?: Manifesto[]) => string[]} efetivas
 * @property {(manifestos?: Manifesto[]) => Record<string, { abas: string[], acoes: string[], permissoes: string[] }>} matrizTraduzida
 */

/**
 * @typedef {Object} ApiEventos
 * @property {(nome: string, dados?: any) => void} emitir
 * @property {(nome: string, fn: (dados?: any) => void) => () => void} ouvir
 */

/**
 * @typedef {Object} RelatorioResolvido
 * @property {string} id
 * @property {string} tela
 * @property {string} rotulo
 * @property {string} [titulo]
 * @property {FormatoRelatorio} formato
 * @property {EstiloRelatorio} estilo
 * @property {ColetaRelatorio} [coleta]
 * @property {string} permissao
 * @property {string} funcao
 * @property {string} moduloId
 */

/**
 * @typedef {Object} ApiExtensoes
 * @property {(telaId: string) => RelatorioResolvido[]} relatoriosDaTela
 * @property {(container: HTMLElement, telaId: string, aoClicar: (rel: RelatorioResolvido) => void) => void} montarBarra
 * @property {() => { moduloId: string, id: string, rotulo: string, exige_login: boolean, permissao: string | null, funcao: string }[]} qr
 */

/**
 * @typedef {Object} TelaResolvida
 * @property {string} id
 * @property {string} rotulo
 * @property {string} icone
 * @property {number} ordem
 * @property {string} permissao
 * @property {string} abrir
 * @property {string[]} [abrirArgs]
 * @property {string} titulo_relatorio
 * @property {string} moduloId
 */

/**
 * @typedef {Object} ApiTelas
 * @property {() => TelaResolvida[]} ordenadas
 * @property {(container: HTMLElement) => void} montarMenu
 * @property {(container: HTMLElement) => void} garantirSecoes
 * @property {() => string | null} primeiraVisivel
 */

/**
 * @typedef {Object} ApiNucleo
 * @property {ApiModulos} modulos
 * @property {ApiPermissoes} permissoes
 * @property {ApiEventos} eventos
 * @property {ApiExtensoes} extensoes
 * @property {ApiTelas} telas
 * @property {(nome: string, moduloId?: string) => Function | null} resolverFuncao
 * @property {{ URL_BASE: string, urlCanonica: (id: string) => string }} qr
 */

export {};
