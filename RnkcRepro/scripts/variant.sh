#!/bin/bash
# variant.sh a|b|c|d [log] — select which patches are applied to node_modules.
#
#   a  neither patch (stock RN 0.81.6 + RNKC 1.22.4)
#   b  React Native only  (facebook/react-native#52825)
#   c  react-native-keyboard-controller only
#   d  both
#
# `log` additionally applies the lifecycle logging patches. Those are diagnostics
# only — they add NSLog calls and change no behaviour. They go on first so their
# hunks do not fight the behaviour patches over context lines.
#
# Pristine sources are kept as `.pristine` copies, not `.orig`: `patch` writes its
# own `.orig` backups and would otherwise overwrite them.
set -euo pipefail

cd "$(dirname "$0")/.."

RN=node_modules/react-native/React/Fabric/Mounting/ComponentViews/TextInput/RCTTextInputComponentView.mm
KC=node_modules/react-native-keyboard-controller/ios/views/KeyboardExtenderManager.mm

for f in "$RN" "$KC"; do
  if [ ! -f "$f.pristine" ]; then
    cp "$f" "$f.pristine"
  fi
  cp "$f.pristine" "$f"
done

apply() {
  patch -p1 --quiet --forward < "patches-available/$1"
}

if [ "${2:-}" = "log" ]; then
  apply rnkc-lifecycle-logging.patch
  apply rn-textinput-lifecycle-logging.patch
  echo "  + lifecycle logging (extender + RCTTextInputComponentView)"
fi

case "${1:-}" in
  a) echo "variant a: no patches" ;;
  b)
    apply rn-52825-clear-inputAccessoryView-on-recycle.patch
    echo "variant b: RN patch only"
    ;;
  c)
    apply rnkc-detach-all-attached-inputs.patch
    echo "variant c: RNKC patch only"
    ;;
  d)
    apply rn-52825-clear-inputAccessoryView-on-recycle.patch
    apply rnkc-detach-all-attached-inputs.patch
    echo "variant d: both patches"
    ;;
  *)
    echo "usage: $0 a|b|c|d [log]" >&2
    exit 1
    ;;
esac

# `inputAccessoryView = nil` appears elsewhere in the RN file, so check the body of
# prepareForRecycle specifically.
if awk '/- \(void\)prepareForRecycle/,/^}/' "$RN" | grep -q "inputAccessoryView = nil"; then
  echo "  RN   patched"
else
  echo "  RN   stock"
fi

if grep -q "_attachedInputs" "$KC"; then
  echo "  RNKC patched"
else
  echo "  RNKC stock"
fi
