/**
 * O relógio de turno e o auto-passe (Fase 5, M5).
 *
 * O tempo é injetado e a varredura é chamada na mão: nenhum caso aqui espera
 * trinta segundos de verdade. É o mesmo padrão que `RoomRegistryOptions.now`
 * estabeleceu na Fase 2, pelo mesmo motivo — teste que depende de relógio real é
 * teste lento e intermitente.
 *
 * O que se vigia, em ordem de importância:
 *
 * 1. **sem `turnSeconds`, nada acontece.** É o padrão, e uma sala sem relógio
 *    que passasse a jogar sozinha seria o pior defeito possível desta fase;
 * 2. a mesa anda quando quem devia jogar não jogou;
 * 3. o descarte paralelo — o caso que um relógio ingênuo erra, porque quem trava
 *    a mesa não é o jogador da vez;
 * 4. a jogada automática passa pelo diário como qualquer outra, senão o replay
 *    deixaria de reproduzir a partida no primeiro turno abandonado.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createGame, type GameState } from '@ilhavera/rules';

import { GameRoom } from '../src/game/room.js';
import { jogadaAutomatica, TurnTimer } from '../src/game/timer.js';
import { MemoryStore } from '../src/persistence/memory.js';
import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

/** Relógio de mentira, que só anda quando o teste manda. */
function relogio(inicio = 1_700_000_000_000): {
  agora: () => number;
  avancar: (ms: number) => void;
} {
  let t = inicio;
  return { agora: () => t, avancar: (ms) => (t += ms) };
}

type Mesa = {
  s: TestServer;
  code: string;
  clientes: Client[];
  store: MemoryStore;
  avancar: (ms: number) => void;
};

/** Uma partida começada, com o relógio da sala no valor pedido. */
async function mesaCom(turnSeconds: number | null): Promise<Mesa> {
  const { agora, avancar } = relogio();
  const store = new MemoryStore();

  atual = await startTestServer({
    store,
    now: agora,
    varrer: false,
    registry: { makeSeed: () => 'timer' },
  });
  const s = atual;

  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', {
    nickname: 'Ana',
    settings: { turnSeconds },
  });
  if (!criada.ok) throw new Error('falhou ao criar a sala');

  const clientes = [host];
  for (const nome of ['Bruno', 'Carla']) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    clientes.push(cliente);
  }
  await host.send('room:start');

  return { s, code: criada.data.code, clientes, store, avancar };
}

function partida(mesa: Mesa): NonNullable<ReturnType<TestServer['server']['rooms']['byCode']>> {
  const room = mesa.s.server.rooms.byCode(mesa.code);
  if (room === undefined) throw new Error('sala sumiu');
  return room;
}

describe('sem relógio (o padrão)', () => {
  it('não marca prazo nenhum e a mesa espera para sempre', async () => {
    const mesa = await mesaCom(null);
    const versaoAntes = partida(mesa).game?.version;

    expect(mesa.s.server.timer.prazoDe(partida(mesa))).toBeNull();

    mesa.avancar(60 * 60 * 1000);
    await mesa.s.server.timer.tick();

    // Uma hora depois, exatamente onde estava. É isto que "desligado por
    // padrão" precisa querer dizer.
    expect(partida(mesa).game?.version).toBe(versaoAntes);
  });

  it('o snapshot informa que não há prazo', async () => {
    const mesa = await mesaCom(null);
    const snapshot = mesa.clientes[0]?.lastSnapshot as { deadline: number | null };

    expect(snapshot.deadline).toBeNull();
  });
});

describe('com relógio', () => {
  it('o snapshot leva o instante absoluto em que a paciência acaba', async () => {
    const mesa = await mesaCom(60);
    const snapshot = mesa.clientes[0]?.lastSnapshot as { deadline: number | null };

    // Instante, e não "faltam 60s": o restante deixado para o navegador
    // decrementar diverge no primeiro atraso de rede.
    expect(snapshot.deadline).toBe(1_700_000_000_000 + 60_000);
  });

  it('antes do prazo, ninguém joga por ninguém', async () => {
    const mesa = await mesaCom(60);
    const antes = partida(mesa).game?.version;

    mesa.avancar(59_000);
    await mesa.s.server.timer.tick();

    expect(partida(mesa).game?.version).toBe(antes);
  });

  it('estourado o prazo, a mesa anda', async () => {
    const mesa = await mesaCom(60);
    const antes = partida(mesa).game?.version ?? 0;

    mesa.avancar(60_000);
    await mesa.s.server.timer.tick();

    expect(partida(mesa).game?.version).toBe(antes + 1);
    // Setup: a jogada automática é a primeira colocação legal, e a partida
    // travada no setup nunca começaria sem isso.
    expect(partida(mesa).game?.state.phase).toBe('setup1');
  });

  it('o prazo reinicia a cada jogada, de quem quer que seja', async () => {
    const mesa = await mesaCom(60);
    const primeiro = mesa.s.server.timer.prazoDe(partida(mesa));

    mesa.avancar(30_000);
    await mesa.s.server.timer.tick();
    // Ninguém jogou e o prazo não venceu: continua o mesmo.
    expect(mesa.s.server.timer.prazoDe(partida(mesa))).toBe(primeiro);

    mesa.avancar(30_000);
    await mesa.s.server.timer.tick();

    // Agora venceu, a jogada automática aconteceu, e o relógio recomeçou.
    expect(mesa.s.server.timer.prazoDe(partida(mesa))).toBe(1_700_000_000_000 + 60_000 + 60_000);
  });

  it('o patch avisa o prazo novo junto do estado a que ele pertence', async () => {
    const mesa = await mesaCom(60);
    const bruno = mesa.clientes[1];
    if (bruno === undefined) throw new Error('mesa incompleta');

    const recebido = bruno.next<{ version: number; deadline: number | null }>('state:patch');
    mesa.avancar(60_000);
    await mesa.s.server.timer.tick();
    const patch = await recebido;

    expect(patch.deadline).toBe(1_700_000_000_000 + 120_000);
  });

  it('a jogada automática entra no diário como qualquer outra', async () => {
    const mesa = await mesaCom(60);

    mesa.avancar(60_000);
    await mesa.s.server.timer.tick();
    await new Promise((r) => setTimeout(r, 30));

    // Sem isto o replay deixaria de reproduzir a partida no primeiro turno
    // abandonado — e o replay é o que permite reproduzir bug de regra (§4.1).
    const acoes = await mesa.store.loadActionsAfter(partida(mesa).id, 0);
    expect(acoes.length).toBeGreaterThan(0);
    expect(acoes.at(-1)?.action.type).toBe('placeSettlement');
  });

  it('a sala encerrada para de contar', async () => {
    const mesa = await mesaCom(60);
    const room = partida(mesa);

    mesa.s.server.rooms.finish(room);
    mesa.s.server.timer.reagendar(room);

    expect(mesa.s.server.timer.prazoDe(room)).toBeNull();
  });
});

describe('jogadaAutomatica: o que se joga por quem não jogou', () => {
  const de = (type: string, extra: Record<string, unknown> = {}): never =>
    ({ type, player: 'ana', ...extra }) as never;

  it('rolar vem antes de tudo — é obrigatório, e não é escolha', () => {
    expect(jogadaAutomatica([de('endTurn'), de('rollDice')])?.type).toBe('rollDice');
  });

  it('descartar e mover o Saqueador vêm antes de encerrar: a mesa não anda sem', () => {
    expect(jogadaAutomatica([de('endTurn'), de('discard')])?.type).toBe('discard');
    expect(jogadaAutomatica([de('endTurn'), de('moveRobber')])?.type).toBe('moveRobber');
  });

  it('na fase principal, encerra o turno — e não constrói nada', () => {
    const legais = [de('buildCity'), de('buyDevCard'), de('tradeBank'), de('endTurn')];

    // Não fazer nada é a jogada menos prejudicial que existe para quem está
    // ausente. Construir ou comprar gastaria os recursos dela.
    expect(jogadaAutomatica(legais)?.type).toBe('endTurn');
  });

  it('à proposta de troca, recusa — aceitar entregaria o que ninguém ofereceu', () => {
    const recusar = de('tradeRespond', { tradeId: 't', response: { type: 'decline' } });
    const aceitar = de('tradeRespond', { tradeId: 't', response: { type: 'accept' } });

    expect(jogadaAutomatica([aceitar, recusar])).toBe(recusar);
  });

  it('sem jogada legal nenhuma, não inventa uma', () => {
    expect(jogadaAutomatica([])).toBeNull();
  });
});

/**
 * O descarte paralelo — o caso que um relógio ingênuo erra.
 *
 * Em `discarding`, quem trava a mesa **não é o jogador da vez**: são todos os
 * que devem cartas, e eles agem ao mesmo tempo (§3.3). Um timer que só olhasse
 * para `currentPlayerIndex` deixaria a partida parada esperando por gente que
 * ele nem sabe que está esperando.
 *
 * O estado é montado à mão porque chegar a `discarding` por socket exige rolar
 * um 7 com alguém segurando oito cartas — sorte que não se pede a um teste.
 */
describe('descarte paralelo', () => {
  it('joga por todos os que devem cartas, e não só pelo jogador da vez', async () => {
    const inicial = createGame({
      id: '00000000-0000-4000-8000-000000000000',
      seed: 'descarte',
      players: [
        { id: 'ana', name: 'Ana', color: 'red' },
        { id: 'bruno', name: 'Bruno', color: 'blue' },
        { id: 'carla', name: 'Carla', color: 'white' },
      ],
      shufflePlayerOrder: false,
    });

    const mao = { lumber: 4, brick: 4, wool: 0, grain: 0, ore: 0 };
    const emDescarte: GameState = {
      ...inicial,
      phase: 'discarding',
      // Bruno e Carla devem; a vez é da Ana, que **não** deve nada.
      pendingDiscards: { bruno: 4, carla: 4 },
      players: inicial.players.map((p) => (p.id === 'ana' ? p : { ...p, resources: { ...mao } })),
    };

    const jogaram: string[] = [];
    const room = {
      id: emDescarte.id,
      code: 'ABC234',
      status: 'playing' as const,
      settings: { targetVictoryPoints: 10, boardMode: 'balanced' as const, turnSeconds: 60 },
      game: GameRoom.fromState(emDescarte),
    };

    const { agora, avancar } = relogio();
    const timer = new TurnTimer({
      rooms: { byCode: () => room } as never,
      log: { info: () => undefined } as never,
      now: agora,
      jogar: async (_room, playerId, action) => {
        jogaram.push(`${playerId}:${action.type}`);
        await Promise.resolve();
      },
    });

    timer.reagendar(room as never);
    avancar(60_000);
    await timer.tick();

    expect(jogaram.sort()).toEqual(['bruno:discard', 'carla:discard']);
    // E ninguém joga pela Ana: ela não está devendo nada, e a vez sendo dela
    // não a torna a pessoa que a mesa está esperando.
    expect(jogaram.some((j) => j.startsWith('ana:'))).toBe(false);
  });
});
