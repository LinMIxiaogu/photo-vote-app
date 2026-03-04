/**
 * useAuth — thin wrapper around the global AuthContext.
 *
 * Auth state is now managed in a single AuthProvider at the root of the app
 * (see contexts/auth-context.tsx). All components that call useAuth() share
 * the same user state, so logging in or out is immediately reflected
 * everywhere — including the voting screen — without requiring a per-screen
 * refresh().
 */
export { useAuthContext as useAuth } from "@/contexts/auth-context";
