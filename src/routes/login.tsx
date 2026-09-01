import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { createProfile } from "@/lib/game/cloud";
import { WHATSAPP_GROUP } from "@/lib/game/constants";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const nick = name.trim();
        if (nick.length < 3) throw new Error("O nome do condado precisa de ao menos 3 letras.");
        const { error } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: nick,
        });
        if (error) throw new Error(error.message ?? "Não foi possível criar a conta.");
        try {
          await createProfile({ data: { nick } });
        } catch {
          /* splash pede outro nome se este já estiver tomado */
        }
      } else {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message ?? "E-mail ou senha inválidos.");
      }
      window.location.href = "/";
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "Falha no acesso.";
      if (/unique|already|exists|duplicate/i.test(msg)) setErr("Este e-mail já tem um condado.");
      else setErr(msg);
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-end justify-center bg-ink text-parchment md:items-center">
      <img src="/game/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
      <div className="panel relative z-10 mb-[max(1.5rem,env(safe-area-inset-bottom))] w-full max-w-md rounded-t-xl p-5 md:mb-0 md:rounded-xl">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.3em] text-parchment-dim">Senhores da guerra</p>
        <h1 className="mt-1 font-display text-3xl">Entrar no Condado</h1>
        <p className="mt-2 text-sm text-parchment-dim">
          E-mail e senha ficam no servidor. Ninguém vê chave, senha ou o nome do banco no jogo.
        </p>

        {authEnabled ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`h-10 rounded-md border text-sm ${mode === "in" ? "border-niens bg-panel-2" : "border-line bg-ink-2"}`}
                onClick={() => setMode("in")}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`h-10 rounded-md border text-sm ${mode === "up" ? "border-niens bg-panel-2" : "border-line bg-ink-2"}`}
                onClick={() => setMode("up")}
              >
                Criar conta
              </button>
            </div>
            <form className="mt-3 space-y-2" onSubmit={(e) => void onEmail(e)}>
              {mode === "up" && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={18}
                  placeholder="Nome único do condado"
                  className="h-12 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
                  required
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                autoComplete="email"
                className="h-12 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                minLength={8}
                className="h-12 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
                required
              />
              {err && <p className="text-sm text-iron">{err}</p>}
              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm text-ink disabled:opacity-50"
              >
                {busy ? "A selar…" : mode === "up" ? "Fundar condado" : "Entrar"}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-parchment-dim">ou continue com</p>
            <div className="mt-2 space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  className="h-11 w-full rounded-md border border-line bg-ink-2 text-sm"
                  onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                >
                  Continuar com {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-parchment-dim">O acesso está desligado neste reino.</p>
        )}

        <Link to="/" className="mt-4 block text-center text-xs text-parchment-dim">
          Voltar
        </Link>
        <a
          href={WHATSAPP_GROUP}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex h-11 w-full items-center justify-center rounded-md border border-line bg-ink-2 text-sm"
        >
          Grupo no WhatsApp
        </a>
      </div>
    </main>
  );
}
