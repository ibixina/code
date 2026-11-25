#pragma once

#include <react/renderer/components/FcodeSourceTextSpec/EventEmitters.h>
#include <react/renderer/components/FcodeSourceTextSpec/Props.h>
#include <react/renderer/components/FcodeSourceTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char FcodeSourceTextRunComponentName[];

using FcodeSourceTextRunShadowNode =
    ConcreteViewShadowNode<FcodeSourceTextRunComponentName, FcodeSourceTextRunProps,
                           FcodeSourceTextRunEventEmitter, FcodeSourceTextRunState>;
} // namespace facebook::react
