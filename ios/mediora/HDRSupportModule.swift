import Foundation
import AVFoundation
import AVKit
import React

// MARK: - HDR Support Module
// Reports platform video-range capabilities to the Jellyfin server API
// and configures AVPlayer for native HDR/Dolby Vision playback on tvOS/iOS

@objc(HDRSupportModule)
class HDRSupportModule: NSObject {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  /// Returns the list of video range types the device can actually render right now.
  /// These strings match what Jellyfin expects in the DeviceProfile VideoRangeType condition.
  ///
  /// On tvOS, AVPlayer.eligibleForHDRPlayback reflects HDMI hardware capability, not the
  /// current display output mode. If the Apple TV is outputting SDR (e.g. the user has not
  /// set a fixed HDR format and "Match Dynamic Range" has not yet triggered a switch),
  /// playing an HDR HLS stream produces a black video frame while audio continues.
  /// We therefore check UIScreen.currentEDRHeadroom on tvOS 16+ to verify the display
  /// is actively in an HDR/EDR output mode before advertising HDR support to the server.
  @objc
  func getSupportedVideoRanges(_ resolver: @escaping RCTPromiseResolveBlock,
                                rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      var ranges: [String] = ["SDR"] // SDR is always supported

      if #available(iOS 14.0, tvOS 14.0, *) {
        guard AVPlayer.eligibleForHDRPlayback else {
          resolver(ranges)
          return
        }

        #if os(tvOS)
        // On tvOS 16+, verify the display is currently outputting in HDR mode.
        // currentEDRHeadroom > 1.0 means EDR/HDR output is active.
        // If it is 1.0 the display is in SDR mode and we must not advertise HDR
        // to the server, otherwise the SDR display cannot render the HDR stream.
        if #available(tvOS 16.0, *) {
          let screen = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.screen
          let headroom = screen?.currentEDRHeadroom ?? 1.0
          guard headroom > 1.0 else {
            resolver(ranges)
            return
          }
        }
        // tvOS 15.x: no EDR headroom API — trust eligibleForHDRPlayback.
        #endif

        ranges.append(contentsOf: [
          "HLG",
          "HDR10",
          "HDR10Plus",
          "DOVI",
          "DOVIWithSDR",
          "DOVIWithHLG",
          "DOVIWithHDR10",
          "DOVIWithHDR10Plus",
          "DOVIWithELHDR10Plus",
        ])
      }

      resolver(ranges)
    }
  }

  /// Returns whether the display is currently rendering in HDR/EDR output mode.
  @objc
  func isHDRSupported(_ resolver: @escaping RCTPromiseResolveBlock,
                       rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      if #available(iOS 14.0, tvOS 14.0, *) {
        guard AVPlayer.eligibleForHDRPlayback else {
          resolver(false)
          return
        }

        #if os(tvOS)
        if #available(tvOS 16.0, *) {
          let screen = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.screen
          resolver((screen?.currentEDRHeadroom ?? 1.0) > 1.0)
          return
        }
        #endif

        resolver(true)
      } else {
        resolver(false)
      }
    }
  }

  #if os(tvOS)
  /// On tvOS, automatic HDR display mode switching is handled by AVPlayer
  /// when appliesPerFrameHDRDisplayMetadata = true is set on the AVPlayerItem.
  /// This works in conjunction with "Match Dynamic Range" in tvOS Settings.
  @objc
  func configureDisplayForHDR(_ resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
    // AVPlayer drives automatic display mode switching via per-frame HDR metadata.
    // No additional display manager configuration is needed here.
    resolver(true)
  }
  #else
  @objc
  func configureDisplayForHDR(_ resolver: @escaping RCTPromiseResolveBlock,
                               rejecter: @escaping RCTPromiseRejectBlock) {
    // Display mode switching is only relevant on tvOS
    resolver(false)
  }
  #endif
}
