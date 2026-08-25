import React, { useState } from "react";
import { Palette, Info, Clapperboard, Database, Plus, GitMerge } from "lucide-react";
import Layout from "@/components/Layout";
import { TrophyManager } from "@/components/TrophyManager";
import { DataManager } from "@/components/DataManager";
import { CreateContentWizard } from "@/components/CreateContentWizard";
import { MergeContent } from "@/components/MergeContent";
import { SyncDatabase } from "@/components/SyncDatabase";
import { useFranchises } from "@/lib/useFramoryData";

export default function Settings() {
  const { franchises } = useFranchises();
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  return (
    <Layout>
      <div className="px-4 sm:px-6 pt-6 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-8">Customize Framory and manage your universe.</p>
      </div>

      <div className="px-4 sm:px-6 space-y-10 pb-10">
        {/* Appearance */}
        <section>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Palette className="w-5 h-5 text-primary" /> Appearance
          </h2>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Dark cinematic theme</p>
                <p className="text-xs text-muted-foreground mt-0.5">Framory is designed in black & purple. Dark mode is always on.</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-background to-primary/40 ring-1 ring-primary/40 framory-glow" />
            </div>
          </div>
        </section>

        {/* Trophy Management */}
        <section>
          <TrophyManager />
        </section>

        {/* Database Management */}
        <section>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Database className="w-5 h-5 text-primary" /> Database Management
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <button
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-border bg-card hover:ring-1 hover:ring-primary/60 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center"><Plus className="w-5 h-5 text-primary" /></div>
              <span className="text-sm font-medium">Create Content</span>
              <span className="text-[11px] text-muted-foreground text-center">Manually add an anime, series or film.</span>
            </button>
            <button
              onClick={() => setMergeOpen(true)}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-border bg-card hover:ring-1 hover:ring-primary/60 transition"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center"><GitMerge className="w-5 h-5 text-primary" /></div>
              <span className="text-sm font-medium">Merge Content</span>
              <span className="text-[11px] text-muted-foreground text-center">Combine duplicate records into one.</span>
            </button>
          </div>
          <SyncDatabase />
        </section>

        {/* Data Management */}
        <section>
          <DataManager />
        </section>

        {/* About */}
        <section>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-primary" /> About
          </h2>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center framory-glow">
                <Clapperboard className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold">Framory</p>
                <p className="text-xs text-muted-foreground">Track your TV universe</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Framory is a personal space to discover, collect, follow and complete entire television universes —
              earning trophies along the way. Series data is provided by TMDB; anime, series and films can also be
              created manually.
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-3">Data source: api.themoviedb.org · API key required</p>
          </div>
        </section>
      </div>

      <CreateContentWizard open={createOpen} onClose={() => setCreateOpen(false)} franchises={franchises} onCreated={() => window.location.reload()} />
      <MergeContent open={mergeOpen} onClose={() => setMergeOpen(false)} onDone={() => {}} />
    </Layout>
  );
}