"""Inspect a local Action, preview an edit and save a separate candidate."""
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def curves(action, slot):
    if getattr(action, 'is_action_layered', False):
        for layer in action.layers:
            for strip in layer.strips:
                bag = strip.channelbag(slot) if slot and strip.type == 'KEYFRAME' else None
                if bag:
                    yield from bag.fcurves
    else:
        yield from action.fcurves


def supported(fc):
    return (not fc.mute and not fc.lock and not any(m.type != 'CYCLES' for m in fc.modifiers)
            and re.fullmatch(r'(?:pose\.bones\[".*"\]\.)?(?:location|scale|rotation_euler)', fc.data_path))


def cleanup(fc, tolerance):
    keys = fc.keyframe_points
    if not supported(fc) or len(keys) < 3:
        return 0
    # Between linear keys the maximum error occurs at an original knot.
    # Flat Bezier curves are also constant when both handles share the key value.
    flat = all(k.co.y == keys[0].co.y and k.interpolation in {'LINEAR', 'CONSTANT', 'BEZIER'}
               and k.handle_left.y == k.co.y == k.handle_right.y for k in keys)
    straight = all(k.interpolation == 'LINEAR' for k in keys)
    if not (flat or straight):
        return 0
    points = [tuple(k.co) for k in keys]
    keep = {0, len(points)-1}
    spans = [(0, len(points)-1)] if not flat else []
    while spans:
        a, b = spans.pop()
        if b <= a+1:
            continue
        x, y = points[a]
        dx = points[b][0] - x
        if dx <= 0:
            return 0
        slope = (points[b][1]-y)/dx
        def deviation(i):
            t, v = points[i]
            return abs(v-y-(t-x)*slope)
        index = max(range(a+1,b), key=deviation)
        error = deviation(index)
        if error > tolerance:
            keep.add(index)
            spans.extend(((a,index),(index,b)))
    for i in reversed(range(1,len(points)-1)):
        if i not in keep:
            keys.remove(keys[i], fast=True)
    fc.update()
    return len(points)-len(keep)


def spike(fc, cyclic, tolerance):
    if not supported(fc):
        return None
    keys = fc.keyframe_points
    candidates = []
    for i in range(2, len(keys)-2):
        p,a,b,c,q = [k.co.copy() for k in keys[i-2:i+3]]
        if b.x-a.x > 2 or c.x-b.x > 2 or (b.y-a.y)*(c.y-b.y) >= 0:
            continue
        target = a.y+(c.y-a.y)*(b.x-a.x)/(c.x-a.x)
        baseline = max(tolerance, abs(a.y-p.y)/max(a.x-p.x,0.001),
                       abs(q.y-c.y)/max(q.x-c.x,0.001), abs(a.y-c.y)/(c.x-a.x), 1e-5)
        score = abs(target-b.y)/baseline
        if score > 4:
            candidates.append((score,i,target))
    if cyclic and len(keys) >= 4:
        first, second = keys[0].co, keys[1].co
        prev, last = keys[-2].co, keys[-1].co
        gap = abs(last.y-first.y)
        if gap > 4 * max(abs(second.y-first.y), abs(prev.y-first.y), tolerance, 1e-5):
            candidates.append((gap/max(tolerance,1e-5), len(keys)-1, first.y))
    return max(candidates, default=None)


def poses(obj, frames, bone):
    scene = bpy.context.scene
    result = []
    for t in frames:
        scene.frame_set(math.floor(t), subframe=t-math.floor(t))
        matrix = obj.matrix_world
        if obj.type == 'ARMATURE' and obj.pose.bones:
            bones = [obj.pose.bones[bone]] if bone in obj.pose.bones else list(obj.pose.bones)
            segments = [(matrix @ b.head, matrix @ b.tail) for b in bones]
        else:
            box = [matrix @ Vector(p) for p in obj.bound_box]
            segments = [(box[a],box[b]) for a,b in ((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))]
        result.append([[(p.x-.6*p.y, p.z+.35*p.y+.2*p.x) for p in pair] for pair in segments])
    return result


def preview(before, after, duration):
    points = [p for clip in (before,after) for pose in clip for line in pose for p in line]
    x0,y0 = map(min,zip(*points))
    x1,y1 = map(max,zip(*points))
    scale = min(180/max(x1-x0,0.001),142/max(y1-y0,0.001))
    body = []
    for i,clip in enumerate((before,after)):
        values = []
        for pose in clip:
            lines = []
            for a,b in pose:
                coords = [(105+210*i+(x-(x0+x1)/2)*scale, 78-(y-(y0+y1)/2)*scale) for x,y in (a,b)]
                lines.append('M%.1f %.1fL%.1f %.1f' % (*coords[0],*coords[1]))
            values.append(''.join(lines))
        body.append('<path d="%s"><animate attributeName="d" values="%s" dur="%.3fs" repeatCount="indefinite"/></path>' %
                    (values[0],';'.join(values+[values[0]]),duration))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 180"><rect width="420" height="180" fill="#223044"/>'
            '<g fill="none" stroke="#a8ddff" stroke-width="2">'+''.join(body)+'</g>'
            '<g fill="white" font-family="sans-serif" text-anchor="middle"><text x="105" y="173">До</text><text x="315" y="173">После</text></g></svg>')


def run(filename, directory, mode, name, tolerance):
    bpy.ops.wm.open_mainfile(filepath=filename, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    objects = {o.name:o for o in scene.objects if o.animation_data and o.animation_data.action
               and not o.library and not o.animation_data.action.library}
    if not objects:
        raise ValueError('В сцене нет объектов с активным локальным клипом Action.')
    if not name and len(objects) > 1:
        return {'clips':[{'object':o.name,'action':o.animation_data.action.name} for o in objects.values()]}
    obj = objects[name] if name else next(iter(objects.values()))
    anim = obj.animation_data
    original = anim.action
    slot = getattr(anim,'action_slot',None)
    slot_id = slot.identifier if slot else None
    action = original.copy()
    anim.action = action
    if slot_id:
        anim.action_slot = next(s for s in action.slots if s.identifier == slot_id)
    channels = list(curves(action, getattr(anim,'action_slot',None)))
    start,end = action.frame_range
    report = {'object':obj.name, 'action':original.name, 'before':sum(len(c.keyframe_points) for c in channels)}
    candidate = None
    bone = ''
    if mode == 'repair':
        for fc in channels:
            hit = spike(fc, action.use_cyclic or any(m.type == 'CYCLES' and m.mode_after == 'REPEAT' for m in fc.modifiers), tolerance)
            if hit and (not candidate or hit[0] > candidate[0]):
                candidate = (*hit,fc)
        if not candidate:
            return {**report,'changed':False,'message':'Однозначного короткого скачка на проверенных каналах не найдено.'}
        _,index,target,fc = candidate
        frame = fc.keyframe_points[index].co.x
        match = re.search(r'pose\.bones\["(.*)"\]', fc.data_path)
        bone = match[1] if match else ''
        report.update(frame=frame, channel=fc.data_path, axis='XYZ'[fc.array_index], value=fc.keyframe_points[index].co.y, proposed=target)
        start,end = max(start,frame-4), min(end,frame+4)
    fps = scene.render.fps / scene.render.fps_base
    frames = [start+(end-start)*i/23 for i in range(24)]
    saved_frame, subframe = scene.frame_current, scene.frame_subframe
    if candidate and index == len(fc.keyframe_points)-1 and action.frame_range[1] == frame:
        first = action.frame_range[0]
        frames = [frame-3+3*i/11 for i in range(12)] + [first+3*i/11 for i in range(12)]
    before = poses(obj, frames, bone)
    if candidate:
        k = fc.keyframe_points[index]
        delta = target-k.co.y
        k.co.y = target
        k.handle_left.y += delta
        k.handle_right.y += delta
        fc.update()
    else:
        removed = sum(cleanup(c,tolerance) for c in channels)
        if not removed:
            return {**report,'changed':False,'message':'Избыточных ключей в поддерживаемых кривых не найдено.'}
    after = poses(obj, frames, bone)
    scene.frame_set(saved_frame, subframe=subframe)
    report.update(changed=True, after=sum(len(c.keyframe_points) for c in channels),
                  preview=preview(before,after,max(.5,(end-start+1)/fps)))
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/'candidate.blend'), copy=True, relative_remap=False)
    return report


filename, folder, mode, name, tol = sys.argv[sys.argv.index('--')+1:]
directory = Path(folder)
try:
    result = run(filename, directory, mode, name, float(tol))
except (ValueError, KeyError) as error:
    result = {'error':str(error)}
(directory/'result.json').write_text(json.dumps(result),encoding='utf8')
