/**
 * A casca da aplicação: qual tela está no ar.
 *
 * Três estados, um fluxo linear, e nenhuma navegação com semântica própria — um
 * roteador custaria uma dependência e uma reescrita da casca para entregar zero.
 * A chave é o próprio estado: existe mesa? existe sala? senão, a porta.
 *
 * No hot-seat a mesa existe desde o primeiro render, e a casca cai direto no
 * jogo. É o que mantém `pnpm dev` sozinho abrindo uma partida jogável, sem
 * servidor ao lado, e é o que a suíte da Fase 3 continua montando.
 */

import { usePartida, useSala } from './estado/contexto.js';
import { Entrada } from './telas/Entrada.js';
import { Partida } from './telas/Partida.js';
import { Reconectando } from './telas/Reconectando.js';
import { Sala } from './telas/Sala.js';

export function App(): React.JSX.Element {
  const mesa = usePartida((s) => s.mesa);
  const sala = useSala((s) => s.sala);

  return (
    <>
      {mesa !== null ? <Partida mesa={mesa} /> : sala !== null ? <Sala /> : <Entrada />}
      <Reconectando />
    </>
  );
}
