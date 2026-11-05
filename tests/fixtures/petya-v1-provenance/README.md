# Base model provenance for the pending petya-v1 release

This directory records the actual local base snapshot file hashes, the exact revision model card and a pinned copy of its linked Apache 2.0 license. It is supporting evidence, not a release artifact or approval. No base weights are duplicated here.

The source card is internally inconsistent: front matter names the Base model, while prose describes conversion from the instruction model. The manifest preserves that limitation. The license repository revision was resolved during this audit; it does not establish which upstream revision the community conversion used. Identify the actual local model by its pinned community revision and recorded SHA-256 hashes.

Any released adapter still requires its own training/data/weight hashes, compatible runtime, validation report, limitations and loading instructions. Text-only evaluation does not validate the vision branch or Windows runtime. petya-v1 remains unreleased until quality and integration checks pass.
