# ============================================
# SAFEGUARD AI - FastAPI + YOLO Backend
# Google Cloud Run
# ============================================

FROM python:3.11-slim

# Prevent Python from creating .pyc files
# and make logs appear immediately
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Backend working directory
WORKDIR /app

# Required Linux libraries for OpenCV / YOLO / PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies
COPY requirements.txt /app/requirements.txt

# Install dependencies
RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy your entire python_service folder
COPY . /app

# Create runtime folders used by your code
RUN mkdir -p \
    /app/weights \
    /app/uploads \
    /app/outputs \
    /app/box_framed

# Cloud Run uses port 8080 by default
EXPOSE 8080

# Start FastAPI
# Cloud Run provides the PORT environment variable
CMD exec uvicorn main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8080}