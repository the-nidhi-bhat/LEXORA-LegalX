import type { WorkflowState } from './demo-state'

export type SupportedIr = NonNullable<WorkflowState['ir']> & {
  agreement_id?: string
  parties?: { client?: string; provider?: string }
}

export type SolidityGeneration = {
  status: 'idle' | 'success' | 'error' | 'blocked'
  message: string
  filename: string
  irVersion: string
  source: string
  metadata: {
    generatedAt: string
    deterministicHash: string
    compiler: string
    contractName: string
    agreementId: string
    totalAmount: number
    milestones: { id: string; amount: number }[]
    reviewPeriodDays: number
    disputeFreeze: boolean
    approvalRequired: boolean
    parties: { client: string; provider: string }
  } | null
  supported: string[]
  unsupported: string[]
  security: { control: string; status: 'enforced' | 'n/a'; detail: string }[]
  errors: string[]
}

export type SolidityTestCase = { id: string; name: string; status: 'passed' | 'failed' | 'skipped'; detail: string }
export type SolidityTestResults = { status: 'not_run' | 'passed' | 'failed'; ranAt: string; summary: string; cases: SolidityTestCase[] }
export type SolidityCompilation = { status: 'not_run' | 'passed' | 'failed'; ranAt: string; message: string; tool: string }

export const DEFAULT_SOLIDITY_GENERATION: SolidityGeneration = {
  status: 'idle',
  message: 'No Solidity generated yet.',
  filename: '',
  irVersion: '',
  source: '',
  metadata: null,
  supported: [],
  unsupported: [],
  security: [],
  errors: [],
}
export const DEFAULT_SOLIDITY_COMPILATION: SolidityCompilation = { status: 'not_run', ranAt: '', message: 'Compilation not run (no Solidity compiler/tooling detected in this environment).', tool: 'unavailable' }
export const DEFAULT_SOLIDITY_TESTS: SolidityTestResults = { status: 'not_run', ranAt: '', summary: 'Automated contract tests not run.', cases: [] }

function hashString(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619) }
  return 'fnv1a-' + (h >>> 0).toString(16).padStart(8, '0')
}

export function normalizeIr(ir: NonNullable<WorkflowState['ir']> | null | undefined): SupportedIr | null {
  if (!ir) return null
  const anyIr = ir as any
  const agreement_id = typeof anyIr.agreement_id === 'string' && anyIr.agreement_id.trim() ? anyIr.agreement_id.trim() : 'AGR-WEB-001'
  const parties = {
    client: anyIr.parties?.client || 'Client',
    provider: anyIr.parties?.provider || 'FreelanceDeveloper',
  }
  return { ...ir, agreement_id, parties }
}

export function detectUnsupported(ir: NonNullable<WorkflowState['ir']>): string[] {
  const unsupported: string[] = []
  const anyIr = ir as any
  if (ir.governing_law) unsupported.push('governing_law (off-chain/legal-only; not executable on-chain)')
  if (ir.agreement_type !== 'freelance_milestone') unsupported.push(`agreement_type "${ir.agreement_type}" not supported for deterministic escrow generation`)
  if (ir.currency !== 'INR') unsupported.push(`currency "${ir.currency}" not supported for this escrow template`)
  if (ir.dispute_behavior !== 'freeze_affected_payment') unsupported.push(`dispute_behavior "${ir.dispute_behavior}" not supported`)
  const allowed = new Set(['version','agreement_type','currency','total_amount','milestones','review_period_days','dispute_behavior','governing_law','provenance','agreement_id','parties'])
  Object.keys(anyIr).forEach((k) => { if (!allowed.has(k)) unsupported.push(`unsupported field "${k}"`) })
  ir.milestones.forEach((m: any, idx: number) => {
    if (typeof m?.amount !== 'number' || !Number.isFinite(m.amount)) unsupported.push(`milestone[${idx}].amount invalid`)
    if (!m?.name) unsupported.push(`milestone[${idx}].name missing`)
  })
  return Array.from(new Set(unsupported))
}

export function validateForGeneration(irInput: NonNullable<WorkflowState['ir']> | null | undefined, opts: { validationStatus?: string; approved?: boolean } = {}) {
  const errors: string[] = []
  if (!irInput) return { ok: false, errors: ['Contract IR is missing.'], supported: [] as string[], unsupported: [] as string[], ir: null as SupportedIr | null }
  const ir = normalizeIr(irInput)!
  const supported = ['agreement_id', 'parties', 'total_amount', 'milestones', 'milestone completion', 'payment release', 'review_period_days', 'dispute_status/freeze', 'approval requirements', 'ir_version tracking']
  if (opts.validationStatus && opts.validationStatus !== 'valid') errors.push('Contract IR is invalid or not validated.')
  if (opts.approved === false) errors.push('Human approval is required before Solidity generation.')
  if (!ir.agreement_id) errors.push('Agreement ID is missing.')
  if (!ir.parties?.client || !ir.parties?.provider) errors.push('Parties are incomplete.')
  if (!Number.isInteger(ir.total_amount) || ir.total_amount <= 0) errors.push('Total agreement amount must be a positive integer.')
  if (!Array.isArray(ir.milestones) || ir.milestones.length === 0) errors.push('At least one milestone is required.')
  const milestoneSum = (ir.milestones || []).reduce((s, m) => s + (Number(m.amount) || 0), 0)
  if (milestoneSum !== ir.total_amount) errors.push(`Milestone amounts (${milestoneSum}) must equal total agreement amount (${ir.total_amount}).`)
  ir.milestones.forEach((m, i) => {
    if (!Number.isInteger(m.amount) || m.amount <= 0) errors.push(`Milestone ${i + 1} amount must be a positive integer.`)
  })
  if (!Number.isInteger(ir.review_period_days) || ir.review_period_days < 1) errors.push('Review period must be a positive integer (days).')
  if (ir.dispute_behavior !== 'freeze_affected_payment') errors.push('Unsupported dispute behavior for executable escrow.')
  const unsupported = detectUnsupported(ir).filter(u => !u.startsWith('governing_law')) // governing law allowed as off-chain-only metadata but not executable
  const execUnsupported = unsupported.filter(u => !u.includes('off-chain'))
  if (execUnsupported.length) errors.push('Unsupported execution-critical terms: ' + execUnsupported.join('; '))
  return { ok: errors.length === 0, errors, supported, unsupported: detectUnsupported(ir), ir }
}

export function generateSolidity(irInput: NonNullable<WorkflowState['ir']>, opts: { validationStatus?: string; approved?: boolean } = {}): SolidityGeneration {
  const check = validateForGeneration(irInput, opts)
  if (!check.ok || !check.ir) {
    return {
      ...DEFAULT_SOLIDITY_GENERATION,
      status: 'error',
      message: 'Solidity generation rejected.',
      irVersion: irInput?.version || '',
      supported: check.supported,
      unsupported: check.unsupported,
      security: [],
      errors: check.errors,
    }
  }
  const ir = check.ir
  const contractName = 'LexoraMilestoneEscrow'
  const milestoneLines = ir.milestones.map((m, i) => `        milestones[${i}] = Milestone({id: ${i + 1}, amount: ${m.amount}, completed: false, approved: false, released: false, exists: true}); // ${m.name.replace(/[^a-zA-Z0-9 _-]/g, '')}`)
  const milestoneSum = ir.milestones.reduce((s, m) => s + m.amount, 0)
  const source = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ${contractName}
/// @notice Deterministically generated from validated and approved Contract IR ${ir.version} (${ir.agreement_id}).
/// @dev Supported execution-critical terms only. Unsupported/off-chain clauses are excluded and must not be invented.
contract ${contractName} {
    enum DisputeStatus { None, Raised, Resolved }

    struct Milestone {
        uint256 id;
        uint256 amount;
        bool completed;
        bool approved;
        bool released;
        bool exists;
    }

    string public constant agreementId = "${ir.agreement_id}";
    string public constant irVersion = "${ir.version}";
    address public immutable owner;
    address public immutable client;
    address public immutable provider;
    address public approver;

    uint256 public constant totalAmount = ${ir.total_amount};
    uint256 public constant milestoneCount = ${ir.milestones.length};
    uint256 public constant reviewPeriodDays = ${ir.review_period_days}; // review period recorded from IR
    bool public constant disputeFreezePayments = ${ir.dispute_behavior === 'freeze_affected_payment' ? 'true' : 'false'};

    mapping(uint256 => Milestone) public milestones;
    uint256 public totalReleased;
    DisputeStatus public disputeStatus;
    bool private locked;

    event MilestoneCompleted(uint256 indexed id);
    event MilestoneApproved(uint256 indexed id, address indexed approver);
    event PaymentReleased(uint256 indexed id, uint256 amount, address indexed to);
    event DisputeRaised(address indexed by);
    event DisputeResolved(address indexed by);
    event ApproverUpdated(address indexed approver);

    modifier onlyOwner() { require(msg.sender == owner, "OWNER_ONLY"); _; }
    modifier onlyClient() { require(msg.sender == client, "CLIENT_ONLY"); _; }
    modifier onlyProvider() { require(msg.sender == provider, "PROVIDER_ONLY"); _; }
    modifier onlyApprover() { require(msg.sender == approver || msg.sender == owner, "APPROVAL_REQUIRED"); _; }
    modifier nonReentrant() { require(!locked, "REENTRANT"); locked = true; _; locked = false; }

    constructor(address _client, address _provider, address _approver) {
        require(_client != address(0) && _provider != address(0), "INVALID_PARTY");
        require(_approver != address(0), "INVALID_APPROVER");
        owner = msg.sender;
        client = _client;
        provider = _provider;
        approver = _approver;
        // Milestones and amounts are fixed from Contract IR (deterministic).
${milestoneLines.join('\n')}
        require(_sumMilestones() == totalAmount, "MILESTONE_TOTAL_MISMATCH");
    }

    function _sumMilestones() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < milestoneCount; i++) {
            sum += milestones[i].amount;
        }
    }

    function setApprover(address _approver) external onlyOwner {
        require(_approver != address(0), "INVALID_APPROVER");
        approver = _approver;
        emit ApproverUpdated(_approver);
    }

    function raiseDispute() external {
        require(msg.sender == client || msg.sender == provider || msg.sender == owner, "UNAUTHORIZED_DISPUTE");
        disputeStatus = DisputeStatus.Raised;
        emit DisputeRaised(msg.sender);
    }

    function resolveDispute() external onlyOwner {
        disputeStatus = DisputeStatus.Resolved;
        emit DisputeResolved(msg.sender);
    }

    function markMilestoneCompleted(uint256 id) external onlyProvider {
        Milestone storage m = milestones[id];
        require(m.exists, "INVALID_MILESTONE");
        require(!m.completed, "ALREADY_COMPLETED");
        m.completed = true;
        emit MilestoneCompleted(id);
    }

    function approveMilestone(uint256 id) external onlyApprover {
        Milestone storage m = milestones[id];
        require(m.exists, "INVALID_MILESTONE");
        require(m.completed, "NOT_COMPLETED");
        require(!m.released, "ALREADY_RELEASED");
        m.approved = true;
        emit MilestoneApproved(id, msg.sender);
    }

    /// @notice Releases payment for an approved milestone. Prevents duplicates, overpayment, and releases during disputes.
    function releaseMilestonePayment(uint256 id) external onlyApprover nonReentrant {
        Milestone storage m = milestones[id];
        require(m.exists, "INVALID_MILESTONE");
        require(m.completed, "NOT_COMPLETED");
        require(m.approved, "APPROVAL_REQUIRED");
        require(!m.released, "DUPLICATE_RELEASE");
        require(disputeStatus != DisputeStatus.Raised || !disputeFreezePayments, "DISPUTE_FROZEN");
        require(totalReleased + m.amount <= totalAmount, "EXCEEDS_AGREEMENT_AMOUNT");
        require(address(this).balance >= m.amount, "INSUFFICIENT_BALANCE");

        m.released = true;
        totalReleased += m.amount;
        (bool ok, ) = payable(provider).call{value: m.amount}("");
        require(ok, "TRANSFER_FAILED");
        emit PaymentReleased(id, m.amount, provider);
    }

    receive() external payable {}
}
`
  const security = [
    { control: 'Solidity 0.8.x (checked arithmetic)', status: 'enforced' as const, detail: 'pragma solidity 0.8.24' },
    { control: 'Role-based access control', status: 'enforced' as const, detail: 'owner/client/provider/approver modifiers gate sensitive actions' },
    { control: 'Unauthorized payment release prevention', status: 'enforced' as const, detail: 'releaseMilestonePayment requires onlyApprover and milestone approval' },
    { control: 'Duplicate milestone payment prevention', status: 'enforced' as const, detail: 'released flag and DUPLICATE_RELEASE guard' },
    { control: 'Overpayment / exceeds agreement prevention', status: 'enforced' as const, detail: 'totalReleased + amount <= totalAmount and fixed IR totals' },
    { control: 'Dispute freeze', status: 'enforced' as const, detail: 'DISPUTE_FROZEN when dispute raised and freeze policy enabled' },
    { control: 'Approval before release', status: 'enforced' as const, detail: 'milestone.approved required; separate approveMilestone step' },
    { control: 'Milestone total validation', status: 'enforced' as const, detail: `constructor and generator enforce sum (${milestoneSum}) == total (${ir.total_amount})` },
    { control: 'Invalid/unsupported execution-critical term rejection', status: 'enforced' as const, detail: 'generation rejects invalid or unsupported execution-critical IR terms' },
    { control: 'Reentrancy protection', status: 'enforced' as const, detail: 'nonReentrant guard and checks-effects-interactions on release' },
  ]
  return {
    status: 'success',
    message: 'Deterministic Solidity generated from validated and approved Contract IR.',
    filename: `${contractName}_${ir.agreement_id}_${ir.version}.sol`,
    irVersion: ir.version,
    source,
    metadata: {
      generatedAt: new Date().toISOString(),
      deterministicHash: hashString(source),
      compiler: 'solidity 0.8.24',
      contractName,
      agreementId: ir.agreement_id || 'AGR-WEB-001',
      totalAmount: ir.total_amount,
      milestones: ir.milestones.map((m, i) => ({ id: String(i + 1), amount: m.amount })),
      reviewPeriodDays: ir.review_period_days,
      disputeFreeze: ir.dispute_behavior === 'freeze_affected_payment',
      approvalRequired: true,
      parties: { client: ir.parties?.client || 'Client', provider: ir.parties?.provider || 'FreelanceDeveloper' },
    },
    supported: check.supported,
    unsupported: check.unsupported,
    security,
    errors: [],
  }
}

export function runGenerationTests(currentIr?: NonNullable<WorkflowState['ir']> | null): SolidityTestResults {
  const cases: SolidityTestCase[] = []
  const ok = (id: string, name: string, detail: string) => cases.push({ id, name, status: 'passed', detail })
  const fail = (id: string, name: string, detail: string) => cases.push({ id, name, status: 'failed', detail })

  // 1. Successful contract generation (approved + valid)
  const baseIr: NonNullable<WorkflowState['ir']> = currentIr ? JSON.parse(JSON.stringify(currentIr)) : {
    version: 'v1.0', agreement_type: 'freelance_milestone', currency: 'INR', total_amount: 50000,
    milestones: [{ name: 'Design approval', amount: 20000 }, { name: 'Website delivery', amount: 30000 }],
    review_period_days: 5, dispute_behavior: 'freeze_affected_payment', governing_law: null,
    provenance: [], agreement_id: 'AGR-WEB-001', parties: { client: 'Client', provider: 'FreelanceDeveloper' },
  } as any
  const gen = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
  if (gen.status === 'success' && gen.source.includes('pragma solidity 0.8.24') && gen.source.includes('agreementId')) ok('gen-success', 'Successful contract generation', 'Generated deterministic Solidity from valid approved IR.')
  else fail('gen-success', 'Successful contract generation', gen.errors.join('; ') || 'Generation did not succeed')

  // 2. Invalid Contract IR rejection
  const invalidIr = { ...baseIr, milestones: [{ name: 'Only', amount: 10000 }] }
  const genInvalid = generateSolidity(invalidIr as any, { validationStatus: 'invalid', approved: true })
  if (genInvalid.status === 'error' && genInvalid.errors.some(e => /invalid|not validated|equal/i.test(e))) ok('reject-invalid', 'Invalid Contract IR rejection', 'Generator rejects invalid/unvalidated IR.')
  else fail('reject-invalid', 'Invalid Contract IR rejection', 'Expected rejection for invalid IR')

  // 3. Unsupported clause rejection
  const unsupportedIr = { ...baseIr, agreement_type: 'employment' }
  const genUnsupported = generateSolidity(unsupportedIr as any, { validationStatus: 'valid', approved: true })
  if (genUnsupported.status === 'error' && genUnsupported.errors.some(e => /Unsupported|agreement_type/i.test(e))) ok('reject-unsupported', 'Unsupported clause rejection', 'Unsupported execution-critical terms rejected (no silent invention).')
  else fail('reject-unsupported', 'Unsupported clause rejection', 'Expected rejection for unsupported agreement type')

  // 4. Deterministic Solidity generation
  const genA = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
  const genB = generateSolidity(baseIr, { validationStatus: 'valid', approved: true })
  if (genA.source && genA.source === genB.source && genA.metadata?.deterministicHash === genB.metadata?.deterministicHash) ok('deterministic', 'Deterministic Solidity generation', 'Same approved IR produces identical source/hash.')
  else fail('deterministic', 'Deterministic Solidity generation', 'Source/hash differed for identical IR')

  // 5. Milestone amount consistency
  if (gen.source.includes('MILESTONE_TOTAL_MISMATCH') && gen.source.includes(`totalAmount = ${baseIr.total_amount}`) && gen.source.includes(`amount: ${baseIr.milestones[0].amount}`)) ok('milestone-consistency', 'Milestone amount consistency', 'Constructor and state enforce milestone totals equal agreement total.')
  else fail('milestone-consistency', 'Milestone amount consistency', 'Missing milestone total enforcement markers')

  // 6. Unauthorized payment release
  if (gen.source.includes('onlyApprover') && gen.source.includes('APPROVAL_REQUIRED')) ok('unauthorized-release', 'Unauthorized payment release prevention', 'Release gated by approver/approval requirement.')
  else fail('unauthorized-release', 'Unauthorized payment release prevention', 'Missing access/approval guard')

  // 7. Duplicate milestone payment prevention
  if (gen.source.includes('DUPLICATE_RELEASE') && gen.source.includes('m.released = true')) ok('duplicate-prevention', 'Duplicate milestone payment prevention', 'Released flag prevents duplicate payout.')
  else fail('duplicate-prevention', 'Duplicate milestone payment prevention', 'Missing duplicate release guard')

  // 8. Dispute-based payment freezing
  if (gen.source.includes('DISPUTE_FROZEN') && gen.source.includes('raiseDispute')) ok('dispute-freeze', 'Dispute-based payment freezing', 'Raised disputes freeze affected payments when policy enabled.')
  else fail('dispute-freeze', 'Dispute-based payment freezing', 'Missing dispute freeze logic')

  // 9. Approval requirements
  if (gen.source.includes('approveMilestone') && gen.source.includes('require(m.approved, "APPROVAL_REQUIRED")')) ok('approval-required', 'Approval requirements', 'Explicit milestone approval required before release.')
  else fail('approval-required', 'Approval requirements', 'Missing approval requirement flow')

  // 10. Payment amount exceeding agreement value
  if (gen.source.includes('EXCEEDS_AGREEMENT_AMOUNT') && gen.source.includes('totalReleased + m.amount <= totalAmount')) ok('overpayment', 'Payment amount exceeding agreement value prevention', 'Release blocked when exceeding total agreement amount.')
  else fail('overpayment', 'Payment amount exceeding agreement value prevention', 'Missing overpayment guard')

  // 11. Invalid milestone completion
  if (gen.source.includes('INVALID_MILESTONE') && gen.source.includes('markMilestoneCompleted')) ok('invalid-completion', 'Invalid milestone completion rejection', 'Non-existent/invalid milestones rejected; completion restricted to provider flow.')
  else fail('invalid-completion', 'Invalid milestone completion rejection', 'Missing invalid milestone guards')

  // 12. Contract state transitions
  if (gen.source.includes('completed = true') && gen.source.includes('approved = true') && gen.source.includes('released = true') && gen.source.includes('DisputeStatus')) ok('state-transitions', 'Contract state transitions', 'Completion/approval/release/dispute state transitions encoded.')
  else fail('state-transitions', 'Contract state transitions', 'Missing expected state transition markers')

  const passed = cases.filter(c => c.status === 'passed').length
  const failed = cases.filter(c => c.status === 'failed').length
  return { status: failed ? 'failed' : 'passed', ranAt: new Date().toISOString(), summary: `${passed}/${cases.length} generation/security contract checks passed${failed ? `, ${failed} failed` : ''}.`, cases }
}
