"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { apiJson } from "./client-utils";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  useEffect(() => {
    setReady(true);
  }, []);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const formElement = event?.currentTarget ?? formRef.current;
    if (!formElement) {
      return;
    }
    setError("");
    setLoading(true);
    const form = new FormData(formElement);
    const body = isLogin
      ? {
          email: String(form.get("email")).trim(),
          password: String(form.get("password"))
        }
      : {
          email: String(form.get("email")).trim(),
          username: String(form.get("username")).trim(),
          displayName: String(form.get("displayName")).trim(),
          password: String(form.get("password"))
        };
    try {
      await apiJson(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body)
      });
      window.location.href = params.get("next") ?? "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di autenticazione.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="card p-6">
        <h1 className="text-3xl font-black">{isLogin ? "Login" : "Registrazione"}</h1>
        <form className="mt-6 space-y-4" onSubmit={submit} ref={formRef}>
          <label className="block text-sm font-bold">
            Email
            <input className="control mt-2" name="email" required type="email" />
          </label>
          {!isLogin ? (
            <>
              <label className="block text-sm font-bold">
                Username
                <input className="control mt-2" name="username" required minLength={3} />
              </label>
              <label className="block text-sm font-bold">
                Nome visualizzato
                <input className="control mt-2" name="displayName" required minLength={2} />
              </label>
            </>
          ) : null}
          <label className="block text-sm font-bold">
            Password
            <input className="control mt-2" name="password" required minLength={isLogin ? 1 : 10} type="password" />
          </label>
          {error ? <p className="rounded-md bg-red-950 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn btn-primary w-full" data-ready={ready ? "true" : "false"} disabled={loading} onClick={() => void submit()} type="button">
            {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
            {loading ? "Attendi..." : isLogin ? "Entra" : "Crea account"}
          </button>
        </form>
        <p className="mt-5 text-sm text-zinc-400">
          {isLogin ? "Non hai un account?" : "Hai già un account?"}{" "}
          <Link className="font-bold text-violet-300" href={isLogin ? "/registrazione" : "/login"}>
            {isLogin ? "Registrati" : "Vai al login"}
          </Link>
        </p>
      </div>
    </section>
  );
}
