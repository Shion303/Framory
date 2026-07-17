import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <Suspense fallback={<p className="card p-4 text-zinc-300">Caricamento registrazione...</p>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
