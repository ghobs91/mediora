#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(InvitePairingModule, NSObject)

// Host (Apple TV): advertise + wait for a phone/Mac to send an invite.
RCT_EXTERN_METHOD(startHosting:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopHosting:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(waitForInvite:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Sender (iPhone/Mac): find hosts, then send an invite to one.
RCT_EXTERN_METHOD(browse:(nonnull NSNumber *)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(send:(NSString *)hostId
                  code:(NSString *)code
                  invite:(NSString *)invite
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
