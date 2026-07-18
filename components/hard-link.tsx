import type { ReactNode } from "react";

export function HardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form action={href} method="get" className="contents">
      <button
        type="submit"
        className={`appearance-none border-0 bg-transparent p-0 text-inherit ${className ?? ""}`.trim()}
      >
        {children}
      </button>
    </form>
  );
}
