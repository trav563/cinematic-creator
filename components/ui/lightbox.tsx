"use client";

import { useEffect } from "react";
import Image from "next/image";

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  src: string | null;
  alt?: string;
  /** Optional action area rendered below the image (e.g., Confirm button). */
  footer?: React.ReactNode;
  /** Optional caption rendered above the action area. */
  caption?: React.ReactNode;
  /** When provided, shows a left chevron and binds ArrowLeft. Disable when no prev. */
  onPrev?: () => void;
  /** When provided, shows a right chevron and binds ArrowRight. Disable when no next. */
  onNext?: () => void;
  /** Position indicator (e.g., "2 of 3") rendered with the caption. */
  indexLabel?: string;
}

export function Lightbox({
  open,
  onClose,
  src,
  alt = "",
  footer,
  caption,
  onPrev,
  onNext,
  indexLabel,
}: LightboxProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open || !src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6 backdrop-blur"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-6xl flex-col items-center gap-4"
      >
        <div className="relative flex w-full max-w-5xl items-center justify-center">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label="Previous (←)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <Image
            src={src}
            alt={alt}
            width={1920}
            height={1080}
            unoptimized
            className="h-auto max-h-[80vh] w-full rounded-md object-contain"
          />
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label="Next (→)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
        {(caption || indexLabel) && (
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            {indexLabel && <span className="rounded bg-white/10 px-2 py-0.5">{indexLabel}</span>}
            {caption}
          </div>
        )}
        {footer && <div className="flex items-center gap-2">{footer}</div>}
        <button
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-white"
          type="button"
        >
          Close (Esc)
        </button>
      </div>
    </div>
  );
}
