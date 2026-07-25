# AI Finance Tracker

A personal finance tracker that ingests bank statement PDFs, categorises transactions automatically, and lets you explore your spending through weekly/monthly charts and a natural language chat interface.

## What it does

- **Upload** bank statement PDFs — transactions are parsed and saved automatically
- **Categorise** transactions using keyword rules you define, with GPT-4o-mini as a fallback for anything unmatched
- **Dashboard** — weekly and monthly spending breakdowns by category
- **Trends** — week-by-week and month-by-month spend charts across your history
- **Chat** — ask questions in plain English ("how much did I spend on eating out last month?") powered by GPT-4o

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Python FastAPI |
| Database | SQLite |
| LLM | OpenAI GPT-4o / GPT-4o-mini |
| PDF parsing | pdfplumber |

## Prerequisites

- Python 3.10+
- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

## Running it

Double-click **`run.command`** in Finder (or run `./run.command`). It builds the
frontend if it has changed, serves the whole app from FastAPI on
`http://localhost:8000`, and opens your browser. Close the Terminal window to stop it.

The first run creates the Python virtualenv and installs dependencies, so it takes
a minute; after that it starts in a couple of seconds. You still need `backend/.env`
and `backend/rules.json` in place — see [Setup](#setup) below.

For frontend development, `npm run dev` on port 5173 still works as before, talking
to the backend on port 8000.

### Putting it in the Dock

Run **`./make-app.command`** once to build `Finance Tracker.app`, then drag that to
your Dock — or into `/Applications` to get it in Launchpad and Spotlight. It opens
`run.command` in Terminal, so you get the live log output and can stop the server with
Ctrl-C, or by closing the window.

Closing the *browser* window does not stop the server — use Ctrl-C in the Terminal
window for that.

The bundle hard-codes the path to this project, so re-run `make-app.command` if you
ever move or rename the folder, then re-copy it to `/Applications`.

**Keep the project out of `~/Documents`, `~/Desktop` and `~/Downloads`.** macOS protects
those, and an unsigned app bundle is refused permission to execute anything inside them —
it fails silently, so the app appears to do nothing at all.

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd ai-finance-tracker
```

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
python3 -m pip install -r requirements.txt
```

Create a `.env` file:

```bash
echo "OPENAI_API_KEY=your_key_here" > .env
```

Set up your categorisation rules (see [Configuring rules](#configuring-rules)):

```bash
cp rules.example.json rules.json
```

Start the backend:

```bash
python3 -m uvicorn main:app --reload
```

Runs on `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd ..               # back to project root
npm install
npm run dev
```

Runs on `http://localhost:5173`.

## Configuring rules

Copy `backend/rules.example.json` to `backend/rules.json` and edit it. This file is gitignored so your personal rules stay private.

```json
{
  "excluded": ["round up", "cashback"],
  "income_categories": ["Salary", "Freelance"],
  "rules": {
    "Groceries": ["tesco", "lidl", "whole foods"],
    "Eating Out": ["mcdonald", "starbucks", "uber eats"],
    "Transport": ["tfl", "uber", "shell"],
    "Subscriptions": ["netflix", "spotify", "github"],
    "Salary": ["payroll", "wages"],
    "Freelance": ["invoice", "payment received"]
  }
}
```

**How it works:**

- `excluded` — transactions containing these keywords are marked as transfers and hidden from spending views
- `income_categories` — categories treated as income (positive amounts) rather than spending
- `rules` — maps category names to keyword lists; a transaction matches if its merchant name contains any of the keywords (case-insensitive). Order matters within each list: put more specific keywords before broader ones (e.g. `"amazon music"` before `"amazon"`)

Any transaction not matched by a rule is sent to GPT-4o-mini to categorise automatically.

## Supported banks

Currently parses **Chase UK** PDF statements. The parser lives in `backend/services/parser.py` — it can be adapted for other banks by adjusting the PDF parsing logic.

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required. Your OpenAI API key. |
