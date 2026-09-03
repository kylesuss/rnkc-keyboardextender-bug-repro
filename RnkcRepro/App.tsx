import React, {useEffect, useRef, useState} from 'react';
import {
  Button,
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

// When true, the app plays the sequence by itself ~1.5s after launch.
const AUTO_RUN = true;

// [delay in ms from mount, on-screen label, what to do]
//
// One screen, two inputs, one extender. No navigation, no view recycling.
// B takes focus from A, so by the time the extender is disabled the only input
// `[UIResponder current]` can see is B — and A is missed.
const SCRIPT: [number, string, Action][] = [
  [1500, '1: focus A (bar attaches to A)', 'focusA'],
  [4000, '2: focus B (A has resigned)', 'focusB'],
  [6500, '3: disable extender', 'disable'],
  [9000, '4: focus A again', 'focusA'],
  [12000, 'done', 'noop'],
];

type Action = 'focusA' | 'focusB' | 'disable' | 'noop';

function Repro() {
  const [enabled, setEnabled] = useState(true);
  const [step, setStep] = useState('idle');

  const inputA = useRef<TextInput>(null);
  const inputB = useRef<TextInput>(null);

  useEffect(() => {
    if (!AUTO_RUN) {
      return;
    }

    const actions: Record<Action, () => void> = {
      focusA: () => inputA.current?.focus(),
      focusB: () => inputB.current?.focus(),
      disable: () => setEnabled(false),
      noop: () => {},
    };

    const timers = SCRIPT.map(([at, label, action]) =>
      setTimeout(() => {
        setStep(label);
        actions[action]();
      }, at),
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>detachInputAccessoryView repro</Text>
      <Text style={styles.state}>
        enabled: {String(enabled)}
        {'\n'}step: {step}
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
        <Button title="Disable extender" onPress={() => setEnabled(false)} />
      </View>

      <KeyboardExtender enabled={enabled}>
        <View style={styles.bar}>
          <Text style={styles.barText}>ACCESSORY BAR</Text>
        </View>
      </KeyboardExtender>
    </SafeAreaView>
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
  root: {flex: 1, backgroundColor: '#fff', padding: 16},
  title: {fontSize: 20, fontWeight: '700'},
  state: {fontSize: 13, color: '#111', marginTop: 4, marginBottom: 16},
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
