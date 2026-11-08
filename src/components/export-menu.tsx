"use client";

import { useEffect, useRef, useState } from "react";

export function ExportMenu({
  csvHref,
  xlsxHref,
}: {
  csvHref: string;
  xlsxHref: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="finance-admin-hero-action export-menu-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Export <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="export-menu-list" role="menu">
          <a href={csvHref} onClick={() => setOpen(false)} role="menuitem">
            CSV <small>.csv</small>
          </a>
          <a href={xlsxHref} onClick={() => setOpen(false)} role="menuitem">
            Excel <small>.xlsx</small>
          </a>
        </div>
      ) : null}
    </div>
  );
}
