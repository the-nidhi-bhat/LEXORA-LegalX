# Judge-access rehearsal • 22 November 2026

Source checkpoint `259e33a365788defdcf327dc8f84bca000f11a61`. GitHub reported the repository public. [Repository](https://github.com/the-nidhi-bhat/LEXORA-LegalX)

| Probe | Observed result |
|---|---|
| Public homepage | HTTP 200 HTML. Chromium showed “The living contract.” |
| Desktop 1440 px and phone 390 px | Home, /demo, /app/contract-ir and /app/parity rendered their corresponding headings. No document-level horizontal overflow at those widths. Guest navigation alone cannot verify authenticated data. |
| Sign-in | /login renders the homepage. Chromium confirmed /sign-in renders ?Sign in to your workspace.? No credential submitted to production. |
| Backend GET /api/health | Returned status ok, version unknown, **db unavailable**. The database-backed judge workflow is blocked on this alias until a fresh health check and isolated account rehearsal succeed. |
| Public media | HEAD returned 200 video/mp4 for /film/legalx.mp4, 200 font/woff2 for the DM Sans variable font and 200 image/svg+xml for /favicon.svg. Headers alone do not establish complete playback. |
| Previously documented preview | Unauthenticated requests redirected (302). Owner must provide organizer-approved judge access or a working public demo. Never hand out a protection bypass token. |
| Deployment identity | Public alias reachable. Health does not identify its build commit. Source SHA and deployed SHA must be checked separately in the owner's Vercel dashboard. |

[Public frontend](https://lexora-legalx.vercel.app/) · [Health](https://lexora-legalx.vercel.app/api/health) · [Prior preview record](../docs/final-delivery/PHASE_11_DEPLOYMENT.md)

Before presenting, open a clean browser, test the link as a judge, and confirm database health. Rehearse authenticated writes only in a disposable database with a restricted demo account. Keep private account details outside the deck and repository.

Latest main rechecked before PR creation: e1beead664d17c69e669bcb2e12fdd261394c68f.
