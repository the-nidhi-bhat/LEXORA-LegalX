# Licensing review

**Status: BLOCKED.** No license is asserted, committed, or granted by this repository. This document records blockers for owner decision; it is not legal advice.

## Decision requested

Owner consent is required for all of the following before any license is asserted:

1. Name the **copyright holder** and **year**.
2. Choose the license text and confirm it applies to which parts of the repository.
3. Resolve or explicitly carve out the **film/noir artwork** provenance gap.
4. Preserve the **SIL OFL 1.1** notices for bundled fonts.
5. Consent to committing the media files if a Git-based deployment requires them.

## Blockers

| ID | Blocker | Evidence | Disposition |
|---|---|---|---|
| L-1 | **No copyright holder or year declared** | No `LICENSE` file exists; package metadata declares no rights holder | Proposed text uses explicit placeholders in [proposed LICENSE](proposed-LICENSE.md). No assertion until owner declares. |
| L-2 | **No project license selected or approved** | Repository convention has no active license; README states none is asserted | Proposal-only. Owner decision pending (FRS §8c); status remains **Blocked**. |
| L-3 | **Film media provenance UNVERIFIED** | `public/film/legalx.mp4`, `living-contract.mp4`, `poster.jpg`, `legalx.vtt`, `legalx.en.vtt`, `legalx.en.srt` — origin/rights not recorded | Do not claim rights. See [media provenance](MEDIA_PROVENANCE.md). |
| L-4 | **Noir artwork provenance UNVERIFIED** | `public/noir/living-contract.webp`, `public/noir/living-contract-day.webp` — origin/rights not recorded | Do not claim rights or commit without consent. |
| L-5 | **Fonts are SIL OFL 1.1 with a required carve-out** | `public/fonts/DM-Sans-LICENSE`, `public/fonts/Instrument-Serif-LICENSE`, plus four `.woff2` files | Preserve notices and carve-out verbatim; do not relicense fonts under MIT. |
| L-6 | **Media/font assets are untracked** | Discovery record in `docs/OMEGA_FRS.md` §5.2; media ~4.27 MiB across the asset set | Do not commit media without owner consent (FRS §8e). |
| L-7 | **Owner consent required for license assertion and media commit** | Owner decision Q3/Q5 in `docs/OMEGA_FRS.md` §8 | No assertion, no media commit, until explicit approval. |

## What this workstream did and did not do

- **Did:** draft proposed MIT text with placeholder holder/year in [proposed-LICENSE.md](proposed-LICENSE.md); document every blocker above; record the OFL 1.1 carve-out; keep media provenance explicit in [MEDIA_PROVENANCE.md](MEDIA_PROVENANCE.md).
- **Did not:** create a root `LICENSE`, assert MIT or any license, claim copyright, claim rights over film/noir artwork, relicense fonts, or commit any media file.

## Required next actions (owner)

1. Declare holder + year and confirm the chosen license.
2. Provide provenance or written consent for film/noir assets, or exclude them from the grant.
3. Confirm the OFL 1.1 font carve-out language.
4. Decide whether to commit the media files.

Until all four are resolved, the verdict remains **Blocked**. No active license exists.
