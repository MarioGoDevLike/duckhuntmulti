"""Builds the other hunters' figure: camo jacket and trousers, cap with a blaze band, leather boots, a cartridge
belt and a game bag, holding the over/under at the shoulder. Exported as GLB.

Run: blender -b -P hunter.py -- <out.glb> [preview_prefix]
Needs ../models/over_under_shotgun.glb (built by over_under_shotgun.py).
Units are meters. Blender: faces +Y, Z up, +X is the hunter's right (glTF/three.js: faces -Z, Y up).
Nodes the game uses: "Arms" (pivot at the right shoulder pocket; pitch it about X to raise the gun) and
"Muzzle" (an empty at the muzzle, under Arms, for the flash).
Body parts are metaballs (smooth organic blends) turned into meshes; the camo is in vertex colours from 3D noise,
so it needs no UVs and shows no seams.
"""
import os, sys, math
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "hunter.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
HERE = os.path.dirname(os.path.abspath(__file__))
GUN_GLB = os.path.join(HERE, "..", "models", "over_under_shotgun.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new("Hunter", None)
scene.collection.objects.link(root)


def srgb(c):  # sRGB 0..1 → linear, the space colour attributes and glTF factors use
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# --- Materials ----------------------------------------------------------------
def material(name, rgb, rough, metal=0.0, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*srgb(rgb), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if vcol:  # base colour from the "Col" attribute, so the exporter writes COLOR_0
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        nt.links.new(a.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color = (*srgb(rgb), 1)
    return m


CAMO = material("Camo", (0.5, 0.45, 0.33), 0.92, vcol=True)
SKIN = material("Skin", (0.80, 0.60, 0.47), 0.6, vcol=True)
LEATHER = material("Leather", (0.36, 0.22, 0.12), 0.55)
GLOVE = material("Glove", (0.30, 0.24, 0.16), 0.75)
SOLE = material("Sole", (0.09, 0.08, 0.07), 0.9)
BLAZE = material("Blaze", (0.98, 0.38, 0.05), 0.7)
CANVAS = material("Canvas", (0.40, 0.36, 0.24), 0.95)
KNIT = material("Knit", (0.20, 0.21, 0.15), 1.0)
POCKET = material("Pocket", (0.33, 0.33, 0.21), 0.95)
ZIP = material("Zip", (0.10, 0.10, 0.09), 0.6)
SHELL = material("ShellHull", (0.62, 0.08, 0.06), 0.45)
BRASS = material("Brass", (0.78, 0.60, 0.28), 0.3, 0.9)
EYE = material("Eye", (0.06, 0.05, 0.05), 0.2)
BROW = material("Brow", (0.24, 0.16, 0.10), 0.9)


# --- Metaball bodies ----------------------------------------------------------
K = 0.575  # surface reach of one ellipsoid element at stiffness 2, threshold 0.6, per unit radius


class Blob:
    """One metaball family: its elements blend smoothly into one surface."""

    def __init__(self, name):
        self.name = name
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = self.mb.render_resolution = 0.011
        self.obj = bpy.data.objects.new(name, self.mb)
        scene.collection.objects.link(self.obj)

    def ell(self, c, a, b, h, rot=None):
        """Ellipsoid centred at c with half-extents a (x), b (y), h (z) before rotation."""
        e = self.mb.elements.new(type="ELLIPSOID")
        r = max(a, b, h) / K
        e.co, e.radius, e.stiffness = Vector(c), r, 2.0
        e.size_x, e.size_y, e.size_z = a / (K * r), b / (K * r), h / (K * r)
        if rot is not None:
            e.rotation = rot
        return e

    def seg(self, p, q, ra, rb=None):
        """A limb segment from p to q: an ellipsoid stretched along it, ra thick (rb the other way)."""
        p, q = Vector(p), Vector(q)
        d = q - p
        rot = Vector((1, 0, 0)).rotation_difference(d.normalized())
        return self.ell((p + q) / 2, d.length / 2 + ra * 0.35, rb or ra, ra, rot)

    def mesh(self, mat, ratio=0.35):
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(self.obj.evaluated_get(dg))
        bpy.data.objects.remove(self.obj)
        bpy.data.metaballs.remove(self.mb)
        o = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(o)
        if ratio < 1:
            mod = o.modifiers.new("Dec", "DECIMATE")
            mod.ratio = ratio
            dg = bpy.context.evaluated_depsgraph_get()
            me2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            o.modifiers.clear()
            o.data = me2
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons:
            p.use_smooth = True
        o.parent = root
        return o


# --- Camo in vertex colours -----------------------------------------------------
# A marsh woodland: dry-grass tan ground, olive and bark-brown blotches, near-black shadows, fine reed streaks.
TAN, OLIVE, BARK, DARK = (0.62, 0.55, 0.40), (0.34, 0.37, 0.21), (0.37, 0.26, 0.16), (0.13, 0.12, 0.10)


def camo_at(p):
    q = p * 9.0
    n1 = noise.noise(q + Vector((3.1, 0, 0))) + 0.4 * noise.noise(q * 2.3)
    n2 = noise.noise(q * 1.2 + Vector((0, 7.7, 1.3))) + 0.35 * noise.noise(q * 2.9 + Vector((5, 5, 5)))
    n3 = noise.noise(q * 1.6 + Vector((11, 2, 9)))
    c = TAN
    if n1 > 0.05:
        c = OLIVE
    if n2 > 0.28:
        c = BARK
    if n3 > 0.42:
        c = DARK
    reed = noise.noise(Vector((p.x * 60, p.y * 60, p.z * 6)))  # thin vertical streaks
    k = 0.9 + 0.15 * reed
    return [min(1, x * k) for x in c]


def paint(o, fn, ao=0.28):
    me = o.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    mw = o.matrix_world
    nm = mw.to_3x3()
    for v in me.vertices:
        p = mw @ v.co
        c = fn(p)
        n = (nm @ v.normal).normalized()
        shade = 1 - ao * (0.5 - 0.5 * n.z)  # undersides a touch darker
        attr.data[v.index].color = (*srgb([x * shade for x in c]), 1)


def prim(op, name, mat, parent=root, **kw):
    op(**kw)
    o = bpy.context.active_object
    o.name, o.parent = name, parent
    o.data.materials.append(mat)
    return o


# --- Pose ---------------------------------------------------------------------
# Standing to shoot, left foot forward, gun mounted at the right shoulder.
HIP_L, HIP_R = Vector((-0.10, 0.01, 0.92)), Vector((0.10, -0.01, 0.92))
KNEE_L, KNEE_R = Vector((-0.13, 0.10, 0.50)), Vector((0.13, -0.06, 0.50))
ANK_L, ANK_R = Vector((-0.15, 0.12, 0.10)), Vector((0.16, -0.10, 0.10))
SH_L, SH_R = Vector((-0.18, 0.03, 1.40)), Vector((0.19, -0.03, 1.40))

G = Vector((0.10, 0.38, 1.53))                # gun origin (back of the receiver) in the world
PIVOT = G + Vector((0, -0.38, -0.06))         # the butt pad in the shoulder pocket: the pitch pivot
GRIP = G + Vector((0, -0.05, -0.07))
FOREND = G + Vector((-0.005, 0.20, -0.035))
EL_R, EL_L = Vector((0.33, 0.12, 1.33)), Vector((-0.07, 0.30, 1.24))
WR_R = GRIP + Vector((0.02, -0.03, -0.01))
WR_L = FOREND + Vector((-0.04, -0.06, -0.035))

# --- Trousers -----------------------------------------------------------------
pants = Blob("Trousers")
pants.ell((0, 0.0, 0.96), 0.175, 0.115, 0.11)                  # seat and hips
pants.ell((0, -0.04, 0.90), 0.14, 0.09, 0.08)
for hip, knee, ank in ((HIP_L, KNEE_L, ANK_L), (HIP_R, KNEE_R, ANK_R)):
    pants.seg(hip, knee, 0.085, 0.09)
    pants.ell(knee, 0.068, 0.07, 0.07)
    pants.seg(knee, ank + Vector((0, 0, 0.12)), 0.064, 0.068)
trousers = pants.mesh(CAMO, 0.5)

# --- Boots ---------------------------------------------------------------------
bt = Blob("Boots")
for ank in (ANK_L, ANK_R):
    bt.ell(ank + Vector((0, 0, 0.09)), 0.062, 0.064, 0.11)      # shaft over the trousers
    bt.ell(ank + Vector((0, 0.06, -0.035)), 0.058, 0.12, 0.048)  # foot
    bt.ell(ank + Vector((0, 0.15, -0.045)), 0.05, 0.05, 0.038)   # toe
    bt.ell(ank + Vector((0, -0.04, -0.03)), 0.05, 0.05, 0.05)    # heel
boots = bt.mesh(LEATHER)
sl = Blob("Soles")
for ank in (ANK_L, ANK_R):
    sl.ell(ank + Vector((0, 0.06, -0.083)), 0.064, 0.15, 0.018)
soles = sl.mesh(SOLE)

# --- Jacket --------------------------------------------------------------------
jk = Blob("Jacket")
jk.ell((0, 0.0, 0.92), 0.19, 0.13, 0.08)       # hem over the hips
jk.ell((0, 0.01, 1.06), 0.18, 0.125, 0.14)     # belly
jk.ell((0, 0.0, 1.26), 0.20, 0.13, 0.15)       # chest
jk.seg(SH_L + Vector((0.03, 0, -0.01)), SH_R + Vector((-0.03, 0, -0.01)), 0.075, 0.1)  # shoulders
jk.ell((0, 0.0, 1.46), 0.075, 0.07, 0.05)      # collar
jk.ell((0.0, 0.11, 1.18), 0.13, 0.03, 0.08)    # chest pockets
jk.ell((0.0, -0.10, 1.22), 0.16, 0.03, 0.14)   # back
jacket = jk.mesh(CAMO, 0.5)

# Sleeves and gloves move with the gun, so they are their own pieces under Arms.
sv = Blob("Sleeves")
for sh, el, wr in ((SH_L, EL_L, WR_L), (SH_R, EL_R, WR_R)):
    sv.ell(sh, 0.07, 0.07, 0.07)
    sv.seg(sh, el, 0.062)
    sv.ell(el, 0.056, 0.056, 0.056)
    sv.seg(el, wr, 0.052)
    sv.ell(wr + (el - wr).normalized() * 0.03, 0.054, 0.054, 0.054)  # cuff
sleeves = sv.mesh(CAMO, 0.5)

gl = Blob("Gloves")
for wr, at in ((WR_R, GRIP), (WR_L, FOREND)):
    d = (at - wr).normalized()
    gl.seg(wr, at, 0.035, 0.03)                                         # back of the hand
    gl.ell(at + Vector((0, 0, -0.012)), 0.04, 0.034, 0.03)              # fingers round the wood
    gl.ell(wr + d * 0.03 + Vector((0.025, 0, 0.01)), 0.02, 0.02, 0.02)  # thumb root
gloves = gl.mesh(GLOVE)

# --- Head ----------------------------------------------------------------------
# Head bent onto the stock: forward, a little down and to the right.
HC = Vector((0.0, 0.05, 1.645))
HR = Matrix.Rotation(math.radians(14), 4, "X") @ Matrix.Rotation(math.radians(-10), 4, "Y")


def hp(x, y, z):
    return HC + (HR @ Vector((x, y, z)))


hd = Blob("Head")
hd.ell((0.0, 0.0, 1.52), 0.058, 0.058, 0.07)         # neck
hd.ell(hp(0, 0, 0), 0.088, 0.10, 0.11)                 # skull
hd.ell(hp(0, 0.045, -0.065), 0.07, 0.06, 0.05)         # jaw
hd.ell(hp(0, 0.088, 0.0), 0.012, 0.025, 0.028)         # nose
hd.ell(hp(0, 0.075, 0.04), 0.07, 0.03, 0.025)          # brow ridge
for s in (-1, 1):
    hd.ell(hp(0.088 * s, -0.005, 0.0), 0.012, 0.025, 0.032)  # ears
    hd.ell(hp(0.045 * s, 0.07, -0.035), 0.03, 0.025, 0.025)  # cheeks
head = hd.mesh(SKIN, 0.5)

for s in (-1, 1):
    side = "LR"[s > 0]
    prim(bpy.ops.mesh.primitive_uv_sphere_add, f"Eye{side}", EYE,
         radius=0.0125, segments=10, ring_count=6, location=hp(0.033 * s, 0.092, 0.012))
    br = Blob(f"Brow{side}")
    br.ell(hp(0.035 * s, 0.103, 0.034), 0.026, 0.01, 0.008)
    br.mesh(BROW, 1.0)

# --- Cap: camo crown, stiff brim, blaze-orange band -----------------------------
cp = Blob("Cap")
cp.ell(hp(0, -0.005, 0.045), 0.096, 0.106, 0.085)
cap = cp.mesh(CAMO, 0.6)
bm_ = Blob("Brim")
bm_.ell(hp(0, 0.115, 0.03), 0.082, 0.06, 0.009, Quaternion((1, 0, 0), math.radians(-8)) @ HR.to_quaternion())
brim = bm_.mesh(CAMO, 0.6)
bd = Blob("CapBand")
bd.ell(hp(0, -0.005, 0.012), 0.099, 0.109, 0.016)
band = bd.mesh(BLAZE, 0.6)

for o in (trousers, jacket, sleeves):
    paint(o, camo_at)

SKIN_C, STUBBLE, LIPS = (0.80, 0.60, 0.47), (0.36, 0.27, 0.20), (0.62, 0.36, 0.30)
HINV = HR.inverted()


def face_at(p):
    l = HINV @ (p - HC)  # head space: y forward, z up
    if l.z < -0.035 and l.y > -0.02 and p.z > 1.53:  # jaw and chin
        k = min(1, (-0.035 - l.z) / 0.02)
        c = [a + (b - a) * k for a, b in zip(SKIN_C, STUBBLE)]
        if abs(l.x) < 0.022 and -0.05 < l.z < -0.038 and l.y > 0.06:
            c = LIPS
        return c
    return SKIN_C


paint(head, face_at, ao=0.2)
for o in (cap, brim):
    paint(o, lambda p: camo_at(p * 1.3), ao=0.15)

# --- Belt with shotgun shells, and a game-bag strap ------------------------------
bpy.context.view_layer.update()
jbvh = BVHTree.FromObject(jacket, bpy.context.evaluated_depsgraph_get())


def surface(p, outward, lift=0.004):
    """Where a ray from outside toward p meets the jacket, lifted off it a little."""
    outward = outward.normalized()
    hit, n, _, _ = jbvh.ray_cast(p + outward * 0.5, -outward, 1.0)
    return (hit + outward * lift) if hit else p


def ribbon(name, pts, outs, width, thick, mat):
    """A flat strap through pts (on the surface), its face turned along outs."""
    bm = bmesh.new()
    rows = []
    for i, (p, o) in enumerate(zip(pts, outs)):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(o).normalized() * (width / 2)
        on = o.normalized() * thick
        rows.append([bm.verts.new(p + side), bm.verts.new(p - side), bm.verts.new(p - side + on), bm.verts.new(p + side + on)])
    for a, b in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent = root
    return o


def patch(name, target, bvh, p, outward, size, mat, lift=0.0):
    """A small bevelled box lying on target's surface where a ray toward p meets it (pockets, flaps, zip pull)."""
    outward = outward.normalized()
    hit, n, _, _ = bvh.ray_cast(p + outward * 0.5, -outward, 1.0)
    if not hit:
        return None
    o = prim(bpy.ops.mesh.primitive_cube_add, name, mat, size=1, location=hit + n * (size[1] / 2 + lift))
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = n.to_track_quat("Y", "Z")
    o.scale = size
    o.modifiers.new("Bevel", "BEVEL").width = min(size) * 0.4
    return o


# Zip down the front, chest and hip pockets with flaps, a collar, knit cuffs.
zip_pts = [surface(Vector((0, 0, z)), Vector((0, 1, 0)), 0.002) for z in [0.89 + 0.02 * k for k in range(29)]]
ribbon("Zip", zip_pts, [Vector((0, 1, 0))] * len(zip_pts), 0.012, 0.004, ZIP)
for s in (-1, 1):
    out = Vector((0.15 * s, 1, 0.1))
    patch(f"ChestPocket{s}", jacket, jbvh, Vector((0.09 * s, 0, 1.2)), out, (0.1, 0.01, 0.11), POCKET)
    patch(f"ChestFlap{s}", jacket, jbvh, Vector((0.09 * s, 0, 1.26)), out, (0.106, 0.008, 0.035), KNIT, 0.01)
    patch(f"HipFlap{s}", jacket, jbvh, Vector((0.13 * s, 0, 1.0)), Vector((0.5 * s, 1, -0.2)), (0.11, 0.008, 0.035), KNIT, 0.004)
collar = Blob("Collar")
for k in range(10):
    a = 2 * math.pi * k / 10
    collar.ell((0.075 * math.cos(a), 0.07 * math.sin(a) - 0.005, 1.475 + 0.012 * math.sin(a)), 0.035, 0.035, 0.03)
paint(collar.mesh(CAMO, 0.6), camo_at)
cuffs = Blob("Cuffs")
for wr, el in ((WR_L, EL_L), (WR_R, EL_R)):
    d = (el - wr).normalized()
    cuffs.seg(wr + d * 0.01, wr + d * 0.05, 0.047)
cuffs = cuffs.mesh(KNIT, 0.6)

# Cargo pockets on the thighs.
tbvh = BVHTree.FromObject(trousers, bpy.context.evaluated_depsgraph_get())
for s, hip, knee in ((-1, HIP_L, KNEE_L), (1, HIP_R, KNEE_R)):
    mid, out = hip.lerp(knee, 0.5), Vector((s, 0.15, 0))
    patch(f"Cargo{s}", trousers, tbvh, mid, out, (0.12, 0.012, 0.14), POCKET)
    patch(f"CargoFlap{s}", trousers, tbvh, mid + Vector((0, 0, 0.065)), out, (0.125, 0.008, 0.04), KNIT, 0.012)

BELT_Z = 0.955
belt_pts, belt_out = [], []
for k in range(48):
    a = 2 * math.pi * k / 47
    out = Vector((math.cos(a), math.sin(a), 0))
    belt_pts.append(surface(Vector((0, 0, BELT_Z)), out, 0.003))
    belt_out.append(out)
ribbon("Belt", belt_pts, belt_out, 0.05, 0.008, LEATHER)

bk = prim(bpy.ops.mesh.primitive_cube_add, "Buckle", BRASS, size=1,
          location=surface(Vector((0, 0, BELT_Z)), Vector((0, 1, 0)), 0.012))
bk.scale = (0.05, 0.008, 0.042)

# Shells in loops round the belt, either side of the buckle: red hulls, brass heads down.
for a_deg in list(range(20, 76, 8)) + list(range(104, 161, 8)):
    a = math.radians(a_deg)
    out = Vector((math.cos(a), math.sin(a), 0))
    base = surface(Vector((0, 0, BELT_Z)), out, 0.017)
    prim(bpy.ops.mesh.primitive_cylinder_add, f"Shell{a_deg}", SHELL,
         radius=0.0105, depth=0.05, vertices=10, location=base + Vector((0, 0, 0.012)))
    prim(bpy.ops.mesh.primitive_cylinder_add, f"ShellHead{a_deg}", BRASS,
         radius=0.011, depth=0.014, vertices=10, location=base + Vector((0, 0, -0.019)))

# Strap from the left shoulder, across the chest and back, to a game bag on the right hip.
front, front_out = [], []
for k in range(13):
    t = k / 12
    p = SH_L.lerp(Vector((0.19, 0.0, 0.97)), t)
    p.z += 0.03 * math.sin(math.pi * t)
    o = Vector((0, 1, 0.6 * (1 - t)))
    front.append(surface(p, o, 0.006))
    front_out.append(o)
back = [surface(Vector((p.x, -p.y, p.z)), Vector((0, -1, o.z)), 0.006) for p, o in zip(front, front_out)]
over = [surface(SH_L + Vector((0.02, dy, 0.1)), Vector((0, dy * 3, 1)), 0.006) for dy in (-0.06, -0.02, 0.02, 0.06)]
ribbon("Strap", back[::-1] + over + front,
       [Vector((0, -1, 0.3))] * len(back) + [Vector((0, 0, 1))] * len(over) + front_out, 0.04, 0.006, LEATHER)

bag = prim(bpy.ops.mesh.primitive_cube_add, "GameBag", CANVAS, size=1, location=(0.235, -0.03, 0.83))
bag.scale = (0.05, 0.26, 0.2)
bag.modifiers.new("Bevel", "BEVEL").width = 0.018
flap = prim(bpy.ops.mesh.primitive_cube_add, "GameBagFlap", LEATHER, size=1, location=(0.262, -0.03, 0.885))
flap.scale = (0.006, 0.24, 0.1)
flap.modifiers.new("Bevel", "BEVEL").width = 0.003

# --- The gun and the arms, which pitch together ---------------------------------
arms = bpy.data.objects.new("Arms", None)
scene.collection.objects.link(arms)
arms.parent = root
arms.location = PIVOT

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=GUN_GLB)
for o in set(bpy.data.objects) - before:
    if o.parent is None:
        o.parent = arms
        o.location = G - PIVOT
muzzle = bpy.data.objects.new("Muzzle", None)
scene.collection.objects.link(muzzle)
muzzle.parent = arms
muzzle.location = G + Vector((0, 0.84, 0.013)) - PIVOT

for o in (sleeves, gloves, cuffs):
    o.parent = arms
    o.matrix_parent_inverse = Matrix.Translation(-PIVOT)

# --- Export ---------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.update()
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print(f"HUNTER triangles: {tris}")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True)

# --- Optional preview renders -----------------------------------------------------
if PREVIEW:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.7, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 60
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0.0, 0.25, 0.95))
    for tag, ang in (("front", 35), ("side", 100), ("back", 215)):
        a = math.radians(ang)
        cam.location = target + Vector((math.sin(a) * 4.6, math.cos(a) * 4.6, 0.6))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{PREVIEW}_{tag}.png"
        bpy.ops.render.render(write_still=True)
