"""Agreement domain models (P0-04, P0-05) — tables owned by Sam (contract §11).

Tables created here: ``agreements``, ``agreement_parties``, ``milestones``,
``agreement_versions``, ``version_approvals``, ``activity_events``,
``idempotency_keys``.

Notes:
- an agreement **always** has at least one version row (contract §4.2);
- milestones are agreement-scoped, uniquely numbered per agreement, and each
  row is *stamped* with the agreement version it currently belongs to — the
  execution gate (P0-08) only accepts a release when that stamp equals
  ``agreements.current_version_id``;
- ``version_approvals`` carries a UNIQUE ``(version_id, party_role)`` so
  double-approval is impossible at the database level (D-06).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.db import Base
from api.app.timeutil import utcnow

AGREEMENT_STATUSES = ("draft", "active", "completed")
PARTY_ROLES = ("client", "provider", "witness")
APPROVAL_POLICIES = ("all_parties", "client_only")
REVIEW_BASES = ("calendar", "business")
MILESTONE_STATUSES = ("pending", "released")
VERSION_STATUSES = ("draft", "approved")


class Agreement(Base):
    __tablename__ = "agreements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','active','completed')", name="ck_agreements_status"
        ),
        CheckConstraint(
            "approval_policy IN ('all_parties','client_only')",
            name="ck_agreements_approval_policy",
        ),
        CheckConstraint(
            "review_period_basis IN ('calendar','business')",
            name="ck_agreements_review_basis",
        ),
        CheckConstraint("total_amount_minor > 0", name="ck_agreements_amount"),
        CheckConstraint(
            "review_period_days BETWEEN 1 AND 90", name="ck_agreements_review_days"
        ),
        CheckConstraint("LENGTH(currency) = 3", name="ck_agreements_currency"),
        CheckConstraint(
            "dispute_behavior IS NULL OR dispute_behavior IN "
            "('freeze_affected_payment','mediate','arbitrate')",
            name="ck_agreements_dispute_behavior",
        ),
        Index("ix_agreements_org_created", "organization_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    agreement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    total_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    approval_policy: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    review_period_days: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    review_period_basis: Mapped[str] = mapped_column(String(8), nullable=False)
    extra_terms: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Legal facts required by the Contract IR (P0-06). Nullable on purpose:
    # when absent, POST …/versions/{v}/ir refuses with 409 MISSING_CLARIFICATION
    # rather than guessing a legal term (contract §6.1).
    dispute_behavior: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    governing_law: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # UUID of the current version. Not a DB-level FK to avoid a circular
    # constraint between agreements and agreement_versions (SQLite cannot
    # ALTER in a FK); referential integrity is enforced in the application
    # and every write path sets it inside the same transaction.
    current_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    parties: Mapped[list["AgreementParty"]] = relationship(
        back_populates="agreement", cascade="all, delete-orphan"
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="agreement",
        cascade="all, delete-orphan",
        order_by="Milestone.seq",
    )


class AgreementParty(Base):
    __tablename__ = "agreement_parties"
    __table_args__ = (
        UniqueConstraint("agreement_id", "role", "email", name="uq_party_role_email"),
        CheckConstraint(
            "role IN ('client','provider','witness')", name="ck_party_role"
        ),
        Index("ix_agreement_parties_agreement", "agreement_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    # Set when the email matches an existing user — used to link approvals.
    user_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    agreement: Mapped[Agreement] = relationship(back_populates="parties")


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        UniqueConstraint("agreement_id", "seq", name="uq_milestone_seq"),
        CheckConstraint("status IN ('pending','released')", name="ck_milestone_status"),
        CheckConstraint("amount_minor > 0", name="ck_milestone_amount"),
        Index("ix_milestones_agreement_seq", "agreement_id", "seq"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    # The agreement version this milestone currently belongs to (gate check).
    # Plain column for the same circularity reason as current_version_id.
    version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    seq: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    acceptance_criteria: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # P0-08: identifier returned by POST …/milestones/{seq}/release; set in the
    # same transaction as the status flip (money movement is simulated).
    release_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    released_by: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    agreement: Mapped[Agreement] = relationship(back_populates="milestones")


class AgreementVersion(Base):
    """Immutable text snapshot. Text is stored byte-for-byte as submitted."""

    __tablename__ = "agreement_versions"
    __table_args__ = (
        UniqueConstraint("agreement_id", "version", name="uq_agreement_version"),
        CheckConstraint(
            "status IN ('draft','approved')", name="ck_version_status"
        ),
        CheckConstraint("version >= 1", name="ck_version_number"),
        Index("ix_agreement_versions_agreement", "agreement_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_length: Mapped[int] = mapped_column(Integer, nullable=False)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    # Relationship (not just the FK column) so the unit of work always inserts
    # the agreement before this row in the same flush.
    agreement: Mapped[Agreement] = relationship()

    approvals: Mapped[list["VersionApproval"]] = relationship(
        back_populates="version", cascade="all, delete-orphan"
    )


class VersionApproval(Base):
    __tablename__ = "version_approvals"
    __table_args__ = (
        UniqueConstraint("version_id", "party_role", name="uq_version_party"),
        CheckConstraint(
            "party_role IN ('client','provider','witness')",
            name="ck_approval_party_role",
        ),
        Index("ix_version_approvals_version", "version_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version_id: Mapped[str] = mapped_column(
        ForeignKey("agreement_versions.id", ondelete="CASCADE"), nullable=False
    )
    party_role: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_user_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    confirmed_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    approved_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    version: Mapped[AgreementVersion] = relationship(back_populates="approvals")


class ActivityEvent(Base):
    """Append-only audit trail (P0-09 reads it; P0-04+ writes it)."""

    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_agreement_created", "agreement_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    # Ordering guarantee: agreement row first, event row second (same flush).
    agreement: Mapped[Agreement] = relationship()


class IdempotencyKey(Base):
    """Replay store for ``Idempotency-Key`` (contract §1.4, 24 h window)."""

    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint(
            "key", "user_id", "endpoint", name="uq_idempotency_scope"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
