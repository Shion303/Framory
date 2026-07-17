"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl py-20 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-violet-300">Errore</p>
      <h1 className="mt-3 text-3xl font-black text-zinc-50">Qualcosa non ha funzionato</h1>
      <p className="mt-3 text-zinc-400">Ricarica la vista o riprova tra poco.</p>
      <button className="btn btn-primary mt-6" onClick={reset} type="button">
        Riprova
      </button>
    </section>
  );
}
