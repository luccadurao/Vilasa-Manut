// ============================================================================
// VILASA CMMS - MÓDULO 9: ADMIN.JS (GOVERNANÇA, MULTI-OBRAS, MULTI-CARGOS E MODO DEUS)
// Responsabilidades:
// 1. Acesso restrito exclusivamente ao perfil 'admin'
// 2. Gestão de Obras / Frentes de Serviço
// 3. Cadastro e Edição de Usuários com Múltiplos Cargos e Múltiplas Obras por Clique
// 4. Fusão de Equipamentos Duplicados e Editor Universal de Tabelas (Modo Deus)
// ============================================================================

let subAbaAdminAtual = 'usuarios'; // 'usuarios', 'obras', 'modo_deus'

async function carregarUsuariosAdmin(subAba = subAbaAdminAtual) {
  if (!podeExecutarAcao('acesso_modo_deus', true)) return;
  subAbaAdminAtual = subAba;

  const [resUsers, resObras, resEq] = await Promise.all([
    db.from('perfis_usuarios').select('*').order('nome'),
    db.from('obras').select('*').order('codigo'),
    typeof buscarTudoSemLimite === 'function'
      ? buscarTudoSemLimite('equipamentos', 'tag', true).then(data => ({ data }))
      : db.from('equipamentos').select('*').order('tag')
  ]);

  cacheUsuarios = resUsers.data || [];
  cacheObras = resObras.data || [];
  cacheEquipamentos = resEq.data || [];

  renderizarPainelAdminV2();
}

function renderizarPainelAdminV2() {
  const sec = document.getElementById('sec-admin');
  if (!sec) return;

  sec.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-950 border-2 border-amber-500 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GOVERNANÇA CORPORATIVA • ACESSO EXCLUSIVO ADMIN</span>
          <h2 class="text-lg font-black">Administração de Usuários Multi-Cargo, Obras & Modo Deus</h2>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarUsuariosAdmin('usuarios')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'usuarios' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            👥 Usuários Multi-Cargo & Obras (${cacheUsuarios.length})
          </button>
          <button onclick="carregarUsuariosAdmin('obras')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'obras' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            🏗️ Frentes de Obra (${cacheObras.length})
          </button>
          <button onclick="carregarUsuariosAdmin('modo_deus')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'modo_deus' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            ⚡ Fusão & Editor de Tabelas
          </button>
        </div>
      </div>

      ${subAbaAdminAtual === 'usuarios' ? renderizarSecaoUsuariosMultiCargo() : ''}
      ${subAbaAdminAtual === 'obras' ? renderizarSecaoGerenciarObras() : ''}
      ${subAbaAdminAtual === 'modo_deus' ? renderizarSecaoModoDeusTabelas() : ''}
    </div>
  `;

  if (subAbaAdminAtual === 'modo_deus') {
    carregarTabelaEditorAdmin();
  }
}

// ----------------------------------------------------------------------------
// 1. GESTÃO DE USUÁRIOS (MÚLTIPLOS CARGOS + MÚLTIPLAS OBRAS POR CHECKBOX)
// ----------------------------------------------------------------------------
function renderizarSecaoUsuariosMultiCargo() {
  const listaCargosDisponiveis = [
    { id: 'mecanico', label: '🔧 Mecânico / Comboio' },
    { id: 'encarregado', label: '👷 Encarregado' },
    { id: 'almoxarife', label: '📦 Almoxarife' },
    { id: 'pcm', label: '📋 Analista PCM' },
    { id: 'engenheiro', label: '⚙️ Engenheiro (Total exceto Admin)' },
    { id: 'gestor', label: '👁️ Gestor (Somente Visualização)' },
    { id: 'admin', label: '👑 Administrador Master' }
  ];

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- Formulário de Criação / Edição de Usuário -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">➕ Cadastrar / Atualizar Usuário</h3>
        <input type="hidden" id="admUserIdEdit" value="" />

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Matrícula (Login)</label>
            <input id="admUserMatricula" type="text" placeholder="Ex: 2040" class="w-full border rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Senha</label>
            <input id="admUserSenha" type="text" placeholder="Senha de acesso" class="w-full border rounded-lg p-2 font-bold" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Nome Completo</label>
          <input id="admUserNome" type="text" placeholder="Ex: CARLOS EDUARDO SILVA" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">1. Selecione um ou mais Cargos (Multi-Função):</label>
          <div id="admCheckboxesCargos" class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            ${listaCargosDisponiveis.map(c => `
              <label class="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input type="checkbox" value="${c.id}" class="chk-cargo-adm rounded text-amber-500" />
                <span>${c.label}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">2. Obras Permitidas para este Usuário:</label>
          <div id="admCheckboxesObras" class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
            <label class="flex items-center gap-2 font-black text-amber-800 cursor-pointer">
              <input type="checkbox" value="TODAS" checked class="chk-obra-adm rounded" />
              <span>🌐 TODAS AS OBRAS (Visão Consolidada + Individual)</span>
            </label>
            ${cacheObras.map(o => `
              <label class="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" value="${o.id}" class="chk-obra-adm rounded" />
                <span>📍 ${o.codigo} - ${o.nome}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <button onclick="salvarUsuarioMultiCargoAdmin()" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase shadow">
          💾 Salvar Perfil de Usuário
        </button>
      </div>

      <!-- Lista de Usuários Cadastrados -->
      <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-3">Matrícula / Nome</th>
              <th class="p-3">Cargos Atribuídos</th>
              <th class="p-3">Obras Liberadas</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${cacheUsuarios.map(u => {
              const cargos = Array.isArray(u.cargos_lista) && u.cargos_lista.length > 0 ? u.cargos_lista : [u.cargo_base];
              const obrasPerm = Array.isArray(u.obras_permitidas) && u.obras_permitidas.length > 0 ? u.obras_permitidas : ['TODAS'];
              const nomesObras = obrasPerm.includes('TODAS')
                ? '🌐 TODAS AS OBRAS'
                : obrasPerm.map(idOb => cacheObras.find(o => String(o.id) === String(idOb))?.codigo || idOb).join(', ');

              return `
                <tr class="hover:bg-slate-50">
                  <td class="p-3">
                    <span class="bg-slate-900 text-amber-400 font-black px-2 py-0.5 rounded text-[11px]">${u.matricula}</span>
                    <div class="font-extrabold text-slate-900 mt-1">${u.nome}</div>
                  </td>
                  <td class="p-3">
                    <div class="flex flex-wrap gap-1">
                      ${cargos.map(c => `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-black uppercase text-[10px]">${c}</span>`).join('')}
                    </div>
                  </td>
                  <td class="p-3 font-bold text-slate-700 text-[11px]">${nomesObras}</td>
                  <td class="p-3">
                    ${u.ativo !== false
                      ? `<span class="text-emerald-700 font-black">ATIVO</span>`
                      : `<span class="text-rose-600 font-black">INATIVO</span>`}
                  </td>
                  <td class="p-3 text-right space-x-1 whitespace-nowrap">
                    <button onclick="preencherUsuarioParaEdicaoAdmin('${u.id}')" class="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-bold">✏️ Editar</button>
                    <button onclick="alternarAtivoUsuarioAdmin('${u.id}', ${u.ativo !== false})" class="px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-bold">
                      ${u.ativo !== false ? '🚫 Inativar' : '✅ Ativar'}
                    </button>
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
  document.getElementById('admUserSenha').value = u.senha_acesso || u.senha || '';
  document.getElementById('admUserNome').value = u.nome || '';

  const cargos = Array.isArray(u.cargos_lista) && u.cargos_lista.length > 0 ? u.cargos_lista : [u.cargo_base];
  document.querySelectorAll('.chk-cargo-adm').forEach(chk => {
    chk.checked = cargos.includes(chk.value);
  });

  const obras = Array.isArray(u.obras_permitidas) && u.obras_permitidas.length > 0 ? u.obras_permitidas : ['TODAS'];
  document.querySelectorAll('.chk-obra-adm').forEach(chk => {
    chk.checked = obras.includes(chk.value);
  });
}

async function salvarUsuarioMultiCargoAdmin() {
  const idEdit = document.getElementById('admUserIdEdit').value;
  const matricula = document.getElementById('admUserMatricula').value.trim().toUpperCase();
  const senha = document.getElementById('admUserSenha').value.trim();
  const nome = document.getElementById('admUserNome').value.trim().toUpperCase();

  const cargosSelecionados = Array.from(document.querySelectorAll('.chk-cargo-adm:checked')).map(c => c.value);
  const obrasSelecionadas = Array.from(document.querySelectorAll('.chk-obra-adm:checked')).map(o => o.value);

  if (!matricula || !senha || !nome || cargosSelecionados.length === 0) {
    return alert('Preencha Matrícula, Senha, Nome e marque pelo menos 1 Cargo!');
  }

  const payload = {
    matricula,
    senha_acesso: senha,
    nome,
    cargo_base: cargosSelecionados[0], // Mantém compatibilidade com coluna antiga
    cargos_lista: cargosSelecionados,
    obras_permitidas: obrasSelecionadas.length > 0 ? obrasSelecionadas : ['TODAS'],
    ativo: true
  };

  if (idEdit) {
    await db.from('perfis_usuarios').update(payload).eq('id', idEdit);
  } else {
    await db.from('perfis_usuarios').insert([payload]);
  }

  await carregarUsuariosAdmin('usuarios');
}

async function alternarAtivoUsuarioAdmin(userId, estadoAtual) {
  await db.from('perfis_usuarios').update({ ativo: !estadoAtual }).eq('id', userId);
  await carregarUsuariosAdmin('usuarios');
}

// ----------------------------------------------------------------------------
// 2. GESTÃO DE OBRAS / FRENTES DE SERVIÇO
// ----------------------------------------------------------------------------
function renderizarSecaoGerenciarObras() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">🏗️ Nova Frente de Obra</h3>
        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Código da Obra</label>
          <input id="admObraCodigo" type="text" placeholder="Ex: OBRA-02" class="w-full border rounded-lg p-2 font-black uppercase" />
        </div>
        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Nome do Contrato / Obra</label>
          <input id="admObraNome" type="text" placeholder="Ex: DUPLICAÇÃO BR-153 NORTE" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Cidade / Trecho</label>
          <input id="admObraLocal" type="text" placeholder="Ex: GURUPI - TO" class="w-full border rounded-lg p-2 font-semibold uppercase" />
        </div>
        <button onclick="criarNovaObraAdmin()" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase shadow">
          + Cadastrar Obra
        </button>
      </div>

      <div class="md:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-3">Código</th>
              <th class="p-3">Nome da Obra</th>
              <th class="p-3">Localização</th>
              <th class="p-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${cacheObras.map(o => `
              <tr>
                <td class="p-3 font-black text-amber-700">${o.codigo}</td>
                <td class="p-3 font-extrabold text-slate-900">${o.nome}</td>
                <td class="p-3 text-slate-600">${o.localizacao || '-'}</td>
                <td class="p-3 font-black ${o.ativa !== false ? 'text-emerald-700' : 'text-rose-600'}">${o.ativa !== false ? 'ATIVA' : 'ENCERRADA'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function criarNovaObraAdmin() {
  const codigo = document.getElementById('admObraCodigo').value.trim().toUpperCase();
  const nome = document.getElementById('admObraNome').value.trim().toUpperCase();
  const localizacao = document.getElementById('admObraLocal').value.trim().toUpperCase();
  if (!codigo || !nome) return alert('Informe o Código e o Nome da Obra!');

  await db.from('obras').insert([{ codigo, nome, localizacao, ativa: true }]);
  await carregarObrasEMontarSeletorTopo();
  await carregarUsuariosAdmin('obras');
}

// ----------------------------------------------------------------------------
// 3. MODO DEUS: FUSÃO DE EQUIPAMENTOS DUPLICADOS & EDITOR DE TABELAS
// ----------------------------------------------------------------------------
function renderizarSecaoModoDeusTabelas() {
  return `
    <div class="space-y-5">
      <!-- Fusão de Equipamentos Duplicados -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900">🔗 Fusão de Equipamentos Duplicados (Unificar Histórico)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select id="fusaoOrigemSelect" class="border rounded-lg p-2 font-bold">
            <option value="">-- 1. Equipamento Duplicado (Será Absorvido) --</option>
            ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
          <select id="fusaoDestinoSelect" class="border rounded-lg p-2 font-bold">
            <option value="">-- 2. Equipamento Oficial (Receberá Tudo) --</option>
            ${cacheEquipamentos.map(e => `<option value="${e.id}">${e.tag} - ${e.nome}</option>`).join('')}
          </select>
          <button onclick="executarFusaoEquipamentosAdmin()" class="bg-rose-600 hover:bg-rose-500 text-white font-black rounded-lg px-4 py-2">
            ⚡ Unificar e Excluir Duplicata
          </button>
        </div>
      </div>

      <!-- Editor Universal de Tabelas -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-black uppercase text-slate-900">🛠️ Inspecionar Tabelas do Banco (Sem Limite de Linhas)</h3>
          <select id="editorTabelaSelect" onchange="carregarTabelaEditorAdmin()" class="border border-slate-300 rounded-lg p-2 font-black bg-slate-50">
            <option value="equipamentos">Tabela: equipamentos</option>
            <option value="ordens_servico">Tabela: ordens_servico (Corretivas)</option>
            <option value="execucoes_preventiva">Tabela: execucoes_preventiva (Preventivas)</option>
            <option value="pecas_estoque">Tabela: pecas_estoque</option>
            <option value="obras">Tabela: obras</option>
          </select>
        </div>
        <div id="containerTabelaModoDeus" class="overflow-x-auto max-h-96 border rounded-xl"></div>
      </div>
    </div>
  `;
}

async function executarFusaoEquipamentosAdmin() {
  const idOrigem = document.getElementById('fusaoOrigemSelect').value;
  const idDestino = document.getElementById('fusaoDestinoSelect').value;
  if (!idOrigem || !idDestino || idOrigem === idDestino) {
    return alert('Selecione dois equipamentos distintos para realizar a fusão!');
  }
  if (!confirm('Confirma transferir todas as OS, preventivas, horímetros e saídas do almoxarifado para o equipamento destino e apagar a duplicata?')) return;

  await Promise.all([
    db.from('ordens_servico').update({ equipamento_id: idDestino }).eq('equipamento_id', idOrigem),
    db.from('execucoes_preventiva').update({ equipamento_id: idDestino }).eq('equipamento_id', idOrigem),
    db.from('diario_horimetro').update({ equipamento_id: idDestino }).eq('equipamento_id', idOrigem),
    db.from('movimentacoes_almoxarifado').update({ equipamento_id: idDestino }).eq('equipamento_id', idOrigem)
  ]);
  await db.from('equipamentos').delete().eq('id', idOrigem);

  alert('✅ Equipamentos unificados com sucesso!');
  await carregarUsuariosAdmin('modo_deus');
}

async function carregarTabelaEditorAdmin() {
  const tabela = document.getElementById('editorTabelaSelect')?.value || 'equipamentos';
  const cont = document.getElementById('containerTabelaModoDeus');
  if (!cont) return;

  cont.innerHTML = `<p class="p-4 text-slate-500 font-bold">Carregando registros de ${tabela}...</p>`;
  const dados = await buscarTudoSemLimite(tabela, null, false);

  if (!dados || dados.length === 0) {
    cont.innerHTML = `<p class="p-4 text-slate-400">Tabela vazia.</p>`;
    return;
  }

  const colunas = Object.keys(dados[0]).slice(0, 8);
  cont.innerHTML = `
    <table class="w-full text-left border-collapse text-[11px]">
      <thead>
        <tr class="bg-slate-900 text-amber-400 uppercase">
          ${colunas.map(c => `<th class="p-2 border border-slate-700">${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        ${dados.slice(0, 200).map(row => `
          <tr class="hover:bg-slate-50">
            ${colunas.map(c => `<td class="p-2 border border-slate-200 truncate max-w-[180px]">${typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
