/** Role-based access control helpers shared by the UI and server actions. */

export type AppRole = 'admin' | 'manager' | 'user'

export const APP_ROLES: AppRole[] = ['admin', 'manager', 'user']

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  user: 'User',
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as string[]).includes(value)
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin'
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'admin'
}

export function canEditMasters(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}
