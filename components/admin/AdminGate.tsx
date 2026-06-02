'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase'

type CheckState =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'denied'; email?: string }
  | { state: 'ok'; email: string }

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [check, setCheck] = useState<CheckState>({ state: 'loading' })

  useEffect(() => {
    const supabase = createBrowserClient()

    async function run() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setCheck({ state: 'unauthenticated' })
        return
      }
      try {
        const res = await fetch('/api/admin/web/check', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const body = await res.json()
        if (res.ok && body.ok) {
          setCheck({ state: 'ok', email: body.email })
        } else {
          setCheck({ state: 'denied', email: sessionData.session?.user?.email ?? undefined })
        }
      } catch {
        setCheck({ state: 'denied' })
      }
    }
    run()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      run()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (check.state === 'unauthenticated' && pathname !== '/admin/login') {
      router.replace('/admin/login')
    }
  }, [check.state, pathname, router])

  if (check.state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Cargando…
      </div>
    )
  }

  if (check.state === 'unauthenticated') {
    return null // redirigiendo
  }

  if (check.state === 'denied') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-gray-500 mb-4">
          {check.email
            ? `La cuenta ${check.email} no tiene permisos de administrador.`
            : 'No tienes permisos de administrador.'}
        </p>
        <button
          className="px-4 py-2 text-xs uppercase tracking-wide bg-gray-900 text-white rounded"
          onClick={async () => {
            const supabase = createBrowserClient()
            await supabase.auth.signOut()
            router.replace('/admin/login')
          }}
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return <>{children}</>
}
