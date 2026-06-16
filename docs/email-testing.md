# Email — setup & manual test checklist

Event-triggered mail for the screenshot-attestation feature (Feature 2, §S5). Two events:

| Event | When it fires | Recipient |
|-------|---------------|-----------|
| **ScreenshotRejected** | A reviewer rejects an associate's screenshot (with a reason). | The associate (`Users.EMailAddr`). |
| **AllApproved** | An approval (single or bulk) takes an associate from *not-complete* → *complete* for the cycle — i.e. their **last** outstanding required screenshot is approved. Fires **exactly once** per transition. | The associate. |

Mail is **fire-and-forget**: `EmailService.Enqueue*` composes a message and drops it on an in-memory
`Channel` (`EmailQueue`); `EmailSenderHostedService` is the sole consumer and does the actual SMTP
send. A send failure (unreachable relay, bad host) is caught and logged as a warning — it **never**
throws onto the request path. The relay is **unauthenticated** (`MailKit`, `SecureSocketOptions.None`),
matching the corporate internal relay.

> Plumbing lives in `Services/EmailService.cs`, `Services/EmailSenderHostedService.cs`,
> `Services/EmailQueue.cs`, `Services/EmailOptions.cs`; the two events are enqueued from
> `ManagerService.ReviewScreenshotAsync` / `ApproveAllScreenshotsAsync`.

---

## 1. Configuration

Bound from the `Email` section (`EmailOptions`). Defaults live in the base `appsettings.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `Email:Enabled` | `false` | **Master switch.** Nothing reaches SMTP while false. |
| `Email:SmtpHost` | `""` | Relay host. |
| `Email:SmtpPort` | `25` | Relay port. |
| `Email:From` | `dashydashboard-noreply@example.com` | Sending mailbox (must be a valid address the relay accepts). |
| `Email:AppUrl` | `http://clipvwbpod02/dashydashboard/` | Absolute base URL used to build the re-upload / view links in the mail bodies. |
| `Email:Events:ScreenshotRejected` | `true` | Per-event toggle (under the master switch). |
| `Email:Events:AllApproved` | `true` | Per-event toggle (under the master switch). |

### Prefer environment-variable overrides (republish-proof)

`dotnet publish` overwrites `appsettings*.json`, so set production values as **machine environment
variables** instead — they sit outside the deployed artifact and survive a republish (same pattern as
`ConnectionStrings__Default` and `Screenshots__RootPath`). Use `__` (double underscore) for the `:`
nesting:

```
Email__Enabled=true
Email__SmtpHost=<relay-host>
Email__SmtpPort=25
Email__From=dashydashboard-noreply@broadridge.com
Email__AppUrl=http://clipvwbpod02/dashydashboard/
Email__Events__ScreenshotRejected=true
Email__Events__AllApproved=true
```

Set machine env vars from an **elevated** PowerShell, then `iisreset` (or recycle the app pool) so the
app re-reads them:

```powershell
[Environment]::SetEnvironmentVariable('Email__Enabled','true','Machine')
[Environment]::SetEnvironmentVariable('Email__SmtpHost','<relay-host>','Machine')
# … repeat for the others …
iisreset
```

---

## 2. Local test relay (no production SMTP needed)

The relay is unauthenticated, so any local SMTP catcher works. Point the app at `127.0.0.1` and watch
mail land in the catcher's inbox. Pick one:

### Option A — smtp4dev (recommended; has a web inbox)
```
dotnet tool install -g Rnwood.Smtp4dev
smtp4dev --smtpport 2525 --urls http://localhost:5050
```
Open `http://localhost:5050` for the web inbox. SMTP listens on `127.0.0.1:2525`.

### Option B — Papercut SMTP
Install Papercut-SMTP (desktop app); it listens on `127.0.0.1:25` by default and pops up each message.

### Option C — dependency-free PowerShell catcher (used to verify this feature)
A ~40-line raw-socket SMTP sink that appends every received message to a log file. Speaks just enough
SMTP for MailKit (`SecureSocketOptions.None`, unauthenticated). Save as `smtp_catcher.ps1`:

```powershell
param([int]$Port = 2525, [string]$Out = "$env:TEMP\smtp_catcher.log")
'' | Out-File -FilePath $Out -Encoding ascii
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $ns = $client.GetStream()
    $r = New-Object System.IO.StreamReader($ns)
    $w = New-Object System.IO.StreamWriter($ns); $w.NewLine = "`r`n"; $w.AutoFlush = $true
    $w.WriteLine('220 localhost catcher ready')
    $inData = $false; $msg = New-Object System.Text.StringBuilder
    while ($null -ne ($line = $r.ReadLine())) {
      if ($inData) {
        if ($line -eq '.') { $w.WriteLine('250 OK queued'); $inData = $false
          Add-Content $Out '===BEGIN MESSAGE==='; Add-Content $Out $msg.ToString(); Add-Content $Out '===END MESSAGE==='
          $msg.Clear() | Out-Null
        } else { $msg.AppendLine($line) | Out-Null }
        continue
      }
      $u = $line.ToUpper()
      if ($u.StartsWith('EHLO') -or $u.StartsWith('HELO')) { $w.WriteLine('250-localhost'); $w.WriteLine('250 HELP') }
      elseif ($u.StartsWith('DATA')) { $w.WriteLine('354 End data with <CR><LF>.<CR><LF>'); $inData = $true }
      elseif ($u.StartsWith('QUIT')) { $w.WriteLine('221 Bye'); break }
      else { $w.WriteLine('250 OK') }   # MAIL/RCPT/RSET/NOOP/etc.
    }
  } catch {} finally { $client.Close() }
}
```
Run it (unelevated, since port 2525 > 1024):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\smtp_catcher.ps1 -Port 2525
# messages are appended to %TEMP%\smtp_catcher.log
```

### Point the app at the catcher
For a quick **Kestrel** run (process env vars; see CLAUDE.md "LOCAL IIS DEPLOY" for the full run recipe):
```powershell
$env:Email__Enabled='true'; $env:Email__SmtpHost='127.0.0.1'; $env:Email__SmtpPort='2525'
$env:Email__From='dashy-noreply@local.test'
$env:ASPNETCORE_URLS='http://127.0.0.1:5099'
cd .\publish-dev; dotnet .\DashyDashboard.Api.dll        # content root MUST be publish-dev so appsettings load
```

---

## 3. Manual test steps

Pre-req: an associate whose `Users.EMailAddr` is set (e.g. seeded `2001` Alice Chen →
`alice.chen@broadridge.com`), with at least one **used** tool carrying a screenshot, reviewed by their
manager (or an Admin).

### Test A — ScreenshotRejected
1. As the associate, mark a tool **Used** and upload a screenshot (status → *Pending*), then submit.
2. As the manager/Admin, open the review (action queue **Start review**, the member drawer gallery, or
   the cycle gallery), **Reject** the screenshot and enter a **reason** (a reason is required — a reject
   without one returns 400 and no mail).
3. **Expect:** one mail to the associate. Subject `Screenshot rejected — <client> / <tool> (<cycle>)`.
   Body includes the cycle, client, tool, the **reviewer's name**, the **reason**, and a re-upload link
   built from `Email:AppUrl`.

### Test B — AllApproved (the not-complete → complete transition)
1. Continue from Test A (or any associate who has submitted and has Pending screenshots). Ensure the
   associate's **last** outstanding required screenshot is *Pending* (they may need to re-upload the
   rejected one).
2. As the manager/Admin, **Approve** that last screenshot (single approve, or **Approve all**).
3. **Expect:** exactly **one** mail to the associate. Subject `All screenshots approved — <cycle>`. The
   member's status flips to **Complete**.
4. **Re-fire guard:** Approve again / Approve-all again with nothing pending → the status stays Complete
   and **no second AllApproved mail** is sent. (The transition guard only fires on not-complete →
   complete.)

> Only **used** rows require a screenshot. An optional screenshot on a **no-access** or **not-used** row
> is exempt — approving/rejecting it does not affect the complete transition and won't (on its own)
> trigger AllApproved.

---

## 4. Gotchas

- **Silent failure by design.** Mail is fire-and-forget. A misconfigured/unreachable host does **not**
  error the request — the send fails in the background. If a mail doesn't arrive, check (a) the catcher's
  inbox/log and (b) the app's stdout log (`logs\stdout_*` under IIS, or the console under Kestrel) for a
  `Failed to send email to …` warning or a `Sent email to …` info line.
- **Master switch + per-event toggles.** `Email:Enabled=false` (the default everywhere today) suppresses
  *all* mail before it's queued. Each event also has its own toggle under `Email:Events`. All gating
  (enabled, per-event, recipient has an `EMailAddr`) happens **before** enqueue — with email off, debug
  logs say e.g. `Email disabled … skipping ScreenshotRejected mail`.
- **Recipient must have an email.** No `Users.EMailAddr` → the event is skipped (debug log
  `Recipient has no EMailAddr`).
- **Unauthenticated relay only.** `SecureSocketOptions.None`, no credentials. A relay that requires
  STARTTLS/auth will fail the send (and fail silently per above).
- **`AppUrl` only affects link text** in the body; it does not need to be reachable from the server.
- **Content root when running under Kestrel:** launch from inside `publish-dev` (or pass `--contentRoot`)
  so `appsettings*.json` are found; otherwise only env-var config applies.

---

## 5. Verification status (2026-06-16)

Both events were verified live under Kestrel against the Option-C PowerShell catcher
(`127.0.0.1:2525`), with `Email__Enabled=true`:

- **ScreenshotRejected** — captured, `To: alice.chen@broadridge.com`,
  `Subject: Screenshot rejected — Natixis / Risk Engine (Q1 2026 Attestation)`.
- **AllApproved** — captured on the AwaitingApproval → Complete transition,
  `Subject: All screenshots approved — Q1 2026 Attestation`.
- **Re-fire guard** — a subsequent no-op `approve-all` produced **no** additional message (exactly two
  messages total). 

No email code changes were required; the plumbing behaves as specified.
