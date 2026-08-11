-- Modelo de dados — §7 do roadmap.
--
-- Escrito aqui na Fase 1 para virar migração Drizzle na Fase 2. Nada disto é
-- aplicado ainda: o motor de regras é puro e não conhece banco de dados.
--
-- Estratégia de persistência (§7): a partida vive EM MEMÓRIA no processo do
-- servidor, que é a fonte de verdade em runtime. O snapshot é gravado ao fim de
-- cada turno e cada ação vai para `game_actions`. Se o servidor cair, a sala é
-- reconstruída pelo último snapshot + replay das ações posteriores — o que só
-- funciona porque o motor é determinístico e a semente do PRNG está no estado.

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

-- Snapshot periódico (a cada N ações e ao fim de cada turno).
-- Contém o estado COMPLETO, com informação oculta: nunca vai para o cliente
-- sem passar por `toClientView`.
CREATE TABLE game_snapshots (
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  state         JSONB NOT NULL,
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
