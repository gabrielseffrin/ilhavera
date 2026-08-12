/**
 * A suíte de contrato da porta de persistência.
 *
 * Roda igual contra `MemoryStore` e `PostgresStore`. Existe porque duas
 * implementações da mesma interface divergem em silêncio: o teste que só cobre
 * a de memória passa a vida verde enquanto a de produção erra a chave primária.
 *
 * Quem adicionar um método em `Store` adiciona um caso aqui, e ganha a
 * verificação nas duas pontas de graça.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createGame, reduce, type Action, type GameState } from '@ilhavera/rules';

import type { Store, StoredPlayer, StoredRoom } from '../../src/persistence/store.js';

const JOGADORES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Ana', color: 'red' as const },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Bruno', color: 'blue' as const },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Carla', color: 'white' as const },
];

const SALA_ID = '44444444-4444-4444-8444-444444444444';

function jogador(id: string, nickname: string | null = null): StoredPlayer {
  return { id, nickname, secretHash: 'a'.repeat(64), createdAt: 1_700_000_000_000 };
}

function sala(overrides: Partial<StoredRoom> = {}): StoredRoom {
  return {
    id: SALA_ID,
    code: 'ABC234',
    hostId: JOGADORES[0]!.id,
    status: 'lobby',
    settings: { targetVictoryPoints: 10, boardMode: 'balanced' },
    createdAt: 1_700_000_000_000,
    finishedAt: null,
    seats: JOGADORES.map((j, i) => ({ playerId: j.id, seatIndex: i, color: j.color })),
    ...overrides,
  };
}

function partida(): GameState {
  return createGame({
    id: SALA_ID,
    seed: 'semente-de-teste',
    players: JOGADORES,
    settings: { targetVictoryPoints: 10, boardMode: 'balanced' },
    shufflePlayerOrder: false,
  });
}

/**
 * @param nome Como o `describe` aparece no relatório.
 * @param criar Devolve uma loja limpa. O Postgres limpa as tabelas aqui.
 */
export function contratoDeStore(nome: string, criar: () => Promise<Store>): void {
  describe(`Store: ${nome}`, () => {
    let store: Store;

    beforeEach(async () => {
      store = await criar();
    });

    afterEach(async () => {
      await store.close();
    });

    /** Jogadores primeiro: `rooms.host_id` referencia `players.id`. */
    async function comJogadores(): Promise<void> {
      for (const j of JOGADORES) await store.savePlayer(jogador(j.id, j.name));
    }

    describe('jogadores', () => {
      it('guarda e devolve', async () => {
        await store.savePlayer(jogador(JOGADORES[0]!.id));

        const todos = await store.loadPlayers();

        expect(todos).toHaveLength(1);
        expect(todos[0]?.id).toBe(JOGADORES[0]!.id);
        expect(todos[0]?.nickname).toBeNull();
        expect(todos[0]?.secretHash).toBe('a'.repeat(64));
      });

      it('o apelido chega depois, no room:create', async () => {
        await store.savePlayer(jogador(JOGADORES[0]!.id));

        await store.setPlayerNickname(JOGADORES[0]!.id, 'Ana');

        const todos = await store.loadPlayers();
        expect(todos[0]?.nickname).toBe('Ana');
      });

      it('regravar o mesmo id não troca o segredo', async () => {
        await store.savePlayer(jogador(JOGADORES[0]!.id));
        await store.savePlayer({ ...jogador(JOGADORES[0]!.id), secretHash: 'b'.repeat(64) });

        const todos = await store.loadPlayers();
        expect(todos).toHaveLength(1);
        expect(todos[0]?.secretHash).toBe('a'.repeat(64));
      });

      it('apelido de jogador inexistente não explode', async () => {
        await expect(store.setPlayerNickname(JOGADORES[0]!.id, 'Ninguém')).resolves.toBeUndefined();
      });
    });

    describe('salas', () => {
      it('guarda com os assentos e devolve por status', async () => {
        await comJogadores();
        await store.saveRoom(sala());

        expect(await store.loadRooms('playing')).toHaveLength(0);

        const emLobby = await store.loadRooms('lobby');
        expect(emLobby).toHaveLength(1);
        expect(emLobby[0]?.code).toBe('ABC234');
        expect(emLobby[0]?.settings).toEqual({ targetVictoryPoints: 10, boardMode: 'balanced' });
        expect(emLobby[0]?.seats).toHaveLength(3);
      });

      it('devolve os assentos na ordem em que foram sentados', async () => {
        await comJogadores();
        await store.saveRoom(sala());

        const [encontrada] = await store.loadRooms('lobby');
        expect(encontrada?.seats.map((s) => s.seatIndex)).toEqual([0, 1, 2]);
        expect(encontrada?.seats.map((s) => s.playerId)).toEqual(JOGADORES.map((j) => j.id));
      });

      it('regravar atualiza status e assentos em vez de duplicar', async () => {
        await comJogadores();
        await store.saveRoom(sala());

        await store.saveRoom(
          sala({
            status: 'playing',
            seats: [{ playerId: JOGADORES[0]!.id, seatIndex: 0, color: 'red' }],
          }),
        );

        expect(await store.loadRooms('lobby')).toHaveLength(0);
        const jogando = await store.loadRooms('playing');
        expect(jogando).toHaveLength(1);
        expect(jogando[0]?.seats).toHaveLength(1);
      });

      it('apagar leva junto snapshots e ações', async () => {
        await comJogadores();
        await store.saveRoom(sala());
        await store.saveSnapshot({ roomId: SALA_ID, version: 0, state: partida() });
        await store.appendAction({
          roomId: SALA_ID,
          seq: 1,
          playerId: JOGADORES[0]!.id,
          action: { type: 'rollDice', player: JOGADORES[0]!.id },
        });

        await store.deleteRoom(SALA_ID);

        expect(await store.loadRooms('lobby')).toHaveLength(0);
        expect(await store.loadLatestSnapshot(SALA_ID)).toBeUndefined();
        expect(await store.loadActionsAfter(SALA_ID, 0)).toHaveLength(0);
      });
    });

    describe('snapshots', () => {
      beforeEach(async () => {
        await comJogadores();
        await store.saveRoom(sala({ status: 'playing' }));
      });

      it('não há snapshot antes do primeiro', async () => {
        expect(await store.loadLatestSnapshot(SALA_ID)).toBeUndefined();
      });

      it('devolve o de maior versão, não o último gravado', async () => {
        const inicial = partida();
        await store.saveSnapshot({ roomId: SALA_ID, version: 12, state: inicial });
        await store.saveSnapshot({ roomId: SALA_ID, version: 0, state: inicial });

        const ultimo = await store.loadLatestSnapshot(SALA_ID);
        expect(ultimo?.version).toBe(12);
      });

      it('o estado volta idêntico ao gravado — é o que o replay exige', async () => {
        const estado = partida();
        await store.saveSnapshot({ roomId: SALA_ID, version: 0, state: estado });

        const ultimo = await store.loadLatestSnapshot(SALA_ID);

        expect(ultimo?.state).toEqual(JSON.parse(JSON.stringify(estado)));
        // O tabuleiro é o que mais sofre numa ida e volta por JSONB.
        expect(Object.keys(ultimo?.state.board.vertices ?? {})).toHaveLength(54);
        expect(ultimo?.state.seed).toBe('semente-de-teste');
      });

      it('regravar a mesma versão sobrescreve', async () => {
        const estado = partida();
        await store.saveSnapshot({ roomId: SALA_ID, version: 0, state: estado });
        await store.saveSnapshot({
          roomId: SALA_ID,
          version: 0,
          state: { ...estado, turnNumber: 99 },
        });

        const ultimo = await store.loadLatestSnapshot(SALA_ID);
        expect(ultimo?.state.turnNumber).toBe(99);
      });
    });

    describe('ações', () => {
      beforeEach(async () => {
        await comJogadores();
        await store.saveRoom(sala({ status: 'playing' }));
      });

      /** Uma jogada de verdade, para o replay ter o que reproduzir. */
      function primeiraJogadaLegal(): Action {
        const estado = partida();
        const daVez = estado.players[estado.currentPlayerIndex]!;
        const vertice = estado.board.vertexOrder[0]!;
        return { type: 'placeSettlement', player: daVez.id, vertexId: vertice };
      }

      it('devolve em ordem de seq, só as posteriores ao ponto pedido', async () => {
        const acao = primeiraJogadaLegal();
        for (const seq of [3, 1, 2]) {
          await store.appendAction({ roomId: SALA_ID, seq, playerId: acao.player, action: acao });
        }

        const depoisDe1 = await store.loadActionsAfter(SALA_ID, 1);

        expect(depoisDe1.map((a) => a.seq)).toEqual([2, 3]);
      });

      it('a ação volta idêntica, e o motor a aceita de volta', async () => {
        const acao = primeiraJogadaLegal();
        await store.appendAction({ roomId: SALA_ID, seq: 1, playerId: acao.player, action: acao });

        const [guardada] = await store.loadActionsAfter(SALA_ID, 0);
        expect(guardada?.action).toEqual(acao);

        // A prova real: o que voltou do banco ainda é uma ação que o motor
        // aplica. Um campo perdido na serialização apareceria aqui.
        const resultado = reduce(partida(), guardada!.action);
        expect(resultado.ok).toBe(true);
      });

      it('sala sem ação nenhuma devolve lista vazia', async () => {
        expect(await store.loadActionsAfter(SALA_ID, 0)).toEqual([]);
      });
    });
  });
}
