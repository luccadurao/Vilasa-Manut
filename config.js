// ============================================================================
// CONFIGURAÇÃO DE CONEXÃO COM O SUPABASE - VILASA MANUTENÇÃO
// ============================================================================

const SUPABASE_URL = "https://yoignpytyegagpfuvoxu.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvaWducHl0eWVnYWdwZnV2b3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTM0MzgsImV4cCI6MjEwODA4OTQzOH0.yUYeQSX5wWr_WvGSPCfZ2e4Rxx80dSjW8FAeYKOrTmM";

// Inicializa o cliente do Supabase globalmente.
// "var" + try/catch: se a biblioteca ainda não carregou (ex.: abriu sem internet), o app NÃO quebra;
// obterClienteSupabase() (core.js) tenta criar o cliente de novo quando precisar.
var db = null;
try {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('Supabase ainda não disponível (modo offline?):', e);
}
