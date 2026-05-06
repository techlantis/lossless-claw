---
"@martian-engineering/lossless-claw": patch
---

Allow deferred `cold-cache-catchup` compaction debt to drain despite a recent prompt-cache touch. Background, assemble, and host-approved maintain drains now treat recorded cold-cache debt, or telemetry with an effectively cold cache-read share, as eligible for execution instead of preserving a nominally hot cache that is not actually being reused.
