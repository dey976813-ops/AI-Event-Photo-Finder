import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routes import auth, events, loved_collections, match, photos

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="MemoryVerse Backend")
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(loved_collections.router)
