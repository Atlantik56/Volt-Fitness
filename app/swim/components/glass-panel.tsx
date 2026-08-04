import type { ElementType, ReactNode } from "react";

export function GlassPanel({
  as: Component = "div",
  variant = "base",
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: "base" | "raised" | "interactive";
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  const variantClass = variant === "raised" ? "raised" : variant === "interactive" ? "interactive" : "";
  return (
    <Component className={`swim-glass ${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}
