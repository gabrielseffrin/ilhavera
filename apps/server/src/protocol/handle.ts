/**
 * A borda de validação de todo comando — §5.1.
 *
 * Um lugar só, por dois motivos: a asserção que o tipo condicional do
 * `socket.on` obriga fica presa a uma linha; e a garantia de que **nada entra
 * sem passar pelo zod** vira uma propriedade do arquivo, não da disciplina de
 * quem escreve o próximo handler.
 */

import type { FastifyBaseLogger } from 'fastify';

import {
  ENVELOPE,
  parseCommand,
  type Ack,
  type CommandName,
  type CommandPayload,
} from '@ilhavera/protocol';

import type { PlayerId } from '../identity/players.js';
import type { GameSocket } from './types.js';

export type CommandRunner<K extends CommandName> = (
  payload: CommandPayload<K>,
  playerId: PlayerId,
  requestId: string,
) => Ack<unknown> | Promise<Ack<unknown>>;

/**
 * Liga um comando ao socket com validação de envelope, validação de payload e
 * o `ack` da §5.1.
 *
 * `run` pode ser assíncrono porque a partir da M3 o comando passa pela fila da
 * sala, e na M5 vai esperar a persistência antes de responder.
 */
export function handle<K extends CommandName>(
  socket: GameSocket,
  name: K,
  run: CommandRunner<K>,
  log: FastifyBaseLogger,
): void {
  type Ouvinte = (raw: unknown, ack?: (resposta: Ack<unknown>) => void) => void;

  const ouvinte: Ouvinte = (raw, ack) => {
    const responder = ack ?? ((): void => {});

    /**
     * Antes de qualquer validação, de propósito: o ponto do limite é gastar o
     * mínimo possível com quem está atropelando. Um cliente enlouquecido
     * mandando lixo recebe `RATE_LIMITED` em vez de `BAD_PAYLOAD`, e está certo
     * assim — o problema dele é o ritmo, não o payload.
     */
    if (!socket.data.limiter.tentar()) {
      responder({ ok: false, error: 'RATE_LIMITED' });
      return;
    }

    const envelope = ENVELOPE.safeParse(raw);
    if (!envelope.success) {
      responder({ ok: false, error: 'BAD_PAYLOAD' });
      return;
    }

    const parsed = parseCommand(name, raw);
    if (!parsed.success) {
      responder({ ok: false, error: 'BAD_PAYLOAD' });
      return;
    }

    void (async (): Promise<void> => {
      try {
        responder(
          await run(
            parsed.data as CommandPayload<K>,
            socket.data.playerId,
            envelope.data.requestId,
          ),
        );
      } catch (erro) {
        /**
         * Exceção aqui é bug do servidor, não jogada inválida — o `reduce`
         * devolve rejeição como valor (ver `reduce.ts`). Responder mesmo assim
         * é o que impede o cliente de ficar pendurado até o timeout, que é o
         * pior diagnóstico possível.
         */
        log.error({ err: erro, comando: name, playerId: socket.data.playerId }, 'comando explodiu');
        responder({ ok: false, error: 'INTERNAL' });
      }
    })();
  };

  /**
   * O tipo do `on` do Socket.IO é condicional sobre o nome do evento, e não
   * resolve enquanto `name` for genérico. `ClientToServerEvents` é um `Record`
   * uniforme sobre `CommandName`, então todo comando tem exatamente esta
   * assinatura — a asserção é segura e fica presa a esta linha.
   */
  (socket.on as (evento: K, escuta: Ouvinte) => void)(name, ouvinte);
}
