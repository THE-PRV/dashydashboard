import zipfile, re
z = zipfile.ZipFile(r"Y:\dashythedashdashboard\dashythedashdashboard\userguide\_tpl_copy.docx")
def txt(name):
    try: return z.read(name).decode("utf-8","replace")
    except KeyError: return ""
ns_t = re.compile(r"<w:t[ >].*?</w:t>", re.S)
def alltext(xml):
    return " | ".join(re.sub("<.*?>","",m) for m in ns_t.findall(xml))
doc = txt("word/document.xml")
print("=== document.xml: TOC field present? ===", "TOC" in doc and ("fldSimple" in doc or "instrText" in doc))
print("=== SDT (content controls) in document body ===", doc.count("<w:sdt>"))
# titles / aliases of SDTs
for m in re.finditer(r'<w:alias w:val="([^"]+)"', doc): print("  SDT alias:", m.group(1))
for m in re.finditer(r'<w:docPartGallery w:val="([^"]+)"', doc): print("  docPart:", m.group(1))
print("\n=== TOC instruction text ===")
for m in re.finditer(r'<w:instrText[^>]*>(.*?)</w:instrText>', doc, re.S): print("  ", m.group(1).strip())
print("\n=== header2 (first/cover) text ===\n ", alltext(txt("word/header2.xml")))
print("\n=== header1 (body) text ===\n ", alltext(txt("word/header1.xml")))
print("\n=== footer3 (cover) text ===\n ", alltext(txt("word/footer3.xml")))
print("\n=== footer1 text ===\n ", alltext(txt("word/footer1.xml")))
print("\n=== footer2 text ===\n ", alltext(txt("word/footer2.xml")))
print("\n=== docProps/core.xml ===\n ", alltext(txt("docProps/core.xml")))
# section properties: how many sectPr, headers/footers refs
print("\n=== sectPr header/footer references ===")
for m in re.finditer(r'<w:(headerReference|footerReference) w:type="(\w+)" r:id="(\w+)"', doc): print("  ", m.group(1), m.group(2), m.group(3))
# rels mapping
print("\n=== document.xml.rels (header/footer/image) ===")
for m in re.finditer(r'Id="(\w+)"[^>]*Target="([^"]+)"', txt("word/_rels/document.xml.rels")):
    if any(k in m.group(2) for k in ("header","footer","image","media")): print("  ", m.group(1), "->", m.group(2))
