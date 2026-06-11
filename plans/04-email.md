# Feature 2 — Email (event-triggered only)

**Branch:** `feature/screenshots` · **Stage:** S5

## Scope guard
Build ONLY the two event-triggered mails below. Do NOT build scheduled mails
(7-day due-date reminder, manager "n pending approvals" digest) or the retention sweep —
those are a documented follow-up phase via a `BackgroundService`. Design `EmailService` so that
the future BackgroundService can call the same send/composition plumbing.

## Plumbing

- **MailKit** NuGet package (the one allowed new backend dependency besides the image library).
- Corporate internal SMTP relay, unauthenticated (host/port from config). Recipient address:
  existing `Users.EMailAddr` (real in production; fake in dev — feature stays off locally).
- Config section (placeholders in `appsettings.json`; env-var overridable like everything else):

```json
"Email": {
  "Enabled": false,
  "SmtpHost": "",
  "SmtpPort": 25,
  "From": "dashydashboard-noreply@example.com",
  "Events": {
    "ScreenshotRejected": true,
    "AllApproved": true
  }
}
```

- `Enabled` is the master switch (default false); each event has its own toggle.
- **Fire-and-forget:** a send must NEVER fail or slow the triggering request — queue to a
  background task (e.g. Channel + hosted consumer, or Task.Run with try/catch), log failures
  to the app log. Skip silently when disabled or when the recipient has no `EMailAddr`.

## Events

| Event | Trigger | Recipient | Content |
|---|---|---|---|
| **ScreenshotRejected** | a reviewer rejects a screenshot | the associate | cycle, client, tool, reviewer name, the rejection reason, and the instruction to re-upload (link to the app: `http://…/dashydashboard/`). |
| **AllApproved** | an approval (single or bulk) results in the member having ZERO non-approved screenshots in the cycle | the associate | ONE "all your screenshots for cycle X are approved — you're complete" mail. No per-image approval mails, ever. |

`AllApproved` must not double-send when bulk approve fires many state changes at once —
evaluate once per request after the state change, and only send if the transition
(not-complete → complete) happened in that request.

## Acceptance

- With `Enabled=false` (dev default): zero SMTP activity, zero errors, workflow unaffected.
- With `Enabled=true` against a fake/unreachable host: requests still succeed; failures logged.
- Reject → exactly one mail with the reason. Bulk-approve to completion → exactly one
  AllApproved mail.
