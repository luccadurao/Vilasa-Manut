// @ts-check
// ============================================================================
// ÍNDICE DE MÓDULOS
// A lista única dos módulos que existem no produto. Cada id corresponde a
// modulos/<id>/manifesto.js. Módulo novo = uma linha aqui (e a pasta dele).
//
// Script clássico: funciona na página e no service worker (importScripts).
// As páginas carregam os manifestos por aqui (nucleo/manifestos.js) e o
// sw.js monta o precache com esta lista. Nenhum outro lugar lista módulos.
// A ordem não importa: quem decide a ordem de carga são as dependências.
// ============================================================================

/** @type {readonly string[]} */
var PLATAFORMA_MODULOS = Object.freeze([
  'os',
  'frota',
  'preventivas',
  'estoque',
  'diesel',
  'painel',
  'admin'
]);
