---
name: publicar-homologacao
description: Fecha a tarefa atual do Vilasa-Manut - verifica, revisa, faz push da branch de trabalho e abre o PR para homologacao no padrão do projeto. Use quando a implementação estiver pronta ou quando o Lucca pedir /publicar-homologacao.
---
Feche a tarefa atual e abra o PR para `homologacao`.

1. Confirme que você está numa branch `claude/...`, não em `main` nem em
   `homologacao`. Se estiver, crie a branch agora e mova os commits para ela.
2. Se algum arquivo servido ao navegador mudou, confira se `nucleo/versao.js`
   subiu.
3. Chame o subagente `testador`. Se falhar, corrija e repita.
4. Se mudou algo em `banco/`, chame o `revisor-banco`. Corrija e repita.
5. Chame o `revisor-codigo`. Corrija os itens de risco alto e médio e repita.
6. `git push -u origin <branch>`.
7. Abra o PR com base `homologacao`, título curto em português e corpo seguindo
   `docs/agentes/modelo-pr.md`.
8. Responda ao Lucca, curto (ele lê no celular):
   - o que mudou, em até 3 linhas;
   - link do PR e do preview da Vercel, quando aparecer;
   - como testar em até 5 passos;
   - o que precisa da aprovação dele (merge, migração).

Não faça o merge. O merge na `homologacao` e na `main` é sempre do Lucca.
