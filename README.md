# AI Unleashed

AI-Powered Event Photo Discovery System

## Project Overview

AI Unleashed is an AI-powered event photo discovery system that allows users to find their photos from event collections using face recognition.

## Project Structure

- `Frontend/` — Frontend application
- `backend/` — Node.js/Express backend
- `ai-service/` — FastAPI AI/ML service
- `test_photos/` — AI testing images

## AI Service

The AI service provides:

- Face detection
- 512-dimensional face embeddings
- Face matching
- Event photo processing
- ArcFace-based recognition

## Backend

The backend handles:

- Authentication
- Event management
- Photo upload
- Supabase Storage
- Database integration
- AI service communication
- Photo matching

## Development

The integration branch is:

`development`

Run the frontend and backend services according to their respective project instructions.

Before using the owner dashboard or access-code sharing on an existing Supabase
project, run `backend/migrations/20260914_event_access_and_codes.sql` once in
the Supabase SQL editor. It adds the owner, access-code, and shared-access
records used by the FastAPI routes.

The event description field used by owner branding also requires
`backend/migrations/20260926_event_branding.sql` in the Supabase SQL editor.
Event cover images reference an existing photo from that event and reuse its
signed storage URL; no separate bucket is needed.

### LAN development

The browser API client derives the backend host from the hostname used to open
the frontend. Thus `http://localhost:3000` calls `http://localhost:5000`, and
opening the frontend through a LAN address calls port 5000 on that same LAN
host. No machine-specific address is stored in source.

Cross-device event and loved-collection links use the page's current origin
when opened through a LAN address. When the owner is using `localhost`, the
frontend server's `/api/runtime-config` endpoint detects a non-loopback IPv4
for QR/share links; set `LAN_ORIGIN=http://<reachable-host-ip>:3000` only when
the automatic interface choice needs an override. Event QR links contain the
event ID and still require the owner-issued code; the code itself is not put in
the URL.

Start the FastAPI services on all network interfaces when testing from a phone:

```powershell
# from backend
uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload

# from ai-service (the backend reaches this service using AI_SERVICE_URL)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Set `AI_SERVICE_URL=http://127.0.0.1:8000` in the backend environment when both
services run on the same computer. The frontend never calls the AI service
directly. Windows Firewall must allow inbound TCP 3000 and 5000 on the private
network profile for a phone to reach the application.

## Status

AI service and backend foundations are integrated for final end-to-end testing.
