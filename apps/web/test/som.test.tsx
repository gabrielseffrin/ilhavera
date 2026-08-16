/**
 * Som e movimento (Fase 5, M6).
 *
 * Som não se verifica por asserção — se o timbre ficou bom, alguém precisa
 * ouvir. O que **dá** para verificar é tudo o que cerca: que sem `AudioContext`
 * nada explode, que mudo é o padrão, que o gatilho é o log e não uma chamada
 * espalhada por trinta componentes, e que uma reconexão não despeja quarenta
 * turnos de som de uma vez.
 *
 * O jsdom não tem WebAudio, então o caminho silencioso é o que a suíte inteira
 * já exercita sem saber. Aqui um `AudioContext` de mentira é instalado de
 * propósito, para percorrer o outro caminho.
 */

import { render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { criarSintetizador } from '../src/som/sintese.js';
import { CHAVE_DO_SOM, definirMudo, estaMudo } from '../src/som/som.js';
import { useSons } from '../src/som/useSons.js';
import { BotaoDeSom } from '../src/hud/BotaoDeSom.js';
import { montarHotSeat } from './helpers/hotseat.js';
import type { ClientView, GameEvent } from '@ilhavera/rules';

describe('sintetizador sem WebAudio', () => {
  it('vira função vazia em vez de explodir', () => {
    // É o caminho do jsdom e o de navegador antigo. Sem isto, cada ponto de
    // chamada precisaria de um `if` — ou a suíte, de um mock.
    expect(globalThis.AudioContext).toBeUndefined();

    const sintetizador = criarSintetizador();

    expect(sintetizador.disponivel).toBe(false);
    expect(() => {
      sintetizador.tocar('dado');
      sintetizador.fechar();
    }).not.toThrow();
  });
});

describe('sintetizador com WebAudio', () => {
  let osciladores: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];

  beforeEach(() => {
    osciladores = [];
    const rampa = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };

    class ContextoFalso {
      currentTime = 0;
      state = 'running';
      destination = {};
      resume = vi.fn();
      close = vi.fn();
      createOscillator(): unknown {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          start: vi.fn(),
          stop: vi.fn(),
          connect: (destino: unknown) => destino,
        };
        osciladores.push(osc);
        return osc;
      }
      createGain(): unknown {
        return { gain: rampa, connect: (destino: unknown) => destino };
      }
    }

    vi.stubGlobal('AudioContext', ContextoFalso);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toca, e cria um oscilador por nota', () => {
    const sintetizador = criarSintetizador();
    expect(sintetizador.disponivel).toBe(true);

    sintetizador.tocar('dado');

    // O som do dado são dois toques — dois dados batendo na mesa.
    expect(osciladores).toHaveLength(2);
    expect(osciladores[0]?.start).toHaveBeenCalled();
    expect(osciladores[0]?.stop).toHaveBeenCalled();
  });

  it('um erro ao tocar não sobe: som é enfeite', () => {
    const sintetizador = criarSintetizador();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('sem placa de som');
        }
      },
    );

    // Nada aqui pode interromper uma partida de quatro pessoas.
    expect(() => {
      sintetizador.tocar('vitoria');
    }).not.toThrow();
  });
});

describe('a preferência de som', () => {
  afterEach(() => {
    globalThis.localStorage.removeItem(CHAVE_DO_SOM);
  });

  it('nasce muda', () => {
    // Um jogo que começa fazendo barulho numa aba aberta no trabalho é um jogo
    // que a pessoa fecha.
    expect(estaMudo()).toBe(true);
  });

  it('guarda a escolha entre visitas', () => {
    definirMudo(false);
    expect(estaMudo()).toBe(false);

    definirMudo(true);
    expect(estaMudo()).toBe(true);
  });
});

describe('BotaoDeSom', () => {
  afterEach(() => {
    globalThis.localStorage.removeItem(CHAVE_DO_SOM);
    vi.unstubAllGlobals();
  });

  it('não aparece quando não há WebAudio', () => {
    render(<BotaoDeSom />);
    // Um botão que promete som e não entrega é pior que botão nenhum.
    expect(screen.queryByTestId('alternar-som')).not.toBeInTheDocument();
  });
});

describe('useSons', () => {
  /** Uma mesa mínima — só o que o hook lê. */
  function mesaCom(log: GameEvent[], winner: string | null = null): ClientView {
    return { log, winner, you: { id: 'ana' } } as unknown as ClientView;
  }

  const rolagem: GameEvent = { type: 'diceRolled', actor: 'ana', data: { dice: [3, 4], total: 7 } };

  beforeEach(() => {
    globalThis.localStorage.setItem(CHAVE_DO_SOM, 'ligado');
  });

  afterEach(() => {
    globalThis.localStorage.removeItem(CHAVE_DO_SOM);
  });

  it('não explode sem WebAudio, que é o caso do jsdom', () => {
    const { rerender } = renderHook(({ mesa }) => useSons(mesa, 'ana'), {
      initialProps: { mesa: mesaCom([]) },
    });

    expect(() => {
      rerender({ mesa: mesaCom([rolagem]) });
    }).not.toThrow();
  });

  it('a primeira leitura não toca nada', () => {
    /**
     * Quem reconecta no turno quarenta recebe o log inteiro de uma vez. Tocar
     * quarenta turnos de sons seria a pior recepção possível — o hook só marca
     * a régua na primeira passagem.
     */
    const tocados: string[] = [];
    vi.stubGlobal('AudioContext', contextoQueRegistra(tocados));

    renderHook(() => useSons(mesaCom([rolagem, rolagem, rolagem]), 'ana'));

    expect(tocados).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('menos movimento', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem `matchMedia`, o tabuleiro monta assim mesmo', () => {
    // O jsdom não implementa `matchMedia`. Sem o caminho de escape, montar
    // qualquer componente do tabuleiro num teste explodiria.
    expect(globalThis.matchMedia).toBeUndefined();

    const { container, unmount } = montarHotSeat('movimento');
    expect(container.querySelectorAll('[data-vertice-legal]').length).toBeGreaterThan(0);
    unmount();
  });

  it('com a preferência ligada, o pulso dos alvos some', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta.includes('prefers-reduced-motion'),
      media: consulta,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const { container, unmount } = montarHotSeat('movimento-reduzido');

    // `<animate>` é SMIL, e SMIL não obedece a media query nenhuma — a regra
    // global do CSS passa por cima dele.
    expect(container.querySelectorAll('animate')).toHaveLength(0);
    expect(container.querySelectorAll('[data-vertice-legal]').length).toBeGreaterThan(0);
    unmount();
  });
});

/** Um `AudioContext` de mentira que anota quantas notas foram pedidas. */
function contextoQueRegistra(destino: string[]): unknown {
  const rampa = {
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  return class {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume = (): void => undefined;
    close = (): void => undefined;
    createOscillator(): unknown {
      destino.push('nota');
      return {
        type: 'sine',
        frequency: { value: 0 },
        start: () => undefined,
        stop: () => undefined,
        connect: (d: unknown) => d,
      };
    }
    createGain(): unknown {
      return { gain: rampa, connect: (d: unknown) => d };
    }
  };
}
