from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 5000
    cors_origins: str = "http://localhost:3000"
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
