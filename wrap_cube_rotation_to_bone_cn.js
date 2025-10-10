// wrap_cube_rotation_to_bone.js
Plugin.register('wrap_cube_rotation_to_bone_cn', {
  title: '修复非法旋转（包裹到骨骼）',
  author: 'ydxc2009',
  description:
    '查找旋转角度不在 {0, ±22.5, ±45, ±67.5, ±90, ±135, ±180} 范围内的立方体。为每个这样的立方体创建骨骼/组，将立方体的旋转和原点复制到骨骼，并将立方体旋转重置为0,0,0。自动编号的骨骼名称以避免重复。所有操作都支持撤销。新增功能：(1) 解包名称包含_bone的组；(2) 强制解包任何组（忽略名称，递归）；(3) 强制包裹所有立方体并清零旋转；(4) 添加零旋转组同时保持立方体旋转。',
  version: '1.3.3',
  variant: 'both',

  onload() {
    // ======== 工具函数 ========
    const EPS = 1e-6;
    const toRad = d => d * Math.PI / 180;
    const clamp = n => Math.abs(n) < EPS ? 0 : +n.toFixed(6);
    const normAngle = a => {
      let x = a || 0;
      while (x <= -180) x += 360;
      while (x > 180) x -= 360;
      return clamp(x);
    };

    // 旋转矩阵（ZYX顺序）：R = Rz * Ry * Rx
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
    // 绕轴心点旋转点p
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
    // 简单的欧拉角逐轴相加并归一化
    function composeEulerAdd(a = [0,0,0], b = [0,0,0]) {
      return [
        normAngle((a[0]||0) + (b[0]||0)),
        normAngle((a[1]||0) + (b[1]||0)),
        normAngle((a[2]||0) + (b[2]||0))
      ];
    }

    // 唯一名称生成器
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

    // 递归收集组（用于强制解包）
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

    // 最深优先排序
    function sortGroupsDeepestFirst(groups) {
      function depth(g){ let d=0,p=g.parent; while(p && p!=='root'){ d++; p=p.parent; } return d; }
      return groups.slice().sort((a,b) => depth(b) - depth(a));
    }

    // 解包核心函数
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

    // ======== 操作1：修复非法旋转（包裹并清零立方体） ========
    const action_wrap_illegal = this.action = new Action('wrap_cube_rotation_to_bone', {
      name: '修复非法旋转（包裹到骨骼）',
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
          Blockbench.showQuickMessage('没有需要修复的立方体（在选区或整个项目中）。');
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
        Undo.finishEdit(`包裹并清零旋转（${changed}个立方体${changed===1?'':'s'})`);
        Blockbench.showQuickMessage(`完成：${changed}个立方体已包裹到自动编号的骨骼中并重置为0,0,0。`);
      }
    });

    // ======== 操作2：强制包裹并清零立方体旋转 ========
    const action_wrap_force_zero = new Action('wrap_force_zero_en', {
      name: '强制包裹 + 清零立方体旋转（每个立方体1个骨骼）',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('没有选中的或可用的立方体。');

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
        Undo.finishEdit(`强制包裹 + 清零立方体旋转（${changed}）`);
        Blockbench.showQuickMessage(`完成：${changed}个立方体已包裹并清零旋转。`);
      }
    });

    // ======== 操作3：添加零旋转组（保持立方体旋转） ========
    const action_add_zero_group_keep_cube = new Action('add_zero_group_keep_cube_en', {
      name: '添加零旋转组（保持立方体旋转）',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('没有选中的或可用的立方体。');

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
        Undo.finishEdit(`添加零旋转组（${changed}）`);
        Blockbench.showQuickMessage(`完成：${changed}个立方体已封装在零旋转组中（立方体旋转保持不变）。`);
      }
    });

    // ======== 操作4：解包名称包含`_bone`的组 ========
    const action_unwrap_bone_name = new Action('unwrap_bone_name_en', {
      name: '解包骨骼（名称包含_bone）',
      click: () => {
        const baseList = (Outliner.selected.length ? Outliner.selected : Group.all)
          .filter(e => e && e.type === 'group');
        const targets = baseList.filter(g => (g.name || '').includes('_bone'));
        if (!targets.length) return Blockbench.showQuickMessage('没有名称包含"_bone"的组需要解包。');

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
        Undo.finishEdit(`按名称解包骨骼（_bone）。移动了${moved}个立方体。`);
        Blockbench.showQuickMessage(`完成：解包了${targets.length}个组；移动了${moved}个立方体。`);
      }
    });

    // ======== 操作5：强制解包任何组（忽略名称，递归） ========
    const action_unwrap_any_group = new Action('unwrap_any_group_en', {
      name: '强制解包任何组（保持外观）',
      click: () => {
        const selGroups = (Outliner.selected || []).filter(e => e && e.type === 'group');
        const targets = selGroups.length ? collectGroupsRecursive(selGroups) : Group.all.slice();
        if (!targets.length) return Blockbench.showQuickMessage('没有需要解包的组。');

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
        Undo.finishEdit(`强制解包组。移动了${moved}个立方体。`);
        Blockbench.showQuickMessage(`完成：解包了${targets.length}个组；移动了${moved}个立方体。`);
      }
    });

    // 菜单
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
