'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarPlataforma } = require('./carregar-sandbox');
const { validarContratoV2 } = require('./contrato-v2');

const CATEGORIAS = new Set(['manutencao', 'producao', 'suprimentos', 'pessoas', 'plataforma']);
const ESTAGIOS = new Set(['beta', 'estavel', 'descontinuado']);
const TIPOS_SCRIPT = new Set(['classico', 'esm']);

/**
 * @param {string} faixa
 */
function faixaValida(faixa) {
  const texto = String(faixa || '').trim();
  if (texto === '*') return true;
  const corpo = texto.startsWith('^') || texto.startsWith('~') ? texto.slice(1) : texto;
  return /^\d+\.\d+\.\d+$/.test(corpo);
}

/**
 * @param {any[]} lista
 * @param {{ existe: (rel: string) => boolean, resolver: Function }} opcoes
 * @returns {string[]}
 */
function validarRegistros(lista, opcoes) {
  /** @type {string[]} */
  const erros = [];
  const manifestos = Array.isArray(lista) ? lista : [];
  /** @type {Map<string, any>} */
  const porId = new Map();
  /** @type {Set<string>} */
  const permissoes = new Set();
  /** @type {Set<string>} */
  const telas = new Set();
  /** @type {Set<string>} */
  const relatorios = new Set();
  /** @type {Set<string>} */
  const acoesLegadas = new Set();
  /** @type {Set<string>} */
  const abasLegadas = new Set();

  for (const manifesto of manifestos) {
    if (!manifesto || typeof manifesto.id !== 'string' || !manifesto.id) {
      erros.push('Manifesto sem id.');
      continue;
    }
    if (porId.has(manifesto.id)) erros.push(`Id de módulo repetido: ${manifesto.id}.`);
    porId.set(manifesto.id, manifesto);
  }

  for (const manifesto of porId.values()) {
    const id = manifesto.id;
    const onde = `Módulo ${id}`;
    for (const campo of ['nome', 'versao', 'categoria', 'estagio']) {
      if (typeof manifesto[campo] !== 'string' || !manifesto[campo]) erros.push(`${onde}: campo obrigatório "${campo}".`);
    }
    if (typeof manifesto.obrigatorio !== 'boolean') erros.push(`${onde}: "obrigatorio" precisa ser boolean.`);
    if (typeof manifesto.versao === 'string' && !/^\d+\.\d+\.\d+$/.test(manifesto.versao)) {
      erros.push(`${onde}: versão "${manifesto.versao}" não é semver x.y.z.`);
    }
    if (manifesto.categoria && !CATEGORIAS.has(manifesto.categoria)) erros.push(`${onde}: categoria inválida.`);
    if (manifesto.estagio && !ESTAGIOS.has(manifesto.estagio)) erros.push(`${onde}: estágio inválido.`);
    if (!manifesto.permissoes || typeof manifesto.permissoes !== 'object' || Array.isArray(manifesto.permissoes)) {
      erros.push(`${onde}: "permissoes" precisa ser um objeto.`);
    } else {
      for (const perm of Object.keys(manifesto.permissoes)) {
        if (permissoes.has(perm)) erros.push(`Permissão repetida: ${perm}.`);
        permissoes.add(perm);
        const prefixoNucleo = id === 'nucleo' && (perm.startsWith('nucleo.') || perm.startsWith('relatorios.'));
        if (!prefixoNucleo && !perm.startsWith(`${id}.`)) {
          erros.push(`${onde}: permissão "${perm}" não usa o prefixo "${id}."`);
        }
      }
    }

    const depende = manifesto.depende || {};
    const opcionais = manifesto.opcionais || {};
    if (manifesto.depende && (typeof depende !== 'object' || Array.isArray(depende))) erros.push(`${onde}: "depende" inválido.`);
    for (const [dep, faixa] of Object.entries(depende)) {
      if (!faixaValida(String(faixa))) erros.push(`${onde}: faixa "${faixa}" de "${dep}" é inválida.`);
    }
    for (const [dep, faixa] of Object.entries(opcionais)) {
      if (!faixaValida(String(faixa))) erros.push(`${onde}: faixa opcional "${faixa}" de "${dep}" é inválida.`);
    }

    const scripts = manifesto.scripts;
    if (!Array.isArray(scripts)) {
      erros.push(`${onde}: "scripts" precisa ser uma lista.`);
    } else if (!manifesto.embutido && scripts.length === 0) {
      erros.push(`${onde}: declare ao menos um script.`);
    } else {
      for (const script of scripts) {
        if (!script || typeof script.src !== 'string' || !script.src) {
          erros.push(`${onde}: script sem src.`);
          continue;
        }
        if (!TIPOS_SCRIPT.has(script.tipo)) erros.push(`${onde}: tipo de script inválido em ${script.src}.`);
        if (script.src.includes('..') || path.isAbsolute(script.src)) erros.push(`${onde}: caminho de script inválido: ${script.src}.`);
        else if (!opcoes.existe(script.src)) erros.push(`${onde}: script não encontrado: ${script.src}.`);
      }
    }
    for (const vendor of manifesto.vendor || []) {
      if (!opcoes.existe(vendor)) erros.push(`${onde}: vendor não encontrado: ${vendor}.`);
    }

    const listaTelas = manifesto.telas || [];
    if (!manifesto.embutido && (!Array.isArray(listaTelas) || listaTelas.length === 0)) {
      erros.push(`${onde}: declare ao menos uma tela.`);
    }
    for (const tela of listaTelas) {
      if (!tela || !tela.id) {
        erros.push(`${onde}: tela sem id.`);
        continue;
      }
      if (telas.has(tela.id)) erros.push(`Id de tela repetido: ${tela.id}.`);
      telas.add(tela.id);
      for (const campo of ['rotulo', 'icone', 'permissao', 'abrir', 'titulo_relatorio']) {
        if (typeof tela[campo] !== 'string' || !tela[campo]) erros.push(`${onde}: tela "${tela.id}" sem ${campo}.`);
      }
      if (typeof tela.ordem !== 'number') erros.push(`${onde}: tela "${tela.id}" sem ordem numérica.`);
      if (tela.permissao && manifesto.permissoes && !manifesto.permissoes[tela.permissao]) {
        erros.push(`${onde}: tela "${tela.id}" usa a permissão "${tela.permissao}", que o módulo não declara.`);
      }
    }

    const padrao = manifesto.cargos_padrao || {};
    for (const [cargo, perms] of Object.entries(padrao)) {
      if (!Array.isArray(perms)) {
        erros.push(`${onde}: cargos_padrao.${cargo} precisa ser uma lista.`);
        continue;
      }
      for (const perm of perms) {
        if (!manifesto.permissoes || !manifesto.permissoes[perm]) {
          erros.push(`${onde}: o cargo ${cargo} recebe "${perm}", que o módulo não declara.`);
        }
      }
    }

    for (const acao of Object.keys(manifesto.acoes_legadas || {})) {
      if (acoesLegadas.has(acao)) erros.push(`Ação legada repetida: ${acao}.`);
      acoesLegadas.add(acao);
      const destino = manifesto.acoes_legadas[acao];
      if (!permissoes.has(destino) && !(manifesto.permissoes && manifesto.permissoes[destino])) {
        erros.push(`${onde}: a ação legada "${acao}" aponta para "${destino}", que ninguém declara.`);
      }
    }
    for (const aba of Object.keys(manifesto.abas_legadas || {})) {
      if (abasLegadas.has(aba)) erros.push(`Aba legada repetida: ${aba}.`);
      abasLegadas.add(aba);
    }

    const ext = manifesto.extensoes || {};
    for (const rel of ext.relatorios || []) {
      if (!rel || !rel.id) {
        erros.push(`${onde}: relatório sem id.`);
        continue;
      }
      if (relatorios.has(rel.id)) erros.push(`Id de relatório repetido: ${rel.id}.`);
      relatorios.add(rel.id);
      if (!rel.funcao) erros.push(`${onde}: relatório "${rel.id}" sem função.`);
      if (!rel.permissao) erros.push(`${onde}: relatório "${rel.id}" sem permissão.`);
    }
    for (const acao of ext.qr || []) {
      if (!acao || !acao.id || !acao.funcao) erros.push(`${onde}: ação de QR incompleta.`);
      if (acao && acao.exige_login && !acao.permissao) erros.push(`${onde}: a ação de QR "${acao.id}" exige login e não tem permissão.`);
    }
  }

  for (const manifesto of porId.values()) {
    const ext = manifesto.extensoes || {};
    for (const rel of ext.relatorios || []) {
      if (rel && rel.permissao && !permissoes.has(rel.permissao)) {
        erros.push(`Módulo ${manifesto.id}: relatório "${rel.id}" usa "${rel.permissao}", que ninguém declara.`);
      }
    }
    for (const acao of ext.qr || []) {
      if (acao && acao.permissao && !permissoes.has(acao.permissao)) {
        erros.push(`Módulo ${manifesto.id}: a ação de QR "${acao.id}" usa "${acao.permissao}", que ninguém declara.`);
      }
    }
  }

  const ids = new Set(porId.keys());
  for (const manifesto of porId.values()) {
    for (const dep of Object.keys(manifesto.depende || {})) {
      if (dep !== 'nucleo' && !ids.has(dep)) erros.push(`Módulo ${manifesto.id}: dependência "${dep}" não existe.`);
    }
    for (const dep of Object.keys(manifesto.opcionais || {})) {
      if (dep !== 'nucleo' && !ids.has(dep)) erros.push(`Módulo ${manifesto.id}: opcional "${dep}" não existe.`);
    }
  }

  if (typeof opcoes.resolver === 'function') {
    const resultado = opcoes.resolver({ todos: true }, [...porId.values()]);
    for (const bloqueio of resultado.bloqueados || []) {
      erros.push(`Resolução bloqueou ${bloqueio.id}: ${bloqueio.motivo}`);
    }
    for (const aviso of resultado.avisos || []) erros.push(`Resolução: ${aviso}`);
  }

  return erros;
}

/**
 * @param {string} raiz
 */
const NOMES_CARGO = {
  admin: 'Administrador Master',
  almoxarife: 'Almoxarife / Compras',
  encarregado: 'Encarregado',
  engenheiro: 'Engenheiro de Manutenção',
  gestor: 'Gestor / Diretoria',
  mecanico: 'Mecânico / Eletricista',
  pcm: 'Analista de PCM'
};

const EMPRESA_1 = '00000000-0000-0000-0000-000000000001';

/**
 * @param {string} sql
 * @param {string} tabela
 */
function blocoInsert(sql, tabela) {
  const re = new RegExp(`INSERT INTO public\\.${tabela}\\s*\\([\\s\\S]*?;`, 'i');
  const achado = sql.match(re);
  return achado ? achado[0] : '';
}

/**
 * @param {string} sql
 * @param {any[]} manifestos
 * @param {Record<string, { permissoes: string[] }>} matriz
 * @returns {string[]}
 */
function validarCatalogoSql(sql, manifestos, matriz) {
  /** @type {string[]} */
  const erros = [];
  const blocoModulos = blocoInsert(sql, 'modulos');
  const reModulo = /\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(true|false),\s*ARRAY\[([^\]]*)\]::text\[\],\s*'([^']*)',\s*'([^']*)'\)/g;
  /** @type {Map<string, any>} */
  const catalogo = new Map();
  let achado = reModulo.exec(blocoModulos);
  while (achado) {
    const depende = achado[5].split(',').map((item) => item.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    catalogo.set(achado[1], {
      nome: achado[2],
      categoria: achado[3],
      obrigatorio: achado[4] === 'true',
      depende,
      versao: achado[6],
      estagio: achado[7]
    });
    achado = reModulo.exec(blocoModulos);
  }
  if (!catalogo.size) erros.push('Catálogo SQL: não li a tabela modulos.');

  /** @type {Map<string, { modulo: string, descricao: string }>} */
  const permissoesSql = new Map();
  const rePerm = /\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/g;
  let perm = rePerm.exec(blocoInsert(sql, 'permissoes'));
  while (perm) {
    permissoesSql.set(perm[1], { modulo: perm[2], descricao: perm[3] });
    perm = rePerm.exec(blocoInsert(sql, 'permissoes'));
  }

  const porId = new Map(manifestos.filter((item) => item && item.id).map((item) => [item.id, item]));
  for (const [id, manifesto] of porId) {
    const linha = catalogo.get(id);
    if (!linha) {
      erros.push(`Catálogo SQL: falta o módulo ${id}.`);
      continue;
    }
    if (linha.nome !== manifesto.nome) erros.push(`Catálogo SQL: nome de ${id} divergiu.`);
    if (linha.categoria !== manifesto.categoria) erros.push(`Catálogo SQL: categoria de ${id} divergiu.`);
    if (linha.obrigatorio !== manifesto.obrigatorio) erros.push(`Catálogo SQL: obrigatorio de ${id} divergiu.`);
    if (linha.versao !== manifesto.versao) erros.push(`Catálogo SQL: versão de ${id} divergiu.`);
    if (linha.estagio !== manifesto.estagio) erros.push(`Catálogo SQL: estágio de ${id} divergiu.`);
    // O núcleo é dependência implícita de todo módulo: o catálogo da 0002 nem
    // sempre o lista, então a comparação ignora o núcleo dos dois lados.
    const depende = Object.keys(manifesto.depende || {}).filter((dep) => dep !== 'nucleo').sort();
    const dependeSql = (linha.depende || []).filter((dep) => dep !== 'nucleo').sort();
    if (JSON.stringify(dependeSql) !== JSON.stringify(depende)) erros.push(`Catálogo SQL: depende de ${id} divergiu.`);
    for (const [pid, descricao] of Object.entries(manifesto.permissoes || {})) {
      const gravada = permissoesSql.get(pid);
      if (!gravada) erros.push(`Catálogo SQL: falta a permissão ${pid}.`);
      else if (gravada.modulo !== id || gravada.descricao !== descricao) {
        erros.push(`Catálogo SQL: a permissão ${pid} não bate com o manifesto.`);
      }
    }
  }
  for (const id of catalogo.keys()) {
    if (!porId.has(id)) erros.push(`Catálogo SQL: módulo ${id} não tem manifesto.`);
  }
  for (const pid of permissoesSql.keys()) {
    const algum = [...porId.values()].some((item) => item.permissoes && item.permissoes[pid]);
    if (!algum) erros.push(`Catálogo SQL: permissão ${pid} não está nos manifestos.`);
  }

  /** @type {Map<string, { nome: string, sistema: boolean }>} */
  const cargosSql = new Map();
  const reCargo = new RegExp(`\\('${EMPRESA_1}',\\s*'([^']*)',\\s*'([^']*)',\\s*(true|false)\\)`, 'g');
  let cargo = reCargo.exec(blocoInsert(sql, 'cargos'));
  while (cargo) {
    cargosSql.set(cargo[1], { nome: cargo[2], sistema: cargo[3] === 'true' });
    cargo = reCargo.exec(blocoInsert(sql, 'cargos'));
  }
  if (cargosSql.has('operador')) erros.push('Catálogo SQL: o seed não pode ter operador.');
  const cargosMatriz = Object.keys(matriz).sort();
  for (const codigo of cargosMatriz) {
    const linha = cargosSql.get(codigo);
    if (!linha) erros.push(`Catálogo SQL: falta o cargo ${codigo}.`);
    else if (linha.nome !== NOMES_CARGO[codigo] || !linha.sistema) {
      erros.push(`Catálogo SQL: nome ou marca de sistema do cargo ${codigo} divergiu.`);
    }
  }
  for (const codigo of cargosSql.keys()) {
    if (!matriz[codigo]) erros.push(`Catálogo SQL: cargo ${codigo} não está na matriz traduzida.`);
  }

  /** @type {Set<string>} */
  const links = new Set();
  const reLink = new RegExp(`\\('${EMPRESA_1}',\\s*'([^']*)',\\s*'([^']*)'\\)`, 'g');
  let link = reLink.exec(blocoInsert(sql, 'cargo_permissoes'));
  while (link) {
    links.add(`${link[1]}|${link[2]}`);
    link = reLink.exec(blocoInsert(sql, 'cargo_permissoes'));
  }
  /** @type {Set<string>} */
  const esperados = new Set();
  for (const [codigo, info] of Object.entries(matriz)) {
    for (const pid of info.permissoes) esperados.add(`${codigo}|${pid}`);
  }
  for (const par of esperados) {
    if (!links.has(par)) erros.push(`Catálogo SQL: falta o par ${par}.`);
  }
  for (const par of links) {
    if (!esperados.has(par)) erros.push(`Catálogo SQL: par ${par} não está na matriz traduzida.`);
  }
  if (links.has('almoxarife|os.abrir')) erros.push('Catálogo SQL: almoxarife não pode ter os.abrir.');

  /** @type {Set<string>} */
  const ativos = new Set();
  const reContrato = new RegExp(`\\('${EMPRESA_1}',\\s*'([^']*)',\\s*true,\\s*'avulso'\\)`, 'g');
  let contrato = reContrato.exec(blocoInsert(sql, 'empresa_modulos'));
  while (contrato) {
    ativos.add(contrato[1]);
    contrato = reContrato.exec(blocoInsert(sql, 'empresa_modulos'));
  }
  for (const id of porId.keys()) {
    if (!ativos.has(id)) erros.push(`Catálogo SQL: a empresa 1 não liga o módulo ${id}.`);
  }

  if (!blocoInsert(sql, 'empresas').includes(`'${EMPRESA_1}', 'VILASA', 'Vilasa'`)) {
    erros.push('Catálogo SQL: a empresa 1 do seed da 0002 não é a VILASA.');
  }
  return erros;
}

/**
 * @param {string} sql
 * @param {Record<string, { permissoes: string[] }>} matriz
 * @returns {string[]}
 */
function validarMatrizDoTeste(sql, matriz) {
  const inicio = sql.indexOf('-- <<matriz-traduzida>>');
  const fim = sql.indexOf('-- <<fim-matriz-traduzida>>');
  if (inicio < 0 || fim < inicio) return ['testes_0002.sql não marca a matriz traduzida.'];
  const miolo = sql.slice(inicio, fim);
  /** @type {Set<string>} */
  const pares = new Set();
  const re = /\('([^']+)',\s*'([^']+)'\)/g;
  let achado = re.exec(miolo);
  while (achado) {
    pares.add(`${achado[1]}|${achado[2]}`);
    achado = re.exec(miolo);
  }
  /** @type {string[]} */
  const erros = [];
  /** @type {Set<string>} */
  const esperados = new Set();
  for (const [cargo, info] of Object.entries(matriz)) {
    for (const pid of info.permissoes) esperados.add(`${cargo}|${pid}`);
  }
  for (const par of esperados) {
    if (!pares.has(par)) erros.push(`testes_0002.sql não confere o par ${par}.`);
  }
  for (const par of pares) {
    if (!esperados.has(par)) erros.push(`testes_0002.sql confere o par ${par}, que não está na matriz.`);
  }
  return erros;
}

/**
 * @param {string} raiz
 */
function validarCatalogo(raiz) {
  const arquivo = path.join(raiz, 'banco', 'migracoes', '0002_plataforma_empresas_modulos.sql');
  const teste = path.join(raiz, 'banco', 'docs', 'testes_0002.sql');
  if (!fs.existsSync(arquivo)) return ['Catálogo SQL ausente: banco/migracoes/0002_plataforma_empresas_modulos.sql.'];
  if (!fs.existsSync(teste)) return ['Falta banco/docs/testes_0002.sql.'];
  const { Plataforma } = carregarPlataforma(raiz);
  const matriz = Plataforma.permissoes.matrizTraduzida();
  return validarCatalogoSql(fs.readFileSync(arquivo, 'utf8'), Plataforma.modulos.lista(), matriz)
    .concat(validarMatrizDoTeste(fs.readFileSync(teste, 'utf8'), matriz));
}

/**
 * Lê os textos do repositório que as regras do contrato v2 precisam.
 * @param {string} raiz
 */
function fontesDoRepositorio(raiz) {
  const ler = (/** @type {string} */ rel) => {
    const arquivo = path.join(raiz, rel);
    return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
  };
  /** @type {Record<string, any>} */
  const sandbox = {};
  const textoIndice = ler('modulos/indice.js');
  let indice = [];
  try {
    vm.runInContext(textoIndice, vm.createContext(sandbox));
    indice = Array.isArray(sandbox.PLATAFORMA_MODULOS) ? Array.from(sandbox.PLATAFORMA_MODULOS) : [];
  } catch (e) {
    indice = [];
  }
  const pastas = fs.readdirSync(path.join(raiz, 'modulos'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(raiz, 'modulos', d.name, 'manifesto.js')))
    .map((d) => d.name)
    .sort();
  const dirMig = path.join(raiz, 'banco', 'migracoes');
  const sql = fs.readdirSync(dirMig)
    .filter((n) => /^\d{4}_.*\.sql$/.test(n))
    .sort()
    .map((n) => fs.readFileSync(path.join(dirMig, n), 'utf8'))
    .join('\n');
  return {
    indice,
    pastas,
    paginas: { index: ler('index.html'), qr: ler('qr.html'), sw: ler('sw.js') },
    sql,
    offlineSync: ler('offline_sync.js'),
    ler
  };
}

function validarRepositorio(raiz) {
  const { Plataforma } = carregarPlataforma(raiz);
  const lista = Plataforma.modulos.lista();
  return validarRegistros(lista, {
    existe: (rel) => fs.existsSync(path.join(raiz, rel)),
    resolver: Plataforma.modulos.resolver
  }).concat(validarCatalogo(raiz))
    .concat(validarContratoV2(lista, fontesDoRepositorio(raiz)));
}

function main() {
  const raiz = path.resolve(__dirname, '..');
  const erros = validarRepositorio(raiz);
  if (erros.length) {
    for (const erro of erros) console.error(erro);
    process.exit(1);
  }
  console.log('Manifestos ok.');
}

if (require.main === module) main();

module.exports = { validarRegistros, validarRepositorio, validarCatalogoSql, validarMatrizDoTeste, validarCatalogo, fontesDoRepositorio };
