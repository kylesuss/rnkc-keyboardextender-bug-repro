# `KeyboardExtender` detach repro — react-native-keyboard-controller 1.22.4

Minimal RN app that demonstrates `KeyboardExtenderManager`'s `detachInputAccessoryView`
clearing `inputAccessoryView` only from `[UIResponder current]`, leaving a stale
reference on inputs that have already resigned first responder.

**Status: the mechanism reproduces and is captured in logs. The visible one-frame
flash does not reproduce on an iOS simulator** — see [What we saw](#what-we-saw).

## Run it

```sh
cd RnkcRepro
npm install
(cd ios && pod install)
npm start            # in one shell
npm run ios          # in another
```

The app plays the sequence by itself ~1.5s after launch (`AUTO_RUN` in `App.tsx`).
Set `AUTO_RUN = false` to drive it with the on-screen buttons instead.

Watch the instrumentation while it runs:

```sh
xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"' --style compact
```

`AccessoryProbe` in `ios/RnkcRepro/AppDelegate.swift` walks every `UITextField`/
`UITextView` in the app's windows and logs the `inputAccessoryView` each one holds.
It registers its `textDidBeginEditing` observer before any `KeyboardExtender`
mounts, so it reports the state UIKit actually used when it laid the keyboard out —
before the library's own `handleTextInputDidBeginEditing:` gets a chance to clean up.

## Scenarios

`SCENARIO` in `App.tsx` selects the sequence:

| Scenario | Detach trigger | Focus order |
| --- | --- | --- |
| `toggle-enabled` (default) | `enabled` → `false` | A → B → disable → A |
| `toggle-enabled-dismiss` | `enabled` → `false` | A → B → disable → dismiss keyboard → A |
| `drop-children` | children → `null` | A → B → drop → A |
| `drop-children-dismiss` | children → `null` | A → B → drop → dismiss → A |
| `unmount` | extender unmounted | A → B → unmount → A |
| `unmount-dismiss` | extender unmounted | A → B → unmount → dismiss → A |

## What we saw

### The stale reference is real

`evidence/v1-toggle.probe.log`, trimmed to the interesting lines:

```
--- keyboardDidShow ---                             # 1. A focused
A firstResponder=true  inputAccessoryView=ModernContainerView@0x10060c040 frame=(0,0,402,44)
B firstResponder=false inputAccessoryView=nil

--- keyboardDidShow ---                             # 2. B focused, keyboard stays up
A firstResponder=false inputAccessoryView=ModernContainerView@0x10060c040 frame=(0,0,402,44)
B firstResponder=true  inputAccessoryView=ModernContainerView@0x10060c040 frame=(0,0,402,44)

--- keyboardDidShow ---                             # 3. extender disabled
A firstResponder=false inputAccessoryView=ModernContainerView@0x10060c040 frame=(0,0,402,44)
B firstResponder=true  inputAccessoryView=nil       #    only B, the first responder, is cleared

--- didBeginEditing ---                             # 4. A focused again
A firstResponder=true  inputAccessoryView=ModernContainerView@0x10060c040 frame=(0,0,402,44)
                                                    #    UIKit has already read this
--- keyboardDidShow ---
A firstResponder=true  inputAccessoryView=nil       #    cleared, but a step too late
```

Step 3 is the bug: `detachInputAccessoryView` clears B and never touches A. At
step 4, A is still handing UIKit the extender's shared container.

### No visible flash on a simulator

Every frame of each recording was scanned for the 44pt accessory strip
(`ffmpeg` → per-frame mean colour of the band where the bar sits). Across all
four scenarios the strip appears exactly once, while the extender is enabled and
legitimately showing, and never again:

```
PINK from frame 80
clear from frame 163
total frames: 335
```

`toggle-enabled-dismiss` rules out the obvious explanation that the keyboard
simply never re-laid-out. The recording shows the keyboard fully down (frames
196–243) and back up (frame 246), so UIKit built it from scratch while A held the
stale accessory — and still nothing was drawn.

The clear in `handleTextInputDidBeginEditing:` evidently lands within the same
run-loop turn, before any pixels are committed.

### `unmount` leaks the container permanently

Unmounting the extender removes its notification observers, so nothing is left to
clean up after it. A keeps the container for the rest of the app's life
(`evidence/v3-unmount.probe.log`):

```
A firstResponder=true inputAccessoryView=ModernContainerView@0x110f2eef0 frame=(0.0, 0.0, 402.0, 0.0)
```

Note `frame` height is now `0.0`, not `44.0` — React has emptied and collapsed the
container. That is why there is nothing to see even though the dangling reference
is permanent, and it is probably the reason the height of the strip matters for
whether this is visible at all.

## Environment

| | |
| --- | --- |
| Desktop OS | macOS 26.6.2 (Darwin 25.6.0) |
| Xcode | 26.1.1 (17B100) |
| Device | iPhone 17 Pro simulator |
| iOS | 26.1 |
| React Native | 0.81.6 |
| Architecture | new / Fabric (`RCT_NEW_ARCH_ENABLED=1`) |
| JS engine | Hermes |
| react-native-keyboard-controller | 1.22.4 (pinned exactly) |
| react-native-reanimated | 3.19.1 |

`react-native-reanimated` is a required peer of RNKC 1.22.4. npm resolves the peer
to 4.6.0, which needs RN 0.83–0.87, so it is pinned to 3.19.1 here.

## Not covered

The React Native precondition has not been tested: `RCTTextInputComponentView`'s
`prepareForRecycle` does not clear `inputAccessoryView` on RN 0.81.6 (fixed in
facebook/react-native#52825, landed for 0.82). Putting the inputs in a `FlatList`
and scrolling them out of and back into view would exercise it. That may be what
turns the leak above into something visible.
