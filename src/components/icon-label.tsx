import type { LucideIcon } from "lucide-react";

/** Text tlačítka nebo odkazu s ikonou před ním; ikona je jen dekorace, význam nese text. */
export function IconLabel({
  icon: Icon,
  children,
  size = 16,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <span className="icon-label">
      <Icon aria-hidden="true" size={size} strokeWidth={2} />
      {children}
    </span>
  );
}
