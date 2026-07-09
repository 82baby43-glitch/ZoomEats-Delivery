# ZoomEats Feature Patch Prompt

Reusable agent prompt for shipping competitive feature patches on the ZoomEats baseline. Copy the **Master Prompt** below into Cursor (or any coding agent), fill in the `[PATCH]` block, and run.

---

## Competitive concept (the wedge)

**DoorDash / Uber Eats win on catalog + deals. ZoomEats wins on *deciding* — not browsing.**

Dreamland is the moat: an emotionally intelligent food companion that meets users where they are (mood, craving, budget, time) and turns "I don't know what I want" into a confident order in under 60 seconds. Every feature patch should deepen one of these loops:

| Loop | What incumbents do | What ZoomEats does |
| --- | --- | --- |
| **Discover** | Infinite scroll, sponsored listings | Mood chips → scored picks with *why* |
| **Decide** | Filters + star ratings | Dreamland chat + emotion-weighted scoring |
| **Order** | Generic checkout | One-tap from recommendation → cart pre-filled |
| **Return** | Push promos | Memory of moods, cravings, past wins |

Supporting intelligence (already in codebase): Uber-grade routing (`lib/dispatch/routing/`), pricing engine (`supabase/migrations/20260725_*`), premium organic brand (`design_guidelines.json`).

---

## Master prompt (copy everything below this line)

```markdown
# ZoomEats Feature Patch — [PATCH_NAME]

You are implementing a **focused feature patch** on the ZoomEats production codebase. Your job is to ship a competitive edge — not a rewrite.

## Product north star

ZoomEats is a premium, artisan food-delivery platform. Our wedge vs DoorDash/Uber Eats is **Dreamland**: an emotionally intelligent AI that helps users decide *what* to eat based on mood, craving, budget, and context — then converts that decision into an order.

Brand: warm, grounded, premium (organic/earthy palette). Never corporate fast-food red/neon. See `design_guidelines.json`.

## Stack (do not change unless patch requires it)

- **Frontend**: Next.js 15 App Router, React 19, Tailwind, shadcn/ui, Framer Motion
- **API**: Supabase Edge Function `api` (`supabase/functions/api/index.ts` mirrors `lib/server/apiHandler.ts`)
- **Auth**: Supabase Google OAuth → `/auth/callback`
- **DB**: Supabase Postgres + RLS (additive migrations only)
- **AI**: Anthropic via Dreamland handler (`lib/server/dreamlandHandler.ts`, `lib/dreamland/*`)
- **Payments**: Stripe checkout + webhooks
- **Dispatch**: Internal drivers + Uber Direct fallback + routing AI

## Codebase map (extend, don't fork)

| Area | Primary paths |
| --- | --- |
| Dreamland AI | `lib/dreamland/` (prompts, scoring, emotions, collections, recommend) |
| Dreamland API | `lib/server/dreamlandHandler.ts` → routes `/dreamland/*` |
| Dreamland UI | `components/dreamland/`, `components/Chatbot.jsx`, `components/chatbot/` |
| Dreamland DB | `supabase/migrations/20260724_dreamland_ai.sql` |
| Customer home | `components/pages/Landing.jsx`, `app/page.tsx` |
| API client | `lib/api/index.ts` |
| Edge function shared | `supabase/functions/_shared/` (keep in sync with `lib/` when touching Dreamland) |
| Design system | `design_guidelines.json`, `app/globals.css` |
| Tests/scripts | `scripts/launch-readiness.mjs`, `scripts/compliance-test.mjs` |

## Implementation rules

1. **Minimal diff** — Smallest change that delivers the patch. No drive-by refactors.
2. **Match conventions** — Read surrounding files first. Same naming, patterns, error handling.
3. **Additive DB only** — New tables/columns via `supabase/migrations/YYYYMMDD_<name>.sql`. Never break existing orders, auth, Stripe, or compliance.
4. **Dual-write API** — If you change Dreamland server logic, update both `lib/server/dreamlandHandler.ts` AND `supabase/functions/_shared/` equivalents (or the edge function handler that imports them).
5. **Brand fidelity** — Colors: `#F4F1EA` bg, `#C2533B` primary, `#43614B` accent, `#D49A36` secondary. Cabinet Grotesk headings, Manrope body.
6. **Accessibility** — All interactive elements need `data-testid` in kebab-case.
7. **Dreamland voice** — Warm, human, never robotic. "I got you." not "Based on your preferences..."
8. **Real data** — Use live restaurant/menu context from DB. No placeholder images (use Pexels/Unsplash URLs from `design_guidelines.json` only for marketing hero assets).

## Dreamland scoring weights (reference)

When touching recommendations, respect existing weights in `lib/dreamland/scoring.ts`:
- emotion 35%, craving 20%, rating 10%, distance 10%, delivery time 10%, popularity 5%, health 5%, promotions 5%

Moods live in `lib/dreamland/emotions.ts` (26 moods → cuisine mappings). Intent classification in `lib/dreamland/intent.ts`.

## Patch specification

### [PATCH_NAME]
[FILL: One-line goal]

### Problem (vs incumbents)
[FILL: What DoorDash/Uber Eats fail at that this fixes]

### User story
As a [role], I want [action] so that [outcome tied to Dreamland loop: Discover / Decide / Order / Return].

### Scope
**In:**
- [FILL: bullet list]

**Out:**
- [FILL: explicit non-goals]

### Acceptance criteria
- [ ] [FILL: testable criterion]
- [ ] [FILL: testable criterion]
- [ ] Dreamland voice preserved in any new copy
- [ ] `data-testid` on new interactive UI
- [ ] No regression to checkout, auth, or dispatch
- [ ] Lint passes (`npm run lint`)

### Files likely touched
[FILL: list after scouting codebase]

### API changes (if any)
| Method | Route | Body/Params | Response |
| --- | --- | --- | --- |
| [FILL] | | | |

### DB changes (if any)
[FILL: table/column description or "none"]

## Delivery checklist

1. Implement the patch
2. Run `npm run lint`
3. If DB migration: `npm run db:migrate -- --file supabase/migrations/<file>.sql`
4. If API changed: ensure edge function parity
5. Smoke-test the happy path manually or via existing scripts
6. Summarize: what shipped, what was deferred, how to verify
```

---

## Example patches (ready to run)

### Patch 1: Mood → One-Tap Order

Replace `[PATCH_NAME]` and the spec block with:

```
### Mood Memory Quick Reorder
Return users see their last mood + top pick from that mood with a one-tap "Order again" CTA.

### Problem (vs incumbents)
Incumbents show "Order again" as a generic past-order list. ZoomEats remembers *why* you ordered — the mood — and surfaces the emotional context.

### User story
As a returning customer, I want to reorder from my last Dreamland mood session so that I skip decision fatigue on repeat nights.

### Scope
**In:**
- `dreamland_profiles.last_mood` + last recommendation on home (`DreamlandHome.jsx`)
- "Same vibe, same meal" card with pre-filled cart add
- API: `GET /dreamland/home` returns `last_win` object

**Out:**
- Full meal-planning UI
- Push notifications

### Acceptance criteria
- [ ] Logged-in user with prior paid order + mood sees quick-reorder card
- [ ] Tap adds last recommended item to cart and navigates to `/cart`
- [ ] Card hidden if no mood history or restaurant unavailable
- [ ] Copy uses Dreamland voice ("Still feeling tired? Same ramen hit?")
```

### Patch 2: Group Mood Poll

```
### Group Mood Poll ("What should we eat?")
Shareable link where 2–6 people vote mood/craving; Dreamland picks a restaurant that satisfies the group.

### Problem (vs incumbents)
Group ordering is a chat-thread nightmare. ZoomEats resolves it with emotion-first consensus.

### User story
As someone ordering for friends/family, I want a quick group poll so that Dreamland picks one place everyone will actually enjoy.

### Scope
**In:**
- New `dreamland_polls` table (poll_id, host_user_id, moods[], votes jsonb, status, winner_restaurant_id)
- `/dreamland/poll` create + `/dreamland/poll/:id` vote + results
- Share UI with mood chips per participant
- Scoring: intersect mood cuisines, rank by group match_score

**Out:**
- Split payment
- Real-time websockets (polling OK)

### Acceptance criteria
- [ ] Host creates poll, gets shareable `/poll/[id]` link
- [ ] Each voter picks a mood; results show winning restaurant + why
- [ ] "Order for the group" pre-fills cart with suggested items
- [ ] Poll expires after 2 hours
```

### Patch 3: Craving Streak Rewards

```
### Craving Streak Rewards
Track consecutive days user orders via Dreamland recommendation; unlock free delivery or surprise pick on day 3/7.

### Problem (vs incumbents)
Loyalty programs are points-based and transactional. ZoomEats rewards *using the brain* — deciding through Dreamland.

### User story
As a regular Dreamland user, I want streak rewards so that I'm incentivized to let Dreamland decide instead of browsing.

### Scope
**In:**
- `dreamland_profiles.streak_count`, `last_dreamland_order_at`
- Increment streak when order originates from `dreamland_recommendations` row
- Badge on chatbot toggle + streak banner in `DreamlandHome`
- Hook into pricing engine for delivery fee waiver rule

**Out:**
- Full gamification leaderboard
- Paid subscription tier

### Acceptance criteria
- [ ] Streak increments only on Dreamland-attributed orders
- [ ] Day 3: free delivery applied at checkout
- [ ] Day 7: "Surprise me" upgraded pick (score threshold ≥ 95)
- [ ] Streak resets after 48h gap
```

---

## Quick-reference: Dreamland API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/dreamland/chat` | POST | Conversational AI + recommendations |
| `/dreamland/home` | GET | Greeting, mood chips, curated collections |
| `/dreamland/recommend` | GET | Scored picks (mood, craving, budget params) |
| `/dreamland/mood` | POST | Set session mood |
| `/dreamland/surprise` | POST | Random high-score pick |
| `/dreamland/feedback` | POST | Thumbs up/down on recommendations |
| `/dreamland/history` | GET | Conversation history |
| `/dreamland/preferences` | GET/PUT | Dietary, cuisines, budget |

---

## How to use

1. Pick an example patch above **or** write your own `[PATCH]` spec.
2. Copy the **Master prompt** into a new Cursor agent chat.
3. Fill in all `[FILL]` and `[PATCH_NAME]` placeholders.
4. Run the agent on branch `cursor/<descriptive-name>-fe8f`.
5. Verify with `npm run lint` and `npm run launch:readiness` (if touching orders/payments).

---

*ZoomEats competitive edge = Dreamland decides, routing delivers, premium brand retains.*
