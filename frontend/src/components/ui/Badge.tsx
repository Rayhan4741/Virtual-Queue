import React from 'react';

type BadgeColor = 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'purple';

const COLORS: Record<BadgeColor, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function Badge({ children, color = 'slate', className = '' }: { children: React.ReactNode; color?: BadgeColor; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${COLORS[color]} ${className}`}>
      {children}
    </span>
  );
}

export function tokenStatusBadge(status: string) {
  const map: Record<string, { color: BadgeColor; label: string }> = {
    WAITING: { color: 'amber', label: 'Waiting' },
    CHECKED_IN: { color: 'blue', label: 'Checked In' },
    CALLED: { color: 'purple', label: 'Called' },
    SERVING: { color: 'emerald', label: 'Serving' },
    COMPLETED: { color: 'slate', label: 'Completed' },
    CANCELLED: { color: 'slate', label: 'Cancelled' },
    NO_SHOW: { color: 'red', label: 'No Show' },
    SKIPPED: { color: 'red', label: 'Skipped' },
  };
  const cfg = map[status] || { color: 'slate' as BadgeColor, label: status };
  return <Badge color={cfg.color}>{cfg.label}</Badge>;
}
