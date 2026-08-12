# Projeto: Jogo de Tabuleiro Multiplayer Online (estilo _Settlers_)

**Documento de especificação técnica e roadmap**
Versão 1.0 — Agosto/2026
Destinatário: equipe de desenvolvimento

---

## 1. Visão geral

Construir um jogo de tabuleiro digital, jogável pelo navegador, para partidas privadas entre 3 e 4 jogadores (extensível para 5–6), com mecânica equivalente à do clássico jogo de colonização por hexágonos: coleta de recursos por rolagem de dados, construção de estradas/assentamentos/cidades, comércio entre jogadores e com o banco, cartas de progresso e condição de vitória por pontos.

**Objetivos do produto**

| #   | Objetivo                                              | Critério de sucesso                                                                     |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| O1  | Partida completa jogável entre amigos, sem instalação | Uma partida de 4 jogadores termina sem travar nem exigir reload                         |
| O2  | Regras corretas e não burláveis                       | Servidor rejeita 100% das jogadas inválidas; nenhum cliente vê informação oculta alheia |
| O3  | Resiliência a quedas de conexão                       | Jogador reconecta em < 5s e recupera o estado completo                                  |
| O4  | Custo de operação baixo                               | Roda em 1 VPS pequena (2 vCPU / 4 GB) suportando ~20 partidas simultâneas               |

**Não-objetivos (fora do escopo do MVP)**

- Matchmaking público / lobby aberto
- Ranking, contas sociais, perfis públicos
- Bots / IA
- Expansões (cidades & cavaleiros, navegadores, hexágonos extras)
- Aplicativo mobile nativo (apenas web responsiva)
- Monetização

---

## 2. Nota sobre propriedade intelectual

As **mecânicas** de jogo de tabuleiro não são protegidas por direito autoral — é legítimo implementar um jogo com regras equivalentes. O que **é** protegido: o nome comercial, a identidade visual, os textos das cartas e a arte original.

Regras a seguir no projeto:

1. **Nome próprio** para o jogo. Não usar a marca registrada em nenhum lugar (título, domínio, README, metatags, código).
2. **Arte e ícones próprios** (ou de bibliotecas livres com licença compatível). Não reaproveitar assets do jogo original.
3. **Terminologia própria** para os elementos temáticos. Sugestão de mapeamento:

| Elemento genérico         | Nome sugerido no projeto                          |
| ------------------------- | ------------------------------------------------- |
| Cartas de desenvolvimento | Cartas de Progresso                               |
| Cavaleiro                 | Soldado                                           |
| Ladrão                    | Saqueador                                         |
| Recursos                  | Madeira, Tijolo, Lã, Trigo, Minério               |
| Terrenos                  | Floresta, Colina, Pasto, Campo, Montanha, Deserto |

4. Projeto privado, sem distribuição comercial. Se algum dia virar público/comercial, revisar com apoio jurídico.

---

## 3. Regras formalizadas (fonte da verdade para o motor)

Esta seção é a especificação funcional. O motor de regras deve implementá-la integralmente.

### 3.1 Componentes

**Tabuleiro:** 19 hexágonos em formato 3-4-5-4-3 → **54 vértices** (interseções) e **72 arestas** (caminhos).

**Distribuição de terrenos (19):**

| Terreno  | Qtd | Produz  |
| -------- | --- | ------- |
| Floresta | 4   | Madeira |
| Pasto    | 4   | Lã      |
| Campo    | 4   | Trigo   |
| Colina   | 3   | Tijolo  |
| Montanha | 3   | Minério |
| Deserto  | 1   | —       |

**Fichas numéricas (18, uma por hexágono exceto deserto):**
`2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12`

Restrição de geração: no modo "equilibrado", **6 e 8 não podem ser adjacentes** entre si (regra oficial de balanceamento). Deve haver também um modo "aleatório puro".

**Portos (9, cada um ocupando 2 vértices na borda):**

- 4 portos genéricos **3:1**
- 5 portos específicos **2:1** (um para cada recurso)

**Banco de recursos:** 19 cartas de cada tipo (95 no total).

**Baralho de Cartas de Progresso (25):**

| Carta                  | Qtd  | Efeito                                                              |
| ---------------------- | ---- | ------------------------------------------------------------------- |
| Soldado                | 14   | Move o Saqueador e rouba 1 carta; conta para o Maior Exército       |
| Ponto de Vitória       | 5    | +1 PV, permanece oculta até a vitória                               |
| Construção de Estradas | 2    | Constrói 2 estradas grátis                                          |
| Descoberta             | 2    | Pega 2 recursos quaisquer do banco                                  |
| Monopólio              | 1..2 | Todos os jogadores entregam todas as cartas de um recurso escolhido |

_(usar 2 Monopólio para totalizar 25)_

**Peças por jogador:** 15 estradas, 5 assentamentos, 4 cidades.

**Custos:**

| Construção         | Custo                                 |
| ------------------ | ------------------------------------- |
| Estrada            | 1 Madeira + 1 Tijolo                  |
| Assentamento       | 1 Madeira + 1 Tijolo + 1 Lã + 1 Trigo |
| Cidade             | 2 Trigo + 3 Minério                   |
| Carta de Progresso | 1 Lã + 1 Trigo + 1 Minério            |

### 3.2 Preparação (setup)

1. Ordem de turno definida aleatoriamente (ou por rolagem).
2. **Rodada 1** (ordem normal): cada jogador coloca 1 assentamento + 1 estrada adjacente a ele.
3. **Rodada 2** (ordem inversa): cada jogador coloca 1 assentamento + 1 estrada adjacente a ele. O **segundo assentamento** gera imediatamente 1 recurso de cada hexágono adjacente produtivo.
4. Saqueador começa no deserto.

**Regra de distância:** um assentamento só pode ser colocado em um vértice cujos vértices vizinhos diretos estejam **todos vazios**. Vale em toda a partida.

### 3.3 Estrutura do turno

```
INÍCIO DO TURNO
  ├─ (opcional) jogar 1 Carta de Progresso ANTES da rolagem
  ├─ ROLAR 2d6  ← obrigatório
  │    ├─ resultado ≠ 7 → produção de recursos
  │    └─ resultado = 7 → fase do Saqueador
  ├─ FASE PRINCIPAL (livre, em qualquer ordem e quantidade)
  │    ├─ comércio com o banco (4:1) ou porto (3:1 / 2:1)
  │    ├─ comércio com jogadores
  │    ├─ construir estrada / assentamento / cidade
  │    ├─ comprar Carta de Progresso
  │    └─ jogar 1 Carta de Progresso (máx. 1 por turno, se não jogou antes)
  └─ ENCERRAR TURNO
```

**Produção:** cada hexágono com a ficha rolada e sem Saqueador produz para cada assentamento adjacente (1 recurso) e cada cidade adjacente (2 recursos).

**Escassez do banco:** se o banco não tiver cartas suficientes de um recurso para atender todos os jogadores com direito, **ninguém** recebe aquele recurso — exceto se apenas um jogador tiver direito, caso em que ele recebe o que houver.

**Fase do Saqueador (rolagem = 7):**

1. Todo jogador com **8 ou mais cartas** de recurso descarta metade (arredondando para baixo). Descartes acontecem em paralelo; o turno só prossegue quando todos confirmarem.
2. Jogador da vez move o Saqueador para um hexágono **diferente** do atual.
3. Rouba 1 carta aleatória de **um** jogador com assentamento/cidade adjacente ao novo hexágono (se houver mais de um, ele escolhe).

**Cartas de Progresso:**

- Não podem ser jogadas no mesmo turno em que foram compradas (exceto Ponto de Vitória, que nunca é "jogada").
- Máximo 1 por turno.
- Cartas de Ponto de Vitória permanecem ocultas dos demais até o fim da partida.

### 3.4 Bônus e vitória

**Maior Exército (2 PV):** primeiro jogador a jogar **3 Soldados**. Transfere apenas quando outro jogador tiver **estritamente mais**.

**Estrada Mais Longa (2 PV):** rota contínua de **5 ou mais** segmentos de estrada do mesmo jogador. Transfere apenas com contagem estritamente maior.

- A rota é um _trilho_: não repete arestas, mas pode repetir vértices.
- Um assentamento/cidade **adversário** interrompe a rota naquele vértice.
- Se a rota do detentor for quebrada e houver empate na nova maior rota, o bônus fica **sem dono** até que alguém desempate.

**Vitória:** **10 pontos de vitória**, verificados apenas **no turno do próprio jogador**.
`PV = assentamentos(1) + cidades(2) + Maior Exército(2) + Estrada Mais Longa(2) + cartas de PV(1 cada)`

### 3.5 Comércio entre jogadores

- Apenas o jogador da vez pode iniciar propostas.
- Proposta = `{ oferece: {recurso: qtd}, pede: {recurso: qtd}, destinatários: [playerId] }`.
- Destinatários podem **aceitar**, **recusar** ou **contrapropor**.
- O jogador da vez escolhe qual aceite consumar. Apenas 1 negociação é consumada por proposta.
- Servidor valida que ambos os lados possuem os recursos no instante da consumação.

---

## 4. Arquitetura

### 4.1 Princípios

1. **Servidor autoritativo.** O cliente nunca calcula estado válido — apenas envia _intenções_ e renderiza o que recebe.
2. **Motor de regras puro.** Função `reduce(state, action) → { state, events }`, sem I/O, sem `Date.now()`, sem `Math.random()`. Determinístico.
3. **RNG semeado.** Toda aleatoriedade (dados, embaralhamento, roubo) vem de um PRNG com semente armazenada. Isso permite **replay determinístico** da partida inteira a partir do log de ações.
4. **Estado filtrado por jogador.** O servidor nunca envia informação oculta: mão dos adversários, ordem do baralho, cartas de PV alheias.
5. **Event sourcing leve.** Log append-only de ações + snapshot periódico. Permite reconexão, replay e depuração de bugs de regra.

### 4.2 Diagrama lógico

```
┌────────────────────────────────────────────────────────────┐
│  Navegador (React + Vite)                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │ Tabuleiro SVG│  │ Painel/HUD    │  │ Chat & Log      │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬────────┘  │
│         └──────────────────┴───────────────────┘           │
│                      Store (Zustand)                       │
│         @game/rules  ← usado só para PREVIEW/validação UI  │
└───────────────────────────┬────────────────────────────────┘
                            │ WebSocket (Socket.IO)
                            │ comandos ↑ / eventos+snapshot ↓
┌───────────────────────────┴────────────────────────────────┐
│  Servidor Node (Fastify + Socket.IO)                       │
│  ┌───────────┐ ┌───────────────┐ ┌──────────────────────┐  │
│  │ Salas     │ │ GameRoom      │ │ Auth por token       │  │
│  │ (registry)│ │ (estado vivo) │ │ (jogador persistente)│  │
│  └───────────┘ └───────┬───────┘ └──────────────────────┘  │
│                @game/rules (AUTORIDADE)                    │
└───────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │ PostgreSQL                    │  Redis (opcional)
        │ salas, jogadores, snapshots,  │  adapter Socket.IO,
        │ log de ações, resultados      │  rate limit, presença
        └───────────────────────────────┘
```

O pacote `@game/rules` é compartilhado: no **servidor** decide o que é válido; no **cliente**, apenas para destacar posições jogáveis e desabilitar botões antes do round-trip. **Divergência entre os dois sempre resolve a favor do servidor.**

### 4.3 Representação do tabuleiro

Coordenadas **axiais** `(q, r)` com hexágonos _pointy-top_. Vizinhos:

```ts
const DIRS = [
  [+1, 0],
  [+1, -1],
  [0, -1],
  [-1, 0],
  [-1, +1],
  [0, +1],
];
```

**Vértices:** todo vértice de uma malha hexagonal é a interseção de exatamente 3 hexágonos (alguns podem estar fora do tabuleiro, "água"). O ID canônico é a **tripla ordenada lexicograficamente** desses 3 hexágonos:

```
vertexId = "q1,r1|q2,r2|q3,r3"   (ordenado)
```

Isso elimina qualquer necessidade de normalização manual e é imune a bugs de simetria. Enumerando os 6 cantos de cada um dos 19 hexágonos e deduplicando, obtêm-se exatamente **54 vértices**.

**Arestas:** par ordenado de dois vértices adjacentes → `edgeId = "vA::vB"` (ordenado). Deduplicando os 6 lados de cada hexágono: **72 arestas**.

Na geração do tabuleiro, monta-se **uma vez** um grafo estático:

```ts
type BoardGraph = {
  hexes: Record<HexId, { terrain: Terrain; number: number | null; vertices: VertexId[] }>;
  vertices: Record<
    VertexId,
    {
      hexes: HexId[]; // apenas os que estão no tabuleiro
      adjacentVertices: VertexId[];
      edges: EdgeId[];
      port: PortType | null;
      pixel: { x: number; y: number }; // pré-calculado para o SVG
    }
  >;
  edges: Record<EdgeId, { vertices: [VertexId, VertexId] }>;
};
```

Com o grafo pronto, todas as regras viram operações de grafo simples: regra de distância = checar `adjacentVertices`; conectividade de estrada = checar `edges` do vértice; Estrada Mais Longa = DFS.

**Estrada Mais Longa (algoritmo):** para cada jogador, construir o subgrafo de suas arestas; DFS a partir de cada extremidade, marcando arestas visitadas (vértices podem repetir), interrompendo em vértices com construção adversária; retornar a maior profundidade. Máx. 15 arestas por jogador → busca exaustiva é trivial em custo.

### 4.4 Máquina de estados da partida

```
LOBBY
  → SETUP_1  (cada jogador: PLACE_SETTLEMENT → PLACE_ROAD)
  → SETUP_2  (ordem inversa; 2º assentamento produz recursos)
  → AGUARDANDO_ROLAGEM
       ├─ (≠7) → TURNO_PRINCIPAL
       └─ (=7) → DESCARTE (paralelo) → MOVER_SAQUEADOR → ROUBAR → TURNO_PRINCIPAL
  → TURNO_PRINCIPAL
       ├─ NEGOCIACAO_ABERTA (sub-estado)
       └─ END_TURN → AGUARDANDO_ROLAGEM (próximo jogador)
  → FINALIZADA
```

Cada estado define exatamente **quais ações são legais e por quem**. Toda ação recebida fora do estado/ator correto é rejeitada com código de erro.

### 4.5 Modelo de estado (esboço)

```ts
type GameState = {
  id: string;
  seed: string;
  rngCursor: number; // posição do PRNG, para replay
  phase: Phase;
  board: BoardGraph;
  robberHex: HexId;
  currentPlayerIndex: number;
  turnNumber: number;
  players: PlayerState[];
  bank: Record<Resource, number>;
  devDeck: DevCard[]; // OCULTO — nunca serializado ao cliente
  buildings: Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>;
  roads: Record<EdgeId, { owner: PlayerId }>;
  largestArmy: { owner: PlayerId | null; size: number };
  longestRoad: { owner: PlayerId | null; length: number };
  pendingDiscards: Record<PlayerId, number>;
  activeTrade: TradeOffer | null;
  freeRoadsRemaining: number; // para carta Construção de Estradas
  devCardPlayedThisTurn: boolean;
  winner: PlayerId | null;
  log: GameEvent[];
};

type PlayerState = {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  resources: Record<Resource, number>; // OCULTO para os outros (só total)
  devCards: { card: DevCard; boughtOnTurn: number; played: boolean }[]; // OCULTO
  knightsPlayed: number;
  piecesLeft: { roads: number; settlements: number; cities: number };
  ports: PortType[];
  victoryPointsPublic: number;
  connected: boolean;
};
```

**Projeção por jogador (`toClientView(state, viewerId)`):** substitui `resources` alheios por um total agregado, remove `devCards` alheios (mantendo só a contagem), remove `devDeck` (mantendo só o tamanho). **Esta função precisa de teste dedicado — é a fronteira de segurança do jogo.**

---

## 5. Protocolo de comunicação

Transporte: **WebSocket** via Socket.IO (rooms + reconexão automática + fallback).

### 5.1 Cliente → Servidor (comandos)

| Comando                | Payload                                   |
| ---------------------- | ----------------------------------------- |
| `room:create`          | `{ nickname, settings }`                  |
| `room:join`            | `{ code, nickname }`                      |
| `room:leave`           | `{}`                                      |
| `room:start`           | `{}` (apenas host)                        |
| `game:placeSettlement` | `{ vertexId }`                            |
| `game:placeRoad`       | `{ edgeId }`                              |
| `game:buildCity`       | `{ vertexId }`                            |
| `game:rollDice`        | `{}`                                      |
| `game:discard`         | `{ resources: Record<Resource, number> }` |
| `game:moveRobber`      | `{ hexId, stealFrom?: PlayerId }`         |
| `game:buyDevCard`      | `{}`                                      |
| `game:playDevCard`     | `{ card, params }`                        |
| `game:tradeBank`       | `{ give, receive }`                       |
| `game:tradeOffer`      | `{ offer, request, targets }`             |
| `game:tradeRespond`    | `{ tradeId, response }`                   |
| `game:tradeConfirm`    | `{ tradeId, withPlayerId }`               |
| `game:endTurn`         | `{}`                                      |
| `chat:send`            | `{ text }`                                |

Todos os comandos carregam um `requestId` (idempotência) e são respondidos com `ack: { ok: true } | { ok: false, error: ErrorCode }`.

### 5.2 Servidor → Cliente (eventos)

| Evento           | Descrição                                                      |
| ---------------- | -------------------------------------------------------------- |
| `state:snapshot` | Estado completo filtrado. Enviado ao entrar e ao reconectar    |
| `state:patch`    | Delta desde a última versão (`version` incremental)            |
| `game:event`     | Evento narrativo para o log/animação (`{ type, actor, data }`) |
| `game:error`     | Rejeição de comando com código e motivo                        |
| `room:updated`   | Jogadores, prontidão, configurações                            |
| `chat:message`   | Mensagem de chat                                               |

**Regra de consistência:** todo `state:patch` carrega `version`. Se o cliente detectar salto de versão, pede `state:resync` e o servidor devolve um `state:snapshot` completo.

**Como ficou na implementação (M4).** Estado nunca sai para a sala inteira: `state:snapshot` e `state:patch` são emitidos **por jogador**, endereçados a uma sala privada por `playerId`, e sempre pela projeção (`toClientView` para o estado, `projectEvents` para o delta). Emitir os eventos crus do `reduce` para a sala vazaria qual recurso foi roubado — a mesma fronteira de §4.5, pelo canal do delta.

`state:patch` carrega `{ version, events }`, então os eventos narrativos já viajam nele. `game:event` continua declarado no protocolo mas **não é emitido**: um segundo canal com a mesma informação só cria duas versões da verdade para divergirem. Se o cliente da Fase 3 não pedir por ele, sai do contrato.

`game:error` vai só ao socket que enviou o comando recusado, e não se repete em reenvio deduplicado. É redundante com o `ack` de propósito: o `ack` é a resposta autoritativa, o evento é a cópia para o log da interface, que assina um fluxo só.

`state:resync` ainda não existe — é da M6, junto do reenvio pós-reconexão. Hoje quem reconecta recebe um `state:snapshot` inteiro sem pedir.

### 5.3 Códigos de erro (exemplos)

`NOT_YOUR_TURN`, `INVALID_PHASE`, `INSUFFICIENT_RESOURCES`, `DISTANCE_RULE_VIOLATION`, `VERTEX_OCCUPIED`, `ROAD_NOT_CONNECTED`, `NO_PIECES_LEFT`, `DEV_CARD_ALREADY_PLAYED`, `DEV_CARD_BOUGHT_THIS_TURN`, `ROBBER_SAME_HEX`, `BANK_DEPLETED`, `TRADE_EXPIRED`.

---

## 6. Stack tecnológica

### 6.1 Recomendação

| Camada                | Escolha                                           | Justificativa                                                                                                                                                               |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem             | **TypeScript** (Node 22 LTS)                      | Permite **um único motor de regras compartilhado** entre servidor e cliente — o maior ganho arquitetural do projeto                                                         |
| Monorepo              | **pnpm workspaces** + Turborepo                   | Compartilhamento de pacotes sem publicação em registry                                                                                                                      |
| Servidor HTTP         | **Fastify**                                       | Leve, rápido, bom suporte a TS                                                                                                                                              |
| Tempo real            | **Socket.IO 4**                                   | Rooms, reconexão, ack e adapter Redis prontos                                                                                                                               |
| Frontend              | **React 19 + Vite**                               | Familiaridade da equipe, HMR rápido                                                                                                                                         |
| Estado (client)       | **Zustand**                                       | Simples, sem boilerplate; ideal para snapshot + patch                                                                                                                       |
| Estilo                | **Tailwind CSS**                                  | Velocidade de prototipação                                                                                                                                                  |
| Tabuleiro             | **SVG nativo em React**                           | 19 hexágonos + 54 vértices + 72 arestas = poucos nós no DOM. Hit-testing grátis, escalável, acessível, fácil de animar com CSS. Canvas/WebGL seria complexidade sem retorno |
| Banco                 | **PostgreSQL 16**                                 | Persistência de salas, snapshots (JSONB) e log de ações                                                                                                                     |
| ORM                   | **Drizzle ORM**                                   | Leve, type-safe, migrações versionadas                                                                                                                                      |
| Cache/pubsub          | **Redis** (fase 2)                                | Adapter do Socket.IO para escalar horizontalmente + rate limit                                                                                                              |
| Testes unitários      | **Vitest**                                        | Rápido, mesma config do Vite                                                                                                                                                |
| Testes de propriedade | **fast-check**                                    | Invariantes do motor (ver §8)                                                                                                                                               |
| E2E                   | **Playwright**                                    | Simula 4 navegadores numa partida real                                                                                                                                      |
| Lint/format           | **ESLint + Prettier** (ou Biome)                  | Padronização                                                                                                                                                                |
| Container             | **Docker + docker-compose**                       | Paridade dev/prod                                                                                                                                                           |
| CI/CD                 | **GitHub Actions**                                | Build, testes, imagem, deploy com rollback                                                                                                                                  |
| Hospedagem            | **VPS (Hetzner/DigitalOcean)** + Traefik ou Caddy | Custo baixo, TLS automático. Alternativa: Fly.io/Railway                                                                                                                    |
| Observabilidade       | **pino** (logs estruturados) + **Sentry**         | Diagnóstico de bugs de regra em produção                                                                                                                                    |

### 6.2 Alternativa avaliada: Laravel + Reverb

Viável e mais próxima da experiência da equipe, mas com desvantagens relevantes para **este** tipo de aplicação:

| Ponto                  | Impacto                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor de regras em PHP | Impossível reaproveitar no cliente → toda validação de UI (destacar vértices jogáveis, desabilitar botões) precisa ser **reescrita em TS**, criando duas implementações que divergem com o tempo. É o principal argumento contra |
| Estado vivo em memória | Laravel é _request/response_; manter uma partida viva exige processo separado (Octane/daemon), o que anula boa parte da conveniência do framework                                                                                |
| Reverb                 | Funciona bem, mas o modelo de broadcast é mais orientado a _notificação_ do que a _máquina de estados com ack_                                                                                                                   |
| Ecossistema de jogos   | Muito mais material, exemplos e bibliotecas em JS/TS                                                                                                                                                                             |

**Decisão recomendada: TypeScript.** Se houver preferência forte por Laravel, o caminho é usá-lo apenas como _backoffice_/auth e manter o servidor de jogo em Node.

_(Alternativa a considerar em vez de Socket.IO puro: **Colyseus**, framework de servidor autoritativo para jogos multiplayer em TS, que já entrega rooms, sincronização de estado por delta e reconexão. Reduz trabalho na Fase 2, ao custo de aderir às abstrações dele. Avaliar num spike de 1 dia.)_

### 6.3 Estrutura do monorepo

```
/
├── apps/
│   ├── server/            # Fastify + Socket.IO + salas + persistência
│   │   ├── src/rooms/
│   │   ├── src/persistence/
│   │   └── src/protocol/
│   └── web/               # React + Vite
│       ├── src/board/     # renderização SVG
│       ├── src/hud/       # painéis, mão, comércio
│       ├── src/net/       # cliente socket + store
│       └── src/screens/
├── packages/
│   ├── rules/             # ⭐ motor puro: estado, ações, reducer, validações
│   │   ├── src/board/     # geração e grafo
│   │   ├── src/actions/
│   │   ├── src/scoring/   # estrada mais longa, maior exército, PV
│   │   └── src/rng.ts     # PRNG semeado (mulberry32)
│   ├── protocol/          # tipos compartilhados de comandos/eventos + zod
│   └── config/            # tsconfig, eslint, tailwind compartilhados
├── docker/
├── .github/workflows/
└── docs/                  # este documento, ADRs, diagramas
```

**Regra de dependência:** `packages/rules` **não pode** importar nada de `apps/`, nem Node APIs, nem bibliotecas de I/O. É validado no CI com uma regra de lint de import boundaries.

---

## 7. Modelo de dados (PostgreSQL)

```sql
-- Identidade leve, sem senha no MVP
CREATE TABLE players (
  id            UUID PRIMARY KEY,
  nickname      TEXT NOT NULL,
  secret_hash   TEXT NOT NULL,          -- token guardado no localStorage
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id            UUID PRIMARY KEY,
  code          CHAR(6) UNIQUE NOT NULL,
  host_id       UUID NOT NULL REFERENCES players(id),
  status        TEXT NOT NULL,          -- lobby | playing | finished | abandoned
  settings      JSONB NOT NULL,         -- nº jogadores, PV alvo, timer, modo de tabuleiro
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE TABLE room_players (
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id     UUID REFERENCES players(id),
  seat_index    SMALLINT NOT NULL,
  color         TEXT NOT NULL,
  PRIMARY KEY (room_id, player_id)
);

-- Snapshot periódico (a cada N ações e ao fim de cada turno)
CREATE TABLE game_snapshots (
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  state         JSONB NOT NULL,         -- estado COMPLETO (inclui info oculta)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, version)
);

-- Log append-only: permite replay determinístico
CREATE TABLE game_actions (
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  player_id     UUID,
  action        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)
);

CREATE TABLE game_results (
  room_id       UUID PRIMARY KEY REFERENCES rooms(id),
  winner_id     UUID REFERENCES players(id),
  scores        JSONB NOT NULL,
  turns         INTEGER NOT NULL,
  duration_s    INTEGER NOT NULL
);
```

**Estratégia de persistência:** a partida vive **em memória** no processo do servidor (fonte de verdade em runtime). O snapshot é gravado ao fim de cada turno e a cada ação em `game_actions`. Se o servidor cair, a sala é reconstruída pelo último snapshot + replay das ações posteriores.

---

## 8. Estratégia de testes

O maior risco do projeto é **bug sutil de regra** que só aparece na partida 12, com quatro amigos esperando. A cobertura precisa se concentrar em `packages/rules`.

**Nível 1 — Unitários do motor (meta: > 90% de cobertura no `rules`)**

- Cada ação: caso feliz + todos os casos de rejeição.
- Casos de borda catalogados: banco esgotado com múltiplos beneficiários; Estrada Mais Longa quebrada por assentamento adversário; empate no desempate de bônus; Monopólio quando ninguém tem o recurso; roubo quando o alvo tem 0 cartas; 7 rolado quando ninguém tem 8+ cartas; carta comprada e tentada no mesmo turno; vitória atingida por carta de PV oculta.

**Nível 2 — Testes de propriedade (fast-check)**
Executar milhares de partidas com ações aleatórias legais e verificar invariantes que **nunca** podem quebrar:

- Conservação: `cartas no banco + cartas nas mãos = 95` (por recurso: 19).
- `devDeck.length + cartas de progresso distribuídas = 25`.
- Peças de cada jogador nunca excedem 15/5/4.
- Nenhum vértice viola a regra de distância.
- Toda estrada é adjacente a uma construção ou estrada própria.
- Nenhum recurso negativo em nenhum momento.
- Replay do log com a mesma seed reproduz estado idêntico (hash do estado).

**Nível 3 — Segurança de informação**

- Teste dedicado a `toClientView`: para qualquer estado, o objeto serializado para o jogador X **não contém** as cartas de Y. Verificação por varredura recursiva do JSON.

**Nível 4 — E2E (Playwright)**

- Roteiro: 4 contextos de navegador criam sala, jogam setup, 3 turnos com comércio, um 7 com descarte, e um jogador é desconectado e reconecta com estado correto.

**Nível 5 — Playtest com pessoas**

- A partir da Fase 6, sessões reais com os amigos. Instrumentar um botão "reportar bug" que anexa `roomId` + `version` para reproduzir pelo log.

---

## 9. Roadmap

Premissa de estimativa: **1 desenvolvedor, meio período (~12h/semana)**. Com dedicação integral, dividir por ~3.

### Fase 0 — Fundação (1 semana) ✅

- [x] Monorepo pnpm + Turborepo, TS strict, ESLint/Prettier
- [x] Regra de import boundaries protegendo `packages/rules` — `eslint.config.js`
- [x] docker-compose (Postgres + Redis) para dev
- [x] GitHub Actions: lint + typecheck + testes em cada PR — `.github/workflows/ci.yml`
- [x] ADR-001 registrando a escolha da stack (e ADR-002, fechando as decisões da §11)
- **Aceite:** ✅ `pnpm test` verde. Publicado em 11/08/2026.

### Fase 1 — Motor de regras ⭐ (3–4 semanas) ✅

> Fase mais crítica. Nenhuma linha de UI aqui.

- [x] PRNG semeado + utilitários determinísticos — `src/rng.ts` (splitmix32 _counter-based_: `(seed, cursor)` puro, então um snapshot restaura por `rngCursor` sem reexecutar a sequência)
- [x] Geração do tabuleiro e construção do `BoardGraph` (54 vértices / 72 arestas — validado por teste) — `src/board/graph.ts`, `test/board.test.ts`
- [x] Geração de números com restrição 6/8 e portos — `src/board/generate.ts` (re-shuffle determinístico; modo aleatório puro também testado)
- [x] Máquina de estados e `reduce(state, action)` — `src/reduce.ts`, `src/actions/index.ts`
- [x] Setup, rolagem, produção, construção, regra de distância — `src/actions/{setup,roll,build}.ts`
- [x] Saqueador completo (descarte, movimento, roubo) — `src/actions/robber.ts`
- [x] Cartas de Progresso (5 tipos, restrições de uso) — `src/actions/devcards.ts`
- [x] Comércio: banco, portos, jogador↔jogador — `src/actions/trade.ts` (inclui contraproposta)
- [x] Estrada Mais Longa (DFS) e Maior Exército — `src/scoring/longestRoad.ts`, `src/scoring/victory.ts`
- [x] Cálculo de PV e condição de vitória — `src/scoring/victory.ts`
- [x] `toClientView` com filtro de informação oculta — `src/view.ts` (filtra também o **log de eventos**)
- [x] Suíte de testes níveis 1, 2 e 3 — 218 testes, 98,8% de linhas / 89,1% de branches
- [x] **CLI de partida hot-seat no terminal** para jogar uma partida completa sem UI — `apps/cli/`, menu montado a partir de `enumerateLegalActions`
- **Aceite:** ✅ partida completa jogável pelo terminal (`make play`, `make demo`); 10.000 partidas aleatórias sem violar invariantes — `make heavy` em 11/08/2026, 10 testes passando em 21min (1.259s), invariantes checados **após cada ação** de cada partida, mais mesas de 3 jogadores e modo de tabuleiro aleatório puro, mais 2.000 runs de replay determinístico

### Fase 2 — Servidor e protocolo (2 semanas)

Os sub-marcos M1–M7 abaixo são a ordem em que a fase é entregue, e aparecem nas mensagens de commit.

- [x] **M1** — Fastify + Socket.IO, health check — `apps/server/src/app.ts`
- [x] **M2** — Identidade de jogador por token no localStorage — `src/identity/players.ts` (token opaco `id.segredo`, verificação com SHA-256 e `timingSafeEqual`)
- [x] **M2** — Criação/entrada em sala por código de 6 caracteres — `src/rooms/`, comandos `room:*`
- [x] **M3** — `GameRoom`: estado vivo, fila de comandos serializada por sala — `src/game/room.ts` (idempotência por `${playerId}:${requestId}`, com o ack anterior repetido verbatim)
- [x] **M3** — Validação de payload com zod na borda — `src/protocol/handle.ts`, tradução comando→ação em `packages/protocol/src/actions.ts`
- [x] **M4** — Broadcast de `state:patch` + `state:snapshot` — `src/protocol/game.ts` (emitidos **por jogador**, sempre pela projeção; nunca `io.to(code)` com estado cru)
- [ ] **M5** — Persistência: snapshots + `game_actions`
- [ ] **M6** — Reconexão com resync (`state:resync` ainda não existe; hoje a reconexão recebe `state:snapshot` inteiro)
- [ ] **M7** — Rate limit por socket
- **Aceite:** dois clientes de teste (scripts Node) jogam uma partida completa via WebSocket; matar o servidor no meio e subir de novo restaura a partida
  - Parcial em 12/08/2026: três clientes completam o **setup** inteiro por WebSocket em `apps/server/test/game.test.ts`. Falta a partida completa e a restauração, que dependem da M5.

Fora do escopo desta fase, por decisão: chat na sala (Fase 5) e a expiração de salas do ADR-003 — `Room.lastActivityAt` é escrito e ainda não é lido.

### Fase 3 — Cliente: tabuleiro e HUD (3–4 semanas)

- [ ] Layout SVG do tabuleiro com coordenadas pré-calculadas
- [ ] Renderização de hexágonos, fichas numéricas, portos, Saqueador
- [ ] Camadas interativas de vértices e arestas com destaque de jogadas válidas (usando `@game/rules` local)
- [ ] Peças (estradas, assentamentos, cidades) por cor de jogador
- [ ] Painel de mão de recursos e cartas de progresso
- [ ] Painel de adversários (contagem de cartas, PV público, bônus)
- [ ] Dados animados e log de eventos textual
- [ ] Modais: descarte, escolha de alvo do roubo, Monopólio, Descoberta
- [ ] Modo hot-seat local (contra o motor no browser) para desenvolver sem servidor
- **Aceite:** partida completa jogável em hot-seat no navegador

### Fase 4 — Integração multiplayer (2 semanas)

- [ ] Trocar o motor local pelo socket como fonte de verdade
- [ ] Tela de lobby: criar/entrar, escolher cor, host inicia
- [ ] Indicadores de conexão por jogador
- [ ] Tratamento e exibição de `game:error`
- [ ] Fluxo completo de comércio entre jogadores (proposta, resposta, confirmação)
- [ ] Reconexão transparente com tela de "reconectando..."
- [ ] E2E Playwright com 4 navegadores
- **Aceite:** 4 pessoas em máquinas diferentes concluem uma partida; um jogador fecha a aba, volta e continua

### Fase 5 — Polimento (2 semanas)

- [ ] Responsividade (tablet e celular em paisagem)
- [ ] Chat na sala
- [ ] Timer de turno configurável + auto-passe do turno em AFK
- [ ] Feedback sonoro e animações de transição
- [ ] Tela de fim de partida com placar detalhado
- [ ] Acessibilidade: navegação por teclado, contraste, rótulos ARIA no SVG, paleta segura para daltônicos
- [ ] i18n (pt-BR no MVP, estrutura pronta para en)
- **Aceite:** heurística de usabilidade com 4 jogadores sem precisar de explicação prévia da interface

### Fase 6 — Produção (1 semana)

- [ ] Dockerfiles multi-stage
- [ ] Deploy no VPS com Traefik/Caddy + TLS
- [ ] Pipeline de deploy com rollback
- [ ] Sentry + logs estruturados + métricas básicas
- [ ] Backup diário do Postgres
- [ ] Botão de "reportar bug" com `roomId`/`version`
- **Aceite:** ambiente público estável; 3 partidas reais com os amigos sem incidente crítico

**Total estimado do MVP: 14–18 semanas em meio período.**

### Backlog pós-MVP (priorizado)

1. Bot simples (heurística) para completar mesa e testar regras
2. Replay de partida navegável (já viabilizado pelo log de ações)
3. Estatísticas pessoais: taxa de vitória, produção média, sorte de dados
4. Variantes de tabuleiro e tamanho para 5–6 jogadores
5. Contas persistentes (magic link) e histórico
6. Espectadores
7. Escala horizontal com adapter Redis
8. Expansões de regras

---

## 10. Riscos e mitigações

| Risco                                             | Prob. | Impacto | Mitigação                                                                        |
| ------------------------------------------------- | ----- | ------- | -------------------------------------------------------------------------------- |
| Bugs sutis de regra descobertos tarde             | Alta  | Alto    | Fase 1 isolada, testes de propriedade, log de ações para reproduzir qualquer bug |
| Geometria de vértices/arestas mal modelada        | Média | Alto    | Adotar ID canônico por tripla de hexágonos; teste que exige exatamente 54/72     |
| Vazamento de informação oculta                    | Média | Alto    | Projeção por jogador com teste automatizado dedicado                             |
| Divergência entre validação de cliente e servidor | Média | Médio   | Pacote de regras único e compartilhado; servidor sempre vence                    |
| Escopo inflando (expansões, bots, ranking)        | Alta  | Médio   | Não-objetivos explícitos na §1; backlog separado                                 |
| Complexidade do comércio entre jogadores          | Média | Médio   | Modelar como sub-máquina de estados com expiração de propostas                   |
| Perda de estado por queda do servidor             | Baixa | Alto    | Snapshot + replay do log                                                         |
| Desmotivação por ciclo longo sem feedback         | Média | Médio   | Entregar CLI jogável na Fase 1 e hot-seat na Fase 3                              |

---

## 11. Decisões em aberto

Definir antes do início da Fase 0:

1. **Número máximo de jogadores no MVP:** 4 (tabuleiro padrão) ou já contemplar 5–6 (tabuleiro estendido)?
2. **Colyseus vs Socket.IO puro:** vale um spike de 1 dia na Fase 0.
3. **Nome e identidade visual do jogo.**
4. **Hospedagem:** VPS gerenciado manualmente (mais barato, mais trabalho) vs PaaS tipo Fly.io/Railway (mais caro, deploy trivial).
5. **Timer de turno:** obrigatório ou opcional por sala?
6. **Persistência de partidas abandonadas:** por quanto tempo uma sala inativa sobrevive antes de ser encerrada?

---

## 12. Glossário

| Termo                      | Significado                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| **Vértice**                | Interseção onde se constrói assentamento/cidade (54 no tabuleiro)   |
| **Aresta**                 | Caminho onde se constrói estrada (72 no tabuleiro)                  |
| **Coordenada axial**       | Sistema `(q, r)` para malha hexagonal                               |
| **Motor de regras**        | Pacote puro e determinístico que decide validade e efeito das ações |
| **Servidor autoritativo**  | Arquitetura em que só o servidor decide o estado real               |
| **Projeção (client view)** | Versão do estado filtrada para um jogador específico                |
| **Event sourcing**         | Persistir a sequência de ações em vez de apenas o estado final      |
| **PRNG semeado**           | Gerador pseudoaleatório reproduzível a partir de uma semente        |
| **Trilho (trail)**         | Caminho em grafo que não repete arestas, mas pode repetir vértices  |
