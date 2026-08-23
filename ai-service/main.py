from fastapi import FastAPI, UploadFile, File
from deepface import DeepFace
import numpy as np
import cv2
import os
import glob

app = FastAPI(title="AI Photo Finder")

# The path to your test folder (one level up from main.py)
TEST_PHOTOS_DIR = os.path.join(os.path.dirname(__file__), '..', 'test_photos')

# Load all the embeddings from the test folder when the server starts
def load_db():
    db = []
    if os.path.exists(TEST_PHOTOS_DIR):
        for img_path in glob.glob(os.path.join(TEST_PHOTOS_DIR, "*")):
            try:
                reps = DeepFace.represent(img_path=img_path, model_name="ArcFace", detector_backend="opencv", enforce_detection=False)
                if reps:
                    db.append({"photo_id": os.path.basename(img_path), "embedding": reps[0]["embedding"]})
            except Exception as e:
                print(f"Failed to load {img_path}: {e}")
    return db

# Initialize DB (Runs once when server starts)
photo_db = load_db()

@app.get("/health")
def health():
    return {"status": "OK", "message": "AI service is running"}

@app.post("/embed")
async def create_embedding(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"face_found": False, "message": "Invalid or corrupt image file"}
        embeddings = DeepFace.represent(img_path=img, model_name="ArcFace", detector_backend="opencv", enforce_detection=False)
        if not embeddings:
            return {"face_found": False, "message": "No face detected"}
        return {"face_found": True, "face_count": 1, "embedding": embeddings[0]["embedding"]}
    except Exception as e:
        return {"face_found": False, "message": str(e)}

@app.post("/match")
async def match_face(file: UploadFile = File(...)):
    try:
        # 1. Get the embedding of the uploaded selfie
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"matches": [], "count": 0, "message": "Invalid or corrupt image file"}
        embeddings = DeepFace.represent(img_path=img, model_name="ArcFace", detector_backend="opencv", enforce_detection=False)
        if not embeddings:
            return {"matches": [], "count": 0, "message": "No face detected"}
        
        query_embedding = np.array(embeddings[0]["embedding"])

        # 2. Compare against the database (Test folder)
        results = []
        for item in photo_db:
            db_embedding = np.array(item["embedding"])
            # Calculate Cosine Similarity (higher is better, max is 1.0)
            similarity = np.dot(query_embedding, db_embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(db_embedding))
            results.append({"photo_id": item["photo_id"], "score": float(similarity)})

        # 3. Sort best to worst
        results.sort(key=lambda x: x["score"], reverse=True)

        # 4. Return top-K results (only if score is above a basic threshold, e.g., 0.5)
        top_k = [r for r in results[:3] if r["score"] > 0.5]

        return {"matches": top_k, "count": len(top_k)}

    except Exception as e:
        return {"matches": [], "count": 0, "message": str(e)}