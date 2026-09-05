from fastapi import FastAPI, UploadFile, File
from deepface import DeepFace
import numpy as np
import cv2
import os

app = FastAPI(title="AI Photo Finder")

MODEL_NAME = "ArcFace"
MODEL_LOADED = False

@app.on_event("startup")
def load_model():
    global MODEL_LOADED
    try:
        DeepFace.represent(img_path=np.zeros((100,100,3), dtype=np.uint8), model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=False)
        MODEL_LOADED = True
        print("✅ AI Model Loaded Successfully!")
    except Exception as e:
        print(f"❌ Model Load Failed: {e}")

@app.get("/health")
def health():
    return {"status": "OK", "model_loaded": MODEL_LOADED, "model_name": MODEL_NAME}

@app.post("/embed")
async def create_embedding(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if len(contents) == 0:
            return {"face_found": False, "error": "EMPTY_FILE", "message": "File is empty"}
        
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"face_found": False, "error": "INVALID_IMAGE", "message": "Invalid or corrupt image file"}
        
        # STRICT DETECTION: enforce_detection=True
        try:
            embeddings = DeepFace.represent(img_path=img, model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=True)
        except Exception as e:
            # Agar RetinaFace ko face nahi mila, toh woh error throw karega
            # Humein woh error pakad kar "NO_FACE" return karna hai
            if "Face could not be detected" in str(e) or "no face" in str(e).lower():
                return {"face_found": False, "error": "NO_FACE", "message": "No face detected"}
            else:
                return {"face_found": False, "error": "AI_FAILURE", "message": str(e)}
        
        if not embeddings:
            return {"face_found": False, "error": "NO_FACE", "message": "No face detected"}
        
        embedding = embeddings[0]["embedding"]
        if len(embedding) != 512:
            return {"face_found": False, "error": "DIMENSION_MISMATCH", "message": f"Expected 512, got {len(embedding)}"}
        
        return {"face_found": True, "face_count": 1, "embedding": embedding}
    
    except Exception as e:
        return {"face_found": False, "error": "AI_FAILURE", "message": str(e)}

@app.post("/process-event-photo")
async def process_event_photo(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if len(contents) == 0:
            return {"status": "error", "error": "EMPTY_FILE", "face_count": 0, "embeddings": []}
            
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"status": "error", "error": "INVALID_IMAGE", "face_count": 0, "embeddings": []}

        try:
            embeddings = DeepFace.represent(img_path=img, model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=True)
        except Exception as e:
            if "Face could not be detected" in str(e) or "no face" in str(e).lower():
                return {"status": "no_face", "error": "NO_FACE", "face_count": 0, "embeddings": []}
            else:
                return {"status": "error", "error": "AI_FAILURE", "message": str(e), "face_count": 0, "embeddings": []}
        
        if not embeddings or len(embeddings) == 0:
            return {"status": "no_face", "error": "NO_FACE", "face_count": 0, "embeddings": []}
            
        extracted_embeddings = [emb["embedding"] for emb in embeddings]
        
        return {
            "status": "success",
            "face_count": len(embeddings),
            "embeddings": extracted_embeddings
        }

    except Exception as e:
        return {"status": "error", "error": "AI_FAILURE", "message": str(e), "face_count": 0, "embeddings": []}