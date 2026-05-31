# Brand

Visual identity of Rozetta itself — distinct from the white-label brands users manage inside the app ([`features/brands.md`](./features/brands.md)).

This file is the source of truth for any decorative surface in the product (auth screens, marketing, empty states, app shell chrome). When something needs a "hero visual," look here first.

---

## 1. Register

Rozetta is a **professional tool for design system teams**. Its visual register matches that audience.

### MUST
- Computational, abstract, geometric. References: Linear, Vercel (Geist), Paper Design, Mercury, Raycast.
- Decorative surfaces SHOULD use **shaders, gradient meshes, dot grids, dithered noise, geometric primitives** — anything that reads as "engineered."
- Color expression happens through **mesh gradients and shaders**, not through illustrated characters or scenes.

### MUST NOT
- No cartoony illustration packs: unDraw, Storyset, Open Peeps, Humaaans, IRA Design, Blush, DrawKit personas.
- No stock 3D character renders or "SaaS-generic" vibes.
- No literal mascots or characters representing the product.

The product's content (tokens, themes, palettes) is already visual material. Decoration should let that visual language speak, not import a foreign one.

---

## 2. Hero shader — `GrainGradient`

The signature visual. Renders via [`@paper-design/shaders-react`](https://github.com/paper-design/shaders) (canonical source: [shaders.paper.design/grain-gradient](https://shaders.paper.design/grain-gradient)).

### Canonical parameters

```ts
{
  colors: ["#7300ff", "#eba8ff", "#00bfff", "#2a00ff"],
  colorBack: "#0a0a0a",
  shape: "corners",
  softness: 0.7,
  intensity: 0.55,
  noise: 0.3,
  speed: 0.35,
}
```

| Param | Value | Why |
|---|---|---|
| `colors` | `#7300ff` violet, `#eba8ff` lavender, `#00bfff` cyan, `#2a00ff` deep blue | Rozetta palette — vibrant but coherent. |
| `colorBack` | `#0a0a0a` near-black | Lets the corner color blooms read against deep negative space. |
| `shape` | `"corners"` | Color blooms anchor to corners, leaving the center calm enough to host content. |
| `softness` | `0.7` | Avoids hard banding, keeps blooms diffuse. |
| `intensity` | `0.55` | Saturated but not aggressive. |
| `noise` | `0.3` | Just enough grain to evoke film/dither, not crunchy. |
| `speed` | `0.35` | Slow enough to feel ambient, not animated. |

### Composition rules
1. Hero MUST fill its container edge-to-edge (no inset cards around the shader).
2. A bottom fade (`bg-gradient-to-t from-black/50 via-transparent to-transparent`) MUST be applied for legibility of overlaid copy.
3. Overlay text floats directly on the gradient — no glassmorphic card around it.

### Hero typography

| Element | Class |
|---|---|
| Headline | `text-2xl font-semibold tracking-tight text-white` |
| Supporting copy | `text-sm leading-6 text-white/75 max-w-md` |

Padding from container edges: `right-12 bottom-12 left-12` (48px).

### Reference implementation
*src/components/auth/auth-hero.tsx*

---

## 3. Where the hero is used

| Surface | Status | Notes |
|---|---|---|
| Login | implemented | Right `<aside>` of `AuthLayout`. |
| Signup | implemented | Same layout as login. |
| Reset password | implemented | Same layout. |
| Marketing landing | planned | When/if a landing page is built, it MUST reuse `AuthHero` (or a variant) as the primary visual. |
| Empty states inside the studio | out of scope | Studio chrome stays neutral. Decoration is reserved for entry/auth surfaces — the studio itself is a workbench. |

---

## 4. Variations

If a future surface needs a different mood, vary `shape` first before changing the palette:

| Shape | Mood | Use for |
|---|---|---|
| `corners` (default) | Anchored, structured | Auth hero, primary marketing |
| `wave` | Flowing, organic | Long-form content backdrops |
| `dots` | Granular, technical | Status / data-heavy pages |
| `truchet` | Patterned, architectural | Documentation hero |
| `ripple` | Concentric, focal | Splash screens, modals |
| `blob` | Soft, organic | Onboarding, celebration moments |

Palette MUST stay within the four canonical colors unless the variation is approved as a brand extension and added to this spec.

---

## 5. Out of scope

- Token-driven shaders (gradient pulls colors from the active brand the user is editing) — interesting idea, deliberately deferred. The Rozetta hero stays Rozetta-branded; user-brand visualization belongs in [`features/brands.md`](./features/brands.md).
- Logo system, favicon, OG images — not yet defined; will be added here when designed.
- Motion design beyond the shader's intrinsic `speed` — no entrance animations, no parallax.

---

## 6. Open questions

- Does the hero need a light-mode variant? Current shader sits well on dark; on light backgrounds the deep blacks dominate. Defer until a light-mode surface actually needs it.
- Should the shader respond to `prefers-reduced-motion`? Probably yes — set `speed={0}` when the media query matches. Implement when motion sensitivity is reported.
