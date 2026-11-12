-- Leituras das tabelas novas exigem perfil ativo (conta criada por fora não lê nada).
create or replace function app.perfil_ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis_usuarios where auth_user_id = auth.uid() and ativo is not false)
$$;
revoke all on function app.perfil_ativo() from public, anon;
grant execute on function app.perfil_ativo() to authenticated;
do $$ declare t text; begin
  foreach t in array array['preventiva_listas','preventiva_lista_tarefas','preventiva_lista_materiais','preventiva_estrategias','preventiva_pacotes'] loop
    execute format('drop policy %I on public.%I', t||'_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.perfil_ativo())', t||'_sel', t);
  end loop;
end $$;
drop policy eqhist_select on public.equipamentos_historico;
create policy eqhist_select on public.equipamentos_historico for select to authenticated using (app.perfil_ativo());
drop policy osprev_sel on public.os_pecas_previstas;
create policy osprev_sel on public.os_pecas_previstas for select to authenticated using (app.perfil_ativo());
