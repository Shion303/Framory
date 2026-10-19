import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";

// Fallback di sicurezza RADICE: se App.jsx stesso non riesce a montare, l'utente
// vede invece di una schermata bianca. Logga sempre l'errore completo in DevTools.
class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, errorInfo) {
    console.error("[Framory] render crash", error, errorInfo);
    try { (window.__framoryErrors = window.__framoryErrors || []).push({ error, info: errorInfo }); } catch { /* noop */ }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#07070b] text-zinc-100 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium">Qualcosa è andato storto.</p>
          <p className="max-w-sm text-xs text-zinc-500">I tuoi dati restano salvati in locale. Ricarica per riprovare.</p>
          <button onClick={() => window.location.reload()} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs transition active:scale-95">Ricarica</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Log sicuro di ogni eccezione non catturata (fetch, promesse, ecc.).
if (typeof window !== "undefined") {
  window.__framoryErrors = window.__framoryErrors || [];
  const capture = (source) => (event) => {
    try { window.__framoryErrors.push({ error: event?.error || event?.reason || event?.message || String(event), info: { source } }); } catch { /* noop */ }
    console.error(`[Framory] ${source}`, event?.error || event?.reason || event);
  };
  window.addEventListener("error", capture("window.error"));
  window.addEventListener("unhandledrejection", capture("unhandledrejection"));
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
