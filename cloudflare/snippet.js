// 需要反代的地址

const origin_host = "api.folo.is"
const allowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin")
  const requestHeaders = request.headers.get("Access-Control-Request-Headers")

  const headers = {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers":
      requestHeaders ?? "Authorization, Content-Type, Accept, Origin, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }

  if (origin) {
    headers["Access-Control-Allow-Credentials"] = "true"
  }

  return headers
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      })
    }

    const url = new URL(request.url)
    url.host = origin_host

    const newReq = new Request(url, request)
    newReq.headers.set("Origin", "https://folo.is")

    const response = await fetch(newReq)
    const headers = new Headers(response.headers)

    for (const [key, value] of Object.entries(getCorsHeaders(request))) {
      headers.set(key, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
