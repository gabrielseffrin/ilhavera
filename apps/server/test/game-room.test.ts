/**
 * O `GameRoom` sem rede: fila, idempotência e a única escrita que o servidor faz
 * dentro do estado do motor.
 *
 * Sem socket de propósito — estas são as garantias que precisam valer
 * independentemente de como o comando chegou.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { enumerateLegalActions, type Action } from '@ilhavera/rules';

import { GameRoom } from '../src/game/room.js';

const JOGADORES = [
  { id: 'ana', name: 'Ana', color: 'red' as const },
  { id: 'bruno', name: 'Bruno', color: 'blue' as const },
  { id: 'carla', name: 'Carla', color: 'white' as const },
];

function novaPartida(maxRequestLog?: number): GameRoom {
  return GameRoom.create({
    id: 'sala-1',
    seed: 'semente-de-teste',
    players: JOGADORES,
    settings: { targetVictoryPoints: 10, boardMode: 'balanced' },
    shufflePlayerOrder: false,
    ...(maxRequestLog === undefined ? {} : { maxRequestLog }),
  });
}

/** A primeira jogada legal de quem está na vez. */
function jogadaLegal(room: GameRoom): Action {
  const daVez = room.state.players[room.state.currentPlayerIndex];
  if (daVez === undefined) throw new Error('partida sem jogador da vez');

  const acao = enumerateLegalActions(room.state, daVez.id)[0];
  if (acao === undefined) throw new Error(`sem jogada legal para ${daVez.id}`);
  return acao;
}

describe('GameRoom: aplicar jogadas', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = novaPartida();
  });

  it('aplica jogada legal, anda a versão e devolve os eventos', async () => {
    const acao = jogadaLegal(room);
    const { ack, applied, events } = await room.submit({
      playerId: acao.player,
      requestId: 'r1',
      action: acao,
    });

    expect(ack).toEqual({ ok: true, data: { version: 1 } });
    expect(applied).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(room.version).toBe(1);
  });

  it('rejeita quem não é da vez sem mexer no estado', async () => {
    const acao = jogadaLegal(room);
    const outro = JOGADORES.find((j) => j.id !== acao.player);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    const { ack, applied } = await room.submit({
      playerId: outro.id,
      requestId: 'r1',
      action: { ...acao, player: outro.id },
    });

    expect(ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(applied).toBe(false);
    expect(room.version).toBe(0);
  });

  it('a rejeição do motor vem como valor, não como exceção', async () => {
    const acao = jogadaLegal(room);
    const resultado = await room.submit({
      playerId: 'fantasma',
      requestId: 'r1',
      action: { ...acao, player: 'fantasma' },
    });

    expect(resultado.ack).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' });
  });
});

describe('GameRoom: idempotência por requestId', () => {
  it('reenvio devolve o ack original e não aplica de novo', async () => {
    const room = novaPartida();
    const acao = jogadaLegal(room);
    const entrada = { playerId: acao.player, requestId: 'r1', action: acao };

    const primeira = await room.submit(entrada);
    const segunda = await room.submit(entrada);

    expect(segunda.ack).toEqual(primeira.ack);
    expect(segunda.applied).toBe(false);
    expect(segunda.events).toHaveLength(0);
    expect(room.version).toBe(1);
  });

  it('reenvio de comando que falhou repete o erro, mesmo que agora fosse legal', async () => {
    const room = novaPartida();
    const acao = jogadaLegal(room);
    const outro = JOGADORES.find((j) => j.id !== acao.player);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    // Chega fora da vez e é rejeitado.
    const recusa = await room.submit({
      playerId: outro.id,
      requestId: 'r-perdido',
      action: { ...acao, player: outro.id },
    });
    expect(recusa.ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    // A vez passa a ser dele e o mesmo requestId volta — reenvio de quem perdeu
    // o ack. Tem que continuar sendo a mesma resposta: aplicar agora seria uma
    // jogada que ninguém pediu de novo.
    await room.submit({ playerId: acao.player, requestId: 'r1', action: acao });
    const versaoAntes = room.version;

    const reenvio = await room.submit({
      playerId: outro.id,
      requestId: 'r-perdido',
      action: { ...acao, player: outro.id },
    });

    expect(reenvio.ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(reenvio.applied).toBe(false);
    expect(room.version).toBe(versaoAntes);
  });

  it('o mesmo requestId de jogadores diferentes não colide', async () => {
    const room = novaPartida();
    const acao = jogadaLegal(room);
    const outro = JOGADORES.find((j) => j.id !== acao.player);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    // O `requestId` é gerado pelo cliente: dois clientes podem escolher o mesmo.
    const doOutro = await room.submit({
      playerId: outro.id,
      requestId: 'r1',
      action: { ...acao, player: outro.id },
    });
    const daVez = await room.submit({ playerId: acao.player, requestId: 'r1', action: acao });

    expect(doOutro.ack.ok).toBe(false);
    expect(daVez.ack.ok).toBe(true);
    expect(room.version).toBe(1);
  });

  it('o log de respostas tem teto: a entrada mais antiga sai', async () => {
    const room = novaPartida(2);
    const acao = jogadaLegal(room);
    const enviar = (requestId: string): Promise<{ ack: { ok: boolean } }> =>
      room.submit({ playerId: acao.player, requestId, action: acao });

    // `r1` é aceito e guardado.
    expect((await enviar('r1')).ack).toEqual({ ok: true, data: { version: 1 } });

    // Mais duas entradas do mesmo jogador — a terceira expulsa `r1`.
    await enviar('r2');
    await enviar('r3');

    // Sem o teto, `r1` devolveria o `ok: true` guardado. Com o teto, foi
    // esquecido e volta a ser avaliado pelo motor — que agora recusa, porque a
    // partida já andou.
    const reavaliado = await enviar('r1');
    expect(reavaliado.ack.ok).toBe(false);
  });
});

describe('GameRoom: fila e conexão', () => {
  it('serializa comandos disparados juntos, na ordem de chegada', async () => {
    const room = novaPartida();
    const primeira = jogadaLegal(room);

    // Sem `await` entre eles: é o que a fila promete resolver quando a M5 puser
    // persistência assíncrona no meio do `submit`.
    const resultados = await Promise.all([
      room.submit({ playerId: primeira.player, requestId: 'r1', action: primeira }),
      room.submit({ playerId: primeira.player, requestId: 'r2', action: primeira }),
    ]);

    // A segunda foi avaliada contra o estado já alterado pela primeira, não
    // contra o estado inicial.
    expect(resultados[0].ack).toEqual({ ok: true, data: { version: 1 } });
    expect(resultados[1].applied).toBe(false);
    expect(room.version).toBe(1);
  });

  it('espelha a conexão no estado sem tocar na versão', () => {
    const room = novaPartida();
    expect(room.state.players.every((p) => p.connected)).toBe(true);

    room.setConnected('bruno', false);

    expect(room.state.players.find((p) => p.id === 'bruno')?.connected).toBe(false);
    // `version` conta ações do motor: conexão não é ação, e incrementar aqui
    // faria o replay divergir do log.
    expect(room.version).toBe(0);

    room.setConnected('bruno', true);
    expect(room.state.players.find((p) => p.id === 'bruno')?.connected).toBe(true);
    expect(room.version).toBe(0);
  });

  it('ignora setConnected de jogador que não está na partida', () => {
    const room = novaPartida();
    expect(() => room.setConnected('fantasma', false)).not.toThrow();
    expect(room.state.players).toHaveLength(3);
  });

  it('continua espelhando a conexão depois que o estado foi congelado pelo immer', async () => {
    const room = novaPartida();
    const acao = jogadaLegal(room);
    await room.submit({ playerId: acao.player, requestId: 'r1', action: acao });

    expect(Object.isFrozen(room.state)).toBe(true);
    expect(() => room.setConnected('carla', false)).not.toThrow();
    expect(room.state.players.find((p) => p.id === 'carla')?.connected).toBe(false);
  });
});

describe('GameRoom: projeção', () => {
  it('a view sai filtrada por espectador', () => {
    const room = novaPartida();

    const daAna = room.view('ana');
    expect(daAna.you?.id).toBe('ana');
    expect(daAna.players.find((p) => p.id === 'bruno')).not.toHaveProperty('resources');

    const deEspectador = room.view(null);
    expect(deEspectador.you).toBeNull();
  });
});
