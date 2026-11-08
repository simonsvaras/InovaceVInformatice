import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";

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
          <span aria-hidden="true">K</span>
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
              <button type="submit">Odhlásit se</button>
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
                  <span aria-hidden="true">‹</span>{backLink.label}
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
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            {primaryAction ? (
              <Link className="app-header-primary" href={primaryAction.href}>
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
