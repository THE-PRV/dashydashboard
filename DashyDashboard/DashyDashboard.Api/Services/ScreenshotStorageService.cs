using System.Security.Cryptography;
using SkiaSharp;

namespace DashyDashboard.Api.Services;

/// <summary>
/// Result of a successful screenshot save. Carries the values the caller persists on the
/// attestation row. Paths are RELATIVE to the configured root and use the platform separator;
/// only <see cref="RelativePath"/> is stored in the DB.
/// </summary>
public sealed record ScreenshotSaveResult(string RelativePath, string ThumbRelativePath, string Sha256Hash);

/// <summary>
/// A screenshot resolved off disk for serving: an open read stream plus its content type.
/// The caller owns the stream and must dispose it.
/// </summary>
public sealed record ScreenshotFile(Stream Content, string ContentType);

/// <summary>
/// Sole owner of screenshot disk I/O. Stores files under a configured root using the layout
/// <c>{root}\{cycleId}\{associateId}\{clientId}\{toolId}.webp</c> (plus a <c>{toolId}_thumb.webp</c>).
/// The main image is written AS-RECEIVED (the browser already compressed it); the bytes are decoded
/// only to validate they are a real image, and a ~200px-wide WebP thumbnail is generated.
///
/// Path safety: every path segment is built from validated DB values, never raw user text. Any
/// string segment containing a path separator, ':' or ".." is rejected, and reads are guarded
/// against escaping the configured root.
/// </summary>
public class ScreenshotStorageService
{
    private const string MainContentType = "image/webp";
    private const int ThumbWidth = 200;

    private readonly string _root;

    public ScreenshotStorageService(IConfiguration config)
    {
        var configured = config["Screenshots:RootPath"];
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException(
                "Screenshots:RootPath is not configured. Set it in appsettings.json or via the " +
                "Screenshots__RootPath environment variable.");

        // Normalise once so all later containment checks compare against a canonical absolute root.
        _root = Path.GetFullPath(configured);
    }

    /// <summary>
    /// Validates that <paramref name="bytes"/> decode as a real image, writes them AS-RECEIVED to
    /// the main file, generates a ~200px-wide WebP thumbnail, and returns the relative paths + hash.
    /// The server never re-encodes the main image — decoding is validation only.
    /// </summary>
    /// <exception cref="ArgumentException">If the bytes are empty or do not decode as an image.</exception>
    public ScreenshotSaveResult Save(byte[] bytes, int cycleId, string associateId, string clientId, int toolId)
    {
        if (bytes is null || bytes.Length == 0)
            throw new ArgumentException("Screenshot is empty.", nameof(bytes));

        // Validation only: confirm the payload is a decodable image. We do NOT keep this decode for
        // the main file — the original bytes are stored verbatim.
        using (var decoded = DecodeImage(bytes))
        {
            if (decoded is null)
                throw new ArgumentException("Uploaded file is not a valid image.", nameof(bytes));
        }

        var dir = ToolDirectory(cycleId, associateId, clientId);
        Directory.CreateDirectory(dir); // idempotent; auto-creates the missing structure.

        var fileName = $"{toolId}.webp";
        var thumbName = $"{toolId}_thumb.webp";
        var fullPath = Path.Combine(dir, fileName);
        var thumbPath = Path.Combine(dir, thumbName);

        // Main image: written exactly as received (last write wins on re-upload).
        File.WriteAllBytes(fullPath, bytes);

        WriteThumbnail(bytes, thumbPath);

        var hash = Sha256Hex(bytes);
        var relative = RelativeDir(cycleId, associateId, clientId);
        return new ScreenshotSaveResult(
            Path.Combine(relative, fileName),
            Path.Combine(relative, thumbName),
            hash);
    }

    /// <summary>
    /// Resolves <paramref name="relativePath"/> against the CURRENT configured root and returns a
    /// read stream + content type. Returns <c>null</c> (never throws) if the path is missing, escapes
    /// the root, or is otherwise unservable, so callers can 404.
    /// </summary>
    public ScreenshotFile? Read(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;

        // Reject absolute paths and any traversal before touching the filesystem.
        if (Path.IsPathRooted(relativePath) || relativePath.Contains("..")) return null;

        string full;
        try
        {
            full = Path.GetFullPath(Path.Combine(_root, relativePath));
        }
        catch
        {
            return null;
        }

        // Containment guard: the resolved path must stay inside the configured root.
        if (!IsInsideRoot(full)) return null;
        if (!File.Exists(full)) return null;

        try
        {
            var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read);
            return new ScreenshotFile(stream, MainContentType);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Removes the main file and its thumbnail for the given attestation key. Idempotent — missing
    /// files are ignored. Exposed now for the future retention sweep.
    /// </summary>
    public void Delete(int cycleId, string associateId, string clientId, int toolId)
    {
        var dir = ToolDirectory(cycleId, associateId, clientId);
        TryDelete(Path.Combine(dir, $"{toolId}.webp"));
        TryDelete(Path.Combine(dir, $"{toolId}_thumb.webp"));
    }

    // ── internals ────────────────────────────────────────────────────────────

    /// <summary>
    /// Decodes image bytes, returning null for anything undecodable. SkiaSharp's
    /// <see cref="SKBitmap.Decode(byte[])"/> THROWS (ArgumentNullException, "codec") rather than
    /// returning null when the codec can't be created for garbage input, so we trap that here and
    /// normalise it to a null result for clean validation.
    /// </summary>
    private static SKBitmap? DecodeImage(byte[] bytes)
    {
        try { return SKBitmap.Decode(bytes); }
        catch { return null; }
    }

    private void WriteThumbnail(byte[] sourceBytes, string thumbPath)
    {
        using var original = DecodeImage(sourceBytes)
            ?? throw new ArgumentException("Uploaded file is not a valid image.");

        // Only downscale; never upscale a small image.
        var targetWidth = Math.Min(ThumbWidth, original.Width);
        if (targetWidth <= 0) targetWidth = original.Width;
        var targetHeight = Math.Max(1, (int)Math.Round(original.Height * (targetWidth / (double)original.Width)));

        using var thumb = original.Resize(
            new SKImageInfo(targetWidth, targetHeight), SKFilterQuality.Medium)
            ?? original;
        using var image = SKImage.FromBitmap(thumb);
        using var data = image.Encode(SKEncodedImageFormat.Webp, 80);
        using var fs = new FileStream(thumbPath, FileMode.Create, FileAccess.Write, FileShare.None);
        data.SaveTo(fs);
    }

    /// <summary>Absolute directory for a tool's screenshots, with all segments validated.</summary>
    private string ToolDirectory(int cycleId, string associateId, string clientId)
        => Path.Combine(_root, RelativeDir(cycleId, associateId, clientId));

    /// <summary>Relative directory (under the root) for a tool's screenshots.</summary>
    private static string RelativeDir(int cycleId, string associateId, string clientId)
        => Path.Combine(
            cycleId.ToString(),
            SafeSegment(associateId, nameof(associateId)),
            SafeSegment(clientId, nameof(clientId)));

    /// <summary>
    /// Guards a string path segment. These come from validated DB values, but we still reject
    /// anything that could escape or redirect the path: separators, drive markers, traversal.
    /// </summary>
    private static string SafeSegment(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"Path segment '{name}' is empty.", name);

        if (value.Contains('/') || value.Contains('\\') || value.Contains(':') || value.Contains(".."))
            throw new ArgumentException($"Path segment '{name}' contains illegal characters.", name);

        return value;
    }

    private bool IsInsideRoot(string fullPath)
    {
        var rootWithSep = _root.EndsWith(Path.DirectorySeparatorChar)
            ? _root
            : _root + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase)
            || string.Equals(fullPath, _root, StringComparison.OrdinalIgnoreCase);
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { /* retention cleanup is best-effort */ }
    }

    private static string Sha256Hex(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
