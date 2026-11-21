# Media provenance and rights inventory

**Purpose:** record what media exists in the repository and what is known about its rights. This is an inventory, **not** a rights grant, license, or attribution claim. Where provenance is unknown, it is marked **UNVERIFIED**. No party is asserted to own these assets.

Inventory confirmed by filesystem glob on 2026-11-21. Do not commit untracked media without owner consent (FRS §8e).

## `public/film/`

| File | Known provenance / license | Status |
|---|---|---|
| `legalx.mp4` | Not recorded in repository docs | **UNVERIFIED** |
| `living-contract.mp4` | Not recorded in repository docs | **UNVERIFIED** |
| `poster.jpg` | Not recorded in repository docs | **UNVERIFIED** |
| `legalx.vtt` | Caption track referencing the film; authorship not recorded | **UNVERIFIED** |
| `legalx.en.vtt` | Caption track referencing the film; authorship not recorded | **UNVERIFIED** |
| `legalx.en.srt` | Caption track referencing the film; authorship not recorded | **UNVERIFIED** |

The README's product-film section references `legalx.mp4`, `poster.jpg`, `legalx.vtt` and `legalx.en.vtt` by their real relative paths. That reference establishes **file existence only**, not rights to distribute.

## `public/noir/`

| File | Known provenance / license | Status |
|---|---|---|
| `living-contract.webp` | Not recorded in repository docs | **UNVERIFIED** |
| `living-contract-day.webp` | Not recorded in repository docs | **UNVERIFIED** |

## `public/fonts/`

| File | Known provenance / license | Status |
|---|---|---|
| `DM-Sans-LICENSE` | License notice shipped alongside the DM Sans font files | **Known — SIL OFL 1.1 notice present** |
| `Instrument-Serif-LICENSE` | License notice shipped alongside the Instrument Serif font files | **Known — SIL OFL 1.1 notice present** |
| `dm-sans-latin-wght-normal.woff2` | Corresponding notice file present | **Known — SIL OFL 1.1 (per shipped notice)** |
| `instrument-serif-latin-400-normal.woff2` | Corresponding notice file present | **Known — SIL OFL 1.1 (per shipped notice)** |
| `instrument-serif-latin-400-italic.woff2` | Corresponding notice file present | **Known — SIL OFL 1.1 (per shipped notice)** |

**Carve-out that must be preserved:** the OFL 1.1 notices in `public/fonts/` must remain with the font files. Fonts are **not** covered by any proposed MIT grant for project code; see [proposed LICENSE](proposed-LICENSE.md).

## Other repository images

| Path | Known provenance / license | Status |
|---|---|---|
| `docs/screenshots/*.png` (8 files) | Product screenshots captured for documentation; rights not separately recorded | **UNVERIFIED** — used only as documentation evidence |

## Rules for contributors

1. Do not assert ownership or a license over any **UNVERIFIED** asset.
2. Do not commit untracked media files without explicit owner consent (FRS §8e).
3. Preserve the font license notices verbatim; do not remove or rewrite them.
4. If a new asset is added, record its source, author, and license in this file at the same time.
5. Product-film references in documentation are descriptive, not a rights claim.

Related reading: [licensing review](LICENSING_REVIEW.md), [proposed LICENSE](proposed-LICENSE.md), [README](../README.md).
