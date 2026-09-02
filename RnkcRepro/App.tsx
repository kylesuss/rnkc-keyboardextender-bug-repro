import React, {useEffect, useRef, useState} from 'react';
import {
  Button,
  Keyboard,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardExtender,
  KeyboardProvider,
} from 'react-native-keyboard-controller';

// When true, the app plays the selected scenario by itself a second after launch.
const AUTO_RUN = true;

// Which sequence to play. See SCENARIOS below.
const SCENARIO: keyof typeof SCENARIOS = 'toggle-enabled';

type Action =
  | 'focusA'
  | 'focusB'
  | 'focusC'
  | 'dismiss'
  | 'disable'
  | 'dropChildren'
  | 'unmount'
  | 'toSettings'
  | 'toEditor'
  | 'noop';

// [delay in ms from mount, on-screen label, what to do]
const SCENARIOS: Record<string, [number, string, Action][]> = {
  // --- Bug A: does a leaked accessory survive recycling and inflate the keyboard
  //     frame on a later screen that has no extender of its own?
  //
  // Focusing A attaches the extender's accessory to it. Leaving the screen
  // unmounts that input, so Fabric returns its RCTTextInputComponentView to the
  // recycle pool — on RN 0.81.6 `prepareForRecycle` does not clear
  // `inputAccessoryView`, so the bar rides along. Settings then mounts an input
  // that may be handed that same recycled view.
  navigate: [
    [1500, '1: focus A (extender attaches)', 'focusA'],
    [4000, '2: go to Settings', 'toSettings'],
    [6500, '3: focus C', 'focusC'],
    [9500, '4: dismiss', 'dismiss'],
    [11500, '5: focus C again', 'focusC'],
    [14500, 'done', 'noop'],
  ],
  // The one that matters. B is focused before leaving, so A is no longer the first
  // responder when the extender unmounts — its cleanup clears B and leaves A holding
  // the accessory. A then goes into the recycle pool with the bar still attached.
  // This is Bug B (detach misses A) handing Bug A its precondition.
  'navigate-after-blur': [
    [1500, '1: focus A (extender attaches)', 'focusA'],
    [4000, '2: focus B (A keeps the accessory)', 'focusB'],
    [6500, '3: go to Settings', 'toSettings'],
    [9000, '4: focus C', 'focusC'],
    [12000, '5: dismiss', 'dismiss'],
    [14000, '6: focus C again', 'focusC'],
    [17000, 'done', 'noop'],
  ],
  // Baseline for the above: same navigation, but the extender is unmounted before
  // anything is focused, so no accessory is ever attached. Whatever keyboard height
  // this reports on Settings is the correct one.
  'navigate-control': [
    [500, '0: unmount extender', 'unmount'],
    [1500, '1: focus A (no accessory)', 'focusA'],
    [4000, '2: go to Settings', 'toSettings'],
    [6500, '3: focus C', 'focusC'],
    [9500, '4: dismiss', 'dismiss'],
    [11500, '5: focus C again', 'focusC'],
    [14500, 'done', 'noop'],
  ],
  // Navigate back afterwards, to see whether the inflation follows the pool around.
  'navigate-round-trip': [
    [1500, '1: focus A (extender attaches)', 'focusA'],
    [4000, '2: go to Settings', 'toSettings'],
    [6500, '3: focus C', 'focusC'],
    [9000, '4: back to Editor', 'toEditor'],
    [11000, '5: focus B', 'focusB'],
    [13500, '6: go to Settings', 'toSettings'],
    [15500, '7: focus C', 'focusC'],
    [18500, 'done', 'noop'],
  ],

  // --- Bug B: detach only clears the first responder, so an input that has
  //     already resigned keeps pointing at the container the extender empties.
  //     These are the original scenarios; they need no recycling.
  'toggle-enabled': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: disable extender', 'disable'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
  'toggle-enabled-dismiss': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: disable extender', 'disable'],
    [8000, '4: dismiss keyboard', 'dismiss'],
    [10500, '5: focus A again', 'focusA'],
    [13500, 'done', 'noop'],
  ],
  'drop-children': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: drop children', 'dropChildren'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
  unmount: [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: unmount extender', 'unmount'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
};

/**
 * Reported keyboard height, as an app positioning a footer would read it.
 *
 * Deliberately reads `keyboardWillShow` and not `keyboardWillChangeFrame`: an app
 * positions its footer once, when the keyboard comes up. If that one reading is
 * inflated by a leaked accessory bar, the footer stays wrong for as long as the
 * keyboard is up. Listening to every frame change would silently self-correct and
 * hide the bug.
 */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

function Repro() {
  const [screen, setScreen] = useState<'editor' | 'settings'>('editor');
  const [enabled, setEnabled] = useState(true);
  const [hasChildren, setHasChildren] = useState(true);
  const [extenderMounted, setExtenderMounted] = useState(true);
  const [step, setStep] = useState('idle');

  const inputA = useRef<TextInput>(null);
  const inputB = useRef<TextInput>(null);
  const inputC = useRef<TextInput>(null);

  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (!AUTO_RUN) {
      return;
    }

    const actions: Record<Action, () => void> = {
      focusA: () => inputA.current?.focus(),
      focusB: () => inputB.current?.focus(),
      focusC: () => inputC.current?.focus(),
      dismiss: () => Keyboard.dismiss(),
      disable: () => setEnabled(false),
      dropChildren: () => setHasChildren(false),
      unmount: () => setExtenderMounted(false),
      toSettings: () => setScreen('settings'),
      toEditor: () => setScreen('editor'),
      noop: () => {},
    };

    const timers = SCENARIOS[SCENARIO].map(([at, label, action]) =>
      setTimeout(() => {
        setStep(label);
        actions[action]();
      }, at),
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  const status = (
    <Text style={styles.state}>
      {SCENARIO} · step: {step}
      {'\n'}keyboard height: {keyboardHeight.toFixed(2)}
    </Text>
  );

  if (screen === 'settings') {
    // `key` forces a real unmount/remount of the whole screen. Without it React
    // reconciles the two screens in place — Input C reuses Input A's host view
    // directly, which leaks the accessory without ever going through the recycle
    // pool, and is not what a navigation library does.
    return (
      <SafeAreaView key="settings" style={styles.root}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>No KeyboardExtender on this screen.</Text>
        {status}

        <TextInput
          ref={inputC}
          style={styles.input}
          placeholder="Input C"
          placeholderTextColor="#888"
        />

        <View style={styles.buttons}>
          <Button title="Focus C" onPress={() => inputC.current?.focus()} />
          <Button title="Back to Editor" onPress={() => setScreen('editor')} />
        </View>

        {/* Fixed footer, positioned off the reported keyboard height — exactly what
            goes wrong if that height includes a leaked accessory bar. */}
        <View style={[styles.footer, {bottom: keyboardHeight}]}>
          <Text style={styles.footerText}>
            FOOTER — should sit flush on the keyboard
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView key="editor" style={styles.root}>
      <Text style={styles.title}>Editor</Text>
      <Text style={styles.subtitle}>KeyboardExtender lives on this screen.</Text>
      {status}

      <TextInput
        ref={inputA}
        style={styles.input}
        placeholder="Input A"
        placeholderTextColor="#888"
      />
      <TextInput
        ref={inputB}
        style={styles.input}
        placeholder="Input B"
        placeholderTextColor="#888"
      />

      <View style={styles.buttons}>
        <Button title="Focus A" onPress={() => inputA.current?.focus()} />
        <Button title="Focus B" onPress={() => inputB.current?.focus()} />
        <Button
          title={enabled ? 'Disable extender' : 'Enable extender'}
          onPress={() => setEnabled(v => !v)}
        />
        <Button
          title={hasChildren ? 'Drop children' : 'Restore children'}
          onPress={() => setHasChildren(v => !v)}
        />
        <Button
          title={extenderMounted ? 'Unmount extender' : 'Remount extender'}
          onPress={() => setExtenderMounted(v => !v)}
        />
        <Button title="Go to Settings" onPress={() => setScreen('settings')} />
      </View>

      {extenderMounted ? (
        <KeyboardExtender enabled={enabled}>
          {hasChildren ? (
            <View style={styles.bar}>
              <Text style={styles.barText}>ACCESSORY BAR</Text>
            </View>
          ) : null}
        </KeyboardExtender>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff', padding: 16},
  title: {fontSize: 20, fontWeight: '700'},
  subtitle: {fontSize: 13, color: '#555', marginBottom: 4},
  state: {fontSize: 13, color: '#111', marginBottom: 16},
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  buttons: {gap: 8, alignItems: 'flex-start'},
  bar: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#ff2d55',
  },
  barText: {color: '#fff', fontWeight: '700', fontSize: 16},
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#007aff',
    backgroundColor: '#d6e9ff',
  },
  footerText: {fontWeight: '700', color: '#003b80'},
});

// KeyboardProvider must wrap the tree for KeyboardExtender to work.
export default function App() {
  return (
    <KeyboardProvider>
      <Repro />
    </KeyboardProvider>
  );
}
