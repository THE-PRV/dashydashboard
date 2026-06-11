# Feature 2 — Screenshots: Frontend

**Branch:** `feature/screenshots` · **Stages:** S3 (§A associate), S4 (§B reviewer)
Match the existing design system (`src/components/ui.jsx`) — same buttons, chips, modals, colors.

---

## §A. Associate side (S3) — AgentView + `api/attestations.js`

### A1. Compression util (new `src/utils/imageCompress.js`)
- Input: File/Blob → load into `<img>` → draw to canvas downscaled to **≤1600px long edge**
  (never upscale) → `canvas.toBlob(cb, 'image/webp', 0.75)`.
- ALL uploads (single, paste, batch) pass through this before hitting the API. The browser does
  100% of the compression work; the server only validates.

### A2. Per-tool upload control (on each attestation row)
- No screenshot: an upload affordance (camera/attach icon button) → file picker.
- Has screenshot: small thumbnail (served from the `/thumb` endpoint) + status chip:
  `Pending` (neutral), `Approved` (green), `Rejected` (red).
- `Rejected`: show the reviewer's reason inline (banner/tooltip on the row) + a **Re-upload**
  button. Re-upload resets the chip to Pending.
- Rows marked no-access show no upload control (exempt).

### A3. Clipboard paste (primary UX — screenshots live in the clipboard via Win+Shift+S)
- With an attestation row focused/selected, `Ctrl+V` (paste event with image data) attaches the
  pasted image to that row through the same pipeline. Visually indicate which row is paste-target
  (focus ring) and show a brief "pasted → uploading → done" state.

### A4. Batch upload modal
- Button "Batch upload screenshots" → modal with drag-drop / multi-file picker.
- Naming convention shown in the modal: `{clientId}_{toolId}.png` (split on first underscore;
  hyphens belong to the toolId, e.g. `DTC-US_DU-TRADE.png`).
- Client-side: parse names, match against the user's own attestation list, show a **preview
  table** (file → matched client/tool, or "unmatched") BEFORE uploading. Compress matched files,
  send to the batch endpoint, then render the per-file server results (saved / failed and why).

### A5. Submit gating UX
- Submit button blocked while any non-exempt row lacks a Pending/Approved screenshot; blocked
  rows highlighted (use the offending-pairs list from the API error as fallback truth).
- After the cycle due date, everything is read-only EXCEPT the Re-upload button on Rejected rows.

## §B. Reviewer side (S4) — ManagerView + AdminView + `api/manager.js` / `api/admin.js`

Reviewer = manager (own team), GFH/GFHDelegate (department), Admin (all). The SAME components
serve ManagerView and the admin/GFH dashboard.

### B1. Status visibility everywhere
- Per-member status chip on every progress view (manager team list, admin/GFH rollups):
  **Not submitted → Awaiting approval (n) → Rejected (n) → Complete**.
- "Complete" = submitted AND all screenshots Approved. Progress counts/percentages reflect this.

### B2. Gallery
- Clicking a member opens their screenshot gallery: thumbnail grid **grouped by client**,
  each tile showing tool id/name + status badge. Tile click → full-size view.

### B3. Review mode (least-effort approval flow)
- Button **"Review pending (n)"** on the gallery → full-screen lightbox on a **dark backdrop**
  (regardless of app theme — images review better on dark), caption: associate · client · tool.
- Keyboard: **Enter = Approve & advance** · **R = Reject** (reason textbox pops, reason
  REQUIRED, Enter submits & advances) · **←/→** navigate · **Esc** exit.
- On-screen Approve / Reject / Prev / Next buttons mirror every key for mouse users.
- Advance auto-skips already-decided images; exiting shows "n approved, m rejected" toast.

### B4. Bulk approve
- **"Approve all pending for this member"** button (gallery header) with a confirm dialog
  ("Approve n pending screenshots for {name}?").

### B5. Zip download
- **"Download all screenshots (cycle X)"** button on manager AND admin dashboards → existing
  `downloadFile()` util against the zip endpoint, filename `screenshots-cycle{cycleId}.zip`.

### B6. Light/dark
- Do not introduce an app-wide theme system. The app keeps its existing look; only the review
  lightbox uses the dark backdrop.
