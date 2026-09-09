(() => {
  const API_BASE_URL = (
    window.VITE_API_BASE_URL ||
    window.__PHOTO_FINDER_API_BASE_URL__ ||
    "http://localhost:5000"
  ).replace(/\/$/, "");

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function getAuthToken() {
    return localStorage.getItem("pf_token");
  }

  function getAuthHeaders(extra = {}) {
    const token = getAuthToken();

    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
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

  async function healthCheck(signal) {
    const response = await fetch(apiUrl("/health"), {
      method: "GET",
      signal,
    });

    return parseApiResponse(response);
  }

  async function getEvents(signal) {
    const response = await fetch(apiUrl("/api/events"), {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
      signal,
    });

    return parseApiResponse(response);
  }

  async function createEvent(name, date = null, signal) {
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Event name is required.");
    }

    const body = {
      name: name.trim(),
    };

    if (date) {
      body.date = date;
    }

    const response = await fetch(apiUrl("/api/events"), {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(body),
      signal,
    });

    return parseApiResponse(response);
  }

  async function generateAccessCode(eventId, signal) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    const response = await fetch(
      apiUrl(`/api/events/${encodeURIComponent(eventId)}/access-code`),
      {
        method: "POST",
        headers: getAuthHeaders(),
        signal,
      },
    );

    return parseApiResponse(response);
  }

  async function redeemAccessCode(accessCode, signal) {
    if (!accessCode || typeof accessCode !== "string") {
      throw new Error("Access code is required.");
    }

    const response = await fetch(apiUrl("/api/events/access-code/redeem"), {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        access_code: accessCode.trim().toUpperCase(),
      }),
      signal,
    });

    return parseApiResponse(response);
  }

  async function findMyPhotos(eventId, faceImage, signal) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    if (!faceImage) {
      throw new Error("Face image is required.");
    }

    const formData = new FormData();

    formData.append("file", faceImage, faceImage.name || "selfie.jpg");

    formData.append("event_id", eventId);

    const response = await fetch(apiUrl("/api/match"), {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
      signal,
    });

    const payload = await parseApiResponse(response);

    return {
      ...payload,
      photos: payload.photos || payload.matches || payload.results || [],
    };
  }

  async function uploadEventPhotos(eventId, files, signal, onProgress) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("Please select at least one image.");
    }

    const results = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      if (!file) {
        continue;
      }

      const formData = new FormData();

      formData.append("file", file, file.name || "photo.jpg");
      formData.append("event_id", eventId);

      const response = await fetch(apiUrl("/photos"), {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
        signal,
      });

      const payload = await parseApiResponse(response);

      results.push(payload);

      if (typeof onProgress === "function") {
        onProgress(index + 1, files.length, payload);
      }
    }

    return {
      success: true,
      uploaded: results.length,
      results,
    };
  }

  async function getEventPhotos(eventId, signal) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    const response = await fetch(
      apiUrl(`/api/events/${encodeURIComponent(eventId)}/photos`),
      {
        method: "GET",
        headers: getAuthHeaders(),
        cache: "no-store",
        signal,
      },
    );

    return parseApiResponse(response);
  }

  window.PhotoFinderApi = {
    API_BASE_URL,
    healthCheck,
    getEvents,
    createEvent,
    generateAccessCode,
    redeemAccessCode,
    findMyPhotos,
    uploadEventPhotos,
    getEventPhotos,
  };
})();
