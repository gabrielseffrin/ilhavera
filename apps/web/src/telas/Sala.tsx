/**
 * A sala antes da partida: quem está, de que cor, e quem começa.
 *
 * Tudo o que se vê aqui é `RoomView`, que chega no ack e se mantém vivo pelo
 * `room:updated`. O ponto de conexão ao lado de cada nome vem de `connected`, que
 * o servidor reescreve a cada `connect`/`disconnect` — é a mesma informação que
 * o painel de adversários mostra durante a partida.
 */

import { PLAYER_COLORS, type PlayerColor } from '@ilhavera/rules';

import { COR_DO_JOGADOR, CONTORNO_DO_JOGADOR } from '../board/cores.js';
import { useCliente, useSala } from '../estado/contexto.js';
import { rotuloDeErro } from '../rede/erros.js';

export function Sala(): React.JSX.Element {
  const sala = useSala((s) => s.sala);
  const escolherCor = useSala((s) => s.escolherCor);
  const iniciar = useSala((s) => s.iniciar);
  const sair = useSala((s) => s.sair);
  const erro = useSala((s) => s.erro);
  const ocupado = useSala((s) => s.ocupado);
  const conexao = useCliente().conexao;

  if (sala === null) throw new Error('a tela de sala foi montada sem sala');

  const eu = conexao?.playerId() ?? null;
  const souHost = eu !== null && eu === sala.hostId;
  const minhaCor = sala.players.find((p) => p.id === eu)?.color;
  const tomadas = new Set(sala.players.map((p) => p.color));

  return (
    <main className="flex h-full items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur">
        <header className="flex flex-col gap-1">
          <span className="text-sm text-white/70">Código da sala</span>
          <strong
            className="font-mono text-3xl tracking-[0.3em] text-white"
            data-testid="codigo-da-sala"
          >
            {sala.code}
          </strong>
        </header>

        <ul className="flex flex-col gap-1" data-testid="assentos">
          {sala.players.map((jogador) => (
            <li
              key={jogador.id}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-white"
              data-jogador={jogador.id}
              data-conectado={jogador.connected}
            >
              <span
                aria-hidden
                className="size-4 rounded-full border-2"
                style={{
                  background: COR_DO_JOGADOR[jogador.color],
                  borderColor: CONTORNO_DO_JOGADOR[jogador.color],
                }}
              />
              <span className={jogador.connected ? '' : 'opacity-50'}>{jogador.nickname}</span>
              {jogador.id === sala.hostId && (
                <span className="text-xs text-white/60" title="host">
                  anfitrião
                </span>
              )}
              {!jogador.connected && (
                <span className="ml-auto text-xs text-white/60">desconectado</span>
              )}
            </li>
          ))}
        </ul>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-white/90">Sua cor</legend>
          <div className="flex gap-2">
            {PLAYER_COLORS.map((cor: PlayerColor) => {
              const indisponivel = tomadas.has(cor) && cor !== minhaCor;
              return (
                <button
                  key={cor}
                  type="button"
                  aria-label={cor}
                  aria-pressed={cor === minhaCor}
                  disabled={indisponivel || ocupado}
                  onClick={() => {
                    void escolherCor(cor);
                  }}
                  data-cor={cor}
                  className={`size-8 rounded-full border-2 transition disabled:opacity-25 ${
                    cor === minhaCor ? 'ring-2 ring-white' : ''
                  }`}
                  style={{
                    background: COR_DO_JOGADOR[cor],
                    borderColor: CONTORNO_DO_JOGADOR[cor],
                  }}
                />
              );
            })}
          </div>
        </fieldset>

        {souHost ? (
          <button
            type="button"
            disabled={!sala.canStart || ocupado}
            onClick={() => {
              void iniciar();
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            Iniciar partida
          </button>
        ) : (
          <p className="text-sm text-white/80">Esperando o anfitrião começar.</p>
        )}

        {souHost && !sala.canStart && (
          <p className="text-sm text-white/70">Faltam jogadores para começar.</p>
        )}

        <button
          type="button"
          onClick={() => {
            void sair();
          }}
          className="text-sm text-white/70 underline transition hover:text-white"
        >
          Sair da sala
        </button>

        {erro !== null && (
          <p role="alert" className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-50">
            {rotuloDeErro(erro)}
          </p>
        )}
      </div>
    </main>
  );
}
