"""Deterministic orientation fixtures, generated solely for acceptance tests."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]/'artifacts/qa-media'
root.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',54)
for name,width,height in [('orientation',1466,200),('portrait',300,800)]:
    im=Image.new('RGB',(width,height),'#f7fafc');d=ImageDraw.Draw(im)
    d.rectangle((0,0,width//3,height),fill='#e84040')
    d.rectangle((width//3,0,2*width//3,height),fill='#39bc72')
    d.rectangle((2*width//3,0,width,height),fill='#3e7ce8')
    d.rectangle((0,0,width,10),fill='white');d.rectangle((0,height-10,width,height),fill='black')
    if name=='orientation':
        d.text((24,22),'LEFT',font=font,fill='white');d.text((width//3+30,22),'TOP 123',font=font,fill='white');d.text((2*width//3+24,22),'RIGHT',font=font,fill='white')
        d.text((width//3+30,110),'BOTTOM',font=font,fill='black')
    else:d.text((22,30),'TOP',font=font,fill='white');d.text((22,height-100),'END',font=font,fill='black')
    im.save(root/(name+'.png'))
    if name=='orientation':
        im.save(root/'orientation.jpg',quality=92)
        im.save(root/'orientation.webp',quality=92)
(root/'broken.png').write_bytes(b'not an image')
(root/'unsupported.txt').write_text('unsupported fixture')
print(root)
