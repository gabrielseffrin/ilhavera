/**
 * Leitor de linhas com fila.
 *
 * O `readline/promises` nativo perde entrada quando a stdin não é um terminal:
 * ao ler de um pipe, ele emite `line` para todas as linhas disponíveis de uma
 * vez, e as que chegam sem pergunta pendente são simplesmente descartadas. Na
 * prática isso significa que a CLI funciona ao ser digitada e falha ao ser
 * scriptada — inclusive nos testes.
 *
 * Aqui as linhas vão para uma fila, e a pergunta consome dela. Comportamento
 * idêntico no terminal, correto no pipe.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/** Sinaliza que a entrada acabou (Ctrl-D ou fim do pipe). */
export class EndOfInputError extends Error {
  constructor() {
    super('fim da entrada');
    this.name = 'EndOfInputError';
  }
}

export class LineReader {
  private readonly rl: ReadlineInterface;
  private readonly output: Writable;
  private readonly queue: string[] = [];
  private readonly waiters: { resolve: (line: string) => void; reject: (e: Error) => void }[] = [];
  private closed = false;

  constructor(input: Readable, output: Writable) {
    this.output = output;
    this.rl = createInterface({ input, crlfDelay: Infinity });

    this.rl.on('line', (line) => {
      const waiter = this.waiters.shift();
      if (waiter === undefined) this.queue.push(line);
      else waiter.resolve(line);
    });

    this.rl.on('close', () => {
      this.closed = true;
      while (this.waiters.length > 0) {
        this.waiters.shift()?.reject(new EndOfInputError());
      }
    });
  }

  async question(prompt: string): Promise<string> {
    this.output.write(prompt);

    const buffered = this.queue.shift();
    if (buffered !== undefined) {
      // Ecoa a resposta para o transcript ficar legível quando vem de script.
      this.output.write(`${buffered}\n`);
      return buffered;
    }
    if (this.closed) throw new EndOfInputError();

    return new Promise<string>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  close(): void {
    this.rl.close();
  }
}
