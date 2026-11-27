# Modelo de PR

Todo PR para `homologacao` segue este formato. Português, frases curtas: o Lucca
lê no celular. Apague as seções que não se aplicam (ex.: "Banco" sem migração).

```markdown
## O que muda

Uma ou duas frases: o problema e a solução, do ponto de vista de quem usa.

- item concreto 1 (arquivo ou tela)
- item concreto 2

## Para quem muda

| Cargo | Antes | Depois |
| --- | --- | --- |
| pcm | ... | ... |

Se nenhuma tela muda para a empresa 1 (Vilasa), diga isso explicitamente.

## Banco

- Migração: `banco/migracoes/NNNN_....sql` (idempotente; reversão em `reverter/`).
- Teste: `banco/docs/testes_NNNN.sql`.
- Homologação: aplicada em <data> / ainda não aplicada (precisa de aprovação).
- **Ordem segura em produção:** SQL antes do front, ou o contrário, e por quê.

## Como testar no preview

1. passo
2. passo
3. o que deve aparecer

## Verificação

- validador de manifestos: ok
- testes: N passaram
- tipos: ok
- revisor-banco: aprovado / não se aplica
- revisor-codigo: aprovado

## Riscos

- o que pode dar errado e como desfazer.

## Precisa da sua aprovação

- [ ] merge na `homologacao`
- [ ] aplicar a migração NNNN na homologação
```
