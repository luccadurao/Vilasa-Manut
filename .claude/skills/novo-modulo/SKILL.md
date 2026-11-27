---
name: novo-modulo
description: Cria um módulo novo do Vilasa-Manut no padrão da plataforma (manifesto, tela, permissões, catálogo no banco, precache, testes). Use quando pedirem um módulo ou funcionalidade que o cliente possa ligar e desligar separadamente.
argument-hint: "[nome do módulo e o que ele faz]"
---
Crie o módulo: $ARGUMENTS

Antes de escrever, leia `CLAUDE.md`, `nucleo/tipos.js` (tipo `Manifesto`) e um
manifesto parecido em `modulos/*/manifesto.js` — o `diesel` é um bom modelo de
módulo que depende de outro.

## 1. Defina e confirme (mostre ao Lucca antes de codar)

- `id` curto em minúsculas, sem acento (ex.: `pneus`), e `nome` de tela.
- De quais módulos depende (`depende`) e quais são opcionais (`opcionais`).
- Permissões no formato `<id>.<acao>` (ex.: `pneus.ver`, `pneus.gerenciar`) e
  quais cargos recebem cada uma por padrão (`cargos_padrao`).
- Telas, relatórios e ações de QR que o módulo vai ter.
- Tabelas novas no banco.

## 2. Arquivos

1. `modulos/<id>/manifesto.js` — siga o tipo `Manifesto`; comece com
   `estagio: 'beta'` e `versao: '0.1.0'`.
2. Script da tela: `modulos/<id>/<id>.js` (módulo novo não vai para a raiz).
   Use `Plataforma.permissoes.pode(...)` para cada ação e `Plataforma.termo(...)`
   para textos como local/ativo (nunca "Obra" ou nome de cliente fixo). Chave
   no localStorage só por `PlataformaProduto.chave(...)`. Lançamento de campo passa pela fila do
   `offline_sync.js`, levando `empresa_id` e `modulo`.
3. Inclua o `<script src="modulos/<id>/manifesto.js">` no `index.html` (e no
   `qr.html` se tiver ação de QR), junto dos outros manifestos.
4. `sw.js`: o manifesto entra em `ARQUIVOS_NUCLEO`; o script do módulo é
   precacheado pelo contrato, não precisa entrar lá.
5. Banco: use a skill `nova-migracao` para criar as tabelas e semear o módulo em
   `modulos`, as permissões em `permissoes` e a matriz em `cargo_permissoes`.
6. Testes em `test/`: o manifesto valida, o resolver aceita e recusa conforme
   as dependências, e cada cargo vê o que deve (siga `test/paridade.test.js`).
7. Suba `nucleo/versao.js`.

## 3. Feche

Rode o `testador`, depois o `revisor-banco` (se houve SQL) e o `revisor-codigo`.
Abra o PR para `homologacao` seguindo `docs/agentes/modelo-pr.md`, com a tabela
de quem vê o quê por cargo.
