# Five-minute judge demonstration

Prepare two tabs before speaking: the public homepage and a disposable, authenticated local workspace with its API inspector. Run the test in 02 for the mismatch and missing-approval paths beforehand. Use fictitious names. Keep the untouched draft unapproved. Never perform this rehearsal against the public database.

| Time | Presenter dialogue | Operator action and visible checkpoint |
|---|---|---|
| 0:00–0:30 | “Three ₹10,000 milestones. The document says ₹30,000. The proposed implementation says ₹35,000. Which number would you sign off?” | Open /. Show the cinematic story briefly. Label the ₹5,000 difference an illustration. Skip the film. |
| 0:30–1:15 | “Now we’ll use a separate website agreement and run a real comparison.” | Sign in at /sign-in with the isolated owner. Create a draft through /app/agreements or the authenticated API client. Text: website for INR 50,000, 20,000 after design sign-off, 30,000 on delivery. Store governing law India and dispute behavior mediate. Capture the returned id and version 1. |
| 1:15–1:55 | “Contract IR is the field sheet for this version. A reviewer can ask where a number or condition came from.” | Show /app/contract-ir. If the screen shows demo/local IR, disclose it and switch to the real version in the API inspector. Identify currency, milestones and dispute behavior. |
| 1:55–2:45 | “Keep mediation on both sides. What does the server actually find?” | POST /api/v1/agreements/{id}/versions/1/verify with execution_parameters containing dispute_behavior=mediate and governing_law=India. Read actual status, field results and run ID. If a field needs clarification, show it. |
| 2:45–3:20 | “Does matching give me permission to act?” | On the unapproved draft, POST /api/v1/agreements/{id}/execution with the same authorized session and CSRF context. Expected 403 for missing current approvals. Show the reason. |
| 3:20–4:00 | “Keep the amount, the parties and the version fixed. Change mediation to arbitration.” | Repeat verify with dispute_behavior=arbitrate. Expect blocked, dispute_behavior blocking and passed=false. Point at the single changed input. |
| 4:00–4:35 | “A second reviewer can inspect what the system compared.” | GET /api/v1/agreements/{id}/trust-passport?version=1. Match the latest run ID, field finding and input hashes. Avoid displaying session headers. |
| 4:35–4:45 | “For PS-03, generating a candidate is only half the job. LEGALX lets the parties inspect its terms before they authorize the next step.” | End on the finding. Reserve 15 seconds. |

**Interruption cues.** “Is the model deciding?” The comparison is deterministic. “Is this escrow?” The transition is off-chain. “Can you prove enforceability?” The evidence describes consistency between fields.

**Fallback.** If hosted data fails, use the already rehearsed local database. If the local run fails too, switch to the existing evidence images and show the assertions in the parity tests. Say explicitly that you are showing prior evidence. If a live result differs, read it as returned and explain the discrepancy after the demo. [Reproducible paths](../e2e/parity.spec.ts) · [Parity API assertions](../api/tests/test_parity_api.py)
