"use client";

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({ component: AuthForm });
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nomeCondado, setNomeCondado] = useState("");
  const [erro, setErro] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Bem-vindo de volta ao Condado!");
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "usuarios", user.uid), {
          email: user.email,
          condado: nomeCondado,
          createdAt: new Date(),
        });
        alert("Condado fundado com sucesso!");
      }
    } catch (error: any) {
      console.error(error);
      setErro("Erro na autenticação. Verifique os dados.");
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      alert("Acesso liberado pelo Google!");
    } catch {
      setErro("Erro ao conectar com o Google.");
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
          onClick={() => setIsLogin(true)}
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
          onClick={() => setIsLogin(false)}
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
        />

        {erro && <p style={{ color: "#ff4d4d", fontSize: "14px" }}>{erro}</p>}

        <button
          type="submit"
          style={{
            padding: "12px",
            backgroundColor: "#d4af37",
            color: "#000",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {isLogin ? "ENTRAR" : "FUNDAR CONDADO"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <p style={{ fontSize: "12px" }}>ou continue com</p>
        <button
          onClick={handleGoogleLogin}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "transparent",
            color: "#d4af37",
            border: "1px solid #d4af37",
            cursor: "pointer",
            marginTop: "10px",
          }}
        >
          Continuar com Google
        </button>
      </div>
    </div>
  );
}
