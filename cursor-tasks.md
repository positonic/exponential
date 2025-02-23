# nextjs_extension_auth_tasks.md

## 1. Create Dedicated Extension Authentication API Endpoint
- [x] **Create API Route File**
  - [x] Create a new file at `pages/api/extension-auth.ts`
  - [x] Verify that Next.js registers this file as an API route.
- [x] **Import Session Utilities**
  - [x] Import the server-side session retrieval helper from NextAuth v5:
    - Use `getServerSession` from `next-auth/next` (instead of `getSession` from `next-auth/react`).
  - [x] Ensure that your NextAuth configuration (including NEXTAUTH_URL and NEXTAUTH_SECRET) is set so that session cookies are accessible.
- [x] **Check User Authentication**
  - [x] In the API endpoint, call `getServerSession(req, res, authOptions)` to retrieve the current user session.
  - [x] If the session is absent or invalid, return a 401 response or redirect the user to the sign-in page.
- [x] **Generate a Short-Lived JWT Token for the Extension**
  - [x] Decide whether to leverage NextAuth's built-in JWT support or create a custom token.
    - **Recommendation:** Create a separate, short-lived JWT (e.g., 5 minutes) so that even if intercepted it has limited use.
  - [x] Install and import a JWT library (e.g., `jsonwebtoken`) if creating a custom token.
  - [x] Create a helper function that:
    - Extracts the minimal required information from the session (e.g., user ID, email).
    - Signs a new JWT with a 5-minute expiration, using a secret stored in environment variables.
  - [x] Optionally, document how this custom token relates to NextAuth's own JWT (which may have a longer lifespan).
- [x] **Return or Redirect with the Token**
  - [x] Decide on a strategy:
    - Either return the token as JSON, e.g., `{ token: "..." }`
    - Or redirect to the extension callback URL with the token as a query parameter (e.g., `chrome-extension://<EXTENSION_ID>/callback.html?token=...`).
- [ ] **Write Tests and Documentation**
  - [ ] Write unit tests to verify the endpoint's behavior in both authenticated and unauthenticated scenarios.
  - [ ] Update API documentation to detail how the extension authentication endpoint works and how to use the token.

## 2. Update NextAuth Configuration (if needed)
- [x] **Review NextAuth Settings**
  - [x] Ensure that the NEXTAUTH_URL and NEXTAUTH_SECRET environment variables are properly configured.
  - [x] Confirm that the session strategy is set appropriately (default is `"jwt"` if no adapter is used).
  - [x] Verify that the session cookie settings support secure access to the API route.
- [x] **Test Session Retrieval**
  - [x] Log in using the existing providers (Google, Discord) and ensure that `getServerSession` in your new endpoint correctly retrieves the session.
  - [x] Debug and resolve any issues with cookie access or session retrieval.

## 3. (Optional) Add Middleware for JWT Verification on tRPC Endpoints
- [ ] **Design JWT Verification Middleware**
  - [ ] Create middleware that retrieves the JWT from the `Authorization` header.
  - [ ] Use NextAuth's `getToken` helper from `next-auth/jwt`