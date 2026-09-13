# Legilimens — build checklist

Source plan: `C:\Users\rajde\.claude\plans\ethglobal-ethonline-2026-hackathon-hashed-wren.md`

Legend: `[x]` done · `[~]` in progress · `[ ]` open.
**Owner** says who holds it right now:
- `me`: the main Claude session
- `you`: needs a human (logins, keys, wallets, recording)
- `free`: open to delegate

Every task lists what it depends on (**Needs**) and the files it touches. An agent picking up a task should only need the task text and the "Shared decisions" section below.

---

## Shared decisions (read before picking up any task)

- **Chain:** Arc testnet, chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`, faucet `https://faucet.circle.com`.
- **Money:** native USDC is the gas token with **18 decimals**, so amounts are plain `msg.value` / `ether` units. The ERC-20 interface at `0x3600000000000000000000000000000000000000` uses 6 decimals and is **not used**.
- **Stake:** set in the constructor. Demo value **1 USDC** (the faucet is too stingy for 10). The pot is seeded with 5 USDC via `seedPot()`.
- **Payouts:**

  | Outcome | Rule | Money |
  |---|---|---|
  | `AgentWin` (1) | exact code match | 5% rake to agent, 95% to pot |
  | `Push` (2) | same `code / 10` family | 90% refunded, 10% to pot |
  | `PlayerWin` (3) | anything else | stake + 50% of pot |
  | `Forfeit` (4) | no reveal before the timeout | stake to pot |
  | `Refund` (5) | agent never guessed | stake back to player |

- **Job commit:** `keccak256(abi.encode(uint16 jobCode, bytes32 salt))`. The salt is random, and the client keeps it in `localStorage` keyed by `gameId`.
- **Seed:** stateless. The server derives `seed = keccak256(abi.encode(AGENT_SEED_SECRET, jobCommit, nullifierHash))` and publishes `seedCommit = keccak256(abi.encode(seed))`, so no database is needed.
- **Start signature:** the agent key signs an EIP-191 personal message over `keccak256(abi.encode(chainid, vault, player, jobCommit, seedCommit, nullifierHash, expiry))`. This one signature covers both World ID eligibility and the seed binding.
- **Transcript on-chain:** `submitGuess` also takes `bytes10 answers`, one byte per question (0 = No, 1 = Probably Not, 2 = Probably, 3 = Yes). Questions are re-derived from seed + answers, so any game can be replayed from chain data alone.
- **Deterministic prior:** the solver prior comes from the subgraph's settled games **as of the game's `startBlock`** (a Graph time-travel query), so replays stay exact even as history grows.
- **Quota:** 3 games per World ID nullifier per UTC day (`block.timestamp / 1 days`).
- **Timeouts:** guess within 30 min of start, otherwise `refund`. Reveal within 30 min of the guess, otherwise `forfeit`.
- **Solver:** **10 questions**, softmax temperature **0.03**, over 66 jobs × 24 traits. Answer model: Yes = 0.75p + 0.0125, Probably = 0.2p + 0.0125, Probably Not = 0.2(1-p) + 0.0125, No = 0.75(1-p) + 0.0125. The next question is picked by a softmax over information gain, using a PRNG seeded from `${seed}:${step}`. The guess is the posterior argmax, with ties going to the lower index.
  - **Calibration** (`scripts/sim.ts`, noisy synthetic players): Seer exact about 48%, push about 7%, player wins about 45%.
  - Because a win pays 50% of the pot, the pot stays solvent at any rate. It settles near 2× the stake, and the house edge is roughly 2%.
  - The original 6-question plan only got the Seer to 12% exact, which is why the budget was raised.
  - **Do not change these constants without re-running the sim.** Replays depend on them.
- **Agent economy:** `submitGuess` takes `operatingCost` (USDC wei). Its gas cost plus a flat compute fee are recorded on-chain in `agentOperatingCost`. Rake accumulates in `agentRevenue`, and the agent wallet pays its own gas.
- **Web:** Next.js **16.3.5** (App Router), React 19, Tailwind 4. Next 16 has breaking changes, so read `web/node_modules/next/dist/docs/` before writing routes or config.
- **Fonts:** Grostel (`web/assets/fonts/grostel/GrostelRegular-V43ye.ttf`, has every glyph including digits and `$`) is `--font-brand`. Playfair Display via `next/font/google` is `--font-text`. The Grostel license is **Demo**, so it's fine for the hackathon only.
- **Theme tokens:**

  | Token | Hex |
  |---|---|
  | ink | `#15111F` |
  | soot | `#231C31` |
  | parchment | `#EDE3CC` |
  | faded | `#B9AD93` |
  | verdigris | `#3FB6A8` |
  | ember | `#E2A83B` |
  | hex | `#C4472D` |
  | moss | `#7FA36B` |

  The mood is a fortune-teller's study, **not** purple-gradient AI. Build UI with the `/impeccable`, `/frontend-design` and `/animate` skills, and respect `prefers-reduced-motion`.
- **Mascot slots:** `web/public/mascot/{idle,thinking,confident,stumped,triumphant}.png`. The user supplies these. Use an SVG placeholder of the same size until they arrive.

---

## 0. Environment

- [x] **E1** Verify Arc testnet RPC and chain ID: `eth_chainId` returned `0x4cef52`. *(me)*
- [x] **E2** Confirm native USDC decimals: 18 native, 6 for the ERC-20 interface. *(me)*
- [x] **E3** Copy and extract the Grostel zip into `web/assets/fonts/grostel/`. *(me)*
- [x] **E4** Check Grostel glyph coverage: nothing missing, 397 glyphs. *(me)*
- [x] **E5** Scaffold Next.js app in `web/`. *(me)*
- [x] **E6** Scaffold Foundry project in `contracts/`. *(me)*
- [x] **E7** (Seer `0x7224â€¦7080` and player `0x4F85â€¦102b`, 20 USDC each) Create two wallets, **player** and **agent**, and fund both from the Circle faucet. The agent needs gas, and the deployer needs about 6 USDC for the pot seed. *(you)*
- [ ] **E8a — URGENT BLOCKER** Request **Selfie Check (Beta)** access for the World app. It is required even for sandbox testing ([docs](https://docs.world.org/world-id/sandbox/testing-selfie-check)).
  - Ask the World sponsor in the ETHOnline Discord or partner channel, or email developers@toolsforhumanity.com.
  - The wait is outside our control, so do this first.
  - Until it's granted, the app runs with the fallback preset (`NEXT_PUBLIC_WORLD_PRESET=proofOfHuman`). *(you)*
- [ ] **E8** World Developer Portal: create an app and an action `play-guessworker` with unlimited verifications.
  - Note `app_id` and `rp_id`.
  - Generate the **RP signing key**: IDKit v4 needs a server-signed `rp_context`. *(you)*
- [x] **E9** Subgraph Studio: create subgraph `guessworker` and copy the deploy key. *(you)* Done: Studio subgraph `guessworker`, authenticated.
- [ ] **E10** Fill in `web/.env.local` (see `web/.env.example`, created in A1): `AGENT_PRIVATE_KEY`, `AGENT_SEED_SECRET`, `NEXT_PUBLIC_WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `NEXT_PUBLIC_WORLD_ACTION`, `NEXT_PUBLIC_WORLD_PRESET`, `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_SUBGRAPH_URL`. *(you)*
- [x] **E11** Set up a root git repo and `.gitignore`. The Graph track requires an open-source repo. *(free)* Done: root repo, remote `origin` = github.com/TheRealRajdeep/ethonline, forge-std as a submodule. The Grostel font is **gitignored** because its license is personal-use only, so copy it in locally.

## 1. Matrix and solver

- [x] **M1** `web/lib/matrix.json`: ~66 jobs (4-digit ISCO-08 codes, several sharing a 3-digit family) × 24 traits, each with question text and per-job probabilities. *(me)*
- [x] **M2** `web/lib/solver.ts`: prior, posterior update, information gain, seeded softmax pick, `nextQuestion(seed, answers, prior)`, `finalGuess(...)`. Pure TS, no deps. **Needs:** M1. *(me)*
- [x] **M3** `web/scripts/sim.ts`: simulate N games with noisy synthetic players and print the exact/push/miss rates. Target roughly 55/28/17; tune the question count or softmax temperature to get there. Run with `node web/scripts/sim.ts`. **Needs:** M2. *(free)*
- [x] **M4** Publish `keccak256(matrix.json)` in the README. **Needs:** M1 final. *(free)* Done: the matrix hash is in the README and on-chain as `MATRIX_HASH`.
- [ ] **M5** `web/scripts/replay.ts`: given `gameId`, read seed, answers and `startBlock` from chain, rebuild the prior via the subgraph at that block, rerun the solver, and assert that the guess matches. **Needs:** M2, C4, S2. *(free)*
- [x] **M6** Find the jobs the solver misses most often, to use in the player-win demo take. Hardest jobs at the final settings (full list in `web/scripts/sim-results.txt`):

  | Code | Job | Miss rate |
  |---|---|---|
  | 2431 | Marketing Specialist | 86% |
  | 2642 | Journalist | 86% |
  | 2432 | PR Specialist | 85% |
  | 2421 | Management Consultant | 84% |
  | 7411 | Electrician | 83% |

  For the agent-win take, pick a distinctive job such as Firefighter, Airline Pilot or Chef. *(me)*

## 2. Contract

- [x] **C1** `contracts/src/LegilimensVault.sol`, per the shared decisions: `startGame`, `submitGuess`, `reveal`, `forfeit`, `refund`, `seedPot`, views, and events `GameStarted` / `GuessSubmitted` / `Settled` / `PotSeeded`. *(me)*
- [x] **C2** `contracts/test/LegilimensVault.t.sol` (**20/20 passing**) covering:
  - all 3 outcomes
  - bad salt, bad seed, bad signature, expired signature
  - quota exhausted
  - forfeit and refund timing
  - wrong call order
  - non-agent `submitGuess`

  **Needs:** C1. *(me)*
- [x] **C3** `contracts/script/Deploy.s.sol`: deploy with `agent` and `stake`, then `seedPot{value: 5 ether}`. **Needs:** C1. *(me)*
- [x] **C4** Deployed to Arc testnet.
  - **Current vault (with the anti-cheat check):** `0x8286DE5954296D78ce2f276424F9dEe3a60bA9D8`, deploy block `61886523`, Seer `0x7224â€¦7080`, stake 1 USDC, pot seeded with 5.
  - The old vault `0xFca0â€¦6878` (no fit check) is retired; its 1.30 USDC pot stays there.
  - On-chain `MATRIX_HASH` = `0x9af0f7fd282328233db1cfcc1ba544ddff1dd1c5e591dd92d0e88c127d2a0bdf` (keccak of `web/lib/matrix.json` bytes). *(me)*
- [x] **C5** Export the ABI to `web/lib/abi.ts` and `subgraph/abis/LegilimensVault.json`. Re-export after any contract change: `jq '.abi' contracts/out/LegilimensVault.sol/LegilimensVault.json`. **Needs:** C1. *(me)*

## 3. Server (Next API routes)

- [x] **A1** `web/.env.example`, `web/lib/config.ts` (chain = viem `arcTestnet`, vault address, World config, `GameStatus` / `Outcome` enums) and `web/lib/server/agent.ts` (public + agent wallet clients, `deriveSeed`, `commitSeed`, `signStart`, `readGame`). *(me)*
- [x] **A2** World and start routes. The verify step is split from signing so the player can verify **before** picking a job:
  - `app/api/world/rp-context` (GET): signs the IDKit v4 `rp_context`.
  - `app/api/world/verify` (POST `{player, result}`): checks the signal equals the player address, calls the Portal's v4 verify, and returns `{nullifierHash, token, expiresAt}`. The token is an HMAC and lasts 15 min. `WORLD_DEV_BYPASS=true` skips World for local dev.
  - `app/api/start` (POST `{player, nullifierHash, token, jobCommit}`): returns `{seedCommit, expiry, sig}`. *(me)*
- [x] **A3** `web/app/api/question/route.ts` (POST `{gameId, answers}` → `{step, traitIndex, traitId, text, confidence, total}`). Shared loading logic is in `web/lib/server/game.ts`. *(me)*
- [x] **A4** `web/app/api/guess/route.ts` (POST `{gameId, answers(10)}` → `{guessCode, title, confidence, operatingCost, txHash}`). Idempotent if the game is already guessed. The agent pays gas, and `operatingCost` = estimated gas × gas price + `AGENT_COMPUTE_FEE_WEI`. *(me)*
- [x] **A5** `web/lib/server/prior.ts`: counts games settled with `settledBlock < startBlock`.
  - Returns a 503 if the subgraph `_meta.block` is behind `startBlock`, and falls back to a uniform prior when `SUBGRAPH_URL` is empty.
  - **Subgraph schema contract (S1 must match):** entity `Game` with `jobCode: Int`, `settledBlock: BigInt`, `outcome` as an enum `Outcome { None AgentWin Push PlayerWin Forfeit Refund }`, and `_meta`. *(me)*
## 4. World ID

- [x] **W0** Findings (confirmed from the installed type definitions, `@worldcoin/idkit` 4.2.3 and `idkit-core` 4.2.4):
  - IDKit is now **v4**: `@worldcoin/idkit` (React `IDKitRequestWidget`) plus `@worldcoin/idkit-core`.
  - The client needs an `rp_context` signed on the server with `signRequest()` from `@worldcoin/idkit-core/signing`.
  - Verify with `POST https://developer.world.org/api/v4/verify/{rp_id}`, forwarding the IDKit result unchanged.
  - Selfie Check uses the `selfieCheckLegacy({signal})` preset (World ID 3.0). Do **not** pass `allow_legacy_proofs`.
  - The types say `allow_legacy_proofs` is a **required boolean**. Use `true` with `selfieCheckLegacy`, which is the example in the type docs.
  - `IDKitRequestWidget` props: `open`, `onOpenChange`, `app_id`, `action`, `rp_context`, `allow_legacy_proofs`, `preset`, `environment?`, `handleVerify?`, `onSuccess`, `onError?`.
  - The result's `responses[0]` has `nullifier` and `signal_hash`.

  Original task: Read the current IDKit and Selfie Check docs (`docs.world.org/world-id/idkit/integrate`, `docs.idkit.com`) and confirm the package name/version, the widget API, and the cloud-verify endpoint for Selfie Check. *(me)*
- [x] **W1** (done in `components/booth/WorldGate.tsx`) IDKit widget in the client, with signal set to the player address. **Needs:** W0, E8. *(me)*
- [ ] **W2** One real Selfie Check in the Sandbox, end to end. **Needs:** W1, A2. *(you)*
- [ ] **W3** `FEEDBACK.md` for the World track. **Needs:** W2. *(you, with me drafting)*

## 5. Frontend

Use the `/impeccable`, `/frontend-design` and `/animate` skills for this whole section.

- [x] **F1** Design context: `teach-impeccable`, tokens, and fonts wired in `web/app/layout.tsx` and `globals.css`. *(me)* Done: `.impeccable.md` and `web/CLAUDE.md` design context, `app/globals.css` tokens and motion, fonts in `app/layout.tsx`.
- [x] **F2** wagmi + viem providers, injected connector, Arc chain definition. **Needs:** A1. *(me)* Done: `app/providers.tsx` (wagmi v3: `useConnection`, `useConnect().mutateAsync`, `injected()`).
- [x] **F3** Landing: live pot (cauldron/orb), agent balance and runway (candle), "Challenge the Seer" CTA. **Needs:** F1, F2. *(me)* Done: landing in `components/booth/Booth.tsx`, `components/props/{Cauldron,Candle}.tsx`.
- [x] **F4** Verify screen (World ID). **Needs:** W1. *(me)* Done: `components/booth/WorldGate.tsx` (`IDKitRequestWidget`, preset from `NEXT_PUBLIC_WORLD_PRESET`, dev-bypass button).
- [x] **F5** Pick and seal your job: searchable list, salt generation, wax-seal commit animation, `startGame` tx. **Needs:** A2, C4. *(me)* Done: `JobPicker.tsx` and `WaxSeal.tsx` stamp, with salt kept in `lib/commit.ts` localStorage and resume-on-reload.
- [x] **F6** Question loop: rune-inked question, four sigil answer buttons, mascot thinking loop. **Needs:** A3. *(me)* Done: `QuestionCard.tsx` (ink-in, sigils, 1â€“4 hotkeys, mascot mood).
- [x] **F7** The Guess: scrying-orb reveal. **Needs:** A4. *(me)* Done: `props/ScryingOrb.tsx`.
- [x] **F8** Reveal and payout: seal break, `reveal` tx, outcome state (hex/moss), cauldron surge/drain, coin flow. **Needs:** C4. *(me)* Done: `ResultView` in `Booth.tsx`, cracked seal, `props/Coins.tsx` on player win.
- [x] **F9** `components/booth/RecentGames.tsx`: "The booth's ledger" on the landing and result screens.
  - Shows vault stats plus the last 8 settled games from the subgraph, each linking to its ArcScan tx.
  - Polls every 15s. *(me)*
- [x] **F10b** **Real art integrated:** 5 Seer moods as tarot cards, the vault pot with 4 fill states, and the orb favicon.
  - Raw art is in `art/source/` (gitignored). Web assets are generated by `python art/process_art.py`.
  - Details are in DESIGN.md Â§9. *(me)*
- [x] **F10** Mascot component with 5 moods, SVG placeholder until the assets arrive. *(free)* Done: `props/Seer.tsx` probes `/public/mascot/<mood>.png` and falls back to the SVG placeholder. **To add art, just drop PNGs in, no code change needed.**
- [ ] **F11** Reduced-motion and contrast `/audit` pass. **Needs:** F3–F8. *(free)*

## 6. Subgraph (The Graph)

- [x] **S1** `subgraph/` builds (`pnpm codegen && pnpm build`). graph-cli 0.98.1 and graph-ts 0.38.2 are local devDependencies.
  - Network `arc-testnet`, vault `0xFca0â€¦6878`, startBlock `61860113`, `prune: never` (the prior needs full history).
  - Entities:
    - **`Game`**: status, outcome, jobCode, guessCode, seed, answers, settledBlock, and the start/guess/settle tx hashes.
    - **`Player`**: game counts (played, wins, pushes, losses), total staked and total paid out.
    - **`JobStat`**: per-occupation counts of revealed games, Seer wins, pushes and player wins.
    - **`Vault`**: live pot and totals.
  - Matches the query in `web/lib/server/prior.ts`. *(me)*
- [x] **S2** Subgraph Studio `guessworker` **v0.0.2** indexes the current vault: `https://api.studio.thegraph.com/query/1760267/guessworker/v0.0.2`.
  - Synced with no errors. v0.0.1 indexed the retired vault.
  - To redeploy: `cd subgraph && npx graph deploy guessworker --version-label v0.0.X`.
  - The Studio slug stays `guessworker` after the rename. *(me)*
- [x] **S3** Measured with 3 games of history: seen jobs' prior roughly doubles (Software Developer 1.52% â†’ 2.90%), and the **first question changes for 25/200 seeds (12.5%)**. The effect grows with history.
  - The live `/api/question` route reads the subgraph successfully. *(me)*

## 6b. Local end-to-end (no wallets or keys needed)

- [x] **L1** `web/scripts/e2e-local.ts` plays full games against a local anvil through the real API, solver and contract. Verified: Firefighter â†’ AgentWin; Marketing Specialist and Airline Pilot â†’ PlayerWin, with correct payouts and pot. To run it:
  1. `anvil --chain-id 5042002 --port 8546`
  2. Deploy with `AGENT_ADDRESS=<anvil acct1> forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 --broadcast --private-key <anvil acct0>`
  3. `pnpm dev` with the env vars `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`, `NEXT_PUBLIC_VAULT_ADDRESS=...`, `AGENT_PRIVATE_KEY=<acct1>`, `AGENT_SEED_SECRET=...`, `WORLD_DEV_BYPASS=true`, `NEXT_PUBLIC_WORLD_DEV_BYPASS=true`
  4. `APP_URL=http://localhost:3000 node scripts/e2e-local.ts 5411 2431` *(me)*

## 6c. Anti-cheat: players who lie to the Seer

- [x] **X1** On-chain answer-fit check.
  - `contracts/src/SeerMatrix.sol` is generated by `web/scripts/gen-matrix-sol.ts`. `LegilimensVault.fit()` scores logL(sealed job) âˆ’ max logL(any job) in milli-nats, using integer maths identical to `consistency()` in `web/lib/solver.ts`.
  - Score â‰¥ âˆ’2000: full prize. âˆ’6000 to âˆ’2000: prize scaled linearly. Below âˆ’6000, or a sealed code not in the ledger: `Inconsistent`, stake goes to the pot.
  - The Seer now publishes `traits` (bytes10) with its guess. *(me)*
- [x] **X2** Calibration, simulated at pot â‰ˆ 2 stakes:

  | Strategy | Before (EV/game) | After (EV/game) | Forfeited |
  |---|---|---|---|
  | Honest | âˆ’0.06 | âˆ’0.08 | 1.2% |
  | Blatant liar | +0.97 | **âˆ’0.44** | 61% |
  | Smart liar (lies only on ambiguous questions) | â€” | +0.15 | â€” |

  The smart liar's edge is the known residual; the World ID 3/day quota caps it. *(me)*
- [x] **X3** Tests: 27/27, including exact TSâ†”Solidity score parity. Live on testnet: honest game #4 â†’ AgentWin at 100% fit; liar game #5 (sealed Nurse, answered as another job, Seer fooled into "Police Officer") â†’ **Inconsistent**, 0% fit, stake to pot. *(me)*
- [x] **X4** UI: answer-fit meter and "The seal does not lie." verdict on the result screen; honesty warning on the seal and question screens; the ledger counts caught liars. *(me)*
- [x] **X5** README section explaining the attack, the check, the numbers and the residual smart-liar edge. *(free)* Done: README section "Catching liars on-chain".

## 7. Ship

- [ ] **D1** One real game per outcome (agent win, push, player win) on Arc testnet, with tx hashes saved in `DEMO_NOTES.md`. **Needs:** F8. *(you)*
- [x] **D2** Architecture diagram, required by Arc. *(free)* Done: architecture mermaid diagram in the README. Export it to PNG for the submission form if needed.
- [x] **D3** README covering: pitch, how it works, provable-fairness replay, matrix hash, v1 trust boundary (off-chain World verify, advisory judge cut), v2 roadmap, sponsor usage per track. *(free)* Done: `README.md` with 8 mermaid diagrams, all render-checked in light and dark themes. Update the replay section once M5 lands.
- [ ] **D4** Record the demo: Selfie Check → agent win → player win → explorer → subgraph query. *(you)*
- [ ] **D5** ETHGlobal submission: 3 partner prizes (Arc, The Graph, World). *(you)*
- [ ] **D6** After the deadline, between Sep 16 and 30: deploy to Arc Mainnet and update the submission for the bonuses. *(you)*

---

## Cut order if behind

1. Coin-flow and cauldron animations (F8 partial)
2. Runway candle → plain number (F3 partial)
3. Recent games (F9)
4. Subgraph entirely (S1–S3, A5 fallback) → lose the Graph track
5. **Never cut:** C1–C4, M1–M2, A2–A4, W1–W2, F5–F8, D4
