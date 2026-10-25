"""Build a portable Blender/GLB scene from cached Rhino tessellation.

Run inside Blender, after `python scripts/extract_rhino.py`.
"""
import bpy, bmesh, json, math, numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
CONVERSION = ROOT/'artifacts/conversion'
ASSETS = ROOT/'public/assets'
BLEND = ROOT/'artifacts/blender/crystal-hall.blend'
ASSETS.mkdir(parents=True,exist_ok=True)
BLEND.parent.mkdir(parents=True,exist_ok=True)
(ROOT/'artifacts/previews').mkdir(parents=True,exist_ok=True)
manifest = json.loads((CONVERSION/'manifest.json').read_text('utf-8'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in [bpy.data.meshes,bpy.data.materials,bpy.data.cameras,bpy.data.lights,bpy.data.worlds,bpy.data.images]:
    for block in list(datablocks):
        if block.users==0:datablocks.remove(block)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1

def mat(name,color,metal=0,rough=.6,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,alpha)
    bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    bs.inputs['Alpha'].default_value=alpha
    m.diffuse_color=(*color,alpha)
    if alpha<1:
        m.surface_render_method='DITHERED'
        m.use_transparency_overlap=False
    return m

materials={
 'Glass':mat('Glass',(.42,.62,.72),.12,.16,.13),
 'SilverMetal':mat('SilverMetal',(.54,.58,.59),.7,.3),
 'RoofMetal':mat('RoofMetal',(.10,.13,.15),.72,.38),
 'Stone':mat('Stone',(.40,.41,.39),.05,.84),
 'Ceiling':mat('Ceiling',(.60,.60,.55),.1,.68),
 'WarmWall':mat('WarmWall',(.50,.46,.37),0,.82),
 'FrostedGlass':mat('FrostedGlass',(.42,.53,.49),.1,.42,.74),
 'GreenMetal':mat('GreenMetal',(.18,.30,.25),.6,.43),
 'Planting':mat('Planting',(.10,.19,.08),0,.92),
 'SeatWood':mat('SeatWood',(.40,.30,.17),0,.85),
 'WarmMetal':mat('WarmMetal',(.48,.38,.24),.65,.38),
 'ContextGlass':mat('ContextGlass',(.11,.22,.28),.38,.3),
 'ContextMetal':mat('ContextMetal',(.25,.28,.30),.45,.64),
 'ContextStone':mat('ContextStone',(.29,.30,.29),.05,.88),
 'Canopy':mat('Canopy',(.045,.06,.08),.18,.82),
}
parents={}
def parent(name):
    if name not in parents:
        obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);parents[name]=obj
    return parents[name]

def make_mesh(name,vertices,faces,material,owner):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    obj.data.materials.append(material);obj.parent=parent(owner)
    return obj

for name in manifest['groups']:
    group,material=name.split('__')
    data=np.load(CONVERSION/(name+'.npz'))
    obj=make_mesh(group+'_'+material,data['vertices'],data['faces'],materials[material],group)
    obj.data.validate(clean_customdata=False)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00008)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00002)
    bm.to_mesh(obj.data);bm.free();obj.data.validate(clean_customdata=False);obj.data.update()
    if group=='Context' and len(obj.data.polygons)>30000:
        mod=obj.modifiers.new('Context simplification','DECIMATE');mod.ratio=.48
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.validate(clean_customdata=False)
    obj['source_group']=name;obj['source_objects']=manifest['groups'][name]['sourceObjects']
    # The ceiling belongs to the roof visibility group to allow a true cutaway.
    if material=='Ceiling':obj.parent=parent('Roof')

# Portable tile texture: a small, deterministic architectural material, not artwork.
size=512;rng=np.random.default_rng(47)
yy,xx=np.mgrid[0:size,0:size]
base=.42+rng.normal(0,.009,(size,size))
tile=(xx//128+yy//128)%3
base+=tile*.009
seam=((xx%128)<2)|((yy%128)<2)
base[seam]=.22
pixels=np.zeros((size,size,4),dtype=np.float32)
pixels[:,:,:3]=base[:,:,None]*np.array([1.02,1.025,1.0]);pixels[:,:,3]=1
tileimg=bpy.data.images.new('Stone paving tile',width=size,height=size)
tileimg.pixels.foreach_set(pixels.ravel());tileimg.filepath_raw=str(ASSETS/'paving.png');tileimg.file_format='PNG';tileimg.save();tileimg.pack()
for key in ['Stone','ContextStone']:
    m=materials[key];tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=tileimg
    m.node_tree.links.new(tex.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for obj in list(bpy.data.objects):
    if obj.type=='MESH' and obj.data.materials and obj.data.materials[0].name in ['Stone','ContextStone']:
        uv=obj.data.uv_layers.new(name='PavingUV')
        for poly in obj.data.polygons:
            n=poly.normal;axis=2 if abs(n.z)>.5 else (1 if abs(n.y)>.5 else 0)
            for li in poly.loop_indices:
                p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=((p.x,p.y) if axis==2 else ((p.x,p.z) if axis==1 else (p.y,p.z)))

def box(name,loc,scale,material,owner):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    obj=bpy.context.object;obj.name=name;obj.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(material);obj.parent=parent(owner)
    return obj

ground=box('RiversidePaving',(12,-3,-3.58),(240,180,.14),materials['Stone'],'Forecourt')
uv=ground.data.uv_layers.active or ground.data.uv_layers.new(name='UVMap')
for poly in ground.data.polygons:
    for li in poly.loop_indices:
        p=ground.data.vertices[ground.data.loops[li].vertex_index].co
        uv.data[li].uv=(p.x/2,p.y/2)

# Low landscape planting is added only inside the Rhino's existing planting-bed planes.
foliage_vertices=[];foliage_faces=[];foliage_colors=[]
palette=[(.045,.095,.022,1),(.07,.13,.035,1),(.10,.16,.045,1)]
for lo,hi in manifest.get('landscapeBeds',[]):
    lo=np.array(lo);hi=np.array(hi)
    for px in np.arange(lo[0]+.13,hi[0]-.10,.34):
        for py in np.arange(lo[1]+.10,hi[1]-.08,.30):
            cx=px+rng.uniform(-.06,.06);cy=py+rng.uniform(-.05,.05)
            radius=rng.uniform(.15,.24);height=rng.uniform(.12,.24);start=len(foliage_vertices)
            color=palette[int(rng.integers(0,len(palette)))]
            for ring in range(5):
                a=math.pi*ring/4
                for seg in range(8):
                    b=math.tau*seg/8
                    foliage_vertices.append((cx+math.sin(a)*math.cos(b)*radius,cy+math.sin(a)*math.sin(b)*radius,hi[2]+.035+math.cos(a)*height))
                    foliage_colors.append(color)
            for ring in range(4):
                for seg in range(8):
                    a=start+ring*8+seg;b=start+ring*8+(seg+1)%8
                    foliage_faces.append((a,b,b+8,a+8))
if foliage_vertices:
    foliage=mat('LandscapeFoliage',(.08,.14,.03),0,.93)
    color_node=foliage.node_tree.nodes.new('ShaderNodeVertexColor');color_node.layer_name='FoliageColor'
    foliage.node_tree.links.new(color_node.outputs['Color'],foliage.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    shrubs=make_mesh('ExistingLandscapePlanting',foliage_vertices,foliage_faces,foliage,'Forecourt')
    colors=shrubs.data.color_attributes.new(name='FoliageColor',type='FLOAT_COLOR',domain='POINT')
    for i,c in enumerate(foliage_colors):colors.data[i].color=c
    for polygon in shrubs.data.polygons:polygon.use_smooth=True
    shrubs.data.validate(clean_customdata=False)

# Main regular facade is 40 x 5.8m. Overhang, entrance feature and signage are excluded.
screen={'width':39.6,'height':5.4,'center':[0,-5.56598,2.9],'bottom':.2,'top':5.6,'glassPlaneY':-5.96598,'setback':.4}
w,h=screen['width'],screen['height'];y=screen['center'][1];bottom=screen['bottom'];top=screen['top']
art=bpy.data.images.load(str(ASSETS/'floral-garden.png'),check_existing=True);art.pack()
projection=bpy.data.materials.new('ProjectionArtwork');projection.use_nodes=True
nodes=projection.node_tree.nodes;nodes.clear()
out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');tex=nodes.new('ShaderNodeTexImage');tex.image=art
projection.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);projection.node_tree.links.new(em.outputs[0],out.inputs[0]);em.inputs['Strength'].default_value=1.3
verts=[(-w/2,y,bottom),(w/2,y,bottom),(w/2,y,top),(-w/2,y,top)]
screenobj=make_mesh('ProjectionScreen',verts,[(0,1,2,3)],projection,'CurtainAssembly')
uv=screenobj.data.uv_layers.new(name='UVMap')
crop=(art.size[0]/art.size[1])/(w/h)
uvs=[(0,.5-crop/2),(1,.5-crop/2),(1,.5+crop/2),(0,.5+crop/2)]
for i,coord in enumerate(uvs):uv.data[i].uv=coord
screenobj.shape_key_add(name='Basis')
retract=screenobj.shape_key_add(name='Retracted')
for v in retract.data:v.co.z=top
retract.value=0
screenobj['screen_width_m']=w;screenobj['screen_height_m']=h;screenobj['art_uv_crop']=crop
for name,loc,dim in [
 ('RollerHousing',(0,y,5.76),(w+.5,.34,.28)),
 ('CurtainBottomBar',(0,y-.008,bottom),(w+.06,.055,.075)),
 ('CurtainSupportLeft',(-20.1,y+.15,2.9),(.10,.14,5.8)),
 ('CurtainSupportRight',(20.1,y+.15,2.9),(.10,.14,5.8))]:
    box(name,loc,dim,materials['SilverMetal'],'CurtainAssembly')

# Architectural light strips. Runtime may dim the emissive material for daytime.
lightmat=mat('ArchitecturalLight',(1,.72,.4),0,.35)
bs=lightmat.node_tree.nodes.get('Principled BSDF')
bs.inputs['Emission Color'].default_value=(1,.61,.25,1);bs.inputs['Emission Strength'].default_value=2.0
box('FacadeLightLine',(0,-6.04,5.79),(40.4,.045,.045),lightmat,'Hall')
for x in [-20.2,20.2]:box('VerticalRevealLight',(x,-6.04,2.9),(.035,.035,5.8),lightmat,'Hall')

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,target,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;aim(obj,target)
    obj['runtime_only']=True
    return obj
area('DuskKey',(-20,-25,38),(0,0,0),48000,45,(.65,.77,1))
area('WarmForecourt',(4,-10,16),(4,-14,-2),13000,28,(1,.78,.53))
area('SkyFill',(20,15,35),(0,0,2),55000,50,(.60,.73,1))
area('ScreenBounce',(0,-5.8,3),(0,-22,-2),2200,35,(1,.78,.79))
world=bpy.data.worlds.new('DuskWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.20,.34,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
camdata=bpy.data.cameras.new('ExteriorCamera');cam=bpy.data.objects.new('ExteriorCamera',camdata);scene.collection.objects.link(cam)
cam.location=(-26,-60,17);aim(cam,(2,-3,4));camdata.lens=35;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'artifacts/previews/blender-exterior.png')

config={'schemaVersion':1,'units':'meters','source':manifest['source'],'sourceSha256':manifest['sourceSha256'],
 'building':{'length':40,'depth':12,'facadeHeight':5.8,'roofEnvelope':[41.054,12.554,1.45],
             'measurement':'Regular glazing grid; overhang/entrance rooftop feature excluded'},
 'screen':{'width':w,'height':h,'top':top,'bottom':bottom,'setback':.4,'glassInteriorPlaneZ':5.96598,'center':[0,2.9,5.56598],'defaultCrop':crop},
 'cameras':{'exterior':{'position':[-12,12,58],'target':[0,3,4]},
            'interior':{'position':[14,3.3,-3.9],'target':[-1,2.9,5.59]},
            'top':{'position':[0,68,11],'target':[0,0,1]}},
 'assumptions':['One continuous conceptual screen; door openings and mechanical design require engineering development',
                'No projector count or photometric simulation inferred from the earlier 15m scheme'],
 'sourceStats':manifest['stats']}
(ASSETS/'scene-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
scene['source']=manifest['source'];scene['dimensions_m']='40 x 12 x 5.8';scene['screen_m']=f'{w} x {h}'
scene['coordinate_mapping']='Rhino mm -> Blender meters; GLB +Y up, front +Z'
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
for image in bpy.data.images:
    if image.source=='FILE':image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
# glTF uses PBR and the standard unlit extension for the static artwork.
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'crystal-hall.glb'),export_format='GLB',export_animations=False,
 export_morph=True,export_morph_normal=False,export_cameras=False,export_lights=False,export_extras=True,
 export_yup=True,export_materials='EXPORT',export_image_format='AUTO')
print('CRYSTAL_BUILD_COMPLETE',str(BLEND),str(ASSETS/'crystal-hall.glb'))
# Keep the editable file in its fully deployed default state even if the exporter samples shape keys.
retract.value=0
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
