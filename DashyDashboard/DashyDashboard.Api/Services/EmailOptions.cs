namespace DashyDashboard.Api.Services;

/// <summary>
/// Strongly-typed binding for the "Email" config section. <see cref="Enabled"/> is the master
/// switch (default false in dev); each event under <see cref="Events"/> has its own toggle.
/// <see cref="AppUrl"/> is an absolute base URL used to build links in mail bodies (e.g.
/// "http://clipvwbpod02/dashydashboard/").
/// </summary>
public class EmailOptions
{
    public const string SectionName = "Email";

    public bool Enabled { get; set; }
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 25;
    public string From { get; set; } = "dashydashboard-noreply@example.com";
    public string AppUrl { get; set; } = "";
    public EmailEventOptions Events { get; set; } = new();
}

/// <summary>Per-event toggles under "Email:Events". Both default true (Enabled is the master gate).</summary>
public class EmailEventOptions
{
    public bool ScreenshotRejected { get; set; } = true;
    public bool AllApproved { get; set; } = true;
}
