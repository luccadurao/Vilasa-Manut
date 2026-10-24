// ============================================================================
// VILASA CMMS - MÓDULO 2: OFFLINE_SYNC.JS (OPERAÇÃO 100% OFFLINE + VALIDADOR FÍSICO)
// Responsabilidades:
// 1. Banco Local IndexedDB ('VilasaOfflineDB') para espelho da frota e fila de mutações
// 2. Pré-carregamento automático de 100% dos equipamentos no 1º acesso com rede
// 3. Encadeamento de OS Offline (Criar -> Executar -> Concluir sem internet com temp_id)
// 4. Trava Física Cronológica de Horímetro/KM (Anti-Regressão e Anti-Salto > 24h/dia)
// 5. Indicador Visual no Topo + Sincronização Automática em Segundo Plano
// ============================================================================

const OFFLINE_DB_NAME = 'VilasaOfflineDB_v2';
const OFFLINE_DB_VERSION = 1;
let idbInstance = null;
let sincronizandoAgora = false;

// ----------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DO BANCO LOCAL (INDEXEDDB)
// ----------------------------------------------------------------------------
function abrirBancoOffline() {
  return new Promise((resolve, reject) => {
    if (idbInstance) return resolve(idbInstance);

    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    req.onupgradeneeded = (event) => {
      const dbLocal = event.target.result;
      // Armazena cópias completas das tabelas para leitura sem internet
      if (!dbLocal.objectStoreNames.contains('cache_tabelas')) {
        dbLocal.createObjectStore('cache_tabelas', { keyPath: 'tabela' });
      }
      // Fila cronológica de ações feitas sem sinal (FIFO)
      if (!dbLocal.objectStoreNames.contains('fila_mutacoes')) {
        const storeFila = dbLocal.createObjectStore('fila_mutacoes', { keyPath: 'id_fila', autoIncrement: true });
        storeFila.createIndex('criado_em', 'criado_em', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      idbInstance = event.target.result;
      resolve(idbInstance);
    };

    req.onerror = (event) => {
      console.error('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Salva uma tabela inteira no espelho local do aparelho
async function salvarTabelaNoCacheOffline(nomeTabela, registros) {
  try {
    const dbLocal = await abrirBancoOffline();
    return new Promise((resolve, reject) => {
      const tx = dbLocal.transaction('cache_tabelas', 'readwrite');
      const store = tx.objectStore('cache_tabelas');
      store.put({
        tabela: nomeTabela,
        dados: Array.isArray(registros) ? registros : [],
        atualizado_em: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn('Falha ao gravar cache offline:', e);
  }
}

// Lê uma tabela do espelho local do aparelho quando está sem internet
async function lerTabelaDoCacheOffline(nomeTabela) {
  try {
    const dbLocal = await abrirBancoOffline();
    return new Promise((resolve) => {
      const tx = dbLocal.transaction('cache_tabelas', 'readonly');
      const store = tx.objectStore('cache_tabelas');
      const req = store.get(nomeTabela);
      req.onsuccess = () => resolve(req.result ? req.result.dados : []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

// ----------------------------------------------------------------------------
// 2. PRÉ-CARREGAMENTO COMPLETO DA FROTA E DADOS ESSENCIAIS NO APARELHO
// ----------------------------------------------------------------------------
async function preCarregarPacoteEssencialOffline() {
  if (!navigator.onLine || typeof db === 'undefined') return;

  try {
    // Baixa TODAS as máquinas da empresa (mesmo que o operador nunca tenha lido o QR Code delas)
    const listaEquip = typeof buscarTudoSemLimite === 'function'
      ? await buscarTudoSemLimite('equipamentos', 'tag', true)
      : (await db.from('equipamentos').select('*').order('tag')).data || [];

    if (listaEquip.length > 0) {
      await salvarTabelaNoCacheOffline('equipamentos', listaEquip);
      if (typeof cacheEquipamentos !== 'undefined') cacheEquipamentos = listaEquip;
    }

    // Baixa Obras, Peças e Ordens de Serviço ativas para operação no trecho/oficina
    const [resObras, resPecas, resOS] = await Promise.all([
      db.from('obras').select('*').eq('ativa', true),
      db.from('pecas_estoque').select('*').order('codigo'),
      db.from('ordens_servico').select('*, equipamentos(tag, nome, marca, unidade_medida, obra_id)').order('aberta_em', { ascending: false }).limit(500)
    ]);

    if (resObras.data) await salvarTabelaNoCacheOffline('obras', resObras.data);
    if (resPecas.data) await salvarTabelaNoCacheOffline('pecas_estoque', resPecas.data);
    if (resOS.data) await salvarTabelaNoCacheOffline('ordens_servico', resOS.data);

    atualizarBadgeStatusRede();
  } catch (err) {
    console.warn('Pré-carregamento offline interrompido por oscilação de rede:', err.message);
  }
}

// Helper Universal de Leitura: Tenta nuvem (com timeout de 4.5s para 4G fraco); se falhar, entrega do celular
async function lerDadosComFallbackOffline(nomeTabela, queryFnSupabase) {
  if (navigator.onLine) {
    try {
      const promessaComTimeout = Promise.race([
        queryFnSupabase(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_REDE_FRACA')), 4500))
      ]);
      const { data, error } = await promessaComTimeout;
      if (!error && Array.isArray(data)) {
        await salvarTabelaNoCacheOffline(nomeTabela, data);
        return { data, origem: 'online' };
      }
    } catch (e) {
      console.warn(`Usando espelho offline para [${nomeTabela}] (${e.message})`);
    }
  }

  const dadosLocais = await lerTabelaDoCacheOffline(nomeTabela);
  return { data: dadosLocais, origem: 'offline' };
}

// ----------------------------------------------------------------------------
// 3. TRAVA FÍSICA CRONOLÓGICA DE HORÍMETRO / KM (ANTI-REGRESSÃO E ANTI-SALTO)
// ----------------------------------------------------------------------------
/**
 * Valida se o novo horímetro/KM é fisicamente possível no intervalo de tempo.
 * Retorna:
 * { valido: boolean, nivel: 'ok'|'alerta'|'bloqueio'|'regressao', mensagem: string, avanco: number, tetoPermitido: number }
 */
function validarFisicaHorimetro(equipamento, novoValor, dataLeituraISO = null) {
  const valorNovo = parseFloat(novoValor);
  if (isNaN(valorNovo) || valorNovo < 0) {
    return { valido: false, nivel: 'bloqueio', mensagem: 'Informe um valor numérico válido maior que zero.' };
  }

  const valorAtual = parseFloat(equipamento?.horimetro_atual || 0);
  const unidade = String(equipamento?.unidade_medida || 'H').toUpperCase(); // 'H' ou 'KM'

  // 1. Trava contra regressão
  if (valorNovo < valorAtual) {
    return {
      valido: false,
      nivel: 'regressao',
      mensagem: `🚫 REGRESSÃO BLOQUEADA: O valor digitado (${valorNovo} ${unidade}) é menor que o último registrado no sistema (${valorAtual} ${unidade}).`,
      avanco: valorNovo - valorAtual,
      tetoPermitido: valorAtual
    };
  }

  // Se o horímetro anterior era zero (máquina recém-cadastrada sem base inicial), permite o 1º lançamento
  if (valorAtual === 0) {
    return { valido: true, nivel: 'ok', mensagem: 'Primeiro registro de base do equipamento.', avanco: valorNovo, tetoPermitido: valorNovo };
  }

  const avanco = Number((valorNovo - valorAtual).toFixed(1));
  const agora = dataLeituraISO ? new Date(dataLeituraISO) : new Date();
  const dataAnterior = equipamento?.horimetro_atualizado_em ? new Date(equipamento.horimetro_atualizado_em) : null;

  // Calcula os dias corridos desde a última leitura (mínimo de 1 janela de 24h para evitar falsos bloqueios no mesmo turno)
  let diasDecorridos = 1;
  if (dataAnterior && !isNaN(dataAnterior.getTime())) {
    const diffHorasReais = Math.max(1, (agora - dataAnterior) / 3600000);
    diasDecorridos = Math.max(1, diffHorasReais / 24);
  } else {
    // Se a máquina ainda não tinha carimbo de data anterior, assume janela padrão de até 5 dias corridos
    diasDecorridos = 5;
  }

  if (unidade === 'KM') {
    const limiteAlertaKm = Math.round(diasDecorridos * 600);
    const tetoFisicoKm = Math.round(diasDecorridos * 1200);
    const maximoPossivel = Number((valorAtual + tetoFisicoKm).toFixed(1));

    if (avanco > tetoFisicoKm) {
      return {
        valido: false,
        nivel: 'bloqueio',
        mensagem: `🚫 SALTO IMPOSSÍVEL DETECTADO (+${avanco} KM):\nO equipamento estava com ${valorAtual} KM e você digitou ${valorNovo} KM.\nPelo tempo decorrido (${diasDecorridos.toFixed(1)} dia(s)), o teto físico máximo é ${maximoPossivel} KM.\nVerifique se digitou um número a mais!`,
        avanco,
        tetoPermitido: maximoPossivel
      };
    }
    if (avanco > limiteAlertaKm) {
      return {
        valido: true,
        nivel: 'alerta',
        mensagem: `⚠️ ATENÇÃO: Você está lançando um avanço alto de +${avanco} KM (${valorAtual} -> ${valorNovo} KM). Confirma que o odômetro está correto?`,
        avanco,
        tetoPermitido: maximoPossivel
      };
    }
  } else {
    // Unidade = HORAS (H) -> Um dia tem fisicamente 24 horas!
    const limiteAlertaHoras = Number((diasDecorridos * 18).toFixed(1));
    const tetoFisicoHoras = Number((diasDecorridos * 24).toFixed(1));
    const maximoPossivel = Number((valorAtual + tetoFisicoHoras).toFixed(1));

    if (avanco > tetoFisicoHoras) {
      return {
        valido: false,
        nivel: 'bloqueio',
        mensagem: `🚫 SALTO FÍSICO IMPOSSÍVEL (+${avanco} h):\nO equipamento estava com ${valorAtual}h e você digitou ${valorNovo}h.\nComo um dia tem apenas 24 horas, para o período de ${diasDecorridos.toFixed(1)} dia(s) o máximo físico possível seria ${maximoPossivel}h.\nVerifique se não esqueceu a vírgula ou digitou um dígito extra!`,
        avanco,
        tetoPermitido: maximoPossivel
      };
    }
    if (avanco > limiteAlertaHoras) {
      return {
        valido: true,
        nivel: 'alerta',
        mensagem: `⚠️ ATENÇÃO: Avanço elevado de +${avanco} horas registrado (${valorAtual}h -> ${valorNovo}h). Confirma que o horímetro foi lido corretamente?`,
        avanco,
        tetoPermitido: maximoPossivel
      };
    }
  }

  return { valido: true, nivel: 'ok', mensagem: 'Leitura dentro dos parâmetros físicos.', avanco, tetoPermitido: valorNovo };
}

// ----------------------------------------------------------------------------
// 4. FILA DE ESCRITA E ENCADEAMENTO OFFLINE (CRIAR -> EDITAR -> FECHAR SEM REDE)
// ----------------------------------------------------------------------------
async function obterFilaMutacoes() {
  try {
    const dbLocal = await abrirBancoOffline();
    return new Promise((resolve) => {
      const tx = dbLocal.transaction('fila_mutacoes', 'readonly');
      const store = tx.objectStore('fila_mutacoes');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

async function adicionarNaFilaOffline(itemMutacao) {
  const dbLocal = await abrirBancoOffline();
  const filaAtual = await obterFilaMutacoes();

  // ENCADEAMENTO INTELIGENTE:
  // Se o usuário criou uma OS offline (temp_id) e agora está editando ou fechando a MESMA OS ainda offline,
  // nós fundimos os dados direto no comando de INSERT original da fila para subir já atualizado!
  if (itemMutacao.operacao === 'UPDATE' && String(itemMutacao.registro_id).startsWith('temp_')) {
    const itemCriacao = filaAtual.find(
      f => f.operacao === 'INSERT' && f.tabela === itemMutacao.tabela && f.temp_id === itemMutacao.registro_id
    );
    if (itemCriacao) {
      itemCriacao.payload = { ...itemCriacao.payload, ...itemMutacao.payload };
      await atualizarItemFilaOffline(itemCriacao);
      await aplicarMutacaoNoCacheLocal(itemMutacao);
      atualizarBadgeStatusRede();
      return { encadeado: true, id: itemMutacao.registro_id };
    }
  }

  return new Promise((resolve, reject) => {
    const tx = dbLocal.transaction('fila_mutacoes', 'readwrite');
    const store = tx.objectStore('fila_mutacoes');
    const novoItem = {
      ...itemMutacao,
      criado_em: new Date().toISOString()
    };
    const req = store.add(novoItem);
    req.onsuccess = async () => {
      await aplicarMutacaoNoCacheLocal(novoItem);
      atualizarBadgeStatusRede();
      resolve(novoItem);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function atualizarItemFilaOffline(itemExistente) {
  const dbLocal = await abrirBancoOffline();
  return new Promise((resolve) => {
    const tx = dbLocal.transaction('fila_mutacoes', 'readwrite');
    tx.objectStore('fila_mutacoes').put(itemExistente);
    tx.oncomplete = () => resolve(true);
  });
}

async function removerItemFilaOffline(idFila) {
  const dbLocal = await abrirBancoOffline();
  return new Promise((resolve) => {
    const tx = dbLocal.transaction('fila_mutacoes', 'readwrite');
    tx.objectStore('fila_mutacoes').delete(idFila);
    tx.oncomplete = () => resolve(true);
  });
}

// Atualiza o espelho local imediatamente para que o operador/mecânico veja sua ação na tela mesmo sem internet
async function aplicarMutacaoNoCacheLocal(mutacao) {
  const lista = await lerTabelaDoCacheOffline(mutacao.tabela);
  if (mutacao.operacao === 'INSERT') {
    const regLocal = {
      ...mutacao.payload,
      id: mutacao.temp_id || mutacao.payload.id,
      _offline_pendente: true
    };
    lista.unshift(regLocal);
    await salvarTabelaNoCacheOffline(mutacao.tabela, lista);
  } else if (mutacao.operacao === 'UPDATE') {
    const idx = lista.findIndex(r => String(r.id) === String(mutacao.registro_id));
    if (idx >= 0) {
      lista[idx] = { ...lista[idx], ...mutacao.payload, _offline_pendente: true };
      await salvarTabelaNoCacheOffline(mutacao.tabela, lista);
    }
  }
}

/**
 * Função Universal para Gravar Dados (Online ou Offline Transparente)
 * @param {string} tabela - ex: 'ordens_servico', 'diario_horimetro', 'equipamentos'
 * @param {'INSERT'|'UPDATE'} operacao
 * @param {object} payload - dados a gravar
 * @param {string|null} registroId - obrigatório em caso de UPDATE
 */
async function gravarDadosOfflineSafe(tabela, operacao, payload, registroId = null) {
  // Se estiver com internet ativa, tenta gravar direto no Supabase
  if (navigator.onLine) {
    try {
      if (operacao === 'INSERT') {
        const { data, error } = await db.from(tabela).insert([payload]).select().maybeSingle();
        if (error) throw error;
        return { online: true, data };
      } else if (operacao === 'UPDATE') {
        const { data, error } = await db.from(tabela).update(payload).eq('id', registroId).select().maybeSingle();
        if (error) throw error;
        return { online: true, data };
      }
    } catch (err) {
      console.warn(`Falha na gravação online em [${tabela}], salvando na fila offline:`, err.message);
    }
  }

  // Sem internet (ou falha de conexão): salva no banco local do aparelho
  const tempId = operacao === 'INSERT' ? `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` : registroId;
  await adicionarNaFilaOffline({
    tabela,
    operacao,
    payload,
    registro_id: registroId,
    temp_id: tempId,
    timestamp_real_campo: new Date().toISOString()
  });

  return {
    online: false,
    offline_queued: true,
    data: { ...payload, id: tempId, _offline_pendente: true }
  };
}

// ----------------------------------------------------------------------------
// 5. MOTOR DE SINCRONIZAÇÃO AUTOMÁTICA EM SEGUNDO PLANO (QUANDO O 4G VOLTA)
// ----------------------------------------------------------------------------
async function sincronizarFilaOfflineAgora() {
  if (!navigator.onLine || sincronizandoAgora || typeof db === 'undefined') return;

  const fila = await obterFilaMutacoes();
  if (fila.length === 0) {
    atualizarBadgeStatusRede();
    return;
  }

  sincronizandoAgora = true;
  atualizarBadgeStatusRede(true, fila.length);

  // Mapa para traduzir temp_id -> UUID oficial gerado pelo Supabase caso haja dependências na fila
  const mapaIdsTemporarios = {};

  for (const item of fila) {
    try {
      const payloadLimpo = { ...item.payload };
      delete payloadLimpo._offline_pendente;

      // Se o payload referencia um equipamento_id ou os_id que era temporário e acabou de ganhar UUID real, substitui
      Object.keys(payloadLimpo).forEach(chave => {
        const val = payloadLimpo[chave];
        if (typeof val === 'string' && mapaIdsTemporarios[val]) {
          payloadLimpo[chave] = mapaIdsTemporarios[val];
        }
      });

      if (item.operacao === 'INSERT') {
        const { data, error } = await db.from(item.tabela).insert([payloadLimpo]).select().maybeSingle();
        if (error) throw error;
        if (item.temp_id && data?.id) {
          mapaIdsTemporarios[item.temp_id] = data.id;
        }
      } else if (item.operacao === 'UPDATE') {
        const idAlvo = mapaIdsTemporarios[item.registro_id] || item.registro_id;

        // Regra de conflito para Horímetro na subida: nunca sobrescreve se o banco já tiver um valor maior válido
        if (item.tabela === 'equipamentos' && payloadLimpo.horimetro_atual !== undefined) {
          const { data: eqBanco } = await db.from('equipamentos').select('horimetro_atual').eq('id', idAlvo).maybeSingle();
          if (eqBanco && parseFloat(eqBanco.horimetro_atual) > parseFloat(payloadLimpo.horimetro_atual)) {
            delete payloadLimpo.horimetro_atual;
          }
        }

        // Regra de conflito para o Uber de Mecânicos: se outro mecânico já aceitou enquanto este estava offline
        if (item.tabela === 'ordens_servico' && payloadLimpo.status === 'em_execucao' && payloadLimpo.mecanico_id) {
          const { data: osBanco } = await db.from('ordens_servico').select('status, mecanico_id, mecanico_nome').eq('id', idAlvo).maybeSingle();
          if (osBanco && osBanco.status === 'em_execucao' && osBanco.mecanico_id && osBanco.mecanico_id !== payloadLimpo.mecanico_id) {
            payloadLimpo.mecanico_nome = `${osBanco.mecanico_nome} + ${payloadLimpo.mecanico_nome || 'Apoio'}`;
            delete payloadLimpo.mecanico_id; // Mantém o titular e adiciona como co-executante
          }
        }

        if (Object.keys(payloadLimpo).length > 0) {
          const { error } = await db.from(item.tabela).update(payloadLimpo).eq('id', idAlvo);
          if (error) throw error;
        }
      }

      // Sucesso: remove da fila local
      await removerItemFilaOffline(item.id_fila);
    } catch (err) {
      console.error(`Erro ao sincronizar item #${item.id_fila} (${item.tabela}):`, err.message);
      // Se for erro de falta de sinal no meio do envio, interrompe o loop e tenta no próximo ciclo
      if (!navigator.onLine) break;
    }
  }

  sincronizandoAgora = false;
  await preCarregarPacoteEssencialOffline();
  atualizarBadgeStatusRede();
}

// ----------------------------------------------------------------------------
// 6. INDICADOR VISUAL DE CONEXÃO E BOTÃO DE SINCRONIZAÇÃO NO TOPO
// ----------------------------------------------------------------------------
async function atualizarBadgeStatusRede(emProgresso = false, totalSinc = 0) {
  let badge = document.getElementById('badgeStatusOfflineGlobal');
  if (!badge) {
    const headerUser = document.getElementById('headerNomeUsuario')?.parentElement;
    if (headerUser) {
      badge = document.createElement('div');
      badge.id = 'badgeStatusOfflineGlobal';
      badge.className = 'mt-2';
      headerUser.appendChild(badge);
    }
  }
  if (!badge) return;

  const fila = await obterFilaMutacoes();
  const pendentes = fila.length;

  if (emProgresso) {
    badge.innerHTML = `
      <div class="flex items-center justify-between bg-blue-900/80 border border-blue-400 text-blue-100 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold animat
