from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import User


def seed_if_empty(db: Session) -> None:
    has_users = db.scalar(select(User.id).limit(1)) is not None
    if not has_users:
        db.add(
            User(
                email="admin@visioncontrol.com",
                name="Алексей Смирнов",
                password_hash=hash_password("admin123"),
                role="admin",
            )
        )

    db.commit()
