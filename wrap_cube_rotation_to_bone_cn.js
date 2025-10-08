// wrap_and_unwrap_bone_cn.js
Plugin.register('wrap_cube_rotation_to_bone_cn', {
  title: '修复非法旋转与拆分骨骼',
  author: 'ydxc2009',
  description: '提供两个功能：① 修复非法旋转并包裹为骨骼；② 拆分骨骼回普通块（可仅拆含_bone的或强制全部拆分）。支持撤销操作。',
  version: '1.3.0',
  variant: 'both',

  onload() {
    // ==========================
    // 修复非法旋转（包裹为骨骼）
    // ==========================
    const actionWrap = new Action('wrap_cube_rotation_to_bone_cn', {
      name: '修复非法旋转（包裹为骨骼）',
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
          Blockbench.showQuickMessage('没有需要处理的立方体（在选择或整个项目中）。');
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
        Undo.finishEdit(`包裹并重置旋转（共 ${changed} 个立方体）`);
        Blockbench.showQuickMessage(`完成：${changed} 个立方体已被包裹为自动编号骨骼，并重置旋转为 0,0,0。`);
      }
    });

    // ==========================
    // 旋转矩阵工具函数
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
    // 仅拆含 _bone 的骨骼
    // ==========================
    const actionUnwrapBone = new Action('unwrap_bone_to_cube', {
      name: '拆分骨骼还原块（仅含 _bone 的）',
      click: () => {
        const targets = Group.all.filter(g => g.is_bone || /_bone/i.test(g.name));
        if (targets.length === 0) {
          Blockbench.showQuickMessage('未找到可拆分的骨骼。');
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
        Undo.finishEdit(`拆分骨骼还原 ${count} 个块`);
        Blockbench.showQuickMessage(`完成：${count} 个骨骼已拆分，还原为普通块。`);
      }
    });

    // ==========================
    // 强制拆分所有组（无论名字）
    // ==========================
    const actionUnwrapAll = new Action('unwrap_all_groups', {
      name: '强制拆分所有组（无论名称）',
      click: () => {
        const targets = Group.all.slice();
        if (targets.length === 0) {
          Blockbench.showQuickMessage('当前项目没有任何组可拆分。');
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
        Undo.finishEdit(`强制拆分还原 ${count} 个块`);
        Blockbench.showQuickMessage(`完成：${count} 个组已强制拆分并还原为普通块。`);
      }
    });

    // 菜单注册
    MenuBar.addAction(actionWrap, 'filter');
    MenuBar.addAction(actionUnwrapBone, 'filter');
    MenuBar.addAction(actionUnwrapAll, 'filter');
  },

  onunload() {
    ['wrap_cube_rotation_to_bone_cn', 'unwrap_bone_to_cube', 'unwrap_all_groups'].forEach(id => {
      const a = Action.all[id];
      if (a) a.delete();
    });
  }
});
