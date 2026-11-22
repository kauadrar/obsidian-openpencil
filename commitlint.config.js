// Commits follow Conventional Commits (https://www.conventionalcommits.org).
// release-please reads them to pick the next version and write CHANGELOG.md:
//   fix: → patch, feat: → minor, feat!: / BREAKING CHANGE: → major.
export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes "fix(deps): Bump …" with a capital B, which subject-case rejects.
  // Its type prefix is set in .github/dependabot.yml, so its commits still drive releases.
  ignores: [(message) => message.includes('Signed-off-by: dependabot[bot]')],
}
