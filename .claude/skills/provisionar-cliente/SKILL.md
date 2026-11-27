---
name: provisionar-cliente
description: Prepara o ambiente de um cliente novo do Vilasa-Manut (projeto Supabase próprio, migrações, empresa, módulos contratados, primeiro admin e endereço do site). Só roda quando o Lucca chamar /provisionar-cliente.
argument-hint: "[nome do cliente] [módulos contratados]"
disable-model-invocation: true
---
Provisionar o cliente: $ARGUMENTS

Cada cliente tem o próprio projeto Supabase. Isso isola dados e falhas: um
problema num cliente não derruba os outros. Este roteiro cria tudo do zero e
para antes de cada passo que gasta dinheiro ou grava dados, pedindo aprovação.

## 1. Levante as informações (pergunte o que faltar, numa mensagem só)

- Razão social e **código** da empresa (maiúsculas, sem espaço; é o que o
  usuário digita no login).
- Módulos contratados. `nucleo` e os obrigatórios entram sempre; confira as
  dependências nos manifestos (`depende`).
- Termos do cliente (ex.: "Fazenda" em vez de "Obra").
- Nome, matrícula e e-mail do primeiro administrador.
- Região do Supabase (padrão `sa-east-1`, São Paulo) e plano.

## 2. Mostre o plano e o custo e espere o "ok"

Liste: projeto que será criado, migrações que serão aplicadas, empresa e módulos,
admin, endereço do site. Criar projeto Supabase tem custo mensal: diga isso.

## 3. Execute, pedindo aprovação a cada passo marcado com (A)

1. (A) Criar o projeto Supabase com o nome `Vilasa-Manut - <Cliente>`.
2. Aplicar, em ordem, `banco/migracoes/0000_*.sql` até a última. Nunca os scripts
   históricos `banco/0*.sql`. Depois de cada uma, rodar o
   `banco/docs/testes_NNNN.sql` correspondente, se existir.
3. (A) Criar a empresa (código, nome, termos), ligar os módulos contratados em
   `empresa_modulos` e semear a matriz de cargos.
4. (A) Criar o usuário do admin no Auth do projeto e o perfil em
   `perfis_usuarios` com o cargo `admin`. Mande a senha inicial só para o Lucca,
   nunca para o repositório nem para o PR.
5. Site: acrescentar o cliente em `AMBIENTES.producao` no `config.js` (endereço
   exato, URL e chave `anon` do projeto novo; nunca a `service_role`). Rode
   `node --test test/config-endereco.test.js`.
6. Conferir: login com o código da empresa, abas visíveis conforme os módulos,
   QR de um ativo de teste, um lançamento offline.

## 4. Registre

Crie `docs/clientes/<codigo>.md` com: data, projeto Supabase (ref, sem chaves),
módulos, versão das migrações aplicadas, endereço, responsável. Abra PR para
`homologacao` com esse arquivo. Nada de senha ou chave de serviço no arquivo.
