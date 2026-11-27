# Vilasa-Manut — regras do projeto

Sistema de gestão de manutenção (CMMS) vendido como produto modular: cada cliente
liga só os módulos que contratou. A Vilasa é a empresa 1 e o primeiro cliente.
Leia este arquivo inteiro antes de qualquer tarefa. O guia de uso para o dono do
projeto está em `docs/agentes/README.md`.

## Idioma

Tudo em português do Brasil: código novo (nomes de função e variável seguem o que
já existe), comentários, mensagens de commit, títulos e textos de PR, telas.

## Como o projeto é montado

- Site estático, sem build. A Vercel serve os arquivos da raiz como estão.
  Não adicione bundler, framework nem `package.json` na raiz.
- `ferramentas/` tem o único `package.json`, só para o CI e para quem desenvolve.
- Banco: Supabase (Postgres 17). **Um projeto Supabase por cliente.**
  - Produção da Vilasa: projeto `yoignpytyegagpfuvoxu` ("Painel de Manutenção").
  - Homologação: projeto `zqjgruwmqomgguxoxiuv` ("Vilasa Homologação").
- `nucleo/` — núcleo da plataforma: registro de módulos, contrato, permissões,
  carregador, QR, cadastro de ativos. `nucleo/tipos.js` define o contrato (JSDoc).
  `nucleo/contexto.js` guarda o estado comum (`usuarioLogado`, `obraAtivaId`,
  `cache*`) como propriedade de `window`: nunca declare esses nomes com `let`/`const`.
- `config.js` — escolhe o banco pelo endereço. Só os endereços listados em
  `AMBIENTES.producao` usam produção; preview, `localhost` e endereço novo caem
  na homologação. Cliente novo em produção = endereço novo nessa lista.
- `modulos/<id>/manifesto.js` — manifesto declarativo de cada módulo
  (dependências, permissões, cargos padrão, telas, relatórios, ações de QR).
  A tela do módulo ainda vive no arquivo da raiz que o manifesto aponta
  (`os_rep.js`, `frota.js`, `pcm_sap.js`, `estoque.js`, `diesel.js`, `kpis.js`, `admin.js`).
- `offline_sync.js` — fila offline (por empresa e módulo) e cache.
- `sw.js` — service worker; `nucleo/versao.js` — versão do app servido.
- `banco/migracoes/` — migrações numeradas; `banco/migracoes/reverter/` — reversões;
  `banco/docs/testes_NNNN.sql` — testes SQL só de leitura de cada migração
  (trecho que só vale logo depois da própria migração fica entre as linhas
  `-- pontual:inicio` e `-- pontual:fim`; a regressão pula esse trecho).
- `scripts/testar-sql-local.sh` — aplica todas as migrações num Postgres 17 vazio,
  com idempotência, testes, login simulado e reversão da última. Roda no CI (job `banco`).
- `test/*.test.js` — testes `node --test`; `scripts/validar-manifestos.js` — validador.

## Regras que não se quebram

1. **Nunca grave no banco de produção.** Nada de `apply_migration`, `execute_sql`
   com escrita, `psql` ou script contra `yoignpytyegagpfuvoxu`. Leitura só quando o
   Lucca pedir. Toda mudança de banco é testada na homologação primeiro, e a
   aplicação na produção é feita pelo Lucca.
2. **Nunca dê push nem merge em `main` ou `homologacao`.** Trabalhe sempre numa
   branch `claude/<assunto-curto>` e abra PR para `homologacao`. Quem faz o merge
   é o Lucca. A `main` é a produção.
3. **Commits principais precisam de aprovação.** Commits e pushes na sua branch de
   trabalho estão liberados. Merge de PR, push em branch protegida, aplicação de
   migração em qualquer banco e exclusão de dados: pare e peça aprovação, dizendo
   em uma frase o que vai acontecer.
4. **Migração SQL**:
   - arquivo novo e numerado (`NNNN_assunto.sql`); nunca edite uma migração já
     aplicada em algum banco — correção é arquivo novo;
   - idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`);
   - reversão em `reverter/NNNN_assunto_reverter.sql`;
   - teste em `banco/docs/testes_NNNN.sql` (só `SELECT` e asserts, `RAISE` se divergir);
   - toda tabela de negócio tem `empresa_id`, RLS ligado e nenhum grant para `anon`;
   - função `SECURITY DEFINER` tem `search_path` vazio e chama
     `app.exigir('<modulo>.<acao>')`. Exceções do portal público, de propósito:
     `resolver_login`, `meu_perfil`, `qr_equipamento`, `lancar_horimetro`.
5. **Permissões vêm do manifesto.** Não teste cargo pelo nome no código
   (`if (cargo === 'pcm')`). Use `Vilasa.permissoes.pode('<modulo>.<acao>')` no front e
   `app.pode(...)`/`app.exigir(...)` no banco.
6. **O núcleo não conhece módulo pelo nome.** Ele percorre o que os manifestos
   registraram. Módulo que depende de outro declara em `depende`.
7. **Suba `nucleo/versao.js`** (`vNN`) em todo PR que altere arquivo entregue ao
   navegador. O service worker usa esse valor para trocar o cache.
8. **Offline primeiro.** Lançamento de campo (horímetro, OS, movimento de
   estoque) tem que funcionar sem rede e entrar na fila de `offline_sync.js`.
   O horímetro só sobe; correção só por `corrigir_leitura`, com cargo.
9. **Termos genéricos.** O produto é vendido para construtoras e qualquer empresa
   com frota. Não escreva "Obra" fixo em tela nova: use `Vilasa.termo('local.nivel1')`, `Vilasa.termo('ativo')` etc. (chaves em `TERMOS_PADRAO`, `nucleo/nucleo.js`).
10. **Sem segredos no repositório.** A chave `anon` no `config.js` é pública por
    natureza; nada além disso (service role, senhas, tokens) entra no git.

## Antes de abrir PR (sempre)

```bash
node scripts/validar-manifestos.js
node --test test/*.test.js
npm ci --prefix ferramentas && npm run types --prefix ferramentas
```

Peça ao subagente `testador` para rodar isso e devolver só o que falhou.
Se mexeu em `banco/`, chame o `revisor-banco`. Por último, o `revisor-codigo`.
Corrija o que eles apontarem e rode de novo até passar.

## Como trabalhar uma tarefa

1. Entenda o pedido. Se houver ambiguidade que muda o resultado, pergunte uma
   vez, com opções. Se não, siga e registre a suposição no PR.
2. Planeje: arquivos, migração, testes, risco. Em tarefa grande, mostre o plano
   e espere o "ok".
3. Crie a branch `claude/<assunto>` a partir de `origin/homologacao`.
4. Implemente em passos pequenos, com commits descritivos em português.
5. Verifique (seção acima).
6. Abra o PR para `homologacao` no padrão de `docs/agentes/modelo-pr.md`.
7. Responda ao Lucca com: o que mudou, como testar no preview, o que precisa de
   aprovação. Ele usa muito o celular: seja curto e direto.

## Pendências conhecidas

- Provisionamento de cliente novo (banco próprio) ainda não é automatizado; ver a
  skill `provisionar-cliente`.
