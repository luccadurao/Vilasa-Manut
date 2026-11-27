'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { carregarVilasa } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

test('o termo padrão da empresa 1 continua Obra e o seletor não muda o texto', () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  assert.equal(Vilasa.termo('local.nivel1'), 'Obra');
  assert.equal(Vilasa.termo('local.nivel2'), 'Frente');
  assert.equal(Vilasa.termo('ativo'), 'Equipamento');
  assert.equal(Vilasa.termo('ativo.plural'), 'Equipamentos');
  const textos = Vilasa.termo.textos({});
  assert.equal(textos.etiqueta, 'Frente / Obra Ativa:');
  assert.equal(textos.consolidado, 'TODAS AS OBRAS (CONSOLIDADO)');
  assert.equal(textos.selecionada, 'Obra Selecionada');
  assert.equal(textos.unica('OB-01', 'PÁTIO'), 'Obra: OB-01 - PÁTIO');
  assert.equal(textos.unica('', ''), 'Obra: Matriz Geral');
  const planta = Vilasa.termo.textos({
    'local.nivel1': 'Planta',
    'local.nivel2': 'Setor',
    'local.nivel1.plural': 'Plantas'
  });
  assert.equal(planta.etiqueta, 'Setor / Planta Ativa:');
  assert.equal(planta.consolidado, 'TODAS AS PLANTAS (CONSOLIDADO)');
  assert.equal(Vilasa.termo('local.nivel1', { 'local.nivel1': '  Planta  ' }), 'Planta');
});

test('o termo da sessão vence o padrão', () => {
  const { Vilasa, sandbox } = carregarVilasa(raiz, { manifestos: false });
  sandbox.usuarioLogado = {
    empresa: { termos: { 'local.nivel1': 'Contrato', 'ativo': 'Máquina' } }
  };
  assert.equal(Vilasa.termo('local.nivel1'), 'Contrato');
  assert.equal(Vilasa.termo('ativo'), 'Máquina');
  assert.equal(Vilasa.termo('local.nivel2'), 'Frente');
  assert.equal(Vilasa.termo.textos().etiqueta, 'Frente / Contrato Ativa:');
});

test('o cadastro do núcleo grava local e tipo sem pedir a máquina no QR', () => {
  const { Vilasa } = carregarVilasa(raiz, { manifestos: false });
  const tipos = [
    { id: 'tipo-h', codigo: 'MAQUINA_PESADA' },
    { id: 'tipo-km', codigo: 'VEICULO' }
  ];
  const novo = Vilasa.ativos.payloadNovo({
    tag: 'EH-45',
    nome: 'ESCAVADEIRA',
    unidade_medida: 'H',
    obra_id: 'obra-1',
    horimetro_atual: '12,5'
  }, { tipos, colunasNovas: true });
  assert.equal(novo.obra_id, 'obra-1');
  assert.equal(novo.local_id, 'obra-1');
  assert.equal(novo.tipo_ativo_id, 'tipo-h');
  assert.equal(JSON.stringify(novo.atributos), '{}');
  assert.equal(novo.situacao_ciclo, 'ativo');
  const km = Vilasa.ativos.payloadNovo({
    tag: 'CA-1',
    nome: 'CAMINHAO',
    unidade_medida: 'KM',
    obra_id: 'obra-1'
  }, { tipos, colunasNovas: true });
  assert.equal(km.tipo_ativo_id, 'tipo-km');
  const antigo = Vilasa.ativos.payloadNovo({
    tag: 'EH-45',
    nome: 'ESCAVADEIRA',
    unidade_medida: 'H',
    obra_id: 'obra-1'
  }, { colunasNovas: false });
  assert.equal(Object.prototype.hasOwnProperty.call(antigo, 'local_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(antigo, 'tipo_ativo_id'), false);
  const edicao = Vilasa.ativos.payloadEdicao({
    nome: 'ESCAVADEIRA',
    unidade_medida: 'KM'
  }, { tipos, colunasNovas: true });
  assert.equal(edicao.tipo_ativo_id, 'tipo-km');
  assert.equal(Object.prototype.hasOwnProperty.call(edicao, 'obra_id'), false);
  const qr = fs.readFileSync(path.join(raiz, 'qr.html'), 'utf8');
  assert.equal(qr.includes('p_tag'), false);
  assert.equal(qr.includes('Digite a tag'), false);
  assert.match(qr, /p_id: equipAtualQR\.id/);
  const frota = fs.readFileSync(path.join(raiz, 'frota.js'), 'utf8');
  assert.equal(frota.includes('function salvarNovoEquipamentoV2'), false);
  assert.equal(frota.includes('function abrirModalCadastroEquipamentoV2'), false);
  assert.match(frota, /id: eq\.id/);
});

test('a 0004 não remove tabela, coluna, usuário nem policy', () => {
  const sql = fs.readFileSync(path.join(raiz, 'banco/migracoes/0004_locais_ativos.sql'), 'utf8');
  assert.equal(/\bDROP\s+TABLE\b/i.test(sql), false);
  assert.equal(/\bDROP\s+COLUMN\b/i.test(sql), false);
  assert.equal(/\bDROP\s+(USER|ROLE)\b/i.test(sql), false);
  assert.equal(/\bDROP\s+POLICY\b/i.test(sql), false);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.locais/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.locais_niveis/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tipos_ativo/);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.obras/);
  assert.match(sql, /CREATE OR REPLACE VIEW public\.ativos/);
  assert.match(sql, /app\.local_ok/);
  assert.match(sql, /tipo_ativo_id/);
  assert.match(sql, /local_id/);
  assert.match(sql, /atributos jsonb/);
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.equal(sw.includes("'./nucleo/ativos.js'"), true);
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  assert.equal(html.includes('src="nucleo/ativos.js"'), true);
});
