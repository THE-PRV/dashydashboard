using System.Security.Cryptography;
using SkiaSharp;

namespace DashyDashboard.Api.Services;

/// <summary>
/// Result of a successful screenshot save. Paths are relative to the configured root; only the
/// main relative path is persisted on the attestation row.
/// </summary>
public sealed record ScreenshotSaveResult(string RelativePath, string ThumbRelativePath, string Sha256Hash);

/// <summary>A screenshot resolved from disk for serving.</summary>
public sealed record ScreenshotFile(Stream Content, string ContentType);

/// <summary>
/// Owns screenshot disk I/O and server-side image encoding. Files use the layout
/// {root}\{cycleId}\{associateId}\{clientId}\{toolId}.{configured extension}, with a matching
/// {toolId}_thumb file. Existing WebP and JPEG paths remain readable if the configured format is
/// changed later.
/// </summary>
public class ScreenshotStorageService
{
    private const int DefaultQuality = 75;
    private const int DefaultMaxLongEdge = 1600;
    private const int DefaultThumbnailQuality = 80;
    private const int DefaultThumbnailWidth = 200;

    private readonly string _root;
    private readonly SKEncodedImageFormat _format;
    private readonly string _extension;
    private readonly int _quality;
    private readonly int _maxLongEdge;
    private readonly int _thumbnailQuality;
    private readonly int _thumbnailWidth;

    public ScreenshotStorageService(IConfiguration config)
    {
        var configuredRoot = config["Screenshots:RootPath"];
        if (string.IsNullOrWhiteSpace(configuredRoot))
            throw new InvalidOperationException(
                "Screenshots:RootPath is not configured. Set it in appsettings.json or via the " +
                "Screenshots__RootPath environment variable.");

        _root = Path.GetFullPath(configuredRoot);

        var configuredFormat = (config["Screenshots:Format"] ?? "webp").Trim().ToLowerInvariant();
        (_format, _extension) = configuredFormat switch
        {
            "webp" => (SKEncodedImageFormat.Webp, ".webp"),
            "jpeg" or "jpg" => (SKEncodedImageFormat.Jpeg, ".jpg"),
            _ => throw new InvalidOperationException(
                "Screenshots:Format must be 'webp', 'jpeg', or 'jpg'.")
        };

        _quality = ReadBoundedInt(config, "Screenshots:Quality", DefaultQuality, 1, 100);
        _maxLongEdge = ReadBoundedInt(config, "Screenshots:MaxLongEdge", DefaultMaxLongEdge, 1, 16_384);
        _thumbnailQuality = ReadBoundedInt(
            config, "Screenshots:ThumbnailQuality", DefaultThumbnailQuality, 1, 100);
        _thumbnailWidth = ReadBoundedInt(
            config, "Screenshots:ThumbnailWidth", DefaultThumbnailWidth, 1, 4_096);
    }

    /// <summary>
    /// Validates and decodes the uploaded image, then applies the production format, quality, and
    /// resize settings. The hash is calculated from the encoded bytes actually stored on disk.
    /// </summary>
    public ScreenshotSaveResult Save(byte[] bytes, int cycleId, string associateId, string clientId, int toolId)
    {
        if (bytes is null || bytes.Length == 0)
            throw new ArgumentException("Screenshot is empty.", nameof(bytes));

        using var decoded = DecodeImage(bytes);
        if (decoded is null)
            throw new ArgumentException("Uploaded file is not a valid image.", nameof(bytes));

        var mainBytes = EncodeResized(decoded, _maxLongEdge, _quality, limitLongEdge: true);
        var thumbBytes = EncodeResized(decoded, _thumbnailWidth, _thumbnailQuality, limitLongEdge: false);

        var dir = ToolDirectory(cycleId, associateId, clientId);
        Directory.CreateDirectory(dir);

        var fileName = $"{toolId}{_extension}";
        var thumbName = $"{toolId}_thumb{_extension}";
        File.WriteAllBytes(Path.Combine(dir, fileName), mainBytes);
        File.WriteAllBytes(Path.Combine(dir, thumbName), thumbBytes);

        var relative = RelativeDir(cycleId, associateId, clientId);
        return new ScreenshotSaveResult(
            Path.Combine(relative, fileName),
            Path.Combine(relative, thumbName),
            Sha256Hex(mainBytes));
    }

    /// <summary>Reads both current and previously stored supported image formats.</summary>
    public ScreenshotFile? Read(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;
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

        if (!IsInsideRoot(full) || !File.Exists(full)) return null;

        var contentType = ContentTypeFor(full);
        if (contentType is null) return null;

        try
        {
            return new ScreenshotFile(
                new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read),
                contentType);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Removes current and legacy-format files for the attestation key.</summary>
    public void Delete(int cycleId, string associateId, string clientId, int toolId)
    {
        var dir = ToolDirectory(cycleId, associateId, clientId);
        foreach (var extension in new[] { ".webp", ".jpg", ".jpeg", ".png" })
        {
            TryDelete(Path.Combine(dir, $"{toolId}{extension}"));
            TryDelete(Path.Combine(dir, $"{toolId}_thumb{extension}"));
        }
    }

    private byte[] EncodeResized(SKBitmap source, int configuredSize, int quality, bool limitLongEdge)
    {
        int targetWidth;
        int targetHeight;

        if (limitLongEdge)
        {
            var longEdge = Math.Max(source.Width, source.Height);
            var scale = longEdge > configuredSize ? configuredSize / (double)longEdge : 1d;
            targetWidth = Math.Max(1, (int)Math.Round(source.Width * scale));
            targetHeight = Math.Max(1, (int)Math.Round(source.Height * scale));
        }
        else
        {
            var scale = source.Width > configuredSize ? configuredSize / (double)source.Width : 1d;
            targetWidth = Math.Max(1, (int)Math.Round(source.Width * scale));
            targetHeight = Math.Max(1, (int)Math.Round(source.Height * scale));
        }

        using var resized = source.Resize(
            new SKImageInfo(targetWidth, targetHeight), SKFilterQuality.High)
            ?? throw new InvalidOperationException("Screenshot could not be resized.");

        return EncodeBitmap(resized, quality);
    }

    private byte[] EncodeBitmap(SKBitmap bitmap, int quality)
    {
        if (_format == SKEncodedImageFormat.Jpeg)
        {
            // JPEG has no alpha channel. Flatten transparent pixels onto white.
            using var surface = SKSurface.Create(new SKImageInfo(
                bitmap.Width, bitmap.Height, SKColorType.Bgra8888, SKAlphaType.Opaque))
                ?? throw new InvalidOperationException("Screenshot encoding surface could not be created.");
            surface.Canvas.Clear(SKColors.White);
            surface.Canvas.DrawBitmap(bitmap, 0, 0);
            surface.Canvas.Flush();

            using var image = surface.Snapshot();
            using var encoded = image.Encode(_format, quality)
                ?? throw new InvalidOperationException("Screenshot could not be encoded as JPEG.");
            return encoded.ToArray();
        }

        using var webpImage = SKImage.FromBitmap(bitmap);
        using var webp = webpImage.Encode(_format, quality)
            ?? throw new InvalidOperationException("Screenshot could not be encoded as WebP.");
        return webp.ToArray();
    }

    private static SKBitmap? DecodeImage(byte[] bytes)
    {
        try { return SKBitmap.Decode(bytes); }
        catch { return null; }
    }

    private string ToolDirectory(int cycleId, string associateId, string clientId)
        => Path.Combine(_root, RelativeDir(cycleId, associateId, clientId));

    private static string RelativeDir(int cycleId, string associateId, string clientId)
        => Path.Combine(
            cycleId.ToString(),
            SafeSegment(associateId, nameof(associateId)),
            SafeSegment(clientId, nameof(clientId)));

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
        var rootWithSeparator = _root.EndsWith(Path.DirectorySeparatorChar)
            ? _root
            : _root + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase)
            || string.Equals(fullPath, _root, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ContentTypeFor(string path)
        => Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".webp" => "image/webp",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            _ => null
        };

    private static int ReadBoundedInt(
        IConfiguration config, string key, int fallback, int minimum, int maximum)
    {
        var raw = config[key];
        if (string.IsNullOrWhiteSpace(raw)) return fallback;
        if (!int.TryParse(raw, out var value) || value < minimum || value > maximum)
            throw new InvalidOperationException($"{key} must be between {minimum} and {maximum}.");
        return value;
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { /* Best-effort cleanup. */ }
    }

    private static string Sha256Hex(byte[] bytes)
        => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
