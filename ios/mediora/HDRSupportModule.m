#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HDRSupportModule, NSObject)

RCT_EXTERN_METHOD(getSupportedVideoRanges:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(isHDRSupported:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(configureDisplayForHDR:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
