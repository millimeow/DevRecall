from alembic import context
from app.config import Settings
from app.db.connections import postgres_engine
from app.db.models import Base

if context.is_offline_mode():
    context.configure(url=Settings().postgres_url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = postgres_engine(Settings().postgres_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
