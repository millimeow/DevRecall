from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Repository(Timestamps, Base):
    __tablename__ = 'repositories'
    repo_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    github_node_id: Mapped[str | None] = mapped_column(Text)
    owner_login: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str] = mapped_column(Text)
    html_url: Mapped[str] = mapped_column(Text)
    default_branch: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(Text, server_default='public')
    ingestion_status: Mapped[str] = mapped_column(Text, server_default='new')
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_state: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    __table_args__ = (
        CheckConstraint('repo_id > 0'), CheckConstraint("visibility = 'public'"),
        CheckConstraint("ingestion_status IN ('new','queued','processing','completed','partial','failed')"),
        Index('uq_repositories_full_name', func.lower(full_name), unique=True),
    )

class DecisionIndex(Timestamps, Base):
    __tablename__ = 'decisions'
    decision_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    repo_id: Mapped[int] = mapped_column(ForeignKey('repositories.repo_id'), index=True)
    source_key: Mapped[str] = mapped_column(Text)
    topic_key: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    document_status: Mapped[str] = mapped_column(Text, server_default='pending')
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_revision: Mapped[int] = mapped_column(Integer, server_default='0')
    pending_revision: Mapped[int | None] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint('repo_id', 'source_key', 'topic_key', name='uq_decision_source_topic'),
        CheckConstraint("status IN ('accepted','rejected','proposed','contested','uncertain')"),
        CheckConstraint("document_status IN ('pending','ready','error')"),
        CheckConstraint("document_status != 'ready' OR published_revision > 0"),
    )

class IngestionJob(Timestamps, Base):
    __tablename__ = 'ingestion_jobs'
    job_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    repo_id: Mapped[int] = mapped_column(ForeignKey('repositories.repo_id'), index=True)
    job_type: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default='queued')
    sources_scanned: Mapped[int] = mapped_column(Integer, server_default='0')
    sources_total: Mapped[int | None] = mapped_column(Integer)
    decisions_written: Mapped[int] = mapped_column(Integer, server_default='0')
    checkpoint: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    error_summary: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, server_default='0')
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("job_type IN ('initial','manual_sync')"),
        CheckConstraint("status IN ('queued','running','partial','completed','failed')"),
        CheckConstraint('sources_scanned >= 0 AND decisions_written >= 0 AND retry_count >= 0'),
        Index('uq_active_repository_job', 'repo_id', unique=True, postgresql_where=text("status IN ('queued','running')")),
    )

class SourceIndex(Timestamps, Base):
    __tablename__ = 'source_index'
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    repo_id: Mapped[int] = mapped_column(ForeignKey('repositories.repo_id'), index=True)
    source_key: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    github_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    content_hash: Mapped[str] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint('repo_id', 'source_key', name='uq_repo_source'),)
