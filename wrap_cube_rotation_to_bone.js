// wrap_cube_rotation_to_bone.js
Plugin.register('wrap_cube_rotation_to_bone', {
  title: 'Fix Illegal Rotations (Wrap to Bone)',
  author: 'ydxc2009',
  description:
    'Find cubes whose rotation is not in {0, ±22.5, ±45, ±67.5, ±90, ±135}. For each such cube, create a bone/group, copy the cube rotation/origin to the bone, set cube rotation to 0,0,0. Bone names are auto-numbered to avoid duplicates. Undo-friendly.',
  version: '1.2.0',
  variant: 'both',

  onload() {
    const action = this.action = new Action('wrap_cube_rotation_to_bone', {
      name: 'Fix Illegal Rotations (Wrap to Bone)',
      click: () => {
        const ALLOWED = [0, 22.5, 45, 67.5, 90, 135, -22.5, -45, -67.5, -90, -135];
        const EPS = 1e-6;
        const isAllowed = (a) => ALLOWED.some(v => Math.abs((+a || 0) - v) <= EPS);

        // If user selected elements, process only selected cubes; otherwise, process all cubes
        const candidates = (Outliner.selected.length ? Outliner.selected : Cube.all)
          .filter(e => e && e.type === 'cube');

        const targets = candidates.filter(c =>
          !(isAllowed(c.rotation[0]) && isAllowed(c.rotation[1]) && isAllowed(c.rotation[2]))
        );

        if (targets.length === 0) {
          Blockbench.showQuickMessage('No cubes need processing (selection or project).');
          return;
        }

        // Collect existing group/bone names to guarantee uniqueness
        const existingNames = new Set(Group.all.map(g => g.name));
        const counters = new Map(); // per-base auto-increment

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

          const base = `${cube.name || 'cube'}_bone`;
          const boneName = uniqueBoneName(base);

          const bone = new Group({
            name: boneName,
            origin: orig,
            rotation: rot,
            // If the current format supports bones, mark it as bone; otherwise it becomes a normal group
            is_bone: !!Format.bone_rig
          }).init();

          // Insert bone at the same level/position, then move cube under it
          bone.addTo(parent, insertIndex);
          cube.addTo(bone);

          // Reset cube rotation
          cube.rotation = [0, 0, 0];

          changed++;
        });

        Canvas.updateAll();
        Undo.finishEdit(`Wrapped and zeroed rotations (${changed} cube(s))`);
        Blockbench.showQuickMessage(`Done: ${changed} cube(s) wrapped into auto-numbered bones and set to 0,0,0.`);
      }
    });

    // Add to "Filter" menu
    MenuBar.addAction(action, 'filter');
  },

  onunload() {
    this.action.delete();
  }
});
