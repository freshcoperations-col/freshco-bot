import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/debug/ntfy — prueba la notificación ntfy desde Vercel
// Solo para diagnóstico. Llama a este endpoint y revisa la respuesta.
export async function GET() {
  const ntfyTopic = process.env.NTFY_TOPIC?.trim()

  if (!ntfyTopic) {
    return NextResponse.json({
      ok: false,
      error: 'NTFY_TOPIC no está configurada en las variables de entorno de Vercel',
    }, { status: 500 })
  }

  const body = '🧪 Prueba de notificación desde Freshco bot'
  const title = 'Test ntfy - Freshco'

  try {
    const res = await fetch(`https://ntfy.sh/${ntfyTopic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Title': title,
        'Priority': 'high',
        'Tags': 'white_check_mark',
      },
      body,
    })
    const text = await res.text()
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      ntfy_topic: ntfyTopic,
      ntfy_response: text.slice(0, 200),
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ntfy_topic: ntfyTopic,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
