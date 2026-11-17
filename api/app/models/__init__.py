"""ORM models package.

Importing this package registers every table on ``api.app.db.Base``.
"""

from api.app.models import auth as auth_models  # noqa: F401
from api.app.models import agreements as agreements_models  # noqa: F401
from api.app.models import verification as verification_models  # noqa: F401
