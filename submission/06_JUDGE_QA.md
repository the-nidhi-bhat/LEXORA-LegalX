# Judge defense

## Difficult questions

**1. Where is the AI?** The guest extraction is deterministic. A server-side Gemini adapter has provider tests. We did not invoke a paid model or verify a public inference endpoint.

**2. Are you actually deploying smart contracts?** The generator can emit Solidity source for supported cases. The demonstrated execution gate records an off-chain database transition. There is no deployed contract address or transaction to show.

**3. How is this different from a document generator?** You can change one execution field, repeat the comparison, and inspect which version and field produced a finding.

**4. Does parity passing mean the agreement is legally enforceable?** It establishes the engine's finding about the supported fields. Capacity, consent, interpretation and remedies still require qualified legal judgment.

**5. Why should lawyers trust the system?** Inspect the source terms, field results, version and hashes. Ask which conditions were outside the schema. The Passport gives a reviewer material to challenge the result.

## Technical and product questions

**6. How does it fit PS-03?** It translates supported inputs into a structured contract representation and candidate code, then makes the translation reviewable.

**7. Why start with milestone agreements?** Payments and review conditions provide concrete fields that judges can inspect within one sitting.

**8. What is Contract IR?** A typed intermediate representation of agreement terms that supports repeatable comparison.

**9. What does canonicalization do?** It normalizes supported representations before computing evidence, so serialization choices do not stand in for a substantive contract change.

**10. What does a hash establish?** It fingerprints a representation for later comparison. It does not establish authorship or the truth of a clause.

**11. Can I change the amount in the live verify request?** The endpoint takes dispute behavior and governing law as clarification inputs. Other values come from the server. The homepage amount mismatch is illustrative.

**12. What creates the live conflict?** Store mediation, then propose arbitration for the same version. Inspect the blocking dispute_behavior finding.

**13. Who owns the comparison?** The Python backend derives the supported data, runs the rules and records the result.

**14. What if terms are missing?** The endpoint can ask for clarification. Show that response rather than filling in an assumption.

**15. What does a Passport contain?** Version and run identifiers, field findings, status and hashes sufficient to identify the evidence.

**16. Does it expose raw text?** The tested Passport response omits raw agreement text and full IR.

**17. Can evidence age?** Yes. Version binding and stale checks help the reviewer spot evidence that no longer describes current inputs.

**18. Who approves?** The configured policy and role permissions determine whose confirmation satisfies an approval. Confirmation binds to the version hash.

**19. Can a browser role switch authorize an API mutation?** No. A backend session supplies identity. The local switcher changes the demonstration view.

**20. What protects workspace boundaries?** Server-side organization-scoped lookups. Cross-workspace agreement and parity requests are tested for 404.

**21. How are writes protected?** Session checks, permissions and CSRF checks apply at the HTTP boundary. Execution adds its own state and approval checks.

**22. What if someone repeats execution?** The handler has idempotency and state checks to control repeated transitions.

**23. Where does data persist?** Server records use the configured SQL database. Browser-local demo state is separate and can disappear with browser storage.

**24. What is Neon doing?** Managed PostgreSQL is the documented deployment store. The public health check in this audit reported database unavailable.

**25. Why FastAPI?** It hosts typed request handling, session enforcement and the parity and execution routes behind a single API boundary.

**26. Why Vercel Services?** It routes the frontend and Python API at one origin, allowing each service to use its own runtime.

**27. Can this handle unlimited load?** No capacity benchmark supports that claim. Measure database latency, concurrent verification and cold starts first.

**28. What limits abuse?** An in-memory limiter constrains attempts per instance. A distributed deployment needs shared enforcement for a fleet-wide limit.

**29. How does it compare with existing approaches?** Templates standardize drafting and manual checklists guide review. This prototype adds deterministic field comparison and version-bound evidence to the handoff.

**30. What is the commercial status?** A hackathon prototype. Security review, operational guarantees and broader legal validation remain before commercial use.

**31. What was built during the hackathon?** The repository contains the review workspace, IR, parity and gate work. Attribute specific contributions using original Git dates and authors. The demo alone cannot date each feature.

**32. What would you add next?** Expand the reviewed clause corpus, measure extraction accuracy and test operational reliability using restricted demonstration accounts.

[Implementation evidence](02_PRODUCT_CAPABILITY_MATRIX.md) · [Observed demo health](07_DEMO_READINESS.md)
