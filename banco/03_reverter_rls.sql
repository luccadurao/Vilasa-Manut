-- =============================================================================
-- VILASA CMMS - BANCO 03: REVERTER O RLS (botão de emergência)
--
-- Desliga o RLS e devolve as permissões como estavam antes do script 02.
-- Nenhum dado é apagado. As políticas ficam guardadas (sem efeito) e o script 02 pode
-- ser rodado de novo quando o problema for resolvido.
-- ATENÇÃO: com o RLS desligado, as tabelas voltam a ficar abertas para quem tem a chave pública.
-- =============================================================================
alter table public.obras                      disable row level security;
alter table public.perfis_usuarios            disable row level security;
alter table public.equipamentos               disable row level security;
alter table public.ordens_servico             disable row level security;
alter table public.diario_horimetro           disable row level security;
alter table public.planos_preventiva          disable row level security;
alter table public.execucoes_preventiva       disable row level security;
alter table public.pecas_estoque              disable row level security;
alter table public.movimentacoes_almoxarifado disable row level security;
alter table public.lotes_estoque              disable row level security;
alter table public.itens_os_estoque           disable row level security;
alter table public.servicos_almoxarifado      disable row level security;
alter table public.apontamentos_os            disable row level security;
alter table public.configuracoes_sistema      disable row level security;

drop trigger if exists trg_guard_equipamentos on public.equipamentos;

grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
