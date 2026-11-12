-- ALMOXARIFADO: movimentos atômicos (saldo + histórico na mesma operação), custo médio, nota aplicada,
-- vínculo com OS e "quem retirou/comprou". 100% aditivo: o app antigo continua funcionando.
alter table public.movimentacoes_almoxarifado
  add column if not exists os_id uuid references public.ordens_servico(id) on delete set null,
  add column if not exists retirado_por text,
  add column if not exists motivo text,
  add column if not exists saldo_apos numeric,
  add column if not exists criado_por uuid;
create index if not exists ix_mov_equip on public.movimentacoes_almoxarifado (equipamento_id, registrado_em desc);
create index if not exists ix_mov_os   on public.movimentacoes_almoxarifado (os_id) where os_id is not null;
create index if not exists ix_mov_nf   on public.movimentacoes_almoxarifado (numero_nf) where numero_nf is not null;

-- Qualquer mudança de saldo feita FORA da função (edição direta, planilha rápida, app antigo) vira um lançamento no histórico.
create or replace function app.log_saldo_peca() returns trigger
language plpgsql security definer set search_path = '' as $$
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
end $$;
drop trigger if exists trg_log_saldo_peca_i on public.pecas_estoque;
drop trigger if exists trg_log_saldo_peca_u on public.pecas_estoque;
create trigger trg_log_saldo_peca_i after insert on public.pecas_estoque for each row execute function app.log_saldo_peca();
create trigger trg_log_saldo_peca_u after update of quantidade on public.pecas_estoque for each row execute function app.log_saldo_peca();

create or replace function public.almox_movimentar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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

  perform set_config('app.mov_ok', '1', true);   -- o histórico abaixo já é o registro; evita lançamento duplicado pelo gatilho

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
      if v_valor > 0 then   -- custo médio ponderado
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
    v_delta := v_qtd - v_saldo;               -- v_qtd = quantidade CONTADA
    v_grava_qtd := v_delta;
    v_valor := v_custo;
    v_saldo := v_qtd;
    update public.pecas_estoque set quantidade = v_saldo where id = v_peca_id;
  end if;
  -- NOTA_APLICADA: compra feita na rua e já usada na máquina; não mexe no estoque.

  insert into public.movimentacoes_almoxarifado
    (id, obra_id, tipo_movimento, numero_nf, fornecedor, peca_id, descricao_item, quantidade, valor_unitario,
     equipamento_id, os_id, retirado_por, observacao, motivo, saldo_apos, criado_por, registrado_em)
  values (v_id, v_obra, v_tipo, nullif(v_nf, ''), nullif(v_forn, ''), v_peca_id, v_desc, v_grava_qtd, v_valor,
          v_eq_id, v_os_id, nullif(v_quem, ''), nullif(v_obs, ''), nullif(v_motivo, ''), v_saldo, auth.uid(), v_quando);

  perform set_config('app.mov_ok', '', true);
  return jsonb_build_object('ok', true, 'saldo_apos', v_saldo, 'custo', v_custo);
end $$;
revoke all on function public.almox_movimentar(jsonb) from public, anon;
grant execute on function public.almox_movimentar(jsonb) to authenticated;
