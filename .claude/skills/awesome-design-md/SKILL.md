---
name: awesome-design-md
description: >-
  Ready-made design systems in DESIGN.md form, analysed from 84 well-known brands (Apple, Stripe, Linear,
  Notion, Airbnb, Spotify, Vercel, Tesla, Nike…): colour tokens, type scale, spacing, radii, components and
  do/don't rules. Use when the user wants a site, page or app "in the style of" a known brand, asks for a
  ready design system or DESIGN.md to start from, or wants a concrete, coherent visual language instead of
  inventing one.
---

# Awesome DESIGN.md — brand design systems

84 design systems, each a single `designs/<brand>/DESIGN.md`: YAML front matter with tokens (colours,
typography, spacing, radii, shadows) followed by prose on character, components and rules. They are
*inspired interpretations* written for coding agents (source: VoltAgent/awesome-design-md, see `SOURCE.md`).

## How to use

1. **Choose.** If the user named a brand, use `designs/<brand>/DESIGN.md` (folder names are lower-case:
   `apple`, `stripe`, `linear.app`, `notion`…). Otherwise read `INDEX.md` (one line per brand) and propose
   two or three that fit the subject and audience, with one sentence each on why; let the user pick.
2. **Read the whole file** before writing UI. Treat the front-matter tokens as the source of truth and the
   prose as the rules for applying them.
3. **Apply as tokens, not copies.** Put the colours, type scale, spacing and radii into the project's own
   token layer (CSS variables / Tailwind theme) and build components from them. Follow the file's
   do/don't list.
4. **Inspiration only.** Never reproduce a brand's logo, wordmark, product names, photography or copy, and
   do not present the result as that brand. Proprietary fonts (Söhne, SF Pro, Circular…) are not
   available: use the fallback stack the file lists or an open equivalent.

## Persian / RTL projects (this workspace)

- Brand fonts are Latin-only. Set Persian text in a Persian face (the projects here use **Vazirmatn**;
  Lalezar or Nastaliq only for display accents) and keep the brand font, if any, for Latin and numerals
  where that suits.
- Lay out with `dir="rtl"` and logical properties (`ps-`/`pe-`, `start`/`end`); mirror directional icons.
- Persian line height needs to be a little looser than the Latin scale in most files (≈ +0.1–0.2).
- Pair with the `design-taste-frontend` skill for art direction and with `web-design-guidelines` to review
  the result.
