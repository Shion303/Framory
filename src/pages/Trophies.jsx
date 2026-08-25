import React, { useEffect, useState } from "react";
import { Trophy as TrophyIcon, Lock, Sparkles } from "lucide-react";
import Layout from "@/components/Layout";
import { Loading, EmptyState } from "@/components/States";
import { TrophyCard } from "@/components/TrophyBadge";
import { useTrophies } from "@/lib/useFramoryData";
import { reevaluateAllTrophies } from "@/lib/tracking";
import { TrophyUnlockModal } from "@/components/TrophyUnlockModal";

export default function Trophies() {
  const { trophies, loading, reload } = useTrophies();
  const [unlocked, setUnlocked] = useState([]);

  useEffect(() => {
    (async () => {
      const newly = await reevaluateAllTrophies();
      if (newly.length > 0) {
        setUnlocked(newly);
        reload();
      }
    })();
  }, [reload]);

  const unlockedList = trophies.filter((t) => t.is_unlocked).sort((a, b) => (b.unlocked_date || "").localeCompare(a.unlocked_date || ""));
  const lockedList = trophies.filter((t) => !t.is_unlocked);

  return (
    <Layout>
      <TrophyUnlockModal trophies={unlocked} onClose={() => setUnlocked([])} />
      <div className="px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center framory-glow">
            <TrophyIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Trophies</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {unlockedList.length} of {trophies.length} unlocked
        </p>
      </div>

      {loading ? (
        <Loading label="Loading trophies…" />
      ) : trophies.length === 0 ? (
        <EmptyState
          title="No trophies yet"
          description="Create your first trophy in Settings to start earning rewards as you complete series."
          icon={TrophyIcon}
        />
      ) : (
        <div className="px-4 sm:px-6 space-y-8">
          {unlockedList.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Unlocked
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {unlockedList.map((t) => (
                  <TrophyCard key={t.id} trophy={t} />
                ))}
              </div>
            </section>
          )}
          {lockedList.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Lock className="w-5 h-5 text-muted-foreground" /> Locked
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {lockedList.map((t) => (
                  <TrophyCard key={t.id} trophy={t} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}