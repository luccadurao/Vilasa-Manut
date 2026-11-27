# Plano: terminar o núcleo modular do Vilasa-Manut

## Contexto

A fase 1 (PR #12: etapas 1 a 6) deixou o esqueleto pronto. Já existem manifestos, resolução de dependências, carregador, permissões vindas do banco (`meu_perfil`), `empresa_id` nas tabelas, locais e ativos no núcleo, e fila offline por empresa e módulo. O que ainda falta para o núcleo aguentar muitos módulos diferentes em cada cliente:

- **Os módulos ainda conversam por variáveis globais.** `core.js:5-12` (`usuarioLogado`, `cacheEquipamentos`, `obraAtivaId`…) é lido e escrito por todos os módulos. Há chamadas diretas entre eles: `pcm_sap` chama `carregarOrdensServico`, `ativos.js` chama `carregarFrota`. Há leitura direta de tabela de outro módulo: OS, Almoxarifado e Indicadores leem `equipamentos` e `ordens_servico`.
- **Bug confirmado.** Essas variáveis são `let` no `core.js`, então `window.usuarioLogado` fica `undefined`. Por isso `Vilasa.permissoes.pode()` sem usuário devolve `false` (`nucleo/nucleo.js:405`), os termos da empresa nunca são aplicados (`:1235`) e o `ativos.js` fica com a lista de obras vazia.
- **Partes do núcleo olham todos os manifestos registrados, não só os carregados.** Menu, relatórios, ações de QR e eventos (`nucleo.js:631,717,796,693`). A aba de um módulo fora do contrato ainda aparece para o admin.
- **Coisas declaradas sem efeito:** `opcionais`, `emite`/`ouve` (ninguém usa), a `permissao` de cada relatório e a `funcao` das ações de QR (o `qr.html` usa funções fixas).
- **Listas fixas que exigem editar o núcleo a cada módulo novo:** `sw.js:19-30` (manifestos), `offline_sync.js:26-67` (tabela → módulo), tags de script no `index.html` e no `qr.html` (com ordens diferentes).
- **Banco:**
  - A RLS das tabelas de negócio não filtra `empresa_id` nem checa se o módulo está ligado (políticas de 0000/0001 com `perfil_ativo`/`tem_cargo`).
  - As RPCs públicas `qr_equipamento` e `lancar_horimetro` não checam o módulo.
  - O catálogo de permissões está repetido em três lugares (manifestos, literais da 0002 e o teste) e o validador só lê a 0002.
  - `nucleo.todos_locais` é usada e não existe no catálogo.
  - Os cargos admin, engenheiro e gestor estão fixos no SQL (`app.obra_ok`) e no JS.
  - O checksum das migrações é o md5 do nome do arquivo, não do conteúdo.
  - Não há registro de qual versão de cada módulo cada empresa tem.
- **O `config.js` aponta fixo para a produção**, o que impede testar com login no preview.
- **O CI não roda nenhum SQL.** O `scripts/testar-sql-local.sh` ainda busca a 0000 e a 0001 de uma branch antiga do Cursor.

**Objetivo:** um contrato de módulo fechado, em que o módulo só enxerga o que o núcleo entrega a ele, e um banco que garante isolamento e contrato sozinho. Este plano cobre **só o núcleo**. A migração de cada módulo para o contrato novo fica para depois. Para provar o contrato sem mexer em módulo real, os testes usam um **módulo de exemplo** (`test/fixtures/modulo-exemplo/`).

### Decisões já tomadas

- **Módulo desligado:** os dados somem da tela e ficam no banco. A RLS bloqueia leitura e escrita. Religou, volta tudo.
- **Um banco por cliente: você está certo.** O motivo principal é segurança, não desempenho.
  - Um erro de política ou de migração num cliente não vaza dados de outro.
  - Backup, restauração e LGPD ficam por cliente.
  - Um cliente pesado não deixa os outros lentos.
  - O custo é um projeto Supabase pago por cliente e ter que aplicar cada migração N vezes. Por isso o plano automatiza isso (fase 7).
  - Mesmo assim, mantemos o `empresa_id` com filtro na RLS como segunda tranca, porque é barato (fase 5). Juntar vários clientes num banco só fica possível no futuro, mas não é o padrão.

- **Produto genérico, sem "Vilasa" no código.** A Vilasa vira só a empresa 1 nos dados (código, nome, marca e termos em `empresas`).
  - O namespace global passa de `Vilasa` para **`Plataforma`**, com `window.Vilasa` como apelido temporário até tudo migrar.
  - O nome comercial do produto fica numa constante só (`nucleo/produto.js`: nome, URL base, prefixo das chaves locais). Trocar a marca do produto passa a ser mexer num arquivo só.
- **O núcleo traz os cadastros e serviços básicos que qualquer módulo futuro usa** (Vendas, RH, Financeiro…), e não só a manutenção. Os módulos atuais deixam de ser o centro.

---

## Neutralização do nome (fase 0b)

Tudo que hoje carrega "Vilasa" e é produto, não cliente:

| Hoje | Vira |
|---|---|
| `window.Vilasa`, `window.VilasaMod` | `window.Plataforma`, `Plataforma.definirModulo` (apelido `Vilasa` por algumas versões) |
| `VILASA_VERSAO_APP` (`nucleo/versao.js`) | `PLATAFORMA_VERSAO_APP` |
| chaves `vilasa_sessao_v3`, `vilasa_empresa_codigo`, `vilasa_obra_ativa_v2` | `plat_sessao_v4`, `plat_empresa_codigo`, `plat_local_ativo`, lendo as chaves antigas uma vez para ninguém ser deslogado |
| cache do SW `vilasa-pwa-*` | `plat-pwa-*` (o SW apaga os antigos) |
| `CODIGO_EMPRESA_PADRAO='VILASA'` (`nucleo.js:888`) | `empresa_padrao` no `config.js` por endereço (no domínio da Vilasa continua sendo `VILASA`) |
| `URL_BASE_QR` fixo `vilasa-manut.vercel.app` | `location.origin` + `nucleo/produto.js` |
| "VILASA CMMS", "VILASA CONSTRUTORA" em impressões (`core.js:699,727`) | `empresa.nome` / `empresa.marca` da sessão |
| `TERMOS_PADRAO` com "Obra"/"Equipamento" | padrão genérico **"Local"** e "Ativo"; empresa que quiser outro nome (Obra, Filial, Fazenda) troca em `empresas.termos`, sem código |
| "obra" nos nomes do código: `obraAtivaId`, `cacheObras`, `obras_permitidas`, `filtrarListaPorObraAtiva`, `obterNomeObraAtiva`, `carregarObrasEMontarSeletorTopo` | `localAtivoId`, `cacheLocais`, `locais_permitidos`, `filtrarPorLocalAtivo`, `nomeDoLocalAtivo`, `montarSeletorDeLocal` (apelidos antigos enquanto os módulos não migram) |
| "obra" no banco: view `obras`, `app.obra_ok`, colunas `obra_id`, `perfis_usuarios.obras_permitidas`, `meu_perfil.obras_permitidas` | o núcleo passa a usar só `locais`, `app.local_ok`, `local_id` e `locais_permitidos`; `obras`, `obra_ok` e `obra_id` ficam como compatibilidade, marcados como descontinuados, e saem quando os módulos migrarem |
| SQL: `email_interno` `@….vilasa.invalid`, padrão da empresa 1 em `resolver_login` | domínio neutro (`.plataforma.invalid`) só para empresas novas; os usuários existentes não mudam |
| `CLAUDE.md`, skills e agentes citando `Vilasa.permissoes.pode` | `Plataforma.permissoes.pode` |

O nome do repositório e dos projetos Supabase e Vercel não muda agora: é operação, não código.

## Base comum do núcleo (fase 4b)

O que é igual para manutenção, vendas, RH ou financeiro sobe para o núcleo. Assim um módulo novo nunca recria cadastro de pessoa, cliente ou unidade.

**No front: `Plataforma.contexto`, entregue a todo módulo em `ctx.contexto`**

- `empresa`: id, código, nome, marca, termos, fuso, moeda e locale (`pt-BR`/`BRL` por padrão);
- `usuario`: id, pessoa, cargos, permissões;
- `local`: local ativo e locais permitidos;
- `modulos`: os ligados, com a versão e a config de cada um;
- `online` / `versao_app`.

**Utilitários comuns: `Plataforma.formatar` e `Plataforma.util`**

- data, hora, moeda, número e documento (CPF/CNPJ) pelo locale da empresa;
- `termo()`;
- `esc()`;
- paginação de leitura (hoje repetida em cada módulo: `buscarTudoSemLimite`, `dieselLerPaginado`, `paginarKPI`).

**Cadastros do núcleo no banco (todos com `empresa_id`, RLS e permissões `nucleo.*` no manifesto do núcleo)**

| Cadastro | Para quê | Situação |
|---|---|---|
| `empresas` | cliente, marca, termos, fuso, moeda | existe; ganha fuso, moeda e locale |
| `locais` + `locais_niveis` | estrutura física e organizacional (filial, fazenda, loja, obra… o nome vem de `empresas.termos`) | existe (0004) |
| `pessoas` | qualquer pessoa da empresa: funcionário, motorista, técnico. Base de RH, executante de OS, vendedor | **novo**; `perfis_usuarios` passa a apontar para `pessoa_id` |
| `usuarios` / `cargos` / `permissoes` | login e acesso | existe |
| `parceiros` | clientes, fornecedores e prestadores (vendas, compras, estoque, terceiros) | **novo** |
| `centros_custo` | custeio comum a manutenção, compras, RH e vendas | **novo** |
| `unidades_medida` | un, kg, L, h, km | **novo** (hoje é texto solto) |
| `ativos` + `tipos_ativo` | o que tem medidor e manutenção | existe (0004); continua no núcleo |
| `campos_extras` | campos personalizados por empresa em qualquer cadastro (o JSONB `extras`/`atributos` com esquema por empresa) | **novo** |

**Serviços comuns do núcleo no banco**

| Serviço | Para quê |
|---|---|
| `app.proximo_numero(serie)` + tabela `numeracoes` | numeração sequencial por empresa (OS nº, pedido nº, admissão nº), sem buraco nem colisão |
| `auditoria` + `app.auditar()` (trigger genérico) | histórico de quem mudou o quê, em qualquer tabela que o manifesto marcar como auditada; substitui o `admin_auditoria` gravado pelo cliente |
| `anexos` (Supabase Storage, caminho `empresa/modulo/registro`) | foto de OS, nota fiscal, documento de RH |
| `notificacoes` | aviso para pessoa ou cargo; qualquer módulo publica |
| `calendario` (feriados, turnos) | prazos de preventiva, escala de RH, SLA |

**Regra:** módulo só cria tabela própria para o que é dele (OS, abastecimento, pedido, folha). Pessoa, parceiro, local, centro de custo, unidade, anexo, número e auditoria vêm do núcleo, sempre por FK ou serviço.

Os módulos atuais não são reescritos agora. Só passam a poder usar a base comum quando migrarem.

---

## Arquitetura alvo do núcleo

### 1. Contrato v2 do manifesto (`nucleo/tipos.js`, aceitando o v1)

O manifesto passa a declarar tudo que o módulo usa ou oferece:

- `tabelas`: as tabelas que o módulo é dono. Fonte única do mapa tabela → módulo para a fila offline e para o banco.
- `rpcs`: as RPCs do módulo.
- `fornece` / `consome`: serviços entre módulos (ex.: `frota` fornece `ativos.listar`; `os` consome). `consome` exige o fornecedor em `depende` ou em `opcionais`.
- `eventos.emite` / `eventos.ouve`: nomes com prefixo do módulo (`os.fechada`). O validador só aceita ouvir evento que algum manifesto emite.
- `config`: esquema simples (tipo, padrão, mínimo/máximo) do `empresa_modulos.config` do módulo. O núcleo valida e preenche os padrões.
- `offline`: quais tabelas e RPCs podem ir para a fila, as chaves de cache e a ordem de envio.
- `precache`: arquivos extras do módulo.
- `categoria` aceita também `comercial`, `financeiro` e `pessoas` (RH), para Vendas, RH e Financeiro entrarem sem mexer no núcleo.
- `nucleo`: faixa de versão do núcleo exigida. Passa a ser obrigatória para todo módulo (hoje `preventivas`, `diesel` e `painel` não declaram).

### 2. Ciclo de vida e contexto isolado (`nucleo/nucleo.js` → arquivos menores)

- O módulo se registra com `Plataforma.definirModulo('<id>', { iniciar(ctx), parar(), telas: {...}, relatorios: {...}, qr: {...} })`. Nada de `window[nome]`.
  - O `resolverFuncao` continua aceitando global só como compatibilidade, com aviso no console.
  - A compatibilidade some quando o último módulo migrar.
- O `ctx` entregue a cada módulo é escopado:
  - `ctx.pode`, `ctx.termo`, `ctx.config` (já validada);
  - `ctx.eventos`: só emite o que declarou e só ouve o que declarou;
  - `ctx.servico('<nome>')`: só o que declarou em `consome`;
  - `ctx.offline`: fila e cache já carimbados com empresa e módulo, aceitando só as tabelas declaradas;
  - `ctx.db`: cliente Supabase com checagem leve de tabela declarada;
  - `ctx.contexto`: usuário, empresa e local ativo, somente leitura, com evento `nucleo.contexto_mudou`.
- **Isolamento de falha:** erro em `iniciar` ou ao abrir uma tela bloqueia só aquele módulo (vai para `bloqueados` com motivo) e mostra um aviso na seção. Os outros módulos continuam.
- **Só o que foi carregado entra:** menu, seções, relatórios, QR e eventos passam a percorrer apenas os módulos carregados. O núcleo checa a `permissao` de cada relatório.
- **`parar()` e reset do carregador:** na troca de usuário ou empresa sem recarregar a página, o núcleo para os módulos e zera `cargaPromise`.

### 3. Estado compartilhado: `Plataforma.contexto` (novo `nucleo/contexto.js`)

- Substitui as globais do `core.js`. As globais viram *getters* de compatibilidade: `window.usuarioLogado` lê `Plataforma.contexto.usuario`. Isso corrige o bug do `let`.
- Os caches `cacheEquipamentos`, `cacheObras` etc. passam a ser serviços do dono, do núcleo para locais e ativos (`nucleo/ativos.js`). Os módulos leem pelo serviço, não pela variável.

### 4. Índice único de módulos (novo `modulos/indice.js`)

- Uma lista dos manifestos existentes. O `index.html` e o `qr.html` carregam só o índice. O núcleo injeta os manifestos e o `sw.js` faz `importScripts` do índice para o precache.
- Módulo novo passa a significar uma linha no índice, e mais nada no núcleo.
- O validador confere: índice igual às pastas em `modulos/`, os scripts existem, e as funções de tela, relatório e QR declaradas são exportadas pelo `definirModulo` (checagem estática por texto ou no sandbox de `scripts/carregar-sandbox.js`).

### 5. Fila offline e service worker guiados pelo manifesto (`offline_sync.js`, `sw.js`)

- O mapa tabela → módulo e chave → módulo é montado a partir de `manifesto.tabelas` e `offline`. Acabam as listas fixas de `offline_sync.js:26-67`, e Diesel e Admin deixam de ficar com `modulo: null`.
- Item de módulo desligado continua indo para "suspensos", como já acontece.
- O `qr.html` chama a `funcao` da ação de QR do manifesto em vez das funções fixas (`qr.html:185,189,371,435`). A lista `CARGOS_QUE_ABREM_OS` e os testes de cargo do `qr.html:227,391` saem.

### 6. Permissões sem nome de cargo

- `admin` deixa de ser exceção no código (`nucleo.js:372,410`, `core.js:83,94`, SQL `avaliar_permissao`). Vira um cargo de sistema que recebe todas as permissões pela semeadura do catálogo.
- `app.obra_ok`/`local_ok` passam a usar só `app.pode('nucleo.todos_locais')`, que entra no catálogo do manifesto do núcleo.
- O `MATRIZ_PERMISSOES_CARGOS` de `core.js:28-68` sai. O fallback fica sendo o `cargos_padrao` dos manifestos.

### 7. Banco: catálogo, isolamento e versão

- **Catálogo gerado a partir dos manifestos.** Um novo `scripts/gerar-catalogo-sql.js` produz o SQL idempotente (`INSERT … ON CONFLICT`) de `modulos`, `permissoes` e `cargo_permissoes` padrão. Toda mudança de manifesto que mexa em permissão gera uma migração nova com esse bloco.
- O validador passa a comparar os manifestos com o **estado final** de todas as migrações (aplicadas em ordem), não só com a 0002.
- **Helper de acesso:** `app.acesso(modulo text, perm text)` = empresa do perfil + `modulo_ativo` + `pode`. As políticas de toda tabela de negócio são reescritas como `empresa_id = app.empresa_atual() AND app.modulo_ativo('<dono>')`, com escrita também exigindo `app.pode('<dono>.<acao>')`. O dono de cada tabela vem de `manifesto.tabelas`.
- **RPCs públicas:** `qr_equipamento` e `lancar_horimetro` checam `app.modulo_ativo` da empresa do equipamento. `qr_equipamento` para de devolver `marca` e `termos` além do necessário.
- **Versão por empresa:**
  - `empresa_modulos.versao_instalada` mais a regra "o app só sobe um módulo se `manifesto.versao` couber na versão do banco".
  - `migracoes_aplicadas.checksum` passa a ser o md5 do conteúdo. A 0000 e a 0001 são registradas.
  - `escopo='modulo'` passa a ser usado nas migrações próprias de módulo.
- **Ligar/desligar** só por uma RPC de plataforma (`plataforma_definir_modulo`), com `exigir` e histórico (o trigger que já existe).

### 8. Ambiente por endereço (`config.js`)

`config.js` escolhe URL e chave `anon` pelo `location.hostname`:

- domínio de produção → projeto de produção;
- `*-git-homologacao-*`, previews e `localhost` → homologação;
- domínio de cliente → o projeto daquele cliente, numa tabela no próprio `config.js`, só com chaves `anon`, que são públicas.

O padrão para endereço desconhecido é **homologação**, nunca produção.

---

## Fases (um PR por fase, sempre para `homologacao`)

| Fase | Entrega | Arquivos principais | Banco |
|---|---|---|---|
| **0. Base segura** | `config.js` por endereço; correção do bug do `let` (getters em `Plataforma.contexto`); `testar-sql-local.sh` usando a 0000/0001 do repositório; **CI com Postgres** rodando migrações, testes SQL, reaplicação (idempotência) e reversões | `config.js`, `core.js`, `nucleo/contexto.js`, `.github/workflows/ci.yml`, `scripts/testar-sql-local.sh` | — |
| **0b. Nome neutro** | `Plataforma` com apelido `Vilasa`; `nucleo/produto.js`; chaves locais e cache do SW renomeados, com migração das antigas; impressões e QR pela empresa da sessão; termos padrão genéricos | `nucleo/*.js`, `core.js`, `sw.js`, `offline_sync.js`, `qr.html`, `CLAUDE.md`, `.claude/` | 0006: `locais_permitidos` em `perfis_usuarios` e `meu_perfil` (com `obras_permitidas` por compatibilidade); domínio de e-mail interno neutro para empresas novas |
| **1. Contrato v2** | tipos novos; validador com as regras novas (índice, `tabelas`, `consome`↔`depende`, eventos, `config`, `nucleo` obrigatório, funções exportadas); manifestos atuais completados com `tabelas`, `rpcs`, `offline`; `modulos/indice.js` | `nucleo/tipos.js`, `scripts/validar-manifestos.js`, `modulos/*/manifesto.js`, `modulos/indice.js` | — |
| **2. Runtime do núcleo** | dividir `nucleo.js` (registro, resolver, carregador, permissões, eventos, extensões, sessão); `definirModulo`, `ctx`, `parar`, isolamento de falha, serviços, eventos com prefixo, "só carregados" no menu, relatórios e QR | `nucleo/*.js`, `index.html`, `qr.html` | — |
| **3. Offline e SW pelo manifesto** | mapa da fila a partir dos manifestos; `sw.js` lendo o índice; `qr.html` chamando a `funcao` do manifesto | `offline_sync.js`, `sw.js`, `qr.html` | — |
| **4. Permissões sem cargo fixo** | tirar o bypass de `admin` e a matriz antiga do JS; `nucleo.todos_locais` no manifesto do núcleo | `nucleo/*.js`, `core.js`, `nucleo/manifesto` | catálogo gerado + `admin` com todas as permissões + `obra_ok` sem cargo fixo |
| **4b. Base comum** | `Plataforma.contexto` completo, `Plataforma.formatar`/`util`; telas simples de cadastro do núcleo (pessoas, parceiros, centros de custo) dentro do Admin | `nucleo/contexto.js`, `nucleo/formatar.js`, `nucleo/cadastros.js` | migrações de pessoas, parceiros, centros de custo, unidades, campos extras, numeração, auditoria, anexos, notificações, calendário (pode virar 2 PRs) |
| **5. Isolamento no banco** | `app.acesso`; RLS de todas as tabelas de negócio por empresa + módulo ativo + permissão; RPCs públicas checando o módulo | `scripts/gerar-catalogo-sql.js` | RLS e RPCs públicas, com reversões e `testes_NNNN.sql` incluindo **teste cruzado entre duas empresas** e "módulo desligado = zero linhas" |
| **6. Versão e ciclo de vida** | `versao_instalada`, checksum por conteúdo, `plataforma_definir_modulo`; o front recusa um módulo incompatível com motivo claro | `nucleo/carregador.js` | versão e ciclo de vida |
| **7. Documentação e ferramentas** | `docs/nucleo/contrato-modulo.md` (como um módulo se conecta, com o módulo de exemplo); atualizar as skills `novo-modulo` e `provisionar-cliente` (aplicar migrações + catálogo + checar versão); entrada no `CLAUDE.md` | `docs/`, `.claude/skills/` | — |

**Ordem e risco:**

- A fase 0 vem primeiro porque desbloqueia testar com login e dá rede de segurança no CI.
- As fases 1 a 3 só mexem no front e mantêm a compatibilidade: os 7 módulos atuais continuam funcionando por globais, com aviso no console.
- As fases 4 e 5 são as de maior risco (alguém pode perder acesso). Antes, o `test/paridade.test.js` é estendido para o banco: a mesma tabela de cargo × aba × ação conferida via SQL na homologação.
- Toda fase sobe o `nucleo/versao.js`.

## Reuso do que já existe

- Resolver e semver: `nucleo/nucleo.js:84-326`.
- Carregador: `:1048-1170`.
- Sessão v3: `:414-566`.
- Termos: `:1221-1279`.
- Sandbox de manifestos: `scripts/carregar-sandbox.js`.
- Validador com leitura do SQL: `scripts/validar-manifestos.js:157-273`, a ser generalizado para todas as migrações.
- No banco: `app.modulo_ativo`, `app.pode`, `app.exigir`, e os triggers `validar` e `historico` de `empresa_modulos` (0002).
- Fila com suspensos: `offline_sync.js:167-288`.
- Teste local de SQL: `scripts/testar-sql-local.sh`, que já simula JWT e VM403.

## Verificação (por fase)

1. `node scripts/validar-manifestos.js`, `node --test test/*.test.js`, `npm run types --prefix ferramentas` (pelo `testador`).
2. Testes novos:
   - `test/contrato-modulo.test.js`: o módulo de exemplo carrega, recebe o `ctx`, não acessa serviço ou evento não declarado, e um erro em `iniciar` isola só ele;
   - `test/indice.test.js`;
   - `test/contexto.test.js`: o bug do `let` coberto;
   - `test/config-endereco.test.js`: endereço desconhecido cai na homologação.
3. CI com Postgres:
   - 0000 → última migração;
   - cada `testes_NNNN.sql`;
   - reaplicar tudo (idempotência);
   - reverter e reaplicar as últimas;
   - testes cruzados de duas empresas e de módulo desligado.
4. Banco: migração aplicada **só na homologação**, e só com sua aprovação. `revisor-banco` em toda fase com SQL.
5. Preview da Vercel apontando para a homologação: login com cada cargo, conferir abas, relatórios, QR (`qr.html?id=`) e um lançamento offline (modo avião → volta → fila esvazia).
6. Produção: só você aplica, depois do teste na homologação.
