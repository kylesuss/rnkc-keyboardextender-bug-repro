# `KeyboardExtender` attaches its accessory to inputs on other screens

Reproduction for [kirillzyusko/react-native-keyboard-controller#1617](https://github.com/kirillzyusko/react-native-keyboard-controller/issues/1617).

react-native-keyboard-controller **1.22.4**, React Native 0.81.6, iOS, new architecture.

## Run it

```sh
cd RnkcRepro
npm install
(cd ios && pod install)
npm start          # leave running
npm run ios        # or open ios/RnkcRepro.xcworkspace and Run
```

Nothing to edit. The app drives itself ~1.5s after launch:

1. Focuses **Input A** on the Editor screen, which has a `KeyboardExtender`.
2. Pushes **Settings**, which has no extender. Editor stays mounted underneath, as in a navigation stack.
3. Focuses **Input C** on Settings.

**What you should see:** the Editor's pink `ACCESSORY BAR` above the keyboard on the Settings screen — a screen whose own subtitle says it has no `KeyboardExtender`. The blue footer, positioned off the reported keyboard height, sits a bar's height above the keyboard instead of flush against it.

![The accessory bar rendered on a screen with no extender](evidence/leak.png)

For the correct behaviour, set `SCENARIO = 'control'` in `App.tsx` — same navigation, extender never mounted.

## The cause

`KeyboardExtenderManager` observes `UITextFieldTextDidBeginEditingNotification` with `object:nil` — every text input in the process — and attaches its shared accessory container to whichever input begins editing, as long as `enabled` is `YES`. Nothing scopes that to the extender's own screen.

In a navigation stack the screen underneath stays mounted, so its extender is still alive and still observing. Focus an input on the screen pushed on top and the bar is attached to it.

## Measurements

iPhone 16, iOS 26.5. The bar is 44pt.

| | Reported keyboard height |
| --- | --- |
| `control` — no extender mounted | **335.00** |
| `leak` — extender mounted on the screen below | **379.00** |

`379.00 − 335.00 = 44`, the bar.

## The log

`AccessoryProbe` in `ios/RnkcRepro/AppDelegate.swift` logs every text input, the `inputAccessoryView` it holds, and how many React-managed views that container holds. It registers before any `KeyboardExtender` mounts, so it reports the state UIKit actually used.

```sh
# simulator
xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"'
# device
xcrun devicectl device process launch --device <udid> --console <bundle-id>
```

Run `scripts/variant.sh stock log` first if you also want the extender's own lifecycle lines. That adds a few `NSLog`s to the library and changes no behaviour.

Focusing Input C on Settings (`evidence/leak.log`):

```
UITextField(Input C)@0x…a800 firstResponder=true inputAccessoryView=nil
extender handleDidBeginEditing self=0x12303dc00 enabled=1 input=0x…a800
keyboardHeight=379.00 (willShow)
UITextField(Input C)@0x…a800 inputAccessoryView=ModernContainerView@0x…3000
    frame=(0.0, 0.0, 393.0, 44.0) subviews=3 contentViews=3
```

Read in order:

- Input C starts clean — `inputAccessoryView=nil`.
- The Editor's extender, still mounted and `enabled=1`, receives the notification for C and attaches to it.
- The container has `contentViews=3` and is 44pt tall: live content from a screen the user has navigated away from.
- The reported keyboard height is 379.00, and stays 379.00 after dismissing and refocusing.

Input C is a different object from Input A, so no view recycling is involved.

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

`react-native-reanimated` is a required peer of RNKC 1.22.4; npm resolves it to 4.6.0, which needs RN 0.83–0.87, so it is pinned to 3.19.1.

Device builds need your own signing team; nothing team-specific is committed here.

---

A separate defect in `detachInputAccessoryView` is reproduced on the [`detach-cleanup`](https://github.com/kylesuss/rnkc-keyboardextender-bug-repro/tree/detach-cleanup) branch. It is a different cause and fixing it does not fix this one.
