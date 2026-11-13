"""Cuts the "American Woodcock" scan (RISD Nature Lab, Sketchfab, CC-BY-4.0) down to a game asset: the 23 pieces
joined, 1.5M triangles decimated to ~TARGET, the 4K texture cut to 1024² JPEG, the bird scaled to LENGTH m bill to tail
and centred on its bounding box. Head toward Blender -Y (three.js +z), up +Z. No rig: the game uses it for downed birds
and the menu card; flying woodcock stay procedural.

Run: blender -b -P woodcock.py -- <scene.gltf> <out.glb> [preview.png]
"""
import sys, math
import bpy
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None
TARGET = 24000   # triangles
LENGTH = 0.5     # m; drawn over life size (~0.3 m) like the game's other birds, so it reads at range
TEX = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
bird = bpy.context.view_layer.objects.active
bird.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o is not bird: bpy.data.objects.remove(o)

# Weld the seams between the scan's pieces, then decimate.
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.05); bpy.ops.object.mode_set(mode="OBJECT")
tris = sum(len(p.vertices) - 2 for p in bird.data.polygons)
dec = bird.modifiers.new("dec", "DECIMATE"); dec.ratio = min(1, TARGET / tris)
bpy.ops.object.modifier_apply(modifier="dec")
bpy.ops.object.shade_smooth()

# The scan stands on its tail, bill down, belly toward +Y: turned -90 deg about X so the head points -Y and the back
# up, then scaled to LENGTH bill to tail and centred on its bounding box.
me = bird.data
me.transform(bird.matrix_world); bird.matrix_world = Matrix()
me.transform(Matrix.Rotation(-math.pi / 2, 4, "X"))
lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)]); hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
k = LENGTH / (hi.y - lo.y); c = (lo + hi) / 2
me.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-c))
print("woodcock: tris", tris, "->", sum(len(p.vertices) - 2 for p in bird.data.polygons), "size", (hi - lo) * k)

for img in bpy.data.images:
    if img.size[0] > TEX: img.scale(TEX, TEX)
mat = bird.data.materials[0]; mat.name = "woodcock"
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); bsdf.inputs["Roughness"].default_value = 0.85
bird.name = "Woodcock"

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=85,
                          use_selection=False, export_yup=True, export_texcoords=True, export_normals=True)

if PREVIEW:  # side and top views
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"; sc.display.shading.light = "STUDIO"
    sc.render.resolution_x, sc.render.resolution_y = 500, 500
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.type = "ORTHO"; cam.data.ortho_scale = 0.56
    sc.collection.objects.link(cam); sc.camera = cam
    for name, loc, rot in [("x", (1, 0, 0), (math.pi / 2, 0, math.pi / 2)), ("y", (0, -1, 0), (math.pi / 2, 0, 0)), ("z", (0, 0, 1), (0, 0, 0))]:
        cam.location, cam.rotation_euler = loc, rot
        sc.render.filepath = PREVIEW.replace(".png", f"_{name}.png"); bpy.ops.render.render(write_still=True)
