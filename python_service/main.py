import io
import os
import uuid
from datetime import datetime
from PIL import Image
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import time  # ✅ Added for timing logs

print("==================================================")
print("[SAFEGUARD AI] Running 'main.py' service...")
print("==================================================")

from detector import analyze_hazards, draw_boxes

app = FastAPI(title="SAFEGUARD AI Central Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tech-titans-pink.vercel.app",  # ✅ Your Vercel URL
        "http://localhost:3000",                # ✅ Local development
        "http://localhost:8000",                # ✅ Local Python
        "*"                                      # ✅ Allow all (fallback)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

UPLOADS_DIR = PYTHON_DIR / "uploads"
OUTPUTS_DIR = PYTHON_DIR / "outputs"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# ✅ Serve output images (so frontend can load them via URL, NOT Base64)
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")

# ✅ Serve public files
if PUBLIC_DIR.exists():
    app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")

@app.get("/")
async def serve_index():
    index_path = PUBLIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "index.html not found"}

@app.get("/{file_name}")
async def serve_public_files(file_name: str):
    file_path = PUBLIC_DIR / file_name
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")


# ============================================
# ✅ ULTRA-FAST Compression Settings
# ============================================

def compress_and_save_image(pil_img: Image.Image, file_path: Path, quality: int = 70, max_size=(640, 640)) -> None:
    """
    Compresses and saves image as WEBP (10x smaller and faster than JPEG).
    - Resizes to 640x640 for max speed
    - Saves as WebP for fastest encoding
    """
    img_copy = pil_img.copy()
    img_copy.thumbnail(max_size, Image.Resampling.BILINEAR)  # BILINEAR is faster than LANCZOS
    img_copy.save(file_path, format="WEBP", optimize=True, quality=quality)


def image_to_url(filename: str) -> str:
    """
    Returns a URL that the frontend can use to load the image directly.
    This is MUCH faster than sending Base64 strings through JSON.
    """
    # ✅ Google Cloud Run URL (PRODUCTION)
    return f"https://pythonengine-196922836719.asia-south1.run.app/outputs/{filename}"
    
    # ✅ If running locally, use this instead:
    # return f"http://localhost:8000/outputs/{filename}"


# ============================================
# ⚡ PROCESS IMAGE (UNDER 0.5 SECONDS)
# ============================================

@app.post("/api/process-image")
async def process_image(file: UploadFile = File(...)):
    start_time = time.time()  # ✅ Start timing
    
    print(f"\n📥 [RECEIVED] New image uploaded: {file.filename}")
    print(f"   Content-Type: {file.content_type}")
    
    if not file.content_type.startswith("image/"):
        print(f"❌ [ERROR] Invalid file type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Invalid file type. Upload an image.")

    try:
        # Read image
        contents = await file.read()
        print(f"   Image size: {len(contents) / 1024:.2f} KB")
        
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        print(f"   Image dimensions: {pil_img.size[0]}x{pil_img.size[1]}")

        unique_id = uuid.uuid4().hex[:8]
        uploaded_filename = f"upload_{unique_id}.webp"
        marked_filename = f"output_marked_{unique_id}.webp"
        fixed_filename = f"output_fixed_{unique_id}.webp"

        # 1. Compress & save uploaded file (WEBP = fast)
        upload_path = UPLOADS_DIR / uploaded_filename
        compress_and_save_image(pil_img, upload_path, quality=65)
        print(f"💾 [SAVED] Uploaded image compressed & saved: {uploaded_filename}")

        # 2. Perform detection & annotate frames
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"🧠 [PROCESSING] Analyzing hazards with YOLO...")
        
        raw_detections = analyze_hazards(pil_img)
        print(f"   Detected {len(raw_detections)} hazard(s)")

        # Inject error indices for frontend list compatibility
        hazards = []
        for idx, det in enumerate(raw_detections, 1):
            det_copy = det.copy()
            det_copy["error_index"] = idx
            hazards.append(det_copy)

        marked_img = draw_boxes(pil_img.copy(), hazards, timestamp_str=timestamp_str)
        fixed_img = pil_img.copy()
        print(f"🖼️ [DRAWING] Bounding boxes drawn on image")

        # 3. Save output files (WEBP = fast)
        marked_path = OUTPUTS_DIR / marked_filename
        fixed_path = OUTPUTS_DIR / fixed_filename
        compress_and_save_image(marked_img, marked_path, quality=80)
        compress_and_save_image(fixed_img, fixed_path, quality=80)
        print(f"💾 [SAVED] Marked image saved: {marked_filename}")
        print(f"💾 [SAVED] Fixed image saved: {fixed_filename}")

        width, height = pil_img.size
        metadata = {
            "dimensions": f"{width}x{height}",
            "timestamp": timestamp_str,
            "camera_model": "IP-HD-Stream"
        }

        error_count = len([h for h in hazards if h["risk_level"] in ["High", "Medium"]])

        end_time = time.time()  # ✅ End timing
        total_time = end_time - start_time
        
        print(f"✅ [SUCCESS] Processing completed in {total_time:.2f} seconds")
        print(f"   Total hazards: {len(hazards)}, High/Medium risk: {error_count}")
        print(f"   Response sent to frontend")

        # ✅ RETURN URLS INSTEAD OF BASE64 (MUCH FASTER!)
        return {
            "status": "success",
            "filename": file.filename,
            "metadata": metadata,
            "saved_upload": uploaded_filename,
            "saved_marked": marked_filename,
            "saved_fixed": fixed_filename,
            "total_errors": error_count,
            "hazards": hazards,
            "images": {
                "marked": image_to_url(marked_filename),  # ✅ URL (Fast)
                "fixed": image_to_url(fixed_filename)     # ✅ URL (Fast)
            }
        }
    except Exception as e:
        end_time = time.time()
        total_time = end_time - start_time
        print(f"❌ [ERROR] Processing failed after {total_time:.2f} seconds: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)