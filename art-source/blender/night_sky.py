# Renders the night sky for the Projector Field (src/assets/images/night_sky.webp): an equirectangular panorama of a
# clear night — deep navy at the zenith, paler at the horizon, a faint orange glow of village lights low on one side,
# the Milky Way across it and layers of stars. World shader only, rendered by a panoramic camera.
# Run: blender -b -P night_sky.py -- <out.png>   then save its top half (the sky) as src/assets/images/night_sky.webp.
import bpy, sys, math

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '//night_sky.png'
scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = False
scene.render.resolution_x, scene.render.resolution_y = 4096, 2048
scene.view_settings.view_transform = 'Standard'; scene.view_settings.exposure = 0
cam = bpy.data.cameras.new('Pano'); cam.type = 'PANO'
try: cam.panorama_type = 'EQUIRECTANGULAR'
except AttributeError: cam.cycles.panorama_type = 'EQUIRECTANGULAR'
co = bpy.data.objects.new('Pano', cam); scene.collection.objects.link(co); scene.camera = co
co.rotation_euler = (math.pi / 2, 0, 0)  # level: the horizon runs across the middle of the image

w = bpy.data.worlds.new('NightSky'); scene.world = w; w.use_nodes = True
N, L = w.node_tree.nodes, w.node_tree.links
N.clear()
def node(t, **kw):
    n = N.new(t)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def mrange(src, a, b, c, d):
    m = node('ShaderNodeMapRange', clamp=True); m.inputs[1].default_value, m.inputs[2].default_value = a, b
    m.inputs[3].default_value, m.inputs[4].default_value = c, d; L.new(src, m.inputs[0]); return m.outputs[0]
def math_(op, a, b=None):
    m = node('ShaderNodeMath', operation=op)
    for i, x in enumerate([a, b]):
        if x is None: continue
        if isinstance(x, float): m.inputs[i].default_value = x
        else: L.new(x, m.inputs[i])
    return m.outputs[0]

tc = node('ShaderNodeTexCoord'); dirv = tc.outputs['Generated']  # world: the view direction
sep = node('ShaderNodeSeparateXYZ'); L.new(dirv, sep.inputs[0]); z = sep.outputs['Z']

# Base: deep navy overhead, paler and greyer toward the horizon.
grad = node('ShaderNodeValToRGB'); L.new(mrange(z, 0.0, 0.6, 0.0, 1.0), grad.inputs[0])
grad.color_ramp.elements[0].color = (0.020, 0.026, 0.045, 1); grad.color_ramp.elements[1].color = (0.002, 0.003, 0.010, 1)

# Village glow: warm, low on the horizon, toward +Y.
vg = math_('MULTIPLY', mrange(z, 0.0, 0.18, 1.0, 0.0), mrange(sep.outputs['Y'], 0.3, 1.0, 0.0, 1.0))
glow = node('ShaderNodeMixRGB', blend_type='ADD'); L.new(vg, glow.inputs[0]); L.new(grad.outputs[0], glow.inputs[1])
glow.inputs[2].default_value = (0.05, 0.022, 0.006, 1)

# Milky Way: a soft, mottled band about a tilted great circle, with a dark rift down its middle.
dot = node('ShaderNodeVectorMath', operation='DOT_PRODUCT'); L.new(dirv, dot.inputs[0]); dot.inputs[1].default_value = (0.35, 0.55, 0.76)
off = math_('ABSOLUTE', dot.outputs['Value'])
band = mrange(off, 0.0, 0.26, 1.0, 0.0)
cloud = node('ShaderNodeTexNoise'); cloud.inputs['Scale'].default_value = 3.5; cloud.inputs['Detail'].default_value = 10; cloud.inputs['Roughness'].default_value = 0.65
L.new(dirv, cloud.inputs['Vector'])
rift = mrange(off, 0.0, 0.05, 0.35, 1.0)
mw = math_('MULTIPLY', math_('MULTIPLY', math_('POWER', band, 1.6), mrange(cloud.outputs['Fac'], 0.35, 0.75, 0.0, 1.0)), rift)
mwc = node('ShaderNodeMixRGB', blend_type='ADD'); L.new(mw, mwc.inputs[0]); L.new(glow.outputs[0], mwc.inputs[1]); mwc.inputs[2].default_value = (0.06, 0.062, 0.075, 1)

# Stars: Voronoi layers — rare bright ones, many faint ones, and more inside the band — each with its own brightness.
def stars(scale, size, keep, gain):
    v = node('ShaderNodeTexVoronoi', feature='F1'); v.inputs['Scale'].default_value = scale; L.new(dirv, v.inputs['Vector'])
    core = mrange(v.outputs['Distance'], 0.0, size, 1.0, 0.0)
    pick = mrange(v.outputs['Color'], keep, 1.0, 0.0, 1.0)  # only the cells whose random value is high get a star
    return math_('MULTIPLY', math_('MULTIPLY', core, pick), gain)
s = math_('ADD', stars(260.0, 0.28, 0.94, 0.9), stars(700.0, 0.3, 0.92, 0.35))  # few, and faint: a real sky from a field
s = math_('ADD', s, math_('MULTIPLY', stars(1300.0, 0.32, 0.88, 0.25), band))
tint = node('ShaderNodeTexNoise'); tint.inputs['Scale'].default_value = 900; L.new(dirv, tint.inputs['Vector'])
starcol = node('ShaderNodeMixRGB'); L.new(tint.outputs['Fac'], starcol.inputs[0]); starcol.inputs[1].default_value = (1.0, 0.85, 0.7, 1); starcol.inputs[2].default_value = (0.75, 0.85, 1.0, 1)
lit = node('ShaderNodeMixRGB', blend_type='ADD'); L.new(s, lit.inputs[0]); L.new(mwc.outputs[0], lit.inputs[1]); L.new(starcol.outputs[0], lit.inputs[2])

# Nothing below the horizon (the ground hides it): fade to black.
below = node('ShaderNodeMixRGB'); L.new(mrange(z, -0.06, 0.0, 1.0, 0.0), below.inputs[0]); L.new(lit.outputs[0], below.inputs[1]); below.inputs[2].default_value = (0, 0, 0, 1)
bg = node('ShaderNodeBackground'); L.new(below.outputs[0], bg.inputs['Color'])
wo = node('ShaderNodeOutputWorld'); L.new(bg.outputs[0], wo.inputs['Surface'])

scene.render.filepath = out; scene.render.image_settings.file_format = 'PNG'
bpy.ops.render.render(write_still=True)
print('wrote', out)
