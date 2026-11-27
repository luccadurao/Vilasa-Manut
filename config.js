// ============================================================================
// CONEXÃO COM O SUPABASE, ESCOLHIDA PELO ENDEREÇO DO SITE
// ============================================================================
// Cada cliente tem o próprio projeto Supabase. O endereço em que o site abriu
// decide qual banco usar:
//   - endereço listado em AMBIENTES.producao[].enderecos → banco daquele cliente;
//   - qualquer outro endereço (preview da Vercel, homologação, localhost,
//     endereço novo ainda não cadastrado) → banco de HOMOLOGAÇÃO.
// Endereço desconhecido nunca cai na produção.
//
// Só entram aqui URL e chave "anon"/publishable, que são públicas por natureza
// (o navegador precisa delas). Chave service_role, senha ou token: nunca.

var AMBIENTES = {
  homologacao: {
    id: 'homologacao',
    nome: 'Homologação',
    url: 'https://zqjgruwmqomgguxoxiuv.supabase.co',
    chave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxamdydXdtcW9tZ2d1eG94aXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1NDkzOTcsImV4cCI6MjExMTEyNTM5N30.S9KruQuicXrv-zNHAunlOBcjc3vPNJkni6nwdOzq2Xs',
    producao: false
  },
  producao: [
    {
      id: 'vilasa',
      nome: 'Produção Vilasa',
      enderecos: ['vilasa-manut.vercel.app'],
      url: 'https://yoignpytyegagpfuvoxu.supabase.co',
      chave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvaWducHl0eWVnYWdwZnV2b3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTM0MzgsImV4cCI6MjEwODA4OTQzOH0.yUYeQSX5wWr_WvGSPCfZ2e4Rxx80dSjW8FAeYKOrTmM',
      producao: true
    }
  ]
};

/**
 * Escolhe o ambiente pelo hostname. Comparação exata, sem curinga:
 * "vilasa-manut-git-x.vercel.app" (preview) não é produção.
 * @param {string} hostname
 */
function ambienteDoEndereco(hostname) {
  var host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  for (var i = 0; i < AMBIENTES.producao.length; i++) {
    var amb = AMBIENTES.producao[i];
    if (amb.enderecos.indexOf(host) !== -1) return amb;
  }
  return AMBIENTES.homologacao;
}

var AMBIENTE_ATUAL = ambienteDoEndereco(typeof location !== 'undefined' ? location.hostname : '');
var SUPABASE_URL = AMBIENTE_ATUAL.url;
var SUPABASE_ANON_KEY = AMBIENTE_ATUAL.chave;

// Fora da produção, uma etiqueta fixa no canto avisa que o banco é de teste.
if (!AMBIENTE_ATUAL.producao && typeof document !== 'undefined') {
  var mostrarEtiquetaAmbiente = function () {
    if (!document.body || document.getElementById('etiqueta-ambiente')) return;
    var etiqueta = document.createElement('div');
    etiqueta.id = 'etiqueta-ambiente';
    etiqueta.textContent = AMBIENTE_ATUAL.nome.toUpperCase();
    etiqueta.setAttribute('role', 'status');
    etiqueta.style.cssText = 'position:fixed;bottom:6px;left:6px;z-index:99999;' +
      'background:#f59e0b;color:#111;font:700 10px/1.4 system-ui,sans-serif;' +
      'padding:2px 6px;border-radius:4px;pointer-events:none;opacity:.9;';
    document.body.appendChild(etiqueta);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mostrarEtiquetaAmbiente);
  } else {
    mostrarEtiquetaAmbiente();
  }
}

// Inicializa o cliente do Supabase globalmente.
// "var" + try/catch: se a biblioteca ainda não carregou (ex.: abriu sem internet), o app NÃO quebra;
// obterClienteSupabase() (core.js) tenta criar o cliente de novo quando precisar.
var db = null;
try {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('Supabase ainda não disponível (modo offline?):', e);
}
