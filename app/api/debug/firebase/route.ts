import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.FIREBASE_API_KEY
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'camisas-sergio'

  if (!apiKey) {
    return NextResponse.json({ error: 'FIREBASE_API_KEY no configurado' })
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products?key=${apiKey}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const body = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: 'Firebase error', status: res.status, body })
    }

    const count = body.documents?.length ?? 0
    const first = body.documents?.[0]?.fields ?? null

    return NextResponse.json({
      ok: true,
      projectId,
      productCount: count,
      firstProductFields: first ? Object.keys(first) : null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) })
  }
}
