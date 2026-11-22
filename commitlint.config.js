// Commits follow Conventional Commits (https://www.conventionalcommits.org).
// release-please reads them to pick the next version and write CHANGELOG.md:
//   fix: → patch, feat: → minor, feat!: / BREAKING CHANGE: → major.
export default { extends: ['@commitlint/config-conventional'] }
