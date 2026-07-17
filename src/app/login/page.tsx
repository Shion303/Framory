import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="card p-4 text-zinc-300">Caricamento login...</p>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
