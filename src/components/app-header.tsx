import { ChevronLeft, LogOut, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { IconLabel } from "@/components/icon-label";

type HeaderUser = {
  displayName: string;
  email: string;
};

type HeaderContext = {
  kind: string;
  name: string;
  role?: string;
  href?: string;
};

type HeaderLink = {
  href: string;
  label: string;
  active?: boolean;
  icon?: LucideIcon;
};

export function AppHeader({
  user,
  context,
  navigation = [],
  primaryAction,
  backLink,
  guestAction = { href: "/prihlaseni", label: "Přihlásit se" },
}: {
  user?: HeaderUser | null;
  context?: HeaderContext;
  navigation?: HeaderLink[];
  primaryAction?: HeaderLink;
  backLink?: HeaderLink;
  guestAction?: HeaderLink;
}) {
  const hasContextBar = Boolean(
    context || navigation.length || primaryAction || backLink,
  );
  const headerClassName = [
    "app-header",
    hasContextBar ? "has-context" : "",
    navigation.length ? "has-navigation" : "",
  ].filter(Boolean).join(" ");
  const initial = user?.displayName.trim().charAt(0).toLocaleUpperCase("cs") || "U";

  return (
    <header className={headerClassName}>
      <div className="app-header-main">
        <Link
          className="app-header-brand"
          href={user ? "/prehled" : "/"}
          aria-label="Klubio – přehled"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="app-header-logo" height={32} src="/logo.png" width={28} />
          <strong>Klubio</strong>
        </Link>

        {user ? (
          <div className="app-header-account">
            <span className="app-header-user-avatar" aria-hidden="true">{initial}</span>
            <span className="app-header-user-copy">
              <strong>{user.displayName}</strong>
              <small>{user.email}</small>
            </span>
            <form action={logoutAction}>
              <button type="submit"><IconLabel icon={LogOut} size={15}>Odhlásit se</IconLabel></button>
            </form>
          </div>
        ) : (
          <Link className="app-header-guest-action" href={guestAction.href}>
            {guestAction.label}
          </Link>
        )}
      </div>

      {hasContextBar ? (
        <div className="app-header-context-row">
          <div className="app-header-context-inner">
            <div className="app-header-context-start">
              {backLink ? (
                <Link className="app-header-back" href={backLink.href}>
                  <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.2} />{backLink.label}
                </Link>
              ) : null}

              {context ? (
                context.href ? (
                  <Link className="app-header-context" href={context.href}>
                    <span>{context.kind}</span>
                    <strong>{context.name}</strong>
                    {context.role ? <small>{context.role}</small> : null}
                  </Link>
                ) : (
                  <div className="app-header-context">
                    <span>{context.kind}</span>
                    <strong>{context.name}</strong>
                    {context.role ? <small>{context.role}</small> : null}
                  </div>
                )
              ) : null}
            </div>

            {navigation.length ? (
              <nav className="app-header-nav" aria-label="Navigace kontextu">
                {navigation.map((item) => (
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    className={item.active ? "is-active" : undefined}
                    href={item.href}
                    key={`${item.href}-${item.label}`}
                  >
                    {item.icon ? <IconLabel icon={item.icon} size={15}>{item.label}</IconLabel> : item.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            {primaryAction ? (
              <Link className="app-header-primary" href={primaryAction.href}>
                {primaryAction.icon ? (
                  <IconLabel icon={primaryAction.icon}>{primaryAction.label}</IconLabel>
                ) : primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
