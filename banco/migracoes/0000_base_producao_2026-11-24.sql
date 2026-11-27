-- =============================================================================
-- Vilasa-Manut — migração base (esquema da produção)
-- Origem: Supabase PRODUÇÃO "Painel de Manutenção" (project ref yoignpytyegagpfuvoxu),
--         Postgres 17, extraído por consultas somente de catálogo
--         (pg_catalog / information_schema / pg_get_*def). Nenhuma linha de dados lida.
-- Data da extração: 2026-11-24 (America/Sao_Paulo)
-- Conteúdo: SOMENTE ESQUEMA, SEM DADOS.
-- Schemas incluídos: public, app. Não incluídos: auth, storage, realtime, extensions,
--   vault, graphql, graphql_public, supabase_migrations (gerenciados pelo Supabase).
-- Dependências do schema auth (gerenciado pelo Supabase, já existe em todo projeto):
--   * FK public.perfis_usuarios.auth_user_id -> auth.users(id) ON DELETE SET NULL
--   * funções que chamam auth.uid() e app.criar_auth_user / admin_* que escrevem em
--     auth.users / auth.identities (SECURITY DEFINER, dono postgres)
--   * nenhum trigger próprio em tabelas de auth.
-- Estado de RLS por tabela reproduzido exatamente como na produção (ENABLE/DISABLE
-- explícito), inclusive tabelas com RLS DESLIGADO.
-- Idempotente na medida do possível: IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS antes de CREATE para triggers e policies.
-- Gerado por tools/gerar_sql.py.
-- =============================================================================

SET check_function_bodies = off;
SET client_min_messages = warning;
SET search_path = public, extensions;

-- 1. Extensões (as mesmas instaladas na produção; já vêm por padrão no Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;

-- 2. Schemas
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA app TO anon, authenticated;
-- (produção: app = postgres=UC, anon=U, authenticated=U; public = padrão Supabase)

-- 3. Tipos/enums próprios: nenhum na produção (public/app)

-- 4. Sequences
CREATE SEQUENCE IF NOT EXISTS public.ordens_servico_numero_os_seq AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1;

-- 5. Tabelas (colunas, tipos e NOT NULL; defaults, constraints e índices vêm depois)
CREATE TABLE IF NOT EXISTS app._bkp_equipamentos_20261112 (
    id uuid,
    tag text,
    nome text,
    marca text,
    modelo text,
    unidade_medida text,
    horimetro_atual numeric,
    obra_id uuid,
    propriedade text,
    situacao_ciclo text,
    numero_serie text,
    placa text,
    ano_fabricacao text,
    horimetro_atualizado_em timestamp with time zone
);
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS unidade_medida text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS horimetro_atual numeric;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS propriedade text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS situacao_ciclo text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS numero_serie text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS placa text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS ano_fabricacao text;
ALTER TABLE app._bkp_equipamentos_20261112 ADD COLUMN IF NOT EXISTS horimetro_atualizado_em timestamp with time zone;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN id DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN tag DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN marca DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN modelo DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN unidade_medida DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN horimetro_atual DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN obra_id DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN propriedade DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN situacao_ciclo DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN numero_serie DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN ano_fabricacao DROP NOT NULL;
ALTER TABLE app._bkp_equipamentos_20261112 ALTER COLUMN horimetro_atualizado_em DROP NOT NULL;

CREATE TABLE IF NOT EXISTS app._bkp_merge_equip_20261112 (
    perdedor uuid,
    vencedor uuid,
    linha jsonb
);
ALTER TABLE app._bkp_merge_equip_20261112 ADD COLUMN IF NOT EXISTS perdedor uuid;
ALTER TABLE app._bkp_merge_equip_20261112 ADD COLUMN IF NOT EXISTS vencedor uuid;
ALTER TABLE app._bkp_merge_equip_20261112 ADD COLUMN IF NOT EXISTS linha jsonb;
ALTER TABLE app._bkp_merge_equip_20261112 ALTER COLUMN perdedor DROP NOT NULL;
ALTER TABLE app._bkp_merge_equip_20261112 ALTER COLUMN vencedor DROP NOT NULL;
ALTER TABLE app._bkp_merge_equip_20261112 ALTER COLUMN linha DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_auditoria (
    id uuid NOT NULL,
    tabela text NOT NULL,
    registro_id text,
    acao text NOT NULL,
    antes jsonb,
    depois jsonb,
    usuario_auth uuid,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS tabela text;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS registro_id text;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS acao text;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS antes jsonb;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS depois jsonb;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS usuario_auth uuid;
ALTER TABLE public.admin_auditoria ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.admin_auditoria ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN tabela SET NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN registro_id DROP NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN acao SET NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN antes DROP NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN depois DROP NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN usuario_auth DROP NOT NULL;
ALTER TABLE public.admin_auditoria ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.apontamentos_os (
    id uuid NOT NULL,
    os_id uuid NOT NULL,
    mecanico_id uuid,
    acao text NOT NULL,
    motivo text,
    registrado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS mecanico_id uuid;
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS acao text;
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE public.apontamentos_os ADD COLUMN IF NOT EXISTS registrado_em timestamp with time zone;
ALTER TABLE public.apontamentos_os ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.apontamentos_os ALTER COLUMN os_id SET NOT NULL;
ALTER TABLE public.apontamentos_os ALTER COLUMN mecanico_id DROP NOT NULL;
ALTER TABLE public.apontamentos_os ALTER COLUMN acao SET NOT NULL;
ALTER TABLE public.apontamentos_os ALTER COLUMN motivo DROP NOT NULL;
ALTER TABLE public.apontamentos_os ALTER COLUMN registrado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
    id integer NOT NULL,
    pin_operacao text NOT NULL,
    delta_maximo_horimetro numeric NOT NULL,
    updated_at timestamp with time zone,
    limite_salto_horas numeric NOT NULL,
    limite_salto_km numeric NOT NULL,
    limite_km_dia numeric NOT NULL,
    tolerancia_horas numeric NOT NULL
);
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS id integer;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS pin_operacao text;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS delta_maximo_horimetro numeric;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS limite_salto_horas numeric;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS limite_salto_km numeric;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS limite_km_dia numeric;
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS tolerancia_horas numeric;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN pin_operacao SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN delta_maximo_horimetro SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN updated_at DROP NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_salto_horas SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_salto_km SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_km_dia SET NOT NULL;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN tolerancia_horas SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.diario_horimetro (
    id uuid NOT NULL,
    equipamento_id uuid NOT NULL,
    leitura numeric NOT NULL,
    operador_nome text,
    registrado_em timestamp with time zone,
    medidor text NOT NULL,
    origem text,
    motivo text
);
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS leitura numeric;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS operador_nome text;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS registrado_em timestamp with time zone;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS medidor text;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.diario_horimetro ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE public.diario_horimetro ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN leitura SET NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN operador_nome DROP NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN registrado_em DROP NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN medidor SET NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN origem DROP NOT NULL;
ALTER TABLE public.diario_horimetro ALTER COLUMN motivo DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.diesel_abastecimentos (
    id uuid NOT NULL,
    tanque_id uuid,
    data date NOT NULL,
    hora time without time zone,
    frota_texto text,
    chave_tag text,
    equipamento_id uuid,
    litros numeric NOT NULL,
    horimetro numeric,
    odometro numeric,
    encerrante_ini numeric,
    encerrante_fim numeric,
    transferencia boolean NOT NULL,
    suspeito boolean NOT NULL,
    motivo_suspeito text,
    fonte text NOT NULL,
    chave_externa text NOT NULL,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS tanque_id uuid;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS hora time without time zone;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS frota_texto text;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS chave_tag text;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS litros numeric;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS horimetro numeric;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS odometro numeric;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS encerrante_ini numeric;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS encerrante_fim numeric;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS transferencia boolean;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS suspeito boolean;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS motivo_suspeito text;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS chave_externa text;
ALTER TABLE public.diesel_abastecimentos ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN tanque_id DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN data SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN hora DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN frota_texto DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN chave_tag DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN equipamento_id DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN litros SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN horimetro DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN odometro DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN encerrante_ini DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN encerrante_fim DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN transferencia SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN suspeito SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN motivo_suspeito DROP NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN fonte SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN chave_externa SET NOT NULL;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.diesel_carregamentos (
    id uuid NOT NULL,
    tanque_id uuid NOT NULL,
    data date NOT NULL,
    litros numeric NOT NULL,
    preco_litro numeric,
    custo_total numeric,
    nota_fiscal text,
    fornecedor text,
    fonte text NOT NULL,
    chave_externa text NOT NULL,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS tanque_id uuid;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS litros numeric;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS preco_litro numeric;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS custo_total numeric;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS nota_fiscal text;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS chave_externa text;
ALTER TABLE public.diesel_carregamentos ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN tanque_id SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN data SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN litros SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN preco_litro DROP NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN custo_total DROP NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN nota_fiscal DROP NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN fornecedor DROP NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN fonte SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN chave_externa SET NOT NULL;
ALTER TABLE public.diesel_carregamentos ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.diesel_estoque_diario (
    tanque_id uuid NOT NULL,
    data date NOT NULL,
    estoque_inicial numeric,
    carregamentos numeric,
    transferencias numeric,
    abastecido numeric,
    final_teorico numeric,
    final_fisico numeric,
    dispersao numeric
);
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS tanque_id uuid;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS estoque_inicial numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS carregamentos numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS transferencias numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS abastecido numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS final_teorico numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS final_fisico numeric;
ALTER TABLE public.diesel_estoque_diario ADD COLUMN IF NOT EXISTS dispersao numeric;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN tanque_id SET NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN data SET NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN estoque_inicial DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN carregamentos DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN transferencias DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN abastecido DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN final_teorico DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN final_fisico DROP NOT NULL;
ALTER TABLE public.diesel_estoque_diario ALTER COLUMN dispersao DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.diesel_tanques (
    id uuid NOT NULL,
    codigo text NOT NULL,
    nome text,
    tipo text NOT NULL,
    capacidade_l numeric,
    ativo boolean NOT NULL,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS capacidade_l numeric;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS ativo boolean;
ALTER TABLE public.diesel_tanques ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.diesel_tanques ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN capacidade_l DROP NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN ativo SET NOT NULL;
ALTER TABLE public.diesel_tanques ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.equipamentos (
    id uuid NOT NULL,
    tag text NOT NULL,
    nome text NOT NULL,
    marca text,
    modelo text,
    unidade_medida text,
    horimetro_atual numeric,
    obra_id uuid,
    propriedade text,
    situacao_ciclo text,
    numero_serie text,
    placa text,
    ano_fabricacao text,
    horimetro_atualizado_em timestamp with time zone,
    km_atual numeric,
    km_atualizado_em timestamp with time zone
);
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS unidade_medida text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS horimetro_atual numeric;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS propriedade text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS situacao_ciclo text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS numero_serie text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS placa text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS ano_fabricacao text;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS horimetro_atualizado_em timestamp with time zone;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS km_atual numeric;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS km_atualizado_em timestamp with time zone;
ALTER TABLE public.equipamentos ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN tag SET NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN marca DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN modelo DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN unidade_medida DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN horimetro_atual DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN obra_id DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN propriedade DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN situacao_ciclo DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN numero_serie DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN ano_fabricacao DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN horimetro_atualizado_em DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN km_atual DROP NOT NULL;
ALTER TABLE public.equipamentos ALTER COLUMN km_atualizado_em DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.equipamentos_historico (
    id uuid NOT NULL,
    equipamento_id uuid NOT NULL,
    campo text NOT NULL,
    valor_antigo text,
    valor_novo text,
    alterado_por uuid,
    alterado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS campo text;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS valor_antigo text;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS valor_novo text;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS alterado_por uuid;
ALTER TABLE public.equipamentos_historico ADD COLUMN IF NOT EXISTS alterado_em timestamp with time zone;
ALTER TABLE public.equipamentos_historico ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN campo SET NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN valor_antigo DROP NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN valor_novo DROP NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN alterado_por DROP NOT NULL;
ALTER TABLE public.equipamentos_historico ALTER COLUMN alterado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.execucoes_preventiva (
    id uuid NOT NULL,
    plano_id uuid,
    equipamento_id uuid NOT NULL,
    pacote text NOT NULL,
    status text,
    parada_obrigatoria boolean,
    data_entrada timestamp with time zone,
    data_conclusao timestamp with time zone,
    horimetro_execucao numeric,
    mecanicos_nomes text,
    observacoes text,
    origem text NOT NULL
);
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS plano_id uuid;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS pacote text;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS parada_obrigatoria boolean;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS data_entrada timestamp with time zone;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS data_conclusao timestamp with time zone;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS horimetro_execucao numeric;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS mecanicos_nomes text;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.execucoes_preventiva ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN plano_id DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN pacote SET NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN parada_obrigatoria DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN data_entrada DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN data_conclusao DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN horimetro_execucao DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN mecanicos_nomes DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN observacoes DROP NOT NULL;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN origem SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.itens_os_estoque (
    id uuid NOT NULL,
    peca_id uuid,
    os_id uuid,
    tipo_movimento text NOT NULL,
    quantidade numeric NOT NULL,
    custo_unitario_congelado numeric NOT NULL,
    status_baixa text NOT NULL,
    solicitado_por uuid,
    confirmado_por uuid,
    created_at timestamp with time zone NOT NULL,
    nota_fiscal text,
    fornecedor text,
    equipamento_id uuid,
    observacao text,
    estocavel boolean,
    descricao_livre text,
    part_number_nf text
);
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS peca_id uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS tipo_movimento text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS custo_unitario_congelado numeric;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS status_baixa text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS solicitado_por uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS confirmado_por uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS created_at timestamp with time zone;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS nota_fiscal text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS estocavel boolean;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS descricao_livre text;
ALTER TABLE public.itens_os_estoque ADD COLUMN IF NOT EXISTS part_number_nf text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN peca_id DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN os_id DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN tipo_movimento SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN quantidade SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN custo_unitario_congelado SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN status_baixa SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN solicitado_por DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN confirmado_por DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN nota_fiscal DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN fornecedor DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN equipamento_id DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN observacao DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN estocavel DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN descricao_livre DROP NOT NULL;
ALTER TABLE public.itens_os_estoque ALTER COLUMN part_number_nf DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.lotes_estoque (
    id uuid NOT NULL,
    peca_id uuid NOT NULL,
    nota_fiscal text NOT NULL,
    fornecedor text,
    quantidade_inicial numeric NOT NULL,
    quantidade_restante numeric NOT NULL,
    custo_unitario_real numeric NOT NULL,
    data_entrada timestamp with time zone NOT NULL
);
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS peca_id uuid;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS nota_fiscal text;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS quantidade_inicial numeric;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS quantidade_restante numeric;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS custo_unitario_real numeric;
ALTER TABLE public.lotes_estoque ADD COLUMN IF NOT EXISTS data_entrada timestamp with time zone;
ALTER TABLE public.lotes_estoque ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN peca_id SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN nota_fiscal SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN fornecedor DROP NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN quantidade_inicial SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN quantidade_restante SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN custo_unitario_real SET NOT NULL;
ALTER TABLE public.lotes_estoque ALTER COLUMN data_entrada SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.movimentacoes_almoxarifado (
    id uuid NOT NULL,
    obra_id uuid,
    tipo_movimento text NOT NULL,
    numero_nf text,
    fornecedor text,
    peca_id uuid,
    descricao_item text NOT NULL,
    quantidade numeric NOT NULL,
    valor_unitario numeric,
    equipamento_id uuid,
    observacao text,
    registrado_em timestamp with time zone,
    os_id uuid,
    retirado_por text,
    motivo text,
    saldo_apos numeric,
    criado_por uuid,
    carga text
);
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS tipo_movimento text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS peca_id uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS descricao_item text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS valor_unitario numeric;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS registrado_em timestamp with time zone;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS retirado_por text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS saldo_apos numeric;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.movimentacoes_almoxarifado ADD COLUMN IF NOT EXISTS carga text;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN obra_id DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN tipo_movimento SET NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN numero_nf DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN fornecedor DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN peca_id DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN descricao_item SET NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN quantidade SET NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN valor_unitario DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN equipamento_id DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN observacao DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN registrado_em DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN os_id DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN retirado_por DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN motivo DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN saldo_apos DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN criado_por DROP NOT NULL;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN carga DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.notas_fora_do_custo (
    id uuid NOT NULL,
    carga text NOT NULL,
    data date NOT NULL,
    numero_nf text,
    fornecedor text,
    categoria text NOT NULL,
    tipo text,
    descricao text,
    valor numeric NOT NULL,
    equipamento_texto text,
    aba_origem text,
    observacao text,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS carga text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS valor numeric;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS equipamento_texto text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS aba_origem text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.notas_fora_do_custo ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN carga SET NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN data SET NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN numero_nf DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN fornecedor DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN categoria SET NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN tipo DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN descricao DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN valor SET NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN equipamento_texto DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN aba_origem DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN observacao DROP NOT NULL;
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.obras (
    id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativa boolean
);
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS ativa boolean;
ALTER TABLE public.obras ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.obras ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE public.obras ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.obras ALTER COLUMN ativa DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.ordens_servico (
    id uuid NOT NULL,
    numero_os integer NOT NULL,
    equipamento_id uuid NOT NULL,
    obra_id uuid,
    status text,
    motivo_rep text,
    local_manutencao_pcm text,
    descricao_problema text NOT NULL,
    servico_executado text,
    mecanico_nome text,
    horimetro_os numeric,
    aberta_em timestamp with time zone,
    concluida_em timestamp with time zone,
    classificacao_falha text,
    plano_id uuid,
    pacote text,
    ciclo integer,
    contador_alvo numeric,
    checklist jsonb
);
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS numero_os integer;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS motivo_rep text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS local_manutencao_pcm text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS descricao_problema text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS servico_executado text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS mecanico_nome text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS horimetro_os numeric;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS aberta_em timestamp with time zone;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS concluida_em timestamp with time zone;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS classificacao_falha text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS plano_id uuid;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS pacote text;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS ciclo integer;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS contador_alvo numeric;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS checklist jsonb;
ALTER TABLE public.ordens_servico ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN numero_os SET NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN obra_id DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN motivo_rep DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN local_manutencao_pcm DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN descricao_problema SET NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN servico_executado DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN mecanico_nome DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN horimetro_os DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN aberta_em DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN concluida_em DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN classificacao_falha DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN plano_id DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN pacote DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN ciclo DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN contador_alvo DROP NOT NULL;
ALTER TABLE public.ordens_servico ALTER COLUMN checklist DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.os_pecas_previstas (
    id uuid NOT NULL,
    os_id uuid NOT NULL,
    peca_id uuid NOT NULL,
    quantidade numeric NOT NULL
);
ALTER TABLE public.os_pecas_previstas ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.os_pecas_previstas ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.os_pecas_previstas ADD COLUMN IF NOT EXISTS peca_id uuid;
ALTER TABLE public.os_pecas_previstas ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE public.os_pecas_previstas ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.os_pecas_previstas ALTER COLUMN os_id SET NOT NULL;
ALTER TABLE public.os_pecas_previstas ALTER COLUMN peca_id SET NOT NULL;
ALTER TABLE public.os_pecas_previstas ALTER COLUMN quantidade SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.pecas_estoque (
    id uuid NOT NULL,
    id_interno text,
    descricao text NOT NULL,
    codigos_paralelos jsonb,
    quantidade numeric,
    unidade text,
    custo_unitario numeric,
    estoque_minimo numeric,
    obra_id uuid
);
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS id_interno text;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS codigos_paralelos jsonb;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS custo_unitario numeric;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS estoque_minimo numeric;
ALTER TABLE public.pecas_estoque ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.pecas_estoque ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN id_interno DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN descricao SET NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN codigos_paralelos DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN quantidade DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN unidade DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN custo_unitario DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN estoque_minimo DROP NOT NULL;
ALTER TABLE public.pecas_estoque ALTER COLUMN obra_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
    id uuid NOT NULL,
    matricula text NOT NULL,
    nome text NOT NULL,
    senha_acesso text NOT NULL,
    cargos_lista jsonb,
    obras_permitidas jsonb,
    ativo boolean,
    auth_user_id uuid,
    email_login text
);
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS senha_acesso text;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS cargos_lista jsonb;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS obras_permitidas jsonb;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS ativo boolean;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.perfis_usuarios ADD COLUMN IF NOT EXISTS email_login text;
ALTER TABLE public.perfis_usuarios ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN matricula SET NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN senha_acesso SET NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN cargos_lista DROP NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN obras_permitidas DROP NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN ativo DROP NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE public.perfis_usuarios ALTER COLUMN email_login DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.planos_preventiva (
    id uuid NOT NULL,
    equipamento_id uuid NOT NULL,
    intervalo_base numeric,
    ultimo_horimetro_execucao numeric,
    ultima_data_execucao date,
    ultimo_pacote_executado text,
    estrategia_id uuid,
    ciclo_atual integer NOT NULL,
    ativo boolean NOT NULL,
    os_aberta_id uuid
);
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS intervalo_base numeric;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS ultimo_horimetro_execucao numeric;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS ultima_data_execucao date;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS ultimo_pacote_executado text;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS estrategia_id uuid;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS ciclo_atual integer;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS ativo boolean;
ALTER TABLE public.planos_preventiva ADD COLUMN IF NOT EXISTS os_aberta_id uuid;
ALTER TABLE public.planos_preventiva ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN intervalo_base DROP NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN ultimo_horimetro_execucao DROP NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN ultima_data_execucao DROP NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN ultimo_pacote_executado DROP NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN estrategia_id DROP NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN ciclo_atual SET NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN ativo SET NOT NULL;
ALTER TABLE public.planos_preventiva ALTER COLUMN os_aberta_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.preventiva_estrategias (
    id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    unidade text NOT NULL,
    intervalo_base numeric NOT NULL,
    horizonte numeric NOT NULL,
    ativa boolean NOT NULL
);
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS intervalo_base numeric;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS horizonte numeric;
ALTER TABLE public.preventiva_estrategias ADD COLUMN IF NOT EXISTS ativa boolean;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN unidade SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN intervalo_base SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN horizonte SET NOT NULL;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN ativa SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.preventiva_lista_materiais (
    id uuid NOT NULL,
    lista_id uuid NOT NULL,
    peca_id uuid NOT NULL,
    quantidade numeric NOT NULL
);
ALTER TABLE public.preventiva_lista_materiais ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.preventiva_lista_materiais ADD COLUMN IF NOT EXISTS lista_id uuid;
ALTER TABLE public.preventiva_lista_materiais ADD COLUMN IF NOT EXISTS peca_id uuid;
ALTER TABLE public.preventiva_lista_materiais ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE public.preventiva_lista_materiais ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.preventiva_lista_materiais ALTER COLUMN lista_id SET NOT NULL;
ALTER TABLE public.preventiva_lista_materiais ALTER COLUMN peca_id SET NOT NULL;
ALTER TABLE public.preventiva_lista_materiais ALTER COLUMN quantidade SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.preventiva_lista_tarefas (
    id uuid NOT NULL,
    lista_id uuid NOT NULL,
    ordem integer NOT NULL,
    descricao text NOT NULL
);
ALTER TABLE public.preventiva_lista_tarefas ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.preventiva_lista_tarefas ADD COLUMN IF NOT EXISTS lista_id uuid;
ALTER TABLE public.preventiva_lista_tarefas ADD COLUMN IF NOT EXISTS ordem integer;
ALTER TABLE public.preventiva_lista_tarefas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN lista_id SET NOT NULL;
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN ordem SET NOT NULL;
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN descricao SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.preventiva_listas (
    id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    local_padrao text NOT NULL,
    duracao_horas numeric,
    ativa boolean NOT NULL,
    criado_em timestamp with time zone NOT NULL
);
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS local_padrao text;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS duracao_horas numeric;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS ativa boolean;
ALTER TABLE public.preventiva_listas ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone;
ALTER TABLE public.preventiva_listas ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN local_padrao SET NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN duracao_horas DROP NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN ativa SET NOT NULL;
ALTER TABLE public.preventiva_listas ALTER COLUMN criado_em SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.preventiva_pacotes (
    id uuid NOT NULL,
    estrategia_id uuid NOT NULL,
    multiplo integer NOT NULL,
    nome text NOT NULL,
    lista_id uuid,
    acumulativo boolean NOT NULL
);
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS estrategia_id uuid;
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS multiplo integer;
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS lista_id uuid;
ALTER TABLE public.preventiva_pacotes ADD COLUMN IF NOT EXISTS acumulativo boolean;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN estrategia_id SET NOT NULL;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN multiplo SET NOT NULL;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN nome SET NOT NULL;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN lista_id DROP NOT NULL;
ALTER TABLE public.preventiva_pacotes ALTER COLUMN acumulativo SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.servicos_almoxarifado (
    id uuid NOT NULL,
    equipamento_id uuid NOT NULL,
    os_id uuid,
    fornecedor text NOT NULL,
    descricao text NOT NULL,
    custo numeric NOT NULL,
    data_servico date NOT NULL,
    nota_fiscal text,
    registrado_por uuid,
    created_at timestamp with time zone NOT NULL
);
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS equipamento_id uuid;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS os_id uuid;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS custo numeric;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS data_servico date;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS nota_fiscal text;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS registrado_por uuid;
ALTER TABLE public.servicos_almoxarifado ADD COLUMN IF NOT EXISTS created_at timestamp with time zone;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN equipamento_id SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN os_id DROP NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN fornecedor SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN descricao SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN custo SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN data_servico SET NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN nota_fiscal DROP NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN registrado_por DROP NOT NULL;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN created_at SET NOT NULL;

-- 6. Funções e RPCs (pg_get_functiondef da produção)
--    rls_auto_enable() é a função do event trigger ensure_rls da produção (ver seção 13).
-- app.ativo()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.perfis_usuarios p
                 where p.auth_user_id = auth.uid() and coalesce(p.ativo, true))
$function$;

-- app.cargos()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.cargos()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select array_agg(lower(btrim(c)))
    from public.perfis_usuarios p, jsonb_array_elements_text(p.cargos_lista) as c
    where p.auth_user_id = auth.uid() and coalesce(p.ativo, true)
  ), array[]::text[])
$function$;

-- app.carimbo_horimetro()  SECURITY INVOKER
CREATE OR REPLACE FUNCTION app.carimbo_horimetro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.horimetro_atual, 0) > 0 and new.horimetro_atualizado_em is null then
      new.horimetro_atualizado_em := now();
    end if;
    return new;
  end if;
  if new.horimetro_atual is distinct from old.horimetro_atual then
    if new.horimetro_atualizado_em is null or new.horimetro_atualizado_em is not distinct from old.horimetro_atualizado_em then
      new.horimetro_atualizado_em := now();
    else
      new.horimetro_atualizado_em := least(new.horimetro_atualizado_em, now());
      if old.horimetro_atualizado_em is not null then
        new.horimetro_atualizado_em := greatest(new.horimetro_atualizado_em, old.horimetro_atualizado_em);
      end if;
    end if;
  end if;
  return new;
end $function$;

-- app.chave_tag(p text)  SECURITY INVOKER
CREATE OR REPLACE FUNCTION app.chave_tag(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(regexp_replace(upper(coalesce(p,'')), '[\s-]', '', 'g'), '([A-Z])0+([0-9])', '\1\2', 'g')
$function$;

-- app.criar_auth_user(p_email text, p_senha text)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.criar_auth_user(p_email text, p_senha text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', lower(p_email),
                             'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());
  return v_id;
end $function$;

-- app.dominio_login()  SECURITY INVOKER
CREATE OR REPLACE FUNCTION app.dominio_login()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select '@vilasa.invalid'::text $function$;

-- app.limite_salto(p_un text, p_base timestamp with time zone, p_quando timestamp with time zone)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.limite_salto(p_un text, p_base timestamp with time zone, p_quando timestamp with time zone DEFAULT now())
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.configuracoes_sistema%rowtype; h numeric; km boolean := upper(coalesce(p_un, 'H')) = 'KM';
begin
  select * into c from public.configuracoes_sistema limit 1;
  if p_base is null then
    return case when km then coalesce(c.limite_salto_km, 5000) else coalesce(c.limite_salto_horas, 300) end;
  end if;
  h := greatest(0, extract(epoch from (least(coalesce(p_quando, now()), now()) - p_base)) / 3600.0);
  if km then return coalesce(c.limite_km_dia, 100) * greatest(1, ceil(h / 24.0)); end if;
  return h + coalesce(c.tolerancia_horas, 0.5);
end $function$;

-- app.log_alteracao_equipamento()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.log_alteracao_equipamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c text; v_old text; v_new text;
begin
  foreach c in array array['tag','nome','marca','modelo','numero_serie','placa','ano_fabricacao','propriedade','situacao_ciclo','unidade_medida','obra_id'] loop
    execute format('select ($1).%I::text, ($2).%I::text', c, c) into v_old, v_new using old, new;
    if v_old is distinct from v_new then
      insert into public.equipamentos_historico (equipamento_id, campo, valor_antigo, valor_novo, alterado_por)
      values (new.id, c, v_old, v_new, auth.uid());
    end if;
  end loop;
  return new;
end $function$;

-- app.log_saldo_peca()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.log_saldo_peca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('app.mov_ok', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.quantidade, 0) <> 0 then
      insert into public.movimentacoes_almoxarifado
        (obra_id, tipo_movimento, peca_id, descricao_item, quantidade, valor_unitario, motivo, saldo_apos, criado_por)
      values (new.obra_id, 'SALDO_INICIAL', new.id, new.descricao, new.quantidade, coalesce(new.custo_unitario, 0),
              'CADASTRO DO ITEM COM SALDO', new.quantidade, auth.uid());
    end if;
  elsif new.quantidade is distinct from old.quantidade then
    insert into public.movimentacoes_almoxarifado
      (obra_id, tipo_movimento, peca_id, descricao_item, quantidade, valor_unitario, motivo, saldo_apos, criado_por)
    values (new.obra_id, 'AJUSTE_INVENTARIO', new.id, new.descricao, coalesce(new.quantidade, 0) - coalesce(old.quantidade, 0),
            coalesce(new.custo_unitario, 0), 'EDIÇÃO MANUAL DO SALDO (' || coalesce(old.quantidade, 0) || ' → ' || coalesce(new.quantidade, 0) || ')',
            new.quantidade, auth.uid());
  end if;
  return new;
end $function$;

-- app.obra_ok(p_obra uuid)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.obra_ok(p_obra uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.perfis_usuarios u
    where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
      and (
        p_obra is null
        or exists (select 1 from jsonb_array_elements_text(u.cargos_lista) c
                   where lower(btrim(c)) in ('admin', 'engenheiro', 'gestor'))
        or exists (
          select 1 from jsonb_array_elements_text(
                 case when u.obras_permitidas is null or u.obras_permitidas = '[]'::jsonb
                      then '["TODAS"]'::jsonb else u.obras_permitidas end) o
          where o = 'TODAS' or o = p_obra::text
             or o = (select ob.codigo from public.obras ob where ob.id = p_obra))
      )
  )
$function$;

-- app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer)
 RETURNS preventiva_pacotes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pk.* from public.preventiva_pacotes pk
  where pk.estrategia_id = p_estrategia and p_ciclo % pk.multiplo = 0
  order by pk.multiplo desc limit 1
$function$;

-- app.perfil_ativo()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.perfil_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.perfis_usuarios where auth_user_id = auth.uid() and ativo is not false)
$function$;

-- app.preventiva_ao_concluir()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.preventiva_ao_concluir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cont numeric;
begin
  if new.plano_id is null or new.status <> 'concluida' or old.status = 'concluida' then return new; end if;
  select coalesce(nullif(new.horimetro_os, 0), e.horimetro_atual) into v_cont from public.equipamentos e where e.id = new.equipamento_id;
  update public.planos_preventiva set ultimo_horimetro_execucao = v_cont,
         ultima_data_execucao = coalesce(new.concluida_em, now())::date,
         ultimo_pacote_executado = new.pacote, ciclo_atual = greatest(ciclo_atual, coalesce(new.ciclo, 0)), os_aberta_id = null
   where id = new.plano_id;
  insert into public.execucoes_preventiva (plano_id, equipamento_id, pacote, status, parada_obrigatoria, data_entrada, data_conclusao, horimetro_execucao, mecanicos_nomes, observacoes)
  values (new.plano_id, new.equipamento_id, new.pacote, 'concluida', true, new.aberta_em, coalesce(new.concluida_em, now()), v_cont, new.mecanico_nome, 'OS ' || new.numero_os);
  return new;
end $function$;

-- app.slug_login(p text)  SECURITY INVOKER
CREATE OR REPLACE FUNCTION app.slug_login(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(both '.' from regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '.', 'g'))
$function$;

-- app.tem_cargo(VARIADIC p_cargos text[])  SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.tem_cargo(VARIADIC p_cargos text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select app.ativo() and ('admin' = any(app.cargos()) or app.cargos() && p_cargos)
$function$;

-- public.admin_definir_ativo(p_id uuid, p_ativo boolean)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.admin_definir_ativo(p_id uuid, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_auth uuid;
begin
  if not app.tem_cargo('admin') then
    raise exception 'Apenas administradores podem gerenciar usuários.' using errcode = '42501';
  end if;
  update public.perfis_usuarios set ativo = coalesce(p_ativo, true) where id = p_id
  returning auth_user_id into v_auth;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v_auth is not null then
    update auth.users set banned_until = case when coalesce(p_ativo, true) then null else 'infinity'::timestamptz end
     where id = v_auth;
  end if;
end $function$;

-- public.admin_salvar_usuario(p_id uuid, p_matricula text, p_nome text, p_senha text, p_cargos jsonb, p_obras jsonb, p_ativo boolean)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.admin_salvar_usuario(p_id uuid, p_matricula text, p_nome text, p_senha text, p_cargos jsonb, p_obras jsonb, p_ativo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mat text := upper(btrim(coalesce(p_matricula, '')));
  v_nome text := upper(btrim(coalesce(p_nome, '')));
  v_senha text := btrim(coalesce(p_senha, ''));
  v_obras jsonb := case when p_obras is null or jsonb_typeof(p_obras) <> 'array' or jsonb_array_length(p_obras) = 0
                        then '["TODAS"]'::jsonb else p_obras end;
  v_email text; v_auth uuid; v_perfil uuid; v_email_atual text;
begin
  if not app.tem_cargo('admin') then
    raise exception 'Apenas administradores podem gerenciar usuários.' using errcode = '42501';
  end if;
  if v_mat = '' or v_nome = '' then raise exception 'Informe o login e o nome.'; end if;
  if p_cargos is null or jsonb_typeof(p_cargos) <> 'array' or jsonb_array_length(p_cargos) = 0 then
    raise exception 'Marque pelo menos 1 cargo.';
  end if;
  if v_senha <> '' and length(v_senha) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;

  if p_id is null then
    if v_senha = '' then raise exception 'Informe uma senha para o novo usuário.'; end if;
    v_email := app.slug_login(v_mat) || app.dominio_login();
    if v_email = app.dominio_login() then raise exception 'Login inválido.'; end if;
    if exists (select 1 from public.perfis_usuarios
               where email_login = v_email or upper(btrim(matricula)) = v_mat) then
      raise exception 'Já existe um usuário com este login.';
    end if;
    v_auth := app.criar_auth_user(v_email, v_senha);
    insert into public.perfis_usuarios (matricula, nome, senha_acesso, cargos_lista, obras_permitidas,
                                        ativo, auth_user_id, email_login)
    values (v_mat, v_nome, '!auth', p_cargos, v_obras, coalesce(p_ativo, true), v_auth, v_email)
    returning id into v_perfil;
    if not coalesce(p_ativo, true) then
      update auth.users set banned_until = 'infinity' where id = v_auth;
    end if;
    return v_perfil;
  end if;

  select auth_user_id, email_login into v_auth, v_email_atual
  from public.perfis_usuarios where id = p_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;

  if v_senha <> '' then
    if v_auth is null then
      v_email := coalesce(v_email_atual, app.slug_login(v_mat) || app.dominio_login());
      v_auth := app.criar_auth_user(v_email, v_senha);
      update public.perfis_usuarios set auth_user_id = v_auth, email_login = v_email where id = p_id;
    else
      update auth.users set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf')),
                            updated_at = now() where id = v_auth;
    end if;
    update public.perfis_usuarios set senha_acesso = '!auth' where id = p_id;
  end if;

  update public.perfis_usuarios
     set matricula = v_mat, nome = v_nome, cargos_lista = p_cargos,
         obras_permitidas = v_obras, ativo = coalesce(p_ativo, true)
   where id = p_id;
  if v_auth is not null then
    update auth.users set banned_until = case when coalesce(p_ativo, true) then null else 'infinity'::timestamptz end
     where id = v_auth;
  end if;
  return p_id;
end $function$;

-- public.almox_movimentar(p jsonb)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.almox_movimentar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_tipo text := upper(btrim(coalesce(p->>'tipo', '')));
  v_qtd numeric := nullif(p->>'quantidade', '')::numeric;
  v_peca_id uuid := nullif(p->>'peca_id', '')::uuid;
  v_eq_id uuid := nullif(p->>'equipamento_id', '')::uuid;
  v_os_id uuid := nullif(p->>'os_id', '')::uuid;
  v_obra uuid := nullif(p->>'obra_id', '')::uuid;
  v_valor numeric := coalesce(nullif(p->>'valor_unitario', '')::numeric, 0);
  v_desc text := upper(btrim(coalesce(p->>'descricao_item', '')));
  v_nf text := upper(btrim(coalesce(p->>'numero_nf', '')));
  v_forn text := upper(btrim(coalesce(p->>'fornecedor', '')));
  v_quem text := upper(btrim(coalesce(p->>'retirado_por', '')));
  v_motivo text := btrim(coalesce(p->>'motivo', ''));
  v_obs text := btrim(coalesce(p->>'observacao', ''));
  v_cod text := upper(btrim(coalesce(p->>'codigo_nf', '')));
  v_quando timestamptz := least(coalesce(nullif(p->>'registrado_em', '')::timestamptz, now()), now());
  v_peca public.pecas_estoque%rowtype;
  v_eq public.equipamentos%rowtype;
  v_os public.ordens_servico%rowtype;
  v_saldo numeric; v_custo numeric; v_delta numeric; v_par jsonb; v_grava_qtd numeric;
begin
  if not app.tem_cargo('almoxarife', 'engenheiro') then
    raise exception 'SEM_PERMISSAO: só o almoxarife ou a engenharia lançam movimentos de estoque.' using errcode = '42501';
  end if;
  if exists (select 1 from public.movimentacoes_almoxarifado where id = v_id) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;
  if v_tipo not in ('ENTRADA_NF', 'SAIDA_ESTOQUE', 'NOTA_APLICADA', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') then
    raise exception 'TIPO_INVALIDO: %', v_tipo using errcode = 'P0001';
  end if;
  if v_qtd is null or v_qtd < 0 or (v_qtd = 0 and v_tipo <> 'AJUSTE_INVENTARIO') then
    raise exception 'QUANTIDADE_INVALIDA: informe a quantidade.' using errcode = 'P0001';
  end if;

  if v_eq_id is not null then
    select * into v_eq from public.equipamentos where id = v_eq_id;
    if not found then raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
    if not app.obra_ok(v_eq.obra_id) then raise exception 'SEM_PERMISSAO: equipamento de outra obra.' using errcode = '42501'; end if;
  end if;
  if v_os_id is not null then
    select * into v_os from public.ordens_servico where id = v_os_id;
    if not found then raise exception 'OS_NAO_ENCONTRADA' using errcode = 'P0001'; end if;
    if v_eq_id is not null and v_os.equipamento_id is distinct from v_eq_id then
      raise exception 'OS_DE_OUTRA_MAQUINA: a OS escolhida não é deste equipamento.' using errcode = 'P0001';
    end if;
    if v_eq_id is null then v_eq_id := v_os.equipamento_id; end if;
  end if;
  if v_tipo in ('SAIDA_ESTOQUE', 'NOTA_APLICADA') and v_eq_id is null then
    raise exception 'EQUIPAMENTO_OBRIGATORIO: informe a máquina (ou OFICINA).' using errcode = 'P0001';
  end if;
  if v_tipo in ('SAIDA_ESTOQUE', 'NOTA_APLICADA') and v_quem = '' then
    raise exception 'QUEM_OBRIGATORIO: informe quem retirou / quem comprou.' using errcode = 'P0001';
  end if;
  if v_tipo in ('ENTRADA_NF', 'NOTA_APLICADA') and v_nf = '' then
    raise exception 'NF_OBRIGATORIA: informe o número da nota.' using errcode = 'P0001';
  end if;
  if v_tipo = 'NOTA_APLICADA' and v_desc = '' then
    raise exception 'DESCRICAO_OBRIGATORIA: descreva o item da nota.' using errcode = 'P0001';
  end if;

  perform set_config('app.mov_ok', '1', true);

  if v_tipo in ('ENTRADA_NF', 'SAIDA_ESTOQUE', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') and v_peca_id is not null then
    select * into v_peca from public.pecas_estoque where id = v_peca_id for update;
    if not found then raise exception 'ITEM_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
    if not app.obra_ok(v_peca.obra_id) then raise exception 'SEM_PERMISSAO: item de outra obra.' using errcode = '42501'; end if;
    v_saldo := coalesce(v_peca.quantidade, 0);
    v_custo := coalesce(v_peca.custo_unitario, 0);
    if v_obra is null then v_obra := v_peca.obra_id; end if;
    if v_desc = '' then v_desc := upper(v_peca.descricao); end if;
  elsif v_tipo in ('SAIDA_ESTOQUE', 'DEVOLUCAO', 'AJUSTE_INVENTARIO') then
    raise exception 'ITEM_OBRIGATORIO: escolha o item do catálogo.' using errcode = 'P0001';
  end if;
  if v_obra is null and v_eq_id is not null then v_obra := v_eq.obra_id; end if;

  v_grava_qtd := v_qtd;
  if v_tipo = 'ENTRADA_NF' then
    if v_peca_id is not null then
      if v_valor > 0 then
        v_custo := case when v_saldo + v_qtd > 0 and v_saldo > 0
                        then round((v_saldo * v_custo + v_qtd * v_valor) / (v_saldo + v_qtd), 4) else v_valor end;
      end if;
      v_par := coalesce(v_peca.codigos_paralelos, '[]'::jsonb);
      if v_cod <> '' and not (v_par ? v_cod) then v_par := v_par || to_jsonb(v_cod); end if;
      v_saldo := v_saldo + v_qtd;
      update public.pecas_estoque set quantidade = v_saldo, custo_unitario = v_custo, codigos_paralelos = v_par where id = v_peca_id;
    end if;
  elsif v_tipo = 'SAIDA_ESTOQUE' then
    if v_saldo < v_qtd then
      raise exception 'SALDO_INSUFICIENTE: saldo de % é %, pedido %.', v_peca.id_interno, v_saldo, v_qtd using errcode = 'P0001';
    end if;
    v_valor := v_custo;
    v_saldo := v_saldo - v_qtd;
    update public.pecas_estoque set quantidade = v_saldo where id = v_peca_id;
  elsif v_tipo = 'DEVOLUCAO' then
    v_valor := v_custo;
    v_saldo := v_saldo + v_qtd;
    update public.pecas_estoque set quantidade = v_saldo where id = v_peca_id;
  elsif v_tipo = 'AJUSTE_INVENTARIO' then
    if v_motivo = '' then raise exception 'MOTIVO_OBRIGATORIO: informe o motivo do ajuste.' using errcode = 'P0001'; end if;
    v_delta := v_qtd - v_saldo;
    v_grava_qtd := v_delta;
    v_valor := v_custo;
    v_saldo := v_qtd;
    update public.pecas_estoque set quantidade = v_saldo where id = v_peca_id;
  end if;

  insert into public.movimentacoes_almoxarifado
    (id, obra_id, tipo_movimento, numero_nf, fornecedor, peca_id, descricao_item, quantidade, valor_unitario,
     equipamento_id, os_id, retirado_por, observacao, motivo, saldo_apos, criado_por, registrado_em)
  values (v_id, v_obra, v_tipo, nullif(v_nf, ''), nullif(v_forn, ''), v_peca_id, v_desc, v_grava_qtd, v_valor,
          v_eq_id, v_os_id, nullif(v_quem, ''), nullif(v_obs, ''), nullif(v_motivo, ''), v_saldo, auth.uid(), v_quando);

  perform set_config('app.mov_ok', '', true);
  return jsonb_build_object('ok', true, 'saldo_apos', v_saldo, 'custo', v_custo);
end $function$;

-- public.corrigir_leitura(p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.corrigir_leitura(p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_eq public.equipamentos%rowtype; v_med text := upper(btrim(coalesce(p_medidor, ''))); v_nome text;
begin
  if not app.tem_cargo('pcm', 'engenheiro', 'admin') then
    raise exception 'SEM_PERMISSAO: só PCM, engenharia ou admin corrigem leituras.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'MOTIVO_OBRIGATORIO: informe o motivo da correção.' using errcode = 'P0001'; end if;
  if p_leitura is null or p_leitura < 0 then raise exception 'LEITURA_INVALIDA' using errcode = 'P0001'; end if;
  if v_med not in ('H', 'KM') then raise exception 'MEDIDOR_INVALIDO' using errcode = 'P0001'; end if;
  if exists (select 1 from public.diario_horimetro where id = p_id) then return jsonb_build_object('ok', true, 'duplicado', true); end if;
  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if not app.obra_ok(v_eq.obra_id) then raise exception 'SEM_PERMISSAO: equipamento de outra obra.' using errcode = '42501'; end if;
  select nome into v_nome from public.perfis_usuarios where auth_user_id = auth.uid();
  if v_med = upper(coalesce(v_eq.unidade_medida, 'H')) then
    update public.equipamentos set horimetro_atual = p_leitura, horimetro_atualizado_em = now() where id = p_equipamento;
  else
    update public.equipamentos set km_atual = p_leitura, km_atualizado_em = now() where id = p_equipamento;
  end if;
  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem, motivo)
  values (p_id, p_equipamento, p_leitura, 'CORREÇÃO: ' || coalesce(v_nome, 'PCM'), now(), v_med, 'correcao', btrim(p_motivo));
  return jsonb_build_object('ok', true);
end $function$;

-- public.diesel_sincronizar_leituras()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.diesel_sincronizar_leituras()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record; v_med text; v_leit numeric; v_prev numeric; v_prev_t timestamptz; v_next numeric;
  v_quando timestamptz; v_un text; v_id uuid; v_ok int := 0; v_rej int := 0; v_dup int := 0; v_n int;
begin
  if not app.tem_cargo('admin', 'engenheiro', 'pcm') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  for r in
    select a.id, a.equipamento_id, a.data, a.hora, a.horimetro, a.odometro, e.unidade_medida
    from public.diesel_abastecimentos a join public.equipamentos e on e.id = a.equipamento_id
    where a.fonte = 'cta' and not a.suspeito and not a.transferencia
      and (coalesce(a.horimetro,0) > 0 or coalesce(a.odometro,0) > 0)
    order by a.equipamento_id, a.data, a.hora
  loop
    for v_med, v_leit in select * from (values ('H', r.horimetro), ('KM', r.odometro)) t(m, l) where coalesce(l,0) > 0 loop
      v_id := md5('cta|' || r.id::text || '|' || v_med)::uuid;
      if exists (select 1 from public.diario_horimetro where id = v_id) then v_dup := v_dup + 1; continue; end if;
      v_quando := least(((r.data::text || ' ' || coalesce(r.hora::text, '12:00:00')) || '-03')::timestamptz, now());
      select leitura, registrado_em into v_prev, v_prev_t from public.diario_horimetro
        where equipamento_id = r.equipamento_id and medidor = v_med and registrado_em <= v_quando
        order by registrado_em desc limit 1;
      select leitura into v_next from public.diario_horimetro
        where equipamento_id = r.equipamento_id and medidor = v_med and registrado_em > v_quando
        order by registrado_em asc limit 1;
      v_un := case when v_med = 'KM' then 'KM' else 'H' end;
      if (v_prev is not null and v_leit < v_prev)
         or (v_next is not null and v_leit > v_next)
         or (v_prev is not null and (v_leit - v_prev) > app.limite_salto(v_un, v_prev_t, v_quando)) then
        v_rej := v_rej + 1; continue;
      end if;
      insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem)
      values (v_id, r.equipamento_id, v_leit, 'CTA DIESEL', v_quando, v_med, 'cta_diesel')
      on conflict (id) do nothing;
      get diagnostics v_n = row_count; v_ok := v_ok + v_n;
    end loop;
  end loop;
  return jsonb_build_object('aceitas', v_ok, 'recusadas_so_consumo', v_rej, 'ja_existiam', v_dup);
end $function$;

-- public.diesel_vincular_equipamentos()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.diesel_vincular_equipamentos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare n integer;
begin
  if not app.tem_cargo('pcm') and not app.tem_cargo('engenheiro') and not app.tem_cargo('admin') then
    raise exception 'sem permissão';
  end if;
  update public.diesel_abastecimentos a set equipamento_id = e.id
  from public.equipamentos e
  where a.equipamento_id is null and a.chave_tag is not null
    and (app.chave_tag(e.tag) = a.chave_tag
         or ('X' || app.chave_tag(e.tag)) = a.chave_tag);
  get diagnostics n = row_count;
  return n;
end $function$;

-- public.importar_leituras(p jsonb)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.importar_leituras(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_recebidas int; v_inseridas int;
begin
  if not app.tem_cargo('admin', 'engenheiro') then
    raise exception 'SEM_PERMISSAO: só admin ou engenharia importam leituras.' using errcode = '42501';
  end if;
  select count(*) into v_recebidas from jsonb_to_recordset(p) as x(t text, m text, d date, v numeric);
  with ins as (
    insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor, origem)
    select md5('imp|' || e.id::text || '|' || upper(x.m) || '|' || x.d::text)::uuid, e.id, x.v, 'IMPORTADO PLANILHA',
           least((x.d::text || ' 18:00:00-03')::timestamptz, now()), upper(x.m), 'planilha_parte_diaria'
    from jsonb_to_recordset(p) as x(t text, m text, d date, v numeric)
    join public.equipamentos e on upper(e.tag) = upper(btrim(x.t))
    where x.v > 0 and upper(x.m) in ('H', 'KM')
    on conflict (id) do nothing
    returning 1)
  select count(*) into v_inseridas from ins;
  return jsonb_build_object('recebidas', v_recebidas, 'inseridas', v_inseridas, 'sem_equipamento_ou_repetidas', v_recebidas - v_inseridas);
end $function$;

-- public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text, p_registrado_em timestamp with time zone, p_id uuid)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text DEFAULT ''::text, p_registrado_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eq public.equipamentos%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_op text := left(btrim(coalesce(p_operador, '')), 80);
  v_quando timestamptz := least(coalesce(p_registrado_em, now()), now());
  v_ultimo timestamptz; v_limite numeric; v_atual numeric; v_med text;
begin
  if p_equipamento is null or p_leitura is null or p_leitura <= 0 then
    raise exception 'LEITURA_INVALIDA: informe a leitura do painel.' using errcode = 'P0001';
  end if;
  if v_op = '' then raise exception 'OPERADOR_OBRIGATORIO: informe matrícula ou nome.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.diario_horimetro where id = v_id) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;
  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  v_med := case when upper(coalesce(v_eq.unidade_medida, 'H')) = 'KM' then 'KM' else 'H' end;
  v_limite := app.limite_salto(v_eq.unidade_medida, v_eq.horimetro_atualizado_em, v_quando);
  v_atual := coalesce(v_eq.horimetro_atual, 0);
  select max(registrado_em) into v_ultimo from public.diario_horimetro where equipamento_id = p_equipamento and medidor = v_med;

  if v_atual > 0 and p_leitura < v_atual then
    if v_ultimo is not null and v_quando < v_ultimo then
      insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor)
      values (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med);
      return jsonb_build_object('ok', true, 'atrasado', true, 'horimetro_atual', v_atual);
    end if;
    raise exception 'LEITURA_MENOR: a leitura % é menor que a atual (%).', p_leitura, v_atual using errcode = 'P0001';
  end if;
  if v_atual > 0 and (p_leitura - v_atual) > v_limite then
    raise exception 'SALTO_ALTO: desde a última leitura o máximo possível seria subir % (subiu %).',
      round(v_limite, 1), round(p_leitura - v_atual, 1) using errcode = 'P0001';
  end if;
  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em, medidor)
  values (v_id, p_equipamento, p_leitura, v_op, v_quando, v_med);
  update public.equipamentos set horimetro_atual = p_leitura, horimetro_atualizado_em = v_quando where id = p_equipamento;
  return jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
end $function$;

-- public.meu_perfil()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.meu_perfil()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select to_jsonb(x) from (
    select p.id, p.matricula, p.nome, p.cargos_lista, p.obras_permitidas, p.ativo
    from public.perfis_usuarios p where p.auth_user_id = auth.uid() limit 1) x
$function$;

-- public.os_assumir(p_os uuid, p_nome text)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.os_assumir(p_os uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text := upper(btrim(coalesce(p_nome, ''))); v_os public.ordens_servico%rowtype; v_lista text[];
begin
  if not app.tem_cargo('mecanico', 'pcm', 'engenheiro', 'admin') then
    raise exception 'SEM_PERMISSAO: só mecânico, PCM, engenharia ou admin assumem OS.' using errcode = '42501';
  end if;
  if v_nome = '' then raise exception 'NOME_OBRIGATORIO' using errcode = 'P0001'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA' using errcode = 'P0001'; end if;
  if v_os.concluida_em is not null or v_os.status in ('concluida', 'aguardando_pcm') then
    return jsonb_build_object('ok', true, 'ignorado', true, 'motivo', 'OS já encerrada');
  end if;
  select coalesce(array_agg(distinct n), array[]::text[]) into v_lista
  from (select upper(btrim(x)) n from unnest(string_to_array(coalesce(v_os.mecanico_nome, ''), ',')) x
        union select v_nome) t where n <> '';
  update public.ordens_servico
     set mecanico_nome = array_to_string(v_lista, ', '),
         status = case when status in ('aberta', 'pausada_peca') then 'em_execucao' else status end
   where id = p_os;
  return jsonb_build_object('ok', true, 'mecanico_nome', array_to_string(v_lista, ', '));
end $function$;

-- public.preventiva_gerar_os(p_plano uuid)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.preventiva_gerar_os(p_plano uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_pk public.preventiva_pacotes; v_n int; v_alvo numeric; v_os uuid; v_chk jsonb; v_qtd int := 0; v_loc text;
begin
  if auth.uid() is not null and not app.tem_cargo('pcm','engenheiro','admin') then
    raise exception 'SEM_PERMISSAO: só PCM, engenharia ou admin geram preventivas.' using errcode='42501';
  end if;
  for r in
    select p.*, case when s.unidade = 'KM' then coalesce(e.km_atual, e.horimetro_atual) else e.horimetro_atual end hor,
           e.obra_id, e.tag, s.horizonte, s.intervalo_base ib
    from public.planos_preventiva p
    join public.equipamentos e on e.id = p.equipamento_id
    join public.preventiva_estrategias s on s.id = p.estrategia_id and s.ativa
    where p.ativo and (p_plano is null or p.id = p_plano)
      and e.situacao_ciclo = 'ativo'
      and (p.os_aberta_id is null or exists (select 1 from public.ordens_servico o where o.id = p.os_aberta_id and o.status = 'concluida'))
    for update of p
  loop
    v_n := r.ciclo_atual + 1;
    v_alvo := coalesce(r.ultimo_horimetro_execucao, 0) + r.ib;
    continue when (v_alvo - coalesce(r.hor, 0)) > r.horizonte and p_plano is null;
    v_pk := app.pacote_do_ciclo(r.estrategia_id, v_n);
    if v_pk.id is null then continue; end if;
    continue when exists (select 1 from public.ordens_servico where plano_id = r.id and ciclo = v_n);
    select coalesce(jsonb_agg(jsonb_build_object('t', t.descricao, 'ok', false) order by pk2.multiplo, t.ordem), '[]'::jsonb)
      into v_chk
      from public.preventiva_pacotes pk2
      join public.preventiva_lista_tarefas t on t.lista_id = pk2.lista_id
      where pk2.estrategia_id = r.estrategia_id
        and (pk2.id = v_pk.id or (v_pk.acumulativo and pk2.multiplo < v_pk.multiplo and v_pk.multiplo % pk2.multiplo = 0));
    select coalesce(l.local_padrao, 'OFICINA') into v_loc from public.preventiva_listas l where l.id = v_pk.lista_id;
    insert into public.ordens_servico (equipamento_id, obra_id, status, motivo_rep, local_manutencao_pcm, descricao_problema, plano_id, pacote, ciclo, contador_alvo, checklist)
    values (r.equipamento_id, r.obra_id, 'aberta', 'PREVENTIVA', coalesce(v_loc, 'OFICINA'),
            'PREVENTIVA ' || v_pk.nome || ' (ciclo ' || v_n || ') - alvo ' || v_alvo, r.id, v_pk.nome, v_n, v_alvo, v_chk)
    returning id into v_os;
    insert into public.os_pecas_previstas (os_id, peca_id, quantidade)
    select v_os, m.peca_id, sum(m.quantidade)
      from public.preventiva_pacotes pk2 join public.preventiva_lista_materiais m on m.lista_id = pk2.lista_id
      where pk2.estrategia_id = r.estrategia_id
        and (pk2.id = v_pk.id or (v_pk.acumulativo and pk2.multiplo < v_pk.multiplo and v_pk.multiplo % pk2.multiplo = 0))
      group by m.peca_id;
    update public.planos_preventiva set os_aberta_id = v_os where id = r.id;
    v_qtd := v_qtd + 1;
  end loop;
  return jsonb_build_object('ok', true, 'geradas', v_qtd);
end $function$;

-- public.qr_equipamento(p_id uuid, p_tag text)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.qr_equipamento(p_id uuid DEFAULT NULL::uuid, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select to_jsonb(x) from (
    select e.id, e.tag, e.nome, e.unidade_medida, e.horimetro_atual, e.obra_id, e.horimetro_atualizado_em,
           (select jsonb_build_object('limite_km_dia', c.limite_km_dia, 'tolerancia_horas', c.tolerancia_horas,
                                      'fixo_horas', c.limite_salto_horas, 'fixo_km', c.limite_salto_km)
            from public.configuracoes_sistema c limit 1) as cfg
    from public.equipamentos e
    where (p_id is not null and e.id = p_id)
       or (p_id is null and p_tag is not null and upper(e.tag) = upper(btrim(p_tag)))
    limit 1) x
$function$;

-- public.recalcular_horimetro_atual()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.recalcular_horimetro_atual()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_atualizados int; v_unidade int;
begin
  if not app.tem_cargo('admin', 'engenheiro') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  create temp table _princ on commit drop as
  select e.id,
         case when exists (select 1 from public.diario_horimetro d where d.equipamento_id = e.id and d.medidor = 'H' having count(*) >= 10) then 'H'
              when upper(coalesce(e.unidade_medida, 'H')) = 'KM' then 'KM' else 'H' end medidor
  from public.equipamentos e;
  create temp table _ult on commit drop as
  select distinct on (d.equipamento_id) d.equipamento_id id, d.leitura, d.registrado_em, d.medidor
  from public.diario_horimetro d join _princ p on p.id = d.equipamento_id and p.medidor = d.medidor
  order by d.equipamento_id, d.registrado_em desc, d.leitura desc;
  select count(*) into v_unidade from public.equipamentos e join _ult u on u.id = e.id
   where upper(coalesce(e.unidade_medida, 'H')) <> u.medidor;
  update public.equipamentos e
     set horimetro_atual = u.leitura, horimetro_atualizado_em = u.registrado_em, unidade_medida = u.medidor
    from _ult u
   where u.id = e.id and (e.horimetro_atualizado_em is null or e.horimetro_atualizado_em < u.registrado_em);
  get diagnostics v_atualizados = row_count;
  return jsonb_build_object('equipamentos_atualizados', v_atualizados, 'unidade_trocada_para_horimetro', v_unidade);
end $function$;

-- public.resolver_login(p_texto text)  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.resolver_login(p_texto text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v text := lower(btrim(coalesce(p_texto, ''))); n int; r text;
begin
  if v = '' or length(v) > 80 then return null; end if;
  select count(*), min(u.email_login) into n, r
  from public.perfis_usuarios u
  where coalesce(u.ativo, true) and u.auth_user_id is not null and u.email_login is not null
    and (lower(btrim(u.matricula)) = v or lower(btrim(u.nome)) = v
         or lower(split_part(btrim(u.nome), ' ', 1)) = v);
  if n = 1 then return r; end if;
  return null;
end $function$;

-- public.rls_auto_enable()  SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- 7. Defaults de colunas
ALTER TABLE public.admin_auditoria ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.admin_auditoria ALTER COLUMN usuario_auth SET DEFAULT auth.uid();
ALTER TABLE public.admin_auditoria ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.apontamentos_os ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.apontamentos_os ALTER COLUMN registrado_em SET DEFAULT now();
ALTER TABLE public.configuracoes_sistema ALTER COLUMN id SET DEFAULT 1;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN pin_operacao SET DEFAULT '2026'::text;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN delta_maximo_horimetro SET DEFAULT 24;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_salto_horas SET DEFAULT 300;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_salto_km SET DEFAULT 5000;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN limite_km_dia SET DEFAULT 100;
ALTER TABLE public.configuracoes_sistema ALTER COLUMN tolerancia_horas SET DEFAULT 0.5;
ALTER TABLE public.diario_horimetro ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.diario_horimetro ALTER COLUMN operador_nome SET DEFAULT ''::text;
ALTER TABLE public.diario_horimetro ALTER COLUMN registrado_em SET DEFAULT now();
ALTER TABLE public.diario_horimetro ALTER COLUMN medidor SET DEFAULT 'H'::text;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN transferencia SET DEFAULT false;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN suspeito SET DEFAULT false;
ALTER TABLE public.diesel_abastecimentos ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.diesel_carregamentos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.diesel_carregamentos ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.diesel_tanques ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.diesel_tanques ALTER COLUMN tipo SET DEFAULT 'FIXO'::text;
ALTER TABLE public.diesel_tanques ALTER COLUMN ativo SET DEFAULT true;
ALTER TABLE public.diesel_tanques ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.equipamentos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.equipamentos ALTER COLUMN marca SET DEFAULT ''::text;
ALTER TABLE public.equipamentos ALTER COLUMN modelo SET DEFAULT ''::text;
ALTER TABLE public.equipamentos ALTER COLUMN unidade_medida SET DEFAULT 'H'::text;
ALTER TABLE public.equipamentos ALTER COLUMN horimetro_atual SET DEFAULT 0;
ALTER TABLE public.equipamentos ALTER COLUMN propriedade SET DEFAULT 'proprio'::text;
ALTER TABLE public.equipamentos ALTER COLUMN situacao_ciclo SET DEFAULT 'ativo'::text;
ALTER TABLE public.equipamentos ALTER COLUMN numero_serie SET DEFAULT ''::text;
ALTER TABLE public.equipamentos ALTER COLUMN placa SET DEFAULT ''::text;
ALTER TABLE public.equipamentos ALTER COLUMN ano_fabricacao SET DEFAULT ''::text;
ALTER TABLE public.equipamentos_historico ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.equipamentos_historico ALTER COLUMN alterado_em SET DEFAULT now();
ALTER TABLE public.execucoes_preventiva ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.execucoes_preventiva ALTER COLUMN pacote SET DEFAULT '250H'::text;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN status SET DEFAULT 'concluida'::text;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN parada_obrigatoria SET DEFAULT true;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN data_entrada SET DEFAULT now();
ALTER TABLE public.execucoes_preventiva ALTER COLUMN horimetro_execucao SET DEFAULT 0;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN mecanicos_nomes SET DEFAULT ''::text;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN observacoes SET DEFAULT ''::text;
ALTER TABLE public.execucoes_preventiva ALTER COLUMN origem SET DEFAULT 'os'::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.itens_os_estoque ALTER COLUMN custo_unitario_congelado SET DEFAULT 0;
ALTER TABLE public.itens_os_estoque ALTER COLUMN status_baixa SET DEFAULT 'pendente_almoxarife'::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.itens_os_estoque ALTER COLUMN nota_fiscal SET DEFAULT ''::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN fornecedor SET DEFAULT ''::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN observacao SET DEFAULT ''::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN estocavel SET DEFAULT true;
ALTER TABLE public.itens_os_estoque ALTER COLUMN descricao_livre SET DEFAULT ''::text;
ALTER TABLE public.itens_os_estoque ALTER COLUMN part_number_nf SET DEFAULT ''::text;
ALTER TABLE public.lotes_estoque ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.lotes_estoque ALTER COLUMN nota_fiscal SET DEFAULT 'SALDO INICIAL'::text;
ALTER TABLE public.lotes_estoque ALTER COLUMN fornecedor SET DEFAULT ''::text;
ALTER TABLE public.lotes_estoque ALTER COLUMN custo_unitario_real SET DEFAULT 0;
ALTER TABLE public.lotes_estoque ALTER COLUMN data_entrada SET DEFAULT now();
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN numero_nf SET DEFAULT ''::text;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN fornecedor SET DEFAULT ''::text;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN quantidade SET DEFAULT 1;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN valor_unitario SET DEFAULT 0;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN observacao SET DEFAULT ''::text;
ALTER TABLE public.movimentacoes_almoxarifado ALTER COLUMN registrado_em SET DEFAULT now();
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.notas_fora_do_custo ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.obras ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.obras ALTER COLUMN ativa SET DEFAULT true;
ALTER TABLE public.ordens_servico ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.ordens_servico ALTER COLUMN numero_os SET DEFAULT nextval('ordens_servico_numero_os_seq'::regclass);
ALTER TABLE public.ordens_servico ALTER COLUMN status SET DEFAULT 'aberta'::text;
ALTER TABLE public.ordens_servico ALTER COLUMN motivo_rep SET DEFAULT 'CORRETIVA'::text;
ALTER TABLE public.ordens_servico ALTER COLUMN local_manutencao_pcm SET DEFAULT 'OFICINA'::text;
ALTER TABLE public.ordens_servico ALTER COLUMN servico_executado SET DEFAULT ''::text;
ALTER TABLE public.ordens_servico ALTER COLUMN mecanico_nome SET DEFAULT ''::text;
ALTER TABLE public.ordens_servico ALTER COLUMN aberta_em SET DEFAULT now();
ALTER TABLE public.ordens_servico ALTER COLUMN classificacao_falha SET DEFAULT ''::text;
ALTER TABLE public.os_pecas_previstas ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pecas_estoque ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pecas_estoque ALTER COLUMN codigos_paralelos SET DEFAULT '[]'::jsonb;
ALTER TABLE public.pecas_estoque ALTER COLUMN quantidade SET DEFAULT 0;
ALTER TABLE public.pecas_estoque ALTER COLUMN unidade SET DEFAULT 'UN'::text;
ALTER TABLE public.pecas_estoque ALTER COLUMN custo_unitario SET DEFAULT 0;
ALTER TABLE public.pecas_estoque ALTER COLUMN estoque_minimo SET DEFAULT 0;
ALTER TABLE public.perfis_usuarios ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.perfis_usuarios ALTER COLUMN cargos_lista SET DEFAULT '["mecanico"]'::jsonb;
ALTER TABLE public.perfis_usuarios ALTER COLUMN obras_permitidas SET DEFAULT '["TODAS"]'::jsonb;
ALTER TABLE public.perfis_usuarios ALTER COLUMN ativo SET DEFAULT true;
ALTER TABLE public.planos_preventiva ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.planos_preventiva ALTER COLUMN intervalo_base SET DEFAULT 250;
ALTER TABLE public.planos_preventiva ALTER COLUMN ultimo_horimetro_execucao SET DEFAULT 0;
ALTER TABLE public.planos_preventiva ALTER COLUMN ultimo_pacote_executado SET DEFAULT '250H'::text;
ALTER TABLE public.planos_preventiva ALTER COLUMN ciclo_atual SET DEFAULT 0;
ALTER TABLE public.planos_preventiva ALTER COLUMN ativo SET DEFAULT true;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.preventiva_estrategias ALTER COLUMN unidade SET DEFAULT 'H'::text;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN horizonte SET DEFAULT 50;
ALTER TABLE public.preventiva_estrategias ALTER COLUMN ativa SET DEFAULT true;
ALTER TABLE public.preventiva_lista_materiais ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.preventiva_lista_tarefas ALTER COLUMN ordem SET DEFAULT 0;
ALTER TABLE public.preventiva_listas ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.preventiva_listas ALTER COLUMN local_padrao SET DEFAULT 'OFICINA'::text;
ALTER TABLE public.preventiva_listas ALTER COLUMN ativa SET DEFAULT true;
ALTER TABLE public.preventiva_listas ALTER COLUMN criado_em SET DEFAULT now();
ALTER TABLE public.preventiva_pacotes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.preventiva_pacotes ALTER COLUMN acumulativo SET DEFAULT true;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN custo SET DEFAULT 0;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN data_servico SET DEFAULT CURRENT_DATE;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN nota_fiscal SET DEFAULT ''::text;
ALTER TABLE public.servicos_almoxarifado ALTER COLUMN created_at SET DEFAULT now();
ALTER SEQUENCE public.ordens_servico_numero_os_seq OWNED BY public.ordens_servico.numero_os;

-- 8. PK, UNIQUE, CHECK, EXCLUDE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_auditoria_pkey' AND conrelid = 'public.admin_auditoria'::regclass) THEN
    ALTER TABLE public.admin_auditoria ADD CONSTRAINT admin_auditoria_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apontamentos_os_pkey' AND conrelid = 'public.apontamentos_os'::regclass) THEN
    ALTER TABLE public.apontamentos_os ADD CONSTRAINT apontamentos_os_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_sistema_pkey' AND conrelid = 'public.configuracoes_sistema'::regclass) THEN
    ALTER TABLE public.configuracoes_sistema ADD CONSTRAINT configuracoes_sistema_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diario_horimetro_pkey' AND conrelid = 'public.diario_horimetro'::regclass) THEN
    ALTER TABLE public.diario_horimetro ADD CONSTRAINT diario_horimetro_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_pkey' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_carregamentos_pkey' AND conrelid = 'public.diesel_carregamentos'::regclass) THEN
    ALTER TABLE public.diesel_carregamentos ADD CONSTRAINT diesel_carregamentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_estoque_diario_pkey' AND conrelid = 'public.diesel_estoque_diario'::regclass) THEN
    ALTER TABLE public.diesel_estoque_diario ADD CONSTRAINT diesel_estoque_diario_pkey PRIMARY KEY (tanque_id, data);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_tanques_pkey' AND conrelid = 'public.diesel_tanques'::regclass) THEN
    ALTER TABLE public.diesel_tanques ADD CONSTRAINT diesel_tanques_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_pkey' AND conrelid = 'public.equipamentos'::regclass) THEN
    ALTER TABLE public.equipamentos ADD CONSTRAINT equipamentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_historico_pkey' AND conrelid = 'public.equipamentos_historico'::regclass) THEN
    ALTER TABLE public.equipamentos_historico ADD CONSTRAINT equipamentos_historico_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execucoes_preventiva_pkey' AND conrelid = 'public.execucoes_preventiva'::regclass) THEN
    ALTER TABLE public.execucoes_preventiva ADD CONSTRAINT execucoes_preventiva_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itens_os_estoque_pkey' AND conrelid = 'public.itens_os_estoque'::regclass) THEN
    ALTER TABLE public.itens_os_estoque ADD CONSTRAINT itens_os_estoque_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lotes_estoque_pkey' AND conrelid = 'public.lotes_estoque'::regclass) THEN
    ALTER TABLE public.lotes_estoque ADD CONSTRAINT lotes_estoque_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentacoes_almoxarifado_pkey' AND conrelid = 'public.movimentacoes_almoxarifado'::regclass) THEN
    ALTER TABLE public.movimentacoes_almoxarifado ADD CONSTRAINT movimentacoes_almoxarifado_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fora_do_custo_pkey' AND conrelid = 'public.notas_fora_do_custo'::regclass) THEN
    ALTER TABLE public.notas_fora_do_custo ADD CONSTRAINT notas_fora_do_custo_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obras_pkey' AND conrelid = 'public.obras'::regclass) THEN
    ALTER TABLE public.obras ADD CONSTRAINT obras_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_pkey' AND conrelid = 'public.ordens_servico'::regclass) THEN
    ALTER TABLE public.ordens_servico ADD CONSTRAINT ordens_servico_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'os_pecas_previstas_pkey' AND conrelid = 'public.os_pecas_previstas'::regclass) THEN
    ALTER TABLE public.os_pecas_previstas ADD CONSTRAINT os_pecas_previstas_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pecas_estoque_pkey' AND conrelid = 'public.pecas_estoque'::regclass) THEN
    ALTER TABLE public.pecas_estoque ADD CONSTRAINT pecas_estoque_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuarios_pkey' AND conrelid = 'public.perfis_usuarios'::regclass) THEN
    ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_preventiva_pkey' AND conrelid = 'public.planos_preventiva'::regclass) THEN
    ALTER TABLE public.planos_preventiva ADD CONSTRAINT planos_preventiva_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_estrategias_pkey' AND conrelid = 'public.preventiva_estrategias'::regclass) THEN
    ALTER TABLE public.preventiva_estrategias ADD CONSTRAINT preventiva_estrategias_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_materiais_pkey' AND conrelid = 'public.preventiva_lista_materiais'::regclass) THEN
    ALTER TABLE public.preventiva_lista_materiais ADD CONSTRAINT preventiva_lista_materiais_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_tarefas_pkey' AND conrelid = 'public.preventiva_lista_tarefas'::regclass) THEN
    ALTER TABLE public.preventiva_lista_tarefas ADD CONSTRAINT preventiva_lista_tarefas_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_listas_pkey' AND conrelid = 'public.preventiva_listas'::regclass) THEN
    ALTER TABLE public.preventiva_listas ADD CONSTRAINT preventiva_listas_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_pacotes_pkey' AND conrelid = 'public.preventiva_pacotes'::regclass) THEN
    ALTER TABLE public.preventiva_pacotes ADD CONSTRAINT preventiva_pacotes_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servicos_almoxarifado_pkey' AND conrelid = 'public.servicos_almoxarifado'::regclass) THEN
    ALTER TABLE public.servicos_almoxarifado ADD CONSTRAINT servicos_almoxarifado_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_fonte_chave_externa_key' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_fonte_chave_externa_key UNIQUE (fonte, chave_externa);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_carregamentos_fonte_chave_externa_key' AND conrelid = 'public.diesel_carregamentos'::regclass) THEN
    ALTER TABLE public.diesel_carregamentos ADD CONSTRAINT diesel_carregamentos_fonte_chave_externa_key UNIQUE (fonte, chave_externa);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_tanques_codigo_key' AND conrelid = 'public.diesel_tanques'::regclass) THEN
    ALTER TABLE public.diesel_tanques ADD CONSTRAINT diesel_tanques_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_tag_key' AND conrelid = 'public.equipamentos'::regclass) THEN
    ALTER TABLE public.equipamentos ADD CONSTRAINT equipamentos_tag_key UNIQUE (tag);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obras_codigo_key' AND conrelid = 'public.obras'::regclass) THEN
    ALTER TABLE public.obras ADD CONSTRAINT obras_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'os_pecas_previstas_os_id_peca_id_key' AND conrelid = 'public.os_pecas_previstas'::regclass) THEN
    ALTER TABLE public.os_pecas_previstas ADD CONSTRAINT os_pecas_previstas_os_id_peca_id_key UNIQUE (os_id, peca_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuarios_auth_user_id_key' AND conrelid = 'public.perfis_usuarios'::regclass) THEN
    ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuarios_email_login_key' AND conrelid = 'public.perfis_usuarios'::regclass) THEN
    ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_email_login_key UNIQUE (email_login);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuarios_matricula_key' AND conrelid = 'public.perfis_usuarios'::regclass) THEN
    ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_matricula_key UNIQUE (matricula);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_estrategias_codigo_key' AND conrelid = 'public.preventiva_estrategias'::regclass) THEN
    ALTER TABLE public.preventiva_estrategias ADD CONSTRAINT preventiva_estrategias_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_materiais_lista_id_peca_id_key' AND conrelid = 'public.preventiva_lista_materiais'::regclass) THEN
    ALTER TABLE public.preventiva_lista_materiais ADD CONSTRAINT preventiva_lista_materiais_lista_id_peca_id_key UNIQUE (lista_id, peca_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_listas_codigo_key' AND conrelid = 'public.preventiva_listas'::regclass) THEN
    ALTER TABLE public.preventiva_listas ADD CONSTRAINT preventiva_listas_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_pacotes_estrategia_id_multiplo_key' AND conrelid = 'public.preventiva_pacotes'::regclass) THEN
    ALTER TABLE public.preventiva_pacotes ADD CONSTRAINT preventiva_pacotes_estrategia_id_multiplo_key UNIQUE (estrategia_id, multiplo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apontamentos_os_acao_check' AND conrelid = 'public.apontamentos_os'::regclass) THEN
    ALTER TABLE public.apontamentos_os ADD CONSTRAINT apontamentos_os_acao_check CHECK ((acao = ANY (ARRAY['inicio'::text, 'pausa_peca'::text, 'pausa_outros'::text, 'retomada'::text, 'conclusao'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'config_unica' AND conrelid = 'public.configuracoes_sistema'::regclass) THEN
    ALTER TABLE public.configuracoes_sistema ADD CONSTRAINT config_unica CHECK ((id = 1));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diario_horimetro_medidor_chk' AND conrelid = 'public.diario_horimetro'::regclass) THEN
    ALTER TABLE public.diario_horimetro ADD CONSTRAINT diario_horimetro_medidor_chk CHECK ((medidor = ANY (ARRAY['H'::text, 'KM'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_fonte_check' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_fonte_check CHECK ((fonte = ANY (ARRAY['cta'::text, 'planilha'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_litros_check' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_litros_check CHECK ((litros >= (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_carregamentos_fonte_check' AND conrelid = 'public.diesel_carregamentos'::regclass) THEN
    ALTER TABLE public.diesel_carregamentos ADD CONSTRAINT diesel_carregamentos_fonte_check CHECK ((fonte = ANY (ARRAY['cta'::text, 'planilha'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_carregamentos_litros_check' AND conrelid = 'public.diesel_carregamentos'::regclass) THEN
    ALTER TABLE public.diesel_carregamentos ADD CONSTRAINT diesel_carregamentos_litros_check CHECK ((litros > (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_tanques_tipo_check' AND conrelid = 'public.diesel_tanques'::regclass) THEN
    ALTER TABLE public.diesel_tanques ADD CONSTRAINT diesel_tanques_tipo_check CHECK ((tipo = ANY (ARRAY['FIXO'::text, 'COMBOIO'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itens_os_estoque_status_baixa_check' AND conrelid = 'public.itens_os_estoque'::regclass) THEN
    ALTER TABLE public.itens_os_estoque ADD CONSTRAINT itens_os_estoque_status_baixa_check CHECK ((status_baixa = ANY (ARRAY['reservado'::text, 'pendente_almoxarife'::text, 'confirmado'::text, 'cancelado'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itens_os_estoque_tipo_movimento_check' AND conrelid = 'public.itens_os_estoque'::regclass) THEN
    ALTER TABLE public.itens_os_estoque ADD CONSTRAINT itens_os_estoque_tipo_movimento_check CHECK ((tipo_movimento = ANY (ARRAY['entrada_nf'::text, 'saida_os'::text, 'saida_avulsa'::text, 'saida_direta_nf'::text, 'reserva'::text, 'ajuste'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_estrategias_horizonte_check' AND conrelid = 'public.preventiva_estrategias'::regclass) THEN
    ALTER TABLE public.preventiva_estrategias ADD CONSTRAINT preventiva_estrategias_horizonte_check CHECK ((horizonte >= (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_estrategias_intervalo_base_check' AND conrelid = 'public.preventiva_estrategias'::regclass) THEN
    ALTER TABLE public.preventiva_estrategias ADD CONSTRAINT preventiva_estrategias_intervalo_base_check CHECK ((intervalo_base > (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_estrategias_unidade_check' AND conrelid = 'public.preventiva_estrategias'::regclass) THEN
    ALTER TABLE public.preventiva_estrategias ADD CONSTRAINT preventiva_estrategias_unidade_check CHECK ((unidade = ANY (ARRAY['H'::text, 'KM'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_materiais_quantidade_check' AND conrelid = 'public.preventiva_lista_materiais'::regclass) THEN
    ALTER TABLE public.preventiva_lista_materiais ADD CONSTRAINT preventiva_lista_materiais_quantidade_check CHECK ((quantidade > (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_pacotes_multiplo_check' AND conrelid = 'public.preventiva_pacotes'::regclass) THEN
    ALTER TABLE public.preventiva_pacotes ADD CONSTRAINT preventiva_pacotes_multiplo_check CHECK ((multiplo >= 1));
  END IF;
END $$;

-- 9. Foreign keys (inclui a FK para auth.users)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diario_horimetro_equipamento_id_fkey' AND conrelid = 'public.diario_horimetro'::regclass) THEN
    ALTER TABLE public.diario_horimetro ADD CONSTRAINT diario_horimetro_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_equipamento_id_fkey' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_abastecimentos_tanque_id_fkey' AND conrelid = 'public.diesel_abastecimentos'::regclass) THEN
    ALTER TABLE public.diesel_abastecimentos ADD CONSTRAINT diesel_abastecimentos_tanque_id_fkey FOREIGN KEY (tanque_id) REFERENCES diesel_tanques(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_carregamentos_tanque_id_fkey' AND conrelid = 'public.diesel_carregamentos'::regclass) THEN
    ALTER TABLE public.diesel_carregamentos ADD CONSTRAINT diesel_carregamentos_tanque_id_fkey FOREIGN KEY (tanque_id) REFERENCES diesel_tanques(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diesel_estoque_diario_tanque_id_fkey' AND conrelid = 'public.diesel_estoque_diario'::regclass) THEN
    ALTER TABLE public.diesel_estoque_diario ADD CONSTRAINT diesel_estoque_diario_tanque_id_fkey FOREIGN KEY (tanque_id) REFERENCES diesel_tanques(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_obra_id_fkey' AND conrelid = 'public.equipamentos'::regclass) THEN
    ALTER TABLE public.equipamentos ADD CONSTRAINT equipamentos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_historico_equipamento_id_fkey' AND conrelid = 'public.equipamentos_historico'::regclass) THEN
    ALTER TABLE public.equipamentos_historico ADD CONSTRAINT equipamentos_historico_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execucoes_preventiva_equipamento_id_fkey' AND conrelid = 'public.execucoes_preventiva'::regclass) THEN
    ALTER TABLE public.execucoes_preventiva ADD CONSTRAINT execucoes_preventiva_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execucoes_preventiva_plano_id_fkey' AND conrelid = 'public.execucoes_preventiva'::regclass) THEN
    ALTER TABLE public.execucoes_preventiva ADD CONSTRAINT execucoes_preventiva_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES planos_preventiva(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentacoes_almoxarifado_equipamento_id_fkey' AND conrelid = 'public.movimentacoes_almoxarifado'::regclass) THEN
    ALTER TABLE public.movimentacoes_almoxarifado ADD CONSTRAINT movimentacoes_almoxarifado_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentacoes_almoxarifado_obra_id_fkey' AND conrelid = 'public.movimentacoes_almoxarifado'::regclass) THEN
    ALTER TABLE public.movimentacoes_almoxarifado ADD CONSTRAINT movimentacoes_almoxarifado_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentacoes_almoxarifado_os_id_fkey' AND conrelid = 'public.movimentacoes_almoxarifado'::regclass) THEN
    ALTER TABLE public.movimentacoes_almoxarifado ADD CONSTRAINT movimentacoes_almoxarifado_os_id_fkey FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentacoes_almoxarifado_peca_id_fkey' AND conrelid = 'public.movimentacoes_almoxarifado'::regclass) THEN
    ALTER TABLE public.movimentacoes_almoxarifado ADD CONSTRAINT movimentacoes_almoxarifado_peca_id_fkey FOREIGN KEY (peca_id) REFERENCES pecas_estoque(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_equipamento_id_fkey' AND conrelid = 'public.ordens_servico'::regclass) THEN
    ALTER TABLE public.ordens_servico ADD CONSTRAINT ordens_servico_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_obra_id_fkey' AND conrelid = 'public.ordens_servico'::regclass) THEN
    ALTER TABLE public.ordens_servico ADD CONSTRAINT ordens_servico_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_plano_id_fkey' AND conrelid = 'public.ordens_servico'::regclass) THEN
    ALTER TABLE public.ordens_servico ADD CONSTRAINT ordens_servico_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES planos_preventiva(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'os_pecas_previstas_os_id_fkey' AND conrelid = 'public.os_pecas_previstas'::regclass) THEN
    ALTER TABLE public.os_pecas_previstas ADD CONSTRAINT os_pecas_previstas_os_id_fkey FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'os_pecas_previstas_peca_id_fkey' AND conrelid = 'public.os_pecas_previstas'::regclass) THEN
    ALTER TABLE public.os_pecas_previstas ADD CONSTRAINT os_pecas_previstas_peca_id_fkey FOREIGN KEY (peca_id) REFERENCES pecas_estoque(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pecas_estoque_obra_id_fkey' AND conrelid = 'public.pecas_estoque'::regclass) THEN
    ALTER TABLE public.pecas_estoque ADD CONSTRAINT pecas_estoque_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuarios_auth_user_id_fkey' AND conrelid = 'public.perfis_usuarios'::regclass) THEN
    ALTER TABLE public.perfis_usuarios ADD CONSTRAINT perfis_usuarios_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_preventiva_equipamento_id_fkey' AND conrelid = 'public.planos_preventiva'::regclass) THEN
    ALTER TABLE public.planos_preventiva ADD CONSTRAINT planos_preventiva_equipamento_id_fkey FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_preventiva_estrategia_id_fkey' AND conrelid = 'public.planos_preventiva'::regclass) THEN
    ALTER TABLE public.planos_preventiva ADD CONSTRAINT planos_preventiva_estrategia_id_fkey FOREIGN KEY (estrategia_id) REFERENCES preventiva_estrategias(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_preventiva_os_aberta_id_fkey' AND conrelid = 'public.planos_preventiva'::regclass) THEN
    ALTER TABLE public.planos_preventiva ADD CONSTRAINT planos_preventiva_os_aberta_id_fkey FOREIGN KEY (os_aberta_id) REFERENCES ordens_servico(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_materiais_lista_id_fkey' AND conrelid = 'public.preventiva_lista_materiais'::regclass) THEN
    ALTER TABLE public.preventiva_lista_materiais ADD CONSTRAINT preventiva_lista_materiais_lista_id_fkey FOREIGN KEY (lista_id) REFERENCES preventiva_listas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_materiais_peca_id_fkey' AND conrelid = 'public.preventiva_lista_materiais'::regclass) THEN
    ALTER TABLE public.preventiva_lista_materiais ADD CONSTRAINT preventiva_lista_materiais_peca_id_fkey FOREIGN KEY (peca_id) REFERENCES pecas_estoque(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_lista_tarefas_lista_id_fkey' AND conrelid = 'public.preventiva_lista_tarefas'::regclass) THEN
    ALTER TABLE public.preventiva_lista_tarefas ADD CONSTRAINT preventiva_lista_tarefas_lista_id_fkey FOREIGN KEY (lista_id) REFERENCES preventiva_listas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_pacotes_estrategia_id_fkey' AND conrelid = 'public.preventiva_pacotes'::regclass) THEN
    ALTER TABLE public.preventiva_pacotes ADD CONSTRAINT preventiva_pacotes_estrategia_id_fkey FOREIGN KEY (estrategia_id) REFERENCES preventiva_estrategias(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventiva_pacotes_lista_id_fkey' AND conrelid = 'public.preventiva_pacotes'::regclass) THEN
    ALTER TABLE public.preventiva_pacotes ADD CONSTRAINT preventiva_pacotes_lista_id_fkey FOREIGN KEY (lista_id) REFERENCES preventiva_listas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 10. Índices (os que não pertencem a constraints)
CREATE INDEX IF NOT EXISTS ix_admaud_tab ON public.admin_auditoria USING btree (tabela, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_diario_eq_data ON public.diario_horimetro USING btree (equipamento_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS ix_diario_equip_medidor ON public.diario_horimetro USING btree (equipamento_id, medidor, registrado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_diario_eq_medidor_data ON public.diario_horimetro USING btree (equipamento_id, medidor, registrado_em);
CREATE INDEX IF NOT EXISTS ix_dabast_chave ON public.diesel_abastecimentos USING btree (chave_tag);
CREATE INDEX IF NOT EXISTS ix_dabast_equip_data ON public.diesel_abastecimentos USING btree (equipamento_id, data);
CREATE INDEX IF NOT EXISTS ix_dabast_tanque_data ON public.diesel_abastecimentos USING btree (tanque_id, data);
CREATE INDEX IF NOT EXISTS ix_dcarr_tanque_data ON public.diesel_carregamentos USING btree (tanque_id, data);
CREATE INDEX IF NOT EXISTS ix_eqhist_eq ON public.equipamentos_historico USING btree (equipamento_id, alterado_em DESC);
CREATE INDEX IF NOT EXISTS idx_itens_status ON public.itens_os_estoque USING btree (status_baixa);
CREATE INDEX IF NOT EXISTS idx_lotes_fifo ON public.lotes_estoque USING btree (peca_id, data_entrada) WHERE (quantidade_restante > (0)::numeric);
CREATE INDEX IF NOT EXISTS ix_mov_equip ON public.movimentacoes_almoxarifado USING btree (equipamento_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS ix_mov_nf ON public.movimentacoes_almoxarifado USING btree (numero_nf) WHERE (numero_nf IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_mov_os ON public.movimentacoes_almoxarifado USING btree (os_id) WHERE (os_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_movalm_carga ON public.movimentacoes_almoxarifado USING btree (carga) WHERE (carga IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_nfora_cat ON public.notas_fora_do_custo USING btree (categoria, data);
CREATE UNIQUE INDEX IF NOT EXISTS ux_os_plano_ciclo ON public.ordens_servico USING btree (plano_id, ciclo) WHERE (plano_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_plano_equipamento ON public.planos_preventiva USING btree (equipamento_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_servicos_equip ON public.servicos_almoxarifado USING btree (equipamento_id, data_servico DESC);

-- 11. Views: nenhuma na produção (public/app)

-- 12. Triggers
DROP TRIGGER IF EXISTS trg_carimbo_horimetro ON public.equipamentos;
CREATE TRIGGER trg_carimbo_horimetro BEFORE INSERT OR UPDATE ON public.equipamentos FOR EACH ROW EXECUTE FUNCTION app.carimbo_horimetro();
DROP TRIGGER IF EXISTS trg_log_alteracao_equipamento ON public.equipamentos;
CREATE TRIGGER trg_log_alteracao_equipamento AFTER UPDATE ON public.equipamentos FOR EACH ROW EXECUTE FUNCTION app.log_alteracao_equipamento();
DROP TRIGGER IF EXISTS trg_preventiva_ao_concluir ON public.ordens_servico;
CREATE TRIGGER trg_preventiva_ao_concluir AFTER UPDATE OF status ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION app.preventiva_ao_concluir();
DROP TRIGGER IF EXISTS trg_log_saldo_peca_i ON public.pecas_estoque;
CREATE TRIGGER trg_log_saldo_peca_i AFTER INSERT ON public.pecas_estoque FOR EACH ROW EXECUTE FUNCTION app.log_saldo_peca();
DROP TRIGGER IF EXISTS trg_log_saldo_peca_u ON public.pecas_estoque;
CREATE TRIGGER trg_log_saldo_peca_u AFTER UPDATE OF quantidade ON public.pecas_estoque FOR EACH ROW EXECUTE FUNCTION app.log_saldo_peca();

-- 13. RLS por tabela, exatamente como na produção
ALTER TABLE app._bkp_equipamentos_20261112 DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE app._bkp_merge_equip_20261112 DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.admin_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apontamentos_os DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.configuracoes_sistema DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.diario_horimetro DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.diesel_abastecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diesel_carregamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diesel_estoque_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diesel_tanques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.equipamentos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucoes_preventiva DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.itens_os_estoque DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.lotes_estoque DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.movimentacoes_almoxarifado DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.notas_fora_do_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.ordens_servico DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.os_pecas_previstas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pecas_estoque DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.perfis_usuarios DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.planos_preventiva DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO
ALTER TABLE public.preventiva_estrategias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_lista_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_lista_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_listas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_pacotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos_almoxarifado DISABLE ROW LEVEL SECURITY;  -- produção: RLS DESLIGADO

-- 14. Policies
DROP POLICY IF EXISTS admaud_ins ON public.admin_auditoria;
CREATE POLICY admaud_ins ON public.admin_auditoria AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['admin'::text]));
DROP POLICY IF EXISTS admaud_sel ON public.admin_auditoria;
CREATE POLICY admaud_sel ON public.admin_auditoria AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['admin'::text]));
DROP POLICY IF EXISTS "Acesso App Apontamentos" ON public.apontamentos_os;
CREATE POLICY "Acesso App Apontamentos" ON public.apontamentos_os AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS "Acesso App Config" ON public.configuracoes_sistema;
CREATE POLICY "Acesso App Config" ON public.configuracoes_sistema AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS diesel_abastecimentos_ins ON public.diesel_abastecimentos;
CREATE POLICY diesel_abastecimentos_ins ON public.diesel_abastecimentos AS PERMISSIVE FOR ALL TO authenticated
  USING ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])))
  WITH CHECK ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])));
DROP POLICY IF EXISTS diesel_abastecimentos_sel ON public.diesel_abastecimentos;
CREATE POLICY diesel_abastecimentos_sel ON public.diesel_abastecimentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS diesel_carregamentos_ins ON public.diesel_carregamentos;
CREATE POLICY diesel_carregamentos_ins ON public.diesel_carregamentos AS PERMISSIVE FOR ALL TO authenticated
  USING ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])))
  WITH CHECK ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])));
DROP POLICY IF EXISTS diesel_carregamentos_sel ON public.diesel_carregamentos;
CREATE POLICY diesel_carregamentos_sel ON public.diesel_carregamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS diesel_estoque_diario_ins ON public.diesel_estoque_diario;
CREATE POLICY diesel_estoque_diario_ins ON public.diesel_estoque_diario AS PERMISSIVE FOR ALL TO authenticated
  USING ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])))
  WITH CHECK ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])));
DROP POLICY IF EXISTS diesel_estoque_diario_sel ON public.diesel_estoque_diario;
CREATE POLICY diesel_estoque_diario_sel ON public.diesel_estoque_diario AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS diesel_tanques_ins ON public.diesel_tanques;
CREATE POLICY diesel_tanques_ins ON public.diesel_tanques AS PERMISSIVE FOR ALL TO authenticated
  USING ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])))
  WITH CHECK ((app.tem_cargo(VARIADIC ARRAY['pcm'::text]) OR app.tem_cargo(VARIADIC ARRAY['engenheiro'::text]) OR app.tem_cargo(VARIADIC ARRAY['admin'::text])));
DROP POLICY IF EXISTS diesel_tanques_sel ON public.diesel_tanques;
CREATE POLICY diesel_tanques_sel ON public.diesel_tanques AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS eqhist_select ON public.equipamentos_historico;
CREATE POLICY eqhist_select ON public.equipamentos_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS "Acesso App Itens Estoque" ON public.itens_os_estoque;
CREATE POLICY "Acesso App Itens Estoque" ON public.itens_os_estoque AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS nfora_all ON public.notas_fora_do_custo;
CREATE POLICY nfora_all ON public.notas_fora_do_custo AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['admin'::text, 'engenheiro'::text, 'pcm'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['admin'::text, 'engenheiro'::text, 'pcm'::text]));
DROP POLICY IF EXISTS nfora_sel ON public.notas_fora_do_custo;
CREATE POLICY nfora_sel ON public.notas_fora_do_custo AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS osprev_sel ON public.os_pecas_previstas;
CREATE POLICY osprev_sel ON public.os_pecas_previstas AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_estrategias_sel ON public.preventiva_estrategias;
CREATE POLICY preventiva_estrategias_sel ON public.preventiva_estrategias AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_estrategias_w ON public.preventiva_estrategias;
CREATE POLICY preventiva_estrategias_w ON public.preventiva_estrategias AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]));
DROP POLICY IF EXISTS preventiva_lista_materiais_sel ON public.preventiva_lista_materiais;
CREATE POLICY preventiva_lista_materiais_sel ON public.preventiva_lista_materiais AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_lista_materiais_w ON public.preventiva_lista_materiais;
CREATE POLICY preventiva_lista_materiais_w ON public.preventiva_lista_materiais AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]));
DROP POLICY IF EXISTS preventiva_lista_tarefas_sel ON public.preventiva_lista_tarefas;
CREATE POLICY preventiva_lista_tarefas_sel ON public.preventiva_lista_tarefas AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_lista_tarefas_w ON public.preventiva_lista_tarefas;
CREATE POLICY preventiva_lista_tarefas_w ON public.preventiva_lista_tarefas AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]));
DROP POLICY IF EXISTS preventiva_listas_sel ON public.preventiva_listas;
CREATE POLICY preventiva_listas_sel ON public.preventiva_listas AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_listas_w ON public.preventiva_listas;
CREATE POLICY preventiva_listas_w ON public.preventiva_listas AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]));
DROP POLICY IF EXISTS preventiva_pacotes_sel ON public.preventiva_pacotes;
CREATE POLICY preventiva_pacotes_sel ON public.preventiva_pacotes AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.perfil_ativo());
DROP POLICY IF EXISTS preventiva_pacotes_w ON public.preventiva_pacotes;
CREATE POLICY preventiva_pacotes_w ON public.preventiva_pacotes AS PERMISSIVE FOR ALL TO authenticated
  USING (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]))
  WITH CHECK (app.tem_cargo(VARIADIC ARRAY['pcm'::text, 'engenheiro'::text, 'admin'::text]));

-- 15. GRANTs (tabelas, sequences, funções) iguais aos da produção
-- app._bkp_equipamentos_20261112: ACL padrão na produção (só o dono postgres); nada a conceder
-- app._bkp_merge_equip_20261112: ACL padrão na produção (só o dono postgres); nada a conceder
REVOKE ALL ON TABLE public.admin_auditoria FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.admin_auditoria TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.admin_auditoria TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.admin_auditoria TO service_role;
REVOKE ALL ON TABLE public.apontamentos_os FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.apontamentos_os TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.apontamentos_os TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.apontamentos_os TO service_role;
REVOKE ALL ON TABLE public.configuracoes_sistema FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.configuracoes_sistema TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.configuracoes_sistema TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.configuracoes_sistema TO service_role;
REVOKE ALL ON TABLE public.diario_horimetro FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diario_horimetro TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diario_horimetro TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diario_horimetro TO service_role;
REVOKE ALL ON TABLE public.diesel_abastecimentos FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_abastecimentos TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_abastecimentos TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_abastecimentos TO service_role;
REVOKE ALL ON TABLE public.diesel_carregamentos FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_carregamentos TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_carregamentos TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_carregamentos TO service_role;
REVOKE ALL ON TABLE public.diesel_estoque_diario FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_estoque_diario TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_estoque_diario TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_estoque_diario TO service_role;
REVOKE ALL ON TABLE public.diesel_tanques FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_tanques TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_tanques TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.diesel_tanques TO service_role;
REVOKE ALL ON TABLE public.equipamentos FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos TO service_role;
REVOKE ALL ON TABLE public.equipamentos_historico FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos_historico TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos_historico TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.equipamentos_historico TO service_role;
REVOKE ALL ON TABLE public.execucoes_preventiva FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.execucoes_preventiva TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.execucoes_preventiva TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.execucoes_preventiva TO service_role;
REVOKE ALL ON TABLE public.itens_os_estoque FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.itens_os_estoque TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.itens_os_estoque TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.itens_os_estoque TO service_role;
REVOKE ALL ON TABLE public.lotes_estoque FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.lotes_estoque TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.lotes_estoque TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.lotes_estoque TO service_role;
REVOKE ALL ON TABLE public.movimentacoes_almoxarifado FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.movimentacoes_almoxarifado TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.movimentacoes_almoxarifado TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.movimentacoes_almoxarifado TO service_role;
REVOKE ALL ON TABLE public.notas_fora_do_custo FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.notas_fora_do_custo TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.notas_fora_do_custo TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.notas_fora_do_custo TO service_role;
REVOKE ALL ON TABLE public.obras FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.obras TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.obras TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.obras TO service_role;
REVOKE ALL ON TABLE public.ordens_servico FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ordens_servico TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ordens_servico TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ordens_servico TO service_role;
REVOKE ALL ON SEQUENCE public.ordens_servico_numero_os_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ordens_servico_numero_os_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ordens_servico_numero_os_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ordens_servico_numero_os_seq TO service_role;
REVOKE ALL ON TABLE public.os_pecas_previstas FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.os_pecas_previstas TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.os_pecas_previstas TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.os_pecas_previstas TO service_role;
REVOKE ALL ON TABLE public.pecas_estoque FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.pecas_estoque TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.pecas_estoque TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.pecas_estoque TO service_role;
REVOKE ALL ON TABLE public.perfis_usuarios FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.perfis_usuarios TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.perfis_usuarios TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.perfis_usuarios TO service_role;
REVOKE ALL ON TABLE public.planos_preventiva FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.planos_preventiva TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.planos_preventiva TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.planos_preventiva TO service_role;
REVOKE ALL ON TABLE public.preventiva_estrategias FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_estrategias TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_estrategias TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_estrategias TO service_role;
REVOKE ALL ON TABLE public.preventiva_lista_materiais FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_materiais TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_materiais TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_materiais TO service_role;
REVOKE ALL ON TABLE public.preventiva_lista_tarefas FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_tarefas TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_tarefas TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_lista_tarefas TO service_role;
REVOKE ALL ON TABLE public.preventiva_listas FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_listas TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_listas TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_listas TO service_role;
REVOKE ALL ON TABLE public.preventiva_pacotes FROM PUBLIC, anon, authenticated, service_role;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_pacotes TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_pacotes TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.preventiva_pacotes TO service_role;
REVOKE ALL ON TABLE public.servicos_almoxarifado FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.servicos_almoxarifado TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.servicos_almoxarifado TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.servicos_almoxarifado TO service_role;
REVOKE ALL ON FUNCTION app.ativo() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.ativo() TO authenticated;
REVOKE ALL ON FUNCTION app.cargos() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.cargos() TO authenticated;
REVOKE ALL ON FUNCTION app.carimbo_horimetro() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.carimbo_horimetro() TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.chave_tag(p text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.chave_tag(p text) TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.criar_auth_user(p_email text, p_senha text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.dominio_login() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.dominio_login() TO authenticated;
REVOKE ALL ON FUNCTION app.limite_salto(p_un text, p_base timestamp with time zone, p_quando timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.limite_salto(p_un text, p_base timestamp with time zone, p_quando timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION app.limite_salto(p_un text, p_base timestamp with time zone, p_quando timestamp with time zone) TO authenticated;
REVOKE ALL ON FUNCTION app.log_alteracao_equipamento() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.log_alteracao_equipamento() TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.log_saldo_peca() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.log_saldo_peca() TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.obra_ok(p_obra uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.obra_ok(p_obra uuid) TO authenticated;
REVOKE ALL ON FUNCTION app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer) TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.perfil_ativo() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.perfil_ativo() TO authenticated;
REVOKE ALL ON FUNCTION app.preventiva_ao_concluir() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.preventiva_ao_concluir() TO PUBLIC;  -- produção: ACL padrão (PUBLIC)
REVOKE ALL ON FUNCTION app.slug_login(p text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.slug_login(p text) TO authenticated;
REVOKE ALL ON FUNCTION app.tem_cargo(VARIADIC p_cargos text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.tem_cargo(VARIADIC p_cargos text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_definir_ativo(p_id uuid, p_ativo boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_definir_ativo(p_id uuid, p_ativo boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_salvar_usuario(p_id uuid, p_matricula text, p_nome text, p_senha text, p_cargos jsonb, p_obras jsonb, p_ativo boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_salvar_usuario(p_id uuid, p_matricula text, p_nome text, p_senha text, p_cargos jsonb, p_obras jsonb, p_ativo boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.almox_movimentar(p jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.almox_movimentar(p jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.corrigir_leitura(p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corrigir_leitura(p_id uuid, p_equipamento uuid, p_medidor text, p_leitura numeric, p_motivo text) TO authenticated;
REVOKE ALL ON FUNCTION public.diesel_sincronizar_leituras() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.diesel_sincronizar_leituras() TO authenticated;
REVOKE ALL ON FUNCTION public.diesel_vincular_equipamentos() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.diesel_vincular_equipamentos() TO authenticated;
REVOKE ALL ON FUNCTION public.importar_leituras(p jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.importar_leituras(p jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text, p_registrado_em timestamp with time zone, p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text, p_registrado_em timestamp with time zone, p_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.lancar_horimetro(p_equipamento uuid, p_leitura numeric, p_operador text, p_registrado_em timestamp with time zone, p_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.meu_perfil() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meu_perfil() TO authenticated;
REVOKE ALL ON FUNCTION public.os_assumir(p_os uuid, p_nome text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.os_assumir(p_os uuid, p_nome text) TO authenticated;
REVOKE ALL ON FUNCTION public.preventiva_gerar_os(p_plano uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preventiva_gerar_os(p_plano uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.qr_equipamento(p_id uuid, p_tag text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qr_equipamento(p_id uuid, p_tag text) TO anon;
GRANT EXECUTE ON FUNCTION public.qr_equipamento(p_id uuid, p_tag text) TO authenticated;
REVOKE ALL ON FUNCTION public.recalcular_horimetro_atual() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_horimetro_atual() TO authenticated;
REVOKE ALL ON FUNCTION public.resolver_login(p_texto text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolver_login(p_texto text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolver_login(p_texto text) TO authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;

-- 16. Privilégios padrão do role postgres no schema public (como na produção:
--     novas tabelas só dão TRUNCATE/REFERENCES/TRIGGER/MAINTAIN a anon/authenticated/
--     service_role; novas funções e sequences não dão nada a esses roles)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- 17. Event trigger ensure_rls (produção: liga RLS automaticamente em toda tabela nova
--     do schema public). Criar event trigger pode exigir privilégio que o role postgres
--     não tem; por isso fica protegido. Se falhar, só registra aviso.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    BEGIN
      CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        EXECUTE FUNCTION public.rls_auto_enable();
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'ensure_rls não criado (sem privilégio): %', SQLERRM;
    END;
  END IF;
END $$;

-- fim
