#!/bin/bash
# variant.sh stock|detach-patch [log]
#
#   stock         react-native-keyboard-controller 1.22.4 as published
#   detach-patch  plus the "clear from every attached input" change to
#                 detachInputAccessoryView — included to show it does not
#                 address this bug
#
# `log` adds the extender lifecycle NSLogs, which is what produces the
# `extender handleDidBeginEditing self=… enabled=… input=…` lines quoted in the
# README. Diagnostics only; no behaviour change.
#
# The pristine source is kept as `.pristine`, not `.orig`: `patch` writes its own
# `.orig` backups and would overwrite it.
set -euo pipefail

cd "$(dirname "$0")/.."

KC=node_modules/react-native-keyboard-controller/ios/views/KeyboardExtenderManager.mm

if [ ! -f "$KC.pristine" ]; then
  cp "$KC" "$KC.pristine"
fi
cp "$KC.pristine" "$KC"

apply() {
  patch -p1 --quiet --forward < "patches-available/$1"
}

if [ "${2:-}" = "log" ]; then
  apply rnkc-lifecycle-logging.patch
  echo "  + extender lifecycle logging"
fi

case "${1:-}" in
  stock) echo "stock 1.22.4" ;;
  detach-patch)
    apply rnkc-detach-all-attached-inputs.patch
    echo "with detach patch"
    ;;
  *)
    echo "usage: $0 stock|detach-patch [log]" >&2
    exit 1
    ;;
esac
