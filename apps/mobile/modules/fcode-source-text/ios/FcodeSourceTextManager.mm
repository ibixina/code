#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>

@interface FcodeSourceTextManager : RCTViewManager
@end

@implementation FcodeSourceTextManager

RCT_EXPORT_MODULE(FcodeSourceText)

- (UIView *)view {
  return [[UIView alloc] init];
}

@end

@interface FcodeSourceTextRunManager : RCTViewManager
@end

@implementation FcodeSourceTextRunManager

RCT_EXPORT_MODULE(FcodeSourceTextRun)

- (UIView *)view {
  return nil;
}

@end
