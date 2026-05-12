export type Role = "admin" | "manager" | "agent" | "viewer";

// Placeholder role provider. Replace with real auth-derived role lookup.
export function useCurrentRole(): Role {
  return "admin";
}

export function hasAccess(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}