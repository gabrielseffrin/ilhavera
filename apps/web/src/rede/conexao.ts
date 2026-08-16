/**
 * O socket, embrulhado no vocabulário do contrato.
 *
 * Uma conexão por cliente — e "cliente" aqui não é "aba", é uma identidade com
 * seus stores. O aplicativo tem um; o teste de integração tem quatro no mesmo
 * documento. Por isso nada aqui é singleton de módulo.
 *
 * Só três coisas acontecem neste arquivo: mandar comando e esperar o ack,
 * escutar evento do servidor, e traduzir o vaivém da rede em quatro estados que
 * a interface sabe desenhar. Regra de jogo nenhuma passa por aqui.
 */

import { io, type Socket } from 'socket.io-client';

import type {
  Ack,
  CommandName,
  NetworkCommand,
  ServerEventName,
  ServerEventPayload,
} from '@ilhavera/protocol';

import type { Sessao } from './sessao.js';

/**
 * Os mesmos mapas que o servidor usa, do lado de cá. Sem eles, `socket.on(nome)`
 * com `nome` genérico esbarra nos eventos reservados da biblioteca e o
 * TypeScript desiste — o mesmo tropeço que `apps/server/src/protocol/types.ts`
 * documenta.
 */
type EventosDoServidor = {
  [E in ServerEventName]: (payload: ServerEventPayload<E>) => void;
};

type EventosDoCliente = Record<
  CommandName,
  (payload: unknown, ack?: (resposta: Ack<unknown>) => void) => void
>;

type SocketDoJogo = Socket<EventosDoServidor, EventosDoCliente>;

/**
 * Onde a conexão está.
 *
 * `inacessivel` separa **"nunca conectei"** de **"caí"**, e a distinção não é
 * cosmética: são situações diferentes, com causas diferentes e saídas
 * diferentes. Quem cai no meio de uma partida espera voltar e continuar; quem
 * abre a página com o servidor fora do ar precisa saber que não há servidor —
 * dizer "Reconectando…" a essa pessoa é descrever uma reconexão que nunca vai
 * acontecer, para uma conexão que nunca existiu.
 */
export type EstadoDaConexao = 'ligando' | 'ligado' | 'reconectando' | 'caido' | 'inacessivel';

/** Quanto se espera por um ack antes de desistir. */
export const PRAZO_DO_ACK = 10_000;

export type OpcoesDaConexao = {
  url: string;
  sessao: Sessao;
  /** O teste desliga para controlar a queda; o navegador nunca. */
  reconexao?: boolean;
};

export type Conexao = {
  /** Quem eu sou para o servidor. `null` até o primeiro `session:issued`. */
  playerId: () => string | null;
  estado: () => EstadoDaConexao;
  enviar: <T = unknown>(comando: NetworkCommand | ComandoSimples) => Promise<Ack<T>>;
  ao: <E extends ServerEventName>(
    evento: E,
    ouvir: (dados: ServerEventPayload<E>) => void,
  ) => () => void;
  aoMudarEstado: (ouvir: (estado: EstadoDaConexao) => void) => () => void;
  /** Escapatória para o teste simular queda de rede. */
  socket: SocketDoJogo;
  fechar: () => void;
};

/** Comandos que não são jogada (`room:*`, `state:resync`) não passam por `toCommand`. */
export type ComandoSimples = { name: CommandName; payload?: Record<string, unknown> };

export function criarConexao({ url, sessao, reconexao = true }: OpcoesDaConexao): Conexao {
  const token = sessao.ler();

  const socket: SocketDoJogo = io(url, {
    // Sem o fallback de polling: o único ambiente sem WebSocket que nos
    // interessaria é um proxy mal configurado, e isso é problema da Fase 6.
    transports: ['websocket'],
    reconnection: reconexao,
    ...(token === null ? {} : { auth: { token } }),
  });

  let playerId: string | null = idDoToken(token);
  let estado: EstadoDaConexao = 'ligando';
  const ouvintesDeEstado = new Set<(e: EstadoDaConexao) => void>();

  function mudarPara(novo: EstadoDaConexao): void {
    if (estado === novo) return;
    estado = novo;
    for (const ouvir of ouvintesDeEstado) ouvir(novo);
  }

  /** Vira `true` no primeiro `connect` e nunca mais volta. */
  let jaConectou = false;

  socket.on('connect', () => {
    jaConectou = true;
    mudarPara('ligado');
  });

  socket.on('disconnect', (motivo: string) => {
    // `io client disconnect` é o `fechar()` daqui de baixo: pedido, não perda.
    mudarPara(motivo === 'io client disconnect' ? 'caido' : 'reconectando');
  });

  /**
   * A tentativa de conexão falhou.
   *
   * Este ouvinte faltava, e a falta tinha uma consequência concreta: quem
   * abrisse a página com o servidor fora do ar ficava preso em `'ligando'` para
   * sempre — o socket.io seguia tentando em silêncio e ninguém era avisado. O
   * único sinal que chegava era o timeout de ack, dez segundos depois de um
   * clique, dizendo que o servidor "não respondeu".
   *
   * Passou despercebido porque o aceite da Fase 4 sobe o servidor **antes** do
   * cliente, então este caminho nunca era exercitado.
   *
   * Quem já conectou continua em `'reconectando'`: `connect_error` dispara a
   * cada tentativa frustrada, inclusive durante uma reconexão legítima, e
   * rebaixar o estado a cada uma delas apagaria a diferença que este bloco
   * existe para preservar.
   */
  socket.on('connect_error', () => {
    if (!jaConectou) mudarPara('inacessivel');
  });

  socket.io.on('reconnect_failed', () => {
    mudarPara('caido');
  });

  socket.on('session:issued', (dados: ServerEventPayload<'session:issued'>) => {
    playerId = dados.playerId;
    sessao.gravar(dados.token);

    /**
     * Mutar `socket.auth` é o que faz a reconexão continuar sendo a mesma
     * pessoa. Sem isto o handshake da primeira reconexão vai sem token, o
     * servidor emite uma identidade nova, e o assento fica para trás — com o
     * agravante de que só se descobre depois de uma queda, quando já é tarde.
     */
    socket.auth = { token: dados.token };
  });

  /**
   * Um contador por conexão, com prefixo aleatório.
   *
   * O `requestId` precisa ser único **por jogador**, e a idempotência do
   * servidor depende disso: reusar um faz a segunda jogada ser ignorada e
   * responder com o ack da primeira. O prefixo cobre o caso de a mesma
   * identidade abrir duas abas.
   */
  const prefixo = Math.random().toString(36).slice(2, 10);
  let contador = 0;

  return {
    playerId: () => playerId,
    estado: () => estado,
    socket,

    async enviar<T = unknown>(comando: NetworkCommand | ComandoSimples): Promise<Ack<T>> {
      /**
       * Quando **se sabe** que não há servidor, responde na hora.
       *
       * Só nestes dois estados. Em `'reconectando'` o comando segue para a fila
       * do socket.io de propósito: ele é entregue na volta, e a idempotência por
       * `requestId` cobre a entrega dupla — é o que faz um clique dado durante
       * uma queda não se perder.
       *
       * Já quem nunca conectou, ou cujo socket foi fechado, não tem fila que vá
       * a lugar nenhum: esperar os dez segundos do ack para então dizer "o
       * servidor não respondeu" é fazer a pessoa aguardar por uma resposta que
       * ninguém foi buscar.
       */
      if (estado === 'inacessivel' || estado === 'caido') {
        return { ok: false, error: 'SEM_CONEXAO' };
      }

      const requestId = `${prefixo}-${++contador}`;
      const payload = { requestId, ...(comando.payload ?? {}) };

      return new Promise<Ack<T>>((resolve) => {
        const prazo = setTimeout(() => {
          // Não rejeita: um ack perdido não é exceção de programa, é uma recusa
          // que a interface precisa mostrar como qualquer outra. E o comando
          // pode até ter sido aplicado — por isso a mensagem não promete nada.
          resolve({ ok: false, error: 'SEM_RESPOSTA' });
        }, PRAZO_DO_ACK);

        socket.emit(comando.name, payload, (resposta: Ack<unknown>) => {
          clearTimeout(prazo);
          resolve(resposta as Ack<T>);
        });
      });
    },

    /**
     * Os dois `as` existem porque `E` vem de um parâmetro de tipo, e aí o
     * TypeScript colapsa o mapa de eventos na união e passa a exigir a
     * interseção dos ouvintes — o mesmo colapso que
     * `apps/server/src/protocol/game.ts` descreve ao registrar um handler por
     * linha. A assinatura pública acima continua exata, que é onde a garantia
     * importa: quem chama `ao('state:patch', …)` recebe um `PatchPayload`.
     */
    ao(evento, ouvir) {
      const ouvinte = ouvir as (dados: unknown) => void;
      socket.on(evento as ServerEventName, ouvinte as never);
      return () => {
        socket.off(evento as ServerEventName, ouvinte as never);
      };
    },

    aoMudarEstado(ouvir) {
      ouvintesDeEstado.add(ouvir);
      return () => ouvintesDeEstado.delete(ouvir);
    },

    fechar() {
      socket.disconnect();
      /**
       * O estado é marcado aqui, e não deixado por conta do `disconnect`.
       *
       * O evento só dispara em socket que chegou a conectar: fechar um que
       * ainda estava tentando não produz `disconnect` nenhum, e o estado ficaria
       * em `'ligando'` — dizendo que ainda há uma tentativa em curso depois de
       * alguém ter pedido para parar.
       */
      mudarPara('caido');
    },
  };
}

/**
 * O `playerId` sem esperar o `session:issued`.
 *
 * Quem chega com token já tem identidade e o servidor não reemite — e o token é
 * `id.segredo`. Sem isto, um cliente reconectado ficaria sem saber quem é até o
 * primeiro snapshot, e a interface não teria como dizer de quem é a vez.
 */
function idDoToken(token: string | null): string | null {
  if (token === null) return null;
  const separador = token.indexOf('.');
  return separador > 0 ? token.slice(0, separador) : null;
}
