using System.Threading.Channels;

namespace DashyDashboard.Api.Services;

/// <summary>
/// A queued outbound mail: a fully-composed message ready for SMTP delivery. Composition
/// (subject/body templating, recipient lookup) happens BEFORE enqueueing — the consumer only
/// sends.
/// </summary>
public sealed record EmailQueueItem(string ToAddress, string Subject, string Body);

/// <summary>
/// Unbounded in-memory queue of outbound mail. <see cref="EmailService"/> (or a future
/// BackgroundService such as a due-date reminder sweep) writes composed messages here;
/// <see cref="EmailSenderHostedService"/> is the sole reader and performs the actual SMTP send.
///
/// Using a Channel keeps the request path non-blocking: <see cref="TryEnqueue"/> is a
/// synchronous, allocation-light call that never awaits I/O and never throws.
/// </summary>
public class EmailQueue
{
    private readonly Channel<EmailQueueItem> _channel =
        Channel.CreateUnbounded<EmailQueueItem>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });

    public ChannelReader<EmailQueueItem> Reader => _channel.Reader;

    /// <summary>Queues a message for background delivery. Never blocks, never throws.</summary>
    public void TryEnqueue(EmailQueueItem item) => _channel.Writer.TryWrite(item);
}
