import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon name={icon} className="h-5 w-5" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {description ? (
          <p className="mx-auto max-w-xs text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
