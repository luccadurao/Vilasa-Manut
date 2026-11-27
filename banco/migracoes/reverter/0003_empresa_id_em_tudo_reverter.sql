-- =============================================================================
-- 0003_empresa_id_em_tudo_reverter.sql — Vilasa-Manut
-- Desfaz 0003_empresa_id_em_tudo.sql e deixa o banco no estado da 0002.
-- Idempotente. psql -1 -v ON_ERROR_STOP=1 -f este arquivo.
--
-- A reversão devolve as unicidades globais (tag, matrícula, código, fonte+chave).
-- Isso só cabe enquanto não houver a mesma chave em duas empresas: com uma
-- segunda empresa real, apague ou separe esses dados antes.
-- As funções voltam ao corpo anterior. empresa_id sai das tabelas de negócio.
-- A config copiada para o módulo frota fica no jsonb: não apaga parâmetro
-- que alguém possa ter editado depois.
-- =============================================================================
SET search_path = '';

CREATE OR REPLACE FUNCTION app.empresa_atual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Etapa 4 passa a ler perfis_usuarios.empresa_id. Até lá só existe a empresa 1.
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$function$;


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


CREATE OR REPLACE FUNCTION app.pacote_do_ciclo(p_estrategia uuid, p_ciclo integer)
 RETURNS public.preventiva_pacotes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pk.* from public.preventiva_pacotes pk
  where pk.estrategia_id = p_estrategia and p_ciclo % pk.multiplo = 0
  order by pk.multiplo desc limit 1
$function$;


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


CREATE OR REPLACE FUNCTION app.validar_empresa_modulos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_modulo public.modulos%ROWTYPE;
  v_faltam text[];
  v_dependentes text[];
  v_ativo boolean;
  v_id text;
  v_empresa uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.modulo_id;
    v_empresa := OLD.empresa_id;
    v_ativo := false;
  ELSE
    v_id := NEW.modulo_id;
    v_empresa := NEW.empresa_id;
    v_ativo := NEW.ativo;
  END IF;

  SELECT * INTO v_modulo FROM public.modulos WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo "%" não está no catálogo.', v_id USING ERRCODE = 'P0001';
  END IF;

  IF v_modulo.obrigatorio AND v_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'O módulo "%" é obrigatório e não pode ser desligado.', v_id USING ERRCODE = 'P0001';
  END IF;

  IF v_ativo IS TRUE THEN
    SELECT coalesce(array_agg(dep ORDER BY dep), ARRAY[]::text[])
      INTO v_faltam
      FROM unnest(coalesce(v_modulo.depende, ARRAY[]::text[])) AS dep
     WHERE NOT EXISTS (
       SELECT 1
       FROM public.empresa_modulos em
       WHERE em.empresa_id = v_empresa
         AND em.modulo_id = dep
         AND em.ativo
         AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
         AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
     );
    IF cardinality(v_faltam) > 0 THEN
      RAISE EXCEPTION 'Não é possível ligar "%" sem as dependências ativas: %.',
        v_id, array_to_string(v_faltam, ', ') USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT coalesce(array_agg(em.modulo_id ORDER BY em.modulo_id), ARRAY[]::text[])
      INTO v_dependentes
      FROM public.empresa_modulos em
      JOIN public.modulos m ON m.id = em.modulo_id
     WHERE em.empresa_id = v_empresa
       AND em.ativo
       AND em.modulo_id <> v_id
       AND v_id = ANY (coalesce(m.depende, ARRAY[]::text[]));
    IF cardinality(v_dependentes) > 0 THEN
      RAISE EXCEPTION 'Não é possível desligar "%" porque estes módulos ativos dependem dele: %.',
        v_id, array_to_string(v_dependentes, ', ') USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;


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


CREATE OR REPLACE FUNCTION public.diesel_vincular_equipamentos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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


CREATE OR REPLACE FUNCTION public.meu_perfil()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT to_jsonb(x) FROM (
    SELECT
      p.id,
      p.matricula,
      p.nome,
      p.cargos_lista,
      p.obras_permitidas,
      p.ativo,
      (
        SELECT jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nome', e.nome,
          'marca', e.marca,
          'termos', e.termos
        )
        FROM public.empresas e
        WHERE e.id = app.empresa_atual()
      ) AS empresa,
      (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', em.modulo_id,
          'versao_config', em.config_versao,
          'config', em.config
        ) ORDER BY em.modulo_id), '[]'::jsonb)
        FROM public.empresa_modulos em
        WHERE em.empresa_id = app.empresa_atual()
          AND em.ativo
          AND (em.inicio IS NULL OR em.inicio <= CURRENT_DATE)
          AND (em.valido_ate IS NULL OR em.valido_ate >= CURRENT_DATE)
      ) AS modulos,
      (
        SELECT coalesce(jsonb_agg(perm.id ORDER BY perm.id), '[]'::jsonb)
        FROM public.permissoes perm
        WHERE app.pode(perm.id)
      ) AS permissoes
    FROM public.perfis_usuarios p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1
  ) x
$function$;


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


DROP FUNCTION IF EXISTS public.resolver_login(text, text);

REVOKE ALL ON FUNCTION public.resolver_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_login(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS app.limite_salto_da_empresa(text, timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS app.limites_medidor(uuid);
DROP FUNCTION IF EXISTS app.email_interno(text, text);

DO $$
DECLARE
  alvo record;
  nome text;
BEGIN
  -- Tira a unicidade por empresa e devolve a global, se ela ainda não existe.
  FOR alvo IN
    SELECT * FROM (VALUES
      ('public.equipamentos', 'equipamentos_empresa_tag_key', 'equipamentos_tag_key', 'UNIQUE (tag)', 'UNIQUE (empresa_id, tag)'),
      ('public.obras', 'obras_empresa_codigo_key', 'obras_codigo_key', 'UNIQUE (codigo)', 'UNIQUE (empresa_id, codigo)'),
      ('public.perfis_usuarios', 'perfis_usuarios_empresa_matricula_key', 'perfis_usuarios_matricula_key', 'UNIQUE (matricula)', 'UNIQUE (empresa_id, matricula)'),
      ('public.diesel_tanques', 'diesel_tanques_empresa_codigo_key', 'diesel_tanques_codigo_key', 'UNIQUE (codigo)', 'UNIQUE (empresa_id, codigo)'),
      ('public.preventiva_estrategias', 'preventiva_estrategias_empresa_codigo_key', 'preventiva_estrategias_codigo_key', 'UNIQUE (codigo)', 'UNIQUE (empresa_id, codigo)'),
      ('public.preventiva_listas', 'preventiva_listas_empresa_codigo_key', 'preventiva_listas_codigo_key', 'UNIQUE (codigo)', 'UNIQUE (empresa_id, codigo)'),
      ('public.diesel_abastecimentos', 'diesel_abastecimentos_empresa_fonte_chave_key', 'diesel_abastecimentos_fonte_chave_externa_key', 'UNIQUE (fonte, chave_externa)', 'UNIQUE (empresa_id, fonte, chave_externa)'),
      ('public.diesel_carregamentos', 'diesel_carregamentos_empresa_fonte_chave_key', 'diesel_carregamentos_fonte_chave_externa_key', 'UNIQUE (fonte, chave_externa)', 'UNIQUE (empresa_id, fonte, chave_externa)')
    ) AS t(relacao, novo_nome, antigo_nome, antigo_def, novo_def)
  LOOP
    IF to_regclass(alvo.relacao) IS NULL THEN
      CONTINUE;
    END IF;
    FOR nome IN
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid = alvo.relacao::regclass AND c.contype = 'u'
        AND (
          c.conname = alvo.novo_nome
          OR replace(pg_get_constraintdef(c.oid), ' ', '') = replace(alvo.novo_def, ' ', '')
        )
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', alvo.relacao, nome);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = alvo.relacao::regclass AND c.contype = 'u'
        AND replace(pg_get_constraintdef(c.oid), ' ', '') = replace(alvo.antigo_def, ' ', '')
    ) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', alvo.relacao, alvo.antigo_nome, alvo.antigo_def);
    END IF;
  END LOOP;

  IF to_regclass('public.ordens_servico') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_empresa_numero_key';
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'admin_auditoria', 'apontamentos_os', 'configuracoes_sistema', 'diario_horimetro',
    'diesel_abastecimentos', 'diesel_carregamentos', 'diesel_estoque_diario', 'diesel_tanques',
    'equipamentos', 'equipamentos_historico', 'execucoes_preventiva', 'itens_os_estoque',
    'lotes_estoque', 'movimentacoes_almoxarifado', 'notas_fora_do_custo', 'obras',
    'ordens_servico', 'os_pecas_previstas', 'pecas_estoque', 'perfis_usuarios',
    'planos_preventiva', 'preventiva_estrategias', 'preventiva_lista_materiais',
    'preventiva_lista_tarefas', 'preventiva_listas', 'preventiva_pacotes', 'servicos_almoxarifado'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_empresa_id_fkey' AND conrelid = ('public.' || t)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, t || '_empresa_id_fkey');
    END IF;
    EXECUTE format('DROP INDEX IF EXISTS public.%I', t || '_empresa_id_idx');
    IF EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = ('public.' || t)::regclass AND attname = 'empresa_id' AND NOT attisdropped
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP COLUMN empresa_id', t);
    END IF;
  END LOOP;
END $$;

DELETE FROM public.migracoes_aplicadas
WHERE escopo = 'plataforma' AND arquivo = '0003_empresa_id_em_tudo.sql';
