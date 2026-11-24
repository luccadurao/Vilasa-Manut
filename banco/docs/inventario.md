# Inventário do esquema — Supabase PRODUÇÃO do Vilasa-Manut

- **Origem:** projeto "Painel de Manutenção", ref `yoignpytyegagpfuvoxu` (Postgres 17, us-east-1)
- **Extraído em:** 24/11/2026 (horário de Brasília), **somente catálogo** (`pg_catalog`, `information_schema`, `pg_get_*def`, `pg_policies`, `pg_indexes`). Nenhuma linha de tabela de negócio foi lida.
- **Aplicado em:** HOMOLOGAÇÃO "Vilasa Homologação", ref `zqjgruwmqomgguxoxiuv`, migração `base_producao_2026_11_24`.
- **Script:** `0000_base_producao_2026-11-24.sql` (gerado por `tools/gerar_sql.py` a partir de `raw/prod_catalog.json`).
- **Repo comparado:** `/workspace/vilasa-manut`, `origin/main` @ `8d408b6` (após `git fetch`), pasta `banco/`.

## 1. Visão geral

| Item | Produção | Homologação após aplicar |
|---|---:|---:|
| Schemas próprios | `public`, `app` | `public`, `app` |
| Tabelas | 29 (27 public + 2 app) | 29 |
| Colunas | 276 | 276 |
| Constraints (PK/UNIQUE/CHECK/FK) | 83 | 83 |
| Índices (todos, inclusive de constraints) | 59 | 59 |
| Funções | 30 (15 public + 15 app) | 30 |
| Policies | 27 | 27 |
| Triggers | 5 | 5 |
| Sequences | 1 | 1 |
| Views / materialized views | 0 | 0 |
| Tipos / enums / domains próprios | 0 | 0 |

A validação comparou, além das contagens, um hash MD5 de cada categoria (definição de coluna com tipo, NOT NULL e default; `pg_get_constraintdef`; `indexdef`; `md5(pg_get_functiondef)` + SECURITY DEFINER; ACL de funções; texto completo das policies; `pg_get_triggerdef` + estado; ACL de tabelas e sequences; estado de RLS). **Todos os 10 hashes ficaram idênticos.** Também batem: privilégios padrão do role `postgres` no schema `public`, ACL do schema `app` e o event trigger `ensure_rls`.

Extensões instaladas na produção: `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (em `extensions`) e `supabase_vault`, todas padrão do Supabase e já presentes na homologação.

Objetos de plataforma reproduzidos: função `public.rls_auto_enable()` + event trigger `ensure_rls`, que liga RLS automaticamente em toda tabela nova criada no schema `public`. Existe na produção e não vinha na homologação; foi criado. **Efeito para as próximas migrações:** toda tabela nova em `public` nasce com RLS ligado e sem policy (bloqueada para anon/authenticated até ganhar policy).

Privilégios padrão do `postgres` no `public` (produção, reproduzidos): tabela nova dá a anon/authenticated/service_role só TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (sem SELECT/INSERT/UPDATE/DELETE); função nova e sequence nova não dão nada a esses roles. Ou seja, toda migração nova precisa de GRANT explícito.

## 2. Tabelas, RLS real em produção e GRANTs (metadado)

`reltuples` é estimativa do planner; `-1` = tabela nunca analisada (não quer dizer vazia).

| Tabela | Linhas aprox. (reltuples) | RLS | Policies | GRANT anon / authenticated |
|---|---:|---|---:|---|
| app._bkp_equipamentos_20261112 | 556 | desligado | 0 | só dono |
| app._bkp_merge_equip_20261112 | sem estatística (-1) | desligado | 0 | só dono |
| public.admin_auditoria | sem estatística (-1) | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.apontamentos_os | sem estatística (-1) | desligado | 1 | anon: CRUD; authenticated: CRUD |
| public.configuracoes_sistema | sem estatística (-1) | desligado | 1 | anon: CRUD; authenticated: CRUD |
| public.diario_horimetro | 25294 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.diesel_abastecimentos | 31431 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: CRUD |
| public.diesel_carregamentos | 502 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: CRUD |
| public.diesel_estoque_diario | 1157 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: CRUD |
| public.diesel_tanques | sem estatística (-1) | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: CRUD |
| public.equipamentos | 534 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.equipamentos_historico | sem estatística (-1) | **ligado** | 1 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.execucoes_preventiva | 866 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.itens_os_estoque | sem estatística (-1) | desligado | 1 | anon: CRUD; authenticated: CRUD |
| public.lotes_estoque | 0 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.movimentacoes_almoxarifado | 4453 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.notas_fora_do_custo | 347 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: CRUD |
| public.obras | sem estatística (-1) | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.ordens_servico | 4285 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.os_pecas_previstas | sem estatística (-1) | **ligado** | 1 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.pecas_estoque | 470 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.perfis_usuarios | 25 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.planos_preventiva | 193 | desligado | 0 | anon: CRUD; authenticated: CRUD |
| public.preventiva_estrategias | 49 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.preventiva_lista_materiais | 1626 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.preventiva_lista_tarefas | 4657 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.preventiva_listas | 169 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.preventiva_pacotes | 169 | **ligado** | 2 | anon: sem SELECT/INSERT/UPDATE/DELETE; authenticated: sem SELECT/INSERT/UPDATE/DELETE |
| public.servicos_almoxarifado | sem estatística (-1) | desligado | 0 | anon: CRUD; authenticated: CRUD |

**Resumo do RLS em produção:** 13 tabelas com RLS **ligado** (admin_auditoria, os 4 do diesel, equipamentos_historico, notas_fora_do_custo, os_pecas_previstas, as 5 de preventiva_*) e **16 desligado**, incluindo todas as centrais: equipamentos, ordens_servico, perfis_usuarios, obras, pecas_estoque, movimentacoes_almoxarifado, itens_os_estoque, diario_horimetro, planos_preventiva, execucoes_preventiva, apontamentos_os, configuracoes_sistema, lotes_estoque, servicos_almoxarifado + 2 backups em `app`. Nenhuma tabela usa FORCE RLS. É o estado esperado após `banco/03_reverter_rls.sql` (as 34 policies de `02_ativar_rls.sql` não existem na produção).

### Pontos de atenção (achados só por metadado, não testados no app)
1. **`perfis_usuarios` sem RLS e com SELECT/INSERT/UPDATE/DELETE para `anon`**, e a tabela tem a coluna `senha_acesso` (NOT NULL). Qualquer pessoa com a chave pública do site consegue ler e alterar a tabela de usuários pela API REST. O mesmo vale (CRUD para anon) para as demais tabelas centrais com RLS desligado.
2. **Tabelas com RLS ligado e sem GRANT de SELECT/INSERT/UPDATE/DELETE para `authenticated`:** preventiva_estrategias, preventiva_pacotes, preventiva_listas, preventiva_lista_tarefas, preventiva_lista_materiais, os_pecas_previstas, equipamentos_historico, admin_auditoria. Elas foram criadas depois que os privilégios padrão foram restringidos, e só o diesel ganhou GRANT (`11_diesel_grants.sql`). Só que `pcm_sap.js` (15 chamadas) e `admin.js` (insert em admin_auditoria) acessam essas tabelas direto via `db.from(...)`. Pelo catálogo, isso deve dar `permission denied` (42501) hoje em produção. As policies existem, mas sem GRANT não chegam a ser avaliadas. **Vale testar na homologação**, que reproduz exatamente essas ACLs.
3. Policies "Acesso App ..." (`USING true`, para `public`) em apontamentos_os, configuracoes_sistema e itens_os_estoque: estão inativas porque o RLS dessas tabelas está desligado. Se alguém ligar o RLS sem removê-las, elas liberam tudo.
4. Tabelas de backup `app._bkp_equipamentos_20261112` (~556 linhas) e `app._bkp_merge_equip_20261112` continuam na produção. Foram reproduzidas (só estrutura) para manter a paridade; candidatas a remoção.

## 3. Policies (27)



## 4. Funções (30)



Funções não chamáveis pela API (sem GRANT explícito, ACL padrão PUBLIC): triggers `app.carimbo_horimetro`, `app.log_alteracao_equipamento`, `app.log_saldo_peca`, `app.preventiva_ao_concluir`, mais `app.chave_tag` e `app.pacote_do_ciclo`. Como o schema `app` tem USAGE para anon/authenticated, `app.chave_tag` e `app.pacote_do_ciclo` (esta é SECURITY DEFINER) podem ser executadas por anon se o PostgREST expuser o schema `app`. Por padrão, o PostgREST só expõe `public`.

## 5. Triggers (5)

| Tabela | Trigger | Definição |
|---|---|---|
| public.equipamentos | trg_carimbo_horimetro | BEFORE INSERT OR UPDATE, FOR EACH ROW → app.carimbo_horimetro() |
| public.equipamentos | trg_log_alteracao_equipamento | AFTER UPDATE, FOR EACH ROW → app.log_alteracao_equipamento() |
| public.ordens_servico | trg_preventiva_ao_concluir | AFTER UPDATE OF status → app.preventiva_ao_concluir() |
| public.pecas_estoque | trg_log_saldo_peca_i | AFTER INSERT → app.log_saldo_peca() |
| public.pecas_estoque | trg_log_saldo_peca_u | AFTER UPDATE OF quantidade → app.log_saldo_peca() |

Sequence: `public.ordens_servico_numero_os_seq` (integer, OWNED BY ordens_servico.numero_os). Na homologação ela recomeça em 1, já que valores de sequence são dados e não foram copiados.

## 6. Dependências do schema `auth` e como foram tratadas

| Dependência | Onde | Tratamento |
|---|---|---|
| FK `perfis_usuarios.auth_user_id → auth.users(id) ON DELETE SET NULL` | constraint `perfis_usuarios_auth_user_id_fkey` | Mantida igual. `auth.users` existe em todo projeto Supabase e a FK é criada depois das tabelas. Na homologação, `auth.users` está vazio, então os perfis de teste precisam de usuário Auth criado antes (ou de `auth_user_id` nulo). |
| `auth.uid()` | default de `admin_auditoria.usuario_auth`; funções `app.ativo`, `app.cargos`, `app.obra_ok`, `app.perfil_ativo`, `app.log_alteracao_equipamento`, `app.log_saldo_peca`, `almox_movimentar`, `corrigir_leitura`, `meu_perfil`, `preventiva_gerar_os` | Mantido sem mudança (função padrão do Supabase). |
| Escrita em `auth.users` / `auth.identities` | `app.criar_auth_user` (SECURITY DEFINER, EXECUTE só do dono), `public.admin_salvar_usuario` e `public.admin_definir_ativo` (SECURITY DEFINER, EXECUTE para authenticated) | Mantidas iguais. Dependem do formato interno das tabelas de auth do Supabase. Como as duas instâncias estão no Postgres 17 (17.11 vs 17.12), o risco é baixo, mas é o primeiro ponto a testar quando a versão do Auth mudar. |
| Triggers em tabelas de `auth` | — | **Nenhum trigger próprio em `auth`.** Os triggers em `storage.*` são todos da plataforma e não foram copiados. |
| Policies/funções em `storage` | — | Nada próprio. Nenhum bucket nem policy de storage criado pelo projeto foi encontrado no levantamento. |

Usuários do Auth, perfis e qualquer outro dado **não** foram copiados.

## 7. Diferenças entre produção e `banco/*.sql` do repo (origin/main @ 8d408b6)

**O repo não tem o esquema original.** 15 tabelas da produção não são criadas por nenhum arquivo de `banco/`: equipamentos, ordens_servico, perfis_usuarios, obras, pecas_estoque, movimentacoes_almoxarifado, itens_os_estoque, diario_horimetro, planos_preventiva, execucoes_preventiva, apontamentos_os, configuracoes_sistema, lotes_estoque, servicos_almoxarifado e **notas_fora_do_custo**. Também faltam as 2 tabelas de backup em `app`. Os scripts do repo só criam equipamentos_historico, os_pecas_previstas, preventiva_* (5), admin_auditoria e diesel_* (4). Esta migração base resolve essa lacuna.

**Migrações aplicadas na produção sem arquivo correspondente no repo** (`supabase_migrations`, 15 registros):
- `20261112120736 os_assumir_atomico` → a função `public.os_assumir(p_os uuid, p_nome text)` existe na produção e é usada por `os_rep.js`, mas não está em nenhum `banco/*.sql`.
- `20261116192352 12_notas_fiscais_historico` → a tabela `notas_fora_do_custo` (RLS ligado, policies `nfora_all`/`nfora_sel`, índice `ix_nfora_cat`) não está no repo. O último arquivo do repo é `11_diesel_grants.sql`.
- `historico_leituras_dois_medidores` / `historico_horimetros_dois_medidores`: na produção existem os índices `ix_diario_eq_data` e `ux_diario_eq_medidor_data` (UNIQUE), além da CHECK `diario_horimetro_medidor_chk`, que não batem com `05_historico_leituras.sql` (o repo cria `ix_diario_equip_medidor`). O SQL aplicado foi diferente do arquivo.
- Índices na produção sem origem no repo: `idx_itens_status`, `idx_lotes_fifo`, `idx_servicos_equip`, `ix_movalm_carga`. Os três primeiros provavelmente vêm do esquema original.

**No repo, mas não na produção (esperado):**
- `02_ativar_rls.sql`: funções `app.acesso_global`, `app.guard_equipamentos`, trigger `trg_guard_equipamentos` e 34 policies (eq_*, os_*, perfis_*, obras_*, itens_*, etc.) não existem. RLS desligado nas 14 tabelas. Isso confirma que `03_reverter_rls.sql` foi a última coisa aplicada nesse grupo.
- `app.limite_salto_efetivo` foi criada em 01b e removida em 01c. Coerente.
- `03_reverter_rls.sql` dá `GRANT ALL ... TO anon, authenticated` em todas as tabelas: é a origem do CRUD para anon nas tabelas centrais.

**Policies com texto diferente do arquivo:** `eqhist_select`, `osprev_sel` e `preventiva_*_sel` aparecem no repo com `using (true)`; na produção estão com `app.perfil_ativo()`, por causa de `08_leituras_so_perfil_ativo.sql`. Coerente.

## 8. Como a homologação foi montada (registro do processo)

1. `list_projects` confirmou acesso aos dois projetos (ambos ACTIVE_HEALTHY).
2. Produção: só `SELECT` em catálogo, além de `list_extensions` e `list_migrations`.
3. 1ª aplicação falhou: assinaturas de função truncadas em 63 caracteres (coluna do tipo `name` no UNION da consulta). Corrigido relendo `pg_get_function_identity_arguments(...)::text`.
4. 2ª aplicação passou, mas a validação mostrou que todas as colunas ficaram NOT NULL: `notnull` como alias é palavra reservada no Postgres e virou `IS NOT NULL`. Corrigido relendo `attnotnull`. O script agora também emite `SET/DROP NOT NULL` explícito por coluna, para convergir mesmo se a tabela já existir.
5. A homologação foi limpa (DROP do schema `app`, das tabelas e funções de `public`, do event trigger e do registro da migração) e o script corrigido foi aplicado do zero: **sucesso**. Fica um único registro em `supabase_migrations`: `base_producao_2026_11_24`.
6. Teste de idempotência: o script inteiro rodou de novo sobre a homologação já montada dentro de `BEGIN … ROLLBACK`, **sem erro**.

Arquivos auxiliares: `raw/prod_catalog.json` (catálogo bruto, sem dados), `tools/gerar_sql.py`, `tools/validacao.sql` (fingerprint para comparar projetos), `tools/validacao_detalhe.sql`, `tools/extra_check.sql`.
