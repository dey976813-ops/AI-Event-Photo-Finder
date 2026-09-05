from fastapi import FastAPI, UploadFile, File
from deepface import DeepFace
import numpy as np
import cv2
import os
import glob

app = FastAPI(title="AI Photo Finder")

# --- MODEL OPTIMIZATION ---
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
        
        try:
            embeddings = DeepFace.represent(img_path=img, model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=True)
        except Exception as e:
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

@app.post("/match")
async def match_face(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"matches": [], "count": 0, "message": "Invalid or corrupt image file"}
        
        try:
            embeddings = DeepFace.represent(img_path=img, model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=True)
        except Exception as e:
            if "Face could not be detected" in str(e) or "no face" in str(e).lower():
                return {"matches": [], "count": 0, "message": "No face detected"}
            else:
                return {"matches": [], "count": 0, "message": str(e)}
        
        if not embeddings:
            return {"matches": [], "count": 0, "message": "No face detected"}
        
        query_embedding = np.array(embeddings[0]["embedding"])

        # Load database from test_photos folder
        results = []
        photo_db = []
        if os.path.exists('test_photos'):
            for img_path in glob.glob('test_photos/*'):
                try:
                    reps = DeepFace.represent(img_path=img_path, model_name=MODEL_NAME, detector_backend="retinaface", enforce_detection=True)
                    if reps:
                        photo_db.append({"photo_id": os.path.basename(img_path), "embedding": reps[0]["embedding"]})
                except:
                    pass

        for item in photo_db:
            db_embedding = np.array(item["embedding"])
            similarity = np.dot(query_embedding, db_embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(db_embedding))
            results.append({"photo_id": item["photo_id"], "score": float(similarity)})

        results.sort(key=lambda x: x["score"], reverse=True)
        top_k = [r for r in results[:3] if r["score"] > 0.5]

        return {"matches": top_k, "count": len(top_k)}

    except Exception as e:
        return {"matches": [], "count": 0, "message": str(e)}