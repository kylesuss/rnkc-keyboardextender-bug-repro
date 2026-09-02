import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "RnkcRepro",
      in: window,
      launchOptions: launchOptions
    )

    AccessoryProbe.start()

    return true
  }

}

/// Instrumentation, not part of the bug. Logs every `UITextField`/`UITextView` in
/// the app's windows together with the `inputAccessoryView` it currently holds, so
/// a stale accessory can be observed directly instead of having to catch a
/// one-frame flash on screen.
///
/// Watch it with:
///   xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[probe]"'
enum AccessoryProbe {
  static func start() {
    // Registered before any KeyboardExtender mounts, so this observer runs before
    // the library's own `handleTextInputDidBeginEditing:` and reports the state
    // UIKit actually used when it laid the keyboard out.
    for name in [
      UITextField.textDidBeginEditingNotification,
      UITextView.textDidBeginEditingNotification,
    ] {
      NotificationCenter.default.addObserver(
        forName: name, object: nil, queue: .main
      ) { _ in
        dump(reason: "didBeginEditing")
      }
    }

    // A second look once the run loop has settled, so we can tell a stale accessory
    // that UIKit used from one the library cleared a moment later.
    NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main
    ) { _ in
      dump(reason: "keyboardDidShow")
    }
  }

  static func dump(reason: String) {
    var lines: [String] = []

    for window in UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
    {
      walk(window, into: &lines)
    }

    NSLog("[probe] --- %@ ---", reason)
    if lines.isEmpty {
      NSLog("[probe] no text inputs found")
    }
    for line in lines {
      NSLog("[probe] %@", line)
    }
  }

  private static func walk(_ view: UIView, into lines: inout [String]) {
    let accessory: UIView?
    let label: String

    if let field = view as? UITextField {
      accessory = field.inputAccessoryView
      label = "UITextField(\(field.placeholder ?? field.text ?? "?"))"
    } else if let textView = view as? UITextView {
      accessory = textView.inputAccessoryView
      label = "UITextView(\(textView.text ?? "?"))"
    } else {
      for subview in view.subviews { walk(subview, into: &lines) }
      return
    }

    let accessoryDescription: String
    if let accessory {
      accessoryDescription =
        "\(type(of: accessory))@\(Unmanaged.passUnretained(accessory).toOpaque()) "
        + "frame=\(accessory.frame) subviews=\(accessory.subviews.count)"
    } else {
      accessoryDescription = "nil"
    }

    lines.append(
      "\(label) firstResponder=\(view.isFirstResponder) inputAccessoryView=\(accessoryDescription)"
    )

    for subview in view.subviews { walk(subview, into: &lines) }
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
