# `detachInputAccessoryView` leaves the accessory on inputs that already resigned

react-native-keyboard-controller **1.22.4**, iOS, new architecture.

> This branch reproduces the detach cleanup bug. The `main` branch reproduces a
> different one — an enabled extender attaching its bar to inputs on other screens
> ([#1617](https://github.com/kirillzyusko/react-native-keyboard-controller/issues/1617)).

[`detachInputAccessoryView`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L206-L223) clears the shared accessory from `[UIResponder current]` and nothing else, and [`attachInputAccessoryViewTo:`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L188-L204) keeps no record of which inputs it assigned it to. An input that has already resigned first responder keeps pointing at the container after a detach that believed it cleaned up.

## Run it

```sh
cd RnkcRepro
npm install
(cd ios && pod install)
npm start                 # one shell
npm run ios               # another — or build to a device from Xcode
```

The app plays the sequence itself ~1.5s after launch. Watch the probe output:

```sh
# simulator
xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"'
# device
xcrun devicectl device process launch --device <udid> --console <bundle-id>
```

`AccessoryProbe` in `ios/RnkcRepro/AppDelegate.swift` logs, for every text field, the `inputAccessoryView` it holds and how many React-managed views that container still has. It registers before any `KeyboardExtender` mounts, so it reports the state UIKit actually used.

For the `extender handleDidBeginEditing …` lines, run `scripts/variant.sh stock log` first — that adds a few `NSLog`s to the library and changes no behaviour.

## The sequence

One screen, two inputs, one extender. No navigation, no view recycling.

1. Focus **A**. The bar attaches to A.
2. Focus **B** without dismissing the keyboard. B gets the bar; A has resigned but still points at the same container.
3. Set `enabled` to `false`. `detachInputAccessoryView` finds only B and clears it. **A is untouched.**
4. Focus **A** again. A presents the container the extender believes it detached.

From `evidence/detach.log`, iPhone 16 / iOS 26.5:

```
1: focus A     A inputAccessoryView=ModernContainerView@0x…bc00
               B inputAccessoryView=nil

2: focus B     A inputAccessoryView=ModernContainerView@0x…bc00   (resigned, still holding)
               B inputAccessoryView=ModernContainerView@0x…bc00

3: enabled=NO  A inputAccessoryView=ModernContainerView@0x…bc00   <-- missed
               B inputAccessoryView=nil                           <-- cleared

4: focus A     A inputAccessoryView=ModernContainerView@0x…bc00
               extender handleDidBeginEditing enabled=0
               A inputAccessoryView=nil                           <-- cleared here instead
```

Step 3 is the bug: detach ran and left A holding the container.

## On visibility

With a single extender there is usually **no visible symptom**, and this repro does not produce one. At step 4 the extender's own `handleTextInputDidBeginEditing:` takes the disabled path and clears A within the same run loop turn, before the keyboard lays out — the reported keyboard height at step 4 is correct.

It stops being harmless with two extenders mounted at once, where the input holding the bar is not the current responder at the moment one of them is disabled. That case is not modelled here; this repro isolates the detach itself.

## The candidate fix

`scripts/variant.sh detach-patch` applies the change described in the issue: track attached inputs in a weak `NSHashTable` and clear from all of them on detach. Re-run and step 3 clears both A and B.

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
