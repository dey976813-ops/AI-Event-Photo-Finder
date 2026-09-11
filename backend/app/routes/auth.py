from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import CurrentUser
from app.services.supabase_service import get_supabase, get_supabase_auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupBody(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    confirmPassword: str | None = None


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None


def public_user(user: object) -> dict:
    metadata = getattr(user, "user_metadata", None) or {}
    email = getattr(user, "email", None)
    return {"id": user.id, "email": email, "name": metadata.get("name") or (email.split("@")[0] if email else "User")}


@router.post("/signup", status_code=201)
def signup(body: SignupBody):
    if not body.name or not body.email or not body.password:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Name, email and password are required"})
    if body.confirmPassword is not None and body.password != body.confirmPassword:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Passwords do not match"})
    try:
        created = get_supabase().auth.admin.create_user({"email": body.email, "password": body.password, "email_confirm": True, "user_metadata": {"name": body.name}})
        if not getattr(created, "user", None):
            raise ValueError("missing user")
    except Exception as exc:
        # Supabase returns duplicate-address and validation failures as 400 in Express.
        raise HTTPException(status_code=400, detail={"success": False, "error": "Could not create account"}) from exc
    try:
        sign_in = get_supabase_auth().auth.sign_in_with_password({"email": body.email, "password": body.password})
        if not sign_in.session or not sign_in.user:
            raise ValueError("missing session")
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "error": "Account created, but automatic sign-in failed. Please log in."}) from exc
    return {"success": True, "token": sign_in.session.access_token, "user": public_user(sign_in.user)}


@router.post("/login")
def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Email and password are required"})
    try:
        result = get_supabase_auth().auth.sign_in_with_password({"email": body.email, "password": body.password})
        if not result.session or not result.user:
            raise ValueError("missing session")
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"success": False, "error": "Invalid email or password"}) from exc
    return {"success": True, "token": result.session.access_token, "user": public_user(result.user)}


@router.get("/me")
def me(user: CurrentUser):
    return {"success": True, "user": public_user(user)}
