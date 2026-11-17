"""Idempotent demo seed for the five approved personas (P0-03).

**DEMO-ONLY.** These accounts exist so the judged demo and the automated tests
can authenticate; the password below is a published demo credential, not a
production secret. Production deployments must replace it (docs/DEMO_ACCOUNTS.md).

Deterministic ``uuid5`` ids make re-seeding idempotent: running this module
twice never duplicates a row.

Run:  python -m api.app.seeds
"""

from __future__ import annotations

import uuid
from typing import Dict

from sqlalchemy import select

from api.app.config import get_settings
from api.app.db import get_engine, session_scope
from api.app.models.auth import Membership, Organization, User
from api.app.security import hash_password

_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "legalx.demo")

DEMO_PASSWORD = "legalx-demo-2026"

ORGS = [
    ("acme-digital", "Acme Digital"),
    ("lexora-studio", "Lexora Studio"),
]

# (email, name, initials, role, org slug)
DEMO_USERS = [
    ("owner@legalx.demo", "Nirvan Shah", "NS", "owner", "acme-digital"),
    ("freelancer@legalx.demo", "Alex Freelancer", "AF", "freelancer", "acme-digital"),
    ("lawyer@legalx.demo", "Rhea Shah", "RS", "legal_reviewer", "acme-digital"),
    ("admin@legalx.demo", "Maya Rao", "MR", "org_admin", "acme-digital"),
    ("auditor@legalx.demo", "Karan Mehta", "KM", "technical_auditor", "acme-digital"),
    # Second workspace — proves cross-workspace isolation (404, never 403).
    ("outsider@lexora.demo", "Other Owner", "OO", "owner", "lexora-studio"),
]


def deterministic_id(*parts: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, "|".join(parts)))


def seed_demo_data() -> Dict[str, int]:
    # Development/test bootstrap: create missing tables so the demo can start
    # from scratch. In production the schema belongs exclusively to the Alembic
    # migrations, and the seed never alters it.
    if not get_settings().is_production:
        from api.app import models  # noqa: F401  (registers tables on Base)
        from api.app.db import Base

        Base.metadata.create_all(bind=get_engine())

    created = {"organizations": 0, "users": 0, "memberships": 0}
    with session_scope() as db:
        org_ids: Dict[str, str] = {}
        for slug, name in ORGS:
            existing = db.scalar(select(Organization).where(Organization.slug == slug))
            if existing is None:
                org = Organization(id=deterministic_id("org", slug), name=name, slug=slug)
                db.add(org)
                db.flush()
                created["organizations"] += 1
            else:
                org = existing
            org_ids[slug] = org.id

        for email, name, initials, role, org_slug in DEMO_USERS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    id=deterministic_id("user", email),
                    email=email,
                    name=name,
                    initials=initials,
                    # Hash computed on first insert only — re-runs keep the row.
                    password_hash=hash_password(DEMO_PASSWORD),
                    is_active=True,
                )
                db.add(user)
                db.flush()
                created["users"] += 1
            membership = db.scalar(
                select(Membership).where(
                    Membership.user_id == user.id,
                    Membership.organization_id == org_ids[org_slug],
                )
            )
            if membership is None:
                db.add(
                    Membership(
                        id=deterministic_id("membership", email, org_slug),
                        organization_id=org_ids[org_slug],
                        user_id=user.id,
                        role=role,
                    )
                )
                created["memberships"] += 1
    return created


if __name__ == "__main__":
    result = seed_demo_data()
    print(
        "seed complete: "
        f"{result['organizations']} organizations, "
        f"{result['users']} users, {result['memberships']} memberships created "
        f"(0 means already present)"
    )
