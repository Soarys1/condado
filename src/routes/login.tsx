"use client";

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithRedirect,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { setBearerToken } from "@/lib/auth/client";
import { createProfile } from "@/lib/game/cloud";

export const Route = createFileRoute("/login")({ component: AuthForm });

function firebaseErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe uma conta com este e-mail.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/operation-not-allowed":
      "O login por e-mail ainda não foi habilitado no Firebase Console.",
    "auth/popup-blocked": "O navegador bloqueou a janela de login. Tente novamente.",
    "auth/unauthorized-domain":
      "Este domínio ainda não foi adicionado aos domínios autorizados do Firebase.",
    "auth/account-exists-with-different-credential": "Este e-mail já usa outro método de login.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão e tente novamente.",
  };
  return (
    messages[code] ?? (error instanceof Error ? error.message : "Não foi possível autenticar.")
  );
}

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nomeCondado, setNomeCondado] = useState("");
  const [erro, setErro] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then(async (result) => {
        if (!active || !result?.user) return;
        setBearerToken(await result.user.getIdToken());
        window.location.assign("/");
      })
      .catch((error) => {
        if (active) setErro(firebaseErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setBusy(true);
    try {
      if (isLogin) {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        setBearerToken(await credential.user.getIdToken());
        window.location.assign("/");
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      setBearerToken(await credential.user.getIdToken());
      await createProfile({ data: { nick: nomeCondado.trim() } });
      window.location.assign("/");
    } catch (error) {
      console.error("Firebase Auth error", error);
      setErro(firebaseErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErro("");
    setBusy(true);
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Firebase Google Auth error", error);
      setErro(firebaseErrorMessage(error));
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "400px",
        margin: "0 auto",
        backgroundColor: "#1e1e1e",
        color: "#d4af37",
        fontFamily: "serif",
      }}
    >
      <h1 style={{ textAlign: "center", fontSize: "24px" }}>ENTRAR NO CONDADO</h1>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => {
            setIsLogin(true);
            setErro("");
          }}
          disabled={busy}
          style={{
            flex: 1,
            padding: "10px",
            background: isLogin ? "#333" : "transparent",
            color: "#d4af37",
            border: "1px solid #d4af37",
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLogin(false);
            setErro("");
          }}
          disabled={busy}
          style={{
            flex: 1,
            padding: "10px",
            background: !isLogin ? "#333" : "transparent",
            color: "#d4af37",
            border: "1px solid #d4af37",
          }}
        >
          Criar conta
        </button>
      </div>
      <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {!isLogin && (
          <input
            type="text"
            placeholder="Nome do Condado (ex: Macedônia)"
            value={nomeCondado}
            onChange={(e) => setNomeCondado(e.target.value)}
            style={{ padding: "10px", borderRadius: "5px", border: "none" }}
            required
            minLength={3}
            maxLength={18}
          />
        )}
        <input
          type="email"
          placeholder="Seu e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "10px", borderRadius: "5px", border: "none" }}
          required
        />
        <input
          type="password"
          placeholder="Sua senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "10px", borderRadius: "5px", border: "none" }}
          required
          minLength={6}
        />
        {erro && (
          <p role="alert" style={{ color: "#ff4d4d", fontSize: "14px" }}>
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "12px",
            backgroundColor: "#d4af37",
            color: "#000",
            border: "none",
            fontWeight: "bold",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "AGUARDE..." : isLogin ? "ENTRAR" : "FUNDAR CONDADO"}
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <p style={{ fontSize: "12px" }}>ou continue com</p>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "transparent",
            color: "#d4af37",
            border: "1px solid #d4af37",
            cursor: busy ? "wait" : "pointer",
            marginTop: "10px",
          }}
        >
          Continuar com Google
        </button>
      </div>
    </div>
  );
}
