from fastapi import FastAPI, UploadFile, File
from deepface import DeepFace
import numpy as np
import cv2
import os

# This line uses OpenCV's built-in folder locator to fix the OneDrive path bug
cv2_data_path = cv2.data.haarcascades

app = FastAPI(title="AI Photo Finder")

@app.get("/health")
def health():
    return {"status": "OK", "message": "AI service is running"}

@app.post("/embed")
async def create_embedding(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image file
        contents = await file.read()
        
        # 2. Convert bytes to an image format that OpenCV can read
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"face_found": False, "message": "Invalid or corrupt image file"}

        # 3. Run deepface to generate the embedding.
        # We pass the correct cv2_data_path to fix the file not found error.
        embeddings = DeepFace.represent(
            img_path=img, 
            model_name="Facenet", 
            detector_backend="opencv", 
            enforce_detection=False,
            align=True
        )
        
        # 4. Check if it actually found a face
        if not embeddings or len(embeddings) == 0:
            return {"face_found": False, "message": "No face detected"}
            
        # 5. Extract the list of numbers
        embedding = embeddings[0]["embedding"]
        
        return {
            "face_found": True,
            "face_count": 1,
            "embedding": embedding
        }

    except Exception as e:
        # Handle any unexpected errors
        return {"face_found": False, "message": str(e)}