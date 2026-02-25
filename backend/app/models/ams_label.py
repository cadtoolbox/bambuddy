"""Model for storing user-defined friendly names for AMS units.

Users can assign a custom label to each AMS (e.g. "Workshop AMS", "Silk Colours")
that is displayed in place of or alongside the auto-generated label (AMS-A, HT-A, …).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class AmsLabel(Base):
    """Maps a printer + AMS unit ID to a user-defined friendly name."""

    __tablename__ = "ams_labels"
    __table_args__ = (UniqueConstraint("printer_id", "ams_id", name="uq_ams_label"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printers.id", ondelete="CASCADE"))
    ams_id: Mapped[int] = mapped_column(Integer)  # AMS unit ID (0, 1, 2, 3, 128…)
    label: Mapped[str] = mapped_column(String(100))  # User-defined friendly name
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    printer: Mapped["Printer"] = relationship()


from backend.app.models.printer import Printer  # noqa: E402
