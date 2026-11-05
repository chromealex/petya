"""Render the factual architecture submitted with the Zoom review materials."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
im=Image.new('RGB',(1500,1000),'#f5f7fa'); d=ImageDraw.Draw(im)
font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
font=ImageFont.truetype(font_path,22); small=ImageFont.truetype(font_path,19); title=ImageFont.truetype(font_path,32)
def box(x,y,w,h,heading,lines):
    d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill='white',outline='#406080',width=3)
    d.text((x+18,y+15),heading,font=font,fill='#16324f')
    for i,line in enumerate(lines): d.text((x+18,y+52+i*28),line,font=small,fill='#263445')
d.text((40,25),'Petya / Zoom integration - implemented architecture',font=title,fill='#16324f')
box(40,100,440,265,'User desktop / Electron',['OS-based Zoom meeting detection','Automatic or confirmed joining','Credentials in OS safeStorage','Local ASR after meeting completion','Encrypted company memory','UI and permission-scoped MCP access'])
box(890,100,550,265,'Private server / RUVDS (Russia)',['nginx: external HTTPS, TLS 1.2 / 1.3','Node.js OAuth broker and recorder','Zoom Meeting SDK 7.1.5 + OBF token','PulseAudio virtual device','Encrypted audio and token storage','Internal services use localhost HTTP'])
d.line((480,180,890,180),fill='#406080',width=3);d.polygon([(890,180),(878,174),(878,186)],fill='#406080');d.text((535,150),'HTTPS OAuth / jobs',font=small,fill='#263445')
d.line((890,285,480,285),fill='#406080',width=3);d.polygon([(480,285),(492,279),(492,291)],fill='#406080');d.text((525,305),'Completed audio over HTTPS',font=small,fill='#263445')
box(890,490,550,200,'Zoom platform',['OAuth: user:read:user, user:read:token','Authorized user must be in the meeting','SDK joins as a separate participant','Host admission / recording permission'])
d.line((1170,365,1170,390),fill='#406080',width=3);d.line((1170,435,1170,490),fill='#406080',width=3);d.text((950,400),'HTTPS REST + encrypted SDK media',font=small,fill='#263445')
box(40,490,730,200,'Stored data and boundaries',['Server: AES-256-GCM tokens, job metadata and audio','Keys: protected server environment files','Audio removed after desktop acknowledgment','Unacknowledged audio: operator retention management'])
d.text((40,745),'Validation and limitations',font=font,fill='#16324f')
for i,line in enumerate(['Protocol, OAuth isolation/refresh, retry and MCP tests pass; live recording acceptance is pending.','No formal SSDLC evidence, SAST/DAST reports, or independent penetration test is available.','No Zoom webhooks are subscribed; webhook signature validation is not implemented.','External app sharing requires Zoom approval. Diagram dated 2026-11-05.']):d.text((40,790+i*35),line,font=small,fill='#263445')
im.save(Path(__file__).with_name('architecture.png'))
