# Plano por etapas

Cada etapa é um PR pequeno com uma seção Verificação no corpo. A verificação vem de rodar a coisa de verdade, sem testes por enquanto.

Decisões que valem para o programa inteiro:

- O agente roda local, com o eve, e o `mimo` é seu único cliente, no terminal.
- O bot opera a caixa de e-mail de ponta a ponta, mas nunca exclui de forma permanente.
- Modo normal envia com aprovação. Modo autônomo não pergunta e deixa registro.
- Rotinas são criadas por conversa e vivem numa tabela própria, com um dispatcher de um minuto.
- Memória durável fica no disco, com backend local.

## Etapa 0. Fundação

Objetivo. Deixar o repositório pronto para receber as etapas, com o gate de qualidade ligado.
Entrega. Bun, `@juicerq/check` com oxlint, typecheck e knip, CI no PR, AGENTS.md, CONTEXT.md, este plano e o comando `mimo` imprimindo a versão.
Verificação. `bun run check` passa, `bun apps/mimo/src/index.ts` imprime `mimo 0.1.0` e o CI fica verde.

## Etapa 1. Agente eve mínimo

Objetivo. Subir um agente eve local que responde uma mensagem.
Entrega. `apps/agent` com `agent/instructions.md`, `agent/agent.ts` e uma tool de teste. O servidor responde em `POST /eve/v1/session`.
Verificação. Criar uma sessão por HTTP e ver a resposta no stream. Registrar o comando e a saída.

## Etapa 2. Mimo mínimo

Objetivo. Abrir o `mimo` no terminal e conversar com o agente.
Entrega. TUI em OpenTUI que conecta no agente, envia mensagem e renderiza o stream.
Verificação. Rodar `mimo`, enviar uma mensagem e ver a resposta na tela.

## Etapa 3. Memória durável

Objetivo. O bot lembrar de fatos e preferências entre reinícios.
Entrega. Slot de memória com backend local em arquivo.
Verificação. Salvar uma preferência, reiniciar o processo e confirmar que ela volta.

## Etapa 4. Gmail, leitura

Objetivo. Ler a caixa de entrada.
Entrega. OAuth com refresh token e tools de listar não lidos e ler thread.
Verificação. Rodar contra a conta real, listar não lidos e abrir uma thread.

## Etapa 5. Rascunhos e aprovação

Objetivo. Preparar respostas e gatear o envio.
Entrega. Tool de criar rascunho, Modo normal no estado da sessão e pedido de aprovação no `mimo`.
Verificação. Um e-mail pede resposta, o bot cria o rascunho e o envio espera aprovação.

## Etapa 6. Rotinas

Objetivo. Criar e disparar rotinas por conversa.
Entrega. Tabela de rotinas em SQLite, dispatcher de um minuto e tools de criar, listar, editar e apagar.
Verificação. Pedir uma rotina de 30 em 30 minutos e ver um disparo acontecer.

## Etapa 7. Envio e modo autônomo

Objetivo. Fechar o ciclo de substituir a caixa.
Entrega. Tool de enviar, Modo autônomo e registro das ações.
Verificação. No Modo autônomo, o bot responde sozinho e o registro mostra o que foi feito.
