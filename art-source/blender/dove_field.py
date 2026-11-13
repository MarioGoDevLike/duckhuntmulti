"""Builds the props of the Sunflower Field dove map: late-season sunflowers (heads heavy and nodding, petals dried),
the cut stalks of the harvested strip, a wooden power-line pole, a dead snag the doves sit in, and a fence post.
Everything is vertex-coloured (no textures) and low-poly, as the game plants thousands of them. Exported as GLB.

Run: blender -b -P dove_field.py -- <out.glb> [preview_prefix]
Units are meters, Blender Z up (glTF/three.js: Y up). Objects, each with its base at the origin:
  Sunflower    ~1.9 m, head ~0.32 across facing down and out along Blender -Y (three.js +z); the game turns each plant
  Stalk        ~0.35 m cut stalk of the harvested strip
  Pole         ~9 m, crossarm along X at 8.4 m; the wires hang from the insulator tops at (three.js) x = -1.05 and
               1.05, y = 8.6, and x = 0, y = 9.14 (on the pole top)
  Snag         ~11 m dead tree, bare limbs
  Post         ~1.3 m fence post
The colours are in a COLOR_0 attribute (linear); the game draws them with vertex colours.
"""
import sys, math, random, colorsys
import bpy
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "dove_field.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):  # sRGB 0..1 -> linear
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def hsl(h, s, l):
    return lin(colorsys.hls_to_rgb(h, l, s))


# One material for every prop: base colour from the vertex colours.
MAT = bpy.data.materials.new("FieldProps")
MAT.use_nodes = True
nt = MAT.node_tree
bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.95


class Mesh:
    """Collects faces with a colour per face corner, then makes one object."""
    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def face(self, pts, col):
        i0 = len(self.v)
        self.v += [tuple(p) for p in pts]
        self.f.append(tuple(range(i0, i0 + len(pts))))
        self.c += [col] * len(pts)

    def tube(self, pts, radii, sides, col, cap=True):
        """A tube through pts (Vectors), radius per point; col(i, k) or a colour."""
        rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            a = d.orthogonal().normalized(); b = d.cross(a)
            rings.append([p + (a * math.cos(t) + b * math.sin(t)) * radii[i] for t in (k / sides * math.tau for k in range(sides))])
        for i in range(len(rings) - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                c = col(i, k) if callable(col) else col
                self.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], c)
        if cap:
            c = col(len(rings) - 1, 0) if callable(col) else col
            self.face(list(reversed(rings[-1])), c)

    def box(self, centre, size, col):
        hx, hy, hz = (s / 2 for s in size)
        corners = [centre + Vector((x, y, z)) for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([corners[i] for i in q], col)

    def make(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.materials.append(MAT)
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        for li, loop in enumerate(me.loops):
            ca.data[li].color = (*self.c[loop.vertex_index], 1)
        me.validate(); me.update()
        ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
        return ob


def leaf(m, base, d, length, width, droop, col):
    """A broad sunflower leaf from base along d, bending down at the tip."""
    side = Vector((0, 0, 1)).cross(d).normalized()
    n = 4
    left, right, mid = [], [], []
    for i in range(n + 1):
        t = i / n
        w = width * math.sin(math.pi * min(1, t * 1.15)) * (1 - 0.3 * t)
        p = base + d * length * t + Vector((0, 0, -droop * t * t))
        mid.append(p); left.append(p + side * w / 2 + Vector((0, 0, w * 0.15))); right.append(p - side * w / 2 + Vector((0, 0, w * 0.15)))
    for i in range(n):
        m.face([mid[i], left[i], left[i + 1], mid[i + 1]], col)
        m.face([mid[i], mid[i + 1], right[i + 1], right[i]], col)


def sunflower():
    m = Mesh(); R = random.Random(4)
    H = 1.75
    stalk = [Vector((0.02 * math.sin(t * 3), -0.04 * t * t, H * t)) for t in (i / 6 for i in range(7))]
    # Late season: green low on the stalk, drying to straw toward the head.
    m.tube(stalk, [0.022 - 0.008 * i / 6 for i in range(7)], 6, lambda i, k: hsl(0.2 - 0.09 * i / 6, 0.4, 0.27 + 0.1 * i / 6), cap=False)
    # Neck: the stalk bends over so the heavy head nods down, facing out along -Y.
    top = stalk[-1]
    neck = [top + Vector((0, -0.13 * math.sin(a), 0.12 * (1 - math.cos(a)) * 0.4 + 0.06 * math.sin(a))) for a in (i / 3 * 1.3 for i in range(4))]
    m.tube(neck, [0.014] * 4, 5, hsl(0.13, 0.35, 0.38), cap=False)
    # Leaves, dry and drooping, the lower ones brown.
    for j in range(5):
        z = 0.3 + j * 0.28; a = j * 2.4 + R.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0.35)).normalized()
        dry = j < 2
        leaf(m, Vector((0, 0, z)), d, 0.34 + 0.06 * (j % 2), 0.26, 0.14 + (0.1 if dry else 0),
             hsl(0.09, 0.35, 0.2) if dry else hsl(0.22, 0.4, 0.25))
    # The head: a shallow dish whose face looks down and out (-Y, ~55 degrees below level).
    c = neck[-1] + Vector((0, -0.03, -0.02))
    face_dir = Vector((0, -math.cos(math.radians(55)), -math.sin(math.radians(55))))
    a = face_dir.orthogonal().normalized(); b = face_dir.cross(a)
    r, seg = 0.16, 14
    ring = lambda k, s, off: c + (a * math.cos(k / seg * math.tau) + b * math.sin(k / seg * math.tau)) * r * s + face_dir * off
    seeds, seeds2, green = hsl(0.07, 0.45, 0.1), hsl(0.07, 0.4, 0.15), hsl(0.17, 0.35, 0.25)
    centre, back = c + face_dir * 0.035, c - face_dir * 0.06
    for k in range(seg):
        k2 = (k + 1) % seg
        m.face([centre, ring(k, 0.55, 0.025), ring(k2, 0.55, 0.025)], seeds)
        m.face([ring(k, 0.55, 0.025), ring(k, 1, 0), ring(k2, 1, 0), ring(k2, 0.55, 0.025)], seeds2)
        m.face([back, ring(k2, 1, 0), ring(k, 1, 0)], green)  # the green back of the head
        # A dried petal, curling back.
        t = (k + 0.5) / seg * math.tau
        out = a * math.cos(t) + b * math.sin(t)
        p0, p1 = c + out * r * 0.95, c + out * (r + 0.07) - face_dir * 0.03
        w = out.cross(face_dir).normalized() * 0.018
        m.face([p0 - w, p0 + w, p1], hsl(0.11 + R.uniform(-0.01, 0.02), 0.6, 0.35 + R.uniform(0, 0.12)))
    return m.make("Sunflower")


def stalk():
    m = Mesh()
    m.tube([Vector((0, 0, 0)), Vector((0.01, 0, 0.18)), Vector((0.02, 0.01, 0.34))], [0.024, 0.021, 0.019], 6, hsl(0.11, 0.3, 0.42))
    leaf(m, Vector((0, 0, 0.12)), Vector((0.8, 0.2, 0.1)).normalized(), 0.2, 0.12, 0.12, hsl(0.08, 0.3, 0.22))
    return m.make("Stalk")


def pole():
    m = Mesh(); wood = hsl(0.07, 0.25, 0.22)
    m.tube([Vector((0, 0, 0)), Vector((0, 0, 4.5)), Vector((0, 0, 9))], [0.15, 0.13, 0.11], 8, wood)
    m.box(Vector((0, 0, 8.4)), (2.4, 0.12, 0.12), hsl(0.07, 0.2, 0.2))
    for x, z in ((-1.05, 8.46), (1.05, 8.46), (0, 9.0)):  # glass insulators on pins
        m.tube([Vector((x, 0, z)), Vector((x, 0, z + 0.08)), Vector((x, 0, z + 0.14))], [0.04, 0.05, 0.03], 6, hsl(0.5, 0.25, 0.55))
    for s in (-1, 1):  # braces
        m.tube([Vector((0, 0, 7.8)), Vector((s * 0.7, 0, 8.36))], [0.025, 0.025], 4, hsl(0.07, 0.15, 0.25))
    return m.make("Pole")


def snag():
    """A dead tree: a grey, barkless bole and bare limbs that fork into twigs."""
    m = Mesh(); R = random.Random(9)
    grey = lambda i, k: hsl(0.08, 0.06 + 0.04 * (k % 2), 0.42 + 0.06 * ((i + k) % 3) / 2)

    def limb(p0, d, length, r0, depth):
        n = 4
        pts, radii, dd = [p0], [r0], d.copy()
        for i in range(1, n + 1):
            dd = (dd + Vector((R.gauss(0, 0.18), R.gauss(0, 0.18), R.gauss(0.05, 0.1)))).normalized()
            pts.append(pts[-1] + dd * length / n); radii.append(r0 * (1 - 0.75 * i / n))
        m.tube(pts, radii, 6 if depth == 0 else 4, grey)
        if depth >= 3:
            return
        for _ in range(2 if depth else 4):
            k = R.randint(2, n)
            a = R.uniform(0, math.tau)
            nd = (dd * 0.6 + Vector((math.cos(a), math.sin(a), R.uniform(0.0, 0.8)))).normalized()
            limb(pts[k], nd, length * R.uniform(0.45, 0.65), radii[k] * 0.85, depth + 1)

    limb(Vector((0, 0, 0)), Vector((0.05, 0, 1)).normalized(), 8.5, 0.32, 0)
    return m.make("Snag")


def post():
    m = Mesh()
    m.tube([Vector((0, 0, 0)), Vector((0.01, 0, 1.3))], [0.07, 0.065], 6, hsl(0.08, 0.2, 0.3))
    return m.make("Post")


sunflower(); stalk(); pole(); snag(); post()
for o in list(bpy.data.objects):
    zs = [v.co.z for v in o.data.vertices]
    print(f"PROP {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris, z {min(zs):.2f}..{max(zs):.2f} m")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True)

# --- Optional preview render: the props side by side, a stand of sunflowers behind ----------------------------------
if PREVIEW:
    for n, x in (("Sunflower", 0), ("Stalk", 1), ("Post", 2), ("Pole", 5), ("Snag", 10)):
        bpy.data.objects[n].location.x = x
    rnd = random.Random(1)
    for i in range(30):
        o = bpy.data.objects["Sunflower"].copy(); scene.collection.objects.link(o)
        o.location = (-3 + (i % 10) * 0.7, 2 + (i // 10) * 0.75, 0); o.rotation_euler.z = rnd.uniform(-0.4, 0.4)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 600
    world = bpy.data.worlds.new("W"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.7, 0.78, 1)
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(200)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); cam.data.lens = 30
    scene.collection.objects.link(cam); scene.camera = cam
    cam.location = Vector((4, -9, 2.5))
    cam.rotation_euler = (Vector((4, 2, 3)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{PREVIEW}.png"
    bpy.ops.render.render(write_still=True)
