/**
 * Os comandos `game:*` pela rede — do socket até o motor e de volta no ack.
 *
 * As jogadas legais saem de `enumerateLegalActions` sobre o estado do servidor,
 * e não de valores escritos à mão: assim o teste não precisa saber que tabuleiro
 * a semente gerou, e continua valendo se a geração mudar.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { enumerateLegalActions, type Action } from '@ilhavera/rules';
import type { PatchPayload, SnapshotPayload } from '@ilhavera/protocol';

import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { GameRoom } from '../src/game/room.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

type Partida = {
  s: TestServer;
  clientes: Client[];
  code: string;
  /** O estado vivo no servidor — a autoridade contra a qual o teste confere. */
  game(): GameRoom;
};

/** Lobby cheio, ainda sem `room:start` — para o teste poder escutar antes. */
async function lobby(quantos = 3): Promise<Partida> {
  atual = await startTestServer({ registry: { makeSeed: () => 'semente-de-teste' } });
  const s = atual;

  const nomes = ['Ana', 'Bruno', 'Carla', 'Davi'].slice(0, quantos);
  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', { nickname: nomes[0] ?? 'Ana' });
  if (!criada.ok) throw new Error('falhou ao criar a sala');

  const clientes: Client[] = [host];
  for (const nome of nomes.slice(1)) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    clientes.push(cliente);
  }

  return {
    s,
    clientes,
    code: criada.data.code,
    game(): GameRoom {
      const room = s.server.rooms.byCode(criada.data.code);
      if (room?.game === null || room?.game === undefined) throw new Error('partida não iniciada');
      return room.game;
    },
  };
}

/** Lobby cheio e partida iniciada, no molde do `lobby()` de `rooms.test.ts`. */
async function partida(quantos = 3): Promise<Partida> {
  const p = await lobby(quantos);
  const host = p.clientes[0];
  if (host === undefined) throw new Error('lobby sem host');

  await host.send('room:start');
  return p;
}

/** A primeira jogada legal de quem está na vez, e o cliente dono dela. */
function daVez(p: Partida): { acao: Action; cliente: Client } {
  const game = p.game();
  const jogador = game.state.players[game.state.currentPlayerIndex];
  if (jogador === undefined) throw new Error('partida sem jogador da vez');

  const acao = enumerateLegalActions(game.state, jogador.id)[0];
  if (acao === undefined) throw new Error(`sem jogada legal para ${jogador.id}`);

  const cliente = p.clientes.find((c) => c.playerId === jogador.id);
  if (cliente === undefined) throw new Error('jogador da vez não tem cliente');

  return { acao, cliente };
}

/** Traduz a ação do motor de volta para o comando de rede que a produz. */
function comandoDe(acao: Action): {
  nome: 'game:placeSettlement' | 'game:placeRoad';
  payload: Record<string, unknown>;
} {
  if (acao.type === 'placeSettlement') {
    return { nome: 'game:placeSettlement', payload: { vertexId: acao.vertexId } };
  }
  if (acao.type === 'placeRoad') {
    return { nome: 'game:placeRoad', payload: { edgeId: acao.edgeId } };
  }
  throw new Error(`o setup não deveria pedir ${acao.type}`);
}

describe('game:*: a jogada chega ao motor', () => {
  it('o jogador da vez joga e o ack traz a versão nova', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const ack = await cliente.send<{ version: number }>(nome, payload);

    expect(ack).toEqual({ ok: true, data: { version: 1 } });
    expect(p.game().version).toBe(1);
  });

  it('quem não é da vez é recusado pelo motor, sem mexer no estado', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const outro = p.clientes.find((c) => c !== cliente);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    const ack = await outro.send(nome, payload);

    expect(ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(p.game().version).toBe(0);
  });

  it('recusa comando de jogo antes do room:start', async () => {
    atual = await startTestServer();
    const cliente = await atual.connect();
    await cliente.send('room:create', { nickname: 'Ana' });

    const ack = await cliente.send('game:rollDice');

    expect(ack).toEqual({ ok: false, error: 'ROOM_NOT_STARTED' });
  });

  it('recusa comando de jogo de quem não está em sala nenhuma', async () => {
    atual = await startTestServer();
    const cliente = await atual.connect();

    const ack = await cliente.send('game:rollDice');

    expect(ack).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('game:*: a borda de validação', () => {
  it('payload sem o campo obrigatório é BAD_PAYLOAD e não chega ao motor', async () => {
    const p = await partida();
    const { cliente } = daVez(p);

    const ack = await cliente.send('game:placeSettlement', {});

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
    expect(p.game().version).toBe(0);
  });

  it('comando sem requestId é BAD_PAYLOAD', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { payload } = comandoDe(acao);

    const ack = await new Promise((resolve) => {
      cliente.socket.emit('game:placeSettlement', payload, resolve);
    });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
    expect(p.game().version).toBe(0);
  });

  it('bug do servidor vira ack INTERNAL em vez de deixar o cliente pendurado', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    // Exceção escapando do motor é bug, não jogada inválida — o `reduce`
    // devolve rejeição como valor. Aqui a exceção é forçada para exercitar a
    // rede de segurança: sem ela o cliente esperaria o timeout sem resposta.
    const game = p.game() as unknown as { submit: () => Promise<never> };
    game.submit = () => {
      throw new Error('boom');
    };

    const ack = await cliente.send(nome, payload);

    expect(ack).toEqual({ ok: false, error: 'INTERNAL' });
  });

  it('carta de progresso com parâmetro do tipo errado é BAD_PAYLOAD', async () => {
    const p = await partida();
    const { cliente } = daVez(p);

    // `monopoly` exige `resource`; sem ele o union discriminado não fecha.
    const ack = await cliente.send('game:playDevCard', { card: 'monopoly' });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
  });
});

describe('game:*: idempotência pela rede', () => {
  it('reenvio com o mesmo requestId devolve o ack original e não joga de novo', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const primeira = await cliente.send<{ version: number }>(nome, payload, 'req-fixo');
    const reenvio = await cliente.send<{ version: number }>(nome, payload, 'req-fixo');

    expect(reenvio).toEqual(primeira);
    expect(p.game().version).toBe(1);
  });
});

describe('state:snapshot', () => {
  it('chega a cada jogador no room:start, cada um se vendo como `you`', async () => {
    const p = await lobby(3);
    const host = p.clientes[0];
    if (host === undefined) throw new Error('lobby sem host');

    // Escuta antes de iniciar: o snapshot sai dentro do `room:start`.
    const esperados = p.clientes.map((c) => c.next<SnapshotPayload>('state:snapshot'));
    await host.send('room:start');
    const snapshots = await Promise.all(esperados);

    for (const [i, snapshot] of snapshots.entries()) {
      expect(snapshot.view.you?.id).toBe(p.clientes[i]?.playerId);
      expect(snapshot.view.phase).toBe('setup1');
      expect(snapshot.view.version).toBe(0);
    }
  });

  it('nunca leva a mão alheia nem o baralho', async () => {
    const p = await lobby(3);
    const host = p.clientes[0];
    if (host === undefined) throw new Error('lobby sem host');

    const esperado = host.next<SnapshotPayload>('state:snapshot');
    await host.send('room:start');
    const snapshot = await esperado;

    const cru = JSON.parse(JSON.stringify(snapshot.view)) as Record<string, unknown>;
    expect(cru['devDeck']).toBeUndefined();
    expect((cru as { devDeckSize: number }).devDeckSize).toBeGreaterThan(0);

    for (const jogador of snapshot.view.players) {
      if (jogador.id === host.playerId) continue;
      expect(jogador).not.toHaveProperty('resources');
      expect(jogador).not.toHaveProperty('devCards');
      expect(jogador.resourceCount).toBeDefined();
    }
  });

  it('quem reconecta no meio da partida recebe o estado inteiro', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);
    await cliente.send(nome, payload);

    const token = cliente.token;
    cliente.disconnect();

    // O snapshot de reconexão sai dentro do `connection`, antes de o teste ter
    // onde escutar — por isso o helper guarda o último recebido.
    const devolta = await p.s.connect(token ?? undefined);
    const snapshot = devolta.lastSnapshot as SnapshotPayload | null;

    expect(snapshot?.view.version).toBe(1);
    expect(snapshot?.view.you?.id).toBe(cliente.playerId);
  });
});

/**
 * A lista de jogadas legais é a entrega da Fase 4: o navegador não enumera nada,
 * porque enumerar precisa do estado cru. Sendo a lista que decide o que a tela
 * oferece, ela é também uma fronteira de informação — uma jogada alheia nela
 * contaria de quem é a vez de fazer o quê, e uma jogada a mais travaria o
 * jogador num clique que o motor vai recusar.
 */
describe('a lista de jogadas legais', () => {
  it('só contém jogadas do próprio jogador', async () => {
    const p = await lobby(3);
    const host = p.clientes[0];
    if (host === undefined) throw new Error('lobby sem host');

    const esperados = p.clientes.map((c) => c.next<SnapshotPayload>('state:snapshot'));
    await host.send('room:start');
    const snapshots = await Promise.all(esperados);

    for (const [i, snapshot] of snapshots.entries()) {
      for (const acao of snapshot.legal) {
        expect(acao.player).toBe(p.clientes[i]?.playerId);
      }
    }
  });

  it('chega vazia para quem não pode agir, e cheia para quem pode', async () => {
    const p = await lobby(3);
    const host = p.clientes[0];
    if (host === undefined) throw new Error('lobby sem host');

    const esperados = p.clientes.map((c) => c.next<SnapshotPayload>('state:snapshot'));
    await host.send('room:start');
    const snapshots = await Promise.all(esperados);

    const daVezNoSetup = snapshots.filter((s) => s.legal.length > 0);
    expect(daVezNoSetup).toHaveLength(1);
    // No `setup1` só se coloca assentamento, e todo vértice livre é candidato.
    expect(daVezNoSetup[0]?.legal.every((a) => a.type === 'placeSettlement')).toBe(true);
  });

  it('anda junto com a versão no patch, para todo mundo', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const esperados = p.clientes.map((c) => c.next<PatchPayload>('state:patch'));
    await cliente.send(nome, payload);
    const patches = await Promise.all(esperados);

    for (const [i, patch] of patches.entries()) {
      expect(patch.version).toBe(1);
      expect(patch.view.version).toBe(1);
      for (const legal of patch.legal) {
        expect(legal.player).toBe(p.clientes[i]?.playerId);
      }
    }

    // Depois de colocar o assentamento, a vez continua sendo do mesmo jogador:
    // no setup ele coloca a estrada em seguida.
    const meu = patches[p.clientes.indexOf(cliente)];
    expect(meu?.legal.every((a) => a.type === 'placeRoad')).toBe(true);
  });

  it('a sonda de proposta é uma só, e só para quem pode propor', async () => {
    const p = await partida(3);
    const game = p.game();

    for (const seat of game.state.players) {
      const propostas = game.legalFor(seat.id).filter((a) => a.type === 'tradeOffer');
      // No setup ninguém propõe; o que importa aqui é que nunca vem uma amostra
      // inteira de propostas, que é o que encheria o patch de lixo.
      expect(propostas.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('state:patch', () => {
  it('sai a cada jogada aplicada, com a versão nova, para todos da sala', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const esperados = p.clientes.map((c) => c.next<PatchPayload>('state:patch'));
    await cliente.send(nome, payload);
    const patches = await Promise.all(esperados);

    for (const patch of patches) {
      expect(patch.version).toBe(1);
      expect(patch.events.length).toBeGreaterThan(0);
    }
  });

  it('não sai em reenvio deduplicado', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    await cliente.send(nome, payload, 'req-fixo');

    let patches = 0;
    cliente.socket.on('state:patch', () => {
      patches += 1;
    });

    await cliente.send(nome, payload, 'req-fixo');
    await new Promise((r) => setTimeout(r, 50));

    expect(patches).toBe(0);
    expect(p.game().version).toBe(1);
  });
});

describe('state:resync', () => {
  it('devolve o estado completo a quem pediu, no ack e como evento', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);
    await cliente.send(nome, payload);

    const chegando = cliente.next<SnapshotPayload>('state:snapshot');
    const ack = await cliente.send<SnapshotPayload>('state:resync');
    const evento = await chegando;

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.view.version).toBe(1);
    expect(ack.data.view.you?.id).toBe(cliente.playerId);
    expect(evento).toEqual(ack.data);
  });

  it('vai só para quem pediu — os outros não recebem nada', async () => {
    const p = await partida(3);
    const [ana, bruno] = p.clientes;
    if (ana === undefined || bruno === undefined) throw new Error('mesa incompleta');

    // O snapshot do `room:start` ainda pode estar em voo; o contador só vale a
    // partir de um silêncio.
    await new Promise((r) => setTimeout(r, 50));

    let recebidosPorBruno = 0;
    bruno.socket.on('state:snapshot', () => {
      recebidosPorBruno += 1;
    });

    await ana.send('state:resync');
    await new Promise((r) => setTimeout(r, 50));

    expect(recebidosPorBruno).toBe(0);
  });

  it('respeita a fronteira de informação como qualquer outro snapshot', async () => {
    const p = await partida(3);
    const [ana] = p.clientes;
    if (ana === undefined) throw new Error('sem Ana');

    const ack = await ana.send<SnapshotPayload>('state:resync');
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;

    for (const jogador of ack.data.view.players) {
      if (jogador.id === ana.playerId) continue;
      expect(jogador).not.toHaveProperty('resources');
      expect(jogador).not.toHaveProperty('devCards');
    }
    expect(ack.data.view as unknown as Record<string, unknown>).not.toHaveProperty('devDeck');
  });

  it('recusa quem não está em sala ou cuja partida não começou', async () => {
    atual = await startTestServer();
    const cliente = await atual.connect();

    expect(await cliente.send('state:resync')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });

    await cliente.send('room:create', { nickname: 'Ana' });
    expect(await cliente.send('state:resync')).toEqual({
      ok: false,
      error: 'ROOM_NOT_STARTED',
    });
  });

  it('depois de perder patches, o resync recoloca o cliente na versão certa', async () => {
    const p = await partida(3);

    // Simula o cliente surdo: para de escutar `state:patch` e a partida anda.
    for (const c of p.clientes) c.socket.off('state:patch');
    for (let i = 0; i < 4; i++) {
      const { acao, cliente } = daVez(p);
      const { nome, payload } = comandoDe(acao);
      await cliente.send(nome, payload);
    }

    const [ana] = p.clientes;
    if (ana === undefined) throw new Error('sem Ana');

    const ack = await ana.send<SnapshotPayload>('state:resync');

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.view.version).toBe(4);
    expect(ack.data.view.version).toBe(p.game().version);
  });
});

/**
 * A recusa de um comando é o **ack**, e mais nada.
 *
 * `game:error` existiu no contrato da Fase 2 à Fase 4 sem nunca ser assinado
 * pelo cliente, e saiu na Fase 5. O que estes casos guardam é o que sobrou: que
 * a resposta chega, que ela é a mesma no reenvio, e que uma jogada recusada não
 * vira notícia para o resto da mesa.
 */
describe('recusa de comando', () => {
  it('responde no ack de quem enviou, sem emitir evento para ninguém', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const outro = p.clientes.find((c) => c !== cliente);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    // Deixa o tráfego de abertura da sala assentar: os `room:updated` e
    // `state:snapshot` de quem acabou de entrar chegam depois do `await` que
    // montou a mesa, e contá-los aqui seria acusar a recusa de algo que ela não
    // fez.
    await new Promise((r) => setTimeout(r, 50));

    // Qualquer evento, para qualquer um: a recusa não pode virar tráfego de
    // sala. `onAny` pega inclusive um evento novo que alguém acrescente sem
    // pensar nisto.
    const eventos: string[] = [];
    for (const c of p.clientes) {
      c.socket.onAny((nomeDoEvento: string) => eventos.push(nomeDoEvento));
    }

    const ack = await outro.send(nome, payload, 'req-do-erro');
    await new Promise((r) => setTimeout(r, 50));

    expect(ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(eventos).toEqual([]);
  });

  it('o reenvio devolve a mesma recusa, verbatim', async () => {
    const p = await partida(3);
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const outro = p.clientes.find((c) => c !== cliente);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    // É o ponto inteiro da idempotência: quem perdeu o ack e reenviou recebe a
    // mesma coisa, e não uma recusa diferente porque o turno andou nesse meio.
    const primeiro = await outro.send(nome, payload, 'req-do-erro');
    const segundo = await outro.send(nome, payload, 'req-do-erro');

    expect(primeiro).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(segundo).toEqual(primeiro);
  });
});

describe('game:*: aceite da M3', () => {
  it('três jogadores completam o setup inteiro só por WebSocket', async () => {
    const p = await partida(3);

    // Setup: cada jogador põe dois assentamentos e duas estradas, em duas
    // rodadas — 12 jogadas.
    for (let i = 0; i < 12; i++) {
      const { acao, cliente } = daVez(p);
      const { nome, payload } = comandoDe(acao);

      const ack = await cliente.send<{ version: number }>(nome, payload);
      expect(ack.ok, `jogada ${i + 1} (${nome}) recusada`).toBe(true);
    }

    const game = p.game();
    expect(game.state.phase).toBe('awaitingRoll');
    expect(game.version).toBe(12);

    // Cada um saiu do setup com dois assentamentos, duas estradas e a produção
    // do segundo assentamento na mão.
    for (const jogador of game.state.players) {
      const assentamentos = Object.values(game.state.buildings).filter(
        (b) => b.owner === jogador.id,
      );
      const estradas = Object.values(game.state.roads).filter((r) => r.owner === jogador.id);
      const naMao = Object.values(jogador.resources).reduce((a, b) => a + b, 0);

      expect(assentamentos).toHaveLength(2);
      expect(estradas).toHaveLength(2);
      expect(naMao).toBeGreaterThan(0);
    }
  });
});
