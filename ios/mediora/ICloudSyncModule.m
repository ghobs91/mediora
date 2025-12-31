#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ICloudSyncModule, NSObject)

// Jellyfin
RCT_EXTERN_METHOD(saveJellyfinSettings:(NSString *)serverUrl
                  accessToken:(NSString *)accessToken
                  userId:(NSString *)userId
                  serverId:(NSString *)serverId
                  deviceId:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getJellyfinSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearJellyfinSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Sonarr
RCT_EXTERN_METHOD(saveSonarrSettings:(NSString *)serverUrl
                  apiKey:(NSString *)apiKey
                  rootFolderPath:(NSString *)rootFolderPath
                  qualityProfileId:(nonnull NSNumber *)qualityProfileId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSonarrSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearSonarrSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Radarr
RCT_EXTERN_METHOD(saveRadarrSettings:(NSString *)serverUrl
                  apiKey:(NSString *)apiKey
                  rootFolderPath:(NSString *)rootFolderPath
                  qualityProfileId:(nonnull NSNumber *)qualityProfileId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getRadarrSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearRadarrSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
