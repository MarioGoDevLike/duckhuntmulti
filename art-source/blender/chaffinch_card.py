"""Renders the chaffinch's menu card from "Pinson des arbres" by pattarrian (Sketchfab, CC-BY-4.0): a colour scan of a
chaffinch statuette on a branch. The scan (~1.6M faces, 64 MB) is too heavy to ship, so only this picture goes in
the game.

Run: blender -b -P chaffinch_card.py -- <out.png>
Reads ../models/pinson_des_arbres.glb. Scan space: millimetres, Z up, the bird faces +X, its base on z = 0.
Transparent background, 2x the card's 360x220 so it stays sharp on high-DPI screens.
"""
import os, sys, math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "chaffinch_card.png"
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "pinson_des_arbres.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)

# The scan's colours come through a vertex-colour attribute; keep them, but take the plastic shine off the resin.
for m in bpy.data.materials:
    if m.node_tree:
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            b.inputs["Roughness"].default_value = 0.7
            b.inputs["Specular IOR Level"].default_value = 0.3

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 720, 440
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"

world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.5, 0.42, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
scene.world = world


def light(name, kind, energy, rot, color):
    o = bpy.data.objects.new(name, bpy.data.lights.new(name, kind))
    o.data.energy, o.data.color = energy, color
    o.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(o)


light("Key", "SUN", 3.2, (50, 0, 150), (1.0, 0.9, 0.78))   # warm, high and in front of the bird
light("Rim", "SUN", 2.5, (70, 0, -40), (0.75, 0.83, 1.0))  # cool, from behind, to pick out the back and tail
light("Fill", "SUN", 0.8, (100, 0, 60), (1.0, 0.95, 0.9))

# Three-quarter view from the bird's left front, the head toward the card's left like the other cards. Framed on the
# bird and the top of the branch; the round base falls below the card.
target = Vector((72, 78, 88))
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens, cam.data.clip_end = 85, 5000
scene.collection.objects.link(cam)
scene.camera = cam
a, dist = math.radians(30), 600
cam.location = target + Vector((math.sin(a) * dist, math.cos(a) * dist, 120))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
