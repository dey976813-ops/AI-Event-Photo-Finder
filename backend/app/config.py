from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 5000
    cors_origins: str = "http://localhost:3000"
    # Never enable this in production. It permits redacted collection-photo
    # validation diagnostics to be returned to an authenticated caller.
    development_diagnostics: bool = False
    # Explicit origins remain available through CORS_ORIGINS.  The default
    # regex additionally permits development frontends served on a loopback
    # or RFC1918 LAN address, without baking a machine-specific LAN IP into
    # source control.  Requests from public hosts remain denied by default.
    cors_origin_regex: str = (
        r"https?://(?:localhost|127\.0\.0\.1|\[::1\]|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?"
    )
    supabase_url: str | None = None
    supabase_secret_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_publishable_key: str | None = None
    supabase_anon_key: str | None = None
    ai_service_url: str | None = None

    @property
    def service_key(self) -> str | None:
        return self.supabase_secret_key or self.supabase_service_role_key

    @property
    def public_key(self) -> str | None:
        return self.supabase_publishable_key or self.supabase_anon_key

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
