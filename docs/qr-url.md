# URL do QR

A leitura identifica a máquina sozinha. Abrir OS e lançar horímetro não pedem para escolher nem para digitar a máquina. A partir desta etapa o identificador é só o `id` (uuid de `equipamentos`). A busca por tag deixa de ser aceita.

## Formato canônico

```
https://vilasa-manut.vercel.app/qr.html?id=<uuid>
```

Exemplo:

```
https://vilasa-manut.vercel.app/qr.html?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f
```

O host é o de produção (`URL_BASE_QR_PRODUCAO` em `frota.js`). Uma etiqueta gerada a partir de um preview continua apontando para esse endereço.

## O que o gerador imprime

`gerarUrlQRCodeOfflineReady` inclui `id` desde que `frota.js` existe. A etiqueta também leva `tag`, `nome` e `un` só para o papel mostrar a máquina antes da resposta do servidor:

```
https://vilasa-manut.vercel.app/qr.html?id=<uuid>&tag=<tag>&nome=<nome>&un=<H|KM>
```

`tag`, `nome` e `un` não escolhem a máquina. `qr.html` chama `qr_equipamento` só com `p_id`.

## Etiqueta sem id

Sem `id` na URL, o portal mostra **Etiqueta antiga: peça a reimpressão** e esconde o formulário. Não há campo para digitar a tag, o nome ou qualquer outro código da máquina. A RPC também ignora `p_tag`: se o `id` não vier, a resposta é vazia.

## Desde quando a etiqueta leva id

O gerador de `frota.js` nunca publicou uma URL só com tag. O `id` está na função desde o primeiro commit do arquivo:

- commit `811c677e8c8f22bfdbef7cc0471521e9f5d40b96`
- data `2026-10-25 15:54:18 UTC` (`12:54` em America/Sao_Paulo)
- mensagem `Create frota.js`

Antes desse commit o gerador não era o `frota.js`. Em `app.js` (`39d962d`, 2026-10-23) e em `index.html` (`ac51614`, 2026-10-21) a etiqueta usava `qr.html?token=<qr_token>`. O `qr.html` daquela época (`093df6f`, 2026-10-21, e `90c9412`, 2026-10-22) também abria `?tag=`, e a tela deixava digitar um código. Nenhum commit deste repositório grava um gerador que imprima `qr.html?tag=` sem `id`.

Para cruzar com o cadastro em produção: máquina cuja etiqueta foi impressa por este `frota.js` em ou depois de 25/10/2026 12:54 (horário de Brasília) já saiu com `id`. Etiqueta anterior a isso, se ainda estiver na máquina, é a antiga (token ou tag) e pede reimpressão.

## Como imprimir só um subconjunto

1. Entrar no Vilasa e abrir **Frota & QR Codes**.
2. Deixar na tela só as máquinas que interessam. A lista respeita a obra ativa do cabeçalho e a situação (`Ativos`, `Pátio`, `Desmobilizados`, `Vendidos` ou `Todos`).
3. Apertar mais com a busca rápida de prefixo ou com o filtro de coluna (clique no título). As colunas filtráveis são tag, nome, marca, modelo, ano, série, placa, propriedade, obra e horímetro.
4. Marcar a caixa da primeira coluna nas linhas que devem sair na folha. O botão **Imprimir QR Codes Selecionados** usa só essas linhas. Uma máquina só também sai pelo botão **QR** da própria linha.
5. O navegador pede permissão de pop-up. A folha usa a imagem de `api.qrserver.com`.

Não há coluna de data de cadastro. `equipamentos` não tem `criado_em` nem outra data de inclusão, então a tela não filtra por "cadastrada a partir de tal dia". O **Ano** é o ano de fabricação digitado no cadastro, não a data em que a máquina entrou no sistema. Para reimprimir o que foi cadastrado antes do `id` na URL, o cruzamento é fora da tela: a data de cadastro na produção, comparada com 25/10/2026 12:54 (horário de Brasília).

Quem imprime precisa do cargo que já gerencia a frota para cadastrar e transferir. Imprimir os QR marcados está na barra da própria tela.
