"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
  labelClassName = "",
  children,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  labelClassName?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard blocked (e.g. insecure origin): fall back to a prompt the user can copy from.
          window.prompt("Copy this link", text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {children}
      <span aria-live="polite" className={labelClassName}>
        {copied ? copiedLabel : label}
      </span>
    </button>
  );
}
