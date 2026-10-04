# EcoStream Smart Operations

A borehole drilling services management system for EcoStream Ltd. (The Gambia), with a customer portal, staff/admin operations portal, and backend API.

## Production architecture

The production database is **Supabase PostgreSQL** for the Eco Stream Borehole Drilling project.

```
Client Portal / Admin Portal
          |
          v
     EcoStream API
          |
          +---- Supabase Auth
          |
          +---- PostgreSQL + Row Level Security
          |
          +---- Supabase Storage
```

The Supabase project already contains the reviewed EcoStream schema, RLS policies, security hardening migrations, and document-storage policies. The application must treat this existing Supabase schema as the source of truth rather than creating a duplicate Prisma schema.

## Core capabilities

- Customer registration and authentication
- Client profiles and role management
- Borehole booking requests
- Drilling project tracking
- Engineer assignment
- Payment records
- Documents and water-test reports
- Support tickets
- Client/company chat
- Notifications
- Equipment and expense management
- CMS content
- Audit logging
- RLS-protected data access

## Supabase status

As of the current engineering integration:

- Supabase project: **Eco Stream Borehole Drilling**
- Region: **eu-west-1**
- PostgreSQL: **17**
- Existing migrations: **12**
- Public application tables: **11**
- RLS: **enabled**
- Security advisor findings: **0**
- Performance advisor findings: **0**
- Existing database data: **empty / ready for application onboarding**

The database has been inspected directly. No duplicate schema migration should be applied over the existing migration history.

## Engineering rule

Secrets must never be committed to GitHub. In particular, never commit:

- Supabase service-role keys
- database passwords
- JWT secrets
- email provider credentials
- production API tokens

Use environment variables or the hosting provider's secret manager.

## Local development

The legacy JSON datastore remains useful for isolated local development, but production should use the Supabase architecture described above.

See the repository documentation for deployment, API, security, and migration details.

## License

No license file is currently included. All rights remain with the project owner unless a license is added.
