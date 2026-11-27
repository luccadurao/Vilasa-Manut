# Banco do Vilasa-Manut

Não há runner de migrações. Os arquivos SQL são aplicados à mão, na ordem do nome, no editor SQL do Supabase ou com `psql -1 -v ON_ERROR_STOP=1 -f <arquivo>`.

## Scripts históricos (`banco/0*.sql`)

`01_preparacao.sql`, `01b`, `01c`, `02_ativar_rls.sql` e `04_almoxarifado.sql` até `11_diesel_grants.sql` são o histórico manual. O efeito deles, do jeito que ficou na produção, já está dentro de `migracoes/0000_base_producao_2026-11-24.sql`. Não rode essa série de novo em um banco montado pela pasta `migracoes/`.

`banco/03_reverter_rls.sql` foi removido no PR #4 porque reabria o acesso anônimo. Detalhe na seção "Script removido".

## Daqui em diante

Toda mudança de esquema vira um arquivo numerado em `banco/migracoes/` (`0002_….sql`, `0003_….sql`, …). A reversão, quando existir, fica em `banco/migracoes/reverter/` com o mesmo número.

O conteúdo dos SQL versionados aqui não deve ser editado depois de aplicado. Correção nova é arquivo novo.

## Montar um banco novo do zero

Em um projeto Supabase vazio (Postgres 17, com as extensões padrão):

1. `banco/migracoes/0000_base_producao_2026-11-24.sql` — só estrutura, sem dados. A sequence de OS recomeça em 1. A foreign key de `perfis_usuarios.auth_user_id` aponta para `auth.users`, que o Supabase já cria.
2. `banco/migracoes/0001_seguranca_minima.sql`
3. Os arquivos `0002+` que existirem, em ordem numérica.

Não aplique os scripts históricos por cima dessa sequência.

O inventário da extração e o resultado dos testes na homologação estão em `banco/docs/`.

## Estado da produção (24/11/2026)

A produção ("Painel de Manutenção") já está neste ponto:

- a base é o esquema extraído nesse dia (só estrutura);
- `0001_seguranca_minima.sql` foi aplicado às 18:07 (horário de Brasília), com aprovação do Lucca Durão.

Não rode a `0001` de novo na produção. O comentário no topo desse arquivo ainda diz que ele não foi aplicado: o texto foi escrito antes das 18:07 e o arquivo foi versionado sem alteração.

## Script removido

`banco/03_reverter_rls.sql` foi removido no PR #4 porque reabria o acesso anônimo: desligava o RLS das tabelas centrais e fazia `GRANT ALL` para `anon` e `authenticated`.

## Reversão da correção

`banco/migracoes/reverter/0001_seguranca_minima_reverter.sql` desfaz a `0001` e volta ao estado inseguro de antes das 18:07. Só use se a reversão for decidida de propósito.
