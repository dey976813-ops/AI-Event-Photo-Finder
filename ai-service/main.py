from fastapi import FastAPI

app = FastAPI(title="AI Photo Finder")

@app.get("/health")
def health():
    return {
        "status": "OK",
        "message": "AI service is running"
    }
@app.post("/upload-photo")
async def upload_photo():
    return {"message": "Photo received, analyzing..."}