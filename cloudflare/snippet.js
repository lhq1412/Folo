import { applyCorsHeaders, parseAllowedOrigins, resolveCorsDecision } from "./cors.js"

const originHost = "api.folo.is"
const upstreamOrigin = "https://folo.is"

/**
 * @param {Record<string, string | undefined>} env
 */
function createCorsConfig(env) {
  return {
    allowedOrigins: parseAllowedOrigins(env.FOLO_CORS_ALLOWED_ORIGINS),
  }
}

export default {
  /**
   * @param {Request} request
   * @param {Record<string, string | undefined>} env
   */
  async fetch(request, env = {}) {
    const corsConfig = createCorsConfig(env)
    const decision = resolveCorsDecision(request, corsConfig)

    if (decision.action === "forbidden") {
      return new Response("Forbidden", {
        status: decision.status,
        headers: {
          Vary: "Origin",
        },
      })
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: decision.corsHeaders ?? undefined,
      })
    }

    const url = new URL(request.url)
    url.host = originHost

    const upstreamRequest = new Request(url, request)
    upstreamRequest.headers.set("Origin", upstreamOrigin)

    const response = await fetch(upstreamRequest)
    const headers = applyCorsHeaders(response.headers, decision.corsHeaders)

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
