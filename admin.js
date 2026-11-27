// ============================================================================
// VILASA CMMS V2 - MÓDULO 9: ADMIN.JS (USUÁRIOS, OBRAS E EDITOR MODO DEUS)
// ============================================================================

let subAbaAdminAtual = 'usuarios';
let cacheLinhasModoDeus = [];

async function carregarUsuariosAdmin(subAba = subAbaAdminAtual) {
  if (!podeExecutarAcao('acesso_modo_deus', true)) return;
  subAbaAdminAtual = subAba;

  try {
    const [resUsers, resObras] = await Promise.all([
      db.from('perfis_usuarios').select('id, matricula, nome, cargos_lista, obras_permitidas, ativo').order('nome'),
      db.from('obras').select('*').order('codigo')
    ]);

    cacheUsuarios = resUsers.data || [];
    cacheObras = resObras.data || [];
  } catch (e) {
    console.error('Erro ao carregar dados do Admin:', e);
  }

  renderizarPainelAdminV2();
}

function renderizarPainelAdminV2() {
  const sec = document.getElementById('sec-admin');
  if (!sec) return;

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-950 border-2 border-amber-500 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GOVERNANÇA CORPORATIVA • CONTROLE MESTRE</span>
          <h2 class="text-lg font-black">Usuários, Obras & Editor Modo Deus</h2>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarUsuariosAdmin('usuarios')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'usuarios' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            👥 Usuários (${cacheUsuarios.length})
          </button>
          <button onclick="carregarUsuariosAdmin('obras')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'obras' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            🏗️ Obras (${cacheObras.length})
          </button>
          <button onclick="carregarUsuariosAdmin('modo_deus')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'modo_deus' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            ⚡ Controle Mestre (Editar Tabelas)
          </button>
        </div>
      </div>

      ${subAbaAdminAtual === 'usuarios' ? renderizarSecaoUsuariosMultiCargo() : ''}
      ${subAbaAdminAtual === 'obras' ? renderizarSecaoGerenciarObras() : ''}
      ${subAbaAdminAtual === 'modo_deus' ? renderizarSecaoModoDeusTabelas() : ''}
    </div>
  `;

  if (subAbaAdminAtual === 'modo_deus') carregarTabelaEditorAdmin();
}

// ----------------------------------------------------------------------------
// 1. GESTÃO DE USUÁRIOS (SEM COLUNAS DUPLICADAS)
// ----------------------------------------------------------------------------
function renderizarSecaoUsuariosMultiCargo() {
  const listaCargosDisponiveis = [
    { id: 'mecanico', label: '🔧 Mecânico / Comboio (Aparece na Lista de Executantes)' },
    { id: 'encarregado', label: '👷 Encarregado (Apenas abre OS e vê abertas)' },
    { id: 'almoxarife', label: '📦 Almoxarife' },
    { id: 'pcm', label: '📋 Analista PCM' },
    { id: 'engenheiro', label: '⚙️ Engenheiro' },
    { id: 'gestor', label: '👁️ Gestor (Somente Visualização e Relatórios)' },
    { id: 'admin', label: '👑 Administrador Master' }
  ];

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">➕ Cadastrar / Atualizar Usuário</h3>
        <input type="hidden" id="admUserIdEdit" value="" />
        <div class="grid grid-cols-2 gap-2">
          <input id="admUserMatricula" type="text" placeholder="Login / Matrícula" class="border rounded-lg p-2 font-black uppercase" />
          <input id="admUserSenha" type="text" placeholder="Senha (mín. 6; em branco = manter)" autocomplete="new-password" class="border rounded-lg p-2 font-bold" />
        </div>
        <input id="admUserNome" type="text" placeholder="Nome Completo" class="w-full border rounded-lg p-2 font-bold uppercase" />

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">1. Cargos:</label>
          <div class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border">
            ${listaCargosDisponiveis.map(c => `
              <label class="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input type="checkbox" value="${c.id}" class="chk-cargo-adm rounded" /><span>${esc(c.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">2. Obras Liberadas:</label>
          <div class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border max-h-36 overflow-y-auto">
            <label class="flex items-center gap-2 font-black text-amber-800 cursor-pointer">
              <input type="checkbox" value="TODAS" checked class="chk-obra-adm rounded" /><span>🌐 TODAS AS OBRAS</span>
            </label>
            ${cacheObras.map(o => `
              <label class="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" value="${o.id}" class="chk-obra-adm rounded" /><span>📍 ${esc(o.codigo)} - ${esc(o.nome)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <button onclick="salvarUsuarioMultiCargoAdmin()" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase shadow">
          💾 Salvar Usuário
        </button>
      </div>

      <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table class="w-full text-left border-collapse text-xs">
          <thead><tr class="bg-slate-900 text-amber-400 uppercase text-[11px]"><th class="p-3">Login / Nome</th><th class="p-3">Cargos</th><th class="p-3">Status</th><th class="p-3 text-right">Ações</th></tr></thead>
          <tbody class="divide-y divide-slate-200">
            ${cacheUsuarios.map(u => {
              const cargos = obterCargosUsuario(u);
              return `
                <tr class="hover:bg-slate-50">
                  <td class="p-3"><span class="bg-slate-900 text-amber-400 font-black px-2 py-0.5 rounded text-[11px]">${esc(u.matricula)}</span><div class="font-extrabold mt-1">${esc(u.nome)}</div></td>
                  <td class="p-3"><div class="flex flex-wrap gap-1">${cargos.map(c => `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-black uppercase text-[10px]">${c}</span>`).join('')}</div></td>
                  <td class="p-3 font-black ${u.ativo !== false ? 'text-emerald-700' : 'text-rose-600'}">${u.ativo !== false ? 'ATIVO' : 'INATIVO'}</td>
                  <td class="p-3 text-right space-x-1 whitespace-nowrap">
                    <button onclick="preencherUsuarioParaEdicaoAdmin('${u.id}')" class="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-bold">✏️ Editar</button>
                    <button onclick="alternarAtivoUsuarioAdmin('${u.id}', ${u.ativo !== false})" class="px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-bold">${u.ativo !== false ? '🚫 Inativar' : '✅ Ativar'}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function preencherUsuarioParaEdicaoAdmin(userId) {
  const u = cacheUsuarios.find(x => String(x.id) === String(userId));
  if (!u) return;
  document.getElementById('admUserIdEdit').value = u.id;
  document.getElementById('admUserMatricula').value = u.matricula || '';
  document.getElementById('admUserSenha').value = ''; // a senha nunca é exibida; deixe em branco para manter
  document.getElementById('admUserNome').value = u.nome || '';

  const cargos = obterCargosUsuario(u);
  document.querySelectorAll('.chk-cargo-adm').forEach(chk => { chk.checked = cargos.includes(chk.value); });

  const obras = Array.isArray(u.obras_permitidas) && u.obras_permitidas.length > 0 ? u.obras_permitidas : ['TODAS'];
  document.querySelectorAll('.chk-obra-adm').forEach(chk => { chk.checked = obras.includes(chk.value); });
}

async function salvarUsuarioMultiCargoAdmin() {
  const idEdit = document.getElementById('admUserIdEdit').value || null;
  const matricula = document.getElementById('admUserMatricula').value.trim().toUpperCase();
  const senha = document.getElementById('admUserSenha').value.trim();
  const nome = document.getElementById('admUserNome').value.trim().toUpperCase();
  const cargos_lista = Array.from(document.querySelectorAll('.chk-cargo-adm:checked')).map(c => c.value);
  const obras_permitidas = Array.from(document.querySelectorAll('.chk-obra-adm:checked')).map(o => o.value);

  if (!matricula || !nome || cargos_lista.length === 0) return alert('Preencha Login, Nome e marque pelo menos 1 Cargo!');
  if (!idEdit && !senha) return alert('Informe uma senha (mínimo 6 caracteres) para o novo usuário.');
  if (senha && senha.length < 6) return alert('A senha precisa ter pelo menos 6 caracteres.');
  if (!navigator.onLine) return alert('📵 Cadastro de usuários precisa de internet.');

  const { error } = await db.rpc('admin_salvar_usuario', {
    p_id: idEdit,
    p_matricula: matricula,
    p_nome: nome,
    p_senha: senha,
    p_cargos: cargos_lista,
    p_obras: obras_permitidas.length > 0 ? obras_permitidas : ['TODAS'],
    p_ativo: true
  });
  if (error) return alert('❌ Não foi possível salvar: ' + error.message);

  alert('✅ Usuário salvo com sucesso!');
  await carregarUsuariosAdmin('usuarios');
}

async function alternarAtivoUsuarioAdmin(userId, estadoAtual) {
  if (!navigator.onLine) return alert('📵 Precisa de internet.');
  const { error } = await db.rpc('admin_definir_ativo', { p_id: userId, p_ativo: !estadoAtual });
  if (error) return alert('❌ Não foi possível alterar: ' + error.message);
  await carregarUsuariosAdmin('usuarios');
}

// ----------------------------------------------------------------------------
// 2. GESTÃO DE OBRAS (3 COLUNAS LIMPAS: codigo, nome, ativa)
// ----------------------------------------------------------------------------
function renderizarSecaoGerenciarObras() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">🏗️ Nova Frente de Obra</h3>
        <input id="admObraCodigo" type="text" placeholder="Código (Ex: OBRA-02)" class="w-full border rounded-lg p-2 font-black uppercase" />
        <input id="admObraNome" type="text" placeholder="Nome da Obra" class="w-full border rounded-lg p-2 font-bold uppercase" />
        <button onclick="criarNovaObraAdmin()" class="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black uppercase shadow">+ Cadastrar Obra</button>
      </div>
      <div class="md:col-span-2 bg-white rounded-2xl border overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead><tr class="bg-slate-900 text-amber-400 uppercase text-[11px]"><th class="p-3">Código</th><th class="p-3">Nome da Obra</th><th class="p-3">Status</th></tr></thead>
          <tbody class="divide-y">
            ${cacheObras.map(o => `<tr><td class="p-3 font-black text-amber-700">${esc(o.codigo)}</td><td class="p-3 font-extrabold">${esc(o.nome)}</td><td class="p-3 font-black text-emerald-700">${o.ativa !== false ? 'ATIVA' : 'ENCERRADA'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function criarNovaObraAdmin() {
  const codigo = document.getElementById('admObraCodigo').value.trim().toUpperCase();
  const nome = document.getElementById('admObraNome').value.trim().toUpperCase();
  if (!codigo || !nome) return alert('Informe Código e Nome da Obra!');
  if (!navigator.onLine) return alert('📵 Precisa de internet.');
  if (cacheObras.some(o => String(o.codigo).toUpperCase() === codigo)) return alert('Já existe uma obra com esse código.');
  const { error } = await db.from('obras').insert([{ codigo, nome, ativa: true }]);
  if (error) return alert('❌ Não foi possível cadastrar: ' + error.message);
  await carregarObrasEMontarSeletorTopo();
  await carregarUsuariosAdmin('obras');
}

// ----------------------------------------------------------------------------
// 3. CONTROLE MESTRE (MODO DEUS) EDITÁVEL
// ----------------------------------------------------------------------------
function renderizarSecaoModoDeusTabelas() {
  return `
    <div class="bg-white p-5 rounded-2xl border-2 border-amber-500 space-y-3 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black uppercase text-slate-900">⚡ Controle Mestre: Editor Direto das 8 Tabelas</h3>
          <p class="text-[11px] text-slate-500">Altere qualquer célula e clique em <strong>💾 Salvar</strong> na linha correspondente.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input id="filtroBuscaModoDeus" type="text" oninput="filtrarLinhasModoDeusNaTela()" placeholder="🔍 Filtrar..." class="border rounded-lg px-3 py-1.5 font-bold uppercase" />
          <select id="editorTabelaSelect" onchange="carregarTabelaEditorAdmin()" class="border-2 border-slate-900 rounded-lg p-2 font-black bg-amber-50">
            <option value="equipamentos">1. equipamentos</option>
            <option value="pecas_estoque">2. pecas_estoque</option>
            <option value="ordens_servico">3. ordens_servico</option>
            <option value="planos_preventiva">4. planos_preventiva</option>
            <option value="execucoes_preventiva">5. execucoes_preventiva</option>
            <option value="movimentacoes_almoxarifado">6. movimentacoes_almoxarifado</option>
            <option value="obras">8. obras</option>
            <option value="diario_horimetro">9. diario_horimetro</option>
          </select>
        </div>
      </div>
      <div id="containerTabelaModoDeus" class="overflow-x-auto max-h-[520px] border rounded-xl"></div>
    </div>
  `;
}

async function carregarTabelaEditorAdmin() {
  const tabela = document.getElementById('editorTabelaSelect')?.value || 'equipamentos';
  const cont = document.getElementById('containerTabelaModoDeus');
  if (!cont) return;
  cont.innerHTML = `<p class="p-4 text-slate-500 font-bold">Carregando ${tabela}...</p>`;
  cacheLinhasModoDeus = await buscarTudoSemLimite(tabela, null, false,
    '*');
  filtrarLinhasModoDeusNaTela();
}

function filtrarLinhasModoDeusNaTela() {
  const tabela = document.getElementById('editorTabelaSelect')?.value || 'equipamentos';
  const termo = (document.getElementById('filtroBuscaModoDeus')?.value || '').trim().toUpperCase();
  const cont = document.getElementById('containerTabelaModoDeus');
  if (!cont) return;

  if (!cacheLinhasModoDeus || cacheLinhasModoDeus.length === 0) {
    cont.innerHTML = `<p class="p-4 text-slate-400 font-bold">Tabela vazia.</p>`;
    return;
  }

  let lista = cacheLinhasModoDeus;
  if (termo) lista = lista.filter(row => JSON.stringify(row).toUpperCase().includes(termo));
  const colunasEditaveis = Object.keys(cacheLinhasModoDeus[0]).filter(c => c !== 'id');

  cont.innerHTML = `
    <table class="w-full text-left border-collapse text-[11px]">
      <thead>
        <tr class="bg-slate-900 text-amber-400 uppercase">
          <th class="p-2 border border-slate-700">Ações</th>
          ${colunasEditaveis.map(c => `<th class="p-2 border border-slate-700">${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${lista.slice(0, 150).map(row => `
          <tr class="hover:bg-amber-50/40">
            <td class="p-1.5 border whitespace-nowrap space-x-1">
              <button onclick="salvarLinhaEditadaModoDeus('${tabela}', '${row.id}', this)" class="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-black">💾 Salvar</button>
              <button onclick="excluirLinhaModoDeus('${tabela}', '${row.id}', this)" class="px-2 py-1 rounded bg-rose-600 text-white font-black">🗑️</button>
            </td>
            ${colunasEditaveis.map(col => {
              const val = row[col];
              const ehObj = typeof val === 'object' && val !== null;
              const txt = ehObj ? JSON.stringify(val) : String(val ?? '');
              return `<td class="p-1 border"><input type="text" data-col="${col}" data-is-json="${ehObj ? '1' : '0'}" value="${txt.replace(/"/g, '&quot;')}" class="inp-celula-modo-deus w-full min-w-[110px] px-1.5 py-1 rounded border font-semibold" /></td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function registrarAuditoriaAdmin(tabela, registroId, acao, antes, depois) {
  const { error } = await db.from('admin_auditoria').insert([{ tabela, registro_id: String(registroId), acao, antes, depois }]);
  if (error) console.error('Auditoria não gravada:', error.message);
  return !error;
}

async function salvarLinhaEditadaModoDeus(tabela, idRegistro, btnEl) {
  if (!navigator.onLine) return alert('📵 Precisa de internet.');
  const original = (cacheLinhasModoDeus || []).find(r => String(r.id) === String(idRegistro));
  if (!original) return alert('Registro não encontrado. Recarregue a tabela.');
  const tr = btnEl.closest('tr');
  const mudancas = {};
  for (const inp of tr.querySelectorAll('.inp-celula-modo-deus')) {
    const col = inp.dataset.col;
    const raw = inp.value.trim();
    const orig = original[col];
    let novo;
    if (raw === '') novo = null;
    else if (inp.dataset.isJson === '1') {
      try { novo = JSON.parse(raw); } catch (e) { novo = raw.split(',').map(x => x.trim()); }
    } else if (typeof orig === 'number') {
      novo = Number(raw.replace(',', '.'));
      if (isNaN(novo)) return alert(`Valor inválido em "${col}": esperado número.`);
    } else if (typeof orig === 'boolean') {
      novo = raw === 'true';
    } else novo = raw;
    if (JSON.stringify(novo) !== JSON.stringify(orig ?? null)) mudancas[col] = novo;
  }
  if (!Object.keys(mudancas).length) return alert('Nada foi alterado nesta linha.');
  const antes = {};
  Object.keys(mudancas).forEach(c => { antes[c] = original[c] ?? null; });

  const { error } = await db.from(tabela).update(mudancas).eq('id', idRegistro);
  if (error) return alert('Erro ao salvar: ' + error.message);
  await registrarAuditoriaAdmin(tabela, idRegistro, 'UPDATE', antes, mudancas);
  Object.assign(original, mudancas);
  btnEl.innerText = '✅ Salvo!';
  setTimeout(() => { btnEl.innerText = '💾 Salvar'; }, 1500);
}

async function excluirLinhaModoDeus(tabela, idRegistro, btnEl) {
  if (!navigator.onLine) return alert('📵 Precisa de internet.');
  const original = (cacheLinhasModoDeus || []).find(r => String(r.id) === String(idRegistro));
  const resp = prompt(`Excluir registro de ${tabela}? Isso NÃO pode ser desfeito.\nDigite EXCLUIR para confirmar:`);
  if (resp !== 'EXCLUIR') return;
  const { error } = await db.from(tabela).delete().eq('id', idRegistro);
  if (error) return alert('Erro ao excluir: ' + error.message);
  await registrarAuditoriaAdmin(tabela, idRegistro, 'DELETE', original || null, null);
  cacheLinhasModoDeus = (cacheLinhasModoDeus || []).filter(r => String(r.id) !== String(idRegistro));
  btnEl.closest('tr')?.remove();
}
