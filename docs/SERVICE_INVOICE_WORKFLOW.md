# EcoStream Service Invoice Workflow

## Source invoice
The workflow is based on the uploaded `ecostream invoice .pdf` template. The generated invoice reuses the repository's EcoStream SVG logo and carries the template's company address, phone, email, website, MEGA Bank account details and WAVE/DAHA payment contact.

## Lifecycle
1. A customer submits one of the supported service bookings.
2. A Supabase trigger inserts a system-wide booking notification for admin/staff.
3. An authorized admin/staff member selects **Prepare draft**. The API creates a service-specific draft from the booking and customer profile.
4. The draft starts with suggested descriptions and zero prices. Staff must remove irrelevant lines, confirm quantities/prices, discount, tax, address, due date and payment terms.
5. The backend validates line items and calculates subtotal, discount, tax and total. It does not trust totals sent by the browser.
6. **Approve & Send** changes the invoice to sent and inserts a client notification. Drafts are not visible to clients.
7. The client can open the invoice in Payments & Invoices and use the print dialog's **Save as PDF** option on mobile or desktop.
8. The client can request a service date/time. A server-side, ownership-checked operation stores the request; staff can confirm the date in Service Invoices.

## Data and access
- Invoice records and line items live in `public.service_invoices`.
- Invoice access is restricted by RLS to the owning client and authorized staff/admin.
- Only staff/admin can insert or update invoice rows directly. Client scheduling goes through a narrow backend endpoint that checks invoice ownership and only updates scheduling fields.
- The uploaded PDF is used as a design/source reference; it is not a pricing database. No sample prices are automatically copied into new invoices.
- PDF output is currently rendered in the portal and saved by the user's browser print-to-PDF flow; the generated PDF binary is not yet archived in Supabase Storage. Invoice data, totals, status and schedule are persisted in Supabase.
- Draft descriptions are deterministic service-specific suggestions, not an external LLM. Staff approval is required and prices must be entered manually.
- No SMS delivery is used. Customer notifications are in-app.

## Migration
The live Supabase migration is recorded in `backend/supabase/migrations/20261009_service_invoices_and_booking_alerts.sql`. It creates the invoice table, RLS policies and booking notification trigger.
