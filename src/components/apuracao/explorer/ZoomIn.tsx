"use client";

import { AnimatePresence, motion } from "motion/react";

/** Transição de nível (Brasil › UF › município › zona › escola): o novo nível "aproxima" e o anterior se afasta. */
export function ZoomIn({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={k} initial={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 1.03, filter: "blur(4px)" }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }} style={{ transformOrigin: "50% 0%" }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
