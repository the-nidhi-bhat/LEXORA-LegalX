# Presenter scripts

## Main speaker and operator

The speaker owns the problem, example and closing. The operator owns the disposable workspace and says the actual returned status aloud. If presenting solo, open the homepage, authenticated workspace and API inspector in advance.

## 60-second elevator pitch

A client signs for three payments of ten thousand rupees. An engineer encodes thirty-five thousand as the total. Every individual screen looks plausible. Who catches the five-thousand-rupee difference before approval?

We're LEXORA. LEGALX turns supported agreement terms into fields a lawyer and an engineer can inspect together. Our server compares a version against proposed execution parameters and records which field differs. A Trust Passport lets a second reviewer identify exactly what was checked. A human still has to approve the right version before the application can act.

For PS-03, we want the person signing an agreement to be able to ask one practical question: show me where the implementation agrees with my words.

## Two-minute project summary

Start with the elevator pitch. Then continue:

Let me give you the example we can run today. The client and developer specify mediation. The implementation proposes arbitration. The amount can be correct and this agreement can still be inconsistent. Our Python service compares the supported terms, records the dispute field and links that finding to a particular agreement version. If I change the text later, the old approval cannot silently approve the new hash.

There are two distinct decisions on screen. First, what did the comparison find? Second, who is authorized to act? We demonstrate the difference by leaving the draft unapproved and attempting the off-chain action. Even a favorable finding cannot supply the missing approval.

We use a local deterministic extraction demo and have a separately tested model adapter. A reviewer can reproduce our parity result without relying on a model call. The next challenge is expanding the terms we cover while keeping every finding inspectable.

## Short technical walkthrough

Operator: “This is the signed-in workspace. Here is version one. Both legal fields in this request match the stored values. I'll keep that version fixed, change the dispute procedure and rerun the comparison. Look at dispute_behavior, then compare the returned run ID with the Passport. Now look at the approvals on this draft. A comparison run and a human approval are separate records.”

## Five-minute full pitch

Use the speaker column of the [timed operator script](04_FIVE_MINUTE_DEMO.md), including its 15-second reserve. After the opening, hand off with “Show us which terms the server actually compares.” At the first result, pause and let the operator read the value rather than speaking over the evidence. At the Passport, hand back with “That is the record another reviewer can inspect.” For a solo presentation, leave the final response visible while closing.

## Closing statement

“LEGALX gives the lawyer and the developer a common reference: this agreement, this version, this field, this finding. Before anybody authorizes the next step, both can see exactly what they are agreeing to.”
