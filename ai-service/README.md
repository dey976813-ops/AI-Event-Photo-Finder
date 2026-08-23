# AI Photo Finder - AI Service

## How to Run
1. Activate venv: `.venv\Scripts\Activate.ps1`
2. Install packages: `pip install -r requirements.txt`
3. Run server: `uvicorn main:app --reload --port 8000`

## Model Info
- **Model Used:** ArcFace
- **Embedding Dimension:** 512 (Matches Supabase vector(512) contract)

## API Contract

### 1. GET /health
- **Method:** GET
- **Success Response:** `{"status": "OK", "message": "AI service is running"}`

### 2. POST /embed
- **Method:** POST
- **Content-Type:** multipart/form-data
- **Multipart Field Name:** `file`
- **Success Response:** `{"face_found": true, "face_count": 1, "embedding": [512 numbers]}`
- **No-face Response:** `{"face_found": false, "message": "No face detected"}`

### 3. POST /match
- **Method:** POST
- **Content-Type:** multipart/form-data
- **Multipart Field Name:** `file`
- **Success Response:** `{"matches": [{"photo_id": "...", "score": 1.0}], "count": 1}`
- **No-match Response:** `{"matches": [], "count": 0}`

### 4. POST /process-event-photo (Day 3 - Photo Indexing)
- **Method:** POST
- **Content-Type:** multipart/form-data
- **Multipart Field Name:** `file`
- **Purpose:** Takes an event photo and returns embeddings for ALL faces detected.
- **Success Response:** `{"status": "success", "face_count": 3, "embeddings": [[512 numbers], [512 numbers], [512 numbers]]}`
- **No-face Response:** `{"status": "no_face", "message": "No face detected", "face_count": 0, "embeddings": []}`
- **Error Response:** `{"status": "error", "message": "Invalid or corrupt image file", "face_count": 0, "embeddings": []}`