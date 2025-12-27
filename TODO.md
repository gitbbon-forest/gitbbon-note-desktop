# Gitbbon TODO

## Current Sprint: Sync Policy Improvement

### Testing
- [ ] Test Remote 404 - Delete Local
- [ ] Test Remote 404 - Create New Remote
- [ ] Test Remote 404 - Ignore
- [ ] Test New Machine (no mods) - Auto overwrite
- [ ] Test New Machine (with mods) - Overwrite
- [ ] Test New Machine (with mods) - Different name
- [ ] Test New Machine (with mods) - Cancel
- [ ] Test Normal sync (regression)
- [ ] Test Merge conflict detection

### UI Improvements
- [ ] Localize all dialog strings to English
- [ ] Add "Ask AI" button to warning dialogs
- [ ] Implement chat panel integration for AI assistance

### Code Quality
- [ ] Fix ESLint warnings in `githubSyncManager.ts`
- [ ] Fix ESLint warnings in `extension.ts`

---

## Backlog

### Project Deletion Feature
- [x] Add `deleteProject()` to ProjectManager
- [x] Add `deleteGitHubRepo()` to GitHubSyncManager
- [x] Implement delete button in project switcher
- [ ] Add confirmation dialog improvements

### Future Enhancements
- [ ] Implement GitHub API rate limit handling
- [ ] Add retry logic for network failures
- [ ] Support for branch name changes
- [ ] Implement force push detection
