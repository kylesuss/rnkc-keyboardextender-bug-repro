# `detachInputAccessoryView` leaves the accessory on inputs that already resigned

react-native-keyboard-controller **1.22.4**, React Native 0.81.6, iOS, new architecture.

## Run it

```sh
cd RnkcRepro
npm install
(cd ios && pod install)
scripts/variant.sh stock log      # adds the probe NSLogs, no behaviour change
npm start                          # leave running
npm run ios                        # or open ios/RnkcRepro.xcworkspace and Run
```

Watch the probe output while it runs:

```sh
# simulator
xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"'
# device
xcrun devicectl device process launch --device <udid> --console <bundle-id>
```

Nothing to edit. The app drives itself ~1.5s after launch. One screen, two inputs, one extender — no navigation, no view recycling:

1. Focuses **A**. The bar attaches to A.
2. Focuses **B** without dismissing the keyboard. B gets the bar; A has resigned but still points at the same container.
3. Sets `enabled` to `false`. `detachInputAccessoryView` finds only B and clears it. **A is untouched.**
4. Focuses **A** again. A presents the container the extender believes it detached.

**What to look for:** step 3 in the log. Detach ran, and A is still holding the container.

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

Full output in `evidence/detach.log`, captured on an iPhone 16 / iOS 26.5.

**There is nothing to see on screen** — this bug is only visible in the log. See [On visibility](#on-visibility).

## The cause

[`detachInputAccessoryView`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L206-L223) clears the shared accessory from `[UIResponder current]` and nothing else. [`attachInputAccessoryViewTo:`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L188-L204) keeps no record of which inputs it assigned it to, so there is nothing for detach to walk.

It is called from [`updateEnabledState:`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L284), [`handleTextInputDidBeginEditing:`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L166) and [`prepareForRecycle`](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/af130ca4f9d77061ca098dd4aaec13dda3d5b11f/ios/views/KeyboardExtenderManager.mm#L120). In each, the input holding the accessory may not be the current responder.

`AccessoryProbe` in `ios/RnkcRepro/AppDelegate.swift` is what produces the `[probe]` lines. It logs, for every text field, the `inputAccessoryView` it holds and how many React-managed views that container still has, and registers before any `KeyboardExtender` mounts so it reports the state UIKit actually used.

## On visibility

With a single extender there is **no visible symptom**, and this repro does not produce one. At step 4 the extender's own `handleTextInputDidBeginEditing:` takes the disabled path and clears A within the same run loop turn, before the keyboard lays out — the reported keyboard height at step 4 is correct.

It stops being harmless with two extenders mounted at once, where the input holding the bar is not the current responder at the moment one of them is disabled. That case is not modelled here; this repro isolates the detach itself.

## The candidate fix

```sh
scripts/variant.sh detach-patch log
```

Tracks attached inputs in a weak `NSHashTable` and clears from all of them on detach. Rebuild and re-run: step 3 now clears both (`evidence/detach-with-patch.log`).

```
3: enabled=NO  A inputAccessoryView=nil
               B inputAccessoryView=nil
```

`scripts/variant.sh stock` puts it back.

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
