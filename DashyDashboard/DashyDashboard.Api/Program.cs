using System.Threading.RateLimiting;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Middleware;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Connection string 'Default' is not configured. Set it in appsettings.Production.json or via environment variables.");
}

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(connectionString));

builder.Services.AddScoped<AttestationService>();
builder.Services.AddScoped<ManagerService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AdminService>();
// Stateless, config-only owner of screenshot disk I/O.
builder.Services.AddSingleton<ScreenshotStorageService>();

// Event-triggered email (Feature 2, §S5). EmailService composes + enqueues; the hosted service
// is the sole queue consumer and performs the actual SMTP send. Fire-and-forget by design — see
// Services/EmailService.cs.
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.AddSingleton<EmailQueue>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddHostedService<EmailSenderHostedService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Windows Authentication is handled by IIS (both dev and prod).
// IIS passes the Windows identity; the app just accepts it via IISDefaults.
// Under Kestrel (dotnet run), identity is null and dev falls back to X-User-Id header.
builder.Services.AddAuthentication("Windows");
builder.Services.AddAuthorization();

// CORS — dev only, restricted to Vite dev server.
builder.Services.AddCors(opt => opt.AddPolicy("dev", p =>
    p.WithOrigins("http://localhost:5173")
     .WithHeaders("Content-Type", "X-User-Id")
     .WithMethods("GET", "PUT", "POST")));

// Fixed-window rate limiter — 120 req/min per caller, partitioned by Windows user or IP.
builder.Services.AddRateLimiter(opt =>
{
    opt.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var partitionKey = ctx.User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(partitionKey))
            partitionKey = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                Window = TimeSpan.FromMinutes(1),
                PermitLimit = 120,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
            });
    });
    opt.RejectionStatusCode = 429;
});

var app = builder.Build();

// Redirect the sub-application root without a trailing slash (e.g. /dashydashboard) to
// /dashydashboard/ so the SPA's relative asset URLs (Vite base './') resolve under the
// sub-path instead of the site root. IIS does not add the slash itself for an in-process app.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.PathBase.HasValue && !ctx.Request.Path.HasValue)
    {
        ctx.Response.Redirect(ctx.Request.PathBase + "/" + ctx.Request.QueryString, permanent: false);
        return;
    }
    await next();
});

// Global exception handler — never leak stack traces.
app.UseExceptionHandler(err => err.Run(async ctx =>
{
    var ex = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    ctx.Response.ContentType = "application/problem+json";
    ctx.Response.StatusCode = ex switch
    {
        UnauthorizedAccessException => 403,
        KeyNotFoundException        => 404,
        InvalidOperationException   => 400,
        _                           => 500,
    };
    await ctx.Response.WriteAsJsonAsync(new
    {
        status = ctx.Response.StatusCode,
        title  = ctx.Response.StatusCode switch
        {
            400 => "Bad request.",
            403 => "Forbidden.",
            404 => "Resource not found.",
            _   => "An unexpected error occurred."
        }
    });
}));

if (!app.Environment.IsDevelopment())
    app.UseHsts();

if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();

// Security response headers.
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    ctx.Response.Headers.Append("X-Frame-Options", "DENY");
    ctx.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    ctx.Response.Headers.Append("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (!ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.Headers.Append("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
            "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';");
    }
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors("dev");
}

app.UseRateLimiter();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<UserIdentityMiddleware>();
app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
