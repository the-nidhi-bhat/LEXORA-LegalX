# LegalX release audit for OpenCode

**Verdict:** The screenshot-free README and conditional frontend are ready to integrate. Hosted authenticated workflows, media redistribution and production promotion have separate gates. This audit used a dedicated release worktree. The checks below did not mutate the backend, deployment configuration, database or another agent’s checkout.

## 1. Reconciliation and revisions

| Reference | Revision reviewed | State at comparison |
| --- | --- | --- |
| Base main | `629a07c1adbee7a12c1f424d76ed9b61b4a2b9d6` | Shared base |
| [PR #3](https://github.com/the-nidhi-bhat/LEXORA-LegalX/pull/3) | `9f18d54f9ac62ac5969cd45ec9c342b143e74ede` | Open against main |
| [PR #4](https://github.com/the-nidhi-bhat/LEXORA-LegalX/pull/4) | `a288dcf018d1eaa76a17388919859db31290e19c` | Open against main at comparison |
| Tested release implementation | `aef0b2e0947dd79d13756da03a2f444c30fc6329` | On `codex/legalx-release-polish`; the following commit adds this report only |

There are **eight overlapping files**. Both current READMEs are screenshot-free. The title of PR #3 describes an older revision.

| File or group | Integration decision |
| --- | --- |
| `README.md` | Keep #4’s concise onboarding, field-specific parity boundaries, API links, map and license statement. Carry forward #3’s explicit Neon target and authentication/security coverage, now incorporated. Retain its useful detailed deployment evidence in the delivery reports. PS-03 is submission context; an event-issued specification is not in the repository. |
| `index.html` | Keep #4’s description, title, type, social image and image alt text, plus one favicon link. Both versions use the same favicon. #3 omits the social image. |
| `public/favicon.svg` and the five files in `public/fonts/` | Byte-identical between the PRs. Keep one copy of the SVG, both license notices and all three WOFF2 files. |
| #3-only evidence | Preserve both `docs/final-delivery/FINAL_MASTER_REPORT.md` and `PHASE_11_DEPLOYMENT.md` in that directory, plus `docs/screenshots/current/EVIDENCE.md` and its ten PNGs. Keep the README free of embeds. Treat deployment/seed observations as timestamped evidence. |
| #4-only frontend | Keep `src/components/FilmHero.tsx`, `src/media.d.ts`, `src/main.tsx`, `src/styles/landing.css`, `public/legalx-social.png`, `docs/MEDIA_PROVENANCE.md`, and the Node type dependency in both package manifests. Keep the public-asset checks and social URL transformation in `vite.config.ts`; reconcile any independent proxy edits in that file separately. |
| Audit follow-up | Keep the README corrections and `src/components/Sculpture.tsx` rendering change at the tested revision above. |

## 2. README and link quality

The README covers Team LEXORA, HackIndia 2026, the jury discrepancy, guest and connected capabilities, Contract IR, Trust Passport, parity, frontend/API/database architecture, Vercel/Neon, the repository directory map, a complete inventory command, installation, environment names, security, tests, contributions and license status.

**23 link occurrences, 20 distinct targets verified**. Relative files existed, the internal heading resolved, and the five loopback URLs returned HTTP 200 with local services running. Removed a GitHub API tree link that returned 404 anonymously; authenticated lookup succeeded, and the inventory command works locally. Both Mermaid blocks actually rendered to SVG in Chromium using Mermaid 11, with eight nodes each. GitHub’s hosted renderer was not separately instrumented.

## 3. Cinematic media and rights gate

| Exact path requiring rights review | Bytes | Purpose |
| --- | ---: | --- |
| `public/film/legalx.mp4` | 3,381,101 | Narrated 63-second film |
| `public/film/legalx.en.vtt` | 1,725 | Current English captions; required with the MP4 for the player |
| `public/film/legalx.en.srt` | 1,400 | Optional external-platform subtitle export |
| `public/film/legalx.vtt` | 903 | Earlier caption track; archival only, unnecessary for narrated playback |
| `public/film/living-contract.mp4` | 586,150 | Muted decorative loop |
| `public/film/poster.jpg` | 75,283 | Film poster, decoded at 960 × 600 |
| `public/noir/living-contract-day.webp` | 240,040 | Light artwork, decoded at 1254 × 1254 |
| `public/noir/living-contract.webp` | 190,282 | Dark artwork, decoded at 1254 × 1254 |

Only commit intended public assets after rights clearance for their incorporated imagery, footage, typography, music, voice and captions. Publish the matching MP4 and English VTT together. These binaries stayed outside the PR. The original local server served the JPEG and WebPs with their correct media types.

The private media-enabled build played on desktop and mobile. Chromium decoded audible signal and 17 English cues, and exercised pause/replay, caption disabling, volume, fullscreen, chapter selection and forward/reverse five-act scrolling. Reduced-motion mode kept the muted hero loop paused. In the clean release build without these files, the interactive sculpture remained visible and selectable. Desktop light and mobile dark captures were visually inspected. No missing-film or noir requests were issued.

## 4. Product mark and metadata

Parsed the favicon as SVG and compared its path with the existing header mark. Desktop and mobile retain the same branded home link and accessible name. The release returned SVG, PNG and WOFF2 media types for the favicon, Open Graph card and DM Sans. Both themes rendered legibly on inspection. The local Open Graph image resolves at `/legalx-social.png`; the Vercel build hook uses the deployment host when supplied. A hosted social crawler preview remains unverified.

## 5. Browser accessibility and responsive checks

Production build, loopback Chromium, 1440 × 900 light and 390 × 900 dark: **30 routes at each width, 60 visits**, with the appropriate demo roles for restricted views. All had visible headings and no measured horizontal overflow. Zero page exceptions, console errors, HTTP error responses or failed requests in this route sweep. Separate Playwright checks covered theme persistence after reload, keyboard focus, mobile menu dismissal with Escape, and scenario selection. Automated homepage WCAG A/AA checks returned zero violations at both tested widths. This is a sampled accessibility check.

The SPA intentionally serves its shell for deep links. An unknown public URL displayed the homepage; an unknown workspace URL displayed the role-boundary screen. There is no dedicated HTTP 404 or “page not found” view. A distinct missing-page experience is a future routing decision.

## 6. Build, performance and regression gates

| Gate | Result |
| --- | --- |
| TypeScript, nine frontend regression scripts, production build | Passed |
| Repository Playwright layout regressions | 2/2 passed |
| Actual route sweep / README diagrams | 60/60 headings visible / 2/2 diagrams rendered |
| Release bundle | Entry 479.85 kB minified, 136.83 kB gzip. Lazy sculpture 539.61 kB minified, 134.86 kB gzip. The 500 kB Vite advisory remains. |
| Lazy-loading behavior | One sculpture chunk request on the homepage and none on a direct workspace load at both widths. The homepage fallback deliberately displays the sculpture immediately. |
| Reduced-motion performance | In an isolated Chromium software-WebGL probe, the motionless hero performed 1,176 indexed draws in a one-second idle interval before the change and **zero** afterward. Chapter selection still drew eight times; enabling motion resumed continuous rendering. |
| Local load sample | Desktop DOMContentLoaded: home 134 ms, workspace 36 ms. Mobile viewport on the same machine: 94 ms and 43 ms. Single local samples, not device benchmarks or field Web Vitals. |

The renderer now schedules frames on visibility, resize, chapter change, pointer input and preference changes. Normal animated mode keeps its continuous loop while visible. The measured improvement is idle GPU work; splitting Three.js into more files solely to silence the byte-size advisory would not establish a download saving.

## 7. Hosted boundary and integration sequence

Anonymous requests to the #4 branch preview and the deployment linked in #3’s delivery report returned **302** for the homepage, favicon and film. Authentication was not bypassed. No hosted browser, media-byte, database or persistence pass is claimed in this audit. #3 separately records earlier authorized deployment smoke evidence and a seed-related sign-in blocker. Neither reviewed Git tree contains a tracked `.vercelignore`; #3’s statement about deployment-time exclusions does not change the independent Git packaging finding.

1. OpenCode should reconcile the eight overlaps using the table above and retain #3’s evidence outside README. Refresh against main if backend work lands first.
2. Retest the integrated preview through authorized access. Verify static MIME types, auth, durable Neon writes, IR/parity evidence, Trust Passport and denied execution before deciding on promotion.
3. The owner decides media redistribution, project-wide licensing and production promotion independently. Keep the working conditional frontend until the media decision is recorded.
