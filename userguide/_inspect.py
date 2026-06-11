import docx
from docx import Document
d = Document(r"Y:\dashythedashdashboard\dashythedashdashboard\userguide\_tpl_copy.docx")
print("=== PARAGRAPH STYLES (name | base) ===")
from docx.enum.style import WD_STYLE_TYPE
for s in d.styles:
    try:
        if s.type == WD_STYLE_TYPE.PARAGRAPH:
            base = s.base_style.name if s.base_style else "-"
            print(f"  {s.name!r:40}  base={base}")
    except Exception as e:
        pass
print("\n=== CHARACTER/ TABLE styles ===")
for s in d.styles:
    try:
        if s.type in (WD_STYLE_TYPE.CHARACTER, WD_STYLE_TYPE.TABLE):
            print(f"  [{s.type}] {s.name!r}")
    except: pass
print("\n=== BODY PARAGRAPHS (style :: text) ===")
for i,p in enumerate(d.paragraphs):
    t = p.text.strip()
    print(f"  {i:3} [{p.style.name}] {t[:90]!r}")
print("\n=== SECTIONS / headers-footers ===")
for si,sec in enumerate(d.sections):
    print(f"  section {si}: header_linked={sec.header.is_linked_to_previous} footer_linked={sec.footer.is_linked_to_previous} different_first={sec.different_first_page_header_footer}")
