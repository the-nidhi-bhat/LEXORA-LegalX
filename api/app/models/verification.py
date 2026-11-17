"""IR / parity / verification artefact tables (P0-06, P0-07, P0-08).

Tables owned by Sam (contract §11): ``ir_documents``, ``execution_parameters``,
``parity_runs``, ``verification_runs``.

Design rules honoured here:
- **D-05**: every row is a new immutable artefact; nothing is ever mutated in
  place (the tamper endpoint appends a ``tampered_demo`` row, never edits the
  approved data);
- **append-only**: ``verification_runs`` and ``parity_runs`` have no update
  path anywhere in the codebase — a result the caller saw must exist in the
  database, unchanged (P0-08 handoff §4);
- ``field_results``/``rows``/``ir``/``params`` are stored as verbatim JSON
  text (no lossy normalisation, no binary columns).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base
from api.app.timeutil import utcnow


class IRDocument(Base):
    """Derived ContractIR for exactly one approved version (P0-06)."""

    __tablename__ = "ir_documents"
    __table_args__ = (
        UniqueConstraint("version_id", name="uq_ir_documents_version"),
        CheckConstraint(
            "derived_by IN ('deterministic')", name="ck_ir_documents_derived_by"
        ),
        Index("ix_ir_documents_agreement", "agreement_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        ForeignKey("agreement_versions.id", ondelete="CASCADE"), nullable=False
    )
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    agreement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    total_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ir_json: Mapped[str] = mapped_column(Text, nullable=False)
    ir_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    derived_by: Mapped[str] = mapped_column(String(32), nullable=False, default="deterministic")
    provenance_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)


class ExecutionParametersRow(Base):
    """Executable parameter artefact for a version (P0-07, D-05)."""

    __tablename__ = "execution_parameters"
    __table_args__ = (
        CheckConstraint(
            "source IN ('derived','tampered_demo')", name="ck_exec_params_source"
        ),
        Index("ix_execution_parameters_version", "version_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        ForeignKey("agreement_versions.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="derived")
    params_json: Mapped[str] = mapped_column(Text, nullable=False)
    params_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    derived_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)


class ParityRun(Base):
    """One immutable parity comparison (P0-07)."""

    __tablename__ = "parity_runs"
    __table_args__ = (
        Index("ix_parity_runs_version", "version_id", "checked_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        ForeignKey("agreement_versions.id", ondelete="CASCADE"), nullable=False
    )
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    checked_at: Mapped[datetime] = mapped_column(nullable=False)
    critical_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    advisory_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_json: Mapped[str] = mapped_column(Text, nullable=False)
    result_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    canonicalization_version: Mapped[str] = mapped_column(String(8), nullable=False)
    parity_rules_version: Mapped[str] = mapped_column(String(8), nullable=False)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)


class VerificationRun(Base):
    """One immutable verification run (P0-08, handoff §4).

    Append-only: no UPDATE path exists. ``passed`` is the gate input — it is
    recomputed on write from the parity result, never read from the client.
    """

    __tablename__ = "verification_runs"
    __table_args__ = (
        Index("ix_verification_runs_version", "version_id", "verified_at"),
        Index("ix_verification_runs_agreement", "agreement_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agreement_id: Mapped[str] = mapped_column(
        ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        ForeignKey("agreement_versions.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    parity_run_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("parity_runs.id", ondelete="SET NULL"), nullable=True
    )
    approved_ir_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    execution_params_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    canonicalization_version: Mapped[str] = mapped_column(String(8), nullable=False)
    parity_rules_version: Mapped[str] = mapped_column(String(8), nullable=False)
    overall_status: Mapped[str] = mapped_column(String(16), nullable=False)
    recommendation: Mapped[str] = mapped_column(String(16), nullable=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False)
    has_advisory_diffs: Mapped[bool] = mapped_column(Boolean, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    critical_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocking_fields_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    approvals_complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    field_results_json: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    verified_at: Mapped[datetime] = mapped_column(nullable=False)
    verified_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
