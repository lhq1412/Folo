import { describe, expect, it } from "vitest"

import {
  areRequestedHeadersAllowed,
  buildCorsHeaders,
  isOriginAllowed,
  isRequestedMethodAllowed,
  normalizeOrigin,
  parseAllowedOrigins,
  resolveCorsDecision,
} from "../cors.js"

const trustedOrigins = parseAllowedOrigins("https://preview.example.test")

function createRequest(url, init = {}) {
  return new Request(url, init)
}

describe("normalizeOrigin", () => {
  it("accepts valid http and https origins", () => {
    expect(normalizeOrigin("https://app.folo.is")).toBe("https://app.folo.is")
    expect(normalizeOrigin("http://localhost:2233")).toBe("http://localhost:2233")
  })

  it("rejects malformed or non-origin values", () => {
    expect(normalizeOrigin("not-a-url")).toBeNull()
    expect(normalizeOrigin("https://app.folo.is/path")).toBeNull()
    expect(normalizeOrigin("https://app.folo.is#hash")).toBeNull()
    expect(normalizeOrigin("ftp://app.folo.is")).toBeNull()
  })
})

describe("parseAllowedOrigins", () => {
  it("merges configured origins with defaults", () => {
    expect(parseAllowedOrigins("https://preview.example.test,https://app.folo.is")).toEqual(
      expect.arrayContaining(["https://app.folo.is", "https://preview.example.test"]),
    )
  })
})

describe("isOriginAllowed", () => {
  it("allows exact trusted origins only", () => {
    expect(isOriginAllowed("https://app.folo.is", trustedOrigins)).toBe(true)
    expect(isOriginAllowed("https://evil.folo.is", trustedOrigins)).toBe(false)
    expect(isOriginAllowed("https://app.folo.is.evil.test", trustedOrigins)).toBe(false)
  })
})

describe("preflight validation", () => {
  it("accepts known methods and headers", () => {
    expect(isRequestedMethodAllowed("POST", ["GET", "POST", "OPTIONS"])).toBe(true)
    expect(
      areRequestedHeadersAllowed("Authorization, Content-Type", ["authorization", "content-type"]),
    ).toBe(true)
  })

  it("rejects unknown methods and headers", () => {
    expect(isRequestedMethodAllowed("TRACE", ["GET", "POST", "OPTIONS"])).toBe(false)
    expect(areRequestedHeadersAllowed("X-Evil-Header", ["authorization", "content-type"])).toBe(
      false,
    )
  })
})

describe("buildCorsHeaders", () => {
  it("never uses wildcard with credentials", () => {
    const headers = buildCorsHeaders({ origin: "https://app.folo.is" })
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.folo.is")
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true")
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*")
    expect(headers.Vary).toBe("Origin")
  })
})

describe("resolveCorsDecision", () => {
  const config = { allowedOrigins: trustedOrigins }

  it("proxies requests without an Origin header and omits CORS headers", () => {
    const decision = resolveCorsDecision(createRequest("https://proxy.test/status"), config)
    expect(decision).toEqual({
      action: "proxy",
      corsHeaders: null,
    })
  })

  it("allows trusted production origins", () => {
    const decision = resolveCorsDecision(
      createRequest("https://proxy.test/status", {
        headers: {
          Origin: "https://app.folo.is",
        },
      }),
      config,
    )

    expect(decision.action).toBe("proxy")
    expect(decision.corsHeaders?.["Access-Control-Allow-Origin"]).toBe("https://app.folo.is")
  })

  it("allows trusted preview and localhost origins", () => {
    expect(
      resolveCorsDecision(
        createRequest("https://proxy.test/status", {
          headers: { Origin: "https://preview.example.test" },
        }),
        config,
      ).action,
    ).toBe("proxy")

    expect(
      resolveCorsDecision(
        createRequest("https://proxy.test/status", {
          headers: { Origin: "http://localhost:2233" },
        }),
        config,
      ).action,
    ).toBe("proxy")
  })

  it("rejects untrusted, missing, and malformed origins", () => {
    expect(
      resolveCorsDecision(
        createRequest("https://proxy.test/status", {
          headers: { Origin: "https://evil.example.test" },
        }),
        config,
      ),
    ).toEqual({
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    })

    expect(
      resolveCorsDecision(
        createRequest("https://proxy.test/status", {
          headers: { Origin: "not-a-url" },
        }),
        config,
      ),
    ).toEqual({
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    })
  })

  it("validates OPTIONS preflight method and headers", () => {
    const trustedPreflight = resolveCorsDecision(
      createRequest("https://proxy.test/status", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.folo.is",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      }),
      config,
    )
    expect(trustedPreflight.action).toBe("proxy")

    const untrustedPreflight = resolveCorsDecision(
      createRequest("https://proxy.test/status", {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example.test",
          "Access-Control-Request-Method": "POST",
        },
      }),
      config,
    )
    expect(untrustedPreflight).toEqual({
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    })

    const invalidMethod = resolveCorsDecision(
      createRequest("https://proxy.test/status", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.folo.is",
          "Access-Control-Request-Method": "TRACE",
        },
      }),
      config,
    )
    expect(invalidMethod).toEqual({
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    })

    const invalidHeaders = resolveCorsDecision(
      createRequest("https://proxy.test/status", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.folo.is",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "x-evil-header",
        },
      }),
      config,
    )
    expect(invalidHeaders).toEqual({
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    })
  })
})
