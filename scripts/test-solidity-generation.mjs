import assert from 'node:assert/strict'
import { generateSolidity, runGenerationTests, validateForGeneration } from '../src/solidity.ts'

const baseIr = {
  version: 'v1.0',
  agreement_type: 'freelance_milestone',
  currency: 'INR',
  total_amount: 50000,
  milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }],
  review_period_days: 5,
  dispute_behavior: 'freeze_affected_payment',
  governing_law: null,
  provenance: [],
  agreement_id: 'AGR-WEB-001',
  parties: { client: 'Client', provider: 'FreelanceDeveloper' },
}

// Successful generation (validated + approved)
const ok = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
assert.equal(ok.status, 'success')
assert.match(ok.source, /pragma solidity 0\.8\.24;/)
assert.ok(ok.metadata?.deterministicHash)

// Invalid IR rejection
const invalid = generateSolidity({ ...baseIr, milestones: [{ name: 'Only', amount: 10000 }] }, { validationStatus: 'valid', approved: true })
assert.equal(invalid.status, 'error')
assert.ok(invalid.errors.length > 0)

// Unsupported clause rejection
const unsupported = generateSolidity({ ...baseIr, agreement_type: 'employment' }, { validationStatus: 'valid', approved: true })
assert.equal(unsupported.status, 'error')
assert.ok(unsupported.errors.some(e => /Unsupported|agreement_type/i.test(e)))

// Unapproved IR rejection
const unapproved = generateSolidity(baseIr, { validationStatus: 'valid', approved: false })
assert.equal(unapproved.status, 'error')
assert.ok(unapproved.errors.some(e => /approval/i.test(e)))

// Deterministic
const a = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
const b = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
assert.equal(a.source, b.source)
assert.equal(a.metadata?.deterministicHash, b.metadata?.deterministicHash)

// Automated generation/security contract tests (12 cases)
const results = runGenerationTests(baseIr)
assert.equal(results.status, 'passed', results.summary)
assert.ok(results.cases.length >= 12)
for (const id of ['gen-success','reject-invalid','reject-unsupported','deterministic','milestone-consistency','unauthorized-release','duplicate-prevention','dispute-freeze','approval-required','overpayment','invalid-completion','state-transitions']) {
  assert.ok(results.cases.some(c => c.id === id && c.status === 'passed'), `missing or failed case: ${id}`)
}

console.log('solidity generation tests passed:', results.summary)
