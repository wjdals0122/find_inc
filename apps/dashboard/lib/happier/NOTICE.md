# Happier protocol attribution

The Dart wire formats in `happier_crypto.dart` and remote RPC contracts in
`happier_client.dart` follow the existing browser adapter and these official
Happier sources, reviewed at commit `e992e049ffa7a98ab60740ac60f94918f022ff24`:

- https://github.com/happier-dev/happier/tree/e992e049ffa7a98ab60740ac60f94918f022ff24
- `packages/protocol`: terminalProvisioningV2, encryptedDataKeyEnvelopeV1,
  boxBundle, canonicalDigest, serializedJsonValue (see the vendored source
  attribution in `dashboard/tools/happier/vendor/NOTICE.md`).
- `apps/cli/src/api/types.ts` (machine/session metadata and RPC contract).
- `apps/server/sources/app/api/routes/session/registerSessionListingRoutes.ts`.

Cryptographic primitives come from PineNaCl (TweetNaCl box / Curve25519 /
XSalsa20-Poly1305) and `cryptography` (AES-256-GCM, SHA-256, HMAC-SHA256).
No cryptographic primitives are implemented in this application.

The fixture file contains synthetic test keys only. Its approval and key
envelopes are generated with the existing official TypeScript helpers.

## Happier license

MIT License

Copyright (c) 2026 Happy Coder Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
