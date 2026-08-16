/**
 * A sala antes da partida: quem está, de que cor, e quem começa.
 *
 * Tudo o que se vê aqui é `RoomView`, que chega no ack e se mantém vivo pelo
 * `room:updated`. O ponto de conexão ao lado de cada nome vem de `connected`, que
 * o servidor reescreve a cada `connect`/`disconnect` — é a mesma informação que
 * o painel de adversários mostra durante a partida.
 */

import { PLAYER_COLORS, type PlayerColor } from '@ilhavera/rules';

import {
  CONTORNO_DO_JOGADOR,
  COR_DO_JOGADOR,
  MARCA_DO_JOGADOR,
  NOME_DA_COR,
  NOME_DA_MARCA,
} from '../board/cores.js';
import { IconeDoJogador, Marca } from '../board/Marca.js';
import { Chat } from '../hud/Chat.js';
import { temChat, useCliente, useSala } from '../estado/contexto.js';
import { rotuloDeErro } from '../rede/erros.js';
import { t } from '../i18n/pt-BR.js';

export function Sala(): React.JSX.Element {
  const sala = useSala((s) => s.sala);
  const escolherCor = useSala((s) => s.escolherCor);
  const iniciar = useSala((s) => s.iniciar);
  const sair = useSala((s) => s.sair);
  const erro = useSala((s) => s.erro);
  const ocupado = useSala((s) => s.ocupado);
  const cliente = useCliente();
  const conexao = cliente.conexao;

  if (sala === null) throw new Error('a tela de sala foi montada sem sala');

  const eu = conexao?.playerId() ?? null;
  const souHost = eu !== null && eu === sala.hostId;
  const minhaCor = sala.players.find((p) => p.id === eu)?.color;
  const tomadas = new Set(sala.players.map((p) => p.color));

  return (
    /* Mesmo cuidado da `Entrada`: o cartão da sala é mais alto que um celular
       deitado, e precisa rolar até o topo em vez de ser cortado nele. */
    <main className="flex h-full items-center justify-center overflow-y-auto p-4">
      <div className="my-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur">
        <header className="flex flex-col gap-1">
          <span className="text-sm text-white/70">{t.sala.codigo}</span>
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
              {/* A mesma marca que as peças dele vão levar no tabuleiro. */}
              <IconeDoJogador cor={jogador.color} tamanho={16} />
              <span className={jogador.connected ? '' : 'opacity-50'}>{jogador.nickname}</span>
              {jogador.id === sala.hostId && (
                <span className="text-xs text-white/60" title={t.sala.anfitriao}>
                  {t.sala.anfitriao}
                </span>
              )}
              {!jogador.connected && (
                <span className="ml-auto text-xs text-white/60">{t.sala.desconectado}</span>
              )}
            </li>
          ))}
        </ul>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-white/90">{t.sala.suaCor}</legend>
          <div className="flex gap-2">
            {PLAYER_COLORS.map((cor: PlayerColor) => {
              const indisponivel = tomadas.has(cor) && cor !== minhaCor;
              return (
                <button
                  key={cor}
                  type="button"
                  /* O nome em português e a marca junto: escolher a cor é
                     justamente onde saber qual símbolo se ganha importa. */
                  aria-label={`${NOME_DA_COR[cor]} (${NOME_DA_MARCA[MARCA_DO_JOGADOR[cor]]})`}
                  aria-pressed={cor === minhaCor}
                  disabled={indisponivel || ocupado}
                  onClick={() => {
                    void escolherCor(cor);
                  }}
                  data-cor={cor}
                  className={`flex size-8 items-center justify-center rounded-full border-2 transition disabled:opacity-25 ${
                    cor === minhaCor ? 'ring-2 ring-white' : ''
                  }`}
                  style={{
                    background: COR_DO_JOGADOR[cor],
                    borderColor: CONTORNO_DO_JOGADOR[cor],
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
                    <Marca
                      marca={MARCA_DO_JOGADOR[cor]}
                      x={8}
                      y={8}
                      r={4}
                      cor={CONTORNO_DO_JOGADOR[cor]}
                    />
                  </svg>
                </button>
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
            {t.sala.iniciar}
          </button>
        ) : (
          <p className="text-sm text-white/80">{t.sala.esperandoAnfitriao}</p>
        )}

        {souHost && !sala.canStart && (
          <p className="text-sm text-white/70">{t.sala.faltamJogadores}</p>
        )}

        {/* A conversa começa aqui, esperando o quarto jogador, e continua
            durante a partida — mesmo store, outra tela. */}
        {temChat(cliente) && <Chat euId={eu} className="max-h-56" />}

        <button
          type="button"
          onClick={() => {
            void sair();
          }}
          className="text-sm text-white/70 underline transition hover:text-white"
        >
          {t.sala.sair}
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
