# AI Finance Tracker

## Project Overview

A personal finance tracker that ingests Chase UK PDF bank statements, categorises transactions by keyword rules with a manual review step for anything unmatched, and displays spending in weekly and monthly views with charts and a natural language chat interface.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) — `localhost:5173` |
| Backend | Python FastAPI — `localhost:8000` |
| Database | SQLite via SQLAlchemy |
| LLM (chat) | OpenAI `gpt-4o` via OpenAI API |
| PDF parsing | pdfplumber |

There is no LLM in the categorisation path — it is keyword rules plus manual review.

## Categories

`Groceries` · `Eating Out` · `Going Out` · `Sport` · `Vending Machine` · `Transport` · `Subscriptions` · `Shopping` · `Household` · `Rent` · `Health` · `Miscellaneous` · `Parents` · `Tutoring`

Defined by `backend/rules.json`; `Parents` and `Tutoring` are income categories. The file
is editable from the Rules tab and hot-reloaded, so it is the live source of truth — read
it through `backend/services/rules.py`, never cache category lists at import time.

## Key Conventions

- **`Excluded`** is a reserved category meaning "not spending" — filtered out of every
  view. Read it from `rules.EXCLUDED`, never hardcode the string
- **Import never categorises or excludes anything by itself.** Every row lands
  uncategorised and appears in Review; only the user's own keyword rules or an explicit
  review decision assign a category, `Excluded` included
- **Amounts**: negative = money out, positive = money in (refund)
- **Dashboard** has weekly / monthly / transactions tabs with shared year + month selectors
- **Categorisation** is rules-only. Upload applies keyword rules; whatever is left keeps an
  empty category and appears in the Review tab, grouped by merchant. Nothing is auto-assigned.
- **Keyword matching is longest-match-wins**, so `rules.json` has no order dependence
- **Rules API is namespaced under `/api`** because the SPA and the API share one origin —
  an unprefixed `GET /rules` would shadow the `/rules` page on a hard refresh
- **Chat** uses GPT-4o tool calling over the SQL query functions in `backend/services/tools.py` — there is no vector store or RAG; `search_transactions` is a substring match on merchant
- **Backend docs** available at `localhost:8000/docs`
- `OPENAI_API_KEY` lives in `backend/.env` — never commit this file

## Design Principles

- **Minimalist** — no unnecessary visual noise; every element earns its place
- Use **shadcn/ui** components throughout (buttons, tables, cards, inputs, dialogs)
- Typography and spacing should feel considered and intentional
- **Neutral colour palette** with a single restrained accent colour
- The UI should look like a developer who cares about design built it — no gradients for the sake of it, no oversized hero text, no AI-looking purple dashboards
- **Charts** via Recharts, styled to match the overall minimal aesthetic
