# URL do QR

Decisão desta etapa: cada máquina continua com o próprio QR. A leitura identifica a máquina sozinha. Abrir OS e lançar horímetro não pedem para escolher nem para digitar a máquina. O `id` (uuid de `equipamentos`) substitui a tag como identificador.

## Formato canônico

```
https://vilasa-manut.vercel.app/qr.html?id=<uuid>
```

Exemplo:

```
https://vilasa-manut.vercel.app/qr.html?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f
```

O host é o de produção (`URL_BASE_QR_PRODUCAO` em `frota.js`). Uma etiqueta gerada a partir de um preview continua apontando para esse endereço. Quem lê o QR abre `qr.html` e o `id` basta para achar a máquina.

## O que as etiquetas impressas hoje carregam

O gerador atual, `gerarUrlQRCodeOfflineReady`, já usa `id`. Ele acrescenta três campos só para a etiqueta mostrar a máquina antes da resposta do servidor:

```
https://vilasa-manut.vercel.app/qr.html?id=<uuid>&tag=<tag>&nome=<nome>&un=<H|KM>
```

Exemplo real do `URLSearchParams` que a folha usa hoje:

```
https://vilasa-manut.vercel.app/qr.html?id=3f1a2c4e-8b7d-4e6a-9c0d-1a2b3c4d5e6f&tag=CB-05&nome=P%C3%81+CARREGADEIRA&un=H
```

`tag`, `nome` e `un` não escolhem a máquina quando o `id` está presente. `qr.html` manda `p_id` para a RPC `qr_equipamento` e deixa `p_tag` nulo. Esta etapa não muda esse gerador: uma etiqueta nova sai igual a uma etiqueta já colada na máquina.

## Etiqueta antiga, só com tag

Uma URL antiga sem `id`, no formato `qr.html?tag=<tag>`, continua abrindo. `qr.html` lê a tag e chama `qr_equipamento` com `p_tag`. Isso vale enquanto a tag for única na empresa 1.

Sem `id` e sem sinal, o celular não tem como gravar a OS nem a leitura: a tela pede para reimprimir a etiqueta. Com sinal, a RPC devolve o `id` e o lançamento segue.

Nenhuma etiqueta que já está na máquina deixa de funcionar por causa desta etapa. O `qr.html` não mudou a regra de quem abre OS nem a forma de ler `id` e `tag`.

## Como gerar a folha hoje

1. Entrar no Vilasa e abrir **Frota & QR Codes**.
2. Marcar os equipamentos na primeira coluna da tabela.
3. Imprimir os QR selecionados (`imprimirQRCodesSelecionados`). Também dá para abrir a etiqueta de uma máquina só (`abrirEtiquetaQRIndividual`).
4. O navegador pede permissão de pop-up. A folha usa a imagem de `api.qrserver.com` e chama a impressão.

Quem imprime precisa do cargo que já gerencia a frota. O desenho da etiqueta (tag, nome, ano, série, placa e o texto "LEITURA DE HORÍMETRO / OS") permanece o mesmo.

## O que muda na etapa 6

A etapa 6 troca o miolo do portal, não o endereço canônico:

- `qr.html` passa a carregar `nucleo/qr.js`. As ações vêm dos manifestos: Frota contribui "Lançar leitura" (`exige_login: false`) e Ordens contribui "Abrir OS" (`exige_login: true`, permissão `os.abrir`). O almoxarife não tem `os.abrir`.
- O `INSERT` direto em `ordens_servico` vira a RPC `os_abrir_pelo_qr`.
- A busca da máquina fica pelo `id`. A tag sozinha só continua valendo para a empresa 1 enquanto existir etiqueta antiga sem `id`.
- A fila offline passa a guardar a empresa e o módulo. A leitura anônima de horímetro continua sem login; a empresa sai do ativo no servidor.

A troca da imagem do QR (hoje `api.qrserver.com`) por uma biblioteca local fica para uma fase seguinte, para a folha imprimir sem internet. O formato `qr.html?id=<uuid>` não muda nessa troca.
