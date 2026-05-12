# ADR-0004 — API-proxied OAuth flow for mobile Google sign-in

**Date:** 2025-05  
**Status:** Accepted

## Context

`expo-auth-session` v7 (bundled with Expo SDK 54) removed the Expo auth proxy (`useProxy`). The previous approach routed through `https://auth.expo.io` to avoid needing platform-specific OAuth client IDs, but this no longer works.

Three options were evaluated:

| Option | Works in Expo Go | Requires native build | Requires new Google clients |
|--------|-----------------|----------------------|-----------------------------|
| Native Android/iOS OAuth clients | No (SHA-1 mismatch for Expo Go) | Yes | Yes (2 new clients) |
| `@react-native-google-signin/google-signin` | No | Yes | Yes |
| **API-proxied browser flow** | **Yes** | **No** | **No** |

The API-proxied flow works as follows:

1. App calls `WebBrowser.openAuthSessionAsync(API_URL/auth/google/mobile, "aankhanet://")`.
2. API redirects to Google's OAuth consent screen with the web client ID and a server-side `redirect_uri` pointing back to the API.
3. Google redirects to `API_URL/auth/google/mobile-callback?code=...`.
4. API exchanges the code for tokens using the web client secret (never exposed to the client), validates the `id_token`, finds/creates the user, and issues AankhaNet JWTs.
5. API redirects to `aankhanet://oauth-callback?access_token=...&refresh_token=...`.
6. `WebBrowser.openAuthSessionAsync` intercepts the custom-scheme redirect and returns it to the app.

## Decision

Use the **API-proxied browser flow**. The web client secret lives only in Railway environment variables.

## Consequences

- JWT tokens appear in the redirect URL query string, visible in browser history and potentially logs. Acceptable because: (a) the custom scheme is only handled by the app on the device, (b) access tokens are 15-minute TTL, (c) Chrome Custom Tabs on Android and ASWebAuthenticationSession on iOS do not expose the final redirect URL to the browser history.
- A proper PKCE implementation would eliminate the token-in-URL concern; this is deferred to NIT3004.
- Adding `https://aankhanet-api.up.railway.app/api/v1/auth/google/mobile-callback` to the Google Cloud Console authorized redirect URIs is a deployment pre-requisite.
