# TBKHN A — shared context (single source of truth)

> Paste or attach THIS file at the start of any chat (strategy, finance, design, Claude Code). It replaces re-describing the app. Update it here first; everything else follows.
> Last updated: 2026-10-02 · Owner: founder · Status: clickable prototype, pre-launch, no live data yet.
> Items marked **[TBD]** are not decided — fill them in; do not let a chat invent them.

## 1. One-liner
TBKHN A is a mobile app where neighbors in trusted communities (compounds, clubs, schools, areas) see what home cooks ("eCooks") are cooking today, reserve a plate, and pick it up. Rebrand of TBKHTY Social. Egypt first (Cairo areas such as Mohandeseen; +20 phone numbers).

## 2. Problem and promise
- **Buyer (typically a mom):** skip cooking today by reserving a home-cooked meal from someone she trusts nearby.
- **Cook:** turn home cooking into income with no setup — one post carries dish, price, portions, pickup point.
- **Why it works:** trust comes from community membership, ratings, reviews, verified badges; demand is known before cooking (reservations).

## 3. Core loop
Cook posts "what's cooking today" → auto-story for followers/community (ends at midnight) → buyer reserves a number of plates → cook accepts/declines → "ready" notification → pickup at set spot/time → review. Repeats daily.

## 4. Users and roles
- One account type. **A "cook" = anyone who has posted ≥1 "what's cooking today" post** (any community or via Nearby). No separate seller onboarding.
- Guests can browse view-only; signup is prompted at first Reserve / like / comment.
- Admin/backend (not in the app): community approvals, announcements, segmentation analytics.

## 5. Key features (as built in the prototype)
- Sign-up/login at launch: Google or Apple (same button signs up and logs in). Phone verification (WhatsApp code) is on hold, see section 13 (2026-10-04); it is added later, and members verified by phone are the ones whose likes count in the Masters. No passwords. Phone, email, username each unique (server-enforced).
- Home feed of followed communities; stories; Instagram-style bottom bar (Home · Menu/Reels-slot · Post · Messages · Search · Profile).
- Cook profile: rank badge ("#1 in Mohandeseen"), rating, bio, Follow, stats, tabs Posts · What's cooking today · Reviews.
- Menu: today's dishes, filter by community / cuisine / search, sorted by distance.
- Reserve flow: choose dish + portions, pickup spot/time → waiting → confirmed → ready. Cancel freely until cook confirms; after that message only.
- Post types: What you're cooking today (priced, orderable) · plain food story (no price, 24 h) · signature dish.
- Communities: search, join, community page (members, top cooks), request a new community (reviewed in 1–2 days).
- Messages + notifications (admin announcements to all or chosen communities), order history/reorder, addresses, payment methods, support, legal.
- Dynamic data rule: all times and distances computed, never hard-coded (see `DYNAMIC-DATA.md`).

## 6. Data and analytics (backend only, never shown to users)
Sign-up funnel events and stuck detection (`SIGNUP-FUNNEL.md`). Segmentation by community/area habits and trends; badges (e.g. top-3 cooks per community) derived from it. Cancellation reasons and demand by dish/cuisine/community.

## 7. Business model — **[TBD, fill in]**
- Revenue: commission per order? delivery fee? cook subscription? **[TBD]**
- Payments: cash on pickup vs in-app (prototype shows "Payment methods") **[TBD]**
- Pricing/take rate **[TBD]** · Delivery: **no drivers for now — pickup only** (delivery-address UI in the prototype is outdated)

## 8. Market and go-to-market — **[TBD, fill in]**
- Launch geography/communities **[TBD]** · Seed strategy for first cooks per community **[TBD]**
- Competitors/alternatives (WhatsApp groups, Facebook groups, delivery apps, cloud kitchens) **[TBD]**
- Regulatory/food-safety stance (home kitchens, licensing, liability) **[TBD]**

## 9. Finance — **[TBD, fill in]**
Stage, runway, funding ask, unit economics assumptions (AOV, take rate, orders/cook/day, CAC), team and costs.

## 10. Brand and design
- Name: "TBKHN A" (app) · colors kept from TBKHTY (teal accent `#0c8a7f`, warm cream `#efe9df`, ink `#16201e`); type: Hanken Grotesk + Instrument Serif in the prototype.
- References: Instagram home feed (layout), cook-profile reference (Hoda). Voice: warm, neighborly, plain.

## 11. Source files (where details live)
| File | What |
| --- | --- |
| `TBKHN A App.dc.html` | Clickable prototype (all screens, 17 flows) |
| `TBKHN A Flows.dc.html` | Flow map for presentation |
| `DYNAMIC-DATA.md` | Time/distance rules |
| `SIGNUP-FUNNEL.md` | Funnel events, recovery, unique IDs |
| `CLAUDE.md` | Standing instructions for Claude tools |

## 12. The 17 user flows (index)
1 New guest → first order · 2 Returning login · 3 Skip cooking today · 4 Story → reserve · 5 Member becomes eCook · 6 Find cooks/communities · 7 Request community · 8 Profile/settings · 9 Post cooking-today (auto-story) · 10 Messages · 11 Notifications · 12 Orders/addresses/payments · 13 Account/support/legal · 14 Browse menu · 15 Feed actions · 16 Cancel order · 17 Share food story.

## 13. Open decisions log
Add dated one-liners here as decisions are made, so every tool inherits them.
- 2026-10-02 — Created this context file.
- 2026-10-02 — Delivery: NO drivers for now. Pickup only; delivery-address screens in the prototype are outdated/not launched.
- 2026-10-02 — Competition ("the Masters"): will run inside this app. Likely winner = signature-dish post with the most likes. Rules, prize, schedule, eligibility, per-community vs national: [TBD, define in strategy session]. Any older Masters description in other files is outdated.
- 2026-10-04 — Sign-up code: WhatsApp only, sent directly through Meta's WhatsApp Cloud API (~$0.013 per code). No Twilio, no SMS fallback (SMS ~$0.40 per code). Members without WhatsApp use "Contact us".
- 2026-10-04 — Phone verification is ON HOLD (founder). Launch sign-in = Google + Apple; "Continue with phone" (WhatsApp code) stays built but hidden until a real WhatsApp number is set up. Masters anti-cheat (many fake numbers boosting one friend) is solved later: only likes from accounts with real activity or a verified phone count toward rankings. Supersedes "phone verification mandatory" in section 5.

---
### How to keep all tools in sync
1. **Git repo = master.** Keep this file, `CLAUDE.md`, `DYNAMIC-DATA.md`, `SIGNUP-FUNNEL.md` in one repo. Claude Code reads `CLAUDE.md` automatically — add a line there: "Read TBKHN-CONTEXT.md first."
2. **Claude chat (strategy, finance):** create one Claude Project per workstream and add THIS file as project knowledge; re-upload after edits. Put the workstream-specific brief in the project instructions.
3. **Claude Design:** this project already holds the file; keep it here.
4. **Rule:** decisions made in any chat → one line in §13 here → re-sync. Never let a chat be the only place a decision lives.
