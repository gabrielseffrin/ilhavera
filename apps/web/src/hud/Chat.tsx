/**
 * A caixa de conversa da sala.
 *
 * Aparece no lobby e na partida — a mesma caixa, o mesmo store. É a única peça
 * da interface que atravessa as duas telas, e é de propósito: a conversa começa
 * enquanto se espera o quarto jogador e não deve morrer quando o tabuleiro
 * aparece.
 *
 * **Não existe no hot-seat.** `useChat` cai num store inerte quando não há
 * conexão, e quem monta é que decide não desenhar — ver `temChat`.
 *
 * O histórico rola sozinho para o fim quando chega mensagem nova, e só então:
 * rolar a cada render arrancaria de quem está lendo o que passou.
 */

import { useEffect, useRef, useState } from 'react';

import { useChat } from '../estado/contexto.js';
import { Alerta } from './base/Alerta.js';
import { Botao } from './base/Botao.js';
import { Cartao } from './base/Cartao.js';
import { rotuloDeErro } from '../rede/erros.js';
import { t } from '../i18n/pt-BR.js';

export type ChatProps = {
  /** Quem sou eu, para destacar as próprias falas. `null` antes do primeiro ack. */
  euId?: string | null;
  /** Altura da lista. O lobby tem folga; a coluna da partida, não. */
  className?: string;
};

export function Chat({ euId = null, className = '' }: ChatProps): React.JSX.Element {
  const mensagens = useChat((s) => s.mensagens);
  const enviando = useChat((s) => s.enviando);
  const erro = useChat((s) => s.erro);
  const enviar = useChat((s) => s.enviar);

  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [mensagens.length]);

  return (
    <Cartao data-testid="chat" className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <h2 className="font-semibold">{t.chat.titulo}</h2>

      {/**
       * `role="log"` com `aria-live="polite"`: mensagem que chega é anunciada,
       * mas sem interromper o que o leitor de tela estiver dizendo. Um chat em
       * `assertive` atropelaria o anúncio da própria jogada.
       */}
      <ol
        data-testid="chat-mensagens"
        role="log"
        aria-live="polite"
        aria-label={t.chat.rotulo}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
      >
        {mensagens.length === 0 && <li className="text-xs text-white/70">{t.chat.vazio}</li>}
        {mensagens.map((m) => (
          <li key={m.id} data-autor={m.playerId} className="text-xs break-words">
            <span className={m.playerId === euId ? 'font-semibold' : 'text-white/80'}>
              {m.nickname}
            </span>
            <span className="text-white/70">: </span>
            {m.text}
          </li>
        ))}
        <div ref={fim} />
      </ol>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const aMandar = texto;
          // Limpa antes de esperar o ack: o campo vazio é a confirmação de que
          // o Enter foi ouvido, e a mensagem recusada volta como alerta.
          setTexto('');
          void enviar(aMandar);
        }}
      >
        <label className="flex-1">
          <span className="sr-only">{t.chat.campo}</span>
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
            }}
            maxLength={500}
            placeholder={t.chat.placeholder}
            data-testid="chat-campo"
            className="w-full rounded-lg bg-white/90 px-2 py-1.5 text-slate-900 placeholder:text-slate-500"
          />
        </label>
        <Botao
          tom="secundario"
          type="submit"
          disabled={enviando || texto.trim().length === 0}
          data-testid="chat-enviar"
          className="px-3 py-1.5"
        >
          {t.chat.enviar}
        </Botao>
      </form>

      {erro !== null && <Alerta compacto>{rotuloDeErro(erro)}</Alerta>}
    </Cartao>
  );
}
