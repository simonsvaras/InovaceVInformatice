"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * Odkaz, který při opakovaném kliknutí na kotvu na téže stránce znovu odscrolluje
 * na sekci. Samotný Link by při shodné adrese nic neudělal.
 */
export function HeaderNavLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || typeof href !== "string") return;
        const [path, hash] = href.split("#");
        if (!hash || path !== pathname) return;
        const target = document.getElementById(hash);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", href);
      }}
    />
  );
}
