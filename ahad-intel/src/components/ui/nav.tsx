'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn, initials } from '@/lib/utils';

export interface NavItem { href: string; label: string; hint?: string }
export interface NavGroup { title: string; items: NavItem[] }

export function SideNav({
  groups, workspaceName, userName, userRole,
}: { groups: NavGroup[]; workspaceName: string; userName: string; userRole: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle navigation"
        className="focus-ring fixed left-4 top-4 z-50 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-card lg:hidden"
      >
        {open ? 'Close' : 'Menu'}
      </button>

      <nav
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brandInk">A</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{workspaceName}</p>
            <p className="text-[11px] text-muted">Customer intelligence</p>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'focus-ring block rounded-xl px-3 py-2 text-sm transition',
                        isActive(item.href)
                          ? 'bg-brand/10 font-medium text-brand'
                          : 'text-muted hover:bg-surface2 hover:text-ink',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-semibold text-ink">
              {initials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">{userName}</p>
              <p className="text-[11px] text-muted">{userRole}</p>
            </div>
          </div>
          <form action="/api/auth/sign-out" method="post" className="mt-2">
            <button
              type="submit"
              className="focus-ring w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted transition hover:bg-surface2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}
    </>
  );
}
