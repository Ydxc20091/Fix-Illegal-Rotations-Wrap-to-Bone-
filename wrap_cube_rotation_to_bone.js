// wrap_and_unwrap_bone_en.js
Plugin.register('wrap_cube_rotation_to_bone', {
  title: 'Fix Illegal Rotations & Unwrap Bones',
  author: 'ydxc2009 (Extended & Translated by ChatGPT)',
  description: 'Provides two main functions: (1) Fix illegal cube rotations by wrapping them into bones; (2) Unwrap bones or groups back to cubes (either only _bone or all groups). Undo-safe.',
  version: '1.3.0',
  variant: 'both',

  onload() {
    // ==========================
    // Wrap cubes with illegal rotation into bones
    // ==========================
    const actionWrap = new Action('wrap_cube_rotation_to_bone_en', {
      name: 'Fix Illegal Rotations (Wrap to Bone)',
      click: () => {
        const ALLOWED = [0, 22.5, 45, 67.5, 90, 135, -22.5, -45, -67.5, -90, -135];
        const EPS = 1e-6;
        const isAllowed = (a) => ALLOWED.some(v => Math.abs((+a || 0) - v) <= EPS);

        const candidates = (Outliner.selected.length ? Outliner.selected : Cube.all)
          .filter(e => e && e.type === 'cube');

        const targets = candidates.filter(c =>
          !(isAllowed(c.rotation[0]) && isAllowed(c.rotation[1]) && isAllowed(c.rotation[2]))
        );

        if (targets.length === 0) {
          Blockbench.showQuickMessage('No cubes require processing (selection or project).');
          return;
        }

        const existingNames = new Set(Group.all.map(g => g.name));
        const counters = new Map();

        const uniqueBoneName = (base) => {
          let n = (counters.get(base) || 1);
          let name = `${base}_${n}`;
          while (existingNames.has(name)) {
            n += 1;
            name = `${base}_${n}`;
          }
          counters.set(base, n + 1);
          existingNames.add(name);
          return name;
        };

        Undo.initEdit({ elements: targets, outliner: true, selection: true });
        let changed = 0;

        targets.forEach(cube => {
          const parent = cube.parent || null;
          const insertIndex = parent ? parent.children.indexOf(cube) : undefined;
          const rot = cube.rotation.slice();
          const orig = cube.origin.slice();

          const base = `${cube.name || 'cube'}_bone`;
          const boneName = uniqueBoneName(base);

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
        Undo.finishEdit(`Wrapped and zeroed ${changed} cube(s)`);
        Blockbench.showQuickMessage(`Done: ${changed} cube(s) wrapped into bones and reset to 0,0,0.`);
      }
    });

    // ==========================
    // Rotation math utilities
    // ==========================
    const deg2rad = (d) => d * Math.PI / 180;
    const rad2deg = (r) => r * 180 / Math.PI;

    function eulerToMatrix(rot) {
      const [x, y, z] = rot.map(deg2rad);
      const cx = Math.cos(x), sx = Math.sin(x);
      const cy = Math.cos(y), sy = Math.sin(y);
      const cz = Math.cos(z), sz = Math.sin(z);
      return [
        [cy * cz, cz * sx * sy - cx * sz, sx * sz + cx * cz * sy],
        [cy * sz, cx * cz + sx * sy * sz, cx * sy * sz - cz * sx],
        [-sy, cy * sx, cx * cy]
      ];
    }

    function matMul(a, b) {
      return a.map((r, i) =>
        r.map((_, j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j])
      );
    }

    function matrixToEuler(m) {
      let y = Math.asin(-m[2][0]);
      let x, z;
      if (Math.abs(m[2][0]) < 0.99999) {
        x = Math.atan2(m[2][1], m[2][2]);
        z = Math.atan2(m[1][0], m[0][0]);
      } else {
        x = Math.atan2(-m[1][2], m[1][1]);
        z = 0;
      }
      return [rad2deg(x), rad2deg(y), rad2deg(z)];
    }

    // ==========================
    // Unwrap only bones (_bone)
    // ==========================
    const actionUnwrapBone = new Action('unwrap_bone_to_cube_en', {
      name: 'Unwrap Bones back to Cubes (only _bone)',
      click: () => {
        const targets = Group.all.filter(g => g.is_bone || /_bone/i.test(g.name));
        if (targets.length === 0) {
          Blockbench.showQuickMessage('No bones found to unwrap.');
          return;
        }

        Undo.initEdit({ outliner: true, selection: true });
        let count = 0;

        targets.forEach(bone => {
          const cubes = bone.children.filter(c => c.type === 'cube');
          if (cubes.length === 1) {
            const cube = cubes[0];
            const boneM = eulerToMatrix(bone.rotation);
            const cubeM = eulerToMatrix(cube.rotation);
            const combined = matMul(boneM, cubeM);
            cube.rotation = matrixToEuler(combined);

            cube.origin = [
              cube.origin[0] + bone.origin[0],
              cube.origin[1] + bone.origin[1],
              cube.origin[2] + bone.origin[2]
            ];

            const parent = bone.parent || null;
            const idx = parent ? parent.children.indexOf(bone) : undefined;
            cube.addTo(parent, idx);
            bone.remove();
            count++;
          }
        });

        Canvas.updateAll();
        Undo.finishEdit(`Unwrapped ${count} bone(s)`);
        Blockbench.showQuickMessage(`Done: ${count} bone(s) unwrapped back to cubes.`);
      }
    });

    // ==========================
    // Force unwrap all groups (regardless of name)
    // ==========================
    const actionUnwrapAll = new Action('unwrap_all_groups_en', {
      name: 'Force Unwrap All Groups (regardless of name)',
      click: () => {
        const targets = Group.all.slice();
        if (targets.length === 0) {
          Blockbench.showQuickMessage('No groups to unwrap in this project.');
          return;
        }

        Undo.initEdit({ outliner: true, selection: true });
        let count = 0;

        targets.forEach(group => {
          const cubes = group.children.filter(c => c.type === 'cube');
          if (cubes.length === 1) {
            const cube = cubes[0];
            const gM = eulerToMatrix(group.rotation);
            const cM = eulerToMatrix(cube.rotation);
            const combined = matMul(gM, cM);
            cube.rotation = matrixToEuler(combined);

            cube.origin = [
              cube.origin[0] + group.origin[0],
              cube.origin[1] + group.origin[1],
              cube.origin[2] + group.origin[2]
            ];

            const parent = group.parent || null;
            const idx = parent ? parent.children.indexOf(group) : undefined;
            cube.addTo(parent, idx);
            group.remove();
            count++;
          }
        });

        Canvas.updateAll();
        Undo.finishEdit(`Force-unwrapped ${count} group(s)`);
        Blockbench.showQuickMessage(`Done: ${count} group(s) forcibly unwrapped back to cubes.`);
      }
    });

    // Register all actions to the "Filter" menu
    MenuBar.addAction(actionWrap, 'filter');
    MenuBar.addAction(actionUnwrapBone, 'filter');
    MenuBar.addAction(actionUnwrapAll, 'filter');
  },

  onunload() {
    ['wrap_cube_rotation_to_bone_en', 'unwrap_bone_to_cube_en', 'unwrap_all_groups_en'].forEach(id => {
      const a = Action.all[id];
      if (a) a.delete();
    });
  }
});
