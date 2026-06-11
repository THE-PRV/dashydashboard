import zipfile, re
p = r"Y:\dashythedashdashboard\dashythedashdashboard\userguide\Access Review - User Guide.docx"
z = zipfile.ZipFile(p)
doc = z.read("word/document.xml").decode("utf-8","replace")
# callout shading fills present?
fills = re.findall(r'<w:shd[^>]*w:fill="([0-9A-Fa-f]{6})"', doc)
print("shading fills found:", set(fills))
# table cell borders present?
print("tcBorders blocks:", doc.count("<w:tcBorders>"))
# images / drawings inline
print("inline drawings:", doc.count("<wp:inline"))
# settings updateFields
s = z.read("word/settings.xml").decode("utf-8","replace")
print("updateFields true:", 'w:updateFields w:val="true"' in s or 'w:updateFields w:val="1"' in s)
# cover SDT title text
cover = doc[:doc.find("Table of contents")] if "Table of contents" in doc else doc[:4000]
ts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", cover)
print("cover text runs:", [t for t in ts if t.strip()][:12])
# media files
print("media:", [n for n in z.namelist() if n.startswith("word/media/")])
