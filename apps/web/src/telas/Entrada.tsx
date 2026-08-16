/**
 * A porta de entrada: apelido, e depois criar ou entrar numa sala.
 *
 * O código é de seis caracteres de um alfabeto sem `0/O` nem `1/I/L`, porque é
 * ditado em voz alta ou colado de uma mensagem. O zod do contrato aceita
 * minúsculas e normaliza — quem digita não precisa saber disso, e o campo aqui
 * não briga com quem escreve em caixa baixa.
 */

import { useState } from 'react';

import { useSala } from '../estado/contexto.js';
import { rotuloDeErro } from '../rede/erros.js';
import { t } from '../i18n/pt-BR.js';

export function Entrada(): React.JSX.Element {
  const apelido = useSala((s) => s.apelido);
  const definirApelido = useSala((s) => s.definirApelido);
  const criar = useSala((s) => s.criar);
  const entrar = useSala((s) => s.entrar);
  const erro = useSala((s) => s.erro);
  const ocupado = useSala((s) => s.ocupado);

  const [codigo, setCodigo] = useState('');
  /**
   * `null` é sem relógio, e é o padrão — fecha a §11, questão 5. Quem cria a
   * sala escolhe; quem entra herda, porque o relógio é da mesa.
   */
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);

  const semApelido = apelido.trim().length === 0;

  return (
    /* `overflow-y-auto` com `my-auto` no cartão: num celular deitado o cartão é
       mais alto que a tela, e um `items-center` sozinho corta o topo em vez de
       deixar rolar até ele. */
    <main className="flex h-full items-center justify-center overflow-y-auto p-4">
      <div className="my-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur">
        <h1 className="text-2xl font-semibold text-white drop-shadow">{t.jogo.nome}</h1>

        <label className="flex flex-col gap-1 text-sm text-white/90">
          {t.entrada.apelido}
          <input
            value={apelido}
            onChange={(e) => {
              definirApelido(e.target.value);
            }}
            maxLength={24}
            className="rounded-lg bg-white/90 px-3 py-2 text-slate-900"
            data-testid="apelido"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-white/90">
          {t.entrada.tempoPorTurno}
          <select
            value={turnSeconds ?? ''}
            onChange={(e) => {
              setTurnSeconds(e.target.value === '' ? null : Number(e.target.value));
            }}
            data-testid="tempo-por-turno"
            className="rounded-lg bg-white/90 px-3 py-2 text-slate-900"
          >
            <option value="">{t.entrada.semLimite}</option>
            <option value="60">{t.entrada.umMinuto}</option>
            <option value="120">{t.entrada.doisMinutos}</option>
            <option value="300">{t.entrada.cincoMinutos}</option>
          </select>
        </label>

        <button
          type="button"
          disabled={semApelido || ocupado}
          onClick={() => {
            void criar({ turnSeconds });
          }}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {t.entrada.criarSala}
        </button>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm text-white/90">
            {t.entrada.codigoDaSala}
            <input
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
              }}
              maxLength={6}
              className="rounded-lg bg-white/90 px-3 py-2 font-mono tracking-widest text-slate-900 uppercase"
              data-testid="codigo"
            />
          </label>
          <button
            type="button"
            disabled={semApelido || ocupado || codigo.trim().length < 6}
            onClick={() => {
              void entrar(codigo);
            }}
            className="rounded-lg bg-white/20 px-3 py-2 text-white transition hover:bg-white/30 disabled:opacity-40"
          >
            {t.entrada.entrar}
          </button>
        </div>

        {erro !== null && (
          <p role="alert" className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-50">
            {rotuloDeErro(erro)}
          </p>
        )}
      </div>
    </main>
  );
}
