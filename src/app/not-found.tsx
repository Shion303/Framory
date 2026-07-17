import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl py-20 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-violet-300">404</p>
      <h1 className="mt-3 text-3xl font-black text-zinc-50">Pagina non trovata</h1>
      <p className="mt-3 text-zinc-400">La pagina richiesta non esiste oppure non è più disponibile.</p>
      <Link className="btn btn-primary mt-6" href="/">
        Torna alla Home
      </Link>
    </section>
  );
}
