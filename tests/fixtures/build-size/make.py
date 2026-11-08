#!/usr/bin/env python3
"""Generates the small synthetic builds used by tests/build-size.cjs.

Two Unity-like APKs (1.4.0 → 1.5.0), an AAB with an asset pack and an IPA. Sizes are tiny but the layout,
manifests (binary AXML, aapt2 protobuf, binary Info.plist) and ELF symbol sections are real.
Run: python3 tests/fixtures/build-size/make.py
"""
import os, plistlib, random, struct, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
KB = 1024


def noise(seed, n):
    return random.Random(seed).randbytes(n)


def text(n, word=b'void Update() { transform.Rotate(0, 1, 0); }\n'):
    return (word * (n // len(word) + 1))[:n]


def axml(package, code, name):
    strings = ['manifest', 'package', 'versionCode', 'versionName', package, name]
    data, offsets = b'', []
    for s in strings:
        offsets.append(len(data))
        data += struct.pack('<H', len(s)) + s.encode('utf-16le') + b'\0\0'
    data += b'\0' * (-len(data) % 4)
    header = 28
    pool = struct.pack('<HHIIIIII', 0x0001, header, header + 4 * len(strings) + len(data), len(strings), 0, 0,
                       header + 4 * len(strings), 0) + b''.join(struct.pack('<I', o) for o in offsets) + data
    attrs = [(1, 4, 0x03, 4), (2, 0xffffffff, 0x10, code), (3, 5, 0x03, 5)]
    body = struct.pack('<IIHHHHHH', 0xffffffff, 0, 20, 20, len(attrs), 0, 0, 0)
    for name_i, raw, kind, value in attrs:
        body += struct.pack('<IIIHBBI', 0xffffffff, name_i, raw, 8, 0, kind, value)
    element = struct.pack('<HHIII', 0x0102, 16, 16 + len(body), 1, 0xffffffff) + body
    payload = pool + element
    return struct.pack('<HHI', 0x0003, 8, 8 + len(payload)) + payload


def varint(n):
    out = b''
    while True:
        b = n & 0x7f
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def field(no, payload):
    payload = payload.encode() if isinstance(payload, str) else payload
    return varint(no * 8 + 2) + varint(len(payload)) + payload


def proto_manifest(package, code, name):
    attrs = b''.join(field(4, field(1, 'http://schemas.android.com/apk/res/android') + field(2, k) + field(3, v))
                     for k, v in [('versionCode', str(code)), ('versionName', name)])
    attrs += field(4, field(2, 'package') + field(3, package))
    return field(1, field(3, 'manifest') + attrs)


def elf(size, symbols):
    """ELF64 shared object with .text and, when `symbols`, .symtab/.debug_info sections."""
    names = b'\0.text\0.shstrtab\0' + (b'.symtab\0.debug_info\0' if symbols else b'')
    code = noise(size, size)
    debug = noise(size + 1, size // 3) if symbols else b''
    text_off = 64
    names_off = text_off + len(code)
    debug_off = names_off + len(names)
    shoff = debug_off + len(debug)
    sections = [(0, 0, 0, 0), (1, 1, text_off, len(code)), (7, 3, names_off, len(names))]
    if symbols:
        sections += [(17, 2, debug_off, len(debug) // 2), (25, 1, debug_off + len(debug) // 2, len(debug) - len(debug) // 2)]
    head = b'\x7fELF' + bytes([2, 1, 1]) + b'\0' * 9
    head += struct.pack('<HHIQQQIHHHHHH', 3, 183, 1, 0, 0, shoff, 0, 64, 0, 0, 64, len(sections), 2)
    table = b''.join(struct.pack('<IIQQQQIIQQ', n, t, 0, 0, off, sz, 0, 0, 1, 0) for n, t, off, sz in sections)
    return head + code + names + debug + table


def write(name, files, stored=()):
    path = os.path.join(HERE, name)
    with zipfile.ZipFile(path, 'w') as z:
        for entry, data in files:
            info = zipfile.ZipInfo(entry, date_time=(2026, 11, 1, 12, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if entry in stored else zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    print(name, os.path.getsize(path))


def apk(name, version, code, grow):
    libs = {'lib/arm64-v8a/libil2cpp.so': elf((60 + grow) * KB, symbols=grow > 0),
            'lib/arm64-v8a/libunity.so': elf(40 * KB, False),
            'lib/armeabi-v7a/libil2cpp.so': elf(45 * KB, False),
            'lib/armeabi-v7a/libunity.so': elf(30 * KB, False)}
    if grow:
        libs['lib/x86_64/libil2cpp.so'] = elf(50 * KB, False)
    icon = noise(7, 6 * KB)
    files = [('AndroidManifest.xml', axml('com.petya.towers', code, version)),
             ('classes.dex', text(90 * KB) + noise(1, 20 * KB)),
             ('classes2.dex', text(30 * KB) + noise(2, (10 + grow // 4) * KB)),
             *libs.items(),
             ('assets/bin/Data/data.unity3d', noise(3, (120 + 2 * grow) * KB)),
             ('assets/bin/Data/Managed/Metadata/global-metadata.dat', noise(4, 25 * KB)),
             ('assets/bin/Data/sharedassets0.resource', noise(5, 35 * KB)),
             ('assets/aa/Android/catalog.json', text(8 * KB, b'{"m_InternalIds":["Levels","UI"]}\n')),
             ('assets/aa/Android/levels_assets_all.bundle', noise(6, (50 + grow) * KB)),
             ('assets/aa/Android/ui_assets_all.bundle', noise(8, 30 * KB)),
             ('assets/Video/intro.mp4', noise(9, (5 + grow) * KB)),
             ('resources.arsc', text(12 * KB, b'\x02\x00\x0c\x00string\x00')),
             ('res/mipmap-xxxhdpi-v4/app_icon.png', icon),
             ('META-INF/CERT.SF', text(2 * KB, b'SHA-256-Digest: abc=\n')),
             ('META-INF/CERT.RSA', noise(10, 1 * KB))]
    if grow:
        files += [('assets/aa/Android/season2_assets_all.bundle', noise(11, 70 * KB)),
                  ('res/drawable-xxhdpi-v4/splash_icon.png', icon)]
    stored = {n for n in libs if n.startswith('lib/arm64')}
    write(name, files, stored)


apk('towers-1.4.0.apk', '1.4.0', 140, 0)
apk('towers-1.5.0.apk', '1.5.0', 150, 40)

write('towers-1.5.0.aab', [
    ('base/manifest/AndroidManifest.xml', proto_manifest('com.petya.towers', 150, '1.5.0')),
    ('base/dex/classes.dex', text(90 * KB) + noise(1, 20 * KB)),
    ('base/lib/arm64-v8a/libil2cpp.so', elf(60 * KB, False)),
    ('base/lib/armeabi-v7a/libil2cpp.so', elf(45 * KB, False)),
    ('base/assets/bin/Data/data.unity3d', noise(3, 160 * KB)),
    ('base/res/mipmap-xxxhdpi-v4/app_icon.png', noise(7, 6 * KB)),
    ('base/resources.pb', text(10 * KB, b'\x0a\x04res\x12')),
    ('UnityDataAssetPack/manifest/AndroidManifest.xml', proto_manifest('com.petya.towers', 150, '1.5.0')),
    ('UnityDataAssetPack/assets/bin/Data/sharedassets1.resource', noise(12, 90 * KB)),
    ('BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libil2cpp.so.sym', noise(13, 30 * KB)),
    ('BundleConfig.pb', b'\x0a\x05\x0a\x031.8'),
])

info = plistlib.dumps({'CFBundleIdentifier': 'com.petya.towers', 'CFBundleShortVersionString': '1.5.0', 'CFBundleVersion': '150',
                       'CFBundleName': 'Towers', 'CFBundleExecutable': 'Towers'}, fmt=plistlib.FMT_BINARY)
write('towers-1.5.0.ipa', [
    ('Payload/Towers.app/Info.plist', info),
    ('Payload/Towers.app/Towers', noise(20, 25 * KB)),
    ('Payload/Towers.app/Frameworks/UnityFramework.framework/UnityFramework', noise(21, 140 * KB)),
    ('Payload/Towers.app/Frameworks/UnityFramework.framework/Info.plist', plistlib.dumps({'CFBundleVersion': '1'})),
    ('Payload/Towers.app/Data/data.unity3d', noise(22, 150 * KB)),
    ('Payload/Towers.app/Data/Raw/aa/iOS/levels_assets_all.bundle', noise(23, 60 * KB)),
    ('Payload/Towers.app/Data/Raw/intro.mp4', noise(24, 20 * KB)),
    ('Payload/Towers.app/Assets.car', noise(25, 18 * KB)),
    ('Payload/Towers.app/ru.lproj/InfoPlist.strings', '"CFBundleDisplayName" = "Башни";'.encode('utf-16')),
    ('Payload/Towers.app/_CodeSignature/CodeResources', text(3 * KB, b'<key>files</key>\n')),
    ('Payload/Towers.app.dSYM/Contents/Resources/DWARF/Towers', noise(26, 30 * KB)),
])
