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

**Do not hardcode a category list anywhere.** `backend/rules.json` is the live source of
truth: it is editable from the Rules tab, written by the review flow, and hot-reloaded on
mtime change. Always read it through `backend/services/rules.py` — `rules.categories()`,
`rules.income_categories()`, `rules.spending_categories()` — and never cache the result at
import time. A category may legitimately have zero keywords.

Current set (user-defined, will change): `One off` · `Rent` · `Groceries` · `Going Out` ·
`Transport` · `Shopping` · `Subscriptions` · `Income`, with `Income` flagged as income.

## Key Conventions

- **`Excluded`** is a reserved category meaning "not spending" — filtered out of every
  view. Read it from `rules.EXCLUDED`, never hardcode the string
- **Import never categorises or excludes anything by itself.** Every row lands with an
  empty category and appears in Review, grouped by merchant; only the user's own keyword
  rules or an explicit review decision assign a category, `Excluded` included. The
  statement's `transaction_type` is recorded but never acted on
- **Amounts**: negative = money out, positive = money in (refund)
- **Dashboard** has weekly / monthly / transactions tabs with shared year + month selectors
- **Keyword matching is whole-word and longest-match-wins**, so `rules.json` has no order
  dependence and `round` cannot swallow "Ground Coffee". Always test through
  `rules.matches(keyword, merchant)` — never write a bare `in` substring check. Excluded
  keywords remain the exception to length: they are checked first and win regardless
- **A review card suggests the whole merchant name** as the keyword, with the stem before
  any ` - ` tail offered as a one-click alternative for recurring payees. Chase gives clean
  payee names, so precision costs nothing — `rules.suggest_keywords()` does not try to
  reduce a merchant to one token
- **`GET /api/rules/preview?keyword=&category=`** reports which merchants already on file a
  candidate keyword would claim and which are filed elsewhere. Review and the Rules editor
  both show it live, so a too-broad keyword is visible before it is saved
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
