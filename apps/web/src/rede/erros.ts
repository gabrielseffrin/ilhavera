/**
 * O texto de uma recusa.
 *
 * O grosso já vem pronto: `errorLabel` do contrato junta os rótulos do motor com
 * os de sala. Aqui entram só os códigos que **nunca atravessam o fio** — eles
 * nascem no navegador e não teriam por que estar num contrato de rede.
 */

import { errorLabel } from '@ilhavera/protocol';

/** Códigos que só existem deste lado. */
export const ERROS_LOCAIS: Readonly<Record<string, string>> = {
  /**
   * O ack não voltou no prazo. Não diz "não funcionou" porque não se sabe: o
   * comando pode ter sido aplicado e a resposta ter se perdido na volta. O
   * próximo `state:patch` conta a verdade.
   */
  SEM_RESPOSTA: 'O servidor não respondeu. Verificando…',
  SEM_CONEXAO: 'Sem conexão com o servidor.',
};

export function rotuloDeErro(code: string): string {
  return ERROS_LOCAIS[code] ?? errorLabel(code);
}
