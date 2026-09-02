# `KeyboardExtender` accessory leak — react-native-keyboard-controller 1.22.4

Minimal RN app reproducing, on a physical device, two separate defects around
`KeyboardExtenderManager`'s `inputAccessoryView` handling.

| | **Bug A — inflated keyboard frame** | **Bug B — stale empty container** |
| --- | --- | --- |
| Symptom | Keyboard frame reports 44pt too tall on a screen with no extender; anything positioned off keyboard height sits that much too high | An input presents a container the extender has already emptied |
| Probe | `[probe] keyboardHeight=…` | `[probe] … EMPTY-CONTAINER` |
| Reproduces | Yes, on device | Yes, on device and simulator |

## Run it

```sh
cd RnkcRepro
npm install
(cd ios && pod install)
npm start                 # one shell
npm run ios               # another — or build to a device from Xcode
```

Device builds need your own signing team; nothing team-specific is committed here.

The app plays a scenario by itself ~1.5s after launch (`AUTO_RUN` / `SCENARIO` in
`App.tsx`). Watch the probes:

```sh
# simulator
xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"'
# device
xcrun devicectl device process launch --device <udid> --console <bundle-id>
```

`AccessoryProbe` (`ios/RnkcRepro/AppDelegate.swift`) logs every text input, the
`inputAccessoryView` it holds, and how many React-managed views that container
still has. It registers before any `KeyboardExtender` mounts, so it reports the
state UIKit actually used. It also logs the reported keyboard frame height.

## What happens

Scenario `navigate-after-blur`: focus A, focus B, navigate to a screen with no
extender, focus C.

```
A focused                 A inputAccessoryView=ModernContainerView@0x…600   keyboardHeight=379
B focused                 A STILL holds it, B gets it too                   keyboardHeight=379
navigate away             extender prepareForRecycle
                          RCTTextInput prepareForRecycle field=…a00 accessory=0x…600
                          RCTTextInput prepareForRecycle field=…500 accessory=0x…600
focus C                   C@…500 inputAccessoryView=…@0x…600 contentViews=0 EMPTY-CONTAINER
                          keyboardHeight=379          ← should be 335
```

Three things go wrong in sequence:

1. **Focusing B does not clear A.** `detachInputAccessoryView` only ever looks at
   `[UIResponder current]`, so A keeps pointing at the shared container.
2. **Leaving the screen clears neither.** By the time the extender's
   `prepareForRecycle` runs, `[UIResponder current]` is already `nil`, so the
   detach clears nothing at all — both fields go into the recycle pool with the
   accessory still attached. This is worse than "only clears the first responder".
3. **RN hands the dirty view to the next screen.** On RN 0.81.6
   `RCTTextInputComponentView.prepareForRecycle` does not clear
   `inputAccessoryView` (fixed upstream in facebook/react-native#52825, landed for
   0.82). C is given A's field, bar attached — so the keyboard frame is 44pt too
   tall and C presents a container React has already emptied.

## Which patch fixes what

Both patches are in `RnkcRepro/patches-available/`; `scripts/variant.sh a|b|c|d`
selects them. Measured on device, scenario `navigate-after-blur`:

| Build | Patches | Keyboard height on Settings | `EMPTY-CONTAINER` at refocus |
| --- | --- | --- | --- |
| a | neither | **379.00** | **yes** |
| b | RN only (facebook/react-native#52825) | 335.00 | no |
| c | RNKC only (detach from all attached inputs) | 335.00 | no |
| d | both | 335.00 | no |

**Both patches independently fix both symptoms on this path.** That is not the
split we expected — the RNKC patch alone is enough for the footer symptom, because
clearing every attached input at detach means nothing dirty ever reaches the
recycle pool in the first place.

### A third defect neither patch fixes

Scenario `drop-children` — set the extender's children to `null` while it stays
`enabled`, then refocus:

```
a (neither)   A and B both: contentViews=0 EMPTY-CONTAINER
b (RN only)   A and B both: contentViews=0 EMPTY-CONTAINER
c (RNKC only) A and B both: contentViews=0 EMPTY-CONTAINER
```

No recycling is involved and `detachInputAccessoryView` is never called, because
the extender is still enabled — so a patch to `detach` has nothing to act on.
Emptying an extender's children leaves every input it has attached to presenting an
empty container, indefinitely.

## Scenarios

`SCENARIO` in `App.tsx`:

| Scenario | What it exercises |
| --- | --- |
| `navigate-after-blur` | Bug A + Bug B via recycling — the main one |
| `navigate` | Same, but A is still focused when leaving; the extender's detach catches it, nothing leaks |
| `navigate-control` | Baseline with no extender: correct height |
| `drop-children` | Bug B with no recycling; the third defect above |
| `toggle-enabled` | Bug B via `enabled` → `false` |
| `unmount` | Extender unmounted; the accessory is never cleaned up at all |

Each screen is keyed, which matters: without `key`, React reconciles the two
screens in place and Input C reuses Input A's host view directly. That leaks too,
but it never goes through the recycle pool, so it is not the path a navigation
library takes.

## Environment

| | |
| --- | --- |
| Device | iPhone 16, iOS 26.5 (physical) |
| Desktop OS | macOS 26.6.2 |
| Xcode | 26.1.1 (17B100) |
| React Native | 0.81.6 |
| Architecture | new / Fabric |
| JS engine | Hermes |
| react-native-keyboard-controller | 1.22.4 |
| react-native-reanimated | 3.19.1 |

`react-native-reanimated` is a required peer of RNKC 1.22.4; npm resolves it to
4.6.0, which needs RN 0.83–0.87, so it is pinned to 3.19.1.

## Notes

- On the **simulator** Bug B reproduces in the logs, but nothing is ever visible —
  the flash is cleared within the same run-loop turn, before any pixels commit.
  Bug A needs a device. `evidence/` holds the earlier simulator captures.
- The footer reads `keyboardWillShow` rather than `keyboardWillChangeFrame` on
  purpose. An app positions its footer once, when the keyboard comes up; listening
  to every frame change silently self-corrects and hides the bug.
