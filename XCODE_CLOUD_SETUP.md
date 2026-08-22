# Xcode Cloud Build Setup

Mediora has two app targets that share one Xcode workspace:

| Target | App | Platform |
| --- | --- | --- |
| `mediora` | Mediora | tvOS |
| `mediora-mobile` | mediora-mobile | iOS / macOS (Catalyst) |

Each App Store Connect app has its own Xcode Cloud product and workflows. This
page covers what CI needs to succeed.

## Why builds fail without this setup

`ios/Pods/` and `node_modules/` are gitignored. Xcode Cloud does not install
them automatically, so the build fails at project load with:

```
error: Unable to open base configuration reference file
'.../ios/Pods/Target Support Files/Pods-mediora-mobile/Pods-mediora-mobile.release.xcconfig'
```

## What the repo provides

- `ios/ci_scripts/ci_post_clone.sh` — runs after every checkout: installs
  Node 20, runs `npm ci` (applies patch-package patches), installs CocoaPods,
  and runs `pod install`. Symlinks node into `/usr/local/bin` so the "Bundle
  React Native code and images" build phase can find it.
- `ci_scripts/ci_post_clone.sh` — a thin wrapper around the script above.

  **Why two copies:** the Xcode project/workspace lives in the `ios/`
  subfolder, and Xcode Cloud looks for `ci_scripts` in the folder containing
  the workspace — i.e. `ios/ci_scripts/`. The repo-root copy covers products
  configured with the default repo-root location. Keep them in sync
  (the root one is a wrapper, so there is nothing to sync).
- `.npmrc` — `legacy-peer-deps=true`, required for `npm ci` to succeed with
  the react-native-tvos dependency tree.

All files exist on `main` and on `copilot/use-avplayer-tone-mapping`.

## Workflow checklist (App Store Connect)

For **each** Xcode Cloud workflow (one per app/target):

1. **Source**: must be the repository and branch you intend to ship
   (currently `main`). Edit Workflow → Source → branch = `main`.
   - The `copilot/use-avplayer-tone-mapping` branch is legacy — it lacks the
     invite feature and recent fixes. Only use it if you know you need it.
2. **Build Action**: confirm it builds the correct scheme for that app
   (`mediora` for tvOS, `mediora-mobile` for iOS/Catalyst).
3. **Custom build scripts**: the script is provided at both the repo root
   (`ci_scripts/`) and next to the workspace (`ios/ci_scripts/`). If the log
   says `Post-Clone script not found at ci_scripts/ci_post_clone.sh`, the
   build checked out a branch/commit that predates the script — check the
   build's **Source** field, then start a new build from `main`.

## Verifying a build

- The build details page shows a **Source** row: it must read
  `main — <commit>`. A "Rebuild" of an old build re-uses that build's commit.
- The log must contain, before the xcodebuild step:

  ```
  === Mediora ci_post_clone.sh starting ===
  Node: v20.x.x at ...
  ...
  === Mediora ci_post_clone.sh complete ===
  ```
