"""TRACEPRO backend – Food traceability API."""
import os
import csv
import json
import uuid
import hashlib
import secrets
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal, Annotated
from io import BytesIO

import jwt
import stripe
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from storage import put_object, get_object

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("tracepro")
logging.basicConfig(level=logging.INFO)

# ---------------- Mongo ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url, tz_aware=True)
db = client[os.environ["DB_NAME"]]

# ---------------- Auth utils ----------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_MINUTES = int(os.getenv("ACCESS_MINUTES", "1440"))
ph = PasswordHasher()
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# ---------------- Stripe (web SaaS subscription) ----------------
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "sk_test_emergent")
stripe.api_key = STRIPE_API_KEY
# Emergent-managed test proxy (no user key required).
if "sk_test_emergent" in STRIPE_API_KEY:
    stripe.api_base = "https://integrations.emergentagent.com/stripe"
SUB_PRICE_CENTS = 1299
SUB_CURRENCY = "eur"
TRIAL_DAYS = 15


async def _stripe(fn, **kwargs):
    """Run the synchronous Stripe SDK off the event loop."""
    return await asyncio.to_thread(fn, **kwargs)


def now() -> datetime:
    return datetime.now(timezone.utc)


def make_jwt(user: dict) -> str:
    return jwt.encode(
        {
            "sub": user["id"],
            "org": user["org_id"],
            "role": user["role"],
            "exp": now() + timedelta(minutes=ACCESS_MINUTES),
        },
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )


async def current_user(token: Annotated[Optional[str], Depends(oauth2)]):
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload["sub"]
        user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "Compte introuvable")
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Token invalide")


async def require_manager(user=Depends(current_user)):
    if user["role"] != "responsable":
        raise HTTPException(403, "Réservé au responsable")
    return user


async def current_user_flex(
    header_token: Annotated[Optional[str], Depends(oauth2)] = None,
    token: Optional[str] = Query(None),
):
    """Auth from Authorization header OR ?token= query param (for file downloads
    opened via window.open / Linking which cannot set headers)."""
    tok = header_token or token
    if not tok:
        raise HTTPException(401, "Non authentifié")
    try:
        payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "Compte introuvable")
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Token invalide")


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    company_name: str
    business_type: str
    manager_name: str
    address: str
    phone: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


class InviteIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: Literal["responsable", "employe"] = "employe"


class ReceptionIn(BaseModel):
    client_id: Optional[str] = None  # offline idempotency key
    supplier: str
    product: str
    reference: Optional[str] = None
    batch_number: str
    reception_date: str  # YYYY-MM-DD
    dlc: Optional[str] = None  # YYYY-MM-DD
    quantity: float
    unit: str = "kg"
    temperature: Optional[float] = None
    conforming: bool = True
    comment: Optional[str] = None
    label_photo: Optional[str] = None  # storage path
    delivery_photo: Optional[str] = None
    barcode: Optional[str] = None


class TemperatureIn(BaseModel):
    client_id: Optional[str] = None
    zone: str
    zone_type: str  # chambre_froide, congelateur, vitrine, reserve, autre
    temperature: float
    conforming: bool = True
    comment: Optional[str] = None


class CleaningIn(BaseModel):
    client_id: Optional[str] = None
    zone: str
    operation_type: str
    status: str = "termine"
    comment: Optional[str] = None


class NonConformityIn(BaseModel):
    client_id: Optional[str] = None
    problem_type: str
    concerned_item: str
    batch_number: Optional[str] = None
    description: str
    photo: Optional[str] = None
    corrective_action: Optional[str] = None
    responsible: Optional[str] = None
    status: Literal["ouverte", "en_cours", "resolue"] = "ouverte"


class LossIn(BaseModel):
    client_id: Optional[str] = None
    product: str
    batch_number: Optional[str] = None
    quantity: float
    unit: str = "kg"
    reason: str
    estimated_value: Optional[float] = None
    comment: Optional[str] = None
    photo: Optional[str] = None


class ReminderConfigIn(BaseModel):
    temperature_enabled: bool = True
    temperature_times: List[str] = ["08:00", "18:00"]
    cleaning_enabled: bool = True
    cleaning_time: str = "20:00"
    custom_controls: List[dict] = []  # [{"name": str, "time": "HH:MM"}]


class CorrectionIn(BaseModel):
    changes: dict
    reason: str = Field(min_length=1)


class ProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    business_type: Optional[str] = None
    manager_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


# ---------------- FastAPI setup ----------------
app = FastAPI(title="TRACEPRO API")
api = APIRouter(prefix="/api")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.receptions.create_index("org_id")
    await db.receptions.create_index("batch_number")
    await db.temperatures.create_index("org_id")
    await db.stripe_events.create_index("event_id", unique=True)
    logger.info("TRACEPRO ready")


# ---------------- Helpers ----------------
async def get_org(org_id: str) -> dict:
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Organisation introuvable")
    return org


async def create_doc(collection, body, user, control_type=None) -> dict:
    """Insert a document with offline idempotency.
    If body carries a `client_id` that already exists for this org, the existing
    document is returned instead of creating a duplicate (safe for offline sync).
    When `control_type` is given, an immutable signature block is attached."""
    data = body.model_dump()
    client_id = data.pop("client_id", None)
    doc_id = client_id or str(uuid.uuid4())
    if client_id:
        existing = await collection.find_one({"id": doc_id, "org_id": user["org_id"]}, {"_id": 0})
        if existing:
            return existing
    ts = now()
    doc = {
        "id": doc_id,
        "org_id": user["org_id"],
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": ts,
        **data,
    }
    if control_type:
        doc["signature"] = {
            "user_id": user["id"],
            "user_name": user["name"],
            "org_id": user["org_id"],
            "control_type": control_type,
            "signed_at": ts.isoformat(),
            "status": data.get("status") or "effectue",
            "comment": data.get("comment"),
        }
    await collection.insert_one(doc)
    doc.pop("_id", None)
    return doc


def compute_subscription_status(org: dict) -> dict:
    """Return a friendly subscription status dict for the client.

    Web access requires a real Stripe subscription (card collected at signup,
    15-day trial then 12,99 €/mois). The local `trial_end` is informational only.
    """
    n = now()
    sub_id = org.get("stripe_subscription_id")
    status = org.get("stripe_status")  # trialing, active, past_due, canceled
    cpe = org.get("current_period_end")
    trial_end = org.get("trial_end")
    cancel = bool(org.get("cancel_at_period_end", False))
    base = {
        "plan": "TRACEPRO PRO",
        "price": "12,99 €/mois",
        "trial_end": trial_end,
        "current_period_end": cpe,
        "cancel_at_period_end": cancel,
        "stripe_subscription_id": sub_id,
    }
    if sub_id and status in ("trialing", "active", "past_due"):
        expired = cancel and cpe is not None and cpe <= n
        has_access = status in ("trialing", "active") and not expired
        if expired:
            state = "expire"
        elif status == "active":
            state = "actif"
        elif status == "trialing":
            state = "essai"
        else:
            state = "past_due"
        days_left = None
        if status == "trialing" and trial_end and trial_end > n:
            days_left = max(0, (trial_end - n).days)
        return {**base, "state": state, "has_access": has_access, "days_left": days_left}
    # No active Stripe subscription yet.
    return {**base, "state": "inactif", "has_access": False}


# ==================== AUTH ====================
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(409, "Cet e-mail est déjà utilisé")
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    trial_end = now() + timedelta(days=15)
    org = {
        "id": org_id,
        "company_name": body.company_name,
        "business_type": body.business_type,
        "address": body.address,
        "phone": body.phone,
        "trial_end": trial_end,
        "stripe_status": "none",
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "created_at": now(),
    }
    user = {
        "id": user_id,
        "org_id": org_id,
        "email": body.email.lower(),
        "name": body.manager_name,
        "role": "responsable",
        "password_hash": ph.hash(body.password),
        "created_at": now(),
    }
    await db.organizations.insert_one(org)
    await db.users.insert_one(user)
    user_out = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    org_out = {k: v for k, v in org.items() if k != "_id"}
    return {"access_token": make_jwt(user), "user": user_out, "organization": org_out}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user:
        raise HTTPException(401, "E-mail ou mot de passe incorrect")
    try:
        ph.verify(user["password_hash"], body.password)
    except VerifyMismatchError:
        raise HTTPException(401, "E-mail ou mot de passe incorrect")
    user_out = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})
    return {"access_token": make_jwt(user), "user": user_out, "organization": org}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})
    return {"user": user, "organization": org, "subscription": compute_subscription_status(org)}


@api.post("/auth/forgot-password")
async def forgot(body: ForgotIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        raw = secrets.token_urlsafe(24)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        await db.reset_tokens.insert_one({
            "user_id": user["id"],
            "token_hash": digest,
            "expires_at": now() + timedelta(minutes=30),
            "used": False,
        })
        # DEV: return the token so the user can copy it in the app (no SMTP configured).
        return {"message": "Instructions envoyées si le compte existe.", "dev_token": raw}
    return {"message": "Instructions envoyées si le compte existe."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    digest = hashlib.sha256(body.token.encode()).hexdigest()
    doc = await db.reset_tokens.find_one_and_update(
        {"token_hash": digest, "used": False, "expires_at": {"$gt": now()}},
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(400, "Jeton invalide ou expiré")
    await db.users.update_one(
        {"id": doc["user_id"]},
        {"$set": {"password_hash": ph.hash(body.new_password)}},
    )
    return {"message": "Mot de passe réinitialisé"}


@api.patch("/organization")
async def update_org(body: ProfileUpdate, user=Depends(require_manager)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.organizations.update_one({"id": user["org_id"]}, {"$set": updates})
    return await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})


# ==================== USERS ====================
@api.get("/users")
async def list_users(user=Depends(current_user)):
    docs = await db.users.find(
        {"org_id": user["org_id"]}, {"_id": 0, "password_hash": 0}
    ).to_list(200)
    return docs


@api.post("/users/invite")
async def invite_user(body: InviteIn, user=Depends(require_manager)):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(409, "Cet e-mail est déjà utilisé")
    new_user = {
        "id": str(uuid.uuid4()),
        "org_id": user["org_id"],
        "email": body.email.lower(),
        "name": body.name,
        "role": body.role,
        "password_hash": ph.hash(body.password),
        "created_at": now(),
    }
    await db.users.insert_one(new_user)
    return {k: v for k, v in new_user.items() if k not in ("password_hash", "_id")}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_manager)):
    if user_id == user["id"]:
        raise HTTPException(400, "Impossible de supprimer votre propre compte")
    r = await db.users.delete_one({"id": user_id, "org_id": user["org_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Utilisateur introuvable")
    return {"ok": True}


# ==================== SUBSCRIPTION ====================
@api.get("/subscription/status")
async def sub_status(user=Depends(current_user)):
    org = await get_org(user["org_id"])
    return compute_subscription_status(org)


@api.post("/subscription/subscribe")
async def subscribe(user=Depends(require_manager)):
    """Activate the paid subscription (Stripe test-mode simulation).
    Since we can't collect a real card in Expo Go without native builds,
    we mark the org as `active` in Stripe simulated mode."""
    org = await get_org(user["org_id"])
    await db.organizations.update_one(
        {"id": org["id"]},
        {"$set": {
            "stripe_status": "active",
            "current_period_end": now() + timedelta(days=30),
            "cancel_at_period_end": False,
        }},
    )
    org = await get_org(org["id"])
    return compute_subscription_status(org)


@api.post("/subscription/cancel")
async def cancel_sub(user=Depends(require_manager)):
    org = await get_org(user["org_id"])
    # In-app cancellation: keep access until the end of the paid/trial period.
    await db.organizations.update_one(
        {"id": org["id"]},
        {"$set": {"cancel_at_period_end": True}},
    )
    org = await get_org(org["id"])
    return compute_subscription_status(org)


# ==================== STRIPE WEB BILLING ====================
class CheckoutIn(BaseModel):
    origin: str


@api.post("/billing/checkout")
async def billing_checkout(body: CheckoutIn, user=Depends(require_manager)):
    """Create a Stripe-hosted subscription Checkout (15-day trial then 12,99 €/mois)."""
    org = await get_org(user["org_id"])
    origin = body.origin.rstrip("/")
    webhook_url = f"{origin}/api/stripe/webhook"
    meta = {"app_org_id": org["id"], "app_user_id": user["id"]}
    try:
        session = await _stripe(
            stripe.checkout.Session.create,
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": SUB_CURRENCY,
                    "product_data": {"name": "TRACEPRO PRO"},
                    "unit_amount": SUB_PRICE_CENTS,
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            subscription_data={"trial_period_days": TRIAL_DAYS, "metadata": meta},
            success_url=f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/billing/canceled",
            metadata={**meta, "webhook_url": webhook_url},
        )
    except Exception as e:
        raise HTTPException(502, f"Erreur Stripe: {e}")
    await db.organizations.update_one(
        {"id": org["id"]}, {"$set": {"checkout_session_id": session.id}}
    )
    return {"url": session.url, "session_id": session.id}


async def _activate_from_session(session) -> Optional[dict]:
    """Mark an org as trialing from a completed Stripe checkout session."""
    meta = session.get("metadata") or {}
    org_id = meta.get("app_org_id")
    if not org_id:
        return None
    n = now()
    trial_end = n + timedelta(days=TRIAL_DAYS)
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {
            "stripe_status": "trialing",
            "stripe_customer_id": session.get("customer"),
            "stripe_subscription_id": session.get("subscription") or session.get("id"),
            "trial_end": trial_end,
            "current_period_end": trial_end,
            "cancel_at_period_end": False,
        }},
    )
    return await db.organizations.find_one({"id": org_id}, {"_id": 0})


@api.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user=Depends(current_user)):
    try:
        session = await _stripe(stripe.checkout.Session.retrieve, id=session_id)
    except Exception as e:
        raise HTTPException(400, f"Session introuvable: {e}")
    meta = session.get("metadata") or {}
    if meta.get("app_org_id") != user["org_id"]:
        raise HTTPException(403, "Session non autorisée")
    if session.get("status") == "complete":
        await _activate_from_session(session)
    org = await get_org(user["org_id"])
    return compute_subscription_status(org)


@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Receive Stripe events forwarded by the Emergent proxy (no local signature)."""
    payload = await request.body()
    try:
        event = json.loads(payload.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Payload invalide")
    event_id = event.get("id")
    if event_id:
        try:
            await db.stripe_events.insert_one(
                {"event_id": event_id, "type": event.get("type"), "received_at": now()}
            )
        except Exception as exc:
            if exc.__class__.__name__ == "DuplicateKeyError":
                return {"received": True}
    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    if etype == "checkout.session.completed":
        await _activate_from_session(obj)
    elif etype in ("customer.subscription.updated", "customer.subscription.deleted"):
        cust = obj.get("customer")
        if cust:
            cpe = obj.get("current_period_end")
            await db.organizations.update_one(
                {"stripe_customer_id": cust},
                {"$set": {
                    "stripe_status": obj.get("status"),
                    "cancel_at_period_end": bool(obj.get("cancel_at_period_end")),
                    "current_period_end": (
                        datetime.fromtimestamp(cpe, tz=timezone.utc) if cpe else None
                    ),
                }},
            )
    return {"received": True}


# ==================== FILES ====================
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()[:5]
    path = f"tracepro/uploads/{user['org_id']}/{uuid.uuid4()}.{ext}"
    try:
        put_object(path, data, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(500, f"Échec de l'envoi: {e}")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": user["org_id"],
        "path": path,
        "content_type": file.content_type,
        "size": len(data),
        "created_at": now(),
    })
    return {"path": path}


@api.get("/files/{path:path}")
async def download_file(path: str, token: Optional[str] = Query(None), user=Depends(current_user)):
    # ownership check
    doc = await db.files.find_one({"path": path})
    if not doc or doc.get("org_id") != user["org_id"]:
        raise HTTPException(404, "Fichier introuvable")
    try:
        content, ct = get_object(path)
    except Exception:
        raise HTTPException(404, "Fichier introuvable")
    return Response(content=content, media_type=ct)


# ==================== RECEPTIONS ====================
@api.post("/receptions")
async def create_reception(body: ReceptionIn, user=Depends(current_user)):
    return await create_doc(db.receptions, body, user)


@api.get("/receptions")
async def list_receptions(user=Depends(current_user), limit: int = 200):
    docs = await db.receptions.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api.get("/receptions/{rid}")
async def get_reception(rid: str, user=Depends(current_user)):
    doc = await db.receptions.find_one({"id": rid, "org_id": user["org_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Réception introuvable")
    return doc


@api.delete("/receptions/{rid}")
async def delete_reception(rid: str, user=Depends(require_manager)):
    r = await db.receptions.delete_one({"id": rid, "org_id": user["org_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Réception introuvable")
    return {"ok": True}


# ==================== BATCHES / TRACEABILITY ====================
@api.get("/batches/{batch_number}")
async def get_batch(batch_number: str, user=Depends(current_user)):
    receptions = await db.receptions.find(
        {"org_id": user["org_id"], "batch_number": batch_number}, {"_id": 0}
    ).to_list(50)
    if not receptions:
        raise HTTPException(404, "Lot introuvable")
    losses = await db.losses.find(
        {"org_id": user["org_id"], "batch_number": batch_number}, {"_id": 0}
    ).to_list(50)
    ncs = await db.non_conformities.find(
        {"org_id": user["org_id"], "batch_number": batch_number}, {"_id": 0}
    ).to_list(50)
    total_received = sum(r.get("quantity", 0) for r in receptions)
    total_lost = sum(l.get("quantity", 0) for l in losses)
    remaining = max(0, total_received - total_lost)
    # timeline
    timeline = []
    for r in receptions:
        timeline.append({
            "type": "reception",
            "date": r.get("created_at"),
            "title": f"Réception - {r.get('product')}",
            "detail": f"{r.get('quantity')} {r.get('unit')} de {r.get('supplier')}",
            "user": r.get("created_by_name"),
        })
    for l in losses:
        timeline.append({
            "type": "perte",
            "date": l.get("created_at"),
            "title": f"Perte - {l.get('product')}",
            "detail": f"{l.get('quantity')} {l.get('unit')} - {l.get('reason')}",
            "user": l.get("created_by_name"),
        })
    for n in ncs:
        timeline.append({
            "type": "non_conformite",
            "date": n.get("created_at"),
            "title": f"NC - {n.get('problem_type')}",
            "detail": n.get("description"),
            "user": n.get("created_by_name"),
        })
    timeline.sort(key=lambda x: x["date"] or now(), reverse=True)
    return {
        "batch_number": batch_number,
        "receptions": receptions,
        "losses": losses,
        "non_conformities": ncs,
        "total_received": total_received,
        "total_lost": total_lost,
        "remaining": remaining,
        "timeline": timeline,
    }


# ==================== TEMPERATURES ====================
@api.post("/temperatures")
async def create_temperature(body: TemperatureIn, user=Depends(current_user)):
    return await create_doc(db.temperatures, body, user, control_type="temperature")


@api.get("/temperatures")
async def list_temperatures(user=Depends(current_user), limit: int = 200):
    docs = await db.temperatures.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ==================== CLEANING ====================
@api.post("/cleaning")
async def create_cleaning(body: CleaningIn, user=Depends(current_user)):
    return await create_doc(db.cleaning, body, user, control_type="cleaning")


@api.get("/cleaning")
async def list_cleaning(user=Depends(current_user), limit: int = 200):
    docs = await db.cleaning.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ==================== NON-CONFORMITIES ====================
@api.post("/non-conformities")
async def create_nc(body: NonConformityIn, user=Depends(current_user)):
    return await create_doc(db.non_conformities, body, user)


@api.get("/non-conformities")
async def list_ncs(user=Depends(current_user), limit: int = 200):
    docs = await db.non_conformities.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api.patch("/non-conformities/{nc_id}")
async def update_nc(nc_id: str, status: str, user=Depends(current_user)):
    if status not in ("ouverte", "en_cours", "resolue"):
        raise HTTPException(400, "Statut invalide")
    r = await db.non_conformities.update_one(
        {"id": nc_id, "org_id": user["org_id"]},
        {"$set": {"status": status}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Non-conformité introuvable")
    return {"ok": True}


# ==================== LOSSES ====================
@api.post("/losses")
async def create_loss(body: LossIn, user=Depends(current_user)):
    return await create_doc(db.losses, body, user)


@api.get("/losses")
async def list_losses(user=Depends(current_user), limit: int = 200):
    docs = await db.losses.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ==================== SEARCH ====================
@api.get("/search")
async def search(q: str, user=Depends(current_user)):
    q_low = q.lower().strip()
    if not q_low:
        return {"receptions": [], "batches": []}
    receptions = await db.receptions.find(
        {"org_id": user["org_id"]}, {"_id": 0}
    ).to_list(1000)
    matched = [
        r for r in receptions
        if q_low in (r.get("batch_number", "") or "").lower()
        or q_low in (r.get("product", "") or "").lower()
        or q_low in (r.get("supplier", "") or "").lower()
        or q_low in (r.get("reference", "") or "").lower()
        or q_low in (r.get("barcode", "") or "").lower()
    ]
    # dedup batches
    batches = {}
    for r in matched:
        b = r.get("batch_number")
        if b and b not in batches:
            batches[b] = {"batch_number": b, "product": r.get("product"), "supplier": r.get("supplier"), "dlc": r.get("dlc")}
    return {"receptions": matched, "batches": list(batches.values())}


# ==================== REMINDERS ====================
DEFAULT_REMINDER = {
    "temperature_enabled": True,
    "temperature_times": ["08:00", "18:00"],
    "cleaning_enabled": True,
    "cleaning_time": "20:00",
    "custom_controls": [],
}


async def get_reminder_config(org_id: str) -> dict:
    cfg = await db.reminder_configs.find_one({"org_id": org_id}, {"_id": 0})
    if not cfg:
        return {**DEFAULT_REMINDER, "org_id": org_id}
    merged = {**DEFAULT_REMINDER, **cfg}
    return merged


async def compute_pending_controls(user) -> list:
    """Compute today's controls not yet completed. Uses real DB counts only."""
    org_id = user["org_id"]
    cfg = await get_reminder_config(org_id)
    today_start = datetime(now().year, now().month, now().day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    pending = []

    if cfg.get("temperature_enabled"):
        expected = len(cfg.get("temperature_times") or [])
        done = await db.temperatures.count_documents({"org_id": org_id, "created_at": {"$gte": today_start, "$lt": today_end}})
        remaining = max(0, expected - done)
        if remaining > 0:
            pending.append({
                "type": "temperature",
                "title": "Contrôle des températures",
                "detail": f"{remaining} contrôle(s) restant(s) aujourd'hui ({done}/{expected})",
                "route": "/temperature",
            })

    if cfg.get("cleaning_enabled"):
        done = await db.cleaning.count_documents({"org_id": org_id, "created_at": {"$gte": today_start, "$lt": today_end}})
        if done == 0:
            pending.append({
                "type": "cleaning",
                "title": "Nettoyage & désinfection",
                "detail": f"À effectuer aujourd'hui (avant {cfg.get('cleaning_time')})",
                "route": "/cleaning",
            })

    for c in (cfg.get("custom_controls") or []):
        name = c.get("name")
        if not name:
            continue
        done = await db.cleaning.count_documents({"org_id": org_id, "operation_type": name, "created_at": {"$gte": today_start, "$lt": today_end}})
        if done == 0:
            pending.append({
                "type": "custom",
                "title": name,
                "detail": f"Contrôle à effectuer (avant {c.get('time', '')})",
                "route": "/cleaning",
            })
    return pending


@api.get("/reminders/config")
async def reminders_config_get(user=Depends(current_user)):
    return await get_reminder_config(user["org_id"])


@api.put("/reminders/config")
async def reminders_config_put(body: ReminderConfigIn, user=Depends(require_manager)):
    data = body.model_dump()
    await db.reminder_configs.update_one(
        {"org_id": user["org_id"]},
        {"$set": {**data, "org_id": user["org_id"]}},
        upsert=True,
    )
    return await get_reminder_config(user["org_id"])


@api.get("/reminders/pending")
async def reminders_pending(user=Depends(current_user)):
    return {"pending": await compute_pending_controls(user)}


# ==================== STATISTICS ====================
def _week_key(dt: datetime):
    iso = dt.isocalendar()
    return f"{iso[0]}-S{iso[1]:02d}"


def _month_key(dt: datetime):
    return f"{dt.year}-{dt.month:02d}"


@api.get("/statistics")
async def statistics(user=Depends(current_user)):
    org_id = user["org_id"]
    n = now()
    receptions = await db.receptions.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    losses = await db.losses.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    temps = await db.temperatures.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    ncs = await db.non_conformities.find({"org_id": org_id}, {"_id": 0}).to_list(5000)

    # Build last 8 weeks and last 6 months buckets
    weeks = []
    for i in range(7, -1, -1):
        d = n - timedelta(weeks=i)
        weeks.append(_week_key(d))
    months = []
    seen = set()
    for i in range(5, -1, -1):
        d = (n.replace(day=1) - timedelta(days=i * 30))
        k = _month_key(d)
        if k not in seen:
            seen.add(k)
            months.append(k)

    def bucketize(items, keyfn, keyset, value=None):
        counts = {k: 0 for k in keyset}
        for it in items:
            dt = it.get("created_at")
            if not dt:
                continue
            k = keyfn(dt)
            if k in counts:
                counts[k] += (value(it) if value else 1)
        return [{"label": k, "value": round(counts[k], 2)} for k in keyset]

    lossval = lambda it: (it.get("estimated_value") or 0)

    # DLC stats
    batches = {}
    for r in receptions:
        b = r.get("batch_number")
        if b:
            batches.setdefault(b, r)
    dlc_ok = dlc_soon = dlc_expired = dlc_none = 0
    three_days = n + timedelta(days=3)
    for b, r in batches.items():
        dlc = r.get("dlc")
        if not dlc:
            dlc_none += 1
            continue
        try:
            dt = datetime.strptime(dlc, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if dt < n:
                dlc_expired += 1
            elif dt <= three_days:
                dlc_soon += 1
            else:
                dlc_ok += 1
        except Exception:
            dlc_none += 1

    temp_conform = sum(1 for t in temps if t.get("conforming", True))
    temp_nc = sum(1 for t in temps if not t.get("conforming", True))

    return {
        "weeks": weeks,
        "months": months,
        "receptions_week": bucketize(receptions, _week_key, weeks),
        "receptions_month": bucketize(receptions, _month_key, months),
        "losses_week": bucketize(losses, _week_key, weeks, lossval),
        "losses_month": bucketize(losses, _month_key, months, lossval),
        "nc_week": bucketize(ncs, _week_key, weeks),
        "nc_month": bucketize(ncs, _month_key, months),
        "temperatures_week": bucketize(temps, _week_key, weeks),
        "temperatures_month": bucketize(temps, _month_key, months),
        "temperature_conformity": {"conforme": temp_conform, "non_conforme": temp_nc},
        "dlc_stats": {"ok": dlc_ok, "proche": dlc_soon, "depassee": dlc_expired, "sans_dlc": dlc_none},
        "totals": {
            "receptions": len(receptions),
            "losses_count": len(losses),
            "losses_value": round(sum(lossval(l) for l in losses), 2),
            "nc": len(ncs),
            "temperatures": len(temps),
        },
    }


# ==================== DASHBOARD ====================
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    org_id = user["org_id"]
    today_start = datetime(now().year, now().month, now().day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    week_ago = now() - timedelta(days=7)
    month_ago = now() - timedelta(days=30)

    receptions_today = await db.receptions.count_documents({"org_id": org_id, "created_at": {"$gte": today_start, "$lt": today_end}})
    all_receptions = await db.receptions.find({"org_id": org_id}, {"_id": 0}).to_list(2000)
    losses = await db.losses.find({"org_id": org_id}, {"_id": 0}).to_list(2000)
    temps = await db.temperatures.find({"org_id": org_id}, {"_id": 0}).to_list(2000)
    ncs = await db.non_conformities.find({"org_id": org_id}, {"_id": 0}).to_list(2000)

    batches = {}
    for r in all_receptions:
        b = r.get("batch_number")
        if b:
            batches.setdefault(b, []).append(r)
    active_batches = len(batches)

    # DLC alerts (upcoming 3 days & expired)
    dlc_soon = []
    dlc_expired = []
    three_days = now() + timedelta(days=3)
    for b, rs in batches.items():
        r = rs[0]
        dlc = r.get("dlc")
        if not dlc:
            continue
        try:
            dlc_dt = datetime.strptime(dlc, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if dlc_dt < now():
                dlc_expired.append({"batch_number": b, "product": r.get("product"), "dlc": dlc})
            elif dlc_dt <= three_days:
                dlc_soon.append({"batch_number": b, "product": r.get("product"), "dlc": dlc})
        except Exception:
            pass

    temp_nc = sum(1 for t in temps if not t.get("conforming", True))
    open_ncs = sum(1 for n in ncs if n.get("status") != "resolue")

    pending_controls = await compute_pending_controls(user)

    # Notifications feed
    notifs = []
    for e in dlc_expired[:5]:
        notifs.append({"type": "danger", "title": "DLC dépassée", "detail": f"{e['product']} (lot {e['batch_number']})"})
    for e in dlc_soon[:5]:
        notifs.append({"type": "warning", "title": "DLC proche", "detail": f"{e['product']} (lot {e['batch_number']}) - {e['dlc']}"})
    for p in pending_controls:
        notifs.append({"type": "warning", "title": p["title"], "detail": p["detail"]})
    if temp_nc:
        notifs.append({"type": "warning", "title": "Températures non conformes", "detail": f"{temp_nc} enregistrement(s)"})
    if open_ncs:
        notifs.append({"type": "warning", "title": "Non-conformités ouvertes", "detail": f"{open_ncs} en cours"})

    # Stats for charts
    def in_window(items, start):
        return [i for i in items if i.get("created_at") and i["created_at"] >= start]

    return {
        "receptions_today": receptions_today,
        "active_batches": active_batches,
        "dlc_soon": len(dlc_soon),
        "dlc_expired": len(dlc_expired),
        "temp_non_conformes": temp_nc,
        "non_conformites_open": open_ncs,
        "losses_count": len(losses),
        "losses_value": sum((l.get("estimated_value") or 0) for l in losses),
        "pending_controls": pending_controls,
        "notifications": notifs,
        "dlc_soon_list": dlc_soon[:10],
        "dlc_expired_list": dlc_expired[:10],
        "week": {
            "receptions": len(in_window(all_receptions, week_ago)),
            "temperatures": len(in_window(temps, week_ago)),
            "losses": len(in_window(losses, week_ago)),
            "nc": len(in_window(ncs, week_ago)),
        },
        "month": {
            "receptions": len(in_window(all_receptions, month_ago)),
            "temperatures": len(in_window(temps, month_ago)),
            "losses": len(in_window(losses, month_ago)),
            "nc": len(in_window(ncs, month_ago)),
        },
    }


# ==================== PDF EXPORT ====================
@api.get("/export/batch/{batch_number}")
async def export_batch_pdf(batch_number: str, user=Depends(current_user_flex)):
    data = await get_batch(batch_number, user)
    org = await get_org(user["org_id"])

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=colors.HexColor("#E65100"), fontSize=22)
    story = []
    story.append(Paragraph("TRACEPRO — Fiche de traçabilité", h1))
    story.append(Paragraph(f"<b>{org.get('company_name','')}</b> — {org.get('business_type','')}", styles["Normal"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>Numéro de lot :</b> {batch_number}", styles["Heading3"]))
    story.append(Spacer(1, 8))

    if data["receptions"]:
        r = data["receptions"][0]
        rows = [
            ["Produit", r.get("product", "")],
            ["Fournisseur", r.get("supplier", "")],
            ["Référence", r.get("reference", "") or "-"],
            ["Date de réception", r.get("reception_date", "")],
            ["DLC / DDM", r.get("dlc", "") or "-"],
            ["Quantité reçue", f"{r.get('quantity')} {r.get('unit')}"],
            ["Quantité restante", f"{data['remaining']} {r.get('unit')}"],
            ["Température", f"{r.get('temperature')}°C" if r.get("temperature") is not None else "-"],
            ["Conforme", "Oui" if r.get("conforming") else "Non"],
        ]
        t = Table(rows, colWidths=[5 * cm, 11 * cm])
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F4F4F5")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 16))

    story.append(Paragraph("<b>Historique</b>", styles["Heading2"]))
    for ev in data["timeline"]:
        d = ev["date"].strftime("%d/%m/%Y %H:%M") if ev["date"] else ""
        story.append(Paragraph(f"• <b>{d}</b> — {ev['title']} : {ev['detail']} <i>({ev.get('user','')})</i>", styles["Normal"]))
        story.append(Spacer(1, 4))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=lot-{batch_number}.pdf"})


# ==================== CSV EXPORT ====================
CSV_COLUMNS = {
    "receptions": ["created_at", "supplier", "product", "reference", "batch_number", "reception_date", "dlc", "quantity", "unit", "temperature", "conforming", "comment", "created_by_name"],
    "temperatures": ["created_at", "zone", "zone_type", "temperature", "conforming", "comment", "created_by_name"],
    "cleaning": ["created_at", "zone", "operation_type", "status", "comment", "created_by_name"],
    "non_conformities": ["created_at", "problem_type", "concerned_item", "batch_number", "description", "corrective_action", "responsible", "status", "created_by_name"],
    "losses": ["created_at", "product", "batch_number", "quantity", "unit", "reason", "estimated_value", "comment", "created_by_name"],
}
CSV_COLLECTIONS = {
    "receptions": "receptions",
    "temperatures": "temperatures",
    "cleaning": "cleaning",
    "non_conformities": "non_conformities",
    "losses": "losses",
}


def _build_csv(rows: list, columns: list) -> BytesIO:
    buf = BytesIO()
    text = BytesIO()
    import io
    sio = io.StringIO()
    writer = csv.writer(sio, delimiter=";")
    writer.writerow(columns)
    for r in rows:
        line = []
        for c in columns:
            v = r.get(c)
            if isinstance(v, datetime):
                v = v.strftime("%Y-%m-%d %H:%M")
            line.append("" if v is None else v)
        writer.writerow(line)
    buf.write("\ufeff".encode("utf-8"))  # BOM for Excel UTF-8
    buf.write(sio.getvalue().encode("utf-8"))
    buf.seek(0)
    return buf


@api.get("/export/csv/{doc_type}")
async def export_csv(
    doc_type: str,
    user=Depends(current_user_flex),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    product: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
):
    if doc_type not in CSV_COLLECTIONS:
        raise HTTPException(400, "Type de document invalide")
    coll = db[CSV_COLLECTIONS[doc_type]]
    query: dict = {"org_id": user["org_id"]}  # strict company isolation
    if date_from or date_to:
        rng = {}
        if date_from:
            try:
                rng["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except Exception:
                raise HTTPException(400, "date_from invalide (YYYY-MM-DD)")
        if date_to:
            try:
                rng["$lt"] = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            except Exception:
                raise HTTPException(400, "date_to invalide (YYYY-MM-DD)")
        query["created_at"] = rng
    if product:
        query["product"] = {"$regex": product, "$options": "i"}
    if batch:
        query["batch_number"] = {"$regex": batch, "$options": "i"}
    if supplier:
        query["supplier"] = {"$regex": supplier, "$options": "i"}

    rows = await coll.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    buf = _build_csv(rows, CSV_COLUMNS[doc_type])
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=tracepro-{doc_type}.csv"})


@api.get("/export/csv-batch/{batch_number}")
async def export_batch_csv(batch_number: str, user=Depends(current_user_flex)):
    """Full lot history as CSV (receptions + losses + non-conformities)."""
    data = await get_batch(batch_number, user)
    rows = []
    for ev in data["timeline"]:
        rows.append({
            "date": ev.get("date"),
            "type": ev.get("type"),
            "title": ev.get("title"),
            "detail": ev.get("detail"),
            "user": ev.get("user"),
        })
    buf = _build_csv(rows, ["date", "type", "title", "detail", "user"])
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=lot-{batch_number}.csv"})


# ==================== CONTROL SIGNATURE / CORRECTIONS ====================
CORRECTABLE = {
    "temperatures": "temperatures",
    "cleaning": "cleaning",
    "non_conformities": "non_conformities",
    "receptions": "receptions",
    "losses": "losses",
}
PROTECTED_FIELDS = {"id", "org_id", "created_by", "created_by_name", "created_at", "signature"}


@api.post("/controls/{ctype}/{cid}/correct")
async def correct_control(ctype: str, cid: str, body: CorrectionIn, user=Depends(require_manager)):
    """Authorized correction of a signed control. The record stays immutable except
    through this endpoint, which records an audit history entry (old + new values)."""
    if ctype not in CORRECTABLE:
        raise HTTPException(400, "Type de contrôle invalide")
    coll = db[CORRECTABLE[ctype]]
    doc = await coll.find_one({"id": cid, "org_id": user["org_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Enregistrement introuvable")
    changes = {k: v for k, v in (body.changes or {}).items() if k not in PROTECTED_FIELDS}
    if not changes:
        raise HTTPException(400, "Aucune modification autorisée fournie")
    old_values = {k: doc.get(k) for k in changes}
    audit = {
        "id": str(uuid.uuid4()),
        "org_id": user["org_id"],
        "collection": ctype,
        "record_id": cid,
        "changed_by": user["id"],
        "changed_by_name": user["name"],
        "changed_at": now(),
        "reason": body.reason,
        "old_values": old_values,
        "new_values": changes,
    }
    await db.control_audits.insert_one(audit)
    await coll.update_one(
        {"id": cid, "org_id": user["org_id"]},
        {"$set": {**changes, "corrected": True, "corrected_at": now(), "corrected_by_name": user["name"]}},
    )
    return {"ok": True, "audit_id": audit["id"]}


@api.get("/controls/{ctype}/{cid}/audit")
async def control_audit(ctype: str, cid: str, user=Depends(current_user)):
    if ctype not in CORRECTABLE:
        raise HTTPException(400, "Type de contrôle invalide")
    docs = await db.control_audits.find(
        {"org_id": user["org_id"], "collection": ctype, "record_id": cid}, {"_id": 0}
    ).sort("changed_at", -1).to_list(100)
    return docs


# ==================== GLOBAL PDF DOSSIER ====================
def _date_range_query(org_id: str, date_from: Optional[str], date_to: Optional[str]) -> dict:
    q: dict = {"org_id": org_id}
    rng = {}
    if date_from:
        rng["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if date_to:
        rng["$lt"] = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    if rng:
        q["created_at"] = rng
    return q


def _fmt_dt(v):
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y %H:%M")
    return str(v or "")


@api.get("/export/dossier")
async def export_dossier(
    user=Depends(current_user_flex),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    sections: str = Query("temperatures,cleaning,non_conformities,receptions,traceability,losses"),
):
    if user["role"] != "responsable":
        raise HTTPException(403, "Réservé au responsable")
    org = await get_org(user["org_id"])
    try:
        query = _date_range_query(user["org_id"], date_from, date_to)
    except Exception:
        raise HTTPException(400, "Dates invalides (YYYY-MM-DD)")
    wanted = [s.strip() for s in sections.split(",") if s.strip()]

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.2 * cm, rightMargin=1.2 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=colors.HexColor("#E65100"), fontSize=22)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#18181B"), fontSize=14)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9)
    story = []
    story.append(Paragraph("TRACEPRO — Dossier de contrôle", h1))
    story.append(Paragraph(f"<b>{org.get('company_name','')}</b> — {org.get('business_type','')}", styles["Normal"]))
    story.append(Paragraph(f"{org.get('address','')} · {org.get('phone','')}", small))
    period_to = date_to or "aujourd'hui"
    period = f"{date_from or 'début'} → {period_to}"
    story.append(Paragraph(f"<b>Période :</b> {period}", styles["Normal"]))
    story.append(Paragraph(f"<b>Généré le :</b> {now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]))
    story.append(Spacer(1, 14))

    def add_table(title, columns, rows):
        story.append(Paragraph(title, h2))
        if not rows:
            story.append(Paragraph("Aucun enregistrement sur la période.", small))
            story.append(Spacer(1, 10))
            return
        table_data = [columns] + rows
        t = Table(table_data, repeatRows=1)
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18181B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F4F5")]),
            ("PADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        story.append(Spacer(1, 14))

    if "temperatures" in wanted:
        rows = await db.temperatures.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        add_table("Relevés de température", ["Date/Heure", "Zone", "Type", "°C", "Conforme", "Effectué par"],
                  [[_fmt_dt(r.get("created_at")), r.get("zone", ""), r.get("zone_type", ""), str(r.get("temperature", "")), "Oui" if r.get("conforming") else "Non", r.get("created_by_name", "")] for r in rows])

    if "cleaning" in wanted:
        rows = await db.cleaning.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        add_table("Nettoyage & désinfection", ["Date/Heure", "Zone", "Opération", "Statut", "Effectué par"],
                  [[_fmt_dt(r.get("created_at")), r.get("zone", ""), r.get("operation_type", ""), r.get("status", ""), r.get("created_by_name", "")] for r in rows])

    if "non_conformities" in wanted:
        rows = await db.non_conformities.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        add_table("Non-conformités", ["Date/Heure", "Problème", "Concerné", "Lot", "Statut", "Effectué par"],
                  [[_fmt_dt(r.get("created_at")), r.get("problem_type", ""), r.get("concerned_item", ""), r.get("batch_number", "") or "-", r.get("status", ""), r.get("created_by_name", "")] for r in rows])

    if "receptions" in wanted:
        rows = await db.receptions.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        add_table("Réceptions", ["Date/Heure", "Produit", "Fournisseur", "Lot", "DLC", "Qté", "Conforme", "Effectué par"],
                  [[_fmt_dt(r.get("created_at")), r.get("product", ""), r.get("supplier", ""), r.get("batch_number", ""), r.get("dlc", "") or "-", f"{r.get('quantity','')}{r.get('unit','')}", "Oui" if r.get("conforming") else "Non", r.get("created_by_name", "")] for r in rows])

    if "losses" in wanted:
        rows = await db.losses.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        add_table("Pertes", ["Date/Heure", "Produit", "Lot", "Qté", "Motif", "Valeur €", "Effectué par"],
                  [[_fmt_dt(r.get("created_at")), r.get("product", ""), r.get("batch_number", "") or "-", f"{r.get('quantity','')}{r.get('unit','')}", r.get("reason", ""), str(r.get("estimated_value", "") or "-"), r.get("created_by_name", "")] for r in rows])

    if "traceability" in wanted:
        receptions = await db.receptions.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
        batches = {}
        for r in receptions:
            b = r.get("batch_number")
            if b and b not in batches:
                batches[b] = r
        add_table("Traçabilité des lots", ["Lot", "Produit", "Fournisseur", "Réception", "DLC", "Qté reçue"],
                  [[b, r.get("product", ""), r.get("supplier", ""), r.get("reception_date", ""), r.get("dlc", "") or "-", f"{r.get('quantity','')}{r.get('unit','')}"] for b, r in batches.items()])

    if len(story) <= 6:
        story.append(Paragraph("Aucune section sélectionnée.", small))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=dossier-controle.pdf"})


# ==================== ARCHIVES ====================
@api.get("/archives")
async def archives(user=Depends(current_user), year: Optional[int] = None):
    org_id = user["org_id"]
    query = {"org_id": org_id}
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}
    receptions = await db.receptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    temps = await db.temperatures.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    cleaning = await db.cleaning.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    ncs = await db.non_conformities.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    losses = await db.losses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "receptions": receptions,
        "temperatures": temps,
        "cleaning": cleaning,
        "non_conformities": ncs,
        "losses": losses,
    }


# ==================== APP MOUNT ====================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
