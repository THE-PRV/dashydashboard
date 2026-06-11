namespace DashyDashboard.Api.Services;

/// <summary>
/// Sole consumer of <see cref="EmailQueue"/>. Reads composed messages and sends them via <see
/// cref="EmailService.SendAsync"/>, one at a time, for as long as the app runs. A send failure
/// (unreachable relay, DNS failure, etc.) is caught and logged — it never crashes this loop and
/// never affects the request that originally enqueued the mail.
///
/// This is "plumbing, not a scheduled mail": it does not generate any mail itself, it only
/// delivers what <see cref="EmailService"/>'s Enqueue* methods (called from request-handling code)
/// have already composed. A future BackgroundService for scheduled mail (due-date reminders,
/// manager digests) would call <see cref="EmailService"/>'s composition + <see
/// cref="EmailQueue.TryEnqueue"/> the same way and be served by this same consumer.
/// </summary>
public class EmailSenderHostedService : BackgroundService
{
    private readonly EmailQueue _queue;
    private readonly EmailService _email;
    private readonly ILogger<EmailSenderHostedService> _logger;

    public EmailSenderHostedService(EmailQueue queue, EmailService email, ILogger<EmailSenderHostedService> logger)
    {
        _queue = queue;
        _email = email;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await _email.SendAsync(item, stoppingToken);
                _logger.LogInformation("Sent email to {Recipient}: {Subject}", item.ToAddress, item.Subject);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Graceful shutdown — drop the in-flight item, do not log as an error.
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send email to {Recipient}: {Subject}", item.ToAddress, item.Subject);
            }
        }
    }
}
