import UIKit
import AVKit
import React

// MARK: - Video Player Window Module for Mac Catalyst
// Opens AVPlayerViewController in a separate window on macOS
// This allows using native window controls (close/minimize/maximize)

@objc(VideoPlayerWindow)
class VideoPlayerWindow: NSObject {
  
  private static var playerWindow: UIWindow?
  private static var playerViewController: AVPlayerViewController?
  private static var player: AVPlayer?
  private static var onCloseCallback: RCTResponseSenderBlock?
  private static var progressObserver: Any?
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
      self.openInNewWindow(urlString: urlString, title: title, itemId: itemId, startPosition: startPosition, resolver: resolver, rejecter: rejecter)
      #else
      // On non-Catalyst platforms, just reject - use the React Native player
      rejecter("NOT_SUPPORTED", "VideoPlayerWindow is only supported on macOS", nil)
      #endif
    }
  }
  
  #if targetEnvironment(macCatalyst)
  private func openInNewWindow(urlString: String, title: String, itemId: String, startPosition: Double, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let url = URL(string: urlString) else {
      rejecter("INVALID_URL", "Invalid video URL", nil)
      return
    }
    
    // Store item ID for progress tracking
    VideoPlayerWindow.itemId = itemId
    
    // Create player with HDR support
    let player = AVPlayer(url: url)
    VideoPlayerWindow.player = player
    
    // Enable per-frame HDR display metadata for proper HDR/Dolby Vision rendering
    if #available(iOS 11.2, tvOS 11.2, macCatalyst 13.0, *) {
      player.currentItem?.appliesPerFrameHDRDisplayMetadata = true
    }
    
    // Create player view controller
    let playerVC = AVPlayerViewController()
    playerVC.player = player
    playerVC.allowsPictureInPicturePlayback = true
    playerVC.title = title
    VideoPlayerWindow.playerViewController = playerVC
    
    // Request a new window scene
    let activity = NSUserActivity(activityType: "com.mediora.videoplayer")
    activity.userInfo = ["title": title, "itemId": itemId]
    
    UIApplication.shared.requestSceneSessionActivation(
      nil,
      userActivity: activity,
      options: nil
    ) { error in
      rejecter("WINDOW_ERROR", "Failed to open player window: \(error.localizedDescription)", error)
    }
    
    // Wait a bit for the scene to be created, then present the player
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      if let windowScene = UIApplication.shared.connectedScenes.first(where: {
        $0.activationState == .foregroundActive && $0 != UIApplication.shared.connectedScenes.first
      }) as? UIWindowScene {
        
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = playerVC
        window.makeKeyAndVisible()
        VideoPlayerWindow.playerWindow = window
        
        // Set window title
        windowScene.title = title
        
        // Seek to start position if needed
        if startPosition > 0 {
          let time = CMTime(seconds: startPosition, preferredTimescale: 1)
          player.seek(to: time)
        }
        
        // Enable HDR display metadata now that player item is ready
        if #available(iOS 11.2, tvOS 11.2, macCatalyst 13.0, *) {
          player.currentItem?.appliesPerFrameHDRDisplayMetadata = true
        }
        
        // Start playback
        player.play()
        
        // Observe when player finishes or window closes
        NotificationCenter.default.addObserver(
          forName: UIScene.didDisconnectNotification,
          object: windowScene,
          queue: .main
        ) { _ in
          self.cleanup()
        }
        
        NotificationCenter.default.addObserver(
          forName: .AVPlayerItemDidPlayToEndTime,
          object: player.currentItem,
          queue: .main
        ) { _ in
          self.cleanup()
        }
        
        resolver(["success": true])
      } else {
        // Fallback: present modally if new window creation fails
        self.presentModally(playerVC: playerVC, player: player, startPosition: startPosition, resolver: resolver, rejecter: rejecter)
      }
    }
  }
  
  private func presentModally(playerVC: AVPlayerViewController, player: AVPlayer, startPosition: Double, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard let rootVC = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow })?
      .rootViewController else {
      rejecter("NO_ROOT_VC", "Could not find root view controller", nil)
      return
    }
    
    if startPosition > 0 {
      let time = CMTime(seconds: startPosition, preferredTimescale: 1)
      player.seek(to: time)
    }
    
    player.play()
    
    rootVC.present(playerVC, animated: true) {
      resolver(["success": true, "modal": true])
    }
  }
  #endif
  
  @objc
  func closePlayer(_ resolver: @escaping RCTPromiseResolveBlock,
                   rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.cleanup()
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
  
  private func cleanup() {
    DispatchQueue.main.async {
      VideoPlayerWindow.player?.pause()
      
      if let observer = VideoPlayerWindow.progressObserver {
        VideoPlayerWindow.player?.removeTimeObserver(observer)
        VideoPlayerWindow.progressObserver = nil
      }
      
      VideoPlayerWindow.playerViewController?.dismiss(animated: true)
      VideoPlayerWindow.playerViewController = nil
      VideoPlayerWindow.player = nil
      VideoPlayerWindow.playerWindow?.isHidden = true
      VideoPlayerWindow.playerWindow = nil
      VideoPlayerWindow.itemId = nil
      
      NotificationCenter.default.removeObserver(self)
    }
  }
}
