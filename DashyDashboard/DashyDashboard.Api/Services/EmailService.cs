using MailKit.Net.Smtp;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;

namespace DashyDashboard.Api.Services;

/// <summary>
/// Composition + send plumbing for event-triggered mail (Feature 2, §S5). Two responsibilities:
///
/// 1. <c>Enqueue*</c> methods — called from request-handling code (today: <see
///    cref="ManagerService"/>'s screenshot review paths). They build the subject/body and push a
///    fully-composed <see cref="EmailQueueItem"/> onto <see cref="EmailQueue"/>. These are
///    synchronous, never throw, and never touch the network — the request path is unaffected
///    even if email is misconfigured.
/// 2. <see cref="SendAsync"/> — the actual unauthenticated-SMTP delivery, called only by <see
///    cref="EmailSenderHostedService"/> (the queue consumer). A future scheduled BackgroundService
///    (due-date reminders, manager digests — NOT built in this stage) can reuse both halves: compose
///    a message and either enqueue it here or call SendAsync directly.
///
/// All "should we even bother" gating (master switch, per-event toggle, recipient has no
/// EMailAddr) happens in the Enqueue* methods so nothing ever reaches the queue when disabled.
/// </summary>
public class EmailService
{
    private readonly EmailOptions _options;
    private readonly EmailQueue _queue;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptions<EmailOptions> options, EmailQueue queue, ILogger<EmailService> logger)
    {
        _options = options.Value;
        _queue = queue;
        _logger = logger;
    }

    /// <summary>
    /// ScreenshotRejected (§04-email Events table): a reviewer rejected an associate's screenshot.
    /// One mail to the associate with the cycle, client, tool, reviewer's display name, the
    /// rejection reason, and a re-upload instruction linking to the app.
    /// </summary>
    public void EnqueueScreenshotRejected(
        string? recipientEmail, string cycleName, string clientName, string toolName,
        string reviewerName, string? reason)
    {
        if (!ShouldSend(_options.Events.ScreenshotRejected, recipientEmail, "ScreenshotRejected"))
            return;

        var appUrl = AppUrl();
        var subject = $"Screenshot rejected — {clientName} / {toolName} ({cycleName})";
        var reasonText = string.IsNullOrWhiteSpace(reason) ? "(no reason given)" : reason.Trim();

        var body =
            $"Hello,\n\n" +
            $"Your uploaded screenshot for the following attestation was rejected by {reviewerName}:\n\n" +
            $"  Cycle:  {cycleName}\n" +
            $"  Client: {clientName}\n" +
            $"  Tool:   {toolName}\n\n" +
            $"Reason: {reasonText}\n\n" +
            $"Please upload a new screenshot for this tool in DashyDashboard.\n" +
            $"{appUrl}\n\n" +
            $"This is an automated message — please do not reply.";

        _queue.TryEnqueue(new EmailQueueItem(recipientEmail!, subject, body));
        _logger.LogDebug("Queued ScreenshotRejected mail to {Recipient} for {Client}/{Tool} ({Cycle}).",
            recipientEmail, clientName, toolName, cycleName);
    }

    /// <summary>
    /// AllApproved (§04-email Events table): an approval (single or bulk) brought the associate's
    /// non-approved screenshot count to zero for the cycle. ONE "you're complete" mail — never a
    /// per-image approval mail. Callers must apply the not-complete -&gt; complete transition guard
    /// before calling this (see <see cref="ManagerService"/>).
    /// </summary>
    public void EnqueueAllApproved(string? recipientEmail, string cycleName)
    {
        if (!ShouldSend(_options.Events.AllApproved, recipientEmail, "AllApproved"))
            return;

        var appUrl = AppUrl();
        var subject = $"All screenshots approved — {cycleName}";

        var body =
            $"Hello,\n\n" +
            $"All of your uploaded screenshots for cycle \"{cycleName}\" have been approved. " +
            $"Your attestation is complete — no further action is needed.\n\n" +
            $"View your attestation in DashyDashboard:\n" +
            $"{appUrl}\n\n" +
            $"This is an automated message — please do not reply.";

        _queue.TryEnqueue(new EmailQueueItem(recipientEmail!, subject, body));
        _logger.LogDebug("Queued AllApproved mail to {Recipient} for cycle {Cycle}.", recipientEmail, cycleName);
    }

    /// <summary>
    /// Sends one message via the configured unauthenticated SMTP relay. Called only by the queue
    /// consumer — callers are expected to wrap this in try/catch (a send must never throw onto a
    /// request path; the consumer logs failures and moves on).
    /// </summary>
    public async Task SendAsync(EmailQueueItem item, CancellationToken ct)
    {
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(_options.From));
        message.To.Add(MailboxAddress.Parse(item.ToAddress));
        message.Subject = item.Subject;
        message.Body = new TextPart(TextFormat.Plain) { Text = item.Body };

        using var client = new SmtpClient();
        await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, MailKit.Security.SecureSocketOptions.None, ct);
        // Corporate internal relay — unauthenticated by design (per plans/04-email.md).
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }

    /// <summary>
    /// Common pre-enqueue gate: master switch, per-event toggle, and recipient address presence.
    /// Logs at debug only (per spec: "skip silently, no log spam beyond debug-level").
    /// </summary>
    private bool ShouldSend(bool eventEnabled, string? recipientEmail, string eventName)
    {
        if (!_options.Enabled)
        {
            _logger.LogDebug("Email disabled (Email:Enabled=false) — skipping {Event} mail.", eventName);
            return false;
        }
        if (!eventEnabled)
        {
            _logger.LogDebug("Event {Event} disabled (Email:Events:{Event}=false) — skipping mail.", eventName, eventName);
            return false;
        }
        if (string.IsNullOrWhiteSpace(recipientEmail))
        {
            _logger.LogDebug("Recipient has no EMailAddr — skipping {Event} mail.", eventName);
            return false;
        }
        return true;
    }

    private string AppUrl() => string.IsNullOrWhiteSpace(_options.AppUrl) ? "" : _options.AppUrl;
}
