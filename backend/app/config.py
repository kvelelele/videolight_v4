from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    jwt_secret: str = "dev-secret-change-me"
    database_url: str = "sqlite:///./data/videolight.db"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_algorithm: str = "HS256"

    analytics_model: str = "yolov8n.pt"
    analytics_confidence: float = 0.35
    analytics_target_fps: float = 10.0
    analytics_device: str = "auto"  # auto | cpu | cuda | 0


settings = Settings()
