"use client";
import Link from "next/link";
import { motion } from "framer-motion";

export default function BackButton() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="fixed top-8 left-8 z-[100] flex gap-4"
    >
      <Link
        href="/"
        className="
          group flex items-center justify-center
          px-6 py-3 rounded-full
          min-w-[120px]
          bg-white/10 backdrop-blur-xl
          border border-white/20
          shadow-[0_4px_24px_-1px_rgba(0,0,0,0.05),inset_0_1px_1px_rgba(255,255,255,0.5)]
          transition-all duration-300 ease-out
          hover:bg-white/20 hover:shadow-[0_8px_32px_-1px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.7)]
        "
      >
        <span className="text-sm font-medium text-black/80 tracking-wide transition-colors group-hover:text-black">
          ← Home
        </span>
      </Link>

    </motion.div>
  );
}