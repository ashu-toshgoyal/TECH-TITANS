"""
image.py
SIH Problem Statement SIH26165: Multi-Class Hazard Detection Engine.
"""

import base64
from datetime import datetime
import io
import os
import ssl
import urllib.request
from typing import Dict, List
from google import genai
from PIL import Image, ImageDraw, ImageFont
import torch
from ultralytics import YOLO

# Folder setup
WEIGHTS_DIR = "weights"
UPLOAD_FOLDER = "uploads"
BOX_FRAMED_FOLDER = "box_framed"

# Ensure all required output directories exist automatically on startup
os.makedirs(WEIGHTS_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(BOX_FRAMED_FOLDER, exist_ok=True)

MODEL_PATH = os.path.join(WEIGHTS_DIR, "yolov8m.pt")


def load_ppe_model() -> YOLO:
    if not os.path.exists(MODEL_PATH):
        print("Downloading Ultralytics YOLOv8m weights...")
        url = "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8m.pt"
        
        # Bypass SSL verification context for download to prevent certificate verify failed errors on macOS
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        with urllib.request.urlopen(url, context=ctx) as response, open(MODEL_PATH, 'wb') as out_file:
            out_file.write(response.read())
            
    return YOLO(MODEL_PATH)


model = load_ppe_model()

RISK_COLORS = {
    "High": (220, 38, 38),  # Red
    "Medium": (234, 179, 8),  # Yellow
    "Low": (34, 197, 94),  # Green
}


def image_to_base64(image: Image.Image) -> str:
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG", quality=85)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def process_and_save_frames(
    raw_pil_image: Image.Image, filename: str, timestamp_str: str = None
) -> tuple[str, str, str]:
    """Saves the raw CCTV frame to 'uploads/' and the timestamped/annotated frame to 'box_framed/'."""
    if not timestamp_str:
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    raw_save_path = os.path.join(UPLOAD_FOLDER, filename)
    yolo_save_path = os.path.join(BOX_FRAMED_FOLDER, filename)

    # 1. Save raw incoming image
    raw_pil_image.save(raw_save_path, format="JPEG", quality=90)

    # 2. Analyze hazards and draw bounding boxes + timestamp overlay
    detections = analyze_hazards(raw_pil_image)
    annotated_image = draw_boxes(
        raw_pil_image.copy(), detections, timestamp_str=timestamp_str
    )

    # 3. Save YOLO annotated frame
    annotated_image.save(yolo_save_path, format="JPEG", quality=90)

    return raw_save_path, yolo_save_path, timestamp_str


def analyze_hazards(pil_image: Image.Image) -> List[Dict]:
    results = model(pil_image, conf=0.25, iou=0.45)[0]
    detections = []
    w, h = pil_image.size

    # Define safety equipment classes
    HAZARD_MAPPING = {
        # Missing PPE (High Risk)
        "no-hardhat": {"name": "Missing Helmet", "risk": "High"},
        "no_hardhat": {"name": "Missing Helmet", "risk": "High"},
        "no-helmet": {"name": "Missing Helmet", "risk": "High"},
        "no_helmet": {"name": "Missing Helmet", "risk": "High"},
        "no-vest": {"name": "Missing Safety Vest", "risk": "High"},
        "no_vest": {"name": "Missing Safety Vest", "risk": "High"},
        "no-safety-vest": {"name": "Missing Safety Vest", "risk": "High"},
        "no_safety_vest": {"name": "Missing Safety Vest", "risk": "High"},
        "no-gloves": {"name": "Missing Gloves", "risk": "High"},
        "no_gloves": {"name": "Missing Gloves", "risk": "High"},
        # Compliant with PPE (Low Risk)
        "hardhat": {"name": "Safety Helmet Present", "risk": "Low"},
        "helmet": {"name": "Safety Helmet Present", "risk": "Low"},
        "safety-vest": {"name": "Safety Vest Present", "risk": "Low"},
        "safety_vest": {"name": "Safety Vest Present", "risk": "Low"},
        "vest": {"name": "Safety Vest Present", "risk": "Low"},
        "gloves": {"name": "Gloves Present", "risk": "Low"},
        # People (Height Risk)
        "person": {"name": "Person Detected", "risk": "Medium"},
    }

    for box in results.boxes:
        cls_id = int(box.cls[0])
        raw_class = model.names[cls_id].lower().strip()
        confidence = float(box.conf[0])

        # Skip low confidence detections
        if confidence < 0.30:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()

        ymin = int((y1 / h) * 1000)
        xmin = int((x1 / w) * 1000)
        ymax = int((y2 / h) * 1000)
        xmax = int((x2 / w) * 1000)

        # Check if class is in mapping
        if raw_class in HAZARD_MAPPING:
            mapping = HAZARD_MAPPING[raw_class]
            hazard_name = mapping["name"]
            risk_level = mapping["risk"]
            class_name = raw_class

            # Special handling for persons at height
            if raw_class == "person":
                is_at_height = (y1 / h) < 0.35
                if is_at_height:
                    hazard_name = "Work at Height (Unsecured)"
                    risk_level = "High"
                    class_name = "height_risk"
                else:
                    hazard_name = "Compliant Personnel"
                    risk_level = "Low"
                    class_name = "safe_person"
        else:
            # Skip unknown classes
            continue

        detections.append({
            "hazard_name": hazard_name,
            "class_name": class_name,
            "risk_level": risk_level,
            "confidence": round(confidence, 2),
            "bbox": [ymin, xmin, ymax, xmax],
        })

    # If no detections, return a safe zone status
    if not detections:
        detections.append({
            "hazard_name": "Work Zone Monitored",
            "class_name": "safe_zone",
            "risk_level": "Low",
            "confidence": 0.95,
            "bbox": [0, 0, 1000, 1000],
        })

    return filter_overlapping_detections(detections)


def draw_boxes(
    image: Image.Image, detections: List[Dict], timestamp_str: str = None
) -> Image.Image:
    draw = ImageDraw.Draw(image)
    w, h = image.size

    try:
        font = ImageFont.truetype("arial.ttf", max(10, int(w * 0.015)))
        time_font = ImageFont.truetype("arial.ttf", max(12, int(w * 0.02)))
    except IOError:
        font = ImageFont.load_default()
        time_font = ImageFont.load_default()

    # Draw live CCTV Timestamp overlay banner in upper-right corner
    if timestamp_str:
        time_label = f"LIVE CCTV: {timestamp_str}"
        try:
            t_bbox = draw.textbbox((0, 0), time_label, font=time_font)
            t_w = t_bbox[2] - t_bbox[0]
            t_h = t_bbox[3] - t_bbox[1]
        except AttributeError:
            t_w, t_h = draw.textsize(time_label, font=time_font)

        draw.rectangle([w - t_w - 20, 10, w - 10, 15 + t_h + 10], fill=(0, 0, 0))
        draw.text((w - t_w - 15, 15), time_label, fill=(255, 255, 255), font=time_font)

    for det in detections:
        # Skip the safe zone placeholder
        if det["bbox"] == [0, 0, 1000, 1000]:
            continue

        ymin, xmin, ymax, xmax = det["bbox"]
        x1 = int((xmin / 1000.0) * w)
        y1 = int((ymin / 1000.0) * h)
        x2 = int((xmax / 1000.0) * w)
        y2 = int((ymax / 1000.0) * h)

        # Ensure coordinates are within image bounds
        x1 = max(0, min(w, x1))
        y1 = max(0, min(h, y1))
        x2 = max(0, min(w, x2))
        y2 = max(0, min(h, y2))

        color = RISK_COLORS.get(det["risk_level"], (220, 38, 38))
        
        # Draw clear colored bounding box outlines
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

        # Draw labels with background fill above bounding box
        label = f"{det['hazard_name']} ({int(det['confidence'] * 100)}%)"
        try:
            bbox = draw.textbbox((x1, y1), label, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        except AttributeError:
            text_w, text_h = draw.textsize(label, font=font)

        # Position label above the box
        text_y = max(0, y1 - text_h - 6)
        if text_y < 0:
            text_y = y2 + 4

        text_bg = [x1, text_y, x1 + text_w + 6, text_y + text_h + 6]
        draw.rectangle(text_bg, fill=color)
        draw.text((x1 + 3, text_y + 2), label, fill=(255, 255, 255), font=font)

    return image


def filter_overlapping_detections(
    detections: List[Dict], iou_threshold: float = 0.5
) -> List[Dict]:
    """Remove overlapping detections to reduce false positives"""
    if len(detections) <= 1:
        return detections

    filtered = []
    for i, det1 in enumerate(detections):
        keep = True
        bbox1 = det1["bbox"]
        for j, det2 in enumerate(detections):
            if i <= j:
                continue
            bbox2 = det2["bbox"]
            ymin1, xmin1, ymax1, xmax1 = bbox1
            ymin2, xmin2, ymax2, xmax2 = bbox2

            xA = max(xmin1, xmin2)
            yA = max(ymin1, ymin2)
            xB = min(xmax1, xmax2)
            yB = min(ymax1, ymax2)

            inter_area = max(0, xB - xA + 1) * max(0, yB - yA + 1)

            area1 = (xmax1 - xmin1 + 1) * (ymax1 - ymin1 + 1)
            area2 = (xmax2 - xmin2 + 1) * (ymax2 - ymin2 + 1)

            iou = inter_area / float(area1 + area2 - inter_area)

            if iou > iou_threshold:
                keep = False
                break
        if keep:
            filtered.append(det1)

    return filtered