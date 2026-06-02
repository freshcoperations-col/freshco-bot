'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/admin', label: 'Inicio', match: (p: string) => p === '/admin' },
  { href: '/admin/orders', label: 'Pedidos', match: (p: string) => p.startsWith('/admin/orders') },
  { href: '/admin/products', label: 'Productos', match: (p: string) => p.startsWith('/admin/products') },
  { href: '/', label: 'Conversaciones', match: () => false },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null)
    })
  }, [])

  async function handleLogout() {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  return (
    <aside className="w-56 border-r border-gray-200 bg-white flex flex-col">
      <div className="px-4 h-12 flex items-center border-b border-gray-200">
        <span className="text-sm font-bold">Freshco Admin</span>
      </div>

      <nav className="flex-1 py-2 text-sm">
        {NAV.map((item) => {
          const active = item.match(pathname || '')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 hover:bg-gray-50 ${
                active ? 'bg-gray-100 font-semibold' : 'text-gray-700'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-3 text-xs text-gray-500">
        {email && <div className="truncate mb-2">{email}</div>}
        <button
          onClick={handleLogout}
          className="text-gray-700 hover:text-gray-900 underline"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
