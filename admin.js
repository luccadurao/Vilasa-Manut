// ============================================================================
// VILASA CMMS - MÓDULO 9: ADMIN.JS (USUÁRIOS, OBRAS, IMPORTADOR EXCEL E MODO DEUS EDITÁVEL)
// ============================================================================

let subAbaAdminAtual = 'usuarios'; // 'usuarios', 'importador', 'obras', 'modo_deus'
let cacheLinhasModoDeus = [];

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
          <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">GOVERNANÇA CORPORATIVA • CONTROLE MESTRE</span>
          <h2 class="text-lg font-black">Usuários, Importação de Planilhas, Obras & Editor Modo Deus</h2>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <button onclick="carregarUsuariosAdmin('usuarios')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'usuarios' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            👥 Usuários (${cacheUsuarios.length})
          </button>
          <button onclick="carregarUsuariosAdmin('importador')" class="px-3.5 py-1.5 rounded-xl text-xs font-black ${subAbaAdminAtual === 'importador' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
            📥 Importar Planilhas (OS / Frota / Almox)
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
      ${subAbaAdminAtual === 'importador' ? renderizarSecaoImportadorPlanilhasExcel() : ''}
      ${subAbaAdminAtual === 'obras' ? renderizarSecaoGerenciarObras() : ''}
      ${subAbaAdminAtual === 'modo_deus' ? renderizarSecaoModoDeusTabelas() : ''}
    </div>
  `;

  if (subAbaAdminAtual === 'modo_deus') {
    carregarTabelaEditorAdmin();
  }
}

// ----------------------------------------------------------------------------
// 1. CENTRAL DE IMPORTAÇÃO DE PLANILHAS EXCEL/CSV + DOWNLOAD DE MODELOS PADRÃO
// ----------------------------------------------------------------------------
function renderizarSecaoImportadorPlanilhasExcel() {
  return `
    <div class="space-y-4">
      <div class="bg-amber-50 border border-amber-300 p-4 rounded-2xl text-xs text-amber-950">
        <strong class="font-black uppercase block mb-1">💡 Como importar dados do Excel com zero erro:</strong>
        1. Clique em <strong>"📄 Baixar Planilha Padrão (Com Exemplos)"</strong> no módulo desejado.<br/>
        2. Abra o arquivo no Excel, preencha seus dados seguindo as linhas de exemplo e salve como <strong>CSV (separado por ponto-e-vírgula ou vírgula)</strong>.<br/>
        3. Clique em <strong>"📤 Selecionar e Importar Planilha"</strong> para gravar tudo no banco de uma só vez!
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <!-- CARD 1: IMPORTAR FROTA -->
        <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <span class="px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 font-black text-[10px] uppercase">Módulo 1 • Ativos</span>
            <h3 class="text-base font-black text-slate-900 mt-1">🚜 Importar Frota de Equipamentos</h3>
            <p class="text-xs text-slate-500 mt-1">Colunas: <code>PREFIXO;DESCRICAO;MARCA;MODELO;UNIDADE;HORIMETRO_ATUAL;PROPRIEDADE</code></p>
          </div>
          <div class="space-y-2">
            <button onclick="baixarPlanilhaModeloExemplo('frota')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs flex items-center justify-center gap-2 border border-slate-300">
              <i class="fa-solid fa-download text-amber-600"></i>
              <span>📄 Baixar Planilha Padrão Frota (Exemplos)</span>
            </button>
            <label class="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
              <i class="fa-solid fa-file-import"></i>
              <span>📤 Importar Planilha de Frota</span>
              <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'frota')" />
            </label>
          </div>
        </div>

        <!-- CARD 2: IMPORTAR ALMOXARIFADO -->
        <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <span class="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black text-[10px] uppercase">Módulo 2 • Estoque</span>
            <h3 class="text-base font-black text-slate-900 mt-1">📦 Importar Catálogo & Saldos do Almoxarifado</h3>
            <p class="text-xs text-slate-500 mt-1">Colunas: <code>NOSSO_CODIGO;DESCRICAO;CODIGOS_PARALELOS;SALDO_ATUAL;UNIDADE;CUSTO_UNITARIO;ESTOQUE_MINIMO</code></p>
          </div>
          <div class="space-y-2">
            <button onclick="baixarPlanilhaModeloExemplo('almoxarifado')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs flex items-center justify-center gap-2 border border-slate-300">
              <i class="fa-solid fa-download text-emerald-600"></i>
              <span>📄 Baixar Planilha Padrão Almox. (Exemplos)</span>
            </button>
            <label class="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
              <i class="fa-solid fa-file-import"></i>
              <span>📤 Importar Planilha de Almoxarifado</span>
              <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'almoxarifado')" />
            </label>
          </div>
        </div>

        <!-- CARD 3: IMPORTAR ORDENS DE SERVIÇO (OS) -->
        <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <span class="px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 font-black text-[10px] uppercase">Módulo 3 • Histórico</span>
            <h3 class="text-base font-black text-slate-900 mt-1">🔧 Importar Ordens de Serviço (OS)</h3>
            <p class="text-xs text-slate-500 mt-1">Colunas: <code>PREFIXO;DATA_ABERTURA;DATA_CONCLUSAO;PARADA_SIM_NAO;MOTIVO_PROBLEMA;MECANICO_NOME;STATUS</code></p>
          </div>
          <div class="space-y-2">
            <button onclick="baixarPlanilhaModeloExemplo('os')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs flex items-center justify-center gap-2 border border-slate-300">
              <i class="fa-solid fa-download text-blue-600"></i>
              <span>📄 Baixar Planilha Padrão de OS (Exemplos)</span>
            </button>
            <label class="w-full py-2.5 px-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
              <i class="fa-solid fa-file-import"></i>
              <span>📤 Importar Planilha de OS</span>
              <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'os')" />
            </label>
          </div>
        </div>

      </div>
    </div>
  `;
}

function baixarPlanilhaModeloExemplo(tipo) {
  let conteudo = '';
  let nomeArq = '';

  if (tipo === 'frota') {
    nomeArq = 'MODELO_PADRAO_FROTA_VILASA.csv';
    conteudo = [
      'PREFIXO;DESCRICAO;MARCA;MODELO;UNIDADE;HORIMETRO_ATUAL;PROPRIEDADE',
      'EH-40;ESCAVADEIRA HIDRAULICA;CATERPILLAR;320D2L;H;4520.5;proprio',
      'CB-12;CAMINHAO BASCULANTE;MERCEDES-BENZ;AXOR 3131;KM;89400;alugado'
    ].join('\n');
  } else if (tipo === 'almoxarifado') {
    nomeArq = 'MODELO_PADRAO_ALMOXARIFADO_VILASA.csv';
    conteudo = [
      'NOSSO_CODIGO;DESCRICAO;CODIGOS_PARALELOS;SALDO_ATUAL;UNIDADE;CUSTO_UNITARIO;ESTOQUE_MINIMO',
      'VIL-0001;FILTRO LUBRIFICANTE MOTOR CAT 320;1R-1808, P551808, LF16015;12;UN;89.50;4',
      'VIL-0002;OLEO HIDRAULICO 68 BALDE 20L;SHELL TELLUS 68, IPIRANGA 68;25;BD;340.00;5'
    ].join('\n');
  } else if (tipo === 'os') {
    nomeArq = 'MODELO_PADRAO_ORDENS_SERVICO_VILASA.csv';
    conteudo = [
      'PREFIXO;DATA_ABERTURA;DATA_CONCLUSAO;PARADA_SIM_NAO;MOTIVO_PROBLEMA;MECANICO_NOME;STATUS',
      'EH-40;2026-10-20 08:00;2026-10-20 14:30;SIM;ROMPIMENTO DE MANGUEIRA DO COMANDO HIDRAULICO;JOAO SILVA;concluida',
      'CB-12;2026-10-25 10:00;;NAO;LUZ DE ALERTA NO PAINEL (MAQUINA OPERANDO);CARLOS SOUZA;aberta'
    ].join('\n');
  }

  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArq;
  a.click();
}

async function processarUploadPlanilhaCSV(event, tipo) {
  const file = event.target.files?.[0];
  if (!file) return;

  const texto = await file.text();
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) return alert('A planilha está vazia ou contém apenas o cabeçalho!');

  const separador = linhas[0].includes(';') ? ';' : ',';
  const dadosLinhas = linhas.slice(1);
  let importados = 0;

  if (tipo === 'frota') {
    for (const linha of dadosLinhas) {
      const [tag, nome, marca, modelo, unidade, horimetro, propriedade] = linha.split(separador).map(s => (s || '').replace(/^"|"$/g, '').trim());
      if (!tag || !nome) continue;

      const payload = {
        tag: tag.toUpperCase(),
        nome: nome.toUpperCase(),
        marca: (marca || '').toUpperCase(),
        modelo: (modelo || '').toUpperCase(),
        unidade_medida: (unidade || 'H').toUpperCase(),
        horimetro_atual: parseFloat((horimetro || '0').replace(',', '.')) || 0,
        propriedade: (propriedade || 'proprio').toLowerCase() === 'alugado' ? 'alugado' : 'proprio',
        situacao_ciclo: 'ativo',
        obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
      };

      const existente = cacheEquipamentos.find(e => String(e.tag).toUpperCase() === payload.tag);
      if (existente) {
        await db.from('equipamentos').update(payload).eq('id', existente.id);
      } else {
        await db.from('equipamentos').insert([payload]);
      }
      importados++;
    }
  } else if (tipo === 'almoxarifado') {
    for (const linha of dadosLinhas) {
      const [idInterno, desc, paralelosStr, saldo, un, custo, estMin] = linha.split(separador).map(s => (s || '').replace(/^"|"$/g, '').trim());
      if (!desc) continue;

      const codigos_paralelos = (paralelosStr || '').split(/[,|]+/).map(c => c.trim().toUpperCase()).filter(Boolean);
      const id_interno = (idInterno || `VIL-${String(importados + 1).padStart(4, '0')}`).toUpperCase();

      await db.from('pecas_estoque').insert([{
        id_interno,
        codigo: codigos_paralelos[0] || id_interno,
        descricao: desc.toUpperCase(),
        codigos_paralelos,
        quantidade: parseFloat((saldo || '0').replace(',', '.')) || 0,
        unidade: (un || 'UN').toUpperCase(),
        custo_unitario: parseFloat((custo || '0').replace(',', '.')) || 0,
        estoque_minimo: parseFloat((estMin || '0').replace(',', '.')) || 0,
        estocavel: true,
        obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
      }]);
      importados++;
    }
  } else if (tipo === 'os') {
    for (const linha of dadosLinhas) {
      const [tag, dtAb, dtConc, paradaStr, motivo, mecNome, statusStr] = linha.split(separador).map(s => (s || '').replace(/^"|"$/g, '').trim());
      if (!tag || !motivo) continue;

      const eq = cacheEquipamentos.find(e => String(e.tag).toUpperCase() === tag.toUpperCase());
      if (!eq) continue;

      const parada_obrigatoria = String(paradaStr || 'SIM').toUpperCase() !== 'NAO' && String(paradaStr || 'SIM').toUpperCase() !== 'NÃO';
      await db.from('ordens_servico').insert([{
        equipamento_id: eq.id,
        obra_id: eq.obra_id || null,
        aberta_em: dtAb ? new Date(dtAb).toISOString() : new Date().toISOString(),
        concluida_em: dtConc ? new Date(dtConc).toISOString() : null,
        parada_obrigatoria,
        descricao_problema: motivo.toUpperCase(),
        motivo_rep: motivo.toUpperCase().slice(0, 60),
        mecanico_nome: (mecNome || '').toUpperCase(),
        status: (statusStr || (dtConc ? 'concluida' : 'aberta')).toLowerCase()
      }]);
      importados++;
    }
  }

  event.target.value = '';
  alert(`✅ Importação concluída! ${importados} registro(s) de ${tipo.toUpperCase()} foram gravados no banco de dados.`);
  await carregarUsuariosAdmin('importador');
}

// ----------------------------------------------------------------------------
// 2. GESTÃO DE USUÁRIOS MULTI-CARGO & MULTI-OBRA
// ----------------------------------------------------------------------------
function renderizarSecaoUsuariosMultiCargo() {
  const listaCargosDisponiveis = [
    { id: 'mecanico', label: '🔧 Mecânico / Comboio (Aparece na Lista de Executantes)' },
    { id: 'encarregado', label: '👷 Encarregado' },
    { id: 'almoxarife', label: '📦 Almoxarife' },
    { id: 'pcm', label: '📋 Analista PCM' },
    { id: 'engenheiro', label: '⚙️ Engenheiro (Total exceto Admin)' },
    { id: 'gestor', label: '👁️ Gestor (Somente Visualização e Relatórios)' },
    { id: 'admin', label: '👑 Administrador Master' }
  ];

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">➕ Cadastrar / Atualizar Usuário</h3>
        <input type="hidden" id="admUserIdEdit" value="" />

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Matrícula / Login</label>
            <input id="admUserMatricula" type="text" placeholder="Ex: 2040" class="w-full border rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-600 mb-1">Senha de Acesso</label>
            <input id="admUserSenha" type="text" placeholder="Senha" class="w-full border rounded-lg p-2 font-bold" />
          </div>
        </div>

        <div>
          <label class="block font-black uppercase text-slate-600 mb-1">Nome Completo</label>
          <input id="admUserNome" type="text" placeholder="Ex: JOÃO SILVA" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">1. Cargos (Marque quantos quiser):</label>
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
          <label class="block font-black uppercase text-slate-700 mb-1">2. Obras Liberadas:</label>
          <div id="admCheckboxesObras" class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
            <label class="flex items-center gap-2 font-black text-amber-800 cursor-pointer">
              <input type="checkbox" value="TODAS" checked class="chk-obra-adm rounded" />
              <span>🌐 TODAS AS OBRAS</span>
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

      <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-900 text-amber-400 uppercase text-[11px]">
              <th class="p-3">Login / Nome</th>
              <th class="p-3">Cargos Atribuídos</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${cacheUsuarios.map(u => {
              const cargos = obterCargosUsuario(u);
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
                  <td class="p-3 font-black ${u.ativo !== false ? 'text-emerald-700' : 'text-rose-600'}">
                    ${u.ativo !== false ? 'ATIVO' : 'INATIVO'}
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

  const cargos = obterCargosUsuario(u);
  document.querySelectorAll('.chk-cargo-adm').forEach(chk => { chk.checked = cargos.includes(chk.value); });

  const obras = Array.isArray(u.obras_permitidas) && u.obras_permitidas.length > 0 ? u.obras_permitidas : ['TODAS'];
  document.querySelectorAll('.chk-obra-adm').forEach(chk => { chk.checked = obras.includes(chk.value); });
}

async function salvarUsuarioMultiCargoAdmin() {
  const idEdit = document.getElementById('admUserIdEdit').value;
  const matricula = document.getElementById('admUserMatricula').value.trim().toUpperCase();
  const senha_acesso = document.getElementById('admUserSenha').value.trim();
  const nome = document.getElementById('admUserNome').value.trim().toUpperCase();

  const cargosSelecionados = Array.from(document.querySelectorAll('.chk-cargo-adm:checked')).map(c => c.value);
  const obrasSelecionadas = Array.from(document.querySelectorAll('.chk-obra-adm:checked')).map(o => o.value);

  if (!matricula || !senha_acesso || !nome || cargosSelecionados.length === 0) {
    return alert('Preencha Matrícula, Senha, Nome e marque pelo menos 1 Cargo!');
  }

  const payload = {
    matricula,
    senha_acesso,
    nome,
    cargo_base: cargosSelecionados[0],
    cargos_lista: cargosSelecionados,
    obras_permitidas: obrasSelecionadas.length > 0 ? obrasSelecionadas : ['TODAS'],
    ativo: true
  };

  if (idEdit) {
    const { error } = await db.from('perfis_usuarios').update(payload).eq('id', idEdit);
    if (error) return alert('Erro ao atualizar usuário: ' + error.message);
  } else {
    const { error } = await db.from('perfis_usuarios').insert([payload]);
    if (error) return alert('Erro ao criar usuário: ' + error.message);
  }

  alert('✅ Usuário salvo com sucesso!');
  await carregarUsuariosAdmin('usuarios');
}

async function alternarAtivoUsuarioAdmin(userId, estadoAtual) {
  await db.from('perfis_usuarios').update({ ativo: !estadoAtual }).eq('id', userId);
  await carregarUsuariosAdmin('usuarios');
}

// ----------------------------------------------------------------------------
// 3. GESTÃO DE OBRAS
// ----------------------------------------------------------------------------
function renderizarSecaoGerenciarObras() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900 border-b pb-2">🏗️ Nova Frente de Obra</h3>
        <input id="admObraCodigo" type="text" placeholder="Código (Ex: OBRA-02)" class="w-full border rounded-lg p-2 font-black uppercase" />
        <input id="admObraNome" type="text" placeholder="Nome da Obra" class="w-full border rounded-lg p-2 font-bold uppercase" />
        <input id="admObraLocal" type="text" placeholder="Cidade / UF" class="w-full border rounded-lg p-2 font-semibold uppercase" />
        <button onclick="criarNovaObraAdmin()" class="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black uppercase shadow">
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
                <td class="p-3 font-black text-emerald-700">${o.ativa !== false ? 'ATIVA' : 'ENCERRADA'}</td>
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
// 4. CONTROLE MESTRE (MODO DEUS) 100% FUNCIONAL E EDITÁVEL AO VIVO
// ----------------------------------------------------------------------------
function renderizarSecaoModoDeusTabelas() {
  return `
    <div class="space-y-5">
      <!-- Fusão de Equipamentos Duplicados -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
        <h3 class="text-sm font-black uppercase text-slate-900">🔗 Fusão de Equipamentos Duplicados (Unificar Histórico)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select id="fusaoOrigemSelect" class="border rounded-lg p-2 font-bold">
            <option value="">-- 1. Equipamento Duplicado (Será Removido) --</option>
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

      <!-- Editor Universal de Tabelas (Modo Deus Editável) -->
      <div class="bg-white p-5 rounded-2xl border-2 border-amber-500 space-y-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-black uppercase text-slate-900">⚡ Controle Mestre: Editor Direto de Tabelas do Banco</h3>
            <p class="text-[11px] text-slate-500">Altere qualquer célula abaixo e clique em <strong>💾 Salvar</strong> na linha correspondente para gravar direto no Supabase.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <input id="filtroBuscaModoDeus" type="text" oninput="filtrarLinhasModoDeusNaTela()" placeholder="🔍 Filtrar texto na tabela..."
              class="border border-slate-300 rounded-lg px-3 py-1.5 font-bold uppercase" />
            <select id="editorTabelaSelect" onchange="carregarTabelaEditorAdmin()" class="border-2 border-slate-900 rounded-lg p-2 font-black bg-amber-50">
              <option value="equipamentos">Tabela: equipamentos (Frota)</option>
              <option value="pecas_estoque">Tabela: pecas_estoque (Almoxarifado)</option>
              <option value="ordens_servico">Tabela: ordens_servico (OS Corretivas)</option>
              <option value="execucoes_preventiva">Tabela: execucoes_preventiva (Preventivas)</option>
              <option value="perfis_usuarios">Tabela: perfis_usuarios (Usuários)</option>
              <option value="obras">Tabela: obras</option>
            </select>
          </div>
        </div>
        <div id="containerTabelaModoDeus" class="overflow-x-auto max-h-[520px] border rounded-xl"></div>
      </div>
    </div>
  `;
}

async function executarFusaoEquipamentosAdmin() {
  const idOrigem = document.getElementById('fusaoOrigemSelect').value;
  const idDestino = document.getElementById('fusaoDestinoSelect').value;
  if (!idOrigem || !idDestino || idOrigem === idDestino) return alert('Selecione dois equipamentos distintos!');
  if (!confirm('Confirma transferir todo o histórico para o equipamento oficial e apagar a duplicata?')) return;

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

  cont.innerHTML = `<p class="p-4 text-slate-500 font-bold">Carregando registros editáveis de ${tabela}...</p>`;
  cacheLinhasModoDeus = await buscarTudoSemLimite(tabela, null, false);
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
  if (termo) {
    lista = lista.filter(row => JSON.stringify(row).toUpperCase().includes(termo));
  }

  const colunasEditaveis = Object.keys(cacheLinhasModoDeus[0]).filter(c => c !== 'id' && c !== 'criado_em').slice(0, 7);

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
          <tr class="hover:bg-amber-50/40" data-row-id="${row.id}">
            <td class="p-1.5 border border-slate-200 whitespace-nowrap space-x-1">
              <button onclick="salvarLinhaEditadaModoDeus('${tabela}', '${row.id}', this)" class="px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black">
                💾 Salvar
              </button>
              <button onclick="excluirLinhaModoDeus('${tabela}', '${row.id}', this)" class="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-black">
                🗑️
              </button>
            </td>
            ${colunasEditaveis.map(col => {
              const valOriginal = row[col];
              const ehObjeto = typeof valOriginal === 'object' && valOriginal !== null;
              const textoVal = ehObjeto ? JSON.stringify(valOriginal) : String(valOriginal ?? '');
              return `
                <td class="p-1 border border-slate-200">
                  <input type="text" data-col="${col}" data-is-json="${ehObjeto ? '1' : '0'}"
                    value="${textoVal.replace(/"/g, '&quot;')}"
                    class="inp-celula-modo-deus w-full min-w-[120px] px-1.5 py-1 rounded border border-slate-300 font-semibold text-slate-900 focus:border-amber-500 focus:bg-white" />
                </td>
              `;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function salvarLinhaEditadaModoDeus(tabela, idRegistro, btnEl) {
  const tr = btnEl.closest('tr');
  if (!tr) return;

  const inputs = Array.from(tr.querySelectorAll('.inp-celula-modo-deus'));
  const payload = {};

  for (const inp of inputs) {
    const col = inp.dataset.col;
    const isJson = inp.dataset.isJson === '1';
    const rawVal = inp.value.trim();

    if (rawVal === '') {
      payload[col] = null;
    } else if (isJson) {
      try { payload[col] = JSON.parse(rawVal); } catch (e) { payload[col] = rawVal.split(',').map(s => s.trim()); }
    } else if (rawVal === 'true') {
      payload[col] = true;
    } else if (rawVal === 'false') {
      payload[col] = false;
    } else {
      payload[col] = rawVal;
    }
  }

  const { error } = await db.from(tabela).update(payload).eq('id', idRegistro);
  if (error) return alert('Erro ao salvar alteração: ' + error.message);

  btnEl.innerText = '✅ Salvo!';
  setTimeout(() => { btnEl.innerText = '💾 Salvar'; }, 1500);
}

async function excluirLinhaModoDeus(tabela, idRegistro, btnEl) {
  if (!confirm(`Tem certeza que deseja excluir permanentemente este registro da tabela ${tabela}?`)) return;
  const { error } = await db.from(tabela).delete().eq('id', idRegistro);
  if (error) return alert('Erro ao excluir (verifique se há vínculos em outras tabelas): ' + error.message);
  btnEl.closest('tr')?.remove();
}
