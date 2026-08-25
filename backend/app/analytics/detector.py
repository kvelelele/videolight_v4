from __future__ import annotations

import logging
from dataclasses import dataclass

import supervision as sv

from app.config import settings

logger = logging.getLogger(__name__)

COCO_CLASSES: dict[int, str] = {
    0: "person",
    2: "car",
    5: "car",  # bus
    7: "car",  # truck
}
TARGET_CLASS_IDS = list(COCO_CLASSES.keys())

_shared_model = None


def _resolve_device() -> str:
    if settings.analytics_device != "auto":
        return settings.analytics_device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def get_shared_model():
    global _shared_model
    if _shared_model is None:
        from ultralytics import YOLO

        device = _resolve_device()
        logger.info("Loading YOLO model %s on %s", settings.analytics_model, device)
        _shared_model = YOLO(settings.analytics_model)
        _shared_model.overrides["device"] = device
    return _shared_model


@dataclass
class TrackDetection:
    track_id: int
    class_name: str
    bbox: list[float]
    confidence: float


class CameraTracker:
    """Per-camera ByteTrack instance backed by a shared YOLO detector."""

    def __init__(self) -> None:
        self._byte_tracker = sv.ByteTrack()

    def detect_and_track(
        self,
        frame,
        scale_x: float,
        scale_y: float,
    ) -> list[TrackDetection]:
        model = get_shared_model()
        device = _resolve_device()
        results = model.predict(
            frame,
            classes=TARGET_CLASS_IDS,
            conf=settings.analytics_confidence,
            device=device,
            verbose=False,
        )
        if not results:
            return []

        detections = sv.Detections.from_ultralytics(results[0])
        detections = self._byte_tracker.update_with_detections(detections)
        if len(detections) == 0:
            return []

        output: list[TrackDetection] = []
        for i in range(len(detections)):
            if detections.class_id is None or detections.confidence is None:
                continue
            class_id = int(detections.class_id[i])
            if class_id not in COCO_CLASSES:
                continue
            track_id = (
                int(detections.tracker_id[i])
                if detections.tracker_id is not None
                else i
            )
            confidence = float(detections.confidence[i])
            x1, y1, x2, y2 = detections.xyxy[i].tolist()
            output.append(
                TrackDetection(
                    track_id=track_id,
                    class_name=COCO_CLASSES[class_id],
                    bbox=[x1 * scale_x, y1 * scale_y, x2 * scale_x, y2 * scale_y],
                    confidence=confidence,
                )
            )
        return output
