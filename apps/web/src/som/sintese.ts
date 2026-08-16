/**
 * Os sons da mesa, sintetizados na hora.
 *
 * Nenhum arquivo de áudio no repositório: os sons saem de osciladores do
 * WebAudio. São três razões, e todas valem mais do que ter timbres bonitos.
 *
 * - **§2.** Áudio de terceiro traz licença para conferir, e áudio do jogo
 *   original está fora de questão. Um oscilador não tem dono;
 * - **bytes.** O `dist` do cliente já passa de 600 kB; meia dúzia de amostras
 *   dobraria isso para um efeito de meio segundo;
 * - **teste.** Sem carregamento assíncrono não há o que esperar nem o que
 *   simular no jsdom.
 *
 * ## Silencioso quando não dá
 *
 * Sem `AudioContext`, tudo aqui vira função vazia. É o que faz a suíte passar
 * sem um único mock e o que protege quem abre num navegador antigo — e é a razão
 * de este módulo nunca lançar: falha ao tocar um som não pode derrubar a
 * partida de ninguém.
 *
 * O contexto nasce **no primeiro toque**, e não na carga do módulo: navegador
 * nenhum deixa tocar áudio antes de um gesto, e criar o contexto antes disso o
 * deixa `suspended` para sempre.
 */

export type NomeDeSom = 'dado' | 'construir' | 'comprar' | 'troca' | 'roubo' | 'suaVez' | 'vitoria';

/** Notas de cada som: frequência em Hz, início e duração em segundos. */
type Nota = { hz: number; em: number; dur: number; tipo?: OscillatorType; ganho?: number };

const PARTITURAS: Readonly<Record<NomeDeSom, Nota[]>> = {
  /** Dois toques secos e graves: dois dados batendo na mesa. */
  dado: [
    { hz: 180, em: 0, dur: 0.06, tipo: 'triangle' },
    { hz: 150, em: 0.07, dur: 0.07, tipo: 'triangle' },
  ],
  /** Um acorde curto para cima: alguma coisa foi construída. */
  construir: [
    { hz: 440, em: 0, dur: 0.09 },
    { hz: 660, em: 0.06, dur: 0.11 },
  ],
  comprar: [{ hz: 720, em: 0, dur: 0.1, tipo: 'square', ganho: 0.05 }],
  /** Duas notas trocando de lugar — é literalmente o que uma troca é. */
  troca: [
    { hz: 520, em: 0, dur: 0.08 },
    { hz: 390, em: 0.08, dur: 0.1 },
  ],
  /** Descendente e áspero: alguém perdeu uma carta. */
  roubo: [
    { hz: 320, em: 0, dur: 0.08, tipo: 'sawtooth', ganho: 0.05 },
    { hz: 200, em: 0.07, dur: 0.12, tipo: 'sawtooth', ganho: 0.05 },
  ],
  /** Precisa chamar atenção sem assustar: duas notas claras, subindo. */
  suaVez: [
    { hz: 660, em: 0, dur: 0.1 },
    { hz: 880, em: 0.1, dur: 0.16 },
  ],
  vitoria: [
    { hz: 523, em: 0, dur: 0.12 },
    { hz: 659, em: 0.12, dur: 0.12 },
    { hz: 784, em: 0.24, dur: 0.28 },
  ],
};

export type Sintetizador = {
  tocar: (som: NomeDeSom) => void;
  /** `false` quando não há WebAudio — a interface esconde o botão de som. */
  disponivel: boolean;
  fechar: () => void;
};

type ConstrutorDeContexto = new () => AudioContext;

function construtorDeContexto(): ConstrutorDeContexto | null {
  const janela = globalThis as unknown as {
    AudioContext?: ConstrutorDeContexto;
    webkitAudioContext?: ConstrutorDeContexto;
  };
  return janela.AudioContext ?? janela.webkitAudioContext ?? null;
}

export function criarSintetizador(): Sintetizador {
  const Contexto = construtorDeContexto();
  if (Contexto === null) {
    // O caminho do jsdom, e o de navegador sem WebAudio. Sem mock, sem `if` nos
    // pontos de chamada, sem exceção.
    return { tocar: () => undefined, disponivel: false, fechar: () => undefined };
  }

  let ctx: AudioContext | null = null;

  return {
    disponivel: true,

    tocar(som) {
      try {
        ctx ??= new Contexto();
        // Navegadores suspendem o contexto criado sem gesto; o `resume` no
        // primeiro toque é o que o traz de volta.
        if (ctx.state === 'suspended') void ctx.resume();

        const agora = ctx.currentTime;
        for (const nota of PARTITURAS[som]) {
          const osc = ctx.createOscillator();
          const vol = ctx.createGain();
          const pico = nota.ganho ?? 0.07;

          osc.type = nota.tipo ?? 'sine';
          osc.frequency.value = nota.hz;

          /**
           * Envelope, e não um `gain` constante: um oscilador que começa e
           * termina no volume cheio estala nas duas pontas, e o estalo é mais
           * alto que a nota.
           */
          vol.gain.setValueAtTime(0, agora + nota.em);
          vol.gain.linearRampToValueAtTime(pico, agora + nota.em + 0.01);
          vol.gain.exponentialRampToValueAtTime(0.0001, agora + nota.em + nota.dur);

          osc.connect(vol).connect(ctx.destination);
          osc.start(agora + nota.em);
          osc.stop(agora + nota.em + nota.dur + 0.02);
        }
      } catch {
        // Som é enfeite. Nada aqui pode interromper uma partida.
      }
    },

    fechar() {
      void ctx?.close();
      ctx = null;
    },
  };
}
