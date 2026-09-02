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

// When true, the app plays the scenario by itself ~1.5s after launch.
const AUTO_RUN = true;

// 'leak'    — focus an input under the extender, then push a screen that has none.
// 'control' — same navigation with the extender never mounted. Baseline height.
const SCENARIO: 'leak' | 'control' = 'leak';

type Action = 'focusA' | 'focusC' | 'dismiss' | 'push' | 'unmount' | 'noop';

// [delay in ms from mount, on-screen label, what to do]
const SCENARIOS: Record<string, [number, string, Action][]> = {
  leak: [
    [1500, '1: focus A (extender attaches)', 'focusA'],
    [4000, '2: push Settings', 'push'],
    [6500, '3: focus C', 'focusC'],
    [9500, '4: dismiss', 'dismiss'],
    [11500, '5: focus C again', 'focusC'],
    [14500, 'done', 'noop'],
  ],
  control: [
    [500, '0: no extender', 'unmount'],
    [1500, '1: focus A', 'focusA'],
    [4000, '2: push Settings', 'push'],
    [6500, '3: focus C', 'focusC'],
    [9500, '4: dismiss', 'dismiss'],
    [11500, '5: focus C again', 'focusC'],
    [14500, 'done', 'noop'],
  ],
};

/**
 * Reported keyboard height, as an app positioning a footer would read it.
 *
 * Deliberately `keyboardWillShow` and not `keyboardWillChangeFrame`: an app
 * positions its footer once, when the keyboard comes up.
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
  const [pushed, setPushed] = useState(false);
  const [extenderMounted, setExtenderMounted] = useState(true);
  const [step, setStep] = useState('idle');

  const inputA = useRef<TextInput>(null);
  const inputC = useRef<TextInput>(null);

  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (!AUTO_RUN) {
      return;
    }

    const actions: Record<Action, () => void> = {
      focusA: () => inputA.current?.focus(),
      focusC: () => inputC.current?.focus(),
      dismiss: () => Keyboard.dismiss(),
      push: () => setPushed(true),
      unmount: () => setExtenderMounted(false),
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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Editor</Text>
        <Text style={styles.subtitle}>The KeyboardExtender lives here.</Text>
        {status}

        <TextInput
          ref={inputA}
          style={styles.input}
          placeholder="Input A"
          placeholderTextColor="#888"
        />

        <View style={styles.buttons}>
          <Button title="Focus A" onPress={() => inputA.current?.focus()} />
          <Button title="Push Settings" onPress={() => setPushed(true)} />
        </View>

        {extenderMounted ? (
          <KeyboardExtender>
            <View style={styles.bar}>
              <Text style={styles.barText}>ACCESSORY BAR</Text>
            </View>
          </KeyboardExtender>
        ) : null}
      </SafeAreaView>

      {/* Settings is pushed on top and Editor stays mounted underneath, the way a
          navigation stack behaves. That is the whole point: the extender below is
          still alive and still observing. */}
      {pushed ? (
        <SafeAreaView style={[styles.screen, styles.pushed]}>
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
            <Button title="Pop" onPress={() => setPushed(false)} />
          </View>

          {/* Positioned off the reported keyboard height. If that height includes a
              leaked accessory bar, this sits a bar's height too high. */}
          <View style={[styles.footer, {bottom: keyboardHeight}]}>
            <Text style={styles.footerText}>
              FOOTER — should sit flush on the keyboard
            </Text>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

// KeyboardProvider must wrap the tree for KeyboardExtender to work.
export default function App() {
  return (
    <KeyboardProvider>
      <Repro />
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  screen: {flex: 1, padding: 16},
  pushed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
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
