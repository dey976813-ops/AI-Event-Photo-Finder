(() => {
  const API_BASE_URL = (
    window.VITE_API_BASE_URL ||
    window.__PHOTO_FINDER_API_BASE_URL__ ||
    "http://localhost:5000"
  ).replace(/\/$/, "");

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  async function parseApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload?.message
          ? payload.message
          : typeof payload === "object" && payload?.error
            ? payload.error
            : `API request failed (${response.status})`;

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;

      throw error;
    }

    if (!contentType.includes("application/json")) {
      const error = new Error("Backend returned a non-JSON response.");
      error.status = response.status;
      error.payload = payload;

      throw error;
    }

    return payload;
  }

  // ==========================================
  // Backend Health
  // GET http://localhost:5000/health
  // ==========================================
  async function healthCheck(signal) {
    return parseApiResponse(
      await fetch(apiUrl("/health"), {
        method: "GET",
        signal,
      }),
    );
  }

  // ==========================================
  // Get Events
  //
  // NOTE:
  // Current backend does not expose /api/events.
  // Keep this function for future event API.
  //
  // `cache: "no-store"` ensures Find My Photos always sees a freshly created
  // event immediately (no stale browser/HTTP cache of the events list).
  // ==========================================
  async function getEvents(signal) {
    return parseApiResponse(
      await fetch(apiUrl("/api/events"), {
        method: "GET",
        cache: "no-store",
        signal,
      }),
    );
  }

  // ==========================================
  // FIND MY PHOTOS
  //
  // Backend:
  // POST /api/match
  //
  // multipart/form-data:
  // file
  // event_id
  // ==========================================
  async function findMyPhotos(eventId, faceImage, signal) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    if (!faceImage) {
      throw new Error("Face image is required.");
    }

    const formData = new FormData();

    // IMPORTANT:
    // Backend expects "file", NOT "faceImage"
    formData.append("file", faceImage, faceImage.name || "selfie.jpg");

    // IMPORTANT:
    // Backend expects "event_id", NOT "eventId"
    formData.append("event_id", eventId);

    const response = await fetch(apiUrl("/api/match"), {
      method: "POST",
      body: formData,
      signal,
    });

    const payload = await parseApiResponse(response);

    // Normalize backend response so frontend can easily consume it.
    return {
      ...payload,
      photos: payload.photos || payload.matches || payload.results || [],
    };
  }

  // ==========================================
  // Photographer Flow
  // ==========================================
  async function uploadEventPhotos(eventId, files, signal) {
    const formData = new FormData();

    formData.append("eventId", eventId);

    files.forEach((file) => {
      formData.append("files", file, file.name);
    });

    return parseApiResponse(
      await fetch(apiUrl("/api/event-photos"), {
        method: "POST",
        body: formData,
        signal,
      }),
    );
  }

  // ==========================================
  // Photographer Flow
  // ==========================================
  async function getEventPhotos(eventId, signal) {
    return parseApiResponse(
      await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/photos`), {
        method: "GET",
        signal,
      }),
    );
  }

  // ==========================================
  // Export
  // ==========================================
  window.PhotoFinderApi = {
    API_BASE_URL,
    healthCheck,
    getEvents,
    findMyPhotos,
    uploadEventPhotos,
    getEventPhotos,
  };
})();
