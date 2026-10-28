// ============================================================================
// VILASA CMMS V2 - MÓDULO 9: ADMIN.JS (100% CASADO COM AS 9 TABELAS LIMPAS)
// ============================================================================

let subAbaAdminAtual = 'usuarios';
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

  if (subAbaAdminAtual === 'modo_deus') carregarTabelaEditorAdmin();
}

// 1. IMPORTADOR DE PLANILHAS EXCEL/CSV + DOWNLOAD DE MODELOS COM EXEMPLOS
function renderizarSecaoImportadorPlanilhasExcel() {
  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
        <div>
          <span class="px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 font-black text-[10px] uppercase">Módulo 1 • Ativos</span>
          <h3 class="text-base font-black text-slate-900 mt-1">🚜 Importar Frota</h3>
          <p class="text-xs text-slate-500 mt-1">Colunas: <code>PREFIXO;DESCRICAO;MARCA;MODELO;ANO_FABRICACAO;NUMERO_SERIE;PLACA;UNIDADE;HORIMETRO_ATUAL;PROPRIEDADE</code></p>
        </div>
        <div class="space-y-2">
          <button onclick="baixarPlanilhaModeloExemplo('frota')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs border border-slate-300">
            📄 Baixar Planilha Padrão Frota (Exemplos)
          </button>
          <label class="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
            <span>📤 Importar Planilha de Frota</span>
            <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'frota')" />
          </label>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
        <div>
          <span class="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black text-[10px] uppercase">Módulo 2 • Estoque</span>
          <h3 class="text-base font-black text-slate-900 mt-1">📦 Importar Almoxarifado</h3>
          <p class="text-xs text-slate-500 mt-1">Colunas: <code>NOSSO_CODIGO;DESCRICAO;CODIGOS_PARALELOS;SALDO_ATUAL;UNIDADE;CUSTO_UNITARIO;ESTOQUE_MINIMO</code></p>
        </div>
        <div class="space-y-2">
          <button onclick="baixarPlanilhaModeloExemplo('almoxarifado')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs border border-slate-300">
            📄 Baixar Planilha Padrão Almox. (Exemplos)
          </button>
          <label class="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
            <span>📤 Importar Planilha de Almoxarifado</span>
            <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'almoxarifado')" />
          </label>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
        <div>
          <span class="px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 font-black text-[10px] uppercase">Módulo 3 • OS & REP</span>
          <h3 class="text-base font-black text-slate-900 mt-1">🔧 Importar Ordens de Serviço</h3>
          <p class="text-xs text-slate-500 mt-1">Colunas: <code>PREFIXO;DATA_ABERTURA;DATA_CONCLUSAO;MOTIVO_REP;CLASSIFICACAO_FALHA;LOCAL_MANUTENCAO;DESCRICAO_PROBLEMA;SERVICO_EXECUTADO;MECANICO_NOME;HORIMETRO_OS;STATUS</code></p>
        </div>
        <div class="space-y-2">
          <button onclick="baixarPlanilhaModeloExemplo('os')" class="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-xs border border-slate-300">
            📄 Baixar Planilha Padrão de OS (Exemplos)
          </button>
          <label class="w-full py-2.5 px-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
            <span>📤 Importar Planilha de OS</span>
            <input type="file" accept=".csv,.txt" class="hidden" onchange="processarUploadPlanilhaCSV(event, 'os')" />
          </label>
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
      'PREFIXO;DESCRICAO;MARCA;MODELO;ANO_FABRICACAO;NUMERO_SERIE;PLACA;UNIDADE;HORIMETRO_ATUAL;PROPRIEDADE',
      'EH-40;ESCAVADEIRA HIDRAULICA;CATERPILLAR;320D2L;2022;CAT320DX9988;;H;4520.5;proprio',
      'CB-12;CAMINHAO BASCULANTE;MERCEDES-BENZ;AXOR 3131;2024;MB3131ZZ4411;ABC-1234;KM;89400;alugado'
    ].join('\n');
  } else if (tipo === 'almoxarifado') {
    nomeArq = 'MODELO_PADRAO_ALMOXARIFADO_VILASA.csv';
    conteudo = [
      'NOSSO_CODIGO;DESCRICAO;CODIGOS_PARALELOS;SALDO_ATUAL;UNIDADE;CUSTO_UNITARIO;ESTOQUE_MINIMO',
      'VIL-0001;FILTRO LUBRIFICANTE MOTOR CAT 320;1R-1808, P551808, LF16015;12;UN;89.50;4',
      'VIL-0002;OLEO HIDRAULICO 68 BALDE 20L;SHELL TELLUS 68, IPIRANGA 68;25;BD;340.00;5'
    ].join('\n');
  } else if (tipo === 'os') {
    nomeArq = 'MODELO_PADRAO_OS_REP_VILASA.csv';
    conteudo = [
      'PREFIXO;DATA_ABERTURA;DATA_CONCLUSAO;MOTIVO_REP;CLASSIFICACAO_FALHA;LOCAL_MANUTENCAO;DESCRICAO_PROBLEMA;SERVICO_EXECUTADO;MECANICO_NOME;HORIMETRO_OS;STATUS',
      'EH-40;24/10/2026 08:00;24/10/2026 16:30;CORRETIVA;SISTEMA HIDRAULICO;CAMPO;ROMPIMENTO DE MANGUEIRA DO COMANDO HIDRAULICO;SUBSTITUICAO DE MANGUEIRA 1 POL;JOAO SILVA, CARLOS SOUZA;4520.5;concluida',
      'CB-12;25/10/2026 10:00;;CORRETIVA;MOTOR;OFICINA;FALHA DE INJECAO E PERDA DE POTENCIA;EM ANALISE NA BOMBA INJETORA;PEDRO SANTOS;89410;em_execucao'
    ].join('\n');
  }

  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArq;
  a.click();
}

// Converte datas BR (DD/MM/YYYY ou DD/MM/YY HH:mm) ou ISO para ISO do Supabase
function converterDataPlanilhaParaISO(str) {
  const limpo = String(str || '').trim();
  if (!limpo) return null;
  const mBR = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (mBR) {
    let [_, dia, mes, ano, hora = '08', min = '00'] = mBR;
    if (ano.length === 2) ano = '20' + ano;
    dia = dia.padStart(2, '0');
    mes = mes.padStart(2, '0');
    hora = String(Math.min(23, parseInt(hora, 10) || 0)).padStart(2, '0');
    min = String(Math.min(59, parseInt(min, 10) || 0)).padStart(2, '0');
    const dt = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:00`);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(limpo);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// Leitor CSV profissional que respeita quebras de linha (Enter) dentro de células com aspas
function parsearTextoCSVCompleto(texto, separador = ';') {
  const linhas = [];
  let linhaAtual = [];
  let campoAtual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    const prox = texto[i + 1];

    if (char === '"') {
      if (dentroDeAspas && prox === '"') {
        campoAtual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (char === separador && !dentroDeAspas) {
      linhaAtual.push(campoAtual.trim());
      campoAtual = '';
    } else if ((char === '\n' || (char === '\r' && prox === '\n')) && !dentroDeAspas) {
      if (char === '\r') i++;
      linhaAtual.push(campoAtual.trim());
      if (linhaAtual.some(cel => cel !== '')) {
        linhas.push(linhaAtual);
      }
      linhaAtual = [];
      campoAtual = '';
    } else if (char !== '\r') {
      campoAtual += char;
    }
  }

  if (campoAtual.trim() !== '' || linhaAtual.some(cel => cel !== '')) {
    linhaAtual.push(campoAtual.trim());
    linhas.push(linhaAtual);
  }
  return linhas;
}

// Converte horímetro tratando ponto de milhar (ex: "2.017" -> 2017 e "429.836" -> 429836)
function converterHorimetroPlanilha(valorStr) {
  let s = String(valorStr || '').trim();
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

async function processarUploadPlanilhaCSV(event, tipo) {
  const file = event.target.files?.[0];
  if (!file) return;

  const texto = (await file.text()).replace(/^\uFEFF/, '');
  const primeiraLinha = texto.split(/\r?\n/)[0] || '';
  const separador = primeiraLinha.includes(';') ? ';' : ',';

  const todasLinhas = parsearTextoCSVCompleto(texto, separador);
  if (todasLinhas.length < 2) return alert('Planilha vazia!');

  const dadosLinhas = todasLinhas.slice(1);
  let importados = 0;

  if (tipo === 'frota') {
    for (const cols of dadosLinhas) {
      const [tag, nome, marca, modelo, anoFab, numSerie, placa, unidade, horimetro, propriedade] = cols;
      if (!tag || !nome) continue;

      const payload = {
        tag: tag.toUpperCase(),
        nome: nome.toUpperCase(),
        marca: (marca || '').toUpperCase(),
        modelo: (modelo || '').toUpperCase(),
        ano_fabricacao: (anoFab || '').trim(),
        numero_serie: (numSerie || '').toUpperCase(),
        placa: (placa || '').toUpperCase(),
        unidade_medida: (unidade || 'H').toUpperCase(),
        horimetro_atual: converterHorimetroPlanilha(horimetro) || 0,
        propriedade: (propriedade || 'proprio').toLowerCase().includes('alug') ? 'alugado' : 'proprio',
        situacao_ciclo: 'ativo',
        obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
      };

      const existente = cacheEquipamentos.find(e => String(e.tag).toUpperCase() === payload.tag);
      if (existente) await db.from('equipamentos').update(payload).eq('id', existente.id);
      else await db.from('equipamentos').insert([payload]);
      importados++;
    }
  } else if (tipo === 'almoxarifado') {
    const lotePecas = [];
    dadosLinhas.forEach((cols, idx) => {
      const [idInterno, desc, paralelosStr, saldo, un, custo, estMin] = cols;
      if (!desc) return;
      const codigos_paralelos = (paralelosStr || '').split(/[,|]+/).map(c => c.trim().toUpperCase()).filter(Boolean);
      const id_interno = (idInterno || `VIL-${String(idx + 1).padStart(4, '0')}`).toUpperCase();

      lotePecas.push({
        id_interno,
        descricao: desc.toUpperCase(),
        codigos_paralelos,
        quantidade: parseFloat(String(saldo || '0').replace(',', '.')) || 0,
        unidade: (un || 'UN').toUpperCase(),
        custo_unitario: parseFloat(String(custo || '0').replace(',', '.')) || 0,
        estoque_minimo: parseFloat(String(estMin || '0').replace(',', '.')) || 0,
        obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
      });
    });

    for (let i = 0; i < lotePecas.length; i += 200) {
      const fatia = lotePecas.slice(i, i + 200);
      const { error } = await db.from('pecas_estoque').insert(fatia);
      if (error) return alert('Erro ao importar lote do almoxarifado: ' + error.message);
      importados += fatia.length;
    }
  } else if (tipo === 'os') {
    // 1. Garante que a lista de equipamentos está atualizada na memória
    const { data: eqBanco } = await db.from('equipamentos').select('*');
    cacheEquipamentos = eqBanco || [];
    const mapaEquipPorTag = {};
    cacheEquipamentos.forEach(e => {
      mapaEquipPorTag[String(e.tag || '').trim().toUpperCase()] = e;
    });

    // 2. Descobre se a planilha tem algum prefixo que ainda não existe na Frota e cadastra automaticamente
    const tagsNovasParaCriar = new Set();
    dadosLinhas.forEach(cols => {
      const tag = String(cols[0] || '').trim().toUpperCase();
      if (tag && !mapaEquipPorTag[tag]) tagsNovasParaCriar.add(tag);
    });

    if (tagsNovasParaCriar.size > 0) {
      const novosEquipamentos = Array.from(tagsNovasParaCriar).map(tag => ({
        tag,
        nome: `EQUIPAMENTO ${tag}`,
        propriedade: tag.includes('-AL-') ? 'alugado' : 'proprio',
        situacao_ciclo: 'ativo',
        unidade_medida: 'H',
        horimetro_atual: 0,
        obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
      }));

      for (let i = 0; i < novosEquipamentos.length; i += 200) {
        const fatiaEq = novosEquipamentos.slice(i, i + 200);
        const { data: criados, error: errEq } = await db.from('equipamentos').insert(fatiaEq).select();
        if (errEq) return alert('Erro ao criar prefixos novos da planilha: ' + errEq.message);
        (criados || []).forEach(e => {
          mapaEquipPorTag[String(e.tag).trim().toUpperCase()] = e;
          cacheEquipamentos.push(e);
        });
      }
    }

    // 3. Monta todas as Ordens de Serviço da planilha (tratando barras nos mecânicos e horímetros)
    const loteOS = [];
    for (const cols of dadosLinhas) {
      const [tagRaw, dtAb, dtConc, motivoRep, classifFalha, localManut, problemaRaw, servicoRaw, mecNome, horStr, statusStr] = cols;
      const tag = String(tagRaw || '').trim().toUpperCase();
      if (!tag) continue;

      const eq = mapaEquipPorTag[tag];
      if (!eq) continue;

      const problemaFinal = (problemaRaw || servicoRaw || classifFalha || 'MANUTENÇÃO REGISTRADA').trim().toUpperCase();
      const servicoFinal = (servicoRaw || '').trim().toUpperCase();

      const mecanicosPadronizados = (mecNome || '')
        .split(/[,/|]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .join(', ');

      const abertaISO = converterDataPlanilhaParaISO(dtAb) || new Date().toISOString();
      const concluidaISO = converterDataPlanilhaParaISO(dtConc);
      const horNum = converterHorimetroPlanilha(horStr);

      loteOS.push({
        equipamento_id: eq.id,
        obra_id: eq.obra_id || (obraAtivaId !== 'TODAS' ? obraAtivaId : null),
        aberta_em: abertaISO,
        concluida_em: concluidaISO,
        motivo_rep: (motivoRep || 'CORRETIVA').trim().toUpperCase(),
        classificacao_falha: (classifFalha || '').trim().toUpperCase(),
        local_manutencao_pcm: (localManut || 'OFICINA').trim().toUpperCase(),
        descricao_problema: problemaFinal,
        servico_executado: servicoFinal,
        mecanico_nome: mecanicosPadronizados,
        horimetro_os: horNum,
        status: (statusStr || (concluidaISO ? 'concluida' : 'aberta')).trim().toLowerCase()
      });
    }

    // 4. Envia em lotes de 200 registros por vez (super rápido e sem travar o navegador)
    for (let i = 0; i < loteOS.length; i += 200) {
      const fatiaOS = loteOS.slice(i, i + 200);
      const { error: errOS } = await db.from('ordens_servico').insert(fatiaOS);
      if (errOS) return alert(`Erro ao gravar lote de OS (linha ${i + 1}): ` + errOS.message);
      importados += fatiaOS.length;
    }
  }

  event.target.value = '';
  alert(`✅ Importação concluída! ${importados} registro(s) de ${tipo.toUpperCase()} foram gravados no banco.`);
  await carregarUsuariosAdmin('importador');
}

// 2. GESTÃO DE USUÁRIOS (SEM COLUNAS DUPLICADAS)
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
          <input id="admUserSenha" type="text" placeholder="Senha" class="border rounded-lg p-2 font-bold" />
        </div>
        <input id="admUserNome" type="text" placeholder="Nome Completo" class="w-full border rounded-lg p-2 font-bold uppercase" />

        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">1. Cargos:</label>
          <div class="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border">
            ${listaCargosDisponiveis.map(c => `
              <label class="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                <input type="checkbox" value="${c.id}" class="chk-cargo-adm rounded" /><span>${c.label}</span>
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
                <input type="checkbox" value="${o.id}" class="chk-obra-adm rounded" /><span>📍 ${o.codigo} - ${o.nome}</span>
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
                  <td class="p-3"><span class="bg-slate-900 text-amber-400 font-black px-2 py-0.5 rounded text-[11px]">${u.matricula}</span><div class="font-extrabold mt-1">${u.nome}</div></td>
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
  document.getElementById('admUserSenha').value = u.senha_acesso || '';
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
  const cargos_lista = Array.from(document.querySelectorAll('.chk-cargo-adm:checked')).map(c => c.value);
  const obras_permitidas = Array.from(document.querySelectorAll('.chk-obra-adm:checked')).map(o => o.value);

  if (!matricula || !senha_acesso || !nome || cargos_lista.length === 0) {
    return alert('Preencha Login, Senha, Nome e marque pelo menos 1 Cargo!');
  }

  const payload = {
    matricula,
    senha_acesso,
    nome,
    cargos_lista,
    obras_permitidas: obras_permitidas.length > 0 ? obras_permitidas : ['TODAS'],
    ativo: true
  };

  if (idEdit) await db.from('perfis_usuarios').update(payload).eq('id', idEdit);
  else await db.from('perfis_usuarios').insert([payload]);

  alert('✅ Usuário salvo com sucesso!');
  await carregarUsuariosAdmin('usuarios');
}

async function alternarAtivoUsuarioAdmin(userId, estadoAtual) {
  await db.from('perfis_usuarios').update({ ativo: !estadoAtual }).eq('id', userId);
  await carregarUsuariosAdmin('usuarios');
}

// 3. GESTÃO DE OBRAS (3 COLUNAS LIMPAS: codigo, nome, ativa)
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
            ${cacheObras.map(o => `<tr><td class="p-3 font-black text-amber-700">${o.codigo}</td><td class="p-3 font-extrabold">${o.nome}</td><td class="p-3 font-black text-emerald-700">${o.ativa !== false ? 'ATIVA' : 'ENCERRADA'}</td></tr>`).join('')}
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
  await db.from('obras').insert([{ codigo, nome, ativa: true }]);
  await carregarObrasEMontarSeletorTopo();
  await carregarUsuariosAdmin('obras');
}

// 4. CONTROLE MESTRE (MODO DEUS) EDITÁVEL
function renderizarSecaoModoDeusTabelas() {
  return `
    <div class="bg-white p-5 rounded-2xl border-2 border-amber-500 space-y-3 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black uppercase text-slate-900">⚡ Controle Mestre: Editor Direto das 9 Tabelas</h3>
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
            <option value="perfis_usuarios">7. perfis_usuarios</option>
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

async function salvarLinhaEditadaModoDeus(tabela, idRegistro, btnEl) {
  const tr = btnEl.closest('tr');
  const payload = {};
  tr.querySelectorAll('.inp-celula-modo-deus').forEach(inp => {
    const col = inp.dataset.col;
    const raw = inp.value.trim();
    if (raw === '') payload[col] = null;
    else if (inp.dataset.isJson === '1') {
      try { payload[col] = JSON.parse(raw); } catch (e) { payload[col] = raw.split(',').map(s => s.trim()); }
    } else if (raw === 'true') payload[col] = true;
    else if (raw === 'false') payload[col] = false;
    else payload[col] = raw;
  });

  const { error } = await db.from(tabela).update(payload).eq('id', idRegistro);
  if (error) return alert('Erro ao salvar: ' + error.message);
  btnEl.innerText = '✅ Salvo!';
  setTimeout(() => { btnEl.innerText = '💾 Salvar'; }, 1500);
}

async function excluirLinhaModoDeus(tabela, idRegistro, btnEl) {
  if (!confirm(`Excluir registro de ${tabela}?`)) return;
  const { error } = await db.from(tabela).delete().eq('id', idRegistro);
  if (error) return alert('Erro ao excluir: ' + error.message);
  btnEl.closest('tr')?.remove();
}
