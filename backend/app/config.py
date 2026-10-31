from dataclasses import dataclass, field
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / '.env')

@dataclass(frozen=True)
class Settings:
    postgres_url: str = field(default_factory=lambda: os.getenv('POSTGRES_DATABASE_URL', ''), repr=False)
    mongo_uri: str = field(default_factory=lambda: os.getenv('MONGODB_URI', ''), repr=False)
    mongo_database: str = field(default_factory=lambda: os.getenv('MONGODB_DATABASE', 'devrecall'))
    ai_provider: str = field(default_factory=lambda: os.getenv('AI_PROVIDER', ''))
    ai_model: str = field(default_factory=lambda: os.getenv('AI_MODEL', ''))
    ai_base_url: str = field(default_factory=lambda: os.getenv('AI_BASE_URL', ''), repr=False)
    ai_api_key: str = field(default_factory=lambda: os.getenv('AI_API_KEY', ''), repr=False)
    github_token: str = field(default_factory=lambda: os.getenv('GITHUB_TOKEN', ''), repr=False)
