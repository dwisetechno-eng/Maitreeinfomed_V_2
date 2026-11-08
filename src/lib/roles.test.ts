import { describe, expect, it } from 'vitest'

import {
  APP_ROLES,
  ROLE_LABELS,
  canEditMasters,
  canManageUsers,
  isAdminRole,
  isAppRole,
} from '@/lib/roles'

describe('roles', () => {
  it('recognises valid roles', () => {
    for (const role of APP_ROLES) {
      expect(isAppRole(role)).toBe(true)
    }
  })

  it('rejects unknown roles', () => {
    expect(isAppRole('superadmin')).toBe(false)
    expect(isAppRole(null)).toBe(false)
    expect(isAppRole(42)).toBe(false)
  })

  it('identifies admins', () => {
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('ADMIN')).toBe(false)
    expect(isAdminRole(null)).toBe(false)
  })

  it('manages users only for admins', () => {
    expect(canManageUsers('admin')).toBe(true)
    expect(canManageUsers('manager')).toBe(false)
    expect(canManageUsers('user')).toBe(false)
    expect(canManageUsers(undefined)).toBe(false)
  })

  it('edits masters for admin and manager', () => {
    expect(canEditMasters('admin')).toBe(true)
    expect(canEditMasters('manager')).toBe(true)
    expect(canEditMasters('user')).toBe(false)
  })

  it('has a label for every role', () => {
    for (const role of APP_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy()
    }
  })
})
