@AGENTS.md

# TBKHN A

- This repo is **TBKHN A** (neighborhood home cooking, pickup only, Egypt). It is NOT TBKHTY; never copy flows, code, brand or copy from the TBKHTY repos.
- Read `docs/TBKHN-CONTEXT.md` first. Its section 13 (decisions log) wins over the prototype.
- Screens and flows follow `docs/design/TBKHN-A-Prototype.html` (the 17 flows). Where it conflicts with section 13 decisions (pickup only, InstaPay P2P payments, no delivery addresses), the decisions win.
- Every time and distance is computed, never hard-coded: `docs/DYNAMIC-DATA.md`.
- Sign-up funnel events, recovery and unique identifiers: `docs/SIGNUP-FUNNEL.md`.
- Run `npx expo lint` and `npx tsc --noEmit` before calling a change done.
