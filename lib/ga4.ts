import { BetaAnalyticsDataClient } from '@google-analytics/data'

let client: BetaAnalyticsDataClient | null = null

export function ga4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_CLIENT_EMAIL && process.env.GA4_PRIVATE_KEY)
}

export function getGaClient(): BetaAnalyticsDataClient {
  if (!client) {
    client = new BetaAnalyticsDataClient({
      // Evita gRPC nativo (problemático en funciones serverless de Vercel): usa HTTP/JSON.
      fallback: 'rest',
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL,
        private_key: (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
    })
  }
  return client
}

export function gaPropertyId(): string {
  return `properties/${process.env.GA4_PROPERTY_ID}`
}
