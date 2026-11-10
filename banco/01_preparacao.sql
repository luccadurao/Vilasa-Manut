-- =============================================================================
-- VILASA CMMS - BANCO 01: PREPARAÇÃO PARA LOGIN SEGURO (Supabase Auth + RLS)
--
-- ADITIVO: só cria coisas novas. NÃO liga o RLS e NÃO muda o comportamento do site atual.
-- O site atual (login por perfis_usuarios) continua funcionando normalmente.
-- =============================================================================

-- 1) Schema "app": funções auxiliares usadas pelas regras de acesso (não exposto pela API REST)
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated;

-- 2) Vínculo entre o usuário do sistema (perfis_usuarios) e o login seguro (auth.users)
alter table public.perfis_usuarios
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists email_login text unique;

-- 3) Limites do horímetro configuráveis (mesmos valores que o QR já usava)
alter table public.configuracoes_sistema
  add column if not exists limite_salto_horas numeric not null default 300,
  add column if not exists limite_salto_km numeric not null default 5000;

-- 4) Utilitários -------------------------------------------------------------
create or replace function app.dominio_login() returns text
language sql immutable set search_path = '' as $$ select '@vilasa.invalid'::text $$;

-- "ZE CARLOS" -> "ze.carlos" ; "YASMIN.MESQUITA" -> "yasmin.mesquita"
create or replace function app.slug_login(p text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '.' from regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '.', 'g'))
$$;

-- 5) Quem sou eu? (lidas pelas políticas de acesso) ---------------------------
create or replace function app.ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis_usuarios p
                 where p.auth_user_id = auth.uid() and coalesce(p.ativo, true))
$$;

create or replace function app.cargos() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select array_agg(lower(btrim(c)))
    from public.perfis_usuarios p, jsonb_array_elements_text(p.cargos_lista) as c
    where p.auth_user_id = auth.uid() and coalesce(p.ativo, true)
  ), array[]::text[])
$$;

-- true se o usuário está ativo e tem QUALQUER um dos cargos (admin sempre passa)
create or replace function app.tem_cargo(variadic p_cargos text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.ativo() and ('admin' = any(app.cargos()) or app.cargos() && p_cargos)
$$;

-- Acesso por obra: admin/engenheiro/gestor veem tudo; os demais, só as obras liberadas.
-- Registro sem obra (obra_id nulo) fica visível, igual ao comportamento atual da tela.
create or replace function app.obra_ok(p_obra uuid) returns boolean
language sql stable security definer set search_path = '' as $$
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
$$;

revoke all on function app.dominio_login(), app.slug_login(text), app.ativo(), app.cargos(),
                       app.tem_cargo(text[]), app.obra_ok(uuid) from public;
grant execute on function app.dominio_login(), app.slug_login(text), app.ativo(), app.cargos(),
                          app.tem_cargo(text[]), app.obra_ok(uuid) to authenticated;

-- 6) Criação de usuário no Auth (uso interno; ninguém chama direto) ------------
create or replace function app.criar_auth_user(p_email text, p_senha text) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function app.criar_auth_user(text, text) from public, anon, authenticated;

-- 7) FUNÇÕES PÚBLICAS (chamadas pelo app) ------------------------------------

-- 7a) Tela de login: converte "matrícula / nome / primeiro nome" no login técnico.
--     Só devolve se houver exatamente 1 usuário ativo e já migrado. Nunca devolve senha.
create or replace function public.resolver_login(p_texto text) returns text
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

-- 7b) Perfil de quem está logado (sem senha)
create or replace function public.meu_perfil() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select p.id, p.matricula, p.nome, p.cargos_lista, p.obras_permitidas, p.ativo
    from public.perfis_usuarios p where p.auth_user_id = auth.uid() limit 1) x
$$;

-- 7c) QR Code: dados mínimos do equipamento (para o operador sem login)
create or replace function public.qr_equipamento(p_id uuid default null, p_tag text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select e.id, e.tag, e.nome, e.unidade_medida, e.horimetro_atual, e.obra_id
    from public.equipamentos e
    where (p_id is not null and e.id = p_id)
       or (p_id is null and p_tag is not null and upper(e.tag) = upper(btrim(p_tag)))
    limit 1) x
$$;

-- 7d) QR Code: lançar horímetro/KM (operador sem login). Valida tudo no servidor.
--     Idempotente: reenviar o mesmo p_id não duplica.
create or replace function public.lancar_horimetro(
  p_equipamento uuid, p_leitura numeric, p_operador text default '',
  p_registrado_em timestamptz default null, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipamentos%rowtype;
  v_cfg public.configuracoes_sistema%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_op text := left(btrim(coalesce(p_operador, '')), 80);
  v_quando timestamptz := least(coalesce(p_registrado_em, now()), now());
  v_ultimo timestamptz;
  v_limite numeric;
  v_atual numeric;
begin
  if p_equipamento is null or p_leitura is null or p_leitura <= 0 then
    raise exception 'LEITURA_INVALIDA: informe a leitura do painel.' using errcode = 'P0001';
  end if;
  if v_op = '' then
    raise exception 'OPERADOR_OBRIGATORIO: informe matrícula ou nome.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.diario_horimetro where id = v_id) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  select * into v_eq from public.equipamentos where id = p_equipamento for update;
  if not found then
    raise exception 'EQUIPAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;
  select * into v_cfg from public.configuracoes_sistema limit 1;
  v_limite := case when upper(coalesce(v_eq.unidade_medida, 'H')) = 'KM'
                   then coalesce(v_cfg.limite_salto_km, 5000)
                   else coalesce(v_cfg.limite_salto_horas, 300) end;
  v_atual := coalesce(v_eq.horimetro_atual, 0);
  select max(registrado_em) into v_ultimo from public.diario_horimetro where equipamento_id = p_equipamento;

  if v_atual > 0 and p_leitura < v_atual then
    -- Chegou atrasado (existe leitura mais nova): só registra no diário, não mexe no valor atual.
    if v_ultimo is not null and v_quando < v_ultimo then
      insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em)
      values (v_id, p_equipamento, p_leitura, v_op, v_quando);
      return jsonb_build_object('ok', true, 'atrasado', true, 'horimetro_atual', v_atual);
    end if;
    raise exception 'LEITURA_MENOR: a leitura % é menor que a atual (%).', p_leitura, v_atual using errcode = 'P0001';
  end if;
  if v_atual > 0 and (p_leitura - v_atual) > v_limite then
    raise exception 'SALTO_ALTO: a leitura subiu mais de % de uma só vez.', v_limite using errcode = 'P0001';
  end if;

  insert into public.diario_horimetro (id, equipamento_id, leitura, operador_nome, registrado_em)
  values (v_id, p_equipamento, p_leitura, v_op, v_quando);
  update public.equipamentos set horimetro_atual = p_leitura where id = p_equipamento;
  return jsonb_build_object('ok', true, 'horimetro_atual', p_leitura);
end $$;

-- 7e) ADMIN: criar/editar usuário (cria o login seguro; a senha nunca fica legível no banco)
create or replace function public.admin_salvar_usuario(
  p_id uuid, p_matricula text, p_nome text, p_senha text,
  p_cargos jsonb, p_obras jsonb, p_ativo boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- 7f) ADMIN: ativar / desativar usuário
create or replace function public.admin_definir_ativo(p_id uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- 8) Permissões de execução das funções públicas
revoke all on function public.resolver_login(text), public.meu_perfil(), public.qr_equipamento(uuid, text),
  public.lancar_horimetro(uuid, numeric, text, timestamptz, uuid),
  public.admin_salvar_usuario(uuid, text, text, text, jsonb, jsonb, boolean),
  public.admin_definir_ativo(uuid, boolean) from public;
grant execute on function public.resolver_login(text), public.qr_equipamento(uuid, text),
  public.lancar_horimetro(uuid, numeric, text, timestamptz, uuid) to anon, authenticated;
grant execute on function public.meu_perfil(),
  public.admin_salvar_usuario(uuid, text, text, text, jsonb, jsonb, boolean),
  public.admin_definir_ativo(uuid, boolean) to authenticated;

-- 9) A função do Supabase que religa RLS em tabelas novas não deve ser chamável por ninguém de fora
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
