#import "FcodeSourceTextRun.h"
#import <React/RCTFabricComponentsPlugins.h>
#import "FcodeSourceTextRunComponentDescriptor.h"
#import <react/renderer/components/FcodeSourceTextSpec/Props.h>
#import <react/renderer/components/FcodeSourceTextSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface FcodeSourceTextRun () <RCTT3SourceTextRunViewProtocol>

@end

@implementation FcodeSourceTextRun {
  NSString *_text;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<
      FcodeSourceTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps =
        std::make_shared<const FcodeSourceTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<FcodeSourceTextRunProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<FcodeSourceTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> FcodeSourceTextRunCls(void) {
  return FcodeSourceTextRun.class;
}

@end
