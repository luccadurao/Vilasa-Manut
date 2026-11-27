// @ts-check
// ============================================================================
// Cadastro de ativos. Mora no núcleo para um cliente sem Frota ainda ter
// máquina na OS. A tela da Frota continua chamando estes nomes globais;
// ciclo, leitura e QR ficam em frota.js.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /**
   * @param {unknown} valor
   */
  function escapar(valor) {
    if (typeof root.esc === 'function') return root.esc(valor);
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {unknown} tag
   */
  function chaveTag(tag) {
    return String(tag ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/([A-Z])0+(\d)/g, '$1$2');
  }

  /**
   * @param {unknown} unidade
   */
  function codigoDoTipo(unidade) {
    const un = String(unidade || 'H').trim().toUpperCase();
    if (un === 'KM') return 'VEICULO';
    if (un === '' || un === 'H') return 'MAQUINA_PESADA';
    return 'UN_' + un.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  /**
   * @param {Array<{ id?: string, codigo?: string }> | null | undefined} tipos
   * @param {unknown} unidade
   */
  function idDoTipo(tipos, unidade) {
    const codigo = codigoDoTipo(unidade);
    const lista = Array.isArray(tipos) ? tipos : [];
    const achado = lista.find((tipo) => tipo && tipo.codigo === codigo && tipo.id);
    return achado ? String(achado.id) : null;
  }

  /**
   * @param {Record<string, any>} campos
   * @param {{ tipos?: Array<{ id?: string, codigo?: string }> | null, colunasNovas?: boolean }} [opcoes]
   */
  function payloadNovo(campos, opcoes) {
    const origem = campos || {};
    const obraId = origem.obra_id || null;
    /** @type {Record<string, any>} */
    const payload = {
      tag: origem.tag,
      nome: origem.nome,
      marca: origem.marca || '',
      modelo: origem.modelo || '',
      ano_fabricacao: origem.ano_fabricacao || '',
      numero_serie: origem.numero_serie || '',
      placa: origem.placa || '',
      propriedade: origem.propriedade || 'proprio',
      situacao_ciclo: 'ativo',
      unidade_medida: origem.unidade_medida || 'H',
      horimetro_atual: Number(origem.horimetro_atual) || 0,
      obra_id: obraId
    };
    if (!opcoes || !opcoes.colunasNovas) return payload;
    payload.local_id = obraId;
    payload.tipo_ativo_id = idDoTipo(opcoes.tipos, payload.unidade_medida);
    payload.atributos = {};
    return payload;
  }

  /**
   * @param {Record<string, any>} campos
   * @param {{ tipos?: Array<{ id?: string, codigo?: string }> | null, colunasNovas?: boolean }} [opcoes]
   */
  function payloadEdicao(campos, opcoes) {
    const origem = campos || {};
    /** @type {Record<string, any>} */
    const payload = {
      nome: origem.nome,
      marca: origem.marca || '',
      modelo: origem.modelo || '',
      ano_fabricacao: origem.ano_fabricacao || '',
      numero_serie: origem.numero_serie || '',
      placa: origem.placa || '',
      unidade_medida: origem.unidade_medida || 'H'
    };
    if (opcoes && opcoes.colunasNovas) {
      const tipoId = idDoTipo(opcoes.tipos, payload.unidade_medida);
      if (tipoId) payload.tipo_ativo_id = tipoId;
    }
    return payload;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function colunasNovasDisponiveis() {
    if (!root.db || typeof root.db.from !== 'function') return false;
    const { error } = await root.db.from('tipos_ativo').select('id').limit(1);
    return !error;
  }

  /**
   * @returns {Promise<Array<{ id?: string, codigo?: string }>>}
   */
  async function lerTipos() {
    if (!root.db || typeof root.db.from !== 'function') return [];
    const { data, error } = await root.db.from('tipos_ativo').select('id, codigo');
    if (error || !Array.isArray(data)) return [];
    return data;
  }

  function podeCadastrar() {
    if (typeof root.podeExecutarAcao === 'function') return root.podeExecutarAcao('gerenciar_frota', true);
    return false;
  }

  /**
   * @param {string} id
   * @param {string} html
   */
  function abrirCaixa(id, html) {
    const doc = root.document;
    if (!doc) return;
    let modal = doc.getElementById(id);
    if (!modal) {
      modal = doc.createElement('div');
      modal.id = id;
      modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
      doc.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.classList.remove('hidden');
  }

  function termoAtivo() {
    const fn = root.Plataforma && root.Plataforma.termo;
    return typeof fn === 'function' ? fn('ativo') : 'Equipamento';
  }

  function termoLocal() {
    const fn = root.Plataforma && root.Plataforma.termo;
    return typeof fn === 'function' ? fn('local.nivel1') : 'Obra';
  }

  function obrasDoCache() {
    return Array.isArray(root.cacheObras) ? root.cacheObras : [];
  }

  function abrirCadastro() {
    if (!podeCadastrar()) return;
    if (root.navigator && root.navigator.onLine === false) {
      root.alert('Cadastro de equipamento exige internet. Faça pelo PCM quando estiver online.');
      return;
    }
    const obras = obrasDoCache();
    const obraAtiva = root.obraAtivaId;
    abrirCaixa('modalNovoEquipV2', `
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border my-8 max-h-[90vh] overflow-y-auto">
      <h3 class="text-lg font-black text-slate-900 border-b pb-2 mb-4">Cadastrar ${escapar(termoAtivo())} na Frota</h3>
      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Prefixo (TAG)</label>
            <input id="eqV2Tag" type="text" placeholder="Ex: EH-45" class="w-full border rounded-lg p-2 font-black uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Propriedade</label>
            <select id="eqV2Prop" class="w-full border rounded-lg p-2 font-bold">
              <option value="proprio">🏢 Próprio</option>
              <option value="alugado">🤝 Alugado</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block font-black uppercase text-slate-700 mb-1">Descrição</label>
          <input id="eqV2Nome" type="text" placeholder="Ex: ESCAVADEIRA HIDRÁULICA" class="w-full border rounded-lg p-2 font-bold uppercase" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Marca</label>
            <input id="eqV2Marca" type="text" placeholder="Marca" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Modelo</label>
            <input id="eqV2Modelo" type="text" placeholder="Modelo" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Ano Fab.</label>
            <input id="eqV2Ano" type="text" placeholder="Ex: 2023" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Número de Série</label>
            <input id="eqV2Serie" type="text" placeholder="Nº de Série" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Placa (Opcional)</label>
            <input id="eqV2Placa" type="text" placeholder="Ex: ABC-1234" class="w-full border rounded-lg p-2 font-bold uppercase" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Unidade</label>
            <select id="eqV2Unidade" class="w-full border rounded-lg p-2 font-bold">
              <option value="H">Horas (H)</option>
              <option value="KM">KM</option>
            </select>
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">Horímetro</label>
            <input id="eqV2Horimetro" type="number" step="0.1" value="0" class="w-full border rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-black uppercase text-slate-700 mb-1">${escapar(termoLocal())}</label>
            <select id="eqV2Obra" class="w-full border rounded-lg p-2 font-bold">
              ${obras.map((/** @type {{ id?: string, codigo?: string }} */ obra) => `<option value="${escapar(obra.id)}" ${obraAtiva === obra.id ? 'selected' : ''}>${escapar(obra.codigo)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="document.getElementById('modalNovoEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
        <button onclick="salvarNovoEquipamentoV2()" class="px-5 py-2 rounded-lg bg-amber-500 font-black text-xs text-slate-950 shadow">Salvar Ativo</button>
      </div>
    </div>`);
  }

  async function salvarNovo() {
    const doc = root.document;
    if (!doc) return;
    const tag = doc.getElementById('eqV2Tag').value.trim().toUpperCase();
    const nome = doc.getElementById('eqV2Nome').value.trim().toUpperCase();
    if (!tag || !nome) return root.alert('Informe Prefixo e Descrição!');
    if (root.navigator && root.navigator.onLine === false) {
      return root.alert('Equipamento só pode ser cadastrado com internet (somente PCM). Tente novamente quando estiver online.');
    }
    const cache = Array.isArray(root.cacheEquipamentos) ? root.cacheEquipamentos : [];
    if (cache.some((/** @type {{ tag?: string }} */ item) => chaveTag(item.tag) === chaveTag(tag))) {
      return root.alert('Já existe um equipamento com esse prefixo (' + tag + ').');
    }
    const campos = {
      tag,
      nome,
      marca: doc.getElementById('eqV2Marca').value.trim().toUpperCase(),
      modelo: doc.getElementById('eqV2Modelo').value.trim().toUpperCase(),
      ano_fabricacao: doc.getElementById('eqV2Ano').value.trim(),
      numero_serie: doc.getElementById('eqV2Serie').value.trim().toUpperCase(),
      placa: doc.getElementById('eqV2Placa').value.trim().toUpperCase(),
      propriedade: doc.getElementById('eqV2Prop').value,
      unidade_medida: doc.getElementById('eqV2Unidade').value,
      horimetro_atual: parseFloat(doc.getElementById('eqV2Horimetro').value) || 0,
      obra_id: doc.getElementById('eqV2Obra').value || null
    };
    const novas = await colunasNovasDisponiveis();
    const tipos = novas ? await lerTipos() : [];
    await root.gravarDadosOfflineSafe('equipamentos', 'INSERT', payloadNovo(campos, { tipos, colunasNovas: novas }));
    doc.getElementById('modalNovoEquipV2')?.classList.add('hidden');
    if (typeof root.carregarFrota === 'function') await root.carregarFrota('ativo');
  }

  /**
   * @param {string} equipId
   */
  function abrirEdicao(equipId) {
    if (!podeCadastrar()) return;
    const cache = Array.isArray(root.cacheEquipamentos) ? root.cacheEquipamentos : [];
    const eq = cache.find((/** @type {{ id?: string }} */ item) => String(item.id) === String(equipId));
    if (!eq) return;
    /**
     * @param {string} id
     * @param {string} rotulo
     * @param {unknown} valor
     */
    const campo = (id, rotulo, valor) => `<label class="block text-xs font-black text-slate-700">${rotulo}<input id="${id}" value="${escapar(String(valor ?? ''))}" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold uppercase" /></label>`;
    abrirCaixa('modalEditarEquipV2', `<div class="bg-white rounded-2xl p-5 w-full max-w-md space-y-3">
    <h3 class="font-black text-slate-900">✏️ Editar ${escapar(eq.tag)}</h3>
    ${campo('edNome', 'Descrição', eq.nome)}${campo('edMarca', 'Marca', eq.marca)}${campo('edModelo', 'Modelo', eq.modelo)}
    ${campo('edAno', 'Ano', eq.ano_fabricacao)}${campo('edSerie', 'Nº de série', eq.numero_serie)}${campo('edPlaca', 'Placa', eq.placa)}
    <label class="block text-xs font-black text-slate-700">Medidor principal
      <select id="edUn" class="mt-1 w-full border rounded-lg p-2 text-sm font-bold"><option value="H" ${eq.unidade_medida !== 'KM' ? 'selected' : ''}>Horas</option><option value="KM" ${eq.unidade_medida === 'KM' ? 'selected' : ''}>KM</option></select></label>
    <div class="flex justify-end gap-2 pt-2">
      <button onclick="document.getElementById('modalEditarEquipV2').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 font-bold text-xs">Cancelar</button>
      <button onclick="salvarEdicaoEquipamento('${escapar(eq.id)}')" class="px-5 py-2 rounded-lg bg-slate-900 text-amber-400 font-black text-xs">Salvar</button>
    </div></div>`);
  }

  /**
   * @param {string} equipId
   */
  async function salvarEdicao(equipId) {
    const doc = root.document;
    if (!doc) return;
    /** @param {string} id */
    const ler = (id) => doc.getElementById(id).value.trim().toUpperCase();
    const nome = ler('edNome');
    if (!nome) return root.alert('Informe a descrição!');
    const campos = {
      nome,
      marca: ler('edMarca'),
      modelo: ler('edModelo'),
      ano_fabricacao: ler('edAno'),
      numero_serie: ler('edSerie'),
      placa: ler('edPlaca'),
      unidade_medida: doc.getElementById('edUn').value
    };
    const novas = await colunasNovasDisponiveis();
    const tipos = novas ? await lerTipos() : [];
    await root.gravarDadosOfflineSafe('equipamentos', 'UPDATE', payloadEdicao(campos, { tipos, colunasNovas: novas }), equipId);
    doc.getElementById('modalEditarEquipV2')?.classList.add('hidden');
    const situacao = typeof root.filtroSituacaoFrota !== 'undefined' ? root.filtroSituacaoFrota : 'ativo';
    if (typeof root.carregarFrota === 'function') await root.carregarFrota(situacao);
  }

  root.abrirModalCadastroEquipamentoV2 = abrirCadastro;
  root.salvarNovoEquipamentoV2 = salvarNovo;
  root.abrirModalEditarEquipamento = abrirEdicao;
  root.salvarEdicaoEquipamento = salvarEdicao;

  if (root.Plataforma) {
    root.Plataforma.ativos = {
      codigoDoTipo,
      payloadNovo,
      payloadEdicao,
      abrirCadastro,
      salvarNovo,
      abrirEdicao,
      salvarEdicao
    };
  }
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));
