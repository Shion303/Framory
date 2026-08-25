import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy as TrophyIcon } from "lucide-react";

export function TrophyUnlockModal({ trophies, onClose }) {
  useEffect(() => {
    if (!trophies || trophies.length === 0) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [trophies, onClose]);

  return (
    <AnimatePresence>
      {trophies && trophies.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
        >
          <motion.div
            initial={{ scale: 0.7, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-sm w-full rounded-3xl border border-primary/40 bg-card p-8 text-center framory-glow"
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="w-24 h-24 mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-primary/40 to-fuchsia-500/30 ring-2 ring-primary flex items-center justify-center mb-5"
            >
              {trophies[0].image_url ? (
                <img src={trophies[0].image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <TrophyIcon className="w-12 h-12 text-white" />
              )}
            </motion.div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Trophy Unlocked</p>
            <h2 className="text-2xl font-bold text-foreground framory-text-glow mb-1">{trophies[0].name}</h2>
            <p className="text-sm text-muted-foreground">
              {trophies.length > 1 ? `+${trophies.length - 1} more trophy earned!` : "Congratulations on your achievement."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}