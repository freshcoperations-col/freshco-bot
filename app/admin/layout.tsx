'use client'

import { usePathname } from 'next/navigation'
import { AdminGate } from '@/components/admin/AdminGate'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isLogin = pathname === '/admin/login'

  if (isLogin) {
    return <>{children}</>
  }

  return (
    <AdminGate>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </AdminGate>
  )
}
