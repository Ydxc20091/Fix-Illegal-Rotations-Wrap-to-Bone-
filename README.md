# Fix Illegal Rotations (Wrap to Bone) — Blockbench Plugin

**Author:** ydxc2009 • **Version:** 1.2.0 • **Variant:** both

This Blockbench plugin scans your selection (or the whole project) for cubes whose
Euler rotations are **not** in the allowed set of discrete angles and *wraps* each
violating cube into a new bone/group:

**Allowed angles:** `{0, ±22.5°, ±45°, ±67.5°, ±90°, ±135°}`  

*(±135° support added in v1.2.0).*

## Why?
Many Minecraft modeling pipelines and runtimes only behave correctly for rotations
that snap to a limited set of angles. Instead of touching your geometry, this plugin
moves the rotation up one level:

- A new **bone/group** is created next to the cube.  
- The **cube's rotation and origin** are copied to that bone.  
- The **cube rotation is reset to (0, 0, 0)** and the cube is parented under the bone.  
- Bone names are **auto-numbered** (`<cube_name>_bone_1`, `_2`, …) to avoid duplicates.  
- The operation is **Undo-friendly** (use *Edit → Undo* or `Ctrl+Z`).

> If the current Blockbench format supports bones (i.e. `Format.bone_rig` is truthy),
> the new group is flagged as a bone; otherwise it's a normal group.

## Menu Location
**Filter → Fix Illegal Rotations (Wrap to Bone)**

## How to Use
1. **Install**: Download `wrap_cube_rotation_to_bone.js` and in Blockbench go to  
   `File → Plugins → Load Plugin from File…`, then choose the file.
2. **Select**: Optionally select one or more cubes. If nothing is selected, the whole project is scanned.
3. **Run**: `Filter → Fix Illegal Rotations (Wrap to Bone)`.
4. **Review**: The status bar shows how many cubes were wrapped. Use `Ctrl+Z` if you need to revert.

## What counts as “illegal”?
A cube is considered illegal if **any** of its three Euler angles is **not** one of:  
`0, ±22.5, ±45, ±67.5, ±90, ±135`.  
The comparison is tolerant to floating-point noise (`EPS = 1e-6`).

## Notes & Tips
- The bone is inserted at the **same hierarchy level and index** as the original cube, so your outliner order stays sensible.
- Names are guaranteed **unique** across existing groups/bones to prevent name collisions.
- Works with **Blockbench v4+**. Variant is `both` (desktop & web).

## Changelog
- **v1.2.0** — Add support for **±135°**; polish README.
- **v1.1.1** — Initial public release.

## License
MIT

## Credits
Plugin by **ydxc2009**. Thanks to the Blockbench community for the great tooling.
