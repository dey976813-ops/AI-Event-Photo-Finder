# Frontend API integration

The new Find My Photos UI keeps network calls in `api.js`. The service reads the browser runtime value `window.__PHOTO_FINDER_API_BASE_URL__`; when it is empty, requests use the same origin. In a Vite migration, map `VITE_API_BASE_URL` to that runtime value during application bootstrap.

The frontend currently expects JSON responses from these configurable routes:

- `GET /api/events` → an array or `{ "events": [...] }` with `id`/`eventId`, `name`/`title`, and optional `date` and `thumbnailUrl`.
- `POST /api/find-my-photos` → `multipart/form-data` containing `eventId` and `faceImage`; the response should contain `photos`, `matches`, `results`, or `data.photos`.
- `POST /api/event-photos` and `GET /api/events/:eventId/photos` are reserved for the photographer flow and remain isolated in the service layer.

The current Node backend in this archive does not expose `/api/events` or `/api/find-my-photos`, so the browser correctly reports the event service as unavailable instead of fabricating events or matched photos. No backend or AI-service files were changed.
