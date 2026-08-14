/**
 * A identidade do jogador, do lado do navegador.
 *
 * O servidor não tem login: quem chega sem token ganha um em `session:issued`, e
 * quem volta com ele é reconhecido e reencontra o assento. Guardar esse token é,
 * portanto, a diferença entre "fechei a aba e voltei para a partida" e "fechei a
 * aba e virei outra pessoa".
 *
 * É uma porta, e não um acesso direto ao `localStorage`, por um motivo bem
 * concreto: o teste de integração monta vários clientes no mesmo documento, e
 * eles precisam de identidades diferentes. Com `localStorage` fixo, os quatro
 * jogadores seriam o mesmo jogador.
 */

export const CHAVE_DO_TOKEN = 'ilhavera:token';

export type Sessao = {
  ler: () => string | null;
  gravar: (token: string) => void;
  limpar: () => void;
};

/**
 * A sessão de verdade. Tolerante a `localStorage` indisponível — navegação
 * privada e políticas de terceiros derrubam o acesso, e morrer aqui tiraria o
 * jogo do ar por causa do que é só a comodidade de não reentrar.
 */
export function sessaoDoNavegador(storage: Storage | undefined = tentarStorage()): Sessao {
  if (storage === undefined) return sessaoEmMemoria();

  return {
    ler: () => storage.getItem(CHAVE_DO_TOKEN),
    gravar: (token) => {
      storage.setItem(CHAVE_DO_TOKEN, token);
    },
    limpar: () => {
      storage.removeItem(CHAVE_DO_TOKEN);
    },
  };
}

/** Sessão que não sobrevive ao recarregamento. O que os testes usam. */
export function sessaoEmMemoria(inicial: string | null = null): Sessao {
  let token = inicial;
  return {
    ler: () => token,
    gravar: (novo) => {
      token = novo;
    },
    limpar: () => {
      token = null;
    },
  };
}

function tentarStorage(): Storage | undefined {
  try {
    const teste = globalThis.localStorage;
    // Ler já dispara a exceção quando o acesso está bloqueado.
    teste.getItem(CHAVE_DO_TOKEN);
    return teste;
  } catch {
    return undefined;
  }
}
