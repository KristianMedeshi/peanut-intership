# Peanut Internship - Week 1 Foundation 🚀

Production-minded TypeScript foundation for an arbitrage system, focused on secure wallet operations, deterministic serialization, reliable chain access, and rich transaction analysis.

## ✨ What This Week Delivers

- 🔐 `core/` foundations: wallet management, secure signing, canonical serialization, and strict domain types.
- ⛓️ `chain/` foundations: RPC client with retries/fallbacks, transaction builder, nonce management, analyzer CLI.
- 🧪 integration scripts for Sepolia sends, dry-runs, analyzer sample checks, and pending tx monitoring.
- ✅ strong automated coverage: 9 test files, 122 passing tests.

## 🧱 Module Map

### 🔐 Core Layer

- `WalletManager`
  - Loads keys from env
  - Signs messages, typed data, and transactions
  - Masks sensitive values in error paths
  - Supports encrypted keyfile import/export
- `CanonicalSerializer`
  - Deterministic, recursive key sorting
  - Stable keccak hashing
  - Rejects unsafe numeric forms (floats/non-finite/unsafe integers)
- Domain Types
  - `Address`, `TokenAmount`, `Token`
  - `CoreTransactionRequest`, `CoreTransactionReceipt`

### ⛓️ Chain Layer

- `ChainClient`
  - RPC retry + endpoint fallback
  - Gas pricing helpers
  - tx send/wait/receipt helpers
  - pending tx monitor support (WebSocket)
- `TransactionBuilder`
  - Fluent builder API
  - Nonce + gas estimate integration
  - Build/sign/send convenience flows
- Analyzer CLI (`npm run analyze:tx`)
  - Function selector decode
  - Event/log interpretation
  - Optional trace + MEV heuristics

## 📦 Prerequisites

- Node.js 18+
- npm

## ⚙️ Setup

```bash
npm install
cp .env.example .env
```

Set the required variables in `.env`:

- `PRIVATE_KEY`
- `RPC_URL`
- `TRANSFER_VALUE_ETH`
- `RECIPIENT_ADDRESS` (optional, defaults to your own wallet)

Note: `PRIVATE_KEY` may be provided with or without a `0x` prefix — both formats are accepted by the project's wallet utilities. Keep private keys secret and never commit them to version control.

Optional variables:

- `ANALYZER_RPC_URL`
- `ANALYZER_WITH_TRACE=true`
- `ANALYZER_WITH_MEV=true`
- `WS_URL`
- `PENDING_MONITOR_SECONDS` (default `15`)
- `PENDING_MONITOR_STRICT=true`
- `INTEGRATION_BROADCAST` (`true` to send, `false` to dry-run only)

## 🛠️ Commands

```bash
# Development / quality
npm test
npm run test:coverage
npm run lint
npm run build

# Analyzer
npm run analyze:tx <tx_hash>

# Integrations
npm run integration:sepolia
npm run integration:dry-run
npm run integration:analyzer
npm run integration:pending
```

## 🔎 Analyzer Examples

```bash
# Basic analysis
npm run analyze:tx 0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742

# Custom RPC
npm run analyze:tx 0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742 -- --rpc https://ethereum.publicnode.com

# JSON format
npm run analyze:tx 0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742 -- --format json

# Disable trace + MEV pass
npm run analyze:tx 0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742 -- --no-trace --no-mev
```

Additional example (Sepolia RPC):

```bash
npm run analyze:tx -- 0x3f9771c5b940c0c3b411b2b8c67545569ad7bbdc1fa888a12cbdfbe8099d1afa --rpc https://ethereum-sepolia-rpc.publicnode.com
```

Sample hashes:

- `0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838`
- `0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742`
- `0xc5178498b5c226d9f7e2f5086f72bf0e4f4d87e097c4e517f1bec128580fd537`
- `0x58baef119f9ccfdea7288b43d0153347837f673f9902dfc0b8ac1d0f6b1ed0ff`

## 🧪 Integration Flows

```bash
# Full live Sepolia flow (build -> sign -> send -> wait -> analyze)
npm run integration:sepolia

# Dry run flow (same script, build/sign/simulate only)
npm run integration:dry-run

# Explicit overrides (optional)
INTEGRATION_BROADCAST=false npm run integration:sepolia
INTEGRATION_BROADCAST=true npm run integration:dry-run

# Validate analyzer behavior against known transactions
npm run integration:analyzer

# Observe pending tx stream (requires WS_URL)
npm run integration:pending
```

## 🧠 Architectural Notes

- 🛡️ Security-first wallet APIs: key material is never exposed via string/inspect output.
- 🧾 Deterministic serialization by default: avoids signature mismatches across environments.
- 🔄 Resilient chain access: retries, fallback URLs, and classified RPC failure paths.
- 🧪 Test-first implementation style: cryptography and edge-case behavior validated in unit tests.

## 📊 Current Quality Snapshot

- ✅ Test files: `9`
- ✅ Tests passing: `122`
- ✅ Focus areas covered: wallet security, serializer edge cases, type safety, client reliability, builder behavior, analyzer decoding/runtime paths

## 🗺️ Next Week Context

This Week 1 foundation is intentionally reusable. Upcoming modules (`pricing`, `exchange`, `inventory`, `strategy`, `executor`, `safety`) can plug into the existing core and chain contracts without redesigning wallet or transaction primitives.
