"""Builds the Oak Wood Ride oaks: a clean bole, limbs that fork into twigs, and a crown made of separate clumps of
leaf sprays (alpha-cut cards) with sky between them, so a thrush crossing in front of, or between, the trees stays
in sight. Two shapes, so the wood doesn't look cloned. Exported as GLB.

Run: blender -b -P oak.py -- <out.glb> [preview_prefix]
Units are meters, Blender Z up (glTF/three.js: Y up). Objects: OakA_Wood, OakA_Leaves, OakB_Wood, OakB_Leaves, each
with its base at the origin. Leaves carry the leaf texture (painted here, packed into the GLB) and a COLOR_0 that darkens
the inside of the crown. Tree ~14-16 m tall; the crown starts ~6 m up and reaches ~4.5 m out from the trunk.
"""
import os, sys, math, random, colorsys
import bpy
import numpy as np
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "oak.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(c):  # sRGB 0..1 -> linear, the space glTF factors and colour attributes use
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def hsl(h, s, l):
    return np.array(colorsys.hls_to_rgb(h, l, s), np.float32)


# --- Leaf texture: a spray of lobed oak leaves on a twig, on a transparent ground ------------------------------------
def leaf_image(size=512):
    R = np.random.default_rng(5)
    Y, X = np.mgrid[0:size, 0:size].astype(np.float32) / size  # Y=0 is the bottom row (Blender image origin)
    rgb = np.zeros((size, size, 3), np.float32)
    alpha = np.zeros((size, size), np.float32)

    tx = lambda y: 0.5 + 0.05 * np.sin(y * 4.0)  # the twig, up the middle of the card, bending a little
    twig = (np.abs(X - tx(Y)) < 0.006 + 0.004 * (1 - Y)) & (Y > 0.02) & (Y < 0.78)
    rgb[twig] = hsl(0.08, 0.35, 0.22); alpha[twig] = 1

    leaves = []  # (base, direction angle, length)
    for i in range(9):
        y = 0.12 + i * 0.075
        side = 1 if i % 2 else -1
        leaves.append(((tx(y), y), math.pi / 2 + side * math.radians(R.uniform(38, 68)), R.uniform(0.24, 0.34)))
    leaves.append(((tx(0.78), 0.78), math.pi / 2 + R.uniform(-0.2, 0.2), 0.22))  # the terminal leaf
    for (bx, by), a, L in leaves:
        dx, dy = math.cos(a), math.sin(a)
        u = ((X - bx) * dx + (Y - by) * dy) / L
        v = (-(X - bx) * dy + (Y - by) * dx) / L
        uc = np.clip(u, 0, 1)
        # Obovate outline with four or five rounded lobes a side, on a short stalk.
        w = 0.34 * np.sin(np.pi * uc ** 0.75) ** 0.85 * (0.62 + 0.38 * np.abs(np.cos(np.pi * 4.5 * uc)))
        w = np.where(u < 0.07, 0.02, w)
        inside = (u > 0) & (u < 1) & (np.abs(v) < w)
        base = hsl(R.uniform(0.2, 0.28), R.uniform(0.4, 0.6), R.uniform(0.36, 0.5))
        fold = 1 if R.random() < 0.5 else -1  # one half of the leaf catches the light
        shade = 0.82 + 0.3 * fold * np.clip(v / np.maximum(w, 1e-3), -1, 1)[..., None]
        col = np.clip(base * shade, 0, 1)
        rib = inside & (np.abs(v) < 0.012) & (u > 0.05)
        col[rib] = np.clip(base * 1.35 + 0.05, 0, 1)
        rgb[inside] = col[inside]; alpha[inside] = 1
    rgb[alpha == 0] = rgb[alpha > 0].mean(axis=0)  # so mipmaps don't fringe the cut edge dark
    img = bpy.data.images.new("OakLeaves", size, size, alpha=True)
    img.pixels.foreach_set(np.dstack([rgb, alpha]).ravel())
    img.pack()
    return img


# --- Materials ------------------------------------------------------------------------------------------------------
def bark():
    m = bpy.data.materials.new("Bark")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb((0.30, 0.26, 0.21)), 1)
    b.inputs["Roughness"].default_value = 0.95
    m.diffuse_color = (*srgb((0.30, 0.26, 0.21)), 1)
    return m


def leaf_material(img):
    m = bpy.data.materials.new("Leaves")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1
    nt.links.new(t.outputs["Color"], mix.inputs["A"]); nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.8
    return m


# --- Wood: tapered tubes along bent paths ---------------------------------------------------------------------------
class Wood:
    def __init__(self):
        self.verts, self.faces = [], []

    def tube(self, pts, radii, sides):
        start, ref = len(self.verts), Vector((1, 0, 0))
        for i, (p, r) in enumerate(zip(pts, radii)):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            n = ref - t * ref.dot(t)
            if n.length < 1e-4:
                n = Vector((0, 1, 0)) - t * t.y
            n.normalize(); ref = n  # carry the frame along, so rings don't twist
            bn = t.cross(n)
            for k in range(sides):
                a = k / sides * math.tau
                self.verts.append(p + (n * math.cos(a) + bn * math.sin(a)) * r)
        for i in range(len(pts) - 1):
            for k in range(sides):
                a, b = start + i * sides + k, start + i * sides + (k + 1) % sides
                self.faces.append((a, b, b + sides, a + sides))


def path(rng, p0, d, length, n, lift):
    """A crooked path: n segments, each turned a little at random and bent toward the light (lift)."""
    pts, p, d = [p0.copy()], p0.copy(), d.normalized()
    for _ in range(n):
        d = (d + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), lift))).normalized()
        p = p + d * (length / n)
        pts.append(p.copy())
    return pts


def build_oak(name, seed, limbs):
    rng = random.Random(seed)
    wood, clusters = Wood(), []  # clusters: (centre, radius) of each clump of leaves

    # The bole, flared at the root, leaning a touch, 5-6 m to where it forks.
    fork = rng.uniform(5.0, 6.0)
    bole = path(rng, Vector((0, 0, 0)), Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 1)), fork, 5, 0.6)
    wood.tube([Vector((0, 0, -0.3))] + bole, [0.62, 0.6, 0.42, 0.38, 0.35, 0.32, 0.3], 8)

    def branch(p0, d, length, r0, depth):
        pts = path(rng, p0, d, length, 2 if depth else 4, 0.35 if depth else 0.25)
        wood.tube(pts, [r0 * (1 - 0.65 * i / (len(pts) - 1)) for i in range(len(pts))], 5 if depth == 0 else 3)
        if depth == 1:
            clusters.append((pts[-1], rng.uniform(1.0, 1.4)))
            clusters.append((pts[1], rng.uniform(0.8, 1.1)))
            return
        out = Vector((d.x, d.y, 0))
        out = out.normalized() if out.length > 1e-3 else Vector((1, 0, 0))
        for j in range(rng.randint(2, 3)):  # twigs off the outer part of the limb
            f = rng.uniform(0.45, 0.9) * (len(pts) - 1)
            k = int(f)
            q = pts[k].lerp(pts[k + 1], f - k)
            side = out.cross(Vector((0, 0, 1))) * (1 if j % 2 else -1)
            branch(q, out * 0.6 + side * 0.8 + Vector((0, 0, rng.uniform(0.3, 0.8))), rng.uniform(1.6, 2.6), r0 * 0.45, 1)
        clusters.append((pts[-1], rng.uniform(1.1, 1.5)))

    top = bole[-1]
    for i in range(limbs):  # main limbs, spread round the trunk, rising steeply as in a wood
        az = i / limbs * math.tau + rng.uniform(-0.35, 0.35)
        el = math.radians(rng.uniform(40, 62))
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        branch(bole[-2].lerp(top, rng.uniform(0.2, 1.0)), d, rng.uniform(4.2, 5.6), 0.2, 0)
    # The leader, carrying the top of the crown.
    branch(top, Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1)), rng.uniform(5.5, 7.0), 0.2, 0)

    me = bpy.data.meshes.new(f"{name}_Wood")
    me.from_pydata([tuple(v) for v in wood.verts], [], wood.faces)
    me.materials.append(BARK)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(f"{name}_Wood", me); scene.collection.objects.link(ob)

    # Leaf cards: about ten per clump, each card a whole spray. Clumps stay apart, so the crown has holes.
    centre = sum((c for c, _ in clusters), Vector()) / len(clusters)
    zmin, zmax = min(c.z for c, _ in clusters), max(c.z for c, _ in clusters)
    reach = max(Vector((c.x - centre.x, c.y - centre.y, 0)).length for c, _ in clusters) or 1
    verts, faces, uvs, cols = [], [], [], []
    for c, r in clusters:
        for _ in range(rng.randint(8, 11)):
            off = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.7))).normalized() * r * rng.random() ** 0.5
            p, s = c + off, rng.uniform(1.1, 1.5)
            rot = Euler((rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), rng.uniform(0, math.tau))).to_matrix()
            x, z = rot @ Vector((s / 2, 0, 0)), rot @ Vector((0, 0, s))
            b = p - z * 0.35  # the twig's foot sits a little inside the clump
            i0 = len(verts)
            verts += [b - x, b + x, b + x + z, b - x + z]
            faces.append((i0, i0 + 1, i0 + 2, i0 + 3))
            uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
            # Light on the outside and top of the crown, shade within (kept gentle: the game tints and lights it too).
            out = min(1, Vector((p.x - centre.x, p.y - centre.y, 0)).length / reach)
            up = (p.z - zmin) / max(zmax - zmin, 1e-3)
            k = min(1.0, 0.68 + 0.2 * out + 0.15 * up)
            cols += [(k, k, k)] * 4
    lm = bpy.data.meshes.new(f"{name}_Leaves")
    lm.from_pydata([tuple(v) for v in verts], [], faces)
    lm.materials.append(LEAVES)
    # Card normals point out of the crown (from a centre a little below its middle), so the crown lights as one
    # rounded mass instead of a scatter of flat cards facing every way.
    mid = Vector((centre.x, centre.y, (zmin + zmax) / 2 - 1.0))
    lm.normals_split_custom_set_from_vertices([(Vector(v) - mid).normalized() for v in verts])
    uv = lm.uv_layers.new(name="UVMap")
    for li, loop in enumerate(lm.loops):
        uv.data[li].uv = uvs[loop.vertex_index]
    ca = lm.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for vi, c in enumerate(cols):
        ca.data[vi].color = (*c, 1)
    lo = bpy.data.objects.new(f"{name}_Leaves", lm); scene.collection.objects.link(lo)
    return ob, lo


BARK = bark()
LEAVES = leaf_material(leaf_image())
build_oak("OakA", 7, 5)
oak_b = build_oak("OakB", 23, 4)

for o in bpy.data.objects:
    if o.type == "MESH":
        zs = [v.co.z for v in o.data.vertices]
        print(f"OAK {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris, z {min(zs):.1f}..{max(zs):.1f} m")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True)

# --- Optional preview render (B shifted beside A) -------------------------------------------------------------------
if PREVIEW:
    for o in oak_b:
        o.location.x = 11
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 700
    world = bpy.data.worlds.new("W"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.7, 0.78, 1)
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); cam.data.lens = 35
    scene.collection.objects.link(cam); scene.camera = cam
    cam.location = Vector((5.5, -30, 4))
    cam.rotation_euler = (Vector((5.5, 0, 8)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{PREVIEW}.png"
    bpy.ops.render.render(write_still=True)
