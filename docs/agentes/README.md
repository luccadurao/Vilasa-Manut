# Como desenvolver o Vilasa-Manut com o Claude Code

Guia do dono do projeto. As regras que os agentes seguem estão em
[`CLAUDE.md`](../../CLAUDE.md), na raiz. Este arquivo explica como você usa a
estrutura no dia a dia, principalmente pelo celular.

---

## 1. Quem faz o quê

| Quem | Recebe de | Faz | Escreve código? |
|---|---|---|---|
| **Você (Lucca)** | — | Pede a tarefa, aprova o plano, testa no preview, aprova os commits principais, decide o que vai para produção | Não |
| **Sessão principal** do Claude Code | Você | Entende o pedido, planeja, implementa numa branch, chama os ajudantes, abre o PR | **Sim** |
| `testador` | Sessão principal | Roda validador, testes e tipos; devolve só o que falhou | Não |
| `revisor-banco` | Sessão principal | Revisa migrações: segurança, empresa, reversão, testes | Não |
| `revisor-codigo` | Sessão principal | Revisão final do PR contra o `CLAUDE.md` | Não |

Você conversa com **uma** sessão. Ela chama os subagentes sozinha. Os
subagentes só leem e apontam; quem corrige é a sessão principal, que tem o
contexto inteiro. Os arquivos deles ficam em [`.claude/agents/`](../../.claude/agents).

## 2. O fluxo de uma tarefa

```
Você pede ─► Plano ─► Branch claude/... ─► Código ─► testador ─► revisores ─► PR p/ homologacao
                ▲ você aprova (tarefa grande)                                        │
                                                                                     ▼
                                     Você testa no preview e aprova o merge ◄─ Resposta curta
                                                                                     │
                                                    homologacao ─► (você decide) ─► main = produção
```

1. **Você pede**, em português normal, como pediria a uma pessoa.
2. **Plano.** Em tarefa grande a sessão mostra o plano (arquivos, banco, testes,
   risco) e espera seu "ok". Em tarefa pequena ela segue direto.
3. **Branch.** Todo trabalho vai para uma branch `claude/<assunto>` criada a partir
   da `homologacao`. Nunca direto na `homologacao` ou na `main`.
4. **Verificação automática.** `testador`, depois `revisor-banco` (se mexeu no
   banco) e `revisor-codigo`. Ela corrige e repete até passar.
5. **PR para `homologacao`**, no padrão de [`modelo-pr.md`](modelo-pr.md).
6. **Resposta curta para você:** o que mudou, link do PR e do preview, como testar,
   o que precisa da sua aprovação.
7. **Você aprova o merge** na `homologacao`. Depois de testado, a ida da
   `homologacao` para a `main` também é sua.

## 3. O que pede sua aprovação

Você pediu aprovação só nos commits principais. Está configurado assim:

| Ação | O que acontece |
|---|---|
| Editar arquivos, commit e push na branch `claude/...` | Liberado |
| Rodar testes, ler código, ler o banco de homologação | Liberado |
| **Merge de PR** (`homologacao` ou `main`) | Pede sua aprovação |
| **Aplicar migração** em qualquer banco | Pede sua aprovação |
| **Criar projeto Supabase** (tem custo) | Pede sua aprovação |
| SQL no banco de **produção** | Pede sua aprovação (só leitura) |
| Escrita no banco de produção, push direto ou forçado em `main`/`homologacao` | **Bloqueado** |
| Editar migração que já está na `homologacao` ou arquivo `.env` | **Bloqueado** |

Quem garante isso é a trava [`.claude/hooks/proteger.js`](../../.claude/hooks/proteger.js),
que roda antes de cada comando do agente, junto com as permissões em
[`.claude/settings.json`](../../.claude/settings.json). A trava tem testes em
`test/hook-proteger.test.js`, que rodam no CI.

Quando aparecer o pedido de aprovação no celular, leia a frase do motivo: ela diz
o que vai acontecer. Na dúvida, negue e pergunte na conversa.

## 4. Usando pelo celular

1. Abra **claude.ai/code** no navegador do celular ou a aba de código do app
   Claude e escolha o repositório `luccadurao/vilasa-manut`.
2. Escreva a tarefa. A sessão roda na nuvem: você pode fechar o app e voltar
   depois. Ela continua trabalhando.
3. Quando ela terminar, você recebe a resposta com o link do PR. O preview da
   Vercel aparece no próprio PR, em poucos minutos.
4. Teste no preview pelo celular. Se estiver bom, aprove o merge (na conversa ou
   no GitHub).

Dicas para o celular:

- **Uma tarefa por sessão.** Assunto novo, sessão nova. Fica mais rápido e o
  histórico de cada PR fica limpo.
- **Dá para ter 2 ou 3 sessões ao mesmo tempo**, cada uma na sua branch, desde que
  mexam em partes diferentes (ex.: uma no Diesel, outra no Almoxarifado).
- **Peça a resposta curta.** O `CLAUDE.md` já pede isso, mas você pode reforçar.
- **Tarefa visual** (tela nova, ajuste de layout): prefira o desktop, onde dá para
  acompanhar e corrigir na hora.

## 5. Comandos prontos (skills)

Digite `/` na conversa para ver a lista. Os do projeto ficam em
[`.claude/skills/`](../../.claude/skills).

| Comando | Para quê | Exemplo |
|---|---|---|
| `/novo-modulo` | Módulo novo completo, no padrão da plataforma | `/novo-modulo Pneus: controle de vida útil, rodízio e recapagem` |
| `/nova-migracao` | Mudança de banco com reversão e teste | `/nova-migracao campo de garantia nas peças` |
| `/publicar-homologacao` | Fecha a tarefa: verifica, revisa e abre o PR | `/publicar-homologacao` |
| `/provisionar-cliente` | Monta o ambiente de um cliente novo (só você chama) | `/provisionar-cliente Construtora X, módulos os frota preventivas` |

Você não precisa dos comandos para trabalhar: "crie um módulo de pneus" também
funciona. O comando só garante que o roteiro seja seguido à risca.

## 6. Como pedir bem

Um bom pedido tem três partes: **o que**, **para quem** e **como você vai saber
que ficou certo**.

> Ruim: "melhora o diesel".
>
> Bom: "No Diesel, quero um alerta no cartão do tanque quando o estoque ficar
> abaixo de 20% da capacidade. Só PCM e engenheiro veem. Pronto quando o cartão
> ficar vermelho com o aviso e der para testar no preview com os dados de
> homologação."

Outras dicas:

- Se tiver um exemplo (print, planilha, foto da etiqueta), mande junto.
- Se não sabe a solução, descreva o problema e peça opções: "me dê 2 ou 3 jeitos
  de resolver e o custo de cada um".
- Se a resposta vier errada, diga o que está errado e por quê. Se o erro for de
  regra do projeto, peça para acrescentar a regra no `CLAUDE.md`, para não
  repetir.

## 7. Ambientes

| Ambiente | Branch | Banco Supabase | Quem mexe |
|---|---|---|---|
| Desenvolvimento | `claude/...` | homologação | agentes |
| Homologação | `homologacao` | `zqjgruwmqomgguxoxiuv` | merge seu |
| Produção Vilasa | `main` | `yoignpytyegagpfuvoxu` | só você |
| Cliente novo | `main` | projeto próprio de cada cliente | `/provisionar-cliente` + você |

**Pendência importante:** hoje o `config.js` aponta fixo para o banco de produção,
inclusive no preview da `homologacao`. Até isso ser trocado por "banco escolhido
pelo endereço", não faça login no preview: você estaria mexendo nos dados reais.
Essa é a primeira tarefa recomendada.

## 8. Como melhorar os agentes com o tempo

Os agentes ficam bons com uso e correção, não na primeira versão.

- **Agente errou?** Peça: "acrescente no `revisor-banco` uma regra para isso não
  passar de novo". A correção vira parte do arquivo dele.
- **Repetiu o mesmo pedido 3 vezes?** Vira skill: peça "transforme isso numa skill".
- **Regra do projeto mudou?** Atualize o `CLAUDE.md` primeiro. Todos os agentes
  leem esse arquivo.
- **Princípios** usados para escrever os agentes daqui:
  1. uma responsabilidade por agente;
  2. a descrição diz *quando* usar, não *o que* o agente é;
  3. só as ferramentas necessárias (revisor não edita);
  4. o texto explica o *porquê* das regras, para o agente julgar casos novos;
  5. formato de resposta fixo, para a sessão principal agir em cima;
  6. critério de verificação concreto ("rode X e confirme Y");
  7. modelo forte para revisão de segurança, modelo barato para rodar testes.

## 9. Mapa dos arquivos

```
CLAUDE.md                        regras que todo agente lê
.claude/
  settings.json                  permissões e ligação da trava
  hooks/proteger.js              trava de segurança (produção, push, merge, migração)
  agents/
    testador.md                  roda a verificação, resume falhas
    revisor-banco.md             revisa migrações
    revisor-codigo.md            revisão final do PR
  skills/
    novo-modulo/SKILL.md
    nova-migracao/SKILL.md
    publicar-homologacao/SKILL.md
    provisionar-cliente/SKILL.md
docs/agentes/
  README.md                      este guia
  modelo-pr.md                   padrão do texto de PR
test/hook-proteger.test.js       testes da trava
```
