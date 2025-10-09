// wrap_cube_rotation_to_bone.js
Plugin.register('wrap_cube_rotation_to_bone', {
  title: 'Fix Illegal Rotations (Wrap to Bone)',
  author: 'ydxc2009',
  description:
    'Find cubes whose rotation is not in {0, ±22.5, ±45, ±67.5, ±90, ±135, ±180}. For each, create a bone/group, copy the cube rotation & origin to the bone, and reset the cube rotation to 0,0,0. Auto-numbered bone names to avoid duplicates. All actions are undo-friendly. Added: (1) Unwrap groups whose name contains _bone; (2) Force unwrap any groups (name ignored, recursive); (3) Force wrap all cubes & zero cube rotation; (4) Add zero-rotation group while keeping cube rotation.',
  version: '1.3.3',
  variant: 'both',

  onload() {
    // ======== Utilities ========
    const EPS = 1e-6;
    const toRad = d => d * Math.PI / 180;
    const clamp = n => Math.abs(n) < EPS ? 0 : +n.toFixed(6);
    const normAngle = a => {
      let x = a || 0;
      while (x <= -180) x += 360;
      while (x > 180) x -= 360;
      return clamp(x);
    };

    // Rotation matrix (ZYX order): R = Rz * Ry * Rx
    function eulerToMatZYX([xDeg, yDeg, zDeg]) {
      const x = toRad(xDeg || 0), y = toRad(yDeg || 0), z = toRad(zDeg || 0);
      const cx = Math.cos(x), sx = Math.sin(x);
      const cy = Math.cos(y), sy = Math.sin(y);
      const cz = Math.cos(z), sz = Math.sin(z);
      return [
        [cz*cy, cz*sy*sx - sz*cx, cz*sy*cx + sz*sx],
        [sz*cy, sz*sy*sx + cz*cx, sz*sy*cx - cz*sx],
        [-sy,   cy*sx,             cy*cx]
      ];
    }
    function mulMatVec(m, v) {
      return [
        m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
        m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
        m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]
      ];
    }
    // Rotate point p around pivot by rot (degrees)
    function rotatePointAround(p, rot, pivot) {
      const v = [
        (p[0]||0) - (pivot[0]||0),
        (p[1]||0) - (pivot[1]||0),
        (p[2]||0) - (pivot[2]||0)
      ];
      const R = eulerToMatZYX([rot[0]||0, rot[1]||0, rot[2]||0]);
      const vv = mulMatVec(R, v);
      return [
        clamp(vv[0] + (pivot[0]||0)),
        clamp(vv[1] + (pivot[1]||0)),
        clamp(vv[2] + (pivot[2]||0))
      ];
    }
    // Simple per-axis Euler addition with normalization
    function composeEulerAdd(a = [0,0,0], b = [0,0,0]) {
      return [
        normAngle((a[0]||0) + (b[0]||0)),
        normAngle((a[1]||0) + (b[1]||0)),
        normAngle((a[2]||0) + (b[2]||0))
      ];
    }

    // Unique name factory
    const uniqueNameFactory = () => {
      const existing = new Set(Group.all.map(g => g.name));
      const counters = new Map();
      return (base) => {
        let n = (counters.get(base) || 1);
        let name = `${base}_${n}`;
        while (existing.has(name)) { n += 1; name = `${base}_${n}`; }
        counters.set(base, n + 1);
        existing.add(name);
        return name;
      };
    };
    const makeUnique = uniqueNameFactory();

    // Recursively collect groups (for force unwrap)
    function collectGroupsRecursive(groups) {
      const set = new Set();
      const dfs = (g) => {
        if (!g || g.type !== 'group' || set.has(g)) return;
        set.add(g);
        g.children.forEach(ch => { if (ch && ch.type === 'group') dfs(ch); });
      };
      groups.forEach(dfs);
      return Array.from(set);
    }

    // Deepest-first ordering
    function sortGroupsDeepestFirst(groups) {
      function depth(g){ let d=0,p=g.parent; while(p && p!=='root'){ d++; p=p.parent; } return d; }
      return groups.slice().sort((a,b) => depth(b) - depth(a));
    }

    // Unwrap core
    function unwrapOneGroup(group) {
      const parent = group.parent || null;
      let insertIndex = parent ? parent.children.indexOf(group) : undefined;

      const grot = [group.rotation[0]||0, group.rotation[1]||0, group.rotation[2]||0];
      const gorg = [group.origin[0]||0,  group.origin[1]||0,  group.origin[2]||0];

      const children = group.children.slice();
      let moved = 0;

      children.forEach(ch => {
        if (!ch || ch.type !== 'cube') return;
        const crot = [ch.rotation[0]||0, ch.rotation[1]||0, ch.rotation[2]||0];
        const corg = [ch.origin[0]||0,   ch.origin[1]||0,   ch.origin[2]||0];

        const newOrigin = rotatePointAround(corg, grot, gorg);
        const newRot = composeEulerAdd(crot, grot);

        ch.origin = newOrigin;
        ch.rotation = newRot;

        ch.addTo(parent, insertIndex);
        if (typeof insertIndex === 'number') insertIndex += 1;
        moved += 1;
      });

      if (!group.children.length) group.remove();
      return moved;
    }

    // ======== Action 1: Fix illegal rotations (wrap & zero cube) ========
    const action_wrap_illegal = this.action = new Action('wrap_cube_rotation_to_bone', {
      name: 'Fix Illegal Rotations (Wrap to Bone)',
      click: () => {
        // 添加了正负180度支持
        const ALLOWED = [0, 22.5, 45, 67.5, 90, 135, 180, -22.5, -45, -67.5, -90, -135, -180];
        const isAllowed = (a) => ALLOWED.some(v => Math.abs((+a || 0) - v) <= EPS);

        const candidates = (Outliner.selected.length ? Outliner.selected : Cube.all)
          .filter(e => e && e.type === 'cube');

        const targets = candidates.filter(c =>
          !(isAllowed(c.rotation[0]) && isAllowed(c.rotation[1]) && isAllowed(c.rotation[2]))
        );

        if (!targets.length) {
          Blockbench.showQuickMessage('No cubes need fixing (within selection or entire project).');
          return;
        }

        Undo.initEdit({ elements: targets, outliner: true, selection: true });
        let changed = 0;

        targets.forEach(cube => {
          const parent = cube.parent || null;
          const insertIndex = parent ? parent.children.indexOf(cube) : undefined;

          const rot = [ cube.rotation[0]||0, cube.rotation[1]||0, cube.rotation[2]||0 ];
          const orig = [ cube.origin[0]||0,  cube.origin[1]||0,  cube.origin[2]||0 ];

          const base = `${cube.name || 'cube'}_bone`;
          const boneName = makeUnique(base);

          const bone = new Group({
            name: boneName,
            origin: orig,
            rotation: rot,
            is_bone: !!Format.bone_rig
          }).init();

          bone.addTo(parent, insertIndex);
          cube.addTo(bone);
          cube.rotation = [0, 0, 0];

          changed++;
        });

        Canvas.updateAll();
        Undo.finishEdit(`Wrapped & zeroed rotations (${changed} cube${changed===1?'':'s'})`);
        Blockbench.showQuickMessage(`Done: ${changed} cube(s) wrapped into auto-numbered bones and reset to 0,0,0.`);
      }
    });

    // ======== Action 2: Force wrap & zero cube rotation ========
    const action_wrap_force_zero = new Action('wrap_force_zero_en', {
      name: 'Force Wrap + Zero Cube Rotation (1 bone per cube)',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('No selected or available cubes.');

        Undo.initEdit({ elements: cubes, outliner: true, selection: true });
        let changed = 0;

        cubes.forEach(cube => {
          const parent = cube.parent || null;
          const insertIndex = parent ? parent.children.indexOf(cube) : undefined;
          const base = `${cube.name || 'cube'}_bone`;
          const boneName = makeUnique(base);

          const bone = new Group({
            name: boneName,
            origin: [cube.origin[0]||0, cube.origin[1]||0, cube.origin[2]||0],
            rotation: [cube.rotation[0]||0, cube.rotation[1]||0, cube.rotation[2]||0],
            is_bone: !!Format.bone_rig
          }).init();

          bone.addTo(parent, insertIndex);
          cube.addTo(bone);
          cube.rotation = [0,0,0];
          changed++;
        });

        Canvas.updateAll();
        Undo.finishEdit(`Force wrap + zero cube rotation (${changed})`);
        Blockbench.showQuickMessage(`Done: ${changed} cube(s) wrapped and zeroed.`);
      }
    });

    // ======== Action 3: Add zero-rotation group (keep cube rotation) ========
    const action_add_zero_group_keep_cube = new Action('add_zero_group_keep_cube_en', {
      name: 'Add Zero-Rotation Group (Keep Cube Rotation)',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('No selected or available cubes.');

        Undo.initEdit({ elements: cubes, outliner: true, selection: true });
        let changed = 0;

        cubes.forEach(cube => {
          const parent = cube.parent || null;
          const insertIndex = parent ? parent.children.indexOf(cube) : undefined;
          const base = `${cube.name || 'cube'}_grp`;
          const grpName = makeUnique(base);

          const grp = new Group({
            name: grpName,
            origin: [cube.origin[0]||0, cube.origin[1]||0, cube.origin[2]||0],
            rotation: [0,0,0],
            is_bone: !!Format.bone_rig
          }).init();

          grp.addTo(parent, insertIndex);
          cube.addTo(grp);
          changed++;
        });

        Canvas.updateAll();
        Undo.finishEdit(`Added zero-rotation groups (${changed})`);
        Blockbench.showQuickMessage(`Done: ${changed} cube(s) encapsulated in zero-rotation groups (cube rotation kept).`);
      }
    });

    // ======== Action 4: Unwrap groups whose name contains `_bone` ========
    const action_unwrap_bone_name = new Action('unwrap_bone_name_en', {
      name: 'Unwrap Bones (name contains _bone)',
      click: () => {
        const baseList = (Outliner.selected.length ? Outliner.selected : Group.all)
          .filter(e => e && e.type === 'group');
        const targets = baseList.filter(g => (g.name || '').includes('_bone'));
        if (!targets.length) return Blockbench.showQuickMessage('No groups with name containing "_bone" to unwrap.');

        const allRelated = [];
        targets.forEach(g => {
          allRelated.push(g);
          g.children.forEach(ch => { if (ch && ch.type === 'cube') allRelated.push(ch); });
        });

        Undo.initEdit({ elements: allRelated, outliner: true, selection: true });
        const sorted = sortGroupsDeepestFirst(targets);
        let moved = 0;
        sorted.forEach(g => { moved += unwrapOneGroup(g); });

        Canvas.updateAll();
        Undo.finishEdit(`Unwrapped bones by name (_bone). Moved ${moved} cube(s).`);
        Blockbench.showQuickMessage(`Done: Unwrapped ${targets.length} group(s); moved ${moved} cube(s).`);
      }
    });

    // ======== Action 5: Force unwrap ANY groups (name ignored, recursive) ========
    const action_unwrap_any_group = new Action('unwrap_any_group_en', {
      name: 'Force Unwrap Any Group (Preserve Appearance)',
      click: () => {
        const selGroups = (Outliner.selected || []).filter(e => e && e.type === 'group');
        const targets = selGroups.length ? collectGroupsRecursive(selGroups) : Group.all.slice();
        if (!targets.length) return Blockbench.showQuickMessage('No groups to unwrap.');

        const allRelated = [];
        targets.forEach(g => {
          allRelated.push(g);
          g.children.forEach(ch => { if (ch && ch.type === 'cube') allRelated.push(ch); });
        });

        Undo.initEdit({ elements: allRelated, outliner: true, selection: true });
        const sorted = sortGroupsDeepestFirst(targets);
        let moved = 0;
        sorted.forEach(g => { moved += unwrapOneGroup(g); });

        Canvas.updateAll();
        Undo.finishEdit(`Force unwrapped groups. Moved ${moved} cube(s).`);
        Blockbench.showQuickMessage(`Done: Unwrapped ${targets.length} group(s); moved ${moved} cube(s).`);
      }
    });

    // Menu
    MenuBar.addAction(action_wrap_illegal, 'filter');
    MenuBar.addAction(action_wrap_force_zero, 'filter');
    MenuBar.addAction(action_add_zero_group_keep_cube, 'filter');
    MenuBar.addAction(action_unwrap_bone_name, 'filter');
    MenuBar.addAction(action_unwrap_any_group, 'filter');

    this._extra_actions = [
      action_wrap_force_zero,
      action_add_zero_group_keep_cube,
      action_unwrap_bone_name,
      action_unwrap_any_group
    ];
  },

  onunload() {
    this.action?.delete();
    (this._extra_actions || []).forEach(a => a.delete());
  }
});
