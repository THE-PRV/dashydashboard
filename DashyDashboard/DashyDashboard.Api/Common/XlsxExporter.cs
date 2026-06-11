using ClosedXML.Excel;

namespace DashyDashboard.Api.Common;

public static class XlsxExporter
{
    // headers = column titles; rows = one object?[] per data row, same length/order as headers.
    public static byte[] Build(string sheetName, string[] headers, IEnumerable<object?[]> rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet(string.IsNullOrWhiteSpace(sheetName) ? "Sheet1" : sheetName);

        // Header row (bold, light fill)
        for (int c = 0; c < headers.Length; c++)
        {
            var cell = ws.Cell(1, c + 1);
            cell.Value = headers[c];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#E2E8F0");
        }

        int r = 2;
        foreach (var row in rows)
        {
            for (int c = 0; c < row.Length; c++)
            {
                var v = row[c];
                var cell = ws.Cell(r, c + 1);
                if (v is null) cell.Value = string.Empty;
                else if (v is int i) cell.Value = i;
                else if (v is double d) cell.Value = d;
                else if (v is decimal m) cell.Value = m;
                else if (v is bool b) cell.Value = b;
                else if (v is DateTime dt) cell.Value = dt;
                else cell.Value = v.ToString();
            }
            r++;
        }

        var lastRow = Math.Max(1, r - 1);
        var range = ws.Range(1, 1, lastRow, headers.Length);
        range.SetAutoFilter();          // filter dropdowns on header
        ws.SheetView.FreezeRows(1);     // freeze header row
        ws.Columns().AdjustToContents(); // size columns to content

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
