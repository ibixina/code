#pragma once

#include "HybridFcodeHighlightsSpec.hpp"

namespace margelo::nitro::t3highlights {

class HybridFcodeHighlights : public HybridFcodeHighlightsSpec {
public:
  HybridFcodeHighlights() : HybridObject(TAG) {}

  std::optional<std::shared_ptr<ArrayBuffer>> tokenize(SourceText source,
                                                       double language) override;
};

} // namespace margelo::nitro::t3highlights
