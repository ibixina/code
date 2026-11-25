#pragma once

#include "FcodeSourceTextRunShadowNode.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>

namespace facebook::react {
using FcodeSourceTextRunComponentDescriptor =
    ConcreteComponentDescriptor<FcodeSourceTextRunShadowNode>;

void FcodeSourceTextRunSpec_registerComponentDescriptorsFromCodegen(
    std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
} // namespace facebook::react
