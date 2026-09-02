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

// When true, the app plays the repro sequence by itself a second after launch.
const AUTO_RUN = true;

// Which detach trigger and focus order to play. See SCENARIOS below.
const SCENARIO: keyof typeof SCENARIOS = 'toggle-enabled';

type Action =
  | 'focusA'
  | 'focusB'
  | 'dismiss'
  | 'disable'
  | 'dropChildren'
  | 'unmount'
  | 'noop';

// [delay in ms from mount, on-screen label, what to do]
const SCENARIOS: Record<string, [number, string, Action][]> = {
  // The sequence from the issue: A keeps a reference to the accessory while B
  // holds focus, so disabling the extender only clears it from B.
  'toggle-enabled': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: disable extender', 'disable'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
  // Same, but the keyboard is fully dismissed before A is focused again, so UIKit
  // builds the keyboard from scratch and has to read `inputAccessoryView`.
  'toggle-enabled-dismiss': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: disable extender', 'disable'],
    [8000, '4: dismiss keyboard', 'dismiss'],
    [10500, '5: focus A again', 'focusA'],
    [13500, 'done', 'noop'],
  ],
  // Detach triggered by emptying the extender instead of disabling it.
  'drop-children': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: drop children', 'dropChildren'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
  'drop-children-dismiss': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: drop children', 'dropChildren'],
    [8000, '4: dismiss keyboard', 'dismiss'],
    [10500, '5: focus A again', 'focusA'],
    [13500, 'done', 'noop'],
  ],
  // Unmounting the extender removes its text-input observers too, so nothing is
  // left to clear the accessory A is still holding.
  unmount: [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: unmount extender', 'unmount'],
    [9000, '4: focus A again', 'focusA'],
    [12000, 'done', 'noop'],
  ],
  'unmount-dismiss': [
    [1500, '1: focus A', 'focusA'],
    [4000, '2: focus B', 'focusB'],
    [6500, '3: unmount extender', 'unmount'],
    [8000, '4: dismiss keyboard', 'dismiss'],
    [10500, '5: focus A again', 'focusA'],
    [13500, 'done', 'noop'],
  ],
};

function Repro() {
  const [enabled, setEnabled] = useState(true);
  const [hasChildren, setHasChildren] = useState(true);
  const [mounted, setMounted] = useState(true);
  const inputA = useRef<TextInput>(null);
  const inputB = useRef<TextInput>(null);

  const [step, setStep] = useState('idle');

  // Runs the repro steps on a timer so the sequence is identical on every launch —
  // the flash it is looking for lasts a frame and is easy to miss by hand.
  // Flip AUTO_RUN to false to drive it with the buttons instead.
  useEffect(() => {
    if (!AUTO_RUN) {
      return;
    }

    const actions = {
      focusA: () => inputA.current?.focus(),
      focusB: () => inputB.current?.focus(),
      dismiss: () => Keyboard.dismiss(),
      disable: () => setEnabled(false),
      dropChildren: () => setHasChildren(false),
      unmount: () => setMounted(false),
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

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>KeyboardExtender detach repro</Text>
      <Text style={styles.state}>
        enabled: {String(enabled)} · children: {String(hasChildren)} · step:{' '}
        {step}
      </Text>

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
      </View>

      {mounted ? (
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

export default function App() {
  return (
    <KeyboardProvider>
      <Repro />
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff', padding: 16},
  title: {fontSize: 18, fontWeight: '600', marginBottom: 4},
  state: {fontSize: 13, color: '#555', marginBottom: 16},
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
});
