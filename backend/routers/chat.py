import json
import os
from datetime import date

from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services import tools as tool_service
from services.categoriser import INCOME_CATEGORIES

load_dotenv()

router = APIRouter(prefix="/chat", tags=["chat"])

_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

_income_list = " and ".join(INCOME_CATEGORIES) if INCOME_CATEGORIES else "none"
_SYSTEM_BASE = (
    "You are a personal finance assistant. The user is asking questions about their own "
    "UK bank transactions. Use the available tools to query their transaction data and "
    "answer accurately. Format all currency as £X.XX. If the data does not contain enough "
    "information to answer, say so clearly. Do not invent transactions or amounts. "
    f"{_income_list} are income categories (money coming in, positive amounts). "
    "All other categories are spending (money going out, negative amounts). "
    "When asked about income or earnings, use get_category_total with the relevant income category."
)


def _system_prompt() -> str:
    today = date.today().isoformat()
    return f"{_SYSTEM_BASE} Today's date is {today}."


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = []


@router.post("")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    messages = [{"role": "system", "content": _system_prompt()}]
    for m in req.history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": req.message})

    tool_calls_made = 0
    seen_ids: set[int] = set()
    referenced_transactions: list[dict] = []

    # Tool-calling loop — runs until the model stops requesting tools
    while True:
        response = _client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tool_service.DEFINITIONS,
            tool_choice="auto",
            temperature=0.2,
        )

        msg = response.choices[0].message

        if not msg.tool_calls:
            return {
                "answer": msg.content or "",
                "transactions_used": tool_calls_made,
                "referenced_transactions": referenced_transactions,
            }

        # Append the assistant turn with tool_calls
        messages.append(msg)

        # Execute each tool, collect structured transactions, append results
        for call in msg.tool_calls:
            tool_calls_made += 1
            args = json.loads(call.function.arguments)
            text, txns = tool_service.run(call.function.name, args, db)

            for tx in txns:
                if tx["id"] not in seen_ids:
                    seen_ids.add(tx["id"])
                    referenced_transactions.append(tx)

            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": text,
            })
