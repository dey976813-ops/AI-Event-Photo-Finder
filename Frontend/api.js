(() => {
  // API routing follows the current page host on every request. Share-origin
  // discovery is intentionally separate and is used only for generated links.
  function getApiBaseUrl() {
    const { protocol, hostname } = window.location;
    const apiProtocol = protocol === "https:" ? "https:" : "http:";
    if (!hostname) {
      throw new Error("Unable to determine the API host from the current page.");
    }
    return `${apiProtocol}//${hostname}:5000`;
  }
  // Access-code grants are deliberately memory-only. Refreshing or reopening
  // the site clears them, so shared access cannot silently become permanent.
  const sharedEventCodes = new Map();

  function apiUrl(path) {
    return `${getApiBaseUrl()}${path}`;
  }

  async function buildReachableUrl(path = "/", searchParams = {}) {
    const host = window.location.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0";
    let origin = window.location.origin;
    if (loopback) {
      // Fetch on every share attempt. Runtime interfaces can change while the
      // frontend stays open, so no detected address is retained in memory.
      const response = await fetch("/api/runtime-config", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not detect a reachable LAN address for this device.");
      const config = await response.json();
      const candidates = Array.isArray(config?.lanOrigins) ? config.lanOrigins : [];
      origin = config?.lanOrigin || config?.LAN_ORIGIN || candidates[0]?.origin || candidates[0];
    }
    if (typeof origin !== "string") throw new Error("No non-loopback LAN address is available. Open the app using the PC's LAN address.");
    const parsed = new URL(origin);
    if (["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(parsed.hostname.toLowerCase())) throw new Error("Refusing to create a cross-device link to localhost.");
    const url = new URL(path || "/", parsed.origin);
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
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

  function getEventHeaders(eventId, extra = {}) {
    const accessCode = sharedEventCodes.get(String(eventId));
    return getAuthHeaders({
      ...extra,
      ...(accessCode ? { "X-Event-Access-Code": accessCode } : {}),
    });
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

    const payload = await parseApiResponse(response);
    if (payload?.event?.id) {
      sharedEventCodes.set(String(payload.event.id), accessCode.trim().toUpperCase());
    }
    return payload;
  }

  async function findMyPhotos(eventId, faceImage, signal, threshold = 0.5, matchCount = 50) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    if (!faceImage) {
      throw new Error("Face image is required.");
    }

    const formData = new FormData();

    formData.append("file", faceImage, faceImage.name || "selfie.jpg");

    formData.append("event_id", eventId);
    formData.append("threshold", String(threshold));
    formData.append("match_count", String(matchCount));

    const response = await fetch(apiUrl("/api/match"), {
      method: "POST",
      headers: getEventHeaders(eventId),
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
        headers: getEventHeaders(eventId),
        cache: "no-store",
        signal,
      },
    );

    return parseApiResponse(response);
  }

  async function deleteEvent(eventId, signal) {
    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    const response = await fetch(
      apiUrl(`/api/events/${encodeURIComponent(eventId)}`),
      {
        method: "DELETE",
        headers: getAuthHeaders(),
        signal,
      },
    );

    return parseApiResponse(response);
  }

  async function deletePhoto(photoId, signal) {
    const response = await fetch(apiUrl(`/photos/${encodeURIComponent(photoId)}`), { method: "DELETE", headers: getAuthHeaders(), signal });
    return parseApiResponse(response);
  }

  async function setPhotoFavorite(eventId, photoId, loved, signal) {
    const response = await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}/favorite`), {
      method: "PUT", headers: getEventHeaders(eventId, { "Content-Type": "application/json" }), body: JSON.stringify({ loved }), signal,
    });
    return parseApiResponse(response);
  }

  async function loveAll(eventId, signal) {
    const response = await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/favorites/all`), { method: "POST", headers: getEventHeaders(eventId), signal });
    return parseApiResponse(response);
  }

  async function downloadFile(path, fallbackName, signal) {
    const response = await fetch(apiUrl(path), { headers: getAuthHeaders(), signal });
    if (!response.ok) return parseApiResponse(response);
    const blob = await response.blob();
    const match = /filename="?([^";]+)"?/i.exec(response.headers.get("content-disposition") || "");
    return { blob, filename: match?.[1] || fallbackName };
  }

  function downloadEventFile(eventId, path, fallbackName, signal) {
    return fetch(apiUrl(path), { headers: getEventHeaders(eventId), signal }).then(async (response) => {
      if (!response.ok) return parseApiResponse(response);
      const blob = await response.blob();
      const match = /filename="?([^";]+)"?/i.exec(response.headers.get("content-disposition") || "");
      return { blob, filename: match?.[1] || fallbackName };
    });
  }
  async function checkFaceQuality(faceImage, signal) {
    const formData = new FormData(); formData.append("file", faceImage, faceImage.name || "selfie.jpg");
    return parseApiResponse(await fetch(apiUrl("/api/match/quality"), { method: "POST", headers: getAuthHeaders(), body: formData, signal }));
  }
  async function loveSelected(eventId, photoIds, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/favorites/selected`), { method: "POST", headers: getEventHeaders(eventId, { "Content-Type": "application/json" }), body: JSON.stringify({ photo_ids: photoIds }), signal })); }
  async function unloveSelected(eventId, photoIds, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/favorites/selected`), { method: "DELETE", headers: getEventHeaders(eventId, { "Content-Type": "application/json" }), body: JSON.stringify({ photo_ids: photoIds }), signal })); }
  async function downloadSelected(eventId, photoIds, signal) {
    const response = await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/photos/download-selected`), { method: "POST", headers: getEventHeaders(eventId, { "Content-Type": "application/json" }), body: JSON.stringify({ photo_ids: photoIds }), signal });
    if (!response.ok) return parseApiResponse(response);
    const blob = await response.blob(); const match = /filename="?([^";]+)"?/i.exec(response.headers.get("content-disposition") || "");
    return { blob, filename: match?.[1] || "selected-photos.zip" };
  }
  function downloadPhoto(eventId, photoId, signal) { return downloadEventFile(eventId, `/api/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}/download`, "photo.jpg", signal); }
  function downloadAll(eventId, signal) { return downloadEventFile(eventId, `/api/events/${encodeURIComponent(eventId)}/download`, "event-photos.zip", signal); }
  function downloadLoved(eventId, signal) { return downloadEventFile(eventId, `/api/events/favorites/${encodeURIComponent(eventId)}/download`, "loved-photos.zip", signal); }
  async function getLovedCollections(signal) {
    const response = await fetch(apiUrl("/api/events/favorites/collections"), { headers: getAuthHeaders(), signal, cache: "no-store" });
    return parseApiResponse(response);
  }
  async function getEventInsights(eventId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/insights`), { headers: getAuthHeaders(), signal })); }
  async function getEventWelcome(eventId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/welcome`), { headers: getEventHeaders(eventId), cache: "no-store", signal })); }
  async function updateEventBranding(eventId, branding, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/branding`), { method: "PATCH", headers: getAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(branding), signal })); }
  async function getSystemStatus(eventId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/events/${encodeURIComponent(eventId)}/system-status`), { headers: getAuthHeaders(), cache: "no-store", signal })); }
  async function reindexEventPhotos(eventId, signal) { return parseApiResponse(await fetch(apiUrl(`/photos/events/${encodeURIComponent(eventId)}/reindex`), { method: "POST", headers: getAuthHeaders(), signal })); }
  async function getMyActivity(signal) { return parseApiResponse(await fetch(apiUrl("/api/events/me/activity"), { headers: getAuthHeaders(), cache: "no-store", signal })); }
  async function createCollectionShare(collectionId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(collectionId)}/share`), { method: "POST", headers: getAuthHeaders(), signal })); }
  async function getCollectionShare(collectionId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(collectionId)}/share`), { headers: getAuthHeaders(), signal })); }
  async function revokeCollectionShare(collectionId, shareId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(collectionId)}/share/${encodeURIComponent(shareId)}`), { method: "DELETE", headers: getAuthHeaders(), signal })); }
  async function getSharedCollection(token, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/shared/${encodeURIComponent(token)}`), { signal })); }
  function downloadSharedCollectionPhoto(token, photoId, signal) { return downloadFile(`/api/loved-collections/shared/${encodeURIComponent(token)}/photos/${encodeURIComponent(photoId)}/download`, "photo.jpg", signal); }
  function downloadSharedCollection(token, signal) { return downloadFile(`/api/loved-collections/shared/${encodeURIComponent(token)}/download`, "shared-loved-memories.zip", signal); }
  async function getNamedLovedCollections(signal) { return parseApiResponse(await fetch(apiUrl("/api/loved-collections"), { headers: getAuthHeaders(), signal, cache: "no-store" })); }
  function collectionPhotoPayload(photos) {
    const photoIds = [];
    const eventAccessCodes = {};

    for (const photo of photos || []) {
      if (typeof photo === "string") {
        photoIds.push(photo);
        continue;
      }
      if (!photo?.id) continue;
      photoIds.push(photo.id);
      const eventId = photo.event_id || photo.eventId;
      const accessCode = eventId && sharedEventCodes.get(String(eventId));
      if (accessCode) eventAccessCodes[String(eventId)] = accessCode;
    }

    return { photo_ids: photoIds, event_access_codes: eventAccessCodes };
  }
  async function createLovedCollection(name, photos, signal) { return parseApiResponse(await fetch(apiUrl("/api/loved-collections"), { method: "POST", headers: getAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name, ...collectionPhotoPayload(photos) }), signal })); }
  async function getLovedCollection(id, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(id)}`), { headers: getAuthHeaders(), signal })); }
  async function addCollectionPhotos(id, photos, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(id)}/photos`), { method: "POST", headers: getAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(collectionPhotoPayload(photos)), signal })); }
  async function removeCollectionPhoto(id, photoId, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`), { method: "DELETE", headers: getAuthHeaders(), signal })); }
  async function deleteLovedCollection(id, signal) { return parseApiResponse(await fetch(apiUrl(`/api/loved-collections/${encodeURIComponent(id)}`), { method: "DELETE", headers: getAuthHeaders(), signal })); }
  function downloadLovedCollection(id, signal) { return downloadFile(`/api/loved-collections/${encodeURIComponent(id)}/download`, "loved-memories.zip", signal); }
  function downloadLovedCollectionPhoto(collectionId, photoId, signal) { return downloadFile(`/api/loved-collections/${encodeURIComponent(collectionId)}/photos/${encodeURIComponent(photoId)}/download`, "photo.jpg", signal); }

  window.PhotoFinderApi = {
    get API_BASE_URL() { return getApiBaseUrl(); },
    getApiBaseUrl,
    buildReachableUrl,
    healthCheck,
    getEvents,
    createEvent,
    generateAccessCode,
    redeemAccessCode,
    findMyPhotos,
    checkFaceQuality,
    uploadEventPhotos,
    getEventPhotos,
    deleteEvent,
    deletePhoto,
    setPhotoFavorite,
    loveAll, loveSelected, unloveSelected,
    downloadSelected,
    downloadPhoto,
    downloadAll,
    downloadLoved,
    getLovedCollections,
    getEventInsights, createCollectionShare, getCollectionShare, revokeCollectionShare, getSharedCollection, downloadSharedCollectionPhoto, downloadSharedCollection,
    getEventWelcome, updateEventBranding, getSystemStatus, getMyActivity, reindexEventPhotos,
    getNamedLovedCollections, createLovedCollection, getLovedCollection, addCollectionPhotos, removeCollectionPhoto, deleteLovedCollection, downloadLovedCollection, downloadLovedCollectionPhoto,
  };
})();
