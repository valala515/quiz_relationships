# NewMindStart Quiz — Developer README

This document describes how the quiz works, how it is structured, and the rules that must be kept when editing or extending it.

---

## What this project is

A single-page quiz funnel that:

1. Asks the user questions about their stress, energy, and nervous system
2. Scores their answers
3. Builds a personalised plan
4. Shows a scratch-card discount, then a checkout page

Everything runs in three files: `index.html` (structure), `styles.css` (all visual styles), `app.js` (all logic and rendering). No build tools, no framework — just plain HTML, CSS, and JS.

---

## File structure

```
quiz-1/
├── index.html              # Shell — header, app container, script tags
├── styles.css              # All styles
├── app.js                  # All data, state, and rendering logic
├── paywall.html            # Post-checkout destination
└── assets/                 # All images and the confetti library
    ├── confetti.browser.min.js
    ├── newmindstart-logo.png
    └── [all other PNGs]
```

---

## How the flow works

The quiz has three phases, each stored as a flat array of step objects:

| Phase | Array | Purpose |
|---|---|---|
| Intro | `introSteps` | Gender, age, welcome screen |
| Questions | `questions` | All quiz questions |
| Outro | `outroSteps` | Results, email, plan builder, checkout |

A single `state.stepIndex` integer tracks where the user is. `render()` looks at `stepIndex`, works out which phase it is in, and calls the right render function. Going back decrements `stepIndex` by one.

---

## Question types

| Type | What it looks like |
|---|---|
| `scale` | 5-option rating (Very true → Not true) |
| `choice4` | 4-button grid with icons (Yes / Sometimes / No / Hard to say) |
| `choice4text` | Same grid but with text labels only |
| `choice3icon` | 2–3 button row with icons |
| `multiselect` | Checkboxes, supports a custom free-text option |
| `evidence` | Informational screen, no scoring |
| `gender` | Two image cards (Male / Female) |
| `choice` | Standard age range picker |

---

## Scoring rules

- Every `scale` question answer contributes a score from **0 to 4**.
- `choice4` / `choice3icon` answers also add a fixed value (0, 1, 2, or 4).
- The total score is summed across all answered questions.
- The score determines which **nervous system profile** the user gets (Functional Freeze, Sympathetic Overdrive, etc.) and drives the copy shown on the results and checkout screens.
- Score thresholds live in the `getSurvivalMode()` function in `app.js`.

---

## Pricing and discount logic

There are three plans: **7-Day Trial**, **4-Week Plan**, **12-Week Plan**.

Each plan has two sets of prices:

- **Discounted prices** — shown while the countdown timer is running (timer started when the user reaches the checkout screen after the scratch card)
- **Regular prices** — shown after the timer expires

| | Discounted | Regular |
|---|---|---|
| 7-Day Trial | $6.90 / $0.98 per day | $17.77 / $2.53 per day |
| 4-Week Plan | $15.20 / $0.50 per day | $38.95 / $1.29 per day |
| 12-Week Plan | $41.60 / $0.46 per day | $94.85 / $1.05 per day |

When discounted, each plan card shows:
- Crossed-out original total price (grey) next to the current price on the left
- Crossed-out original daily price (red) to the left of the daily price tag

When expired, only the regular price is shown — no crossed-out prices anywhere.

The timer state lives in `state.checkout.expired`. The `getCheckoutOfferData()` function checks this flag to decide which prices and `originalPrice` / `originalDailyPrice` fields to populate. If a field is `null`, the crossed-out element is not rendered.

---

## Upsell popup rules

- Appears **only** when the user clicks "Get My Plan" while on the **7-Day Trial** or **4-Week Plan**.
- Does **not** appear if the timer has expired (`offer.expired === true`).
- Offers an upgrade to the **12-Week Plan** with the current discounted price.
- "Claim special offer" switches `state.checkout.selectedPlan` to `"extended"` and goes to paywall.
- "No, thanks" goes to paywall with the originally selected plan.
- The modal is injected into `document.body` on click and removed on close — it is never pre-rendered on page load.

---

## Icon rules

Icons on multiselect questions come in two kinds:

1. **SVG icons** — inline SVG rendered by `renderMultiOptionIcon()` — used for all questions except the two redesigned ones.
2. **PNG icons** — `<img>` tags pointing to `assets/` — used for:
   - "Which areas would you most like to strengthen?" (page 36): `relationship.png`, `self-worth.png`, `health.png`, `finances.png`, `wellbeing.png`, `sleep.png`
   - "How would you like to feel more often?" (page 37): `energized.png`, `focused.png`, `calm.png`, `motivated.png`, `appreciated.png`, `balanced.png`, `rested.png`

To swap a SVG icon for a PNG, replace the template string in `renderMultiOptionIcon()` with an `<img>` tag and add a matching size rule in the CSS under `.screen-multiselect--strengthen` or `.screen-multiselect--feelings`.

---

## Layout rules

### Headers
- All question and screen titles: `max-width: 480px`, centred.
- Do not widen beyond `480px` unless explicitly requested.

### Plan option cards
- Each card is a flex row: **[radio + label + prices]** on the left, **[original daily price + chevron + daily tag]** on the right.
- The daily price tag uses an SVG left-pointing chevron (not a CSS border triangle) so it scales smoothly.
- On mobile the row stays horizontal — the daily tag only shrinks font size, it does not stack below the label.

### Checkout comparison arrows
- On desktop: arrows point right (horizontal flow, left card → right card).
- On mobile: arrows rotate 90° pointing down (`transform: rotate(90deg)`) because the cards stack vertically.

### Money-back card
- Has a visible orange-tinted border (`rgba(255, 79, 0, 0.22)`).
- The badge (circle + ribbon SVG) is positioned `absolute`, bottom-right, overflowing the card edge.
- Card has `margin-bottom: 32px` so the overflowing badge does not collide with the next section.

---

## Confetti

Uses **canvas-confetti v1.9.3** saved locally at `assets/confetti.browser.min.js`.

Fires when the scratch-card popup opens (80 ms delay so the modal animation starts first). Two bursts from the bottom-left and bottom-right corners simulate party poppers, with a smaller second wave at 220 ms.

---

## Color tokens

| Role | Value |
|---|---|
| Primary (orange) | `#ff4f00` |
| Primary light | `#ff7233` |
| Dark orange (hover) | `#e04500` |
| Accent | `var(--color-accent)` |
| Body text | `#1f2331` |
| Muted text | `#70778d` |
| Faint text | `#9ba3b8` |
| Card background | `#ffffff` |
| Tag background | `#ecebf3` |
| Page background | `#f5f3ef` (approx) |

Always use the orange family for interactive and highlight elements. Green appears nowhere in this project — the reference screenshots from other apps use green but our brand colour is orange.

---

## Fonts

| Role | Font |
|---|---|
| Display / titles | Lora (serif, loaded from Google Fonts) |
| UI / body | Satoshi (loaded from Fontshare) |

`--font-display` = Lora, `--font-ui` = Satoshi. Use `font-family: var(--font-display)` for section headings and `var(--font-ui)` for body copy, buttons, and labels.

---

## Rules summary (quick reference)

1. **Never pre-render modals** — inject them on demand, remove on close.
2. **Keep the row layout on mobile** for plan cards — shrink, don't stack.
3. **Rotate comparison arrows 90° on mobile** — not on desktop.
4. **Crossed-out prices are null when the timer expires** — check `offer.expired` before rendering any strikethrough element.
5. **PNG icons replace SVG icons** in the two multiselect questions (strengthen + feel) — do not mix SVG back in unless explicitly requested.
6. **Headers max-width 480px, centred** across all screens.
7. **Orange only** — never introduce green or other brand colours from external references.
8. **No build tools** — all changes go directly into `app.js` and `styles.css`.
