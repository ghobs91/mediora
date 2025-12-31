import Foundation
import React

@objc(ICloudSyncModule)
class ICloudSyncModule: NSObject {
  
  private let store = NSUbiquitousKeyValueStore.default
  
  // Constants for keys
  private struct Keys {
    static let jellyfinServerUrl = "jellyfin_server_url"
    static let jellyfinAccessToken = "jellyfin_access_token"
    static let jellyfinUserId = "jellyfin_user_id"
    static let jellyfinServerId = "jellyfin_server_id"
    static let jellyfinDeviceId = "jellyfin_device_id"
    
    static let sonarrServerUrl = "sonarr_server_url"
    static let sonarrApiKey = "sonarr_api_key"
    static let sonarrRootFolderPath = "sonarr_root_folder_path"
    static let sonarrQualityProfileId = "sonarr_quality_profile_id"
    
    static let radarrServerUrl = "radarr_server_url"
    static let radarrApiKey = "radarr_api_key"
    static let radarrRootFolderPath = "radarr_root_folder_path"
    static let radarrQualityProfileId = "radarr_quality_profile_id"
  }
  
  override init() {
    super.init()
    // Listen for iCloud changes
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(storeDidChange),
      name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
      object: store
    )
    
    // Synchronize on init
    store.synchronize()
  }
  
  deinit {
    NotificationCenter.default.removeObserver(self)
  }
  
  @objc func storeDidChange(notification: Notification) {
    // Handle external changes from other devices
    store.synchronize()
  }
  
  // MARK: - Jellyfin Methods
  
  @objc func saveJellyfinSettings(
    _ serverUrl: String,
    accessToken: String,
    userId: String,
    serverId: String,
    deviceId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.set(serverUrl, forKey: Keys.jellyfinServerUrl)
    store.set(accessToken, forKey: Keys.jellyfinAccessToken)
    store.set(userId, forKey: Keys.jellyfinUserId)
    store.set(serverId, forKey: Keys.jellyfinServerId)
    store.set(deviceId, forKey: Keys.jellyfinDeviceId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  @objc func getJellyfinSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.synchronize()
    
    guard let serverUrl = store.string(forKey: Keys.jellyfinServerUrl),
          let accessToken = store.string(forKey: Keys.jellyfinAccessToken),
          let userId = store.string(forKey: Keys.jellyfinUserId),
          let serverId = store.string(forKey: Keys.jellyfinServerId),
          let deviceId = store.string(forKey: Keys.jellyfinDeviceId) else {
      resolve(NSNull())
      return
    }
    
    let settings: [String: Any] = [
      "serverUrl": serverUrl,
      "accessToken": accessToken,
      "userId": userId,
      "serverId": serverId,
      "deviceId": deviceId
    ]
    
    resolve(settings)
  }
  
  @objc func clearJellyfinSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.removeObject(forKey: Keys.jellyfinServerUrl)
    store.removeObject(forKey: Keys.jellyfinAccessToken)
    store.removeObject(forKey: Keys.jellyfinUserId)
    store.removeObject(forKey: Keys.jellyfinServerId)
    store.removeObject(forKey: Keys.jellyfinDeviceId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  // MARK: - Sonarr Methods
  
  @objc func saveSonarrSettings(
    _ serverUrl: String,
    apiKey: String,
    rootFolderPath: String,
    qualityProfileId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.set(serverUrl, forKey: Keys.sonarrServerUrl)
    store.set(apiKey, forKey: Keys.sonarrApiKey)
    store.set(rootFolderPath, forKey: Keys.sonarrRootFolderPath)
    store.set(qualityProfileId.intValue, forKey: Keys.sonarrQualityProfileId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  @objc func getSonarrSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.synchronize()
    
    guard let serverUrl = store.string(forKey: Keys.sonarrServerUrl),
          let apiKey = store.string(forKey: Keys.sonarrApiKey),
          let rootFolderPath = store.string(forKey: Keys.sonarrRootFolderPath) else {
      resolve(NSNull())
      return
    }
    
    // Quality profile ID defaults to 0 if not found
    let qualityProfileId = store.longLong(forKey: Keys.sonarrQualityProfileId)
    
    let settings: [String: Any] = [
      "serverUrl": serverUrl,
      "apiKey": apiKey,
      "rootFolderPath": rootFolderPath,
      "qualityProfileId": qualityProfileId
    ]
    
    resolve(settings)
  }
  
  @objc func clearSonarrSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.removeObject(forKey: Keys.sonarrServerUrl)
    store.removeObject(forKey: Keys.sonarrApiKey)
    store.removeObject(forKey: Keys.sonarrRootFolderPath)
    store.removeObject(forKey: Keys.sonarrQualityProfileId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  // MARK: - Radarr Methods
  
  @objc func saveRadarrSettings(
    _ serverUrl: String,
    apiKey: String,
    rootFolderPath: String,
    qualityProfileId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.set(serverUrl, forKey: Keys.radarrServerUrl)
    store.set(apiKey, forKey: Keys.radarrApiKey)
    store.set(rootFolderPath, forKey: Keys.radarrRootFolderPath)
    store.set(qualityProfileId.intValue, forKey: Keys.radarrQualityProfileId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  @objc func getRadarrSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.synchronize()
    
    guard let serverUrl = store.string(forKey: Keys.radarrServerUrl),
          let apiKey = store.string(forKey: Keys.radarrApiKey),
          let rootFolderPath = store.string(forKey: Keys.radarrRootFolderPath) else {
      resolve(NSNull())
      return
    }
    
    // Quality profile ID defaults to 0 if not found
    let qualityProfileId = store.longLong(forKey: Keys.radarrQualityProfileId)
    
    let settings: [String: Any] = [
      "serverUrl": serverUrl,
      "apiKey": apiKey,
      "rootFolderPath": rootFolderPath,
      "qualityProfileId": qualityProfileId
    ]
    
    resolve(settings)
  }
  
  @objc func clearRadarrSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    store.removeObject(forKey: Keys.radarrServerUrl)
    store.removeObject(forKey: Keys.radarrApiKey)
    store.removeObject(forKey: Keys.radarrRootFolderPath)
    store.removeObject(forKey: Keys.radarrQualityProfileId)
    
    let success = store.synchronize()
    if success {
      resolve(true)
    } else {
      reject("SYNC_ERROR", "Failed to sync to iCloud", nil)
    }
  }
  
  // MARK: - React Native Required Methods
  
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
