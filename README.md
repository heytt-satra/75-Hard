# Mission 75: Heytt OS

Private mobile-first web app and PWA for the 75-day discipline challenge starting June 2, 2026.

## What It Tracks

- Daily core checklist with restart logic.
- Tera, Lensr, and internship/job proof of work.
- INR 200,000 monthly revenue goal.
- Workout, water, food, reading, writing, body weight, progress photos, and daily review.
- JSON and CSV exports so your data remains portable.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints in the terminal.

## Supabase Setup

1. Create a free Supabase project.
2. Open the SQL editor and run `supabase.sql`.
3. Copy `.env.example` to `.env`.
4. Fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The app works locally without these keys. With keys, daily logs, revenue entries, and progress photos can sync to Supabase.

Do not put the Postgres connection string in client code. Keep it only in `.env.local` without a `VITE_` prefix for local admin scripts.

## Challenge Rules

Core tasks restart the challenge when missed:

- Wake by 6:30 AM.
- Complete one workout.
- Read 30 minutes and write what you learned.
- Hit the water goal.
- Keep food clean.
- Complete a focused writing session.
- Fill Tera proof.
- Fill Lensr proof.
- Fill internship/job proof.
- Complete the daily review.

Travel or sick days can be paused with a required note.
# 75-Hard
