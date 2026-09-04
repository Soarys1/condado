"use client";

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/firebase";
import { setBearerToken, signInGoogle } from "@/lib/auth/client";
import { WHATSAPP_GROUP } from "@/lib/game/constants";
import { unlockAudio } from "@/lib/game/audio";

export const Route = createFileRoute("/login")({ component: AuthForm });

function firebaseErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe uma conta com este e-mail.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Use Entrar.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/operation-not-allowed":
      "Este método de login ainda não foi habilitado no Firebase Console.",
    "auth/popup-blocked": "O navegador bloqueou a janela de login. Tente novamente.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada.",
    "auth/unauthorized-domain":
      "Este domínio ainda não está nos domínios autorizados do Firebase (adicione vercel.app).",
    "auth/account-exists-with-different-credential": "Este e-mail já usa outro método de login.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão e tente novamente.",
    "auth/too-many-requests": "Muitas tentativas. Espere um minuto e tente de novo.",
  };
  return messages[code] ?? (error instanceof Error ? error.message : "Não foi possível autenticar.");
}

export default function AuthForm() {
  const [mode, setMode] = useState<"entrar" | "criar">("criar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then(async (result) => {
        if (!active || !result?.user) return;
        setBearerToken(await result.user.getIdToken(true));
        window.location.assign("/");
      })
      .catch((error) => {
        if (active) setErro(firebaseErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const finish = async (idToken: string) => {
    setBearerToken(idToken);
    window.location.assign("/");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (mode === "criar" && password !== confirm) {
      setErro("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      unlockAudio();
      const cred =
        mode === "criar"
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
      await finish(await cred.user.getIdToken(true));
    } catch (error) {
      setErro(firebaseErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setErro("");
    setBusy(true);
    try {
      unlockAudio();
      await signInGoogle();
      const token = await auth.currentUser?.getIdToken(true);
      if (token) await finish(token);
    } catch (error) {
      setErro(firebaseErrorMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full items-end justify-center bg-ink text-parchment">
      <img src="/game/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/25" />
      <div className="relative z-10 mb-[max(1.5rem,env(safe-area-inset-bottom))] w-full max-w-md px-5 pb-6">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.35em] text-parchment-dim">
          Senhores da guerra
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-wide">Condado</h1>
        <p className="mt-3 text-sm leading-relaxed text-parchment-dim">
          Cria a tua conta com e-mail. O nome do condado fica único no reino e o progresso vive no
          Firestore.
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-md border border-line bg-ink-2/80 p-1">
          <button
            type="button"
            className={`h-10 rounded-sm font-display text-sm ${mode === "criar" ? "bg-parchment text-ink" : "text-parchment-dim"}`}
            onClick={() => setMode("criar")}
          >
            Criar conta
          </button>
          <button
            type="button"
            className={`h-10 rounded-sm font-display text-sm ${mode === "entrar" ? "bg-parchment text-ink" : "text-parchment-dim"}`}
            onClick={() => setMode("entrar")}
          >
            Entrar
          </button>
        </div>

        <form onSubmit={handleAuth} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-md border border-line-strong bg-ink-2/80 px-3 text-base outline-none placeholder:text-parchment-dim/60 focus:border-niens"
          />
          <input
            type="password"
            autoComplete={mode === "criar" ? "new-password" : "current-password"}
            required
            minLength={6}
            placeholder="Senha (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-md border border-line-strong bg-ink-2/80 px-3 text-base outline-none placeholder:text-parchment-dim/60 focus:border-niens"
          />
          {mode === "criar" && (
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Confirmar senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 rounded-md border border-line-strong bg-ink-2/80 px-3 text-base outline-none placeholder:text-parchment-dim/60 focus:border-niens"
            />
          )}
          {erro && (
            <p role="alert" className="text-sm text-iron">
              {erro}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm font-semibold text-ink disabled:opacity-50"
          >
            {busy ? "Aguarde…" : mode === "criar" ? "Criar conta e fundar" : "Entrar no condado"}
          </button>
        </form>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleGoogle()}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-md border border-line bg-ink-2/80 text-sm disabled:opacity-50"
        >
          Continuar com Google
        </button>

        <Link
          to="/"
          className="mt-3 flex h-11 w-full items-center justify-center text-sm text-parchment-dim"
        >
          Voltar
        </Link>
        <a
          href={WHATSAPP_GROUP}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex h-11 w-full items-center justify-center gap-2 text-sm text-parchment-dim"
        >
          <MessageCircle className="size-4" />
          Grupo no WhatsApp
        </a>
      </div>
    </div>
  );
}
