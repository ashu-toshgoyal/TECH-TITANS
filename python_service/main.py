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

print("==================================================")
print("[SAFEGUARD AI] Running 'main.py' service...")
print("==================================================")

from detector import analyze_hazards, draw_boxes, image_to_base64

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

if PUBLIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")

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


def compress_and_save_image(pil_img: Image.Image, file_path: Path, quality: int = 65, max_size=(1280, 1280)) -> None:
    img_copy = pil_img.copy()
    img_copy.thumbnail(max_size, Image.Resampling.LANCZOS)
    img_copy.save(file_path, format="JPEG", optimize=True, quality=quality)


@app.post("/api/process-image")
async def process_image(file: UploadFile = File(...)):
    print(f"\n[main.py] Received uploaded image: {file.filename}")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Upload an image.")

    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")

        unique_id = uuid.uuid4().hex[:8]
        uploaded_filename = f"upload_{unique_id}.jpg"
        marked_filename = f"output_marked_{unique_id}.jpg"
        fixed_filename = f"output_fixed_{unique_id}.jpg"

        # 1. Compress & save uploaded file
        upload_path = UPLOADS_DIR / uploaded_filename
        compress_and_save_image(pil_img, upload_path, quality=65)

        # 2. Perform detection & annotate frames
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        raw_detections = analyze_hazards(pil_img)

        # Inject error indices for frontend list compatibility
        hazards = []
        for idx, det in enumerate(raw_detections, 1):
            det_copy = det.copy()
            det_copy["error_index"] = idx
            hazards.append(det_copy)

        marked_img = draw_boxes(pil_img.copy(), hazards, timestamp_str=timestamp_str)
        fixed_img = pil_img.copy()

        # 3. Save output files
        marked_path = OUTPUTS_DIR / marked_filename
        fixed_path = OUTPUTS_DIR / fixed_filename
        compress_and_save_image(marked_img, marked_path, quality=80)
        compress_and_save_image(fixed_img, fixed_path, quality=80)

        width, height = pil_img.size
        metadata = {
            "dimensions": f"{width}x{height}",
            "timestamp": timestamp_str,
            "camera_model": "IP-HD-Stream"
        }

        error_count = len([h for h in hazards if h["risk_level"] in ["High", "Medium"]])

        print(f"[main.py] Processing successfully completed. {error_count} hazard zones identified.")

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
                "marked": f"data:image/jpeg;base64,{image_to_base64(marked_img)}",
                "fixed": f"data:image/jpeg;base64,{image_to_base64(fixed_img)}"
            }
        }
    except Exception as e:
        print(f"[main.py] Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)