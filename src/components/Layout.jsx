import React from "react";
import { NavLink, Link } from "react-router-dom";
import { Home, Compass, Library, Trophy, Settings, Clapperboard } from "lucide-react";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discovery", label: "Discovery", icon: Compass },
  { to: "/library", label: "Library", icon: Library },
  { to: "/trophies", label: "Trophies", icon: Trophy },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-border bg-sidebar/80 backdrop-blur-xl z-40">
        <Link to="/" className="flex items-center gap-2.5 px-6 h-20">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center framory-glow">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight leading-none">FRAMORY</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">Track your universe</div>
          </div>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/15 text-primary framory-text-glow"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-6 py-4 text-[10px] text-muted-foreground/60">
          Powered by TVmaze
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">FRAMORY</span>
        </Link>
        <span className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Track your universe</span>
      </header>

      {/* Main content */}
      <main className="md:pl-60 pb-24 md:pb-10 min-h-screen">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}