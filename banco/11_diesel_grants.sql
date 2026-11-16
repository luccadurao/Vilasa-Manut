-- Permissão de acesso às tabelas do diesel (as políticas RLS continuam valendo).
grant select, insert, update, delete on public.diesel_tanques, public.diesel_carregamentos, public.diesel_abastecimentos, public.diesel_estoque_diario to authenticated;
