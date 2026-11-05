// SOS&A Portal app: makes the portal installable on phones and computers.
// Deliberately caches nothing: client files and pages never stay on the device.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* always go to the network */ });
