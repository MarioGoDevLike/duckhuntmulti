"""Builds a field-grade over/under shotgun and exports it as GLB.

Run: blender -b -P over_under_shotgun.py -- <out.glb> [preview.png]
Units are meters. Muzzle points +Y in Blender (-Z in glTF / three.js), Z is up.
Origin sits at the back of the receiver; the pistol grip is ~6 cm behind it.
Wood and engraving textures are generated here and embedded in the GLB.
"""
import os, sys, math
import numpy as np
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "over_under_shotgun.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
os.makedirs(TEX_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new("OverUnderShotgun", None)
scene.collection.objects.link(root)
rng = np.random.default_rng(7)


# --- Procedural textures (u = around the part, v = along its length) ----------
def wave_noise(x, y, octaves=5, base=2.0):
    out = np.zeros_like(x)
    for o in range(octaves):
        f = base * 2 ** o
        a, b, ph = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 6.3)
        out += np.sin(2 * math.pi * f * (a * x + b * y) + ph) / 2 ** o
    return out


def save_image(name, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def walnut_texture():
    h, w = 1024, 256
    v, u = np.mgrid[0:1:h * 1j, 0:1:w * 1j]
    t = u * 22 + 1.2 * wave_noise(u * 0.3, v, 5, 1.5) + 0.25 * wave_noise(u, v, 3, 6)
    grain = (0.5 + 0.5 * np.sin(2 * math.pi * t)) ** 2.2
    figure = 0.5 + 0.5 * wave_noise(u, v * 0.5, 4, 2.0) / 1.9
    k = np.clip(0.3 * grain + 0.7 * figure + rng.normal(0, 0.02, (h, w)), 0, 1)[..., None]
    dark, light = np.array([0.30, 0.13, 0.05]), np.array([0.58, 0.31, 0.14])
    return save_image("walnut", dark + (light - dark) * k)


def engraving_texture():
    h, w = 512, 512
    v, u = np.mgrid[0:1:h * 1j, 0:1:w * 1j]
    x, y = u * 2 * math.pi * 3, v * 2 * math.pi * 2
    s = np.sin(x + 0.9 * np.sin(1.7 * y)) * np.sin(y + 0.9 * np.sin(1.3 * x))
    lines = np.abs(np.sin(6 * s)) < 0.18
    border = (np.minimum(v, 1 - v) < 0.04) | (np.abs(u - 0.5) < 0.006)
    k = np.where(lines | border, 0.45, 1.0) + rng.normal(0, 0.03, (h, w))
    return save_image("engraving", np.array([0.80, 0.80, 0.78]) * k[..., None])


def material(name, rgb, metal, rough, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if image:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color, m.roughness = (*rgb, 1), rough  # viewport/preview only
    return m


BLUED = material("BluedSteel", (0.03, 0.035, 0.05), 1.0, 0.25)
SILVER = material("EngravedReceiver", (0.75, 0.75, 0.73), 1.0, 0.3, engraving_texture())
WALNUT = material("Walnut", (0.45, 0.22, 0.10), 0.0, 0.35, walnut_texture())
RUBBER = material("Rubber", (0.025, 0.025, 0.025), 0.0, 0.9)


# --- Mesh helpers -------------------------------------------------------------
def finish(name, bm, mat, smooth=(), bevel=0.0):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in smooth:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent = root
    if bevel:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, 2, "ANGLE"
    return o


def ring(bm, center, normal, w, h, n, p):
    """Superellipse section (p=2 ellipse, higher = squarer) spanned by X and `normal`."""
    e = 2.0 / p
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        c, s = math.cos(a), math.sin(a)
        off = Vector((w / 2 * math.copysign(abs(c) ** e, c), 0, 0)) \
            + normal * (h / 2 * math.copysign(abs(s) ** e, s))
        pts.append(bm.verts.new(center + off))
    return pts


def loft(name, sections, mat, n=28, p=2.0, vscale=2.0):
    """sections: (y, z, width, height). Each ring is perpendicular to the path, so
    the path may bend (pistol grip). UVs: u around the section, v along the path."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    cs = [Vector((0, y, z)) for y, z, _, _ in sections]
    loops, vpos, dist = [], {}, 0.0
    for i, (_, _, w, h) in enumerate(sections):
        d = (cs[min(i + 1, len(cs) - 1)] - cs[max(i - 1, 0)]).normalized()
        normal = Vector((0, -d.z, d.y))
        if i:
            dist += (cs[i] - cs[i - 1]).length
        ring_verts = ring(bm, cs[i], normal, w, h, n, p)
        for k, vert in enumerate(ring_verts):
            vpos[vert] = (k, dist * vscale)
        loops.append(ring_verts)
    sides = []
    for a, b in zip(loops, loops[1:]):
        sides += [bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])) for k in range(n)]
    bm.faces.new(loops[0])
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in sides:
        ks = [vpos[l.vert][0] for l in f.loops]
        wrap = 0 in ks and n - 1 in ks
        for l in f.loops:
            k, v = vpos[l.vert]
            l[uv].uv = ((n if wrap and k == 0 else k) / n, v)
    return finish(name, bm, mat, sides)


def tube(name, y0, y1, z, r0, r1, bore, mat, n=40):
    bm = bmesh.new()
    rings = [ring(bm, Vector((0, y, z)), Vector((0, 0, 1)), 2 * r, 2 * r, n, 2.0)
             for y, r in ((y0, r0), (y1, r1), (y0, bore), (y1, bore))]
    o0, o1, i0, i1 = rings

    def bridge(a, b):
        return [bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])) for k in range(n)]

    sides = bridge(o0, o1) + bridge(i1, i0)
    bridge(o1, i1)
    bridge(i0, o0)
    return finish(name, bm, mat, sides)


def box(name, center, size, mat, bevel=0.001):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(c + v.co[i] * s for i, (c, s) in enumerate(zip(center, size)))
    return finish(name, bm, mat, bevel=bevel)


# --- Barrels: 28", tapered, with vented top rib -------------------------------
B0, B1, MUZZLE = 0.12, 0.83, 0.83
R_BREECH, R_MUZZLE, BORE = 0.0128, 0.0108, 0.0093
UZ, LZ = 0.0128, -0.0128
tube("BarrelUpper", B0, B1, UZ, R_BREECH, R_MUZZLE, BORE, BLUED)
tube("BarrelLower", B0, B1, LZ, R_BREECH, R_MUZZLE, BORE, BLUED)
loft("Monoblock", [(0.12, 0, 0.034, 0.056), (0.17, 0, 0.032, 0.054)], BLUED, p=4)
box("SideRib", (0, 0.50, 0), (0.014, 0.66, 0.006), BLUED)
RIB_Z = UZ + R_BREECH + 0.0045
box("VentRib", (0, 0.50, RIB_Z), (0.008, 0.66, 0.0018), BLUED)
for i in range(16):
    y = 0.19 + i * 0.04
    top = UZ + R_BREECH + (R_MUZZLE - R_BREECH) * (y - B0) / (B1 - B0)
    box(f"RibPost{i}", (0, y, (top + RIB_Z) / 2), (0.004, 0.008, RIB_Z - top), BLUED, 0)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0018, location=(0, MUZZLE - 0.004, RIB_Z + 0.002))
bead = bpy.context.active_object
bead.name, bead.parent = "FrontBead", root
bead.data.materials.append(SILVER)

# --- Receiver (engraved silver) and action ------------------------------------
loft("Receiver", [(0.000, -0.004, 0.040, 0.064), (0.008, -0.004, 0.042, 0.068),
                  (0.114, -0.004, 0.042, 0.068), (0.122, -0.003, 0.036, 0.060)],
     SILVER, n=32, p=5, vscale=8)
box("TopLever", (0, -0.012, 0.031), (0.011, 0.034, 0.005), BLUED)
box("Safety", (0, -0.035, 0.024), (0.008, 0.012, 0.004), BLUED)
box("Trigger", (0, -0.004, -0.042), (0.005, 0.006, 0.022), SILVER)
bpy.ops.mesh.primitive_torus_add(major_radius=0.017, minor_radius=0.0025,
                                 location=(0, -0.002, -0.045), rotation=(0, math.pi / 2, 0))
guard = bpy.context.active_object
guard.name, guard.parent = "TriggerGuard", root
guard.scale = (1, 1.4, 1)
guard.data.materials.append(BLUED)

# --- Walnut: long slim fore-end, pistol-grip stock (y, z, width, height) -------
loft("ForeEnd", [(0.125, -0.016, 0.046, 0.042), (0.20, -0.017, 0.047, 0.044),
                 (0.38, -0.016, 0.044, 0.040), (0.43, -0.015, 0.042, 0.036),
                 (0.445, -0.014, 0.044, 0.034), (0.452, -0.014, 0.034, 0.024)], WALNUT, p=3)
# Wrist sweeps down from the receiver into the pistol grip; the butt rides above
# it with a curved belly from grip to toe.
grip = [(-0.004, -0.004, 0.038, 0.062), (-0.035, -0.020, 0.032, 0.052),
        (-0.060, -0.055, 0.032, 0.050), (-0.075, -0.095, 0.034, 0.052)]
loft("PistolGrip", grip, WALNUT, p=3)
loft("GripCap", [grip[-1], (-0.077, -0.100, 0.033, 0.050)], RUBBER, p=3)
stock = [(-0.03, 0.006, 0.032, 0.040), (-0.09, -0.0135, 0.036, 0.063),
         (-0.16, -0.0265, 0.039, 0.077), (-0.26, -0.044, 0.042, 0.102),
         (-0.37, -0.059, 0.043, 0.126)]
loft("Stock", stock, WALNUT, p=3)
loft("ButtPad", [stock[-1], (-0.392, -0.059, 0.044, 0.128)], RUBBER, p=3)

# --- Export --------------------------------------------------------------------
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True)
print("Exported", OUT)

# --- Optional preview render -------------------------------------------------
if PREVIEW:
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type, cam_data.ortho_scale = "ORTHO", 1.3
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector((1.0, 0.45, 0.35))
    cam.rotation_euler = (Vector((0, 0.22, -0.02)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 600
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("Preview", PREVIEW)
