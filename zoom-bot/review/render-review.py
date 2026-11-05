"""Render the review documents; original scanner JSON stays separate."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
root=Path(__file__).resolve().parent
out=root.parents[1]/'output/pdf/zoom-security-review.pdf'
out.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles['BodyText'].fontSize=9.5
styles['BodyText'].leading=12.5
styles['BodyText'].spaceAfter=6
styles['Heading1'].fontSize=21
styles['Heading1'].leading=25
styles['Heading1'].textColor=colors.HexColor('#163f36')
styles['Heading2'].fontSize=13
styles['Heading2'].textColor=colors.HexColor('#163f36')
styles.add(ParagraphStyle(name='CodeWrap',parent=styles['BodyText'],fontName='Courier',fontSize=8,leading=11,wordWrap='CJK'))
def inline(s):
 s=escape(s.replace('\u2014','-').replace('\u2013','-'))
 s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'`([^`]+)`',r'<font name="Courier">\1</font>',s)
 return s
story=[]
names=['SUBMISSION-README.md','SSDLC.md','SECURITY-POLICY.md','INCIDENT-RESPONSE.md','VULNERABILITY-MANAGEMENT.md','SCAN-RECORD.md','FINDINGS.md','PRIVACY-NOTICE.md']
for i,name in enumerate(names):
 if i:story.append(PageBreak())
 for block in (root/name).read_text().split('\n\n'):
  if not block.strip():continue
  if block.startswith('# '):style='Heading1';block=block[2:]
  elif block.startswith('## '):style='Heading2';block=block[3:]
  elif block.startswith('    '):style='CodeWrap';block=block.strip()
  else:style='BodyText'
  story.append(Paragraph(inline(block).replace('\n','<br/>'),styles[style]))

def footer(canvas,doc):
 canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#53645f'))
 canvas.drawString(42,24,'Petya | Zoom review preparation | 2026-11-05 | Owner approved')
 canvas.drawRightString(553,24,str(doc.page))
SimpleDocTemplate(str(out),pagesize=(595,842),rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=45,title='Petya Zoom security review package',author='Petya project').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
