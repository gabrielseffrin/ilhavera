# ADR-003 — Transporte: Socket.IO puro, sem spike de Colyseus

- **Data:** 2026-08-11
- **Status:** aceito
- **Contexto:** §11 questões 2 e 6 do [roadmap](./roadmap.md); supersede a linha 2 do
  [ADR-002](./adr-002-decisoes-iniciais.md), que marcava Socket.IO como provisório

## Decisão

**Socket.IO 4 puro.** O spike de 1 dia com Colyseus previsto no ADR-002 e no ADR-001
fica cancelado; a decisão provisória vira definitiva sem experimento.

Também fecha a questão 6 da §11 — tempo de vida de sala inativa (ver abaixo).

## Por quê

O spike existia para responder "o Colyseus poupa trabalho na Fase 2?". Com a Fase 1
pronta, dá para responder sem protótipo: o que o Colyseus entrega de mais valioso é
**sincronização de estado por delta e reconexão**, e as duas coisas já estão resolvidas
pelo formato do motor.

- O delta já existe. `reduce` devolve `{ state, events }`, e `state.version` incrementa
  uma vez por ação (`reduce.ts:62`). O `state:patch` da §5.2 é exatamente esse par —
  não há schema de sincronização para declarar, porque o motor já produz a lista de
  mudanças narrativas de graça.
- A reconexão já existe. `toClientView(state, viewerId)` monta a projeção completa a
  partir do estado vivo, então `state:snapshot` é uma chamada de função. Um jogador que
  volta não precisa de replay incremental.
- A filtragem de informação oculta é **por jogador e por evento**
  (`view.ts:116-122` esconde qual recurso foi roubado de quem não é ladrão nem vítima).
  O modelo de state sync do Colyseus é orientado a uma árvore de estado compartilhada
  com filtros por cliente; encaixar uma projeção que já é função pura dentro das
  abstrações dele seria trabalho a mais, não a menos.

Sobra do Colyseus o que o Socket.IO também tem: rooms, reconexão de transporte e
matchmaking — sendo que matchmaking é não-objetivo declarado do MVP (§1).

O custo de errar é baixo e simétrico: os dois são bibliotecas de transporte atrás de
uma camada de comandos e eventos que `packages/protocol` já define. Trocar depois é
reescrever a borda, não o servidor.

## Consequências

- `apps/server` usa Fastify + Socket.IO 4, com o adapter Redis só na escala horizontal
  (backlog pós-MVP, item 7).
- O **lobby vive no servidor, não no motor.** `createGame` já entra em `setup1`
  (`game.ts:93`), e a fase `'lobby'` de `state.ts:24` permanece inalcançável de
  propósito: uma sala esperando jogadores não é uma partida, e modelar isso no
  `GameState` colocaria preocupação de rede dentro do pacote puro.
- `PlayerState.connected` (`state.ts:53`, hoje sempre `true`) passa a ser escrito pelo
  servidor. É o único campo do estado que muda por motivo que não é uma ação do jogo —
  vale isolar a mutação num ponto só.
- Ordem de consumo do cursor do PRNG (tabuleiro → baralho → assentos, `game.ts:61-63`)
  é contrato de determinismo. O servidor grava a semente antes de qualquer outra coisa.

## Tempo de vida de sala inativa (§11, questão 6)

| Situação                                  | Sobrevive            | Depois                                   |
| ----------------------------------------- | -------------------- | ---------------------------------------- |
| Sala em lobby, sem partida iniciada       | 30 min sem atividade | descartada                               |
| Partida em andamento, todos desconectados | 24 h                 | `status = 'abandoned'`                   |
| Partida terminada                         | —                    | `status = 'finished'`, resultado gravado |

As 24 h existem para o caso real: quatro amigos param no meio e voltam no dia seguinte.
Como a partida é reconstruível pelo último snapshot + replay do log
(`game_snapshots` + `game_actions` em `docs/schema.sql`), manter a sala viva não custa
memória — o processo pode soltar o estado e reconstruir sob demanda.

Número revisitável com dados reais de uso na Fase 6.

## Alternativas descartadas

- **Colyseus** — ver acima. Se algum dia a sincronização por delta manual virar o
  gargalo, o ponto de troca é a borda de `packages/protocol`, não o motor.
- **WebSocket cru (`ws`)** — economiza uma dependência e custa reimplementar rooms,
  ack com timeout, reconexão e fallback. O ack é requisito da §5.1, não conveniência.
