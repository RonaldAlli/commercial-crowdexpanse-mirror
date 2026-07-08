# CrowdExpanse Commercial

Independent greenfield application for `commercial.crowdexpanse.com`.

## Architecture rules

- No shared database with DealFlow
- No shared application code with DealFlow
- No imported DealFlow components
- No dependencies on existing CrowdExpanse apps
- Built only for internal commercial acquisitions workflows

## MVP included in this scaffold

- Authentication shell
- Dashboard
- Seller records
- Buyer records
- Commercial property records
- Opportunity pipeline
- Commercial deal analyzer
- Tasks
- Notes
- Activity timeline
- File upload surface

## Stack

- Next.js App Router
- Tailwind CSS
- Prisma
- PostgreSQL

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` for the dedicated commercial database.
3. Run:

```bash
npm install
npm run db:generate
npm run dev
```

Optional database setup:

```bash
npm run db:push
npm run db:seed
```

## Demo login

- Email: `operator@commercial.crowdexpanse.com`
- Password: `commercial-demo`

Override those with `DEMO_EMAIL` and `DEMO_PASSWORD` in `.env` until full database-backed auth is wired.
