import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function preview(value: string | undefined): {
  set: boolean
  length: number
  prefix: string
  suffix: string
  hasWhitespace: boolean
} {
  if (!value) return { set: false, length: 0, prefix: '', suffix: '', hasWhitespace: false }
  return {
    set: true,
    length: value.length,
    prefix: value.slice(0, 12),
    suffix: value.slice(-6),
    hasWhitespace: /\s/.test(value),
  }
}

export async function GET() {
  return NextResponse.json(
    {
      WOMPI_PUBLIC_KEY: preview(process.env.WOMPI_PUBLIC_KEY),
      WOMPI_INTEGRITY_SECRET: preview(process.env.WOMPI_INTEGRITY_SECRET),
      WOMPI_EVENTS_SECRET: preview(process.env.WOMPI_EVENTS_SECRET),
      WOMPI_REDIRECT_URL: preview(process.env.WOMPI_REDIRECT_URL),
      WOMPI_SKIP_SIGNATURE: preview(process.env.WOMPI_SKIP_SIGNATURE),
      hint: {
        sandbox_public_key_prefix: 'pub_test_',
        production_public_key_prefix: 'pub_prod_',
        sandbox_integrity_prefix: 'test_integrity_',
        sandbox_events_prefix: 'test_events_',
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
