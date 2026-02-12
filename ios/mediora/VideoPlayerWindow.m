#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VideoPlayerWindow, NSObject)

RCT_EXTERN_METHOD(openPlayer:(NSString *)urlString
                  title:(NSString *)title
                  itemId:(NSString *)itemId
                  startPosition:(double)startPosition
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(closePlayer:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(getPlaybackPosition:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
