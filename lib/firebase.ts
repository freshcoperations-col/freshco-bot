// Integración con Firestore via REST API — sin SDK adicional
// Lee el catálogo de productos en tiempo real desde Firebase

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1'
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'camisas-sergio'
const API_KEY = process.env.FIREBASE_API_KEY

export interface FirebaseProduct {
  id: string
  title: string
  description: string
  category: string
  price: number
  sizes: string[]
  stock: number
  images: string[] // URLs completas
}

// Parsea el formato de Firestore ({stringValue: "..."}) a un objeto plano
function parseFirestoreValue(value: Record<string, unknown>): unknown {
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) {
    const arr = value.arrayValue as { values?: Record<string, unknown>[] }
    return (arr.values ?? []).map(parseFirestoreValue)
  }
  if ('mapValue' in value) {
    const map = value.mapValue as { fields?: Record<string, Record<string, unknown>> }
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(map.fields ?? {})) {
      result[k] = parseFirestoreValue(v)
    }
    return result
  }
  return null
}

function buildImageUrl(imgPath: string): string {
  const base = (process.env.IMAGES_BASE_URL ?? 'https://freshco-design.com').replace(/\/$/, '')
  // Si ya es URL completa, devolverla tal cual
  if (imgPath.startsWith('http')) return imgPath
  // Construir URL: base + /camisas/ + filename
  const clean = imgPath.replace(/^\//, '')
  return `${base}/camisas/${clean}`
}

export async function getProductsFromFirebase(): Promise<FirebaseProduct[]> {
  if (!API_KEY) {
    console.warn('FIREBASE_API_KEY no configurado — usando catálogo local')
    return []
  }

  try {
    const url = `${FIRESTORE_BASE}/projects/${PROJECT_ID}/databases/(default)/documents/products?key=${API_KEY}`
    console.log('Fetching Firebase products from:', `projects/${PROJECT_ID}/documents/products`)
    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Error fetching Firebase products:', res.status, errBody)
      return []
    }

    const data = await res.json() as {
      documents?: Array<{
        name: string
        fields: Record<string, Record<string, unknown>>
      }>
    }

    return (data.documents ?? []).map((doc) => {
      const f = doc.fields
      const id = doc.name.split('/').pop() ?? ''

      const rawImgs = parseFirestoreValue(f.img ?? { arrayValue: {} }) as string[]
      const images = (rawImgs ?? []).map(buildImageUrl)

      return {
        id,
        title: parseFirestoreValue(f.title ?? { stringValue: '' }) as string,
        description: parseFirestoreValue(f.description ?? { stringValue: '' }) as string,
        category: parseFirestoreValue(f.category ?? { stringValue: '' }) as string,
        price: parseFirestoreValue(f.price ?? { integerValue: '0' }) as number,
        sizes: parseFirestoreValue(f.sizes ?? { arrayValue: {} }) as string[],
        stock: parseFirestoreValue(f.stock ?? { integerValue: '0' }) as number,
        images,
      }
    })
  } catch (error) {
    console.error('Error conectando con Firebase:', error)
    return []
  }
}
