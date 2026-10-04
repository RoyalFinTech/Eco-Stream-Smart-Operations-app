# Engineering History

## 2026-10-04 — Source-of-truth reconciliation

- Compared the available EcoStream engineered ZIPs and the current GitHub repository tree.
- Selected **EcoStream-v1.3-engineered.zip** as the clean, most-upgraded application baseline (73 project files).
- Rejected **EcoStream-v1.3-engineered-upload.zip** as the baseline because it contains accidental `.git` metadata entries.
- Confirmed the GitHub `main` branch previously contained the documentation/release shell rather than the complete v1.3 application tree.
- Confirmed the existing Supabase production schema must not be replaced by the standalone Prisma schema.
- Established the rule that future changes must be recorded and committed.

## Next synchronization step

The complete v1.3 application tree must be synchronized into GitHub from the verified workspace artifact before application-to-Supabase integration work is layered on top. Until that synchronization is complete, the repository must not be described as containing the full v1.3 source tree.