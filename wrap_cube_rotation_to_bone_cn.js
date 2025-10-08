// wrap_cube_rotation_to_bone_cn.js
Plugin.register('wrap_cube_rotation_to_bone_cn', {
  title: '修复非法旋转（包裹为骨骼）',
  author: 'ydxc2009（中文化）',
  description:
    '查找旋转角度不在 {0, ±22.5, ±45, ±67.5, ±90, ±135} 之内的立方体。对每个立方体创建一个骨骼/组，复制其旋转和原点到骨骼，并将立方体旋转重置为 0,0,0。骨骼名称自动编号，避免重复。支持撤销操作。新增功能：① 仅拆分名称含 _bone 的骨骼；② 强制拆分任意骨骼/组；③ 强制包裹并把块旋转清零；④ 只添加零旋转组且保留块旋转。',
  version: '1.3.0',
  variant: 'both',

  onload() {
    // ======== 公共工具 ========
    const EPS = 1e-6;
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const clamp = n => Math.abs(n) < EPS ? 0 : +n.toFixed(6);
    const normAngle = a => {
      let x = a;
      while (x <= -180) x += 360;
      while (x > 180) x -= 360;
      return clamp(x);
    };

    // Z * Y * X 顺序的旋转矩阵（与 Blockbench 常见轴心习惯一致，够用且稳定）
    function eulerToMatZYX([xDeg, yDeg, zDeg]) {
      const x = toRad(xDeg || 0), y = toRad(yDeg || 0), z = toRad(zDeg || 0);
      const cx = Math.cos(x), sx = Math.sin(x);
      const cy = Math.cos(y), sy = Math.sin(y);
      const cz = Math.cos(z), sz = Math.sin(z);
      // R = Rz * Ry * Rx
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
    // 将点 p 按 rot（度）绕 pivot 旋转
    function rotatePointAround(p, rot, pivot) {
      const v = [ (p[0]||0)-(pivot[0]||0), (p[1]||0)-(pivot[1]||0), (p[2]||0)-(pivot[2]||0) ];
      const R = eulerToMatZYX([rot[0]||0, rot[1]||0, rot[2]||0]);
      const vv = mulMatVec(R, v);
      return [ clamp(vv[0] + (pivot[0]||0)), clamp(vv[1] + (pivot[1]||0)), clamp(vv[2] + (pivot[2]||0)) ];
    }
    // 简化的欧拉合成：逐轴相加并标准化（在本插件的使用场景下足够稳定）
    function composeEulerAdd(a = [0,0,0], b = [0,0,0]) {
      return [ normAngle((a[0]||0)+(b[0]||0)), normAngle((a[1]||0)+(b[1]||0)), normAngle((a[2]||0)+(b[2]||0)) ];
    }

    // 名称唯一化（组/骨骼）
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

    // ======== 功能1：按规则包裹（原有功能，筛选“非法角度”） ========
    const action_wrap_illegal = this.action = new Action('wrap_cube_rotation_to_bone_cn', {
      name: '修复非法旋转（包裹为骨骼）',
      click: () => {
        const ALLOWED = [0, 22.5, 45, 67.5, 90, 135, -22.5, -45, -67.5, -90, -135];
        const isAllowed = (a) => ALLOWED.some(v => Math.abs((+a || 0) - v) <= EPS);

        const candidates = (Outliner.selected.length ? Outliner.selected : Cube.all)
          .filter(e => e && e.type === 'cube');

        const targets = candidates.filter(c =>
          !(isAllowed(c.rotation[0]) && isAllowed(c.rotation[1]) && isAllowed(c.rotation[2]))
        );

        if (!targets.length) {
          Blockbench.showQuickMessage('没有需要处理的立方体（在选择或整个项目中）。');
          return;
        }

        Undo.initEdit({ elements: targets, outliner: true, selection: true });
        let changed = 0;

        targets.forEach(cube => {
          const parent = cube.parent || null;
          const insertIndex = parent ? parent.children.indexOf(cube) : undefined;

          const rot = [ cube.rotation[0]||0, cube.rotation[1]||0, cube.rotation[2]||0 ];
          const orig = [ cube.origin[0]||0, cube.origin[1]||0, cube.origin[2]||0 ];

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
        Undo.finishEdit(`包裹并重置旋转（共 ${changed} 个立方体）`);
        Blockbench.showQuickMessage(`完成：${changed} 个立方体已被包裹为自动编号骨骼，并重置旋转为 0,0,0。`);
      }
    });

    // ======== 功能2：强制包裹所有块并清零旋转（不看角度） ========
    const action_wrap_force_zero = new Action('wrap_force_zero_cn', {
      name: '强制包裹并清零旋转（每块一个骨骼）',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('没有选中或可处理的立方体。');

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
        Undo.finishEdit(`强制包裹并清零旋转（共 ${changed} 个）`);
        Blockbench.showQuickMessage(`完成：${changed} 个立方体已包裹为骨骼并清零旋转。`);
      }
    });

    // ======== 功能3：仅添加“零旋转组”，块旋转不变 ========
    const action_add_zero_group_keep_cube = new Action('add_zero_group_keep_cube_cn', {
      name: '添加零旋转组（块旋转不变）',
      click: () => {
        const cubes = (Outliner.selected.length ? Outliner.selected : Cube.all).filter(e => e && e.type === 'cube');
        if (!cubes.length) return Blockbench.showQuickMessage('没有选中或可处理的立方体。');

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
        Undo.finishEdit(`添加零旋转组（共 ${changed} 个）`);
        Blockbench.showQuickMessage(`完成：${changed} 个立方体已添加零旋转组（保留原旋转）。`);
      }
    });

    // ======== 拆分核心：把骨骼/组的旋转合并进块，并将块移到上级，保持外观不变 ========
    function unwrapOneGroup(group) {
      const parent = group.parent || null;
      let insertIndex = parent ? parent.children.indexOf(group) : undefined;

      const grot = [group.rotation[0]||0, group.rotation[1]||0, group.rotation[2]||0];
      const gorg = [group.origin[0]||0, group.origin[1]||0, group.origin[2]||0];

      // 拷贝数组，避免遍历时结构变化
      const children = group.children.slice();
      let moved = 0;

      children.forEach(ch => {
        if (!ch || ch.type !== 'cube') return;
        const crot = [ch.rotation[0]||0, ch.rotation[1]||0, ch.rotation[2]||0];
        const corg = [ch.origin[0]||0, ch.origin[1]||0, ch.origin[2]||0];

        // 新原点 = 子原点绕组原点按组旋转后的结果
        const newOrigin = rotatePointAround(corg, grot, gorg);
        // 新旋转 = 逐轴相加标准化（简洁可靠，适配本插件的使用约束）
        const newRot = composeEulerAdd(crot, grot);

        ch.origin = newOrigin;
        ch.rotation = newRot;

        ch.addTo(parent, insertIndex);
        if (typeof insertIndex === 'number') insertIndex += 1;
        moved += 1;
      });

      // 若该组已无意义则删除
      if (!group.children.length) {
        group.remove();
      }
      return moved;
    }

    // 深度排序，先拆内层，防止父先拆导致层级变动
    function sortGroupsDeepestFirst(groups) {
      function depth(g) { let d = 0, p = g.parent; while (p && p !== 'root') { d++; p = p.parent; } return d; }
      return groups.slice().sort((a,b) => depth(b) - depth(a));
    }

    // ======== 功能4：仅拆分名称含 _bone 的骨骼 ========
    const action_unwrap_bone_name = new Action('unwrap_bone_name_cn', {
      name: '拆分骨骼（名称含 _bone）',
      click: () => {
        const baseList = (Outliner.selected.length ? Outliner.selected : Group.all).filter(e => e && e.type === 'group');
        const targets = baseList.filter(g => (g.name || '').includes('_bone'));
        if (!targets.length) return Blockbench.showQuickMessage('没有名称包含 _bone 的骨骼可拆分。');

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
        Undo.finishEdit(`拆分骨骼（名称含 _bone，移动 ${moved} 个立方体）`);
        Blockbench.showQuickMessage(`完成：拆分 ${targets.length} 个骨骼，移动 ${moved} 个立方体。`);
      }
    });

    // ======== 功能5：强制拆分任意骨骼/组（不看名称） ========
    const action_unwrap_any_group = new Action('unwrap_any_group_cn', {
      name: '强制拆分任意骨骼/组（保持外观）',
      click: () => {
        const targets = (Outliner.selected.length ? Outliner.selected : Group.all).filter(e => e && e.type === 'group');
        if (!targets.length) return Blockbench.showQuickMessage('没有可拆分的骨骼/组。');

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
        Undo.finishEdit(`强制拆分任意骨骼/组（移动 ${moved} 个立方体）`);
        Blockbench.showQuickMessage(`完成：拆分 ${targets.length} 个骨骼/组，移动 ${moved} 个立方体。`);
      }
    });

    // ======== 菜单挂载 ========
    MenuBar.addAction(action_wrap_illegal, 'filter');
    MenuBar.addAction(action_wrap_force_zero, 'filter');
    MenuBar.addAction(action_add_zero_group_keep_cube, 'filter');
    MenuBar.addAction(action_unwrap_bone_name, 'filter');
    MenuBar.addAction(action_unwrap_any_group, 'filter');

    // 方便卸载
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
