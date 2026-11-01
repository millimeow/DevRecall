import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const roots = git('rev-list', '--max-parents=0', 'HEAD').split('\n');
let valid = 0;
for (const root of roots) {
  const files = git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', root);
  if (files === 'HACKATHON.md') {
    valid++;
    console.log(`${root}: HACKATHON.md-only baseline verified`);
  } else
    console.log(
      `::warning::Inherited root ${root} contains ${files.replaceAll('\n', ', ')}. Preserve history; organizer compliance review is required.`,
    );
}
if (!valid) {
  console.error('No HACKATHON.md-only initial baseline found.');
  process.exitCode = 1;
}
