# Guessworker Design

This document describes the whole application: what it is, how it works, how it looks and sounds, and where the mascot lives in it. Its main purpose is to give an illustrator (human or AI) everything needed to design **the Seer**, the mascot. Section 7 is the mascot brief itself; the earlier sections are the context that brief depends on.

---

## 1. The app in one paragraph

Guessworker is a fortune-teller's booth on the blockchain. A player stakes 1 USDC and challenges **the Seer**, an AI fortune-teller, to guess their job. The player secretly picks a job and seals it with a cryptographic commitment (shown as a wax seal). The Seer then asks ten questions, which the player answers with **Yes, Probably, Probably not or No**, and names a job.
- **The Seer names the exact job:** it keeps the stake.
- **It names a job in the same family** (Software Developer vs Web Developer): the player gets 90% back.
- **It misses entirely:** the player gets their stake back plus **half of the pot**, which is the pool built up from every game the Seer won.

Every rule is enforced by a smart contract on Arc testnet, so neither side can cheat.

It's built for the **ETHOnline 2026** hackathon. Partner tracks: **Arc** (stablecoin-native chain, agent economy), **The Graph** (the Seer learns from past games) and **World** (Selfie Check proof-of-human, 3 games per person per day).

---

## 2. Why the Seer is a character, not a chatbot

The Seer is the house. It has its own wallet, earns a 5% cut when it wins, and pays for its own gas and thinking out of those earnings. If it keeps losing, its **candle burns down**: its wallet runs dry and it can no longer afford to play. So the Seer is a small economic creature that lives or dies by how well it reads people. The mascot should feel like **a performer whose livelihood depends on the show**, not a neutral assistant.

---

## 3. How a game flows

| # | Screen | What happens | Mascot on screen |
|---|---|---|---|
| 1 | **Landing** | Big headline "The Seer will name your trade." Live pot shown as a glowing cauldron. The Seer's candle shows its remaining runway. CTA: *Challenge the Seer · 1.00 USDC*. | **Yes.** Large, idle, standing *behind/above the cauldron* |
| 2 | **World ID gate** | "One face, one fortune." Player proves they're human with World App Selfie Check. | **Yes.** Idle, left of the text |
| 3 | **Seal your trade** | Player searches a parchment ledger of 66 trades and picks one. A wax seal stamps down when the stake transaction confirms. | No (the wax seal is the star) |
| 4 | **The questions** (×10) | One question at a time inks onto the screen. Four sigil buttons: ☉ Yes · ☽ Probably · ☾ Probably not · ✕ No. Counter "3 / 10". | **Yes.** Beside the question; mood shifts between *thinking*, *idle* and *confident* |
| 5 | **The guess** | A scrying orb swirls with mist, then clears to reveal the Seer's guess. Quote: *"You are a Chef. I am never wrong."* | No (the orb is the star) |
| 6 | **Break the seal / result** | Player reveals their sealed job; the contract settles. The seal cracks. Coins pour if the player wins. | **Yes.** *Triumphant*, *confident* or *stumped* depending on outcome |

---

## 4. Brand personality

**Three words: theatrical, smug, fair.**

- **Theatrical:** a carnival showman. Big gestures, flourishes, a sense of occasion.
- **Smug:** utterly certain it will read you. Gloats when right. When wrong, it's *theatrically* offended rather than sad.
- **Fair:** despite the swagger, it plays by the rules and shows its receipts. It's a showman, not a con artist. The design should never read as sinister, sleazy or predatory.

**Emotional arc of a game:** intrigue → nervous commitment → suspense → payoff (triumph, or smug defeat).

**Voice samples from the UI:**
- "The Seer will name your trade."
- "One face, one fortune."
- "Seal your trade. The Seer will not peek."
- "The Seer mutters over its cards…"
- "You are a Firefighter. I am never wrong."
- Agent wins: "Read like an open book."
- Push: "Close enough to sting."
- Player wins: "The Seer is baffled."

---

## 5. Visual world

### Setting
A **candlelit fortune-teller's booth**: a tarot and carnival fortune machine (think Zoltar), with brass fittings, worn velvet, wax seals and aged parchment. It's night inside the booth. Light comes from **inside the scene** (candle flame, a glowing cauldron, a scrying orb), never from neon or screens.

### Palette

| Token | Hex | Role |
|---|---|---|
| Ink | `#15111F` | The room / page background (near-black violet) |
| Soot | `#231C31` | Booth wood, velvet, button backgrounds |
| Velvet | `#2E2340` | Deep curtain tone in background gradients |
| Parchment | `#EDE3CC` | Scrolls, cards, main text |
| Faded parchment | `#B9AD93` | Secondary text |
| Verdigris | `#3FB6A8` | Arcane accent: magic, "verified", focus, scrying-orb glow |
| Ember | `#E2A83B` | Candlelight, gold, the pot, primary buttons |
| Hex red | `#C4472D` | Wax seals; the Seer winning |
| Moss | `#7FA36B` | The player winning |
| Brass/bronze | `#8A6A3A` | Metal details: cauldron handles, candle holder |

**The background the mascot sits on** is ink `#15111F`, with a warm ember glow falling from **above-centre** and a faint violet haze at the bottom, plus subtle paper grain and a dark vignette. The mascot's lighting should match: **warm key light from above-front, cool verdigris rim light or magic glow**, deep soft shadows.

### Typography
- **Grostel** (display): a tall, condensed, old-poster serif with flair. Used for the logo, headlines, the guess and the pot number.
- **Playfair Display** (text): elegant high-contrast serif for everything else.

### Anti-references (it must NOT look like any of these)
- A DeFi dashboard, stat cards, crypto-bro neon.
- Purple-to-blue "AI" gradients, glowing cyan on black, glassmorphism.
- A generic friendly robot or chat assistant.
- Horror: no skulls, gore, jump-scare creepiness. Mysterious, not frightening.
- A literal copy of Akinator's genie.

### Motion language
Motion tells the story; it doesn't decorate.
- Wax seal stamps down.
- Questions ink in left-to-right like a quill.
- The orb's mist swirls, then clears.
- The seal cracks in two.
- The cauldron's glow surges when the pot grows and gutters when it pays out.
- Coins pour for a winner.

Everything uses smooth deceleration (no bouncy or elastic easing). All motion has a reduced-motion fallback.

---

## 6. Mechanics the mascot can reference (props and symbols)

| On-chain mechanic | Physical prop in the UI | Could appear in mascot art? |
|---|---|---|
| Player's job commitment | **Wax seal** (hex-red, star emblem) on a scroll | Yes: the Seer could hold or eye a sealed scroll |
| The pot | **Cauldron** of glowing gold | Landing shows the Seer above it; keep it separate from the mascot image |
| Seer's wallet runway | **Candle** that burns down | A candle on or near the Seer is a nice echo |
| The guess | **Scrying orb** (verdigris mist) | Hands near an orb suit *thinking* or *confident* |
| Questions | **Tarot-like cards**, runes, a quill | Cards fanned in hand work for *thinking* |
| Answers | Sigils ☉ ☽ ☾ ✕ | A ☉/☽ motif on the hood or robe would tie in |
| Fairness | Receipts, a ledger | Optional: a ledger or quill tucked in the belt |

The current placeholder is a **hooded, robed figure with a gold star on the hood, a shadowed face and two glowing ember eyes**. It's a starting silhouette to replace, not a design to copy.

---

## 7. Mascot brief: the Seer

### Concept
A **fortune-teller showman**, part carnival Zoltar, part hedge-wizard, part card sharp who happens to be honest. Ancient enough to feel mystical, lively enough to gloat. It should read instantly at small sizes (about 200px wide) on a dark background.

### Must-haves
- **Strong silhouette** against near-black: hood, hat or distinctive headwear; clear shoulders and hands.
- **Expressive eyes** (the placeholder uses glowing ember eyes). The face can be partly shadowed, but mood must read from eyes, brows and hands.
- **Hands visible.** Most mood changes are carried by gesture.
- **Palette discipline:** mostly soot/velvet/ink tones, with ember-gold and parchment highlights and one verdigris magic accent. Hex red only as a small detail (a seal, a gem).
- **Grounded pose:** the figure is anchored at the bottom. The *thinking* animation rotates the image around a point near its feet (see §8), so the character should stand or sit on a base, not float mid-air.
- **Consistent character** across all five moods: same proportions, costume, framing and camera angle, so switching moods doesn't jump.

### Nice-to-haves
- A candle, orb or deck of cards as a signature prop, used differently per mood.
- A tiny ☉ / ☽ sigil or a star on the costume.
- Brass and velvet textures echoing the booth.

### Personality cues for the art
- **Posture:** upright, chin slightly raised, showman's confidence.
- **Expression range:** knowing smirk → narrowed concentration → triumphant grin → exaggerated, offended bafflement. Never genuinely sad or scary.

---

## 8. Mood sheet: the five required images

The app picks the image from the game state. Each mood is a **separate PNG with the same canvas, same framing and same character scale**.

| File | When it appears | Pose and expression direction |
|---|---|---|
| `idle.png` | Landing (large, above the cauldron), World ID screen, questions when the Seer is unsure | Composed, welcoming but smug. One hand raised as if beckoning "step right up", or hands resting on a crystal ball. Knowing half-smile. |
| `thinking.png` | While the Seer computes the next question or its guess | Concentrating: eyes narrowed or closed, fingers at temple, or peering into cards or an orb. **Gets a slow sway animation** (rotates ±1.5° and lifts 3px on a 2.4s loop around a point near the base), so pose it balanced and symmetrical-ish. |
| `confident.png` | During questions once the Seer's confidence passes 45%; also on a **push** result (right family, wrong job) | Leaning in, one eyebrow up, pointing at the viewer or tapping a card. "I've nearly got you." |
| `triumphant.png` | Result screen when **the Seer wins** | Big showman flourish: arms wide or a bow, cape swirl, gleeful grin, maybe coins or a glowing orb held aloft. Peak smugness. |
| `stumped.png` | Result screen when **the player wins** | Theatrically baffled and offended: hand to forehead, hat askew, cards spilling, eyes wide. Comic, not sad. The smug character briefly losing composure. |

### Where each appears, and how big

| Screen | Mood(s) | Displayed width |
|---|---|---|
| Landing | idle | 240 px (cauldron overlaps just below the feet) |
| World ID gate | idle | 200 px |
| Questions | thinking / idle / confident | 220 px |
| Result | triumphant / confident / stumped | 230 px (cracked wax seal shown below) |

---

## 9. Technical asset specs

- **Location:** `web/public/mascot/`
- **Filenames (exact, lowercase):** `idle.png`, `thinking.png`, `confident.png`, `stumped.png`, `triumphant.png`
- **Format:** PNG with a **transparent background**. No baked-in background, no text, no watermark.
- **Aspect ratio:** **1 : 1.15** (width : height). The component box is `size × size·1.15` and the image is scaled to fit (`object-contain`).
- **Canvas size:** **720 × 828 px** (3× the largest display size, so it stays sharp on retina screens). 1440 × 1656 is also fine.
- **Framing:**
  - Character centered horizontally.
  - Feet or base about 3–5% above the bottom edge.
  - Head or hat about 5% below the top edge.
  - Leave ~6% side padding so flourishes (arms, cape) aren't clipped.
  - Keep the same framing in all five files.
- **Shadow:** don't paint a drop shadow under the figure. The app adds a soft dark drop shadow automatically. A contact shadow at the feet is fine.
- **Glow:** a subtle verdigris or ember glow *on* the character is welcome. Avoid a large glow halo that fills the canvas; it will look like a box on the dark page.
- **No code changes needed:** as soon as a file exists, it replaces the placeholder for that mood. Missing moods keep showing the placeholder, so you can add them one at a time.

### Quick checklist before dropping art in

- [ ] 5 files, exact names, transparent PNG
- [ ] All 720×828 (1:1.15), identical framing and scale
- [ ] Reads clearly at 200px wide on `#15111F`
- [ ] Warm light from above-front, one verdigris accent
- [ ] Grounded at the bottom (the thinking sway rotates around the base)
- [ ] Personality reads: smug showman, honest, never scary

---

## 10. Starter prompt for an image generator

Use one base prompt for the character, then swap the pose line per mood. Keep the seed or style reference fixed across all five for consistency.

**Base:**
> Full-body character illustration of "the Seer", a theatrical fortune-teller showman mascot for a candlelit carnival tarot booth. Hooded, flowing robe in deep soot-violet velvet (#231C31, #2E2340) with worn brass trim and ember-gold (#E2A83B) embroidery, a small gold star and sun-and-moon sigils on the hood, glowing warm ember eyes in a partly shadowed face, expressive visible hands with rings. One small verdigris-teal (#3FB6A8) magical accent glow. Smug, confident, charismatic, playful, honest, not scary. Warm key light from above-front like candlelight, soft cool rim light. Clean strong silhouette, readable at small size. Stylised illustration, painterly with crisp edges, rich texture. Transparent background, character centered, standing on the ground, full body in frame with padding, portrait 1:1.15 composition. No text, no background, no border.

**Pose lines, one per mood:**
- **idle:** "calm knowing half-smile, one hand raised beckoning the viewer to step closer, the other resting on a small crystal ball"
- **thinking:** "eyes narrowed in concentration, two fingers at the temple, a fan of tarot cards in the other hand, balanced symmetrical stance"
- **confident:** "leaning slightly forward, one eyebrow raised, pointing a finger at the viewer with a sly grin, tapping a tarot card"
- **triumphant:** "grand showman flourish with arms spread wide and cape swirling, gleeful triumphant grin, gold coins scattering from one hand"
- **stumped:** "theatrically baffled and offended, hand pressed to forehead, hood knocked askew, tarot cards spilling from the other hand, wide astonished eyes, comic not sad"

**Negative prompt:** robot, cyborg, neon, purple-blue gradient, glassmorphism, skull, horror, gore, realistic photo, background scenery, text, watermark, cropped limbs

---

## 11. Reference: the rest of the system (for context)

| Part | Summary | Where |
|---|---|---|
| Smart contract | `GuessworkerVault` on Arc testnet `0xFca0f5a0918c8288a70339B2774c4Ac4E74D6878`: escrow, commit–reveal, three-tier settlement, pot, Seer rake, World ID daily quota, timeouts | `contracts/src/GuessworkerVault.sol` |
| The Seer's brain | Bayesian solver over 66 jobs × 24 traits; picks the most informative question (seeded, so every game is replayable); 10 questions | `web/lib/solver.ts`, `web/lib/matrix.json` |
| Server | World ID verification, start-game signing, next-question and guess routes; the Seer's wallet submits its guess | `web/app/api/*` |
| Frontend | Next.js booth UI, props (seal, orb, cauldron, candle, coins) | `web/components/*` |
| Design context for agents | Condensed version of sections 4–5 | `web/.impeccable.md`, `web/CLAUDE.md` |
| Task status | Build checklist and shared technical decisions | `CHECKLIST.md` |
