# Correção mínima de segurança — testes na homologação

- **Data:** 24/11/2026, entre 17:45 e 17:55 (horário de Brasília)
- **Ambiente:** só a HOMOLOGAÇÃO `zqjgruwmqomgguxoxiuv`, com o esquema idêntico ao da produção (migração `base_producao_2026_11_24`) e dados **fictícios** (`testes/seed_homolog.sql`). Nada foi aplicado na produção.
- **Como:** chamadas HTTP reais com a anon key da homologação (`/rest/v1`, `/rest/v1/rpc`, `/auth/v1/token`), reproduzindo as chamadas do app em `origin/main` @ 8d408b6: core.js, qr.html, os_rep.js, pcm_sap.js, estoque.js, diesel.js, frota.js, admin.js, kpis.js e offline_sync.js, incluindo o reenvio da fila por upsert `on_conflict=id` com ignore-duplicates.
- **Script dos testes:** `testes/testar_http.py antes|depois`. Resultados brutos em `testes/resultado_antes.json` e `testes/resultado_depois.json`. Os testes nunca imprimem nem salvam valores de `senha_acesso`: só registram se a coluna veio ou não.
- **Usuários de teste** (senha fictícia `Teste@2026`): TST-MEC (mecânico), TST-ENC (encarregado), TST-PCM, TST-ALM (almoxarife), TST-ENG (engenheiro), TST-ADM (admin), TST-INATIVO (pcm, desativado) e TST-LEGADO (perfil sem Auth e com PIN fictício em texto puro, como os perfis legados da produção).

## Resumo

| | Antes da correção | Depois da correção |
|---|---:|---:|
| Testes que deram o resultado esperado | **64 / 90** | **90 / 90** |
| Tabelas que anon lê por GET (de 27 em public) | 14 (todas as que estão sem RLS) | **0** (as 27 respondem 401 / 42501) |
| Objetos com algum privilégio para anon (catálogo) | 38 (28 tabelas/sequence + 10 funções) | **3** (só EXECUTE em 3 RPCs) |

As 26 falhas do "antes" são as próprias vulnerabilidades: anon lendo e alterando tudo, `senha_acesso` legível, mecânico se promovendo a admin. Também entram os 403 já conhecidos em Preventivas, `admin_auditoria`, `equipamentos_historico` e `os_pecas_previstas`. Depois da correção, todos os fluxos do app continuam funcionando.

Validações extras na homologação:
- **Idempotência:** `0001_seguranca_minima.sql` rodou duas vezes seguidas sem erro.
- **Reversão exata:** depois de `0001_seguranca_minima_reverter.sql`, o fingerprint do catálogo (`tools/validacao.sql`: colunas, constraints, índices, funções e search_path, ACL de funções, policies, triggers, ACL de tabelas e sequences, RLS) ficou **idêntico ao da produção nas 10 categorias**. Também ficaram iguais os privilégios padrão e a ACL do schema `app`. Em seguida, a correção foi reaplicada; esse é o estado final da homologação (migração `seguranca_minima_0001`).

## Resultado por teste (antes → depois)

✅ = resultado esperado para aquele momento; ❌ = falha/vulnerabilidade. Na coluna "Esperado depois", "negado" quer dizer que o certo é a API recusar.

| # | Grupo | Teste | Antes (HTTP · resultado) | Depois (HTTP · resultado) | Esperado depois |
|---|---|---|---|---|---|
| 1 | Login | anon: rpc resolver_login("TST-ADM") | ✅ 200 · tst-adm@vilasa.invalid | ✅ 200 · tst-adm@vilasa.invalid | funciona |
| 2 | Login | signInWithPassword TST-MEC | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 3 | Login | rpc meu_perfil TST-MEC | ✅ 200 · {'id': 'db50d9e8-1337-4486-82bf-22cb03e47682', 'nome': 'MECANICO TESTE | ✅ 200 · {'id': 'db50d9e8-1337-4486-82bf-22cb03e47682', 'nome': 'MECANICO TESTE | funciona |
| 4 | Login | signInWithPassword TST-ENC | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 5 | Login | rpc meu_perfil TST-ENC | ✅ 200 · {'id': '4db71a95-2238-4903-86e1-f9bf30deb47d', 'nome': 'ENCARREGADO TE | ✅ 200 · {'id': '4db71a95-2238-4903-86e1-f9bf30deb47d', 'nome': 'ENCARREGADO TE | funciona |
| 6 | Login | signInWithPassword TST-PCM | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 7 | Login | rpc meu_perfil TST-PCM | ✅ 200 · {'id': 'c8e4ad3e-b371-47bf-8a15-fc351eb7ff63', 'nome': 'PCM TESTE', 'a | ✅ 200 · {'id': 'c8e4ad3e-b371-47bf-8a15-fc351eb7ff63', 'nome': 'PCM TESTE', 'a | funciona |
| 8 | Login | signInWithPassword TST-ALM | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 9 | Login | rpc meu_perfil TST-ALM | ✅ 200 · {'id': '1d56ceb2-f349-403f-90d0-d36e0d6c4feb', 'nome': 'ALMOXARIFE TES | ✅ 200 · {'id': '1d56ceb2-f349-403f-90d0-d36e0d6c4feb', 'nome': 'ALMOXARIFE TES | funciona |
| 10 | Login | signInWithPassword TST-ENG | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 11 | Login | rpc meu_perfil TST-ENG | ✅ 200 · {'id': 'c226eb08-1049-4f44-92ca-d9de267199d1', 'nome': 'ENGENHEIRO TES | ✅ 200 · {'id': 'c226eb08-1049-4f44-92ca-d9de267199d1', 'nome': 'ENGENHEIRO TES | funciona |
| 12 | Login | signInWithPassword TST-ADM | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 13 | Login | rpc meu_perfil TST-ADM | ✅ 200 · {'id': '9c65a618-5528-4110-8fd6-1d5cbb031f71', 'nome': 'ADMIN TESTE',  | ✅ 200 · {'id': '9c65a618-5528-4110-8fd6-1d5cbb031f71', 'nome': 'ADMIN TESTE',  | funciona |
| 14 | Login | signInWithPassword usuário inativo (banido) | ✅ 500 · 500 Database error querying schema | ✅ 500 · 500 Database error querying schema | funciona |
| 15 | QR anon | rpc qr_equipamento(p_id) | ✅ 200 · {'id': '22222222-0000-0000-0000-000000000001', 'cfg': {'fixo_km': 5000 | ✅ 200 · {'id': '22222222-0000-0000-0000-000000000001', 'cfg': {'fixo_km': 5000 | funciona |
| 16 | QR anon | rpc qr_equipamento(p_tag) (etiqueta antiga) | ✅ 200 · {'id': '22222222-0000-0000-0000-000000000002', 'cfg': {'fixo_km': 5000 | ✅ 200 · {'id': '22222222-0000-0000-0000-000000000002', 'cfg': {'fixo_km': 5000 | funciona |
| 17 | QR anon | rpc lancar_horimetro (leitura +1h) | ✅ 200 · {'ok': True, 'horimetro_atual': 1014.0} | ✅ 200 · {'ok': True, 'horimetro_atual': 1028.0} | funciona |
| 18 | Fila offline | reenvio RPC lancar_horimetro mesmo p_id (anon) | ✅ 200 · {'ok': True, 'duplicado': True} | ✅ 200 · {'ok': True, 'duplicado': True} | funciona |
| 19 | Anon direto | GET perfis_usuarios?select=* | ❌ 200 · {'linhas': 10, 'senha_acesso_exposta': True} | ✅ 401 · 42501 permission denied for table perfis_usuarios | negado |
| 20 | Anon direto | GET equipamentos | ❌ 200 · 5 linha(s) | ✅ 401 · 42501 permission denied for table equipamentos | negado |
| 21 | Anon direto | GET ordens_servico | ❌ 200 · 5 linha(s) | ✅ 401 · 42501 permission denied for table ordens_servico | negado |
| 22 | Anon direto | GET configuracoes_sistema | ❌ 200 · 1 linha(s) | ✅ 401 · 42501 permission denied for table configuracoes_sistema | negado |
| 23 | Anon direto | GET diario_horimetro | ❌ 200 · 3 linha(s) | ✅ 401 · 42501 permission denied for table diario_horimetro | negado |
| 24 | Anon direto | GET pecas_estoque | ❌ 200 · 2 linha(s) | ✅ 401 · 42501 permission denied for table pecas_estoque | negado |
| 25 | Anon direto | GET preventiva_estrategias | ✅ 401 · 42501 permission denied for table preventiva_estrategias | ✅ 401 · 42501 permission denied for table preventiva_estrategias | negado |
| 26 | Anon direto | GET diesel_abastecimentos | ✅ 401 · 42501 permission denied for table diesel_abastecimentos | ✅ 401 · 42501 permission denied for table diesel_abastecimentos | negado |
| 27 | Anon direto | POST ordens_servico (anon cria OS) | ❌ 201 ·  | ✅ 401 · 42501 permission denied for table ordens_servico | negado |
| 28 | Anon direto | PATCH equipamentos (anon altera) | ❌ 200 · 1 linha(s) | ✅ 401 · 42501 permission denied for table equipamentos | negado |
| 29 | Anon direto | PATCH perfis_usuarios (anon altera usuário) | ❌ 200 · 1 linha(s) | ✅ 401 · 42501 permission denied for table perfis_usuarios | negado |
| 30 | Anon direto | DELETE itens_os_estoque (filtro inexistente) | ❌ 204 ·  | ✅ 401 · 42501 permission denied for table itens_os_estoque | negado |
| 31 | Anon direto | rpc os_assumir (anon) | ✅ 401 · 42501 permission denied for function os_assumir | ✅ 401 · 42501 permission denied for function os_assumir | negado |
| 32 | Anon direto | rpc admin_salvar_usuario (anon) | ✅ 401 · 42501 permission denied for function admin_salvar_usuario | ✅ 401 · 42501 permission denied for function admin_salvar_usuario | negado |
| 33 | Perfis | mecânico: lista de perfis (colunas do os_rep.js/admin.js) | ✅ 200 · 10 linha(s) | ✅ 200 · 12 linha(s) | funciona |
| 34 | Perfis | mecânico: GET perfis_usuarios?select=senha_acesso | ❌ 200 · {'linhas': 10} | ✅ 403 · 42501 permission denied for table perfis_usuarios | negado |
| 35 | Perfis | admin: GET perfis_usuarios?select=* | ❌ 200 · {'linhas': 10, 'senha_acesso_exposta': True} | ✅ 403 · 42501 permission denied for table perfis_usuarios | negado |
| 36 | OS | mecânico: abrir OS (INSERT ordens_servico) | ✅ 201 · 1 linha(s) | ✅ 201 · 1 linha(s) | funciona |
| 37 | Fila offline | reenvio INSERT ordens_servico (upsert on_conflict=id ignore-duplicates) | ✅ 201 ·  | ✅ 201 ·  | funciona |
| 38 | Fila offline | sem OS duplicada após reenvio | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 39 | OS | mecânico: rpc os_assumir | ✅ 200 · {'ok': True, 'mecanico_nome': 'MECANICO TESTE'} | ✅ 200 · {'ok': True, 'mecanico_nome': 'MECANICO TESTE'} | funciona |
| 40 | Fila offline | mecânico: UPDATE ordens_servico por id (como a fila) | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 41 | Fila offline | HORIMETRO_MAX: UPDATE equipamentos com filtro lt | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 42 | OS | mecânico: listar OS | ✅ 200 · 5 linha(s) | ✅ 200 · 5 linha(s) | funciona |
| 43 | OS | mecânico: ler movimentações (os_rep.js) | ✅ 200 · 5 linha(s) | ✅ 200 · 5 linha(s) | funciona |
| 44 | OS | almoxarife: rpc os_assumir (regra da função) | ✅ 403 · 42501 SEM_PERMISSAO: só mecânico, PCM, engenharia ou admin assumem OS. | ✅ 403 · 42501 SEM_PERMISSAO: só mecânico, PCM, engenharia ou admin assumem OS. | negado |
| 45 | Preventivas | pcm: GET preventiva_estrategias | ❌ 403 · 42501 permission denied for table preventiva_estrategias | ✅ 200 · 2 linha(s) | funciona |
| 46 | Preventivas | pcm: GET preventiva_pacotes | ❌ 403 · 42501 permission denied for table preventiva_pacotes | ✅ 200 · 1 linha(s) | funciona |
| 47 | Preventivas | pcm: GET preventiva_listas | ❌ 403 · 42501 permission denied for table preventiva_listas | ✅ 200 · 1 linha(s) | funciona |
| 48 | Preventivas | pcm: GET preventiva_lista_tarefas | ❌ 403 · 42501 permission denied for table preventiva_lista_tarefas | ✅ 200 · 1 linha(s) | funciona |
| 49 | Preventivas | pcm: GET preventiva_lista_materiais | ❌ 403 · 42501 permission denied for table preventiva_lista_materiais | ✅ 200 · 1 linha(s) | funciona |
| 50 | Preventivas | pcm: criar estratégia (INSERT) | ❌ 403 · 42501 permission denied for table preventiva_estrategias | ✅ 201 · 1 linha(s) | funciona |
| 51 | Preventivas | pcm: criar pacote (INSERT) | ❌ 403 · 42501 permission denied for table preventiva_pacotes | ✅ 201 ·  | funciona |
| 52 | Preventivas | pcm: editar estratégia (UPDATE) | ❌ 403 · 42501 permission denied for table preventiva_estrategias | ✅ 200 · 1 linha(s) | funciona |
| 53 | Preventivas | pcm: apagar pacotes (DELETE) | ❌ 403 · 42501 permission denied for table preventiva_pacotes | ✅ 200 · 1 linha(s) | funciona |
| 54 | Preventivas | mecânico: criar estratégia (policy só pcm/eng/admin) | ✅ 403 · 42501 permission denied for table preventiva_estrategias | ✅ 403 · 42501 new row violates row-level security policy for table "preventiva | negado |
| 55 | Preventivas | pcm: UPDATE planos_preventiva | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 56 | Preventivas | pcm: INSERT execucoes_preventiva | ✅ 201 ·  | ✅ 201 ·  | funciona |
| 57 | Preventivas | pcm: rpc preventiva_gerar_os(plano) | ✅ 200 · {'ok': True, 'geradas': 0} | ✅ 200 · {'ok': True, 'geradas': 0} | funciona |
| 58 | Preventivas | pcm: GET os_pecas_previstas | ❌ 403 · 42501 permission denied for table os_pecas_previstas | ✅ 200 · 1 linha(s) | funciona |
| 59 | KPIs | engenheiro: GET execucoes_preventiva | ✅ 200 · 3 linha(s) | ✅ 200 · 5 linha(s) | funciona |
| 60 | KPIs | engenheiro: GET planos_preventiva | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 61 | KPIs | engenheiro: GET diario_horimetro | ✅ 200 · 3 linha(s) | ✅ 200 · 5 linha(s) | funciona |
| 62 | Estoque | almoxarife: rpc almox_movimentar ENTRADA_NF | ✅ 200 · {'ok': True, 'custo': 50.0, 'saldo_apos': 27} | ✅ 200 · {'ok': True, 'custo': 50.0, 'saldo_apos': 31} | funciona |
| 63 | Fila offline | reenvio RPC almox_movimentar mesmo id | ✅ 200 · {'ok': True, 'duplicado': True} | ✅ 200 · {'ok': True, 'duplicado': True} | funciona |
| 64 | Estoque | almoxarife: UPDATE pecas_estoque (códigos paralelos) | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 65 | Estoque | almoxarife: INSERT pecas_estoque | ✅ 201 ·  | ✅ 201 ·  | funciona |
| 66 | Estoque | almoxarife: DELETE pecas_estoque | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 67 | Estoque | mecânico: rpc almox_movimentar (regra da função) | ✅ 403 · 42501 SEM_PERMISSAO: só o almoxarife ou a engenharia lançam movimentos | ✅ 403 · 42501 SEM_PERMISSAO: só o almoxarife ou a engenharia lançam movimentos | negado |
| 68 | Diesel | pcm: GET diesel_tanques | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 69 | Diesel | pcm: GET diesel_abastecimentos | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 70 | Diesel | pcm: UPDATE diesel_abastecimentos | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 71 | Diesel | pcm: rpc diesel_vincular_equipamentos | ✅ 200 · 0 | ✅ 200 · 0 | funciona |
| 72 | Diesel | pcm: rpc diesel_sincronizar_leituras | ✅ 200 · {'aceitas': 0, 'ja_existiam': 0, 'recusadas_so_consumo': 0} | ✅ 200 · {'aceitas': 0, 'ja_existiam': 0, 'recusadas_so_consumo': 0} | funciona |
| 73 | Diesel | mecânico: GET diesel_abastecimentos (perfil ativo lê) | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 74 | Frota | pcm: INSERT equipamentos | ✅ 201 · 1 linha(s) | ✅ 201 · 1 linha(s) | funciona |
| 75 | Frota | pcm: UPDATE equipamentos | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 76 | Frota | pcm: rpc corrigir_leitura | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 77 | Frota | mecânico: GET obras ativas (core.js) | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 78 | Admin | admin: rpc admin_salvar_usuario (novo) | ✅ 200 · 6266a269-8b39-4b79-840c-55585a207552 | ✅ 200 · 7df01b17-b9fc-488a-b746-7843f5fbf712 | funciona |
| 79 | Admin | login do usuário recém-criado (resolver_login + senha) | ✅ 200 · {'ok': True} | ✅ 200 · {'ok': True} | funciona |
| 80 | Admin | admin: rpc admin_definir_ativo(false) | ✅ 204 ·  | ✅ 204 ·  | funciona |
| 81 | Admin | login do usuário desativado é recusado | ✅ 500 · 500 Database error querying schema | ✅ 500 · 500 Database error querying schema | funciona |
| 82 | Admin | admin: rpc admin_definir_ativo(true) | ✅ 204 ·  | ✅ 204 ·  | funciona |
| 83 | Admin | admin: rpc admin_salvar_usuario (editar) | ✅ 200 · 6266a269-8b39-4b79-840c-55585a207552 | ✅ 200 · 7df01b17-b9fc-488a-b746-7843f5fbf712 | funciona |
| 84 | Admin | admin: INSERT admin_auditoria (admin.js) | ❌ 403 · 42501 permission denied for table admin_auditoria | ✅ 201 ·  | funciona |
| 85 | Admin | admin: GET admin_auditoria | ❌ 403 · 42501 permission denied for table admin_auditoria | ✅ 200 · 2 linha(s) | funciona |
| 86 | Admin | admin: lista de usuários (admin.js) | ✅ 200 · 11 linha(s) | ✅ 200 · 13 linha(s) | funciona |
| 87 | Admin | admin: editor mestre UPDATE obras | ✅ 200 · 1 linha(s) | ✅ 200 · 1 linha(s) | funciona |
| 88 | Admin | pcm: rpc admin_salvar_usuario (regra da função) | ✅ 403 · 42501 Apenas administradores podem gerenciar usuários. | ✅ 403 · 42501 Apenas administradores podem gerenciar usuários. | negado |
| 89 | Admin | admin: GET equipamentos_historico (frota.js) | ❌ 403 · 42501 permission denied for table equipamentos_historico | ✅ 200 · 5 linha(s) | funciona |
| 90 | Perfis | mecânico: PATCH próprio perfil virando admin | ❌ 200 · 1 linha(s) | ✅ 403 · 42501 permission denied for table perfis_usuarios | negado |

## O que a anon key ainda consegue fazer depois da correção

Conferido de três formas: pelo catálogo (`testes/anon_catalogo_depois.json`), por GET em todas as tabelas (`testes/anon_http_depois.json`) e pelos testes acima.

| Objeto | Acesso anon | Observação |
|---|---|---|
| `rpc/resolver_login(p_texto)` | EXECUTE | Recebe matrícula ou nome e devolve o e-mail técnico de login (`…@vilasa.invalid`) se houver exatamente 1 perfil ativo com Auth. Permite enumerar logins válidos, mas é necessário para a tela de login. |
| `rpc/qr_equipamento(p_id, p_tag)` | EXECUTE | Devolve id, tag, nome, unidade, horímetro atual, obra_id, data da última leitura e os limites de salto. Aceita busca por tag. Quando o QR passar a ser só por id (etapa 1), dá para tirar a busca por tag. |
| `rpc/lancar_horimetro(...)` | EXECUTE | Grava leitura no diário e atualiza o horímetro, com as validações de leitura menor e salto alto e idempotência por `p_id`. Qualquer pessoa com a URL pode lançar leitura válida em qualquer máquina; o risco é aceito no desenho atual do portal QR. |
| Todas as 27 tabelas de `public`, a sequence e as 2 tabelas de `app` | **nenhum** | GET/POST/PATCH/DELETE respondem 401 (42501). |
| Demais RPCs (`os_assumir`, `admin_*`, `almox_movimentar`, `preventiva_gerar_os`, `importar_leituras`, `recalcular_horimetro_atual`, `corrigir_leitura`, `diesel_*`, `meu_perfil`) | **nenhum** | "permission denied for function". |
| Funções `app.*` | **nenhum** | anon perdeu também o USAGE no schema `app`. |
| `/auth/v1/token` (login) e `/auth/v1/signup` | padrão do Supabase Auth | Não muda com SQL. Recomendo conferir no painel se o **cadastro público (signup) está desligado**. Uma conta criada por signup não tem perfil, então `app.perfil_ativo()` dá falso e ela não acessa nada; mesmo assim, o melhor é desligar. |

## Formato de `senha_acesso` na PRODUÇÃO (uma consulta só de agregados, nenhum valor lido nem salvo)

| total | não nulos | marcador `!auth` (migrado p/ Auth) | bcrypt | argon2 | crypt $1/$5/$6 | hex 32/40/64 | só dígitos | outros formatos | tamanho (sem `!auth`) | com `auth_user_id` |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 25 | 25 | 9 | 0 | 0 | 0 | 0 | 16 | 16 | mín. 4 / máx. 4 | 9 |

**Conclusão:** 16 perfis legados guardam a senha **em texto puro**, como PIN de 4 dígitos (nenhum hash). Os 9 perfis que já usam o Supabase Auth têm só o marcador `!auth`; a senha real deles fica no `auth.users` em bcrypt. Hoje esses 16 PINs estão legíveis por qualquer pessoa com a anon key. Esses perfis legados não conseguem mais entrar (o `resolver_login` exige `auth_user_id`), então o PIN não tem mais uso. Recomendação, que depende de aprovação porque altera dados: depois da correção, sobrescrever `senha_acesso` desses 16 com `!auth` (ou criar o usuário Auth para quem ainda trabalha) e trocar o PIN de quem reutiliza esse número em outro lugar.

## Observações dos testes (comportamento já existente, sem relação com a correção)
- Login de usuário desativado (`banned_until = 'infinity'`, gravado por `admin_definir_ativo`/`admin_salvar_usuario`) retorna **HTTP 500 "Database error querying schema"** no Supabase Auth, em vez de "usuário banido". O acesso continua bloqueado, mas o app mostra um erro genérico. Causa provável: o Auth não lê o valor `infinity`. Sugestão para outra etapa: usar uma data distante (ex.: `2999-12-31`).
- Advisor de segurança da homologação depois da correção: restam só os avisos esperados (3 RPCs SECURITY DEFINER executáveis por anon e as RPCs SECURITY DEFINER para authenticated, que conferem o cargo por dentro) e "Leaked Password Protection Disabled", que é configuração do Auth no painel.
