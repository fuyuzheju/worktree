# -*- mode: python ; coding: utf-8 -*-

ICON_PATH = 'assets/worktree-icon.png'

a = Analysis(
    ['worktree.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=['hooks/'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='worktree',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[ICON_PATH],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='worktree',
)
app = BUNDLE(
    coll,
    name='worktree.app',
    icon='assets/worktree-icon.png',
    bundle_identifier=None,
)
