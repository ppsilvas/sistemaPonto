import type { ReactNode } from 'react';

export type BadgeVariant = 'admin' | 'worker' | 'success' | 'warning';

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
