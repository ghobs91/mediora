import UIKit
import AVKit
import React

// MARK: - Native video player module for Mac Catalyst
// Presents AVPlayerViewController over the app's own view controller so macOS
// gets the system player UI. Playback stays exclusive: the React Native player
// is never mounted while this one owns the stream, so audio can only come from
// one source. (A separate UIWindow is not used: the app declares
// UIApplicationSupportsMultipleScenes = false, so requesting a new scene always
// failed and left two players running at once.)

@objc(VideoPlayerWindow)
class VideoPlayerWindow: NSObject {

  private static var playerViewController: AVPlayerViewController?
  private static var player: AVPlayer?
  private static var endObserver: NSObjectProtocol?
  private static var itemId: String?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  func openPlayer(_ urlString: String,
                  title: String,
                  itemId: String,
                  startPosition: Double,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {

    DispatchQueue.main.async {
      #if targetEnvironment(macCatalyst)
      self.presentNativePlayer(
        urlString: urlString,
        title: title,
        itemId: itemId,
        startPosition: startPosition,
        resolver: resolver,
        rejecter: rejecter
      )
      #else
      // On non-Catalyst platforms, just reject - use the React Native player
      rejecter("NOT_SUPPORTED", "VideoPlayerWindow is only supported on macOS", nil)
      #endif
    }
  }

  #if targetEnvironment(macCatalyst)
  private func presentNativePlayer(urlString: String,
                                   title: String,
                                   itemId: String,
                                   startPosition: Double,
                                   resolver: @escaping RCTPromiseResolveBlock,
                                   rejecter: @escaping RCTPromiseRejectBlock) {

    // Never leave a previous player running behind the new one.
    dismissExistingPlayer()

    guard let url = URL(string: urlString) else {
      rejecter("INVALID_URL", "Invalid video URL", nil)
      return
    }

    guard let presenter = VideoPlayerWindow.topPresenter(), presenter.view.window != nil else {
      rejecter("NO_PRESENTER", "Could not find a view controller to present the player from", nil)
      return
    }

    let player = AVPlayer(url: url)

    let playerVC = PlayerViewController()
    playerVC.player = player
    playerVC.allowsPictureInPicturePlayback = true
    playerVC.title = title
    playerVC.onDismiss = { [weak self, weak playerVC] in
      // The user closed the player with the system Done button (or PiP ended).
      guard let playerVC else { return }
      self?.stopPlayback(ifCurrent: playerVC)
    }

    VideoPlayerWindow.player = player
    VideoPlayerWindow.playerViewController = playerVC
    VideoPlayerWindow.itemId = itemId

    // Dismiss once the item finishes so the player doesn't linger on screen.
    VideoPlayerWindow.endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: player.currentItem,
      queue: .main
    ) { [weak self, weak playerVC] _ in
      guard let playerVC else { return }
      self?.dismissExistingPlayer(ifCurrent: playerVC)
    }

    // Resolve only after the player is actually on screen: the JS side uses
    // this to decide whether it may fall back to its own player.
    presenter.present(playerVC, animated: true) {
      if startPosition > 0 {
        let time = CMTime(seconds: startPosition, preferredTimescale: 1)
        player.seek(to: time)
      }
      player.play()
      resolver(["success": true, "modal": true])
    }
  }

  private static func topPresenter() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }

    let keyWindow = windows.first(where: { $0.isKeyWindow })
      ?? UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first(where: { $0.isKeyWindow })

    guard var top = keyWindow?.rootViewController else {
      return nil
    }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }
  #endif

  @objc
  func closePlayer(_ resolver: @escaping RCTPromiseResolveBlock,
                   rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.dismissExistingPlayer()
      resolver(["success": true])
    }
  }

  @objc
  func getPlaybackPosition(_ resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let player = VideoPlayerWindow.player else {
        rejecter("NO_PLAYER", "No active player", nil)
        return
      }

      let currentTime = player.currentTime().seconds
      let duration = player.currentItem?.duration.seconds ?? 0

      resolver([
        "currentTime": currentTime.isNaN ? 0 : currentTime,
        "duration": duration.isNaN ? 0 : duration,
        "itemId": VideoPlayerWindow.itemId ?? ""
      ])
    }
  }

  @objc
  func isSupported(_ resolver: @escaping RCTPromiseResolveBlock,
                   rejecter: @escaping RCTPromiseRejectBlock) {
    #if targetEnvironment(macCatalyst)
    resolver(true)
    #else
    resolver(false)
    #endif
  }

  /// Stops playback and releases the player. Does not touch presentation.
  /// When `playerVC` is given, the call is ignored if a newer player has since
  /// taken over (a stale PiP/dismissal callback must not kill the new stream).
  private func stopPlayback(ifCurrent playerVC: AVPlayerViewController? = nil) {
    if let playerVC, VideoPlayerWindow.playerViewController !== playerVC {
      return
    }

    VideoPlayerWindow.player?.pause()

    if let observer = VideoPlayerWindow.endObserver {
      NotificationCenter.default.removeObserver(observer)
      VideoPlayerWindow.endObserver = nil
    }

    VideoPlayerWindow.playerViewController = nil
    VideoPlayerWindow.player = nil
    VideoPlayerWindow.itemId = nil
  }

  /// Dismisses the on-screen player (if any) and releases it. The player is
  /// stopped first so no audio can continue while the modal is going away.
  private func dismissExistingPlayer(ifCurrent playerVC: AVPlayerViewController? = nil) {
    if let playerVC, VideoPlayerWindow.playerViewController !== playerVC {
      return
    }

    guard let current = VideoPlayerWindow.playerViewController else {
      stopPlayback()
      return
    }

    stopPlayback()

    if current.presentingViewController != nil && !current.isBeingDismissed {
      current.dismiss(animated: true)
    }
  }
}

#if targetEnvironment(macCatalyst)
/// AVPlayerViewController that reports when the system Done button closes it.
private final class PlayerViewController: AVPlayerViewController, AVPlayerViewControllerDelegate {
  var onDismiss: (() -> Void)?
  private var isInPictureInPicture = false

  override func viewDidLoad() {
    super.viewDidLoad()
    delegate = self
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    // Still attached to a presenter means something was pushed on top of the
    // player. While picture in picture is active the player controller is
    // dismissed by the system but playback continues, so don't tear it down.
    if presentingViewController == nil && !isInPictureInPicture {
      onDismiss?()
    }
  }

  func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
    isInPictureInPicture = true
  }

  func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
    isInPictureInPicture = false
    onDismiss?()
  }
}
#endif
