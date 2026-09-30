import { requireSession } from '@/lib/auth';
import { ROLE_LABELS, can } from '@/lib/rbac';
import { SideNav, type NavGroup } from '@/components/ui/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const groups: NavGroup[] = [
    {
      title: 'Work',
      items: [
        { href: '/', label: 'Overview' },
        { href: '/feed', label: 'Daily Priority Feed' },
        { href: '/leads', label: 'Leads & accounts' },
        { href: '/drafts', label: 'Outreach drafts' },
        { href: '/inbox', label: 'Inbox & replies' },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        { href: '/icp', label: 'ICP builder' },
        { href: '/campaigns', label: 'Campaigns' },
        ...(can(session.role, 'analytics:read') ? [{ href: '/analytics', label: 'Analytics' }] : []),
      ],
    },
    {
      title: 'Configure',
      items: [
        ...(can(session.role, 'integration:read') ? [{ href: '/integrations', label: 'Integrations' }] : []),
        ...(can(session.role, 'settings:write') ? [{ href: '/settings', label: 'Settings & admin' }] : []),
        ...(can(session.role, 'audit:read') ? [{ href: '/audit', label: 'Audit log' }] : []),
      ],
    },
  ];

  return (
    <div className="min-h-screen">
      <SideNav
        groups={groups}
        workspaceName={session.workspaceName}
        userName={session.name}
        userRole={ROLE_LABELS[session.role]}
      />
      <main className="px-4 py-16 lg:ml-64 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
