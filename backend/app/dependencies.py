from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.services.supabase_service import get_supabase


def require_auth(authorization: Annotated[str | None, Header()] = None) -> object:
    if not authorization:
        raise HTTPException(status_code=401, detail={"success": False, "message": "Authentication required"})
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token:
        raise HTTPException(status_code=401, detail={"success": False, "message": "Authentication required"})
    try:
        user = get_supabase().auth.get_user(token).user
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail={"success": False, "message": "Invalid or expired session"})
    return user


CurrentUser = Annotated[object, Depends(require_auth)]
