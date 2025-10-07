// wrap_cube_rotation_to_bone_cn.js
Plugin.register('wrap_cube_rotation_to_bone_cn', {
  title: '修复非法旋转（包裹为骨骼）',
  author: 'ydxc2009（中文化 by ChatGPT）',
  description:
    '查找旋转角度不在 {0, ±22.5, ±45, ±67.5, ±90, ±135} 之内的立方体。对每个立方体创建一个骨骼/组，复制其旋转和原点到骨骼，并将立方体旋转重置为 0,0,0。骨骼名称自动编号，避免重复。支持撤销操作。',
  version: '1.2.1',
  variant: 'both',

  onload() {
    const action = this.action = new Action('wrap_cube_rotation_to_bone_cn', {
      name: '修复非法旋转（包裹为骨骼）',
      click: () => {
        const ALLOWED = [0, 22.5, 45, 67.5, 90, 135, -22.5, -45, -67.5, -90, -135];
        const EPS = 1e-6;
        const isAllowed = (a) => ALLOWED.some(v => Math.abs((+a || 0) - v) <= EPS);

        // 如果用户选择了元素，则只处理选中的立方体；否则处理所有立方体
        const candidates = (Outliner.selected.length ? Outliner.selected : Cube.all)
          .filter(e => e && e.type === 'cube');

        const targets = candidates.filter(c =>
          !(isAllowed(c.rotation[0]) && isAllowed(c.rotation[1]) && isAllowed(c.rotation[2]))
        );

        if (targets.length === 0) {
          Blockbench.showQuickMessage('没有需要处理的立方体（在选择或整个项目中）。');
          return;
        }

        // 收集现有的组/骨骼名称以确保唯一性
        const existingNames = new Set(Group.all.map(g => g.name));
        const counters = new Map(); // 每个基础名独立计数

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

          const rot = [
            cube.rotation[0] || 0,
            cube.rotation[1] || 0,
            cube.rotation[2] || 0
          ];
          const orig = [
            cube.origin[0] || 0,
            cube.origin[1] || 0,
            cube.origin[2] || 0
          ];

          // 使用纯英文骨骼名
          const base = `${cube.name || 'cube'}_bone`;
          const boneName = uniqueBoneName(base);

          const bone = new Group({
            name: boneName,
            origin: orig,
            rotation: rot,
            is_bone: !!Format.bone_rig
          }).init();

          // 在同级位置插入骨骼，并将立方体移入骨骼
          bone.addTo(parent, insertIndex);
          cube.addTo(bone);

          // 重置立方体旋转
          cube.rotation = [0, 0, 0];

          changed++;
        });

        Canvas.updateAll();
        Undo.finishEdit(`包裹并重置旋转（共 ${changed} 个立方体）`);
        Blockbench.showQuickMessage(`完成：${changed} 个立方体已被包裹为自动编号骨骼，并重置旋转为 0,0,0。`);
      }
    });

    // 添加到“筛选”菜单
    MenuBar.addAction(action, 'filter');
  },

  onunload() {
    this.action.delete();
  }
});
