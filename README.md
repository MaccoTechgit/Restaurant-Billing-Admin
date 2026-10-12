# TableBill — Restaurant POS, Billing, HR, Accounting & Delivery (Go)

Ek hi file (`tablebill.exe`) me backend + website. Koi database install nahi karna.

## Do alag programs

```
backend\    Go API  - saari logic, database, login, accounting, HR ...   (port 8080, sirf API)
frontend\   Go web server - screens (HTML/CSS/JS) + backend ka proxy       (port 3000)
```
- **Backend** (`backend/`): koi screen nahi. `/api/...` deta hai. Database `backend/data/` me banta hai.
- **Frontend** (`frontend/`): sirf screens. `/api`, `/media` aur live-updates ko `BACKEND_URL` (default `http://127.0.0.1:8080`) par bhej deta hai.
  Isme koi business logic nahi - isse alag machine par bhi chala sakte ho (`BACKEND_URL=http://server:8080`).

```bash
build.bat           # dono banata hai
start-demo.bat      # dono chalata hai aur http://localhost:3000 kholta hai  (demo)
```
Haath se: `cd backend && go run .`  aur  `cd frontend && go run .`  - phir **http://localhost:3000** kholo.
Backend ko `ADDR=127.0.0.1:8080` par rakho (sirf frontend usse baat kare) aur `TRUST_PROXY=1` set karo taaki har user ka asli IP dikhe.
Ek-process wala purana tareeka chahiye to backend ko `FRONTEND_DIR=../frontend` ke saath chalao.

**Demo mode** me 3 branches, menu, staff, 30 din ki orders ban jati hain aur login page par har role ka **bina password** wala button aata hai.
Ye sirf apne PC par testing ke liye hai. **DEMO ab default me BAND hai** - asli restaurant me `start-production.bat` (ya `DEMO=0`) use karo;
pehli baar superadmin ka password server ke console me ek baar dikhta hai.

## Kya-kya hai (Rail: Hub · Delivery · HRMS · Accounting · Reports · Settings)

**13 roles** (pos_operator + superadmin, admin, admin_branch, manager, cashier, kitchen, waiter, hr_officer, hr_manager, accountant, accounting_manager,
accounting_auditor) + apne custom roles. Har role ko har area me *No access / View / Manage / Approve* (Hub → Users & Access → Roles).
Branch-admin sirf apni branch dekhta hai.

| Area | Screens |
|---|---|
| **Hub** | Dashboard (customizable widgets) · **POS** (7 channels, options, hold, split pay, vouchers, gift card, loyalty points, session & cash drawer, customer display) · **KDS** · Orders · Invoices · Payments · Reasons · Registers/Sessions/Cash movements · Reservations/Waitlist/Table blocks · Tables/Merges/Zones/Floors + **QR ordering** · Menus/Categories/Products/Options/Stations/Recipes · Inventory (stock, movements, transfers, counts, waste) · Purchasing (POs, suppliers, units) · Customers, Discounts, Vouchers, Loyalty, Gift cards, Analytics · Branches, Users, Roles, Activity & Auth logs, Media, Database backup |
| **Delivery** | Dashboard · Deliveries · Dispatch board · Live tracking · Drivers & earning rules · COD settlements · Provider settlements · Driver earnings · Payout batches/issues · Courier providers (+quotes, dispatch log) · Zones, pricing rules, peak surcharges · public customer tracking link |
| **HRMS** | Dashboard · Employees, Departments, Designations, Shifts, Documents, Holidays · Leave (requests, approvals, balances, types, policies, rules, reports) · Attendance (check-in/out with geofence, records, overtime, reports) · Payroll (periods, runs, payslips, settlements, gratuity, tax & social-security policies, components, structures, analytics) · "My attendance & leave" self-service |
| **Accounting** | Double-entry ledger — har sale, purchase, payroll, refund, cash movement **auto-journal** banta hai · Dashboard · Chart of accounts · Journals · P&L, Balance sheet, Cash flow, Trial balance, General ledger · Budgets, Forecasts, Allocations · Fixed assets (depreciation), Accruals/Prepayments, Landed costs, Provisions, FX · AR/AP (customer accounts, collections, supplier bills/payments/credit notes/statements, payment proposals) · Banking (accounts, transfers, statement import, reconciliation, cheques) · Periods & fiscal-year close · Tax returns, Withholding tax, E-invoices · Food cost, Menu profitability, Tips · Posting exceptions/log, consolidation, exports |
| **Reports** | Sales, Products, Categories, Payment methods, Tax, Staff, Branches, Hourly, Cancellations, Inventory, Delivery (+CSV export) |
| **Settings** | Services, Translations, Currency rates, Taxes, Notifications & templates, Reservation, Printers/Print agents, Application, Appearance, Currency, POS, Kitchen, QR ordering, PWA, Two-factor (TOTP), Password recovery (+SMTP), Filesystem, PDF |

## POS Operator (sirf order + bill print)
`pos_operator` role ka login seedha **full-screen POS** kholta hai - koi menu, report ya payment nahi. Wo sirf order daalta hai aur
**"Place order & print bill"** dabata hai (saath me "Print kitchen ticket" ka option). Payment cashier leta hai.
Cashier/manager ke **Payment** window me bhi ab *"Print receipt after payment"* checkbox aur *"Print bill first"* button hai.
Demo: login page par **POS Operator** card.

## Support & kitchen auto-print
- **🛟 Help & support** (top bar ya account menu): koi bhi user problem likh kar super admin ko bhej sakta hai (type, urgency, kaunsi screen par tha - sab saath jata hai).
  Super admin ko notification aati hai; **Hub → Administration → Support inbox** me reply/status (open, in progress, resolved, closed). User "My tickets" me jawab dekhta hai.
  Kisi aur role ko inbox dena ho to Roles me "Support inbox" access do.
- **Kitchen screen par "🖨 Auto-print tickets"**: ON ho to har naye order ka kitchen ticket apne-aap print hota hai (station ke hisaab se). Har screen ka apna on/off; default Settings → Kitchen me.
  Browser har baar print dialog dikhata hai - bina dialog ke chalane ke liye Chrome ko `--kiosk-printing` ke saath chalao.

## Security (audit ke baad)
- Har request par signed token + role/branch permission check; branch-admin sirf apni branch (settings, roles, backup, chart of accounts head-office ke liye).
- Status (draft/approved/paid ...) sirf action button se badalta hai - browser se bheji hui value ignore; system-calculated fields (points, balance, totals) browser se set nahi hote.
- Secrets (courier API key, SMTP password) kabhi wapas nahi bheje jate; reset tokens hashed; password kam se kam 8 akshar; 6 galat try par account 10 min lock.
- Sign-out/disable marker restart ke baad bhi yaad rehta hai; CSP, X-Frame-Options, nosniff, HSTS (https par); uploads sirf safe types; courier URL se private network (SSRF) block.
- `cd backend && go test ./...` me 18 automatic tests hain (security + business flows + har resource ka spec check) - koi bhi badlav karne ke baad chalao.
- HTTPS ke liye `TLS_CERT` / `TLS_KEY` set karo ya nginx/Caddy ke peeche chalao (`TRUST_PROXY=1`).

## Production
```bash
DEMO=0 ADMIN_PASSWORD=<strong> JWT_SECRET=<long-random> backend/tablebill-backend.exe
```
Env: `ADDR`, `DB_PATH`, `DEMO`, `JWT_SECRET`, `ADMIN_PASSWORD`, `TRUST_PROXY=1` (nginx/LB ke peeche), `STATS=1`, `DISABLE_RATE_LIMIT=1` (sirf load-test).
Backup: Hub → Database → *Create backup*.

## 50,000 users — measured
Same 4-core i3 laptop (load generator bhi isi PC par): `go run ./loadtest -users 50000 -conns 9000 -sse 4000 -think 15s`

| | p50 | p95 | p99 |
|---|---|---|---|
| menu / orders / dashboard (reads) | <1 ms | 27 ms | 77 ms |
| place an order (write, stock + journal) | 9 ms | 109 ms | 245 ms |

**3,320 requests/sec, 0 errors**, server RAM ≈ 770 MB. Kaise: stateless JWT, menu snapshot in memory, singleflight+stale-while-revalidate caches,
SQLite WAL (32 readers + 1 writer queue), SSE live updates coalesced per branch, per-IP rate limits, bcrypt concurrency cap.

Sach baat: Windows PC ek saath ~16k sockets se zyada nahi deta, isliye 50k users ~9k shared connections par chalaye (request load poora 50k ka).
Writes ek SQLite writer se ~300 orders/sec tak jate hain; usse zyada ho to PostgreSQL + multiple instances chahiye.

## Jo abhi simple/limited hai (honestly)
- **Passkeys (WebAuthn)** nahi hai — 2FA (authenticator app) hai.
- **Tax-authority e-invoicing, FCM push, SMS, WhatsApp, courier APIs**: settings/logs/records hain, par asli provider se jodne ke liye unke credentials aur adapter chahiye (custom courier ko JSON POST jata hai).
- Print agents ke records hain (key bante hain) par silent-printing agent program nahi hai; browser print kaam karta hai.
- Money 2 decimals me store hota hai; multi-currency sirf rates + FX revaluation tak.
- Live map me tiles nahi — riders ki positions scaled board par dikhti hain.
- Backup restore browser se nahi (server band karke file badlo).

## Code ka naksha
`resource.go` (generic CRUD engine) · `res_*.go` (har module ke resources) · `pos.go` (orders/pay/refund) · `ledger.go`+`acc.go` (accounting) · `hr.go` · `delivery.go` · `inventory.go` · `reports.go` · `frontend/` (screens + proxy server) · `backend/loadtest/`
