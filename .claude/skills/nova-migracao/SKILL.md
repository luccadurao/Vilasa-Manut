---
name: nova-migracao
description: Cria uma migração SQL nova no padrão do Vilasa-Manut (arquivo numerado, reversão, teste SQL, registro em migracoes_aplicadas) e a testa na homologação. Use quando a tarefa exigir mudar o banco.
argument-hint: "[o que a migração faz]"
---
Crie a migração para: $ARGUMENTS

Leia antes `CLAUDE.md` (regra 4) e a migração mais recente em `banco/migracoes/`
para copiar o estilo (cabeçalho, blocos `DO $$`, registro no fim).

## Passos

1. **Número.** Pegue o maior `NNNN` em `banco/migracoes/` e some 1.
   Nome: `NNNN_<assunto_em_snake_case>.sql`.
2. **Cabeçalho** do arquivo, em comentário: o que faz, pré-requisito (última
   migração), se é idempotente, o que NÃO faz de propósito.
3. **Corpo**, sempre idempotente:
   - `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
     `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`,
     `INSERT ... ON CONFLICT DO NOTHING`;
   - policy: `DROP POLICY IF EXISTS` + `CREATE POLICY` só dentro do mesmo arquivo,
     para a policy que o próprio arquivo cria;
   - tabela de negócio: `empresa_id uuid not null default app.empresa_atual()
     references public.empresas(id)`, índice em `empresa_id`, RLS ligado,
     policy por empresa usando `(select app.empresa_atual())`, sem grant a `anon`;
   - função `SECURITY DEFINER`: `SET search_path = ''`, nomes com schema,
     `PERFORM app.exigir('<modulo>.<acao>');` no início, `REVOKE ALL ... FROM
     PUBLIC, anon` e `GRANT EXECUTE ... TO authenticated`.
4. **Registro** no fim do arquivo, como nas anteriores:
   `INSERT INTO public.migracoes_aplicadas (escopo, modulo_id, arquivo, checksum, aplicado_por) VALUES (...) ON CONFLICT (escopo, arquivo) DO NOTHING;`
5. **Reversão** em `banco/migracoes/reverter/NNNN_<assunto>_reverter.sql`:
   desfaz só o que este arquivo criou, também idempotente, e apaga a linha de
   `migracoes_aplicadas`.
6. **Teste** em `banco/docs/testes_NNNN.sql`: bloco `DO $$` só com `SELECT` e
   `RAISE EXCEPTION` quando algo divergir; termina com
   `SELECT 'testes_NNNN ok' AS resultado;`. Cubra o caminho feliz e os bloqueios
   (anon, cargo sem permissão, outra empresa).
7. **Permissão nova?** Declare no manifesto do módulo e semeie em `permissoes` e
   `cargo_permissoes` nesta mesma migração.
8. **Revisão.** Chame o subagente `revisor-banco` e corrija o que ele apontar.
9. **Homologação.** Peça aprovação ao Lucca em uma frase ("Vou aplicar a NNNN no
   banco de homologação, que cria X"). Só depois da aprovação, aplique no projeto
   `zqjgruwmqomgguxoxiuv`, rode o teste, aplique a migração de novo (para provar a
   idempotência) e rode o teste outra vez. Registre o resultado no PR.
10. **Produção:** nunca. Escreva no PR a ordem segura (SQL antes ou depois do
    front) para o Lucca aplicar quando decidir.
