# AI Finance Tracker

## Project Overview

A personal finance tracker that ingests Chase UK PDF bank statements, categorises transactions automatically, and displays spending in weekly and monthly views with charts and a natural language chat interface.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) — `localhost:5173` |
| Backend | Python FastAPI — `localhost:8000` |
| Database | SQLite via SQLAlchemy |
| LLM (chat) | OpenAI `gpt-4o` via OpenAI API |
| LLM (categorisation) | OpenAI `gpt-4o-mini` via OpenAI API |
| PDF parsing | pdfplumber |

## Categories

`Groceries` · `Eating Out` · `Going Out` · `Sport` · `Vending Machine` · `Transport` · `Subscriptions` · `Shopping` · `Household` · `Rent` · `Health` · `Miscellaneous` · `Parents` · `Tutoring`

Defined by `backend/rules.json`; `Parents` and `Tutoring` are income categories.

## Key Conventions

- **Transfers** are excluded from all spending views
- **Amounts**: negative = money out, positive = money in (refund)
- **Dashboard** has weekly / monthly / transactions tabs with shared year + month selectors
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
