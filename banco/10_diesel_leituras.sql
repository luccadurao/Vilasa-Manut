-- Leituras (horímetro/odômetro) vindas do CTA entram no histórico da Frota SÓ se passarem nas
-- regras de salto. As que não passam continuam servindo apenas para calcular consumo.
create or replace function public.diesel_sincronizar_leituras() returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.diesel_sincronizar_leituras() from public, anon;
grant execute on function public.diesel_sincronizar_leituras() to authenticated;
revoke all on function public.diesel_vincular_equipamentos() from public, anon;
grant execute on function public.diesel_vincular_equipamentos() to authenticated;
