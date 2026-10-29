// ============================================================================
// VILASA CMMS V2 - MÓDULO 9: ADMIN.JS (COMPLETO, VALIDADO E COM PROGRESSO AO VIVO)
// ============================================================================

let subAbaAdminAtual = 'usuarios';
let cacheLinhasModoDeus = [];

async function carregarUsuariosAdmin(subAba = subAbaAdminAtual) {
  if (!podeExecutarAcao('acesso_modo_deus', true)) return;
  subAbaAdminAtual = subAba;

  try {
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

// ----------------------------------------------------------------------------
// 1. IMPORTADOR DE PLANILHAS EXCEL/CSV + DOWNLOAD DE MODELOS COM EXEMPLOS
// ----------------------------------------------------------------------------
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

  let boxStatus = document.getElementById('statusProgressoImportacaoCSV');
  if (!boxStatus) {
    boxStatus = document.createElement('div');
    boxStatus.id = 'statusProgressoImportacaoCSV';
    boxStatus.className = 'fixed top-4 right-4 z-50 bg-slate-950 text-amber-400 border-2 border-amber-500 px-5 py-3 rounded-2xl shadow-2xl font-black text-xs';
    document.body.appendChild(boxStatus);
  }
  const atualizarProgresso = (msg) => { boxStatus.innerText = msg; };

  try {
    atualizarProgresso('⏳ Lendo arquivo CSV...');
    const buffer = await file.arrayBuffer();
    const texto = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');

    const primeiraLinha = texto.split(/\r?\n/)[0] || '';
    const separador = primeiraLinha.includes(';') ? ';' : ',';

    const todasLinhas = parsearTextoCSVCompleto(texto, separador);
    if (todasLinhas.length < 2) {
      boxStatus.remove();
      return alert('Planilha vazia!');
    }

    const dadosLinhas = todasLinhas.slice(1);
    let importados = 0;

    if (tipo === 'frota') {
      for (let idx = 0; idx < dadosLinhas.length; idx++) {
        const cols = dadosLinhas[idx];
        const [tag, nome, marca, modelo, anoFab, numSerie, placa, unidade, horimetro, propriedade] = cols;
        if (!tag || !nome) continue;

        atualizarProgresso(`🚜 Importando Frota: ${idx + 1} / ${dadosLinhas.length}...`);  const payload = { tag: tag.toUpperCase(), nome: nome.toUpperCase(), marca: (marca \vert{}\vert{} '').toUpperCase(), modelo: (modelo \vert{}\vert{} '').toUpperCase(), ano_fabricacao: (anoFab \vert{}\vert{} '').trim(), numero_serie: (numSerie \vert{}\vert{} '').toUpperCase(), placa: (placa \vert{}\vert{} '').toUpperCase(), unidade_medida: (unidade \vert{}\vert{} 'H').toUpperCase(), horimetro_atual: converterHorimetroPlanilha(horimetro) \vert{}\vert{} 0, propriedade: (propriedade \vert{}\vert{} 'proprio').toLowerCase().includes('alug') ? 'alugado' : 'proprio', situacao_ciclo: 'ativo', obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null };  const existente = cacheEquipamentos.find(e => String(e.tag).toUpperCase() === payload.tag); if (existente) await db.from('equipamentos').update(payload).eq('id', existente.id); else await db.from('equipamentos').insert([payload]); importados++; } } else if (tipo === 'almoxarifado') { const lotePecas = []; dadosLinhas.forEach((cols, idx) => { const [idInterno, desc, paralelosStr, saldo, un, custo, estMin] = cols; if (!desc) return; const codigos_paralelos = (paralelosStr \vert{}\vert{} '').split(/[,\vert{}]+/).map(c => c.trim().toUpperCase()).filter(Boolean); const id_interno = (idInterno \vert{}\vert{} `VIL-${String(idx + 1).padStart(4, '0')}`).toUpperCase();

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

      for (let i = 0; i < lotePecas.length; i += 100) {
        atualizarProgresso(`📦 Gravando Almoxarifado: ${i} /${lotePecas.length}...`);
        const fatia = lotePecas.slice(i, i + 100);
        const { error } = await db.from('pecas_estoque').insert(fatia);
        if (error) throw new Error('Almoxarifado: ' + error.message);
        importados += fatia.length;
      }
    } else if (tipo === 'os') {
      atualizarProgresso(`🔍 Verificando equipamentos de ${dadosLinhas.length} OS...`);  const eqBanco = typeof buscarTudoSemLimite === 'function' ? await buscarTudoSemLimite('equipamentos', 'tag', true) : (await db.from('equipamentos').select('*')).data \vert{}\vert{} [];  cacheEquipamentos = eqBanco; const mapaEquipPorTag = {}; cacheEquipamentos.forEach(e => { mapaEquipPorTag[String(e.tag \vert{}\vert{} '').trim().toUpperCase()] = e; });  const tagsNovasParaCriar = new Set(); dadosLinhas.forEach(cols => { const tag = String(cols[0] \vert{}\vert{} '').trim().toUpperCase(); if (tag && !mapaEquipPorTag[tag]) tagsNovasParaCriar.add(tag); });  if (tagsNovasParaCriar.size > 0) { const novosEquipamentos = Array.from(tagsNovasParaCriar).map(tag => ({ tag, nome: `EQUIPAMENTO ${tag}`,
          propriedade: tag.includes('-AL-') ? 'alugado' : 'proprio',
          situacao_ciclo: 'ativo',
          unidade_medida: 'H',
          horimetro_atual: 0,
          obra_id: obraAtivaId !== 'TODAS' ? obraAtivaId : null
        }));

        for (let i = 0; i < novosEquipamentos.length; i += 100) {
          atualizarProgresso(`🚜 Criando prefixos novos na Frota (${i + 1}/${novosEquipamentos.length})...`);
          const fatiaEq = novosEquipamentos.slice(i, i + 100);
          const { data: criados, error: errEq } = await db.from('equipamentos').insert(fatiaEq).select();
          if (errEq) throw new Error('Ao cadastrar prefixos novos: ' + errEq.message);
          (criados || []).forEach(e => {
            mapaEquipPorTag[String(e.tag).trim().toUpperCase()] = e;
            cacheEquipamentos.push(e);
          });
        }
      }

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

      for (let i = 0; i < loteOS.length; i += 100) {
        atualizarProgresso(`🔧 Gravando OS no banco: ${i} de${loteOS.length}...`);
        const fatiaOS = loteOS.slice(i, i + 100);
        const { error: errOS } = await db.from('ordens_servico').insert(fatiaOS);
        if (errOS) throw new Error(`Erro no lote da linha ${i + 1}: ` + errOS.message);
        importados += fatiaOS.length;
      }
    }

    boxStatus.remove();
    event.target.value = '';
    alert(`✅ SUCESSO TOTAL! ${importados} registro(s) de
