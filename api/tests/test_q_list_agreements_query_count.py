"""Regression test: the agreements list endpoint must not issue one SELECT per item.

B-15: ``list_agreements`` used to call ``db.get(AgreementVersion, id)`` for every
row, an N+1 pattern.  It now resolves ``current_version_id`` from the single
batched version query.  This test counts SELECTs at the SQLAlchemy engine level
and asserts the count is bounded by a small constant, independent of item count.

Why the data setup uses a dangling ``current_version_id``: the batched version
query loads every version of the listed agreements into the request session's
identity map.  With ordinary data the old ``db.get()`` would therefore be served
from the identity map and emit no SQL, hiding the N+1.  Pointing each agreement
at a version id that is *not* in that loaded set (a legitimate ``None`` fallback
case the handler explicitly supports) forces the old code to issue one SELECT
per row while the fixed code issues none.  With the old per-row ``db.get()`` the
delta below grows as ``2 + N`` and exceeds the bound; with the fix it stays 2.
"""

from __future__ import annotations

from typing import Callable

from sqlalchemy import event

from api.app.db import get_engine

from helpers import post_agreement, valid_payload

N_ITEMS = 8
MAX_SELECT_DELTA = 6


def _count_selects(call: Callable[[], object]) -> int:
    """Run ``call`` with a SELECT counter attached only for its duration.

    Scoping the listener to the call (rather than the whole test) excludes the
    SELECTs emitted by seeding and by session login.  Auth/session SELECTs that
    happen inside each request are identical across the two measured calls and
    are cancelled out by taking the empty-vs-seeded delta.
    """
    engine = get_engine()
    statements: list[str] = []

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany  # noqa: ANN001
    ) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        call()
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
    return len(statements)


def test_list_agreements_query_count_is_bounded(sessions, client, db):
    sessions.login("owner@legalx.demo")

    def do_list():
        return client.get("/api/v1/agreements", params={"limit": N_ITEMS})

    # Baseline: an empty list still performs auth/session SELECTs plus the single
    # main agreement SELECT, but none of the per-item batched lookups.
    empty_count = _count_selects(do_list)

    # Seed N agreements (each with a version, parties and milestones).
    ids: list[str] = []
    for index in range(N_ITEMS):
        response = post_agreement(sessions, valid_payload(title=f"Agreement {index}"))
        assert response.status_code == 201, response.text
        ids.append(response.json()["id"])

    # Force the historical N+1 to actually touch the DB (see module docstring).
    from api.app.models.agreements import Agreement

    for index, agreement_id in enumerate(ids):
        agreement = db.get(Agreement, agreement_id)
        agreement.current_version_id = f"dangling-version-{index}"
    db.commit()

    listed = do_list()
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == N_ITEMS

    seeded_count = _count_selects(do_list)
    delta = seeded_count - empty_count

    # With the fix this is 2 (one batched parties SELECT + one batched versions
    # SELECT).  With the old per-row db.get() it is 2 + N and fails the bound.
    assert delta <= MAX_SELECT_DELTA, (
        f"list_agreements SELECT count grew with item count: "
        f"empty={empty_count}, seeded={seeded_count}, delta={delta} "
        f"(N={N_ITEMS}, bound={MAX_SELECT_DELTA})"
    )
