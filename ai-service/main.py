from fastapi import FastAPI, UploadFile, File
from deepface import DeepFace
import numpy as np
import cv2
import os

app = FastAPI(title="AI Photo Finder")

@app.get("/health")
def health():
    return {"status": "OK", "message": "AI service is running"}

@app.post("/process-event-photo")
async def process_event_photo(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image file
        contents = await file.read()
        
        # 2. Convert bytes to an image format that OpenCV can read
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"status": "error", "message": "Invalid or corrupt image file", "face_count": 0, "embeddings": []}

        # 3. Generate embeddings for EACH face found in the image
        embeddings = DeepFace.represent(img_path=img, model_name="ArcFace", detector_backend="opencv", enforce_detection=False)
        
        # 4. Check if no faces were found
        if not embeddings or len(embeddings) == 0:
            return {"status": "no_face", "message": "No face detected", "face_count": 0, "embeddings": []}
            
        # 5. Extract the list of embeddings and structure it for Pratik
        extracted_embeddings = [emb["embedding"] for emb in embeddings]
        
        return {
            "status": "success",
            "face_count": len(embeddings),
            "embeddings": extracted_embeddings
        }

    except Exception as e:
        # Handle any unexpected errors
        return {"status": "error", "message": str(e), "face_count": 0, "embeddings": []}