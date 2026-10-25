"""Independent GLB round trip. Run in a fresh background Blender process."""
import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/crystal-hall.glb'))
required=['Hall','Roof','Glazing','Context','ProjectionScreen','CurtainAssembly']
for name in required:assert bpy.data.objects.get(name) is not None,name
screen=bpy.data.objects['ProjectionScreen']
assert screen.data.shape_keys is not None
assert screen.data.shape_keys.key_blocks['Retracted'].value==0
assert len(screen.data.uv_layers)>0
images=[{'name':i.name,'packed':bool(i.packed_file),'size':list(i.size)} for i in bpy.data.images if i.source=='FILE']
assert images and all(i['packed'] for i in images),images
report={'groups':required,'objects':len(bpy.data.objects),'meshObjects':sum(o.type=='MESH' for o in bpy.data.objects),
        'images':images,'screenVertices':[list(v.co) for v in screen.data.vertices],
        'morphDefault':screen.data.shape_keys.key_blocks['Retracted'].value,'missingFiles':[]}
(root/'artifacts/glb-roundtrip.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('GLB_ROUNDTRIP_PASS',json.dumps(report))
