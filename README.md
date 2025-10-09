# Wrap Cube Rotation to Bone (CN/EN)

A Blockbench plugin that wraps cubes with illegal rotations into bones, zeroes cube rotations, and provides fast unwrapping tools that preserve appearance. Ships with **Chinese** and **English** builds:

- `wrap_cube_rotation_to_bone_cn.js` – UI in Chinese (骨骼/组名仍为英文)
- `wrap_cube_rotation_to_bone.js` – UI in English

## Features

1. **Fix Illegal Rotations (Wrap to Bone)**
   - Detect rotations not in `{0, ±22.5, ±45, ±67.5, ±90, ±135, ±180}`.
   - Create a bone per cube, copy cube rotation & origin to the bone, set cube rotation to `0,0,0`.

2. **Force Wrap + Zero Cube Rotation (1 bone per cube)**
   - Ignore angle rules. Wrap every selected (or all) cubes and zero their rotation.

3. **Add Zero-Rotation Group (Keep Cube Rotation)**
   - Add a group with `rotation=0,0,0` at the cube’s origin. Cube rotation is kept.

4. **Unwrap Bones (name contains `_bone`)**
   - Unwrap only groups whose name contains `_bone`.

5. **Force Unwrap Any Group (Preserve Appearance, Name Ignored, Recursive)**
   - Unwrap selected groups **and all their descendants** (or all groups if none selected), regardless of name.

### Appearance Preservation (Unwrap)
- New cube **rotation** = cube rotation ⊕ group rotation (per-axis Euler add, normalized to [−180, 180]).
- New cube **origin** = cube origin rotated around **group origin** by the group’s ZYX Euler rotation.
- Cubes are reinserted at the parent level; emptied groups are removed.

> Note: Euler addition is intentionally simple and stable for typical Blockbench use. For exotic rig hierarchies with gimbal-sensitive compositions, verify results on a copy.

## Installation

1. Download the desired file(s): `wrap_cube_rotation_to_bone_cn.js` or `wrap_cube_rotation_to_bone.js`.
2. In Blockbench: **File → Plugins → Load Plugin from File…** and select the file.
3. The actions appear under the **Filter** menu.

## Usage

- **No selection:** actions operate on the entire project (cubes or groups as applicable).
- **With selection:** actions operate only on the selected cubes/groups.
- **Force Unwrap Any Group:** selecting a **parent group** automatically includes all its sub-groups (recursive).

## Menu Actions (CN)

- 修复非法旋转（包裹为骨骼）
- 强制包裹并清零旋转（每块一骨骼）
- 添加零旋转组（块旋转不变）
- 拆分骨骼（名称含 _bone）
- 强制拆分任意骨骼/组（保持外观）

## Menu Actions (EN)

- Fix Illegal Rotations (Wrap to Bone)
- Force Wrap + Zero Cube Rotation (1 bone per cube)
- Add Zero-Rotation Group (Keep Cube Rotation)
- Unwrap Bones (name contains _bone)
- Force Unwrap Any Group (Preserve Appearance)

## Shortcuts & Undo

- All actions are **Undo-friendly** (Ctrl+Z).
- Assign custom shortcuts via **File → Keybindings** if needed.

## Notes

- Bone/group names are always **English** (`*_bone`, `*_grp`).
- Non-cube children inside groups are skipped during unwrapping.
- Works well with single-axis-dominant rigs and common Blockbench workflows.

## Version

- **1.3.2**: Recursive force-unwrap; zero-rotation group action; stability tweaks; unified naming.

## Credits

- Original concept & implementation: **ydxc2009**  
- Localization & utility extensions: community contributors
