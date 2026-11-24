-- =============================================================================
-- seed_ficticia_local.sql — só para o Postgres local da etapa 6.
-- Não é migração. Não rode no Supabase de produção nem no de homologação
-- se esse banco já tiver dados reais.
--
-- Cria uma obra, uma máquina e três perfis fictícios (mecânico, almoxarife
-- e uma empresa com versão mínima própria). Os testes_0005.sql só leem.
-- Idempotente.
-- =============================================================================
SET search_path = '';

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.empresas (id, codigo, nome, versao_minima_app)
VALUES (
  '00000000-0000-4000-8000-0000000000aa',
  'OUTRA-VERSAO',
  'Empresa Fictícia',
  'v99'
)
ON CONFLICT (id) DO UPDATE
SET versao_minima_app = EXCLUDED.versao_minima_app
WHERE public.empresas.versao_minima_app IS NULL;

INSERT INTO public.obras (id, codigo, nome, ativa, empresa_id)
SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'OBRA-FICT',
  'Obra Fictícia',
  true,
  '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.obras WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO public.equipamentos (id, tag, nome, unidade_medida, horimetro_atual, obra_id, empresa_id, situacao_ciclo)
SELECT
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'QR-FICT',
  'MÁQUINA FICTÍCIA',
  'H',
  10,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001',
  'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipamentos WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

INSERT INTO public.perfis_usuarios (
  id, matricula, nome, senha_acesso, cargos_lista, obras_permitidas, ativo, auth_user_id, email_login, empresa_id
)
SELECT *
FROM (
  VALUES
    (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      'MEC-FICT',
      'Mecânico Fictício',
      'ficticia-nao-e-senha',
      '["mecanico"]'::jsonb,
      '["TODAS"]'::jsonb,
      true,
      '11111111-1111-4111-8111-111111111111'::uuid,
      'mec-fict@vilasa.invalid',
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
    (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
      'ALM-FICT',
      'Almoxarife Fictício',
      'ficticia-nao-e-senha',
      '["almoxarife"]'::jsonb,
      '["TODAS"]'::jsonb,
      true,
      '22222222-2222-4222-8222-222222222222'::uuid,
      'alm-fict@vilasa.invalid',
      '00000000-0000-0000-0000-000000000001'::uuid
    )
) AS s(id, matricula, nome, senha_acesso, cargos_lista, obras_permitidas, ativo, auth_user_id, email_login, empresa_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.perfis_usuarios p WHERE p.id = s.id
);
