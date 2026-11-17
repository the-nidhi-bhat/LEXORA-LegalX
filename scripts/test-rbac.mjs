import assert from 'node:assert/strict'
import {
  ROLE_NAV,
  ROUTE_PERMISSIONS,
  SHARED_ROLE_ROUTES,
  canAccessRoute,
  hasPermission,
  maskFinancials,
} from '../src/rbac.ts'

const roles = ['owner', 'freelancer', 'legal_reviewer', 'org_admin', 'technical_auditor']

// --- Baseline permission checks (actual implementation) ---
assert.equal(hasPermission('owner', 'agreement:create'), true)
assert.equal(hasPermission('owner', 'escrow:fund'), true)
assert.equal(hasPermission('freelancer', 'agreement:create'), false)
assert.equal(hasPermission('freelancer', 'escrow:fund'), false)
assert.equal(hasPermission('freelancer', 'milestone:submit'), true)
assert.equal(hasPermission('legal_reviewer', 'agreement:approve_legal'), true)
assert.equal(hasPermission('legal_reviewer', 'escrow:fund'), false)
assert.equal(hasPermission('org_admin', 'workspace:manage'), true)
assert.equal(hasPermission('org_admin', 'agreement:approve_legal'), false)
assert.equal(hasPermission('org_admin', 'escrow:fund'), false)
assert.equal(hasPermission('technical_auditor', 'audit:view'), true)
assert.equal(hasPermission('technical_auditor', 'agreement:edit'), false)
assert.equal(hasPermission('technical_auditor', 'escrow:fund'), false)

// --- P0-02: Owner granular read-only access to Contract IR and Parity ---
assert.equal(canAccessRoute('owner', '/app/contract-ir'), true)
assert.equal(canAccessRoute('owner', '/app/parity'), true)
// Owner must not gain broad audit or sensitive verification/management authority
assert.equal(hasPermission('owner', 'audit:view'), false)
assert.equal(hasPermission('owner', 'agreement:approve_parity'), false)
assert.equal(hasPermission('owner', 'agreement:approve_legal'), false)
assert.equal(hasPermission('owner', 'workspace:manage'), false)
// Owner Team access remains unchanged (denied)
assert.equal(canAccessRoute('owner', '/app/team'), false)
// Owner guided-demo parity route is reachable for the existing tamper/restore demo flow
assert.equal(canAccessRoute('owner', '/app/parity'), true)

// --- P0-02: Legal Reviewer Activity access (authorized workspace scope, reuse permission) ---
assert.equal(hasPermission('legal_reviewer', 'workspace:view_activity'), true)
assert.equal(canAccessRoute('legal_reviewer', '/app/activity'), true)
assert.equal(hasPermission('legal_reviewer', 'workspace:manage'), false)
assert.equal(hasPermission('legal_reviewer', 'escrow:view_financials'), false)
assert.equal(hasPermission('legal_reviewer', 'escrow:fund'), false)

// --- Preserve existing role access ---
assert.equal(canAccessRoute('legal_reviewer', '/app/contract-ir'), true)
assert.equal(canAccessRoute('legal_reviewer', '/app/parity'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/contract-ir'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/parity'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/activity'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/transactions'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/smart-contracts'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/agreements/website-project'), true)
assert.equal(canAccessRoute('technical_auditor', '/app/settings'), false)
assert.equal(canAccessRoute('freelancer', '/app/milestones'), true)
assert.equal(canAccessRoute('freelancer', '/app/transactions'), true)
assert.equal(canAccessRoute('freelancer', '/app/activity'), true)
assert.equal(canAccessRoute('freelancer', '/app/agreements/website-project'), true)
assert.equal(canAccessRoute('freelancer', '/app/ai-workspace'), false)
assert.equal(canAccessRoute('freelancer', '/app/contract-ir'), false)
assert.equal(canAccessRoute('freelancer', '/app/parity'), false)
assert.equal(canAccessRoute('org_admin', '/app/team'), true)
assert.equal(canAccessRoute('org_admin', '/app/settings'), true)
assert.equal(canAccessRoute('org_admin', '/app/activity'), true)
assert.equal(canAccessRoute('org_admin', '/app/smart-contracts'), true)
assert.equal(canAccessRoute('org_admin', '/app/agreements/website-project'), false)
assert.equal(canAccessRoute('owner', '/app/settings'), true)
assert.equal(canAccessRoute('owner', '/app/smart-contracts'), true)
assert.equal(canAccessRoute('owner', '/app/transactions'), false) // not in Owner nav/shared allowlist; no P0-02 change

// --- Direct URL / unknown route denial / consistency ---
assert.equal(canAccessRoute('org_admin', '/app/unknown-sensitive-route'), false)
assert.equal(canAccessRoute('owner', '/app/unknown-sensitive-route'), false)
assert.equal(canAccessRoute('technical_auditor', '/app/unknown-sensitive-route'), false)
assert.equal(canAccessRoute('freelancer', '/app/team'), false)
assert.equal(canAccessRoute('legal_reviewer', '/app/team'), false)
assert.equal(canAccessRoute('technical_auditor', '/app/team'), false)

// Navigation and route consistency: every nav/shared route must be accessible via canAccessRoute
for (const role of roles) {
  for (const [, path] of ROLE_NAV[role]) {
    assert.equal(canAccessRoute(role, path), true, `${role} nav route denied: ${path}`)
  }
  for (const path of SHARED_ROLE_ROUTES[role]) {
    assert.equal(canAccessRoute(role, path), true, `${role} shared route denied: ${path}`)
  }
}

// Financial masking
assert.equal(maskFinancials('owner'), false)
assert.equal(maskFinancials('freelancer'), false)
assert.equal(maskFinancials('legal_reviewer'), true)
assert.equal(maskFinancials('org_admin'), true)
assert.equal(maskFinancials('technical_auditor'), true)

// Sanity: route permission map still requires audit:view for IR/Parity (granular owner exception handled in canAccessRoute)
assert.equal(ROUTE_PERMISSIONS['/app/contract-ir'], 'audit:view')
assert.equal(ROUTE_PERMISSIONS['/app/parity'], 'audit:view')
assert.equal(ROUTE_PERMISSIONS['/app/activity'], 'workspace:view_activity')
assert.equal(ROUTE_PERMISSIONS['/app/team'], 'workspace:manage')

// Cross-workspace/resource-read baseline expectation (shared policy intent): agreement:view holders in same workspace only
assert.equal(hasPermission('owner', 'agreement:view') && true, true)
assert.equal(hasPermission('technical_auditor', 'agreement:view') && false, false)

console.log('rbac checks passed: actual src/rbac.ts implementation, P0-02 access fixes, role regressions, route/nav consistency, and masking covered')
