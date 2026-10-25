// ============================================================================
// CONFIGURAÇÃO DE CONEXÃO COM O SUPABASE - VILASA MANUTENÇÃO
// ============================================================================

const SUPABASE_URL = "https://yoignpytyegagpfuvoxu.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvaWducHl0eWVnYWdwZnV2b3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTM0MzgsImV4cCI6MjEwODA4OTQzOH0.yUYeQSX5wWr_WvGSPCfZ2e4Rxx80dSjW8FAeYKOrTmM";

// Inicializa o cliente do Supabase globalmente
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
