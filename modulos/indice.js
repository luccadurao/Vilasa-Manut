// @ts-check
// ============================================================================
// ÍNDICE DE MÓDULOS
// A lista única dos módulos que existem no produto. Cada id corresponde a
// modulos/<id>/manifesto.js. Módulo novo = uma linha aqui (e a pasta dele).
//
// Script clássico: funciona na página e no service worker (importScripts).
// Nesta fase só o validador lê este arquivo (scripts/validar-manifestos.js
// confere que index.html, qr.html e sw.js batem com ele). As próximas fases
// passam a carregar os manifestos por aqui, sem lista fixa.
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
