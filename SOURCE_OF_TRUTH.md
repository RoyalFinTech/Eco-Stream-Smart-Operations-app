# EcoStream Source of Truth

## Baseline selected: v1.3-engineered

After comparing the available engineered ZIPs in the workspace, the clean source baseline is **EcoStream-v1.3-engineered.zip**.

Selection evidence:
- v1.2-engineered.zip: 70 project files.
- v1.2-github-ready.zip: 68 project files and an extra top-level EcoStream-System wrapper.
- v1.3-engineered.zip: **73 project files** and the most complete clean engineered application.
- v1.3-engineered-upload.zip: 91 archive entries, but 18 are accidental `.git` metadata entries; it is not the clean source baseline.

The repository must use the clean v1.3 application as the engineering baseline. Do not mix the older v1.2 application tree into it.

## Important architecture note

The v1.3 application contains the PostgreSQL/Prisma data-layer engineering completed in the workspace. Separately, the repository contains verified Supabase production-state documentation. These must be reconciled deliberately; do not apply a duplicate Prisma schema to the existing Supabase project.

## Engineering rule

Every future engineering change must:
1. start from the current repository source of truth;
2. be tested before being declared complete;
3. update the engineering changelog/status record;
4. be committed to GitHub with a descriptive commit message;
5. never commit production secrets.