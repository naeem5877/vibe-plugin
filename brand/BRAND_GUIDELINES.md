# Vibe — Logo Guidelines (Compact)

Brand identity specifications for **VibeDownloader** across Desktop, Android, and NLE Extensions (Adobe Premiere Pro & DaVinci Resolve).

---

## 1. The Logo
- **Core Concept**: An unbroken kinetic ribbon that sweeps down the V, loops across the top, and plunges straight into the vertex as an import/download arrow into the project timeline.
- **Mark Type**: Monogram / Letterform (V) + Kinetic Downward Vector.
- **Available Variants**:
  - `dist/vibe-symbol.svg`: Master geometric symbol (256×256 canvas).
  - `dist/vibe-symbol-small.svg`: Optical micro cut optimized for 16–32 px sizes (favicons, toolbar, NLE sidebar rail).
  - `dist/vibe-lockup-horizontal.svg`: Master horizontal lockup with custom geometric vector wordmark (768×256 canvas).
  - `dist/vibe-lockup-stacked.svg`: Square stacked lockup for splash screens, badges, and social media (384×384 canvas).

---

## 2. Clear Space
Keep a clear zone of **1 × X** around the mark on all sides, where **X** equals the stroke width of the outer ribbon (approx. 1/8th of the mark's height). No text, borders, or interface elements should intrude into this boundary.

---

## 3. Minimum Sizes
| Version | Digital / Screens | Print | Notes |
|---|---|---|---|
| Horizontal Lockup | 120 px width | 30 mm width | Keeps wordmark crisp and readable |
| Stacked Lockup | 64 px height | 20 mm height | Ideal for splash and dialogs |
| Master Symbol | 32 px | 10 mm | Use standard master |
| Micro Symbol | 16 px | 5 mm | Use `vibe-symbol-small.svg` or `vibe-symbol-favicon.svg` |

---

## 4. Official Color Palette
| Swatch | Name | HEX | RGB | Use Case |
|---|---|---|---|---|
| 🟢 | **Vibe Mint** (Primary Accent) | `#34D399` | `rgb(52, 211, 153)` | Primary brand color, interactive elements, highlights |
| 🟢 | **Vibe Mint Light** | `#6EE7B7` | `rgb(110, 231, 183)` | Glows, active states, NLE rail icon |
| 🔵 | **Electric Cyan** (Secondary) | `#38BDF8` | `rgb(56, 189, 248)` | Gradients, multi-platform accent |
| ⬛ | **Obsidian Base** | `#090D0C` | `rgb(9, 13, 12)` | NLE extension background, dark mode surfaces |
| ⬛ | **Surface Charcoal** | `#141C1A` | `rgb(20, 28, 26)` | Cards, input fields, button containers |
| ⬜ | **Pure White** | `#FFFFFF` | `rgb(255, 255, 255)` | High-contrast monochrome reversed version |

---

## 5. Approved Background Pairings
- **NLE Dark Mode (Recommended)**: Vibe Mint (`#34D399` / `#6EE7B7`) or Pure White on `#090D0C` / `#0B100F`.
- **Light Surfaces / Documentation**: Black (`#000000`) or Vibe Mint on White.
- **Mobile & Desktop App Icons**: Vibe Mint mark centered on dark rounded tile (`#090D0C`).

---

## 6. Typography
- **Wordmark**: Custom geometric vector letterforms built with unified stroke weights matching the 60° symbol angles (no installed font dependency).
- **Interface & Body**: `Inter`, `-apple-system`, `"Segoe UI"`, system-ui, sans-serif.

---

## 7. Rules & Misuse (Don'ts)
- ❌ **Do not distort**: Never stretch, squeeze, or alter the 60° equilateral proportions.
- ❌ **Do not apply skeuomorphic 3D filters**: Avoid heavy Photoshop embosses, chrome bevels, or drop-shadows that destroy vector purity.
- ❌ **Do not rearrange lockup elements**: Do not move the arrow outside the V or detach the wordmark letters.
- ❌ **Do not use non-brand colors**: Maintain the signature mint, cyan, white, and obsidian palette.
