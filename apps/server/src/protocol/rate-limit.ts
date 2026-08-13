/**
 * Limite de comandos por socket — M7.
 *
 * **Balde de fichas**, e não uma janela fixa de contagem. A diferença importa
 * aqui: numa janela fixa, um cliente pode gastar a cota inteira no último
 * instante de uma janela e de novo no primeiro da seguinte, passando o dobro do
 * limite num piscar. O balde enche em ritmo constante, então a taxa média é
 * respeitada e a rajada é limitada pela capacidade — que é exatamente o formato
 * de uso de um jogo: parado a maior parte do tempo, com surtos de comandos ao
 * construir três coisas seguidas.
 *
 * O que isto protege não é o servidor em si: é a **fila da sala**. Um cliente
 * com laço maluco — ou alguém tentando de propósito — consome os turnos de
 * processamento e trava a partida dos outros.
 *
 * Por socket, como diz o roadmap, e não por IP: o `trustProxy` do Fastify existe
 * para o dia em que o limite precisar ser por pessoa atrás de um proxy, que é
 * outro problema (abrir mil sockets) e merece outra defesa.
 */

export type RateLimitOptions = {
  /** Fichas do balde cheio: o tamanho da maior rajada tolerada. */
  capacity: number;
  /** Fichas repostas por segundo — a taxa média sustentável. */
  refillPerSecond: number;
  now?: () => number;
};

export class RateLimiter {
  #fichas: number;
  #ultimoInstante: number;
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  readonly #now: () => number;

  constructor(options: RateLimitOptions) {
    this.#capacity = options.capacity;
    this.#refillPerSecond = options.refillPerSecond;
    this.#now = options.now ?? Date.now;
    // Começa cheio: quem acabou de conectar não deve encontrar a porta fechada.
    this.#fichas = options.capacity;
    this.#ultimoInstante = this.#now();
  }

  /** Consome uma ficha. `false` quando não havia nenhuma. */
  tentar(): boolean {
    this.#repor();
    if (this.#fichas < 1) return false;

    this.#fichas -= 1;
    return true;
  }

  /** Só para diagnóstico e teste — o servidor não decide nada por este número. */
  get disponiveis(): number {
    this.#repor();
    return Math.floor(this.#fichas);
  }

  #repor(): void {
    const agora = this.#now();
    const decorrido = (agora - this.#ultimoInstante) / 1000;
    if (decorrido <= 0) return;

    this.#ultimoInstante = agora;
    this.#fichas = Math.min(this.#capacity, this.#fichas + decorrido * this.#refillPerSecond);
  }
}
