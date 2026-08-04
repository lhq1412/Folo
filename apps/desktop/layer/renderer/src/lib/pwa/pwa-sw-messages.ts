export const PWA_BUILD_REVISION_REQUEST = "folo-pwa-build-revision-request-v1"
export const PWA_BUILD_REVISION_RESPONSE = "folo-pwa-build-revision-response-v1"

export type PwaBuildRevisionRequestMessage = {
  type: typeof PWA_BUILD_REVISION_REQUEST
}

export type PwaBuildRevisionResponseMessage = {
  type: typeof PWA_BUILD_REVISION_RESPONSE
  revision: string
}
