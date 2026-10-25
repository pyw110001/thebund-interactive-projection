"""Read-only Rhino ingestion. Run with Python 3.10 + rhino3dm + numpy."""
from pathlib import Path
import json, collections, hashlib
import numpy as np
import rhino3dm as rh

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Crytral Hall.3dm'
OUT = ROOT / 'artifacts' / 'conversion'
OUT.mkdir(parents=True, exist_ok=True)
model = rh.File3dm.Read(str(SOURCE))
objects = {str(o.Attributes.Id): o for o in model.Objects}
definitions = {str(d.Id): d for d in model.InstanceDefinitions}
definition_ids = {str(i) for d in model.InstanceDefinitions for i in d.GetObjectIds()}
roots = [o for key, o in objects.items() if key not in definition_ids]
cache = {}
groups = collections.defaultdict(lambda: {'v': [], 'f': [], 'offset': 0, 'objects': 0})
stats = collections.Counter()
origin = np.array([-1087.5, 16494.5, 5850.0])
glass_bounds = []
landscape_beds = []

def mesh_arrays(g):
    meshes = []
    if isinstance(g, rh.Mesh): meshes = [g]
    elif isinstance(g, rh.Brep): meshes = [f.GetMesh(rh.MeshType.Render) for f in g.Faces]
    elif isinstance(g, rh.Extrusion): meshes = [g.GetMesh(rh.MeshType.Render)]
    vs, fs, offset = [], [], 0
    for mesh in meshes:
        if mesh is None or not len(mesh.Vertices): continue
        v = np.asarray([(p.X, p.Y, p.Z) for p in mesh.Vertices], dtype=np.float64)
        faces = []
        for a,b,c,d in mesh.Faces:
            faces.append((a+offset,b+offset,c+offset))
            if c != d: faces.append((a+offset,c+offset,d+offset))
        vs.append(v); fs.extend(faces); offset += len(v)
    return (np.concatenate(vs), np.asarray(fs, dtype=np.int32)) if vs else None

def transform_matrix(t):
    return np.array([[getattr(t, f'M{i}{j}') for j in range(4)] for i in range(4)])

def classify(layer, lo, hi):
    mid = (lo+hi)/2
    x,y,z = mid
    in_hall = -22500 < x < 20500 and 10100 < y < 23000 and z > 5450
    front = -34000 < x < 31000 and -12500 < y < 10500
    if in_hall:
        if layer in (17,19): return 'Glazing', 'Glass'
        if z > 11550: return 'Roof', 'RoofMetal'
        if layer in (23,18,21,25): return 'Hall', 'SilverMetal'
        if layer in (13,24): return 'Hall', 'Ceiling'
        if layer in (8,5): return 'Hall', 'Stone'
        if layer in (12,7): return 'Hall', 'WarmWall'
        return 'Hall', 'SilverMetal'
    if front:
        if layer in (17,19,26): return 'Forecourt', 'FrostedGlass'
        if layer == 3: return 'Forecourt', 'Planting'
        if layer in (23,18,25): return 'Forecourt', 'GreenMetal'
        if layer in (1,2): return 'Forecourt', 'Stone'
        if layer == 4: return 'Forecourt', 'SeatWood'
        if layer == 24: return 'Forecourt', 'WarmMetal'
        if layer in (12,7): return 'Forecourt', 'WarmWall'
        return 'Forecourt', 'Stone'
    if layer in (17,19,26): return 'Context', 'ContextGlass'
    if layer == 3: return 'Context', 'Planting'
    if layer in (23,18,21,25): return 'Context', 'ContextMetal'
    if z > 14500: return 'Context', 'Canopy'
    if layer in (8,5): return 'Context', 'ContextStone'
    return 'Context', 'ContextMetal'

def visit(o, t, inherited=0, depth=0):
    if depth > 30: raise RuntimeError('Cyclic or excessive block nesting')
    g = o.Geometry
    layer = o.Attributes.LayerIndex or inherited
    if isinstance(g, rh.InstanceReference):
        definition = definitions.get(str(g.ParentIdefId))
        if definition is None: raise RuntimeError('Missing block definition')
        for oid in definition.GetObjectIds():
            visit(objects[str(oid)], t @ transform_matrix(g.Xform), layer, depth+1)
        stats['expanded_instances'] += 1
        return
    key = str(o.Attributes.Id)
    if key not in cache: cache[key] = mesh_arrays(g)
    data = cache[key]
    if data is None:
        stats['non_surface_objects'] += 1
        return
    vertices, faces = data
    world = vertices @ t[:3,:3].T + t[:3,3]
    lo, hi = world.min(axis=0), world.max(axis=0)
    # Retain the full site; discard construction geometry remote from the site.
    if max(abs(lo[0]),abs(hi[0])) > 200000 or max(abs(lo[1]),abs(hi[1])) > 200000:
        stats['remote_objects'] += 1; return
    group, material = classify(layer, lo, hi)
    if group == 'Glazing': glass_bounds.append([lo.tolist(),hi.tolist()])
    if group == 'Forecourt' and material == 'Planting':
        landscape_beds.append([((lo-origin)/1000).tolist(),((hi-origin)/1000).tolist()])
    # Mirror transforms change winding; correct these before Blender import.
    if np.linalg.det(t[:3,:3]) < 0: faces = faces[:, [0,2,1]]
    bucket = groups[group+'__'+material]
    bucket['v'].append(((world-origin)/1000).astype(np.float32))
    bucket['f'].append(faces+bucket['offset'])
    bucket['offset'] += len(vertices); bucket['objects'] += 1
    stats['surface_objects'] += 1

for obj in roots: visit(obj, np.eye(4))
report = {}
for name,bucket in groups.items():
    v,f = np.concatenate(bucket['v']),np.concatenate(bucket['f'])
    np.savez_compressed(OUT / (name+'.npz'), vertices=v, faces=f)
    report[name] = {'vertices':len(v),'triangles':len(f),'sourceObjects':bucket['objects'],
                    'bounds':[v.min(axis=0).tolist(),v.max(axis=0).tolist()]}
if not glass_bounds: raise RuntimeError('Hall glazing not identified')
gb = np.asarray(glass_bounds)
print('HALL GLASS BOUNDS',gb[:,0,:].min(axis=0),gb[:,1,:].max(axis=0))
manifest = {'source':SOURCE.name,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'sourceUnits':'millimeters','units':'meters','originRhinoMm':origin.tolist(),
    'stats':dict(stats),'groups':report,'hallGlassRhinoMm':[gb[:,0,:].min(axis=0).tolist(),gb[:,1,:].max(axis=0).tolist()],
    'landscapeBeds':landscape_beds,
    'sourceObjects':len(model.Objects),'blockDefinitions':len(model.InstanceDefinitions)}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in manifest.items() if k!='groups'},indent=2))
print('GROUPS',json.dumps(report,indent=2))
