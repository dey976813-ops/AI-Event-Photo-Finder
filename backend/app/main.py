import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routes import auth, events, match, photos

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="MemoryVerse Backend")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    content = exc.detail if isinstance(exc.detail, dict) else {"success": False, "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"message": "Invalid request input"})


@app.get("/health")
def health() -> dict:
    return {"success": True, "status": "ok", "message": "Backend is running"}


app.include_router(events.router)
app.include_router(photos.router)
app.include_router(match.router)
app.include_router(auth.router)
